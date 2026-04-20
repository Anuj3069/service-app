/**
 * src/modules/booking/booking.routes.js — Booking Route Definitions
 *
 * Customer routes:
 *   POST   /api/v1/user/bookings
 *   GET    /api/v1/user/bookings
 *   GET    /api/v1/user/bookings/:id
 *
 * Worker routes:
 *   GET    /api/v1/worker/bookings
 *   PUT    /api/v1/worker/bookings/:id/accept
 *   PUT    /api/v1/worker/bookings/:id/reject
 *   PUT    /api/v1/worker/bookings/:id/complete
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { ROLES } = require('../../shared/utils/constants');
const {
  createBookingSchema,
  getBookingByIdSchema,
  bookingActionSchema,
  listBookingsSchema,
} = require('./booking.validation');
const {
  createBooking,
  getUserBookings,
  getBookingById,
  getWorkerBookings,
  acceptBooking,
  rejectBooking,
  completeBooking,
} = require('./booking.controller');

const router = Router();

// ── CUSTOMER BOOKING ROUTES ─────────────────────────────────
router.post(
  '/user/bookings',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(createBookingSchema),
  createBooking
);

router.get(
  '/user/bookings',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(listBookingsSchema),
  getUserBookings
);

router.get(
  '/user/bookings/:id',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(getBookingByIdSchema),
  getBookingById
);

// ── WORKER BOOKING ROUTES ───────────────────────────────────
router.get(
  '/worker/bookings',
  authenticate,
  authorize(ROLES.WORKER),
  validate(listBookingsSchema),
  getWorkerBookings
);

router.put(
  '/worker/bookings/:id/accept',
  authenticate,
  authorize(ROLES.WORKER),
  validate(bookingActionSchema),
  acceptBooking
);

router.put(
  '/worker/bookings/:id/reject',
  authenticate,
  authorize(ROLES.WORKER),
  validate(bookingActionSchema),
  rejectBooking
);

router.put(
  '/worker/bookings/:id/complete',
  authenticate,
  authorize(ROLES.WORKER),
  validate(bookingActionSchema),
  completeBooking
);

module.exports = router;
