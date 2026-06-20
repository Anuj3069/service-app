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
const logger = require('../../config/logger');
const { sendPushNotification } = require('../../shared/utils/push-notification');

// ─────────────────────────────────────────────────────────────
//  CUSTOMER ENDPOINTS
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/user/bookings
 * Create a new booking
 */
const createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(req.user.id, req.body);

  // Notify the assigned provider about the new scheduled booking
  const io = req.app.get('io');
  const socketStore = req.app.get('socketStore');
  if (io && socketStore && booking.providerId && booking.providerId.userId) {
    const providerUserId = booking.providerId.userId._id
      ? booking.providerId.userId._id.toString()
      : booking.providerId.userId.toString();
    const socketId = await socketStore.get(providerUserId);
    if (socketId) {
      io.to(socketId).emit('new-scheduled-booking', {
        bookingId: booking._id,
        service: {
          id: booking.serviceId._id,
          name: booking.serviceId.name,
        },
        price: booking.price,
        date: booking.date,
        slot: booking.slot,
        status: booking.status,
      });
    } else {
      const provider = await providerRepository.findByUserId(providerUserId);
      if (provider?.fcmToken) {
        await sendPushNotification({
          fcmToken: provider.fcmToken,
          title: 'New Booking Request',
          body: `New scheduled booking for ${booking.serviceId.name}`,
          data: { bookingId: booking._id.toString(), type: 'new-scheduled-booking' },
        });
      }
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

  // Emit socket events to candidate providers (via Redis-backed SocketStore)
  const io = req.app.get('io');
  const socketStore = req.app.get('socketStore');

  if (io && socketStore && candidateUserIds) {
    for (const userId of candidateUserIds) {
      const socketId = await socketStore.get(userId.toString());
      if (socketId) {
        logger.debug(`Emitting 'new-booking-request' to userId: ${userId} (socketId: ${socketId})`);
        io.to(socketId).emit('new-booking-request', {
          bookingId: booking._id,
          service: booking.serviceId,
          price: booking.price,
          requestedAt: booking.requestedAt,
          expiresAt: booking.expiresAt,
        });
      } else {
        logger.debug(`User ${userId} is not connected — sending FCM push.`);
        const provider = await providerRepository.findByUserId(userId.toString());
        if (provider?.fcmToken) {
          await sendPushNotification({
            fcmToken: provider.fcmToken,
            title: 'New Booking Request!',
            body: 'A customer needs your service nearby. Tap to respond.',
            data: { bookingId: booking._id.toString(), type: 'new-booking-request' },
          });
        }
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

/**
 * PUT /api/v1/user/bookings/:id/cancel
 * Cancel a requested or pending booking
 */
const cancelUserBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancelUserBooking(
    req.user.id,
    req.params.id,
    req.body.cancellationReason
  );

  await expiryScheduler.cancel(req.params.id);

  const io = req.app.get('io');
  const socketStore = req.app.get('socketStore');
  if (io && socketStore) {
    const providerUserIds = [];

    if (booking.providerId && booking.providerId.userId) {
      providerUserIds.push(
        booking.providerId.userId._id
          ? booking.providerId.userId._id.toString()
          : booking.providerId.userId.toString()
      );
    }

    if (Array.isArray(booking.candidateProviders)) {
      for (const provider of booking.candidateProviders) {
        if (provider.userId) {
          providerUserIds.push(
            provider.userId._id
              ? provider.userId._id.toString()
              : provider.userId.toString()
          );
        }
      }
    }

    for (const providerUserId of [...new Set(providerUserIds)]) {
      const socketId = await socketStore.get(providerUserId);
      if (socketId) {
        io.to(socketId).emit('booking-cancelled', {
          bookingId: booking._id,
          status: 'CANCELLED',
          message: 'The customer cancelled this booking request.',
        });
      }
    }
  }

  ApiResponse.ok(res, { booking }, 'Booking cancelled successfully.');
});

/**
 * POST /api/v1/user/bookings/:id/pay
 * Initiate payment for a completed booking
 */
const payBooking = asyncHandler(async (req, res) => {
  const payment = await bookingService.payBooking(req.user.id, req.params.id);
  ApiResponse.ok(res, { payment }, 'Payment initiated. Use paymentSessionId to complete checkout.');
});

/**
 * POST /api/v1/user/bookings/:id/pay-cash
 * Record cash payment for a completed booking
 */
const payBookingByCash = asyncHandler(async (req, res) => {
  const booking = await bookingService.payBookingByCash(req.user.id, req.params.id, {
    io: req.app.get('io'),
    socketStore: req.app.get('socketStore'),
  });
  ApiResponse.ok(res, { booking }, 'Cash payment recorded successfully.');
});

/**
 * GET /api/v1/user/bookings/:id/otp
 * Customer retrieves the completion OTP for their accepted booking
 */
const getCompletionOtp = asyncHandler(async (req, res) => {
  const result = await bookingService.getCompletionOtp(req.user.id, req.params.id);
  ApiResponse.ok(res, result, 'OTP retrieved successfully.');
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

  if (result.type === 'SCHEDULED') {
    const booking = result.booking;
    const io = req.app.get('io');
    const socketStore = req.app.get('socketStore');

    if (io && socketStore && booking.userId) {
      const customerId = booking.userId._id
        ? booking.userId._id.toString()
        : booking.userId.toString();
      const customerSocketId = await socketStore.get(customerId);
      if (customerSocketId) {
        io.to(customerSocketId).emit('booking-accepted', {
          bookingId: booking._id,
          provider: {
            id: providerId,
            name: req.user.name || 'Provider',
          },
          status: 'ACCEPTED',
        });
      }
    }

    return ApiResponse.ok(res, { booking, type: 'SCHEDULED' }, 'Booking accepted successfully.');
  }

  ApiResponse.ok(res, { booking: result.booking }, 'Booking accepted successfully.');
});

/**
 * PUT /api/v1/worker/bookings/:id/reject
 */
const rejectBooking = asyncHandler(async (req, res) => {
  const providerId = await _getProviderId(req.user.id);
  const booking = await bookingService.rejectBooking(providerId, req.params.id);

  const io = req.app.get('io');
  const socketStore = req.app.get('socketStore');
  if (io && socketStore && booking.userId) {
    const customerId = booking.userId._id
      ? booking.userId._id.toString()
      : booking.userId.toString();
    const customerSocketId = await socketStore.get(customerId);
    if (customerSocketId) {
      io.to(customerSocketId).emit('booking-rejected', {
        bookingId: booking._id,
        status: 'REJECTED',
        message: 'Your scheduled booking request was rejected by the provider.',
      });
    }
  }

  ApiResponse.ok(res, { booking }, 'Booking rejected.');
});

/**
 * PUT /api/v1/worker/bookings/:id/complete
 */
const completeBooking = asyncHandler(async (req, res) => {
  const providerId = await _getProviderId(req.user.id);
  const { otp } = req.body;
  const booking = await bookingService.completeBooking(providerId, req.params.id, otp);

  // Notify customer via socket that their booking is completed
  const io = req.app.get('io');
  const socketStore = req.app.get('socketStore');
  if (io && socketStore && booking.userId) {
    const customerId = booking.userId._id
      ? booking.userId._id.toString()
      : booking.userId.toString();
    const customerSocketId = await socketStore.get(customerId);
    if (customerSocketId) {
      io.to(customerSocketId).emit('booking-completed', {
        bookingId: booking._id,
        completedAt: booking.completedAt,
      });
    }
  }

  ApiResponse.ok(res, { booking }, 'Booking completed successfully. Great job!');
});

module.exports = {
  createBooking,
  createInstantBooking,
  getUserBookings,
  getBookingById,
  cancelUserBooking,
  getCompletionOtp,
  payBooking,
  payBookingByCash,
  getWorkerBookings,
  acceptBooking,
  rejectBooking,
  completeBooking,
};
