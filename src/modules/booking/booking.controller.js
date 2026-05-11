/**
 * src/modules/booking/booking.controller.js — Booking HTTP Handlers
 *
 * Handles both Customer and Worker booking endpoints.
 * All socket/notification logic is delegated to Redis-backed services.
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const bookingService = require('./booking.service');
const providerRepository = require('../provider/provider.repository');
const AppError = require('../../shared/utils/api-error');
const logger = require('../../config/logger');
const User = require('../auth/auth.model');

// Redis-backed services
const notificationService = require('../../shared/services/notification.service');
const expiryService = require('../../shared/services/expiry.service');

// ─────────────────────────────────────────────────────────────
//  CUSTOMER ENDPOINTS
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/user/bookings
 * Create a new scheduled booking
 */
const createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(req.user.id, req.body);

  // Schedule expiry via Redis TTL (for scheduled bookings)
  if (booking.expiresAt) {
    const expiryMs = new Date(booking.expiresAt).getTime() - Date.now();
    if (expiryMs > 0) {
      await expiryService.scheduleExpiry(booking._id.toString(), expiryMs, {
        userId: req.user.id,
        type: 'SCHEDULED',
      });
    }
  }

  // Notify the assigned worker about the new scheduled booking
  if (booking.providerId) {
    const provider = await providerRepository.findById(
      booking.providerId._id || booking.providerId
    );
    if (provider && provider.userId) {
      const workerUserId = provider.userId._id
        ? provider.userId._id.toString()
        : provider.userId.toString();

      await notificationService.notifyNewScheduledBooking(workerUserId, {
        bookingId: booking._id,
        service: booking.serviceId,
        date: booking.date,
        slot: booking.slot,
        price: booking.price,
        expiresAt: booking.expiresAt,
      });
    }
  }

  ApiResponse.created(res, { booking }, 'Booking created successfully. Waiting for provider confirmation.');
});

/**
 * POST /api/v1/user/instant-booking
 * Create a new instant booking (broadcasts to available providers)
 */
const createInstantBooking = asyncHandler(async (req, res) => {
  const { booking, candidateUserIds } = await bookingService.createInstantBooking(req.user.id, req.body);

  // Notify candidate workers via Redis Pub/Sub
  if (candidateUserIds && candidateUserIds.length > 0) {
    await notificationService.notifyNewBookingRequest(candidateUserIds, {
      bookingId: booking._id,
      service: booking.serviceId,
      price: booking.price,
      requestedAt: booking.requestedAt,
      expiresAt: booking.expiresAt,
    });
  }

  // Schedule expiry via Redis TTL (replaces setTimeout)
  const expiryMs = new Date(booking.expiresAt).getTime() - Date.now();
  if (expiryMs > 0) {
    await expiryService.scheduleExpiry(booking._id.toString(), expiryMs, {
      userId: req.user.id,
      type: 'INSTANT',
    });
  }

  ApiResponse.created(res, { booking, candidateUserIds }, 'Instant booking requested. Waiting for a provider to accept.');
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
  const result = await bookingService.acceptBooking(providerId, req.params.id);

  if (result.type === 'INSTANT') {
    const { booking, candidateUserIds } = result;

    // Cancel the Redis expiry timer since the booking was accepted
    await expiryService.cancelExpiry(booking._id.toString());

    // Notify other candidate workers that the booking was taken
    await notificationService.notifyBookingTaken(
      candidateUserIds,
      req.user.id.toString(),
      booking._id
    );

    // Fetch the accepting worker's name
    let workerName = 'Provider';
    try {
      const workerUser = await User.findById(req.user.id).select('name');
      if (workerUser) workerName = workerUser.name;
    } catch (err) {
      logger.warn('Could not fetch worker name for booking-confirmed event:', err.message);
    }

    // Notify the customer that their booking has been confirmed
    const customerUserId = booking.userId._id
      ? booking.userId._id.toString()
      : booking.userId.toString();

    await notificationService.notifyBookingConfirmed(customerUserId, {
      bookingId: booking._id,
      provider: {
        id: providerId,
        name: workerName,
      },
      status: 'ACCEPTED',
    });

    return ApiResponse.ok(res, { booking, type: 'INSTANT' }, 'Instant booking accepted successfully.');
  }

  // Handle scheduled booking acceptance
  const { booking } = result;

  // Cancel the Redis expiry timer
  await expiryService.cancelExpiry(booking._id.toString());

  // Notify the customer that their scheduled booking was accepted
  const customerUserId = booking.userId._id
    ? booking.userId._id.toString()
    : booking.userId.toString();

  await notificationService.notifyScheduledBookingAccepted(customerUserId, {
    bookingId: booking._id,
    status: 'ACCEPTED',
  });

  ApiResponse.ok(res, { booking }, 'Booking accepted successfully.');
});

/**
 * PUT /api/v1/worker/bookings/:id/reject
 */
const rejectBooking = asyncHandler(async (req, res) => {
  const providerId = await _getProviderId(req.user.id);
  const booking = await bookingService.rejectBooking(providerId, req.params.id);

  // Cancel the Redis expiry timer
  await expiryService.cancelExpiry(booking._id.toString());

  // Notify the customer that their booking was rejected
  const customerUserId = booking.userId._id
    ? booking.userId._id.toString()
    : booking.userId.toString();

  await notificationService.notifyScheduledBookingRejected(customerUserId, {
    bookingId: booking._id,
    status: 'REJECTED',
  });

  ApiResponse.ok(res, { booking }, 'Booking rejected.');
});

/**
 * PUT /api/v1/worker/bookings/:id/complete
 */
const completeBooking = asyncHandler(async (req, res) => {
  const providerId = await _getProviderId(req.user.id);
  const booking = await bookingService.completeBooking(providerId, req.params.id);

  // Notify the customer that their booking is completed
  const customerUserId = booking.userId._id
    ? booking.userId._id.toString()
    : booking.userId.toString();

  await notificationService.notifyBookingCompleted(customerUserId, {
    bookingId: booking._id,
    status: 'COMPLETED',
  });

  ApiResponse.ok(res, { booking }, 'Booking completed successfully. Great job!');
});

module.exports = {
  createBooking,
  createInstantBooking,
  getUserBookings,
  getBookingById,
  getWorkerBookings,
  acceptBooking,
  rejectBooking,
  completeBooking,
};
