/**
 * tests/unit/booking.service.test.js — Booking Service Unit Tests
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
process.env.BOOKING_EXPIRY_MINUTES = '2';

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

describe('BookingService', () => {
  let customer, worker, provider, service;

  beforeEach(async () => {
    customer = await User.create({
      name: 'Customer',
      email: 'customer@test.com',
      password: 'password123',
      role: 'customer',
    });

    worker = await User.create({
      name: 'Worker',
      email: 'worker@test.com',
      password: 'password123',
      role: 'worker',
    });

    provider = await Provider.create({
      userId: worker._id,
      skills: ['plumbing'],
      isVerified: true,
      isAvailable: true,
    });

    const category = await Category.create({ name: 'Plumbing', icon: '🔧' });
    service = await Service.create({
      name: 'Pipe Repair',
      category: category._id,
      basePrice: 1500,
      duration: 90,
      requiredSkills: ['plumbing'],
    });
  });

  describe('createBooking', () => {
    it('should create a booking with PENDING status', async () => {
      const nextMonday = getNextDayOfWeek('monday');

      const booking = await bookingService.createBooking(customer._id, {
        providerId: provider._id,
        serviceId: service._id,
        date: nextMonday.toISOString(),
        slot: '09:00-10:00',
        price: 1500,
      });

      expect(booking.status).toBe('pending');
      expect(booking.expiresAt).toBeDefined();
      expect(booking.price).toBe(1500);
    });

    it('should prevent double booking on same slot', async () => {
      const nextMonday = getNextDayOfWeek('monday');

      await bookingService.createBooking(customer._id, {
        providerId: provider._id,
        serviceId: service._id,
        date: nextMonday.toISOString(),
        slot: '09:00-10:00',
        price: 1500,
      });

      await expect(
        bookingService.createBooking(customer._id, {
          providerId: provider._id,
          serviceId: service._id,
          date: nextMonday.toISOString(),
          slot: '09:00-10:00',
          price: 1500,
        })
      ).rejects.toThrow('already booked');
    });
  });

  describe('Status Transitions', () => {
    let bookingId;

    beforeEach(async () => {
      const nextMonday = getNextDayOfWeek('monday');
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      const booking = await Booking.create({
        userId: customer._id,
        providerId: provider._id,
        serviceId: service._id,
        date: nextMonday,
        slot: '09:00-10:00',
        price: 1500,
        status: 'pending',
        expiresAt,
      });
      bookingId = booking._id;
    });

    it('PENDING → ACCEPTED (valid)', async () => {
      const result = await bookingService.acceptBooking(provider._id, bookingId);
      expect(result.status).toBe('accepted');
      expect(result.acceptedAt).toBeDefined();
    });

    it('PENDING → REJECTED (valid)', async () => {
      const result = await bookingService.rejectBooking(provider._id, bookingId);
      expect(result.status).toBe('rejected');
    });

    it('ACCEPTED → COMPLETED (valid)', async () => {
      await bookingService.acceptBooking(provider._id, bookingId);
      const result = await bookingService.completeBooking(provider._id, bookingId);
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
    });

    it('PENDING → COMPLETED (invalid)', async () => {
      await expect(
        bookingService.completeBooking(provider._id, bookingId)
      ).rejects.toThrow('Cannot transition');
    });

    it('COMPLETED → ACCEPTED (invalid)', async () => {
      await bookingService.acceptBooking(provider._id, bookingId);
      await bookingService.completeBooking(provider._id, bookingId);

      await expect(
        bookingService.acceptBooking(provider._id, bookingId)
      ).rejects.toThrow('Cannot transition');
    });

    it('REJECTED → ACCEPTED (invalid)', async () => {
      await bookingService.rejectBooking(provider._id, bookingId);

      await expect(
        bookingService.acceptBooking(provider._id, bookingId)
      ).rejects.toThrow('Cannot transition');
    });
  });

  describe('getUserBookings', () => {
    it('should return bookings for a customer', async () => {
      const nextMonday = getNextDayOfWeek('monday');
      const expiresAt = new Date(Date.now() + 300000);

      await Booking.create({
        userId: customer._id,
        providerId: provider._id,
        serviceId: service._id,
        date: nextMonday,
        slot: '09:00-10:00',
        price: 1500,
        status: 'pending',
        expiresAt,
      });

      const bookings = await bookingService.getUserBookings(customer._id);
      expect(bookings).toHaveLength(1);
    });

    it('should filter by status', async () => {
      const nextMonday = getNextDayOfWeek('monday');
      const expiresAt = new Date(Date.now() + 300000);

      await Booking.create({
        userId: customer._id,
        providerId: provider._id,
        serviceId: service._id,
        date: nextMonday,
        slot: '09:00-10:00',
        price: 1500,
        status: 'pending',
        expiresAt,
      });

      const pending = await bookingService.getUserBookings(customer._id, 'pending');
      expect(pending).toHaveLength(1);

      const completed = await bookingService.getUserBookings(customer._id, 'completed');
      expect(completed).toHaveLength(0);
    });
  });
});
