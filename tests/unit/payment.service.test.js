process.env.NODE_ENV = 'test';
process.env.CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET || 'test-secret';
process.env.CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID || 'test-client';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh';

const crypto = require('crypto');
const axios = require('axios');
const config = require('../../src/config');

jest.mock('axios');
jest.mock('../../src/modules/payment/payment.model', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

const paymentService = require('../../src/modules/payment/payment.service');
const Payment = require('../../src/modules/payment/payment.model');

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyWebhook', () => {
    it('returns true for a valid webhook signature', () => {
      const timestamp = Date.now().toString();
      const rawBody = JSON.stringify({ event: 'payment' });
      const signature = crypto
        .createHmac('sha256', config.cashfree.clientSecret)
        .update(timestamp + rawBody)
        .digest('base64');

      const result = paymentService.verifyWebhook(
        {
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        },
        rawBody
      );

      expect(result).toBe(true);
    });

    it('returns false for an invalid webhook signature', () => {
      const timestamp = Date.now().toString();
      const rawBody = JSON.stringify({ event: 'payment' });

      const result = paymentService.verifyWebhook(
        {
          'x-webhook-signature': 'invalid-signature',
          'x-webhook-timestamp': timestamp,
        },
        rawBody
      );

      expect(result).toBe(false);
    });
  });

  describe('createPaymentOrder', () => {
    it('throws when booking is already paid', async () => {
      const booking = {
        _id: 'booking123',
        price: 200,
        paymentStatus: 'paid',
        userId: { _id: 'user123' },
      };

      await expect(paymentService.createPaymentOrder(booking)).rejects.toThrow(
        'Booking already paid'
      );
    });

    it('creates a new payment order and saves it to the database', async () => {
      const booking = {
        _id: 'booking123',
        price: 200,
        paymentStatus: 'unpaid',
        userId: {
          _id: 'user123',
          phone: '9876543210',
          name: 'Test User',
          email: 'test@example.com',
        },
      };

      Payment.findOne.mockResolvedValue(null);
      Payment.create.mockResolvedValue({ _id: 'payment123' });
      axios.post.mockResolvedValue({
        data: {
          order_id: 'cf_order_123',
          payment_session_id: 'session_abc',
          cf_order_id: 'cf_order_123',
        },
      });

      const payment = await paymentService.createPaymentOrder(booking);

      expect(Payment.findOne).toHaveBeenCalledWith({
        bookingId: booking._id,
        status: { $in: ['pending'] },
      });
      expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
        bookingId: booking._id,
        orderId: 'cf_order_123',
        paymentSessionId: 'session_abc',
        status: 'pending',
      }));
      expect(payment).toEqual({ _id: 'payment123' });
    });
  });
});
