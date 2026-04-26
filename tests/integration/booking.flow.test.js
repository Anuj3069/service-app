/**
 * tests/integration/booking.flow.test.js — Full End-to-End Booking Flow Test
 *
 * Tests the complete lifecycle:
 * 1. Register customer + worker
 * 2. Create provider profile with skills
 * 3. Seed services
 * 4. Auto-match → get provider
 * 5. Create booking → status: PENDING
 * 6. Worker fetches jobs → sees booking
 * 7. Worker accepts → status: ACCEPTED
 * 8. Worker completes → status: COMPLETED
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
const { getNextDayOfWeek } = require('../helpers/auth.helper');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('🔄 Full Booking Flow — End-to-End', () => {
  let customerToken;
  let workerToken;
  let serviceId;
  let matchedProviderId;
  let bookingId;
  let matchedPrice;

  // ─── STEP 1: Register Customer ────────────────────────
  it('Step 1: Should register a customer', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Customer',
        email: 'alice@customer.com',
        password: 'password123',
        role: 'customer',
      })
      .expect(201);

    customerToken = res.body.data.tokens.accessToken;
    expect(customerToken).toBeDefined();
  });

  // ─── STEP 2: Register Worker ──────────────────────────
  it('Step 2: Should register a worker', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Worker',
        email: 'bob@worker.com',
        password: 'password123',
        role: 'worker',
      })
      .expect(201);

    workerToken = res.body.data.tokens.accessToken;
    expect(workerToken).toBeDefined();
  });

  // ─── STEP 3: Create Provider Profile ──────────────────
  it('Step 3: Should create a provider profile for the worker', async () => {
    const res = await request(app)
      .post('/api/v1/worker/profile')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        skills: ['plumbing', 'pipe-repair', 'drain-cleaning'],
        availability: [
          { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
          { dayOfWeek: 'tuesday', slots: ['09:00-10:00', '10:00-11:00'] },
          { dayOfWeek: 'wednesday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
          { dayOfWeek: 'thursday', slots: ['09:00-10:00', '10:00-11:00'] },
          { dayOfWeek: 'friday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
        ],
      })
      .expect(201);

    expect(res.body.data.provider.skills).toContain('plumbing');
    // Note: Provider is not yet verified, we need to manually verify for matching
  });

  // ─── STEP 4: Verify Provider (Admin action simulated) ─
  it('Step 4: Should verify the provider (simulating admin action)', async () => {
    const Provider = require('../../src/modules/provider/provider.model');
    await Provider.updateOne({}, { isVerified: true });

    const provider = await Provider.findOne({});
    expect(provider.isVerified).toBe(true);
  });

  // ─── STEP 5: Seed Services ────────────────────────────
  it('Step 5: Should have seeded services available', async () => {
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

    // Verify services are listed
    const res = await request(app)
      .get('/api/v1/user/services')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.data.categories.length).toBeGreaterThan(0);
  });

  // ─── STEP 6: Auto-Match ───────────────────────────────
  it('Step 6: Should auto-match a provider', async () => {
    const nextMonday = getNextDayOfWeek('monday');

    const res = await request(app)
      .post('/api/v1/user/match')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId: serviceId.toString(),
        date: nextMonday.toISOString(),
        slot: '09:00-10:00',
      })
      .expect(200);

    expect(res.body.data.match.provider.name).toBe('Bob Worker');
    expect(res.body.data.match.price).toBe(1500);

    matchedProviderId = res.body.data.match.provider.id;
    matchedPrice = res.body.data.match.price;
    expect(matchedProviderId).toBeDefined();
  });

  // ─── STEP 7: Create Booking ───────────────────────────
  it('Step 7: Should create a booking with matched provider', async () => {
    const nextMonday = getNextDayOfWeek('monday');

    const res = await request(app)
      .post('/api/v1/user/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerId: matchedProviderId,
        serviceId: serviceId.toString(),
        date: nextMonday.toISOString(),
        slot: '09:00-10:00',
        price: matchedPrice,
      })
      .expect(201);

    expect(res.body.data.booking.status).toBe('pending');
    expect(res.body.data.booking.price).toBe(1500);
    expect(res.body.data.booking.expiresAt).toBeDefined();

    bookingId = res.body.data.booking._id;
    expect(bookingId).toBeDefined();
  });

  // ─── STEP 8: Customer Views Booking ───────────────────
  it('Step 8: Customer should see the booking in their list', async () => {
    const res = await request(app)
      .get('/api/v1/user/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.data.bookings.length).toBeGreaterThan(0);
    expect(res.body.data.bookings[0].status).toBe('pending');
  });

  // ─── STEP 9: Worker Gets Assigned Jobs ────────────────
  it('Step 9: Worker should see the booking in assigned jobs', async () => {
    const res = await request(app)
      .get('/api/v1/worker/bookings')
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(200);

    expect(res.body.data.bookings.length).toBeGreaterThan(0);
    const booking = res.body.data.bookings[0];
    expect(booking.status).toBe('pending');
  });

  // ─── STEP 10: Worker Accepts Booking ──────────────────
  it('Step 10: Worker should accept the booking', async () => {
    const res = await request(app)
      .put(`/api/v1/worker/bookings/${bookingId}/accept`)
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(200);

    expect(res.body.data.booking.status).toBe('accepted');
    expect(res.body.data.booking.acceptedAt).toBeDefined();
  });

  // ─── STEP 11: Customer Sees Accepted Status ───────────
  it('Step 11: Customer should see booking as accepted', async () => {
    const res = await request(app)
      .get(`/api/v1/user/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.data.booking.status).toBe('accepted');
  });

  // ─── STEP 12: Worker Completes Booking ────────────────
  it('Step 12: Worker should complete the booking', async () => {
    const res = await request(app)
      .put(`/api/v1/worker/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(200);

    expect(res.body.data.booking.status).toBe('completed');
    expect(res.body.data.booking.completedAt).toBeDefined();
  });

  // ─── STEP 13: Customer Reviews ────────────────────────
  it('Step 13: Customer should submit a review', async () => {
    const res = await request(app)
      .post('/api/v1/user/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId: bookingId,
        rating: 5,
        comment: 'Excellent plumber! Fixed the pipe in no time.',
      })
      .expect(201);

    expect(res.body.data.review.rating).toBe(5);
  });

  // ─── STEP 14: Prevent Double Booking ──────────────────
  it('Step 14: Should prevent double booking on same slot (conflict test)', async () => {
    // First, create a new booking (need new slot since previous is completed)
    const nextMonday = getNextDayOfWeek('monday');

    // Create booking on 10:00-11:00
    await request(app)
      .post('/api/v1/user/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerId: matchedProviderId,
        serviceId: serviceId.toString(),
        date: nextMonday.toISOString(),
        slot: '10:00-11:00',
        price: matchedPrice,
      })
      .expect(201);

    // Try to book the SAME slot again → should fail
    const res = await request(app)
      .post('/api/v1/user/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerId: matchedProviderId,
        serviceId: serviceId.toString(),
        date: nextMonday.toISOString(),
        slot: '10:00-11:00',
        price: matchedPrice,
      })
      .expect(409);

    expect(res.body.message).toContain('already booked');
  });
});
