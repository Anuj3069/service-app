/**
 * tests/integration/admin.test.js — Admin Module Integration Tests
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';

const app = require('../../src/app');
const User = require('../../src/modules/auth/auth.model');
const Provider = require('../../src/modules/provider/provider.model');
const { Category, Service } = require('../../src/modules/service/service.model');
const Booking = require('../../src/modules/booking/booking.model');
const Payment = require('../../src/modules/payment/payment.model');
const Review = require('../../src/modules/review/review.model');
const { generateToken, createTestCustomer, createTestWorker } = require('../helpers/auth.helper');

let mongoServer;
let adminToken;
let customerToken;
let adminUser;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  // Clear any leftover data just in case
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // Create an admin user
  adminUser = await User.create({
    name: 'Test Admin',
    email: 'admin@test.com',
    password: 'password123',
    role: 'admin',
  });
  adminToken = generateToken(adminUser);

  // Create a regular customer
  const customerResult = await createTestCustomer();
  customerToken = customerResult.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Admin Module', () => {
  // ── AUTHORIZATION ──────────────────────────────────────────
  describe('Authorization Checks', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app)
        .get('/api/v1/admin/users')
        .expect(401);
    });

    it('should reject non-admin roles (customer)', async () => {
      await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });
  });

  // ── USER MANAGEMENT ─────────────────────────────────────────
  describe('User Management', () => {
    it('should list all users', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.items).toHaveLength(2); // admin + customer
    });

    it('should deactivate a user', async () => {
      const userToBlock = await User.create({
        name: 'Bad Customer',
        email: 'bad@test.com',
        password: 'password123',
        role: 'customer',
        isActive: true,
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${userToBlock._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(res.body.data.user.isActive).toBe(false);

      const dbUser = await User.findById(userToBlock._id);
      expect(dbUser.isActive).toBe(false);
    });

    it('should update user role', async () => {
      const userToUpdate = await User.create({
        name: 'Regular Customer',
        email: 'regular@test.com',
        password: 'password123',
        role: 'customer',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${userToUpdate._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' })
        .expect(200);

      expect(res.body.data.user.role).toBe('admin');
    });
  });

  // ── PROVIDER MANAGEMENT ──────────────────────────────────────
  describe('Provider Management', () => {
    it('should list providers and verify a provider profile', async () => {
      // Create a worker (starts with isVerified: true in helper, we can create custom one with false)
      const workerResult = await createTestWorker({}, { isVerified: false });
      const providerId = workerResult.provider._id;

      // List providers
      const listRes = await request(app)
        .get('/api/v1/admin/providers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.data.items).toHaveLength(1);
      expect(listRes.body.data.items[0].isVerified).toBe(false);

      // Verify provider
      const verifyRes = await request(app)
        .patch(`/api/v1/admin/providers/${providerId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isVerified: true })
        .expect(200);

      expect(verifyRes.body.data.provider.isVerified).toBe(true);

      const dbProvider = await Provider.findById(providerId);
      expect(dbProvider.isVerified).toBe(true);
    });
  });

  // ── SERVICE CATALOG ──────────────────────────────────────────
  describe('Service & Category Management', () => {
    it('should perform CRUD on Categories and Services', async () => {
      // 1. Create category
      const catRes = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Cleaning Services', icon: '🧹', description: 'Clean homes' })
        .expect(201);

      expect(catRes.body.data.category.name).toBe('Cleaning Services');
      const categoryId = catRes.body.data.category._id;

      // 2. Create service under that category
      const svcRes = await request(app)
        .post('/api/v1/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Deep Kitchen Cleaning',
          category: categoryId,
          basePrice: 2000,
          duration: 120,
          requiredSkills: ['cleaning', 'kitchen'],
        })
        .expect(201);

      expect(svcRes.body.data.service.name).toBe('Deep Kitchen Cleaning');
      const serviceId = svcRes.body.data.service._id;

      // 3. Update Service Price
      const updateRes = await request(app)
        .patch(`/api/v1/admin/services/${serviceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ basePrice: 2200 })
        .expect(200);

      expect(updateRes.body.data.service.basePrice).toBe(2200);

      // 4. Soft-delete service
      await request(app)
        .delete(`/api/v1/admin/services/${serviceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const dbService = await Service.findById(serviceId);
      expect(dbService.isActive).toBe(false);
    });
  });

  // ── BOOKING MANAGEMENT ───────────────────────────────────────
  describe('Booking Lifecycle Management', () => {
    it('should list bookings and cancel a booking', async () => {
      const customer = await User.create({
        name: 'Booking Customer',
        email: 'bookingcust@test.com',
        password: 'password123',
        role: 'customer',
      });
      const worker = await createTestWorker();
      const category = await Category.create({ name: 'Plumbing' });
      const service = await Service.create({
        name: 'Plumbing Repair',
        category: category._id,
        basePrice: 1000,
        duration: 60,
      });

      const booking = await Booking.create({
        userId: customer._id,
        providerId: worker.provider._id,
        serviceId: service._id,
        type: 'SCHEDULED',
        date: new Date(),
        slot: '09:00-10:00',
        price: 1000,
        status: 'pending',
      });

      // List bookings
      const listRes = await request(app)
        .get('/api/v1/admin/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.data.items).toHaveLength(1);

      // Cancel booking
      const cancelRes = await request(app)
        .post(`/api/v1/admin/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cancellationReason: 'Provider unavailable' })
        .expect(200);

      expect(cancelRes.body.data.booking.status).toBe('cancelled');
      expect(cancelRes.body.data.booking.cancellationReason).toBe('Provider unavailable');
    });
  });

  // ── PAYMENT MANAGEMENT ───────────────────────────────────────
  describe('Payment Reconciliations', () => {
    it('should list payments and override status', async () => {
      const customer = await User.create({
        name: 'Payment Customer',
        email: 'paycust@test.com',
        password: 'password123',
        role: 'customer',
      });
      const booking = await Booking.create({
        userId: customer._id,
        serviceId: new mongoose.Types.ObjectId(),
        type: 'INSTANT',
        price: 500,
        status: 'completed',
        paymentStatus: 'unpaid',
      });

      const payment = await Payment.create({
        bookingId: booking._id,
        userId: customer._id,
        orderId: 'ORDER_123',
        paymentSessionId: 'SESSION_123',
        amount: 500,
        status: 'pending',
      });

      // List payments
      const listRes = await request(app)
        .get('/api/v1/admin/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.data.items).toHaveLength(1);

      // Override payment status
      const overrideRes = await request(app)
        .patch(`/api/v1/admin/payments/${payment._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'paid' })
        .expect(200);

      expect(overrideRes.body.data.payment.status).toBe('paid');

      // Check that booking is updated to paid too
      const dbBooking = await Booking.findById(booking._id);
      expect(dbBooking.paymentStatus).toBe('paid');
    });
  });

  // ── REVIEW MANAGEMENT ────────────────────────────────────────
  describe('Review Moderation', () => {
    it('should list reviews and delete a review', async () => {
      const customer = await User.create({
        name: 'Reviewer Customer',
        email: 'revcust@test.com',
        password: 'password123',
        role: 'customer',
      });
      const worker = await createTestWorker();

      const review = await Review.create({
        bookingId: new mongoose.Types.ObjectId(),
        userId: customer._id,
        providerId: worker.provider._id,
        rating: 5,
        comment: 'Excellent service!',
      });

      // List reviews
      const listRes = await request(app)
        .get('/api/v1/admin/reviews')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.data.items).toHaveLength(1);

      // Delete review
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/reviews/${review._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(deleteRes.body.data.success).toBe(true);

      const dbReview = await Review.findById(review._id);
      expect(dbReview).toBeNull();
    });
  });
});
