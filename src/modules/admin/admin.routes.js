/**
 * src/modules/admin/admin.routes.js — Admin Route Definitions
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { ROLES } = require('../../shared/utils/constants');
const { idParam } = require('../../shared/validators/common.validators');
const adminController = require('./admin.controller');
const adminValidation = require('./admin.validation');

const router = Router();

// Protect all admin endpoints with authentication and ROLES.ADMIN check
router.use(authenticate, authorize(ROLES.ADMIN));

// ── USER ROUTES ──────────────────────────────────────────────
router.get('/users', validate(adminValidation.listUsersSchema), adminController.listUsers);
router.patch('/users/:id/status', validate(adminValidation.toggleUserStatusSchema), adminController.toggleUserStatus);
router.patch('/users/:id/role', validate(adminValidation.updateUserRoleSchema), adminController.updateUserRole);

// ── PROVIDER ROUTES ──────────────────────────────────────────
router.get('/providers', validate(adminValidation.listProvidersSchema), adminController.listProviders);
router.patch('/providers/:id/verify', validate(adminValidation.verifyProviderSchema), adminController.verifyProvider);
router.patch('/providers/:id/profile', validate(adminValidation.updateProviderSchema), adminController.updateProvider);

// ── CATALOG ROUTES ───────────────────────────────────────────
router.post('/categories', validate(adminValidation.createCategorySchema), adminController.createCategory);
router.patch('/categories/:id', validate(adminValidation.updateCategorySchema), adminController.updateCategory);
router.delete('/categories/:id', validate(idParam), adminController.deleteCategory);

router.post('/services', validate(adminValidation.createServiceSchema), adminController.createService);
router.patch('/services/:id', validate(adminValidation.updateServiceSchema), adminController.updateService);
router.delete('/services/:id', validate(idParam), adminController.deleteService);

// ── BOOKING ROUTES ───────────────────────────────────────────
router.get('/bookings', validate(adminValidation.listBookingsSchema), adminController.listBookings);
router.get('/bookings/:id', validate(idParam), adminController.getBookingById);
router.post('/bookings/:id/cancel', validate(adminValidation.cancelBookingSchema), adminController.cancelBooking);

// ── PAYMENT ROUTES ───────────────────────────────────────────
router.get('/payments', validate(adminValidation.listPaymentsSchema), adminController.listPayments);
router.patch('/payments/:id/status', validate(adminValidation.overridePaymentSchema), adminController.overridePaymentStatus);

// ── REVIEW ROUTES ────────────────────────────────────────────
router.get('/reviews', adminController.listReviews);
router.delete('/reviews/:id', validate(idParam), adminController.deleteReview);

module.exports = router;
