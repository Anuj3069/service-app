/**
 * src/modules/payment/payment.service.js — Payment Service
 *
 * Interacts with Cashfree Payment Gateway and manages Payment database records.
 */

const crypto = require('crypto');
const { Cashfree } = require('cashfree-pg');
const config = require('../../config');
const logger = require('../../config/logger');
const AppError = require('../../shared/utils/api-error');
const Payment = require('./payment.model');
const bookingRepository = require('../booking/booking.repository');

// Initialize Cashfree SDK
const cfEnv = config.cashfree.env === 'PROD' ? Cashfree.Environment.PRODUCTION : Cashfree.Environment.SANDBOX;
Cashfree.XClientId = config.cashfree.clientId;
Cashfree.XClientSecret = config.cashfree.clientSecret;
Cashfree.XEnvironment = cfEnv;

class PaymentService {
  /**
   * Create a Cashfree Payment Order for a completed booking
   */
  async createPaymentOrder(booking) {
    // 1. Generate unique order ID
    const orderId = `cf_${booking._id.toString()}_${Date.now()}`;
    const amount = booking.price;

    // 2. Prepare customer details
    const customerPhone = booking.userId.phone || '9999999999';
    // Ensure phone has at least 10 digits and is valid
    const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10) || '9999999999';

    const requestPayload = {
      order_amount: amount,
      order_currency: 'INR',
      order_id: orderId,
      customer_details: {
        customer_id: booking.userId._id.toString(),
        customer_phone: cleanPhone,
        customer_name: booking.userId.name || 'Customer',
        customer_email: booking.userId.email || 'customer@example.com',
      },
      order_meta: {
        return_url: `https://your-domain.com/payment-status?order_id={order_id}`,
      },
    };

    try {
      logger.info(`Creating Cashfree Order for booking: ${booking._id} | Amount: ${amount}`);
      const response = await Cashfree.PGCreateOrder(requestPayload);

      const cfOrder = response.data;

      // Create Payment record in DB
      const payment = await Payment.create({
        bookingId: booking._id,
        userId: booking.userId._id,
        orderId: orderId,
        paymentSessionId: cfOrder.payment_session_id,
        amount: amount,
        status: 'pending',
        cfOrderId: cfOrder.cf_order_id,
      });

      return payment;
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      logger.error(`Cashfree Order Creation failed: ${errorMsg}`);
      throw AppError.badRequest(`Payment initiation failed: ${errorMsg}`);
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
  async processWebhookEvent(payload) {
    logger.info('Processing verified Cashfree Webhook payload:', JSON.stringify(payload));

    const { data } = payload;
    if (!data || !data.order || !data.payment) {
      logger.warn('Invalid webhook payload structure.');
      return;
    }

    const orderId = data.order.order_id;
    const paymentStatus = data.payment.payment_status; // e.g. 'SUCCESS', 'FAILED'
    const cfPaymentId = data.payment.cf_payment_id;
    const paidAt = data.payment.payment_time;

    // Find the corresponding Payment record
    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      logger.warn(`No payment record found in database for orderId: ${orderId}`);
      return;
    }

    if (payment.status === 'paid') {
      logger.info(`Payment for orderId ${orderId} is already completed.`);
      return;
    }

    if (paymentStatus === 'SUCCESS') {
      payment.status = 'paid';
      payment.cfPaymentId = cfPaymentId.toString();
      payment.paidAt = paidAt ? new Date(paidAt) : new Date();
      await payment.save();

      // Finalize the booking status to paid
      const bookingService = require('../booking/booking.service');
      await bookingService.finalizePayment(payment.bookingId);
      logger.info(`Payment successfully updated to 'paid' for orderId: ${orderId}`);
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'USER_DROPPED') {
      payment.status = 'failed';
      payment.cfPaymentId = cfPaymentId ? cfPaymentId.toString() : undefined;
      await payment.save();

      // Update booking paymentStatus to failed
      await bookingRepository.updateById(payment.bookingId, { paymentStatus: 'failed' });
      logger.info(`Payment updated to 'failed' for orderId: ${orderId}`);
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
  async verifyPayment(bookingId) {
    // Delegates to the existing checkPaymentStatus which already handles
    // fetching from Cashfree, updating DB, and returning the payment
    return await this.checkPaymentStatus(bookingId);
  }

    async checkPaymentStatus(bookingId) {
    const payment = await Payment.findOne({ bookingId }).sort({ createdAt: -1 });
    if (!payment) {
      throw AppError.notFound('No payment initiation found for this booking.');
    }

    if (payment.status === 'paid') {
      return payment;
    }

    try {
      logger.info(`Fetching order status from Cashfree for orderId: ${payment.orderId}`);
      const response = await Cashfree.PGFetchOrder(payment.orderId);
      const cfOrder = response.data;

      // Note: In newer Cashfree APIs, we check the order status ('PAID', 'ACTIVE', etc.)
      if (cfOrder.order_status === 'PAID') {
        payment.status = 'paid';
        payment.paidAt = new Date();
        await payment.save();

        const bookingService = require('../booking/booking.service');
        await bookingService.finalizePayment(payment.bookingId);
        logger.info(`Payment successfully polled and updated to 'paid' for orderId: ${payment.orderId}`);
      } else if (cfOrder.order_status === 'FAILED' || cfOrder.order_status === 'EXPIRED') {
        payment.status = 'failed';
        await payment.save();

        await bookingRepository.updateById(payment.bookingId, { paymentStatus: 'failed' });
        logger.info(`Payment polled and updated to 'failed' for orderId: ${payment.orderId}`);
      }

      return payment;
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      logger.error(`Failed to fetch payment status from Cashfree: ${errorMsg}`);
      throw AppError.badRequest(`Verification failed: ${errorMsg}`);
    }
  }
}

module.exports = new PaymentService();
