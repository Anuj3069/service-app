/**
 * tests/integration/worker.test.js — Worker Module Tests
 *
 * Tests worker-specific flows: profile, accept, reject, complete.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
process.env.BOOKING_EXPIRY_MINUTES = '5';

const app = require('../../src/app');
const User = require('../../src/modules/auth/auth.model');
const Provider = require('../../src/modules/provider/provider.model');
const Booking = require('../../src/modules/booking/booking.model');
const { Category, Service } = require('../../src/modules/service/service.model');
const { generateToken, getNextDayOfWeek } = require('../helpers/auth.helper');

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

describe('Worker Module', () => {
  // ─── PROVIDER PROFILE ──────────────────────────────────
  describe('Provider Profile CRUD', () => {
    let workerToken;

    beforeEach(async () => {
      const worker = await User.create({
        name: 'Worker Joe',
        email: 'joe@worker.com',
        password: 'password123',
        role: 'worker',
      });
      workerToken = generateToken(worker);
    });

    it('should create a provider profile', async () => {
      const res = await request(app)
        .post('/api/v1/worker/profile')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          skills: ['plumbing', 'pipe-repair'],
          availability: [
            { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00'] },
          ],
        })
        .expect(201);

      expect(res.body.data.provider.skills).toEqual(['plumbing', 'pipe-repair']);
    });

    it('should prevent duplicate provider profiles', async () => {
      await request(app)
        .post('/api/v1/worker/profile')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ skills: ['plumbing'] });

      await request(app)
        .post('/api/v1/worker/profile')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ skills: ['electrical'] })
        .expect(409);
    });

    it('should update provider profile', async () => {
      await request(app)
        .post('/api/v1/worker/profile')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ skills: ['plumbing'] });

      const res = await request(app)
        .put('/api/v1/worker/profile')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ skills: ['plumbing', 'electrical'], isAvailable: false })
        .expect(200);

      expect(res.body.data.provider.skills).toContain('electrical');
      expect(res.body.data.provider.isAvailable).toBe(false);
    });

    it('should get provider profile', async () => {
      await request(app)
        .post('/api/v1/worker/profile')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ skills: ['plumbing'] });

      const res = await request(app)
        .get('/api/v1/worker/profile')
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);

      expect(res.body.data.provider.skills).toContain('plumbing');
    });

    it('should reject customer trying to access worker routes', async () => {
      const customer = await User.create({
        name: 'Customer',
        email: 'customer@test.com',
        password: 'password123',
        role: 'customer',
      });
      const customerToken = generateToken(customer);

      await request(app)
        .post('/api/v1/worker/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ skills: ['plumbing'] })
        .expect(403);
    });
  });

  // ─── BOOKING ACTIONS ───────────────────────────────────
  describe('Booking Actions (Accept/Reject/Complete)', () => {
    let workerToken, customerId, providerId, bookingId;

    beforeEach(async () => {
      // Create customer
      const customer = await User.create({
        name: 'Customer',
        email: 'customer@test.com',
        password: 'password123',
        role: 'customer',
      });
      customerId = customer._id;

      // Create worker + provider
      const worker = await User.create({
        name: 'Worker',
        email: 'worker@test.com',
        password: 'password123',
        role: 'worker',
      });
      workerToken = generateToken(worker);

      const provider = await Provider.create({
        userId: worker._id,
        skills: ['plumbing'],
        isVerified: true,
        isAvailable: true,
      });
      providerId = provider._id;

      // Create service
      const category = await Category.create({ name: 'Plumbing', icon: '🔧' });
      const service = await Service.create({
        name: 'Pipe Repair',
        category: category._id,
        basePrice: 1500,
        duration: 90,
        requiredSkills: ['plumbing'],
      });

      // Create a pending booking
      const nextMonday = getNextDayOfWeek('monday');
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      const booking = await Booking.create({
        userId: customerId,
        providerId: providerId,
        serviceId: service._id,
        date: nextMonday,
        slot: '09:00-10:00',
        price: 1500,
        status: 'pending',
        expiresAt,
      });
      bookingId = booking._id;
    });

    it('should reject booking', async () => {
      const res = await request(app)
        .put(`/api/v1/worker/bookings/${bookingId}/reject`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);

      expect(res.body.data.booking.status).toBe('rejected');
    });

    it('should not complete a PENDING booking (invalid transition)', async () => {
      await request(app)
        .put(`/api/v1/worker/bookings/${bookingId}/complete`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(400);
    });

    it('should not accept an expired booking', async () => {
      // Manually expire the booking
      await Booking.findByIdAndUpdate(bookingId, {
        expiresAt: new Date(Date.now() - 60000), // 1 minute ago
      });

      await request(app)
        .put(`/api/v1/worker/bookings/${bookingId}/accept`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(410); // Gone
    });

    it('should not allow another worker to accept the booking', async () => {
      const otherWorker = await User.create({
        name: 'Other Worker',
        email: 'other@worker.com',
        password: 'password123',
        role: 'worker',
      });
      await Provider.create({
        userId: otherWorker._id,
        skills: ['plumbing'],
        isVerified: true,
        isAvailable: true,
      });
      const otherToken = generateToken(otherWorker);

      await request(app)
        .put(`/api/v1/worker/bookings/${bookingId}/accept`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });
});
