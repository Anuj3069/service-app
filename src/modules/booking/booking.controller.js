/**
 * src/modules/booking/booking.controller.js — Booking HTTP Handlers
 *
 * Handles both Customer and Worker booking endpoints.
 * Uses Redis-backed SocketStore for socket lookups and ExpiryScheduler for booking expiry.
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const bookingService = require('./booking.service');
const providerRepository = require('../provider/provider.repository');
const AppError = require('../../shared/utils/api-error');
const expiryScheduler = require('../../shared/utils/expiry-scheduler');

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
 * POST /api/v1/user/instant-booking
 * Create a new instant booking (broadcasts to available providers)
 */
const createInstantBooking = asyncHandler(async (req, res) => {
  const { booking, candidateUserIds } = await bookingService.createInstantBooking(req.user.id, req.body);

  // Emit socket events to candidate providers (via Redis-backed SocketStore)
  const io = req.app.get('io');
  const socketStore = req.app.get('socketStore');

  if (io && socketStore && candidateUserIds) {
    for (const userId of candidateUserIds) {
      const socketId = await socketStore.get(userId.toString());
      if (socketId) {
        console.log(`[SOCKET DEBUG] Emitting 'new-booking-request' to userId: ${userId} (socketId: ${socketId})`);
        io.to(socketId).emit('new-booking-request', {
          bookingId: booking._id,
          service: booking.serviceId,
          price: booking.price,
          requestedAt: booking.requestedAt,
          expiresAt: booking.expiresAt,
        });
      } else {
        console.log(`[SOCKET DEBUG] User ${userId} is not connected (no socketId found).`);
      }
    }
  }

  // Schedule expiry via Redis TTL (replaces fragile setTimeout)
  await expiryScheduler.schedule(booking._id.toString(), booking.expiresAt);

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
    const io = req.app.get('io');
    const socketStore = req.app.get('socketStore');

    // Cancel the Redis expiry timer since the booking was accepted
    await expiryScheduler.cancel(req.params.id);
    
    if (io && socketStore) {
      // Notify other providers that booking is taken
      for (const candidateUserId of candidateUserIds) {
        if (candidateUserId !== req.user.id.toString()) {
          const socketId = await socketStore.get(candidateUserId);
          if (socketId) {
            io.to(socketId).emit('booking-taken', { bookingId: booking._id });
          }
        }
      }
      
      // Notify customer that booking is confirmed
      const customerSocketId = await socketStore.get(booking.userId._id.toString());
      if (customerSocketId) {
        io.to(customerSocketId).emit('booking-confirmed', {
          bookingId: booking._id,
          provider: {
            id: providerId,
            name: req.user.name || 'Provider',
          },
          status: 'ACCEPTED'
        });
      }
    }
    return ApiResponse.ok(res, { booking, type: 'INSTANT' }, 'Instant booking accepted successfully.');
  }

  // Handle scheduled response
  ApiResponse.ok(res, { booking: result.booking }, 'Booking accepted successfully.');
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
  createInstantBooking,
  getUserBookings,
  getBookingById,
  getWorkerBookings,
  acceptBooking,
  rejectBooking,
  completeBooking,
};
