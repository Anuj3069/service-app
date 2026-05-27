/**
 * src/modules/payment/payment.controller.js — Payment HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const paymentService = require('./payment.service');
const AppError = require('../../shared/utils/api-error');

/**
 * POST /api/v1/payments/webhook
 * Handles Cashfree webhook events
 */
const handleWebhook = asyncHandler(async (req, res) => {
  // Cashfree webhooks require signature validation against raw request body
  const verified = paymentService.verifyWebhook(req.headers, req.rawBody);
  if (!verified) {
    throw AppError.unauthorized('Invalid webhook signature');
  }

  await paymentService.processWebhookEvent(req.body);

  ApiResponse.ok(res, null, 'Webhook processed successfully.');
});

/**
 * GET /api/v1/payments/:bookingId/status
 * Fetches latest payment status for a booking from DB or Cashfree API
 */
const getPaymentStatus = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const payment = await paymentService.checkPaymentStatus(bookingId);
  ApiResponse.ok(res, { status: payment.status, payment }, 'Payment status retrieved.');
});

/**
 * POST /api/v1/payments/:bookingId/verify
 * Verify payment status after SDK callback
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const result = await paymentService.verifyPayment(bookingId);
  ApiResponse.ok(res, { status: result.status, orderId: result.orderId }, 'Payment verification completed.');
});

module.exports = {
  handleWebhook,
  getPaymentStatus,
  verifyPayment,
};
