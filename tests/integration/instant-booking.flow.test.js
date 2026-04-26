/**
 * tests/integration/instant-booking.flow.test.js — Instant Booking Flow Test
 *
 * Tests the complete instant booking lifecycle:
 * 1. Register customer + multiple workers
 * 2. Create provider profiles with skills
 * 3. Seed services
 * 4. Customer creates instant booking (broadcasts to providers)
 * 5. Providers receive socket notifications
 * 6. First provider accepts → booking confirmed
 * 7. Other providers see booking taken
 * 8. Provider completes job
 * 9. Customer submits review
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
process.env.BOOKING_EXPIRY_MINUTES = '5'; // Extended for test stability

const app = require('../../src/app');
const { Category, Service } = require('../../src/modules/service/service.model');
const { generateToken } = require('../helpers/auth.helper');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('⚡ Instant Booking Flow — End-to-End', () => {
  let customerToken;
  let worker1Token;
  let worker2Token;
  let worker3Token;
  let serviceId;
  let instantBookingId;

  // ─── STEP 1: Register Customer ────────────────────────
  it('Step 1: Should register a customer', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Customer',
        email: 'alice@instant.com',
        password: 'password123',
        role: 'customer',
      })
      .expect(201);

    customerToken = res.body.data.tokens.accessToken;
    expect(customerToken).toBeDefined();
  });

  // ─── STEP 2: Register Multiple Workers ────────────────
  it('Step 2: Should register multiple workers', async () => {
    // Worker 1
    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Plumber',
        email: 'bob@instant.com',
        password: 'password123',
        role: 'worker',
      })
      .expect(201);
    worker1Token = res1.body.data.tokens.accessToken;

    // Worker 2
    const res2 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Charlie Electrician',
        email: 'charlie@instant.com',
        password: 'password123',
        role: 'worker',
      })
      .expect(201);
    worker2Token = res2.body.data.tokens.accessToken;

    // Worker 3
    const res3 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Diana Cleaner',
        email: 'diana@instant.com',
        password: 'password123',
        role: 'worker',
      })
      .expect(201);
    worker3Token = res3.body.data.tokens.accessToken;

    expect(worker1Token).toBeDefined();
    expect(worker2Token).toBeDefined();
    expect(worker3Token).toBeDefined();
  });

  // ─── STEP 3: Create Provider Profiles ──────────────────
  it('Step 3: Should create provider profiles for all workers', async () => {
    // Worker 1 - Plumber
    const res1 = await request(app)
      .post('/api/v1/worker/profile')
      .set('Authorization', `Bearer ${worker1Token}`)
      .send({
        skills: ['plumbing', 'pipe-repair', 'drain-cleaning'],
        availability: [
          { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
          { dayOfWeek: 'tuesday', slots: ['09:00-10:00', '10:00-11:00'] },
        ],
      })
      .expect(201);
    expect(res1.body.data.provider.skills).toContain('plumbing');

    // Worker 2 - Electrician (different skills)
    const res2 = await request(app)
      .post('/api/v1/worker/profile')
      .set('Authorization', `Bearer ${worker2Token}`)
      .send({
        skills: ['electrical', 'wiring', 'lighting'],
        availability: [
          { dayOfWeek: 'monday', slots: ['09:00-10:00', '11:00-12:00'] },
          { dayOfWeek: 'wednesday', slots: ['13:00-14:00', '15:00-16:00'] },
        ],
      })
      .expect(201);
    expect(res2.body.data.provider.skills).toContain('electrical');

    // Worker 3 - Another Plumber
    const res3 = await request(app)
      .post('/api/v1/worker/profile')
      .set('Authorization', `Bearer ${worker3Token}`)
      .send({
        skills: ['plumbing', 'pipe-repair', 'leak-repair'],
        availability: [
          { dayOfWeek: 'monday', slots: ['08:00-09:00', '16:00-17:00'] },
          { dayOfWeek: 'tuesday', slots: ['10:00-11:00', '14:00-15:00'] },
        ],
      })
      .expect(201);
    expect(res3.body.data.provider.skills).toContain('plumbing');
  });

  // ─── STEP 4: Verify All Providers ─────────────────────
  it('Step 4: Should verify all providers (simulating admin action)', async () => {
    const Provider = require('../../src/modules/provider/provider.model');
    await Provider.updateMany({}, { isVerified: true, isAvailable: true });

    const providers = await Provider.find({});
    expect(providers.length).toBe(3);
    providers.forEach(provider => {
      expect(provider.isVerified).toBe(true);
      expect(provider.isAvailable).toBe(true);
    });
  });

  // ─── STEP 5: Seed Services ────────────────────────────
  it('Step 5: Should seed services for testing', async () => {
    const category = await Category.create({
      name: 'Plumbing',
      icon: '🔧',
      description: 'Plumbing services',
    });

    const service = await Service.create({
      name: 'Pipe Repair',
      category: category._id,
      description: 'Fix leaking or broken pipes',
      basePrice: 1500,
      duration: 90,
      requiredSkills: ['plumbing', 'pipe-repair'],
    });

    serviceId = service._id;

    // Verify services are available
    const res = await request(app)
      .get('/api/v1/user/services')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.data.categories.length).toBeGreaterThan(0);
  });

  // ─── STEP 6: Customer Creates Instant Booking ─────────
  it('Step 6: Customer should create instant booking (only serviceId required)', async () => {
    const res = await request(app)
      .post('/api/v1/user/instant-booking')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId: serviceId.toString(),
      })
      .expect(201);

    expect(res.body.data.booking.status).toBe('requested');
    expect(res.body.data.booking.type).toBe('INSTANT');
    expect(res.body.data.booking.price).toBe(1500);
    expect(res.body.data.booking.expiresAt).toBeDefined();
    expect(res.body.data.booking.candidateProviders).toBeDefined();

    instantBookingId = res.body.data.booking._id;
    expect(instantBookingId).toBeDefined();
  });

  // ─── STEP 7: Providers See Instant Booking ────────────
  it('Step 7: All qualified providers should see the instant booking in their jobs', async () => {
    // Worker 1 (qualified plumber)
    const res1 = await request(app)
      .get('/api/v1/worker/bookings')
      .set('Authorization', `Bearer ${worker1Token}`)
      .expect(200);

    expect(res1.body.data.bookings.length).toBe(1);
    expect(res1.body.data.bookings[0].status).toBe('requested');
    expect(res1.body.data.bookings[0].type).toBe('INSTANT');

    // Worker 3 (qualified plumber)
    const res3 = await request(app)
      .get('/api/v1/worker/bookings')
      .set('Authorization', `Bearer ${worker3Token}`)
      .expect(200);

    expect(res3.body.data.bookings.length).toBe(1);
    expect(res3.body.data.bookings[0].status).toBe('requested');

    // Worker 2 (electrician - not qualified for plumbing)
    const res2 = await request(app)
      .get('/api/v1/worker/bookings')
      .set('Authorization', `Bearer ${worker2Token}`)
      .expect(200);

    expect(res2.body.data.bookings.length).toBe(0); // No plumbing jobs for electrician
  });

  // ─── STEP 8: First Provider Accepts Booking ───────────
  it('Step 8: First provider (Worker 1) should accept the instant booking', async () => {
    const res = await request(app)
      .put(`/api/v1/worker/bookings/${instantBookingId}/accept`)
      .set('Authorization', `Bearer ${worker1Token}`)
      .expect(200);

    expect(res.body.data.booking.status).toBe('accepted');
    expect(res.body.data.booking.providerId).toBeDefined();
    expect(res.body.data.booking.acceptedAt).toBeDefined();
    expect(res.body.data.type).toBe('INSTANT');
  });

  // ─── STEP 9: Other Providers See Booking Taken ────────
  it('Step 9: Other qualified providers should see booking is no longer available', async () => {
    // Worker 3 tries to accept - should fail
    await request(app)
      .put(`/api/v1/worker/bookings/${instantBookingId}/accept`)
      .set('Authorization', `Bearer ${worker3Token}`)
      .expect(410); // Gone - booking expired/taken

    // Check Worker 3's bookings - should be empty now
    const res3 = await request(app)
      .get('/api/v1/worker/bookings')
      .set('Authorization', `Bearer ${worker3Token}`)
      .expect(200);

    expect(res3.body.data.bookings.length).toBe(0);
  });

  // ─── STEP 10: Customer Sees Accepted Booking ──────────
  it('Step 10: Customer should see booking as accepted with provider assigned', async () => {
    const res = await request(app)
      .get(`/api/v1/user/bookings/${instantBookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.data.booking.status).toBe('accepted');
    expect(res.body.data.booking.providerId).toBeDefined();
    expect(res.body.data.booking.providerId.userId.name).toBe('Bob Plumber');
  });

  // ─── STEP 11: Provider Completes the Job ──────────────
  it('Step 11: Provider should complete the instant booking', async () => {
    const res = await request(app)
      .put(`/api/v1/worker/bookings/${instantBookingId}/complete`)
      .set('Authorization', `Bearer ${worker1Token}`)
      .expect(200);

    expect(res.body.data.booking.status).toBe('completed');
    expect(res.body.data.booking.completedAt).toBeDefined();
  });

  // ─── STEP 12: Customer Submits Review ─────────────────
  it('Step 12: Customer should submit a review for the completed instant booking', async () => {
    const res = await request(app)
      .post('/api/v1/user/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId: instantBookingId,
        rating: 5,
        comment: 'Instant booking worked perfectly! Bob arrived quickly and fixed the pipe.',
      })
      .expect(201);

    expect(res.body.data.review.rating).toBe(5);
    expect(res.body.data.review.bookingId.toString()).toBe(instantBookingId.toString());
  });

  // ─── STEP 13: Test Expiry Scenario ────────────────────
  it('Step 13: Should handle expired instant bookings', async () => {
    // Create another instant booking
    const res = await request(app)
      .post('/api/v1/user/instant-booking')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId: serviceId.toString(),
      })
      .expect(201);

    const newBookingId = res.body.data.booking._id;

    // Wait for expiry (set to 5 minutes in test env, but we'll simulate)
    const Booking = require('../../src/modules/booking/booking.model');
    await Booking.findByIdAndUpdate(newBookingId, {
      expiresAt: new Date(Date.now() - 1000) // Set to past
    });

    // Worker tries to accept expired booking - should fail
    await request(app)
      .put(`/api/v1/worker/bookings/${newBookingId}/accept`)
      .set('Authorization', `Bearer ${worker1Token}`)
      .expect(410); // Gone

    // Customer sees booking as expired
    const customerRes = await request(app)
      .get(`/api/v1/user/bookings/${newBookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(customerRes.body.data.booking.status).toBe('expired');
  });

  // ─── STEP 14: Test No Providers Available ─────────────
  it('Step 14: Should handle instant booking when no providers are available', async () => {
    // Make all providers unavailable
    const Provider = require('../../src/modules/provider/provider.model');
    await Provider.updateMany({}, { isAvailable: false });

    // Try instant booking - should fail
    const res = await request(app)
      .post('/api/v1/user/instant-booking')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId: serviceId.toString(),
      })
      .expect(404);

    expect(res.body.message).toContain('No providers are currently available');

    // Restore availability for other tests
    await Provider.updateMany({}, { isAvailable: true });
  });
});