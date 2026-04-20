/**
 * src/modules/booking/booking.controller.js — Booking HTTP Handlers
 *
 * Handles both Customer and Worker booking endpoints.
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const bookingService = require('./booking.service');
const providerRepository = require('../provider/provider.repository');
const AppError = require('../../shared/utils/api-error');

// ─────────────────────────────────────────────────────────────
//  CUSTOMER ENDPOINTS
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/user/bookings
 * Create a new booking
 */
const createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(req.user.id, req.body);
  ApiResponse.created(res, { booking }, 'Booking created successfully. Waiting for provider confirmation.');
});

/**
 * GET /api/v1/user/bookings
 * List customer's bookings
 */
const getUserBookings = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const bookings = await bookingService.getUserBookings(req.user.id, status);
  ApiResponse.ok(res, { bookings, count: bookings.length }, 'Bookings retrieved successfully.');
});

/**
 * GET /api/v1/user/bookings/:id
 * Get booking detail
 */
const getBookingById = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingById(req.user.id, req.params.id);
  ApiResponse.ok(res, { booking }, 'Booking retrieved successfully.');
});

// ─────────────────────────────────────────────────────────────
//  WORKER ENDPOINTS
// ─────────────────────────────────────────────────────────────

/**
 * Helper: Get provider ID from authenticated worker user
 */
const _getProviderId = async (userId) => {
  const provider = await providerRepository.findByUserId(userId);
  if (!provider) {
    throw AppError.notFound('Provider profile not found. Please create one first.');
  }
  return provider._id;
};

/**
 * GET /api/v1/worker/bookings
 * Get assigned bookings for the worker
 */
const getWorkerBookings = asyncHandler(async (req, res) => {
  const providerId = await _getProviderId(req.user.id);
  const { status } = req.query;
  const bookings = await bookingService.getWorkerBookings(providerId, status);
  ApiResponse.ok(res, { bookings, count: bookings.length }, 'Worker bookings retrieved successfully.');
});

/**
 * PUT /api/v1/worker/bookings/:id/accept
 */
const acceptBooking = asyncHandler(async (req, res) => {
  const providerId = await _getProviderId(req.user.id);
  const booking = await bookingService.acceptBooking(providerId, req.params.id);
  ApiResponse.ok(res, { booking }, 'Booking accepted successfully.');
});

/**
 * PUT /api/v1/worker/bookings/:id/reject
 */
const rejectBooking = asyncHandler(async (req, res) => {
  const providerId = await _getProviderId(req.user.id);
  const booking = await bookingService.rejectBooking(providerId, req.params.id);
  ApiResponse.ok(res, { booking }, 'Booking rejected.');
});

/**
 * PUT /api/v1/worker/bookings/:id/complete
 */
const completeBooking = asyncHandler(async (req, res) => {
  const providerId = await _getProviderId(req.user.id);
  const booking = await bookingService.completeBooking(providerId, req.params.id);
  ApiResponse.ok(res, { booking }, 'Booking completed successfully. Great job!');
});

module.exports = {
  createBooking,
  getUserBookings,
  getBookingById,
  getWorkerBookings,
  acceptBooking,
  rejectBooking,
  completeBooking,
};
