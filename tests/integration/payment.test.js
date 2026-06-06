/**
 * tests/integration/payment.test.js — Integration tests for Cashfree Payment Flow
 */

const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
process.env.BOOKING_EXPIRY_MINUTES = '5';
process.env.CASHFREE_CLIENT_ID = 'test-client-id';
process.env.CASHFREE_CLIENT_SECRET = 'test-client-secret-key';
process.env.CASHFREE_ENV = 'TEST';

// Mock Cashfree SDK before loading the app
jest.mock('cashfree-pg', () => {
  return {
    Cashfree: {
      Environment: {
        SANDBOX: 'SANDBOX',
        PRODUCTION: 'PRODUCTION',
      },
      PGCreateOrder: jest.fn().mockImplementation((payload) => {
        return Promise.resolve({
          data: {
            cf_order_id: 'cf_order_12345',
            payment_session_id: 'cf_session_abc123',
            order_status: 'ACTIVE',
          },
        });
      }),
      PGFetchOrder: jest.fn().mockImplementation((orderId) => {
        return Promise.resolve({
          data: {
            cf_order_id: 'cf_order_12345',
            order_id: orderId,
            order_status: 'PAID',
          },
        });
      }),
    },
  };
});

const axios = require('axios');

jest.spyOn(axios, 'post').mockImplementation((url, data, config) => {
  if (url && url.includes('/orders')) {
    return Promise.resolve({
      data: {
        order_id: data.order_id,
        payment_session_id: 'cf_session_abc123',
        cf_order_id: 'cf_order_12345',
      },
    });
  }
  return Promise.reject(new Error('Unknown POST request: ' + url));
});

jest.spyOn(axios, 'get').mockImplementation((url, config) => {
  if (url && url.includes('/payments')) {
    return Promise.resolve({
      data: [
        {
          payment_status: 'SUCCESS',
          cf_payment_id: 99887766,
        },
      ],
    });
  }
  return Promise.reject(new Error('Unknown GET request: ' + url));
});

const app = require('../../src/app');
const { Category, Service } = require('../../src/modules/service/service.model');
const Booking = require('../../src/modules/booking/booking.model');
const Payment = require('../../src/modules/payment/payment.model');
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

describe('💳 Cashfree Payment on Completion Flow Integration Tests', () => {
  let customerToken;
  let workerToken;
  let serviceId;
  let providerId;
  let bookingId;

  // Setup user accounts, provider profile, and service
  it('Step 1: Setup Customer, Worker, and Service', async () => {
    // 1. Register Customer
    let res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'John Customer',
        email: 'john@customer.com',
        password: 'password123',
        role: 'customer',
      })
      .expect(201);
    customerToken = res.body.data.tokens.accessToken;

    // 2. Register Worker
    res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Sam Worker',
        email: 'sam@worker.com',
        password: 'password123',
        role: 'worker',
      })
      .expect(201);
    workerToken = res.body.data.tokens.accessToken;

    // 3. Create Provider profile
    res = await request(app)
      .post('/api/v1/worker/profile')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({
        skills: ['cleaning'],
        availability: [
          { dayOfWeek: 'monday', slots: ['09:00-10:00'] },
        ],
      })
      .expect(201);
    providerId = res.body.data.provider._id;

    // Verify provider
    const Provider = require('../../src/modules/provider/provider.model');
    await Provider.updateOne({ _id: providerId }, { isVerified: true });

    // 4. Create Service
    const category = await Category.create({
      name: 'Cleaning',
      icon: '🧹',
      description: 'Cleaning services',
    });

    const service = await Service.create({
      name: 'House Cleaning',
      category: category._id,
      description: 'Clean your home',
      basePrice: 1000,
      duration: 60,
      requiredSkills: ['cleaning'],
    });
    serviceId = service._id;
  });

  it('Step 2: Create, Accept, and Complete Booking', async () => {
    const nextMonday = getNextDayOfWeek('monday');

    // Create booking
    let res = await request(app)
      .post('/api/v1/user/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerId: providerId.toString(),
        serviceId: serviceId.toString(),
        date: nextMonday.toISOString(),
        slot: '09:00-10:00',
        price: 1000,
      })
      .expect(201);

    bookingId = res.body.data.booking._id;
    expect(res.body.data.booking.paymentStatus).toBe('unpaid');

    // Worker accepts booking
    await request(app)
      .put(`/api/v1/worker/bookings/${bookingId}/accept`)
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(200);

    // Get OTP first
    res = await request(app)
      .get(`/api/v1/user/bookings/${bookingId}/otp`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const otp = res.body.data.otp;

    // Worker completes booking using OTP
    res = await request(app)
      .put(`/api/v1/worker/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ otp })
      .expect(200);

    expect(res.body.data.booking.status).toBe('completed');
    expect(res.body.data.booking.paymentStatus).toBe('unpaid');
  });

  it('Step 3: Initiate Payment for Completed Booking', async () => {
    const res = await request(app)
      .post(`/api/v1/user/bookings/${bookingId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.data.payment).toBeDefined();
    expect(res.body.data.payment.paymentSessionId).toBe('cf_session_abc123');
    expect(res.body.data.payment.status).toBe('pending');

    // Verify booking payment status is updated to pending in DB
    const booking = await Booking.findById(bookingId);
    expect(booking.paymentStatus).toBe('pending');
  });

  it('Step 4: Verify Webhook callback signature & process ORDER_PAID success', async () => {
    // Retrieve the payment record to get the Cashfree order ID
    const payment = await Payment.findOne({ bookingId });
    expect(payment).toBeDefined();

    const timestamp = Date.now().toString();
    const webhookPayload = {
      event_time: new Date().toISOString(),
      event_type: 'ORDER_PAID',
      data: {
        order: {
          order_id: payment.orderId,
          order_amount: 1000,
          order_currency: 'INR',
        },
        payment: {
          cf_payment_id: 99887766,
          payment_status: 'SUCCESS',
          payment_time: new Date().toISOString(),
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signStr = timestamp + rawBody;

    // Calculate cryptographic signature
    const signature = crypto
      .createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
      .update(signStr)
      .digest('base64');

    // Post to webhook endpoint
    await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-webhook-timestamp', timestamp)
      .set('x-webhook-signature', signature)
      .send(webhookPayload)
      .expect(200);

    // Verify booking is now PAID in database
    const updatedBooking = await Booking.findById(bookingId);
    expect(updatedBooking.paymentStatus).toBe('paid');

    const updatedPayment = await Payment.findOne({ bookingId });
    expect(updatedPayment.status).toBe('paid');
    expect(updatedPayment.cfPaymentId).toBe('99887766');
  });

  it('Step 5: Verify status polling endpoint fallback', async () => {
    // Reset paymentStatus to pending to test polling update
    await Booking.updateOne({ _id: bookingId }, { paymentStatus: 'pending' });
    await Payment.updateOne({ bookingId }, { status: 'pending' });

    // Call status polling API
    const res = await request(app)
      .get(`/api/v1/payments/${bookingId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.data.status).toBe('paid');

    // Verify DB update
    const updatedBooking = await Booking.findById(bookingId);
    expect(updatedBooking.paymentStatus).toBe('paid');
  });
});
