const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';

const chatService = require('../../src/modules/chat/chat.service');
const bookingService = require('../../src/modules/booking/booking.service');
const User = require('../../src/modules/auth/auth.model');
const Provider = require('../../src/modules/provider/provider.model');
const { Category, Service } = require('../../src/modules/service/service.model');
const Booking = require('../../src/modules/booking/booking.model');
const { getNextDayOfWeek } = require('../helpers/auth.helper');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('ChatService', () => {
  let customer;
  let worker;
  let provider;
  let booking;

  beforeEach(async () => {
    customer = await User.create({
      name: 'Customer',
      email: 'chat-customer@test.com',
      password: 'password123',
      role: 'customer',
    });

    worker = await User.create({
      name: 'Worker',
      email: 'chat-worker@test.com',
      password: 'password123',
      role: 'worker',
    });

    provider = await Provider.create({
      userId: worker._id,
      skills: ['plumbing'],
      isVerified: true,
      isAvailable: true,
    });

    const category = await Category.create({ name: 'Plumbing', icon: 'tool' });
    const service = await Service.create({
      name: 'Pipe Repair',
      category: category._id,
      basePrice: 1500,
      duration: 90,
      requiredSkills: ['plumbing'],
    });

    booking = await Booking.create({
      userId: customer._id,
      providerId: provider._id,
      serviceId: service._id,
      date: getNextDayOfWeek('monday'),
      slot: '09:00-10:00',
      price: 1500,
      status: 'pending',
      expiresAt: new Date(Date.now() + 300000),
    });
  });

  it('blocks sending messages before the booking is accepted', async () => {
    await expect(
      chatService.sendMessage(
        { id: customer._id.toString(), role: 'customer' },
        booking._id,
        'Hello?'
      )
    ).rejects.toThrow('only after the booking is accepted');
  });

  it('sends and lists booking messages after acceptance', async () => {
    await bookingService.acceptBooking(provider._id, booking._id);

    const sent = await chatService.sendMessage(
      { id: customer._id.toString(), role: 'customer' },
      booking._id,
      'Please call before arriving.'
    );

    expect(sent.message).toBe('Please call before arriving.');
    expect(sent.senderId._id.toString()).toBe(customer._id.toString());
    expect(sent.receiverId._id.toString()).toBe(worker._id.toString());

    const messages = await chatService.getMessages(
      { id: worker._id.toString(), role: 'worker' },
      booking._id
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe('Please call before arriving.');
  });
});
