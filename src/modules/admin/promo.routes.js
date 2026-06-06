/**
 * src/modules/admin/promo.routes.js — User Promo Validation routes
 */

const { Router } = require('express');
const { authenticate } = require('../../shared/middleware/auth.middleware');
const adminController = require('./admin.controller');

const router = Router();

// Validate a promo code for customer checkout
router.post('/validate', authenticate, adminController.validatePromo);

module.exports = router;
