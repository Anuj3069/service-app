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
 * POST /api/v1/user/instant-booking
 * Create a new instant booking (broadcasts to available providers)
 */
const createInstantBooking = asyncHandler(async (req, res) => {
  const { booking, candidateUserIds } = await bookingService.createInstantBooking(req.user.id, req.body);

  // Emit socket events to candidate providers
  const io = req.app.get('io');
  const userSockets = req.app.get('userSockets');

  if (io && userSockets && candidateUserIds) {
    candidateUserIds.forEach((userId) => {
      const socketId = userSockets.get(userId.toString());
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
    });
  }

  // Step 9: Handle Expiry via Timeout
  const expiryTimeMs = new Date(booking.expiresAt).getTime() - Date.now();
  if (expiryTimeMs > 0) {
    setTimeout(async () => {
      try {
        const BookingModel = require('./booking.model');
        const expiredBooking = await BookingModel.findOneAndUpdate(
          { _id: booking._id, status: 'requested' },
          { status: 'expired' },
          { new: true }
        );

        if (expiredBooking && io && userSockets) {
          // booking.userId might be an ObjectId or populated, but we passed req.user.id
          const customerSocketId = userSockets.get(req.user.id.toString());
          if (customerSocketId) {
            io.to(customerSocketId).emit('booking-expired', {
              bookingId: booking._id,
              message: 'No providers accepted your request in time.',
            });
          }
        }
      } catch (err) {
        console.error('Error auto-expiring instant booking:', err);
      }
    }, expiryTimeMs);
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
    const io = req.app.get('io');
    const userSockets = req.app.get('userSockets');
    
    if (io && userSockets) {
      // Step 7: Notify other providers
      candidateUserIds.forEach(candidateUserId => {
        if (candidateUserId !== req.user.id.toString()) {
          const socketId = userSockets.get(candidateUserId);
          if (socketId) {
            io.to(socketId).emit('booking-taken', { bookingId: booking._id });
          }
        }
      });
      
      // Step 8: Notify customer
      const customerSocketId = userSockets.get(booking.userId._id.toString());
      if (customerSocketId) {
        // Fetch provider user details for the notification if needed
        io.to(customerSocketId).emit('booking-confirmed', {
          bookingId: booking._id,
          provider: {
            id: providerId,
            name: req.user.name || 'Provider', // Fallback if req.user.name is not set
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
