/**
 * tests/unit/match.service.test.js — Match Service Unit Tests
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';

const matchService = require('../../src/modules/match/match.service');
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

describe('MatchService', () => {
  let testService, provider1, provider2;

  beforeEach(async () => {
    // Setup: category + service
    const category = await Category.create({ name: 'Plumbing', icon: '🔧' });
    testService = await Service.create({
      name: 'Pipe Repair',
      category: category._id,
      basePrice: 1500,
      duration: 90,
      requiredSkills: ['plumbing', 'pipe-repair'],
    });

    // Setup: two workers
    const worker1 = await User.create({
      name: 'Top Plumber',
      email: 'top@worker.com',
      password: 'password123',
      role: 'worker',
    });

    const worker2 = await User.create({
      name: 'Junior Plumber',
      email: 'junior@worker.com',
      password: 'password123',
      role: 'worker',
    });

    provider1 = await Provider.create({
      userId: worker1._id,
      skills: ['plumbing', 'pipe-repair'],
      availability: [
        { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00'] },
        { dayOfWeek: 'tuesday', slots: ['09:00-10:00'] },
      ],
      rating: 4.8,
      totalJobs: 200,
      isVerified: true,
      isAvailable: true,
    });

    provider2 = await Provider.create({
      userId: worker2._id,
      skills: ['plumbing', 'pipe-repair'],
      availability: [
        { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00'] },
      ],
      rating: 3.5,
      totalJobs: 20,
      isVerified: true,
      isAvailable: true,
    });
  });

  it('should return the highest-rated provider', async () => {
    const nextMonday = getNextDayOfWeek('monday');

    const result = await matchService.findMatch({
      serviceId: testService._id,
      date: nextMonday.toISOString(),
      slot: '09:00-10:00',
    });

    expect(result.provider.name).toBe('Top Plumber');
    expect(result.provider.rating).toBe(4.8);
    expect(result.price).toBe(1500);
  });

  it('should skip busy providers', async () => {
    const nextMonday = getNextDayOfWeek('monday');

    // Book provider1 on that slot
    const customer = await User.create({
      name: 'Customer',
      email: 'c@test.com',
      password: 'password123',
      role: 'customer',
    });

    await Booking.create({
      userId: customer._id,
      providerId: provider1._id,
      serviceId: testService._id,
      date: nextMonday,
      slot: '09:00-10:00',
      price: 1500,
      status: 'pending',
      expiresAt: new Date(Date.now() + 300000),
    });

    // Now match should return provider2
    const result = await matchService.findMatch({
      serviceId: testService._id,
      date: nextMonday.toISOString(),
      slot: '09:00-10:00',
    });

    expect(result.provider.name).toBe('Junior Plumber');
  });

  it('should skip offline providers', async () => {
    // Set provider1 offline
    await Provider.findByIdAndUpdate(provider1._id, { isAvailable: false });

    const nextMonday = getNextDayOfWeek('monday');

    const result = await matchService.findMatch({
      serviceId: testService._id,
      date: nextMonday.toISOString(),
      slot: '09:00-10:00',
    });

    expect(result.provider.name).toBe('Junior Plumber');
  });

  it('should throw when service not found', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    await expect(
      matchService.findMatch({
        serviceId: fakeId,
        date: new Date().toISOString(),
        slot: '09:00-10:00',
      })
    ).rejects.toThrow('Service not found');
  });

  it('should throw when no providers match skills', async () => {
    const category = await Category.findOne({});
    const niche = await Service.create({
      name: 'Niche Service',
      category: category._id,
      basePrice: 9999,
      duration: 60,
      requiredSkills: ['quantum-physics'],
    });

    const nextMonday = getNextDayOfWeek('monday');

    await expect(
      matchService.findMatch({
        serviceId: niche._id,
        date: nextMonday.toISOString(),
        slot: '09:00-10:00',
      })
    ).rejects.toThrow('No providers available');
  });
});
