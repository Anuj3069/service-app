/**
 * src/modules/payment/payment.routes.js — Payment Route Definitions
 */

const { Router } = require('express');
const { handleWebhook, getPaymentStatus, verifyPayment } = require('./payment.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');

const router = Router();

// Webhook route (Cashfree server-to-server callback)
router.post('/webhook', handleWebhook);

// Customer status polling route
router.post('/:bookingId/verify', authenticate, verifyPayment);


module.exports = router;
