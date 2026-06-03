/**
 * src/modules/payment/payment.service.js — Payment Service
 *
 * Interacts with Cashfree Payment Gateway and manages Payment database records.
 */

const crypto = require('crypto');
// Cashfree SDK is optional; direct HTTP calls via axios are used in tests/mocks.
const config = require('../../config');
const logger = require('../../config/logger');
const AppError = require('../../shared/utils/api-error');
const Payment = require('./payment.model');
const bookingRepository = require('../booking/booking.repository');
const axios = require('axios');

// Initialize Cashfree SDK
// const cfEnv = config.cashfree.env === 'PROD' ? Cashfree.Environment.PRODUCTION : Cashfree.Environment.SANDBOX;
// Cashfree.XClientId = config.cashfree.clientId;
// Cashfree.XClientSecret = config.cashfree.clientSecret;
// Cashfree.XEnvironment = cfEnv;

const CASHFREE_BASE_URL =
  config.cashfree.env === 'PROD'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

class PaymentService {
  /**
   * Create a Cashfree Payment Order for a completed booking
   */
  async createPaymentOrder(booking) {
    // 1️⃣ Generate unique order ID
    logger.info(`Creating payment order for booking: ${booking._id}`);
    const orderId = `cf_${booking._id.toString()}_${Date.now()}`;
    const amount = booking.price;

    // 2️⃣ Prevent payment for already paid bookings
    if (booking.paymentStatus === 'paid') {
      throw AppError.badRequest('Booking already paid');
    }

    // 3️⃣ Prevent duplicate payment creation
    const existingPayment = await Payment.findOne({
      bookingId: booking._id,
      status: { $in: ['pending'] },
    });

    if (existingPayment?.paymentSessionId) {
      logger.info(`Payment already exists for booking: ${booking._id}`);
      return existingPayment;
    }

    // 4️⃣ Prepare customer details
    const customerPhone = booking.userId?.phone || '9999999999';
    const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10) || '9999999999';

    const paymentOrder = {
      order_amount: amount,
      order_currency: 'INR',
      order_id: orderId,
      customer_details: {
        customer_id: booking.userId._id.toString(),
        customer_phone: cleanPhone,
        customer_name: booking.userId.name || 'Customer',
        customer_email: booking.userId.email || 'customer@example.com',
      },
      order_meta: {},
    };

    try {
      logger.info(`Creating Cashfree order for booking: ${booking._id} | Amount: ${amount}`);
      logger.debug(`Cashfree order payload: ${JSON.stringify(paymentOrder)}`);

      const response = await axios.post(
        `${CASHFREE_BASE_URL}/orders`,
        paymentOrder,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': config.cashfree.clientId,
            'x-client-secret': config.cashfree.clientSecret,
            'x-api-version': '2022-09-01',
          },
        }
      );

      const cfOrder = response.data?.order || response.data;
      const orderIdValue = cfOrder?.order_id || cfOrder?.cf_order_id;
      if (!orderIdValue) {
        throw new Error('Invalid response from Cashfree order creation');
      }

      logger.info(`Cashfree order created successfully: ${orderIdValue}`);

      const payment = await Payment.create({
        bookingId: booking._id,
        userId: booking.userId._id,
        orderId: orderIdValue,
        paymentSessionId: cfOrder?.payment_session_id || null,
        amount,
        currency: 'INR',
        status: 'pending',
        cfOrderId: cfOrder?.cf_order_id || orderIdValue,
      });

      logger.info(`Payment saved in DB successfully: ${payment._id}`);
      return payment;
    } catch (error) {
      const errorDetail = error.response?.data || error.message;
      logger.error('Cashfree order creation failed:', errorDetail);
      throw AppError.badRequest(
        error.response?.data?.message ||
          error.message ||
          'Payment gateway error'
      );
    }
  }

  /**
   * Verify Cashfree Webhook Signature using HMAC SHA256
   */
  verifyWebhook(headers, rawBody) {
    const signature = headers['x-webhook-signature'];
    const timestamp = headers['x-webhook-timestamp'];
    if (!signature || !timestamp) {
      logger.warn('Webhook verification failed: Missing signature or timestamp headers.');
      return false;
    }

    const secretKey = config.cashfree.clientSecret;
    const signStr = timestamp + rawBody;

    try {
      const generatedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(signStr)
        .digest('base64');

      return signature === generatedSignature;
    } catch (error) {
      logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Process Verified Webhook Payload
   */
  async processWebhookEvent(payload, context = {}) {
    logger.info('Processing verified Cashfree webhook payload');

    const payloadData = payload.data || payload;
    const orderData = payloadData.order || payloadData;
    const paymentData = payloadData.payment || payloadData;

    const orderId = orderData?.order_id;
    const paymentStatus = String(
      paymentData?.payment_status || paymentData?.status || ''
    ).toUpperCase();
    const cfPaymentId = paymentData?.cf_payment_id || paymentData?.payment_id;
    const paidAt = paymentData?.payment_time || paymentData?.paid_at;

    if (!orderId || !paymentStatus) {
      logger.warn('Invalid webhook payload structure. Missing orderId or paymentStatus.');
      return;
    }

    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      logger.warn(`No payment record found for orderId: ${orderId}`);
      return;
    }

    if (payment.status === 'paid') {
      logger.info(`Payment for orderId ${orderId} is already marked paid.`);
      return;
    }

    if (paymentStatus === 'SUCCESS') {
      payment.status = 'paid';
      if (cfPaymentId) payment.cfPaymentId = cfPaymentId.toString();
      payment.paidAt = paidAt ? new Date(paidAt) : new Date();
      await payment.save();

      const bookingService = require('../booking/booking.service');
      await bookingService.finalizePayment(payment.bookingId, {
        ...context,
        paymentMethod: payment.method || payment.paymentMethod || 'cashfree',
      });
      logger.info(`Payment updated to 'paid' for orderId: ${orderId}`);
    } else if (['FAILED', 'USER_DROPPED', 'NOT_ATTEMPTED'].includes(paymentStatus)) {
      payment.status = 'failed';
      if (cfPaymentId) payment.cfPaymentId = cfPaymentId.toString();
      await payment.save();
      await bookingRepository.updateById(payment.bookingId, { paymentStatus: 'failed' });
      logger.info(`Payment updated to 'failed' for orderId: ${orderId}`);
    } else {
      payment.status = paymentStatus.toLowerCase();
      await payment.save();
      logger.info(`Payment left as ${payment.status} for orderId: ${orderId}`);
    }
  }

  /**
   * Fetch payment status directly from Cashfree (Polling/Fallback)
   */
  /**
   * Verify payment after client SDK callback.
   * Re‑uses the existing polling logic to fetch order status from Cashfree,
   * update the DB if needed, and return the payment record.
   */

  async verifyPayment(bookingId, context = {}) {
    return await this.checkPaymentStatus(bookingId, context);
  }

  async checkPaymentStatus(bookingId, context = {}) {
    const payment = await Payment.findOne({ bookingId })
      .sort({ createdAt: -1 });

    if (!payment) {
      throw AppError.notFound(
        'No payment initiation found for this booking.'
      );
    }

    // Already paid
    if (payment.status === 'paid') {
      return payment;
    }

    try {
      logger.info(`Fetching payment status from Cashfree for orderId: ${payment.orderId}`);
      const response = await axios.get(
        `${CASHFREE_BASE_URL}/orders/${payment.orderId}/payments`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': config.cashfree.clientId,
            'x-client-secret': config.cashfree.clientSecret,
            'x-api-version': '2022-09-01',
          },
        }
      );

      const cashfreeResponse = response.data;
      logger.info(`Cashfree payment response: ${JSON.stringify(cashfreeResponse)}`);

      const payments = Array.isArray(cashfreeResponse)
        ? cashfreeResponse
        : cashfreeResponse.data || cashfreeResponse.payments || [];

      if (!payments || payments.length === 0) {
        logger.debug('No payment attempt found yet for this order');
        return payment;
      }

      const latestPayment = payments[0];
      const latestStatus = String(
        latestPayment.payment_status || latestPayment.status || ''
      ).toUpperCase();

      logger.info(`Latest payment status: ${latestStatus}`);

      if (latestStatus === 'SUCCESS') {
        logger.info('Payment status is SUCCESS');
        payment.status = 'paid';
        payment.paidAt = new Date();
        payment.cfPaymentId = latestPayment.cf_payment_id || latestPayment.payment_id;
        await payment.save();

        const bookingService = require('../booking/booking.service');
        await bookingService.finalizePayment(payment.bookingId, {
          ...context,
          paymentMethod: payment.method || payment.paymentMethod || 'cashfree',
        });

        logger.info(`Payment updated to PAID for orderId: ${payment.orderId}`);
      } else if (latestStatus === 'FAILED') {
        logger.warn('Payment status is FAILED');
        payment.status = 'failed';
        await payment.save();
        await bookingRepository.updateById(payment.bookingId, {
          paymentStatus: 'failed',
        });
        logger.info(`Payment updated to FAILED for orderId: ${payment.orderId}`);
      } else {
        payment.status = latestStatus.toLowerCase() || 'pending';
        await payment.save();
        logger.info(`Payment left as ${payment.status} for orderId: ${payment.orderId}`);
      }

      return payment;
    } catch (error) {
      logger.error('Fetch payment error:', error.response?.data || error.message);

      throw AppError.badRequest(
        error.response?.data?.message ||
        'Failed to fetch payment status'
      );
    }
  }
}

module.exports = new PaymentService();
