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
    const orderId = `cf_${booking._id.toString()}_${Date.now()}`;
    const amount = booking.price;

    // 2️⃣ Prevent payment for already paid bookings
    if (booking.paymentStatus === 'PAID') {
      throw AppError.badRequest('Booking already paid');
    }

    // 3️⃣ Prevent duplicate payment creation
    const existingPayment = await Payment.findOne({
      bookingId: booking._id,
      status: { $in: ['pending', 'PENDING'] },
    });

    if (existingPayment?.paymentSessionId) {
      return existingPayment;
    }

    // 4️⃣ Prepare customer details
    const customerPhone = booking.userId.phone || '9999999999';

    // Ensure valid 10-digit phone
    const cleanPhone =
      customerPhone.replace(/\D/g, '').slice(-10) || '9999999999';

    const paymentOrder = {
      order_amount: amount,
      order_currency: 'INR',
      order_id: orderId,
      customer_details: {
        customer_id: booking.userId._id.toString(),
        customer_phone: cleanPhone,
        customer_name: booking.userId.name || 'Customer',
        customer_email:
          booking.userId.email || 'customer@example.com',
      },
      order_meta: {
        return_url: `${config.app.baseUrl}/payment-status?order_id={order_id}`,
      },
    };

    try {
      logger.info(
        `Creating Cashfree Order for booking: ${booking._id} | Amount: ${amount}`
      );

      logger.info(
        `Using Cashfree API URL: ${CASHFREE_BASE_URL}/orders`
      );

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

      const cfOrder = response.data;

      logger.info(
        `Cashfree order created successfully: ${cfOrder.order_id}`
      );

      // 5️⃣ Save payment in DB only if API succeeds
      const payment = await Payment.create({
        bookingId: booking._id,
        userId: booking.userId._id,
        orderId: cfOrder.order_id,
        paymentSessionId: cfOrder.payment_session_id,
        amount: amount,
        currency: 'INR',
        status: 'PENDING',
        cfOrderId: cfOrder.cf_order_id || cfOrder.order_id,
      });

      return payment;
    } catch (error) {
      logger.error(
        'Cashfree order creation failed:',
        error.response?.data || error.message
      );

      throw AppError.badRequest(
        error.response?.data?.message ||
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
    return await this.checkPaymentStatus(bookingId);
  }

  async checkPaymentStatus(bookingId) {
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
      logger.info(
        `Fetching payment status from Cashfree for orderId: ${payment.orderId}`
      );

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

      logger.info(
        `Cashfree payment response: ${JSON.stringify(response.data)}`
      );

      // No payment attempt yet
      if (!response.data || response.data.length === 0) {
        return {
          success: false,
          payment_status: 'NOT_ATTEMPTED',
          message: 'No payment attempt found yet',
        };
      }

      // Latest payment attempt
      const latestPayment = response.data[0];

      logger.info(
        `Latest payment status: ${latestPayment.payment_status}`
      );

      // SUCCESS
      if (latestPayment.payment_status === 'SUCCESS') {
        payment.status = 'paid';
        payment.paidAt = new Date();
        payment.cfPaymentId = latestPayment.cf_payment_id;

        await payment.save();

        // Update booking payment status
        await bookingRepository.updateById(payment.bookingId, {
          paymentStatus: 'paid',
        });

        // Finalize booking
        const bookingService = require('../booking/booking.service');

        await bookingService.finalizePayment(
          payment.bookingId
        );

        logger.info(
          `Payment updated to PAID for orderId: ${payment.orderId}`
        );
      }

      // FAILED
      else if (
        latestPayment.payment_status === 'FAILED'
      ) {
        payment.status = 'failed';

        await payment.save();

        await bookingRepository.updateById(payment.bookingId, {
          paymentStatus: 'failed',
        });

        logger.info(
          `Payment updated to FAILED for orderId: ${payment.orderId}`
        );
      }

      // PENDING / USER_DROPPED / NOT_ATTEMPTED
      else {
        payment.status =
          latestPayment.payment_status.toLowerCase();

        await payment.save();

        logger.info(
          `Payment still pending for orderId: ${payment.orderId}`
        );
      }

      return latestPayment;
    } catch (error) {
      logger.error(
        'Fetch payment error:',
        error.response?.data || error.message
      );

      throw AppError.badRequest(
        error.response?.data?.message ||
        'Failed to fetch payment status'
      );
    }
  }
}

module.exports = new PaymentService();
