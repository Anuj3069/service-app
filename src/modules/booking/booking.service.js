/**
 * src/modules/booking/booking.service.js — Booking Business Logic
 *
 * Handles the complete booking lifecycle:
 * - Customer: create booking, view bookings
 * - Worker: get assigned jobs, accept, reject, complete
 *
 * CRITICAL: Rechecks availability during booking creation.
 * CRITICAL: Validates status transitions.
 * CRITICAL: Checks expiry before accept.
 */

const AppError = require('../../shared/utils/api-error');
const { BOOKING_STATUS, BOOKING_TRANSITIONS } = require('../../shared/utils/constants');
const config = require('../../config');
const logger = require('../../config/logger');
const bookingRepository = require('./booking.repository');
const providerRepository = require('../provider/provider.repository');
const { Service } = require('../service/service.model');

class BookingService {
  /**
   * Generate a random 4-digit OTP string
   * @private
   */
  _generateOtp() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  // ─────────────────────────────────────────────────────────
  //  CUSTOMER APIs
  // ─────────────────────────────────────────────────────────

  /**
   * Create a new booking
   * CRITICAL: Rechecks provider availability before creating
   */
  async createBooking(userId, { providerId, serviceId, date, slot, price, customerLocation }) {
    // 1. Validate service exists
    const service = await Service.findById(serviceId);
    if (!service || !service.isActive) {
      throw AppError.notFound('Service not found or is inactive.');
    }

    // 2. Validate provider exists and is available
    const provider = await providerRepository.findById(providerId);
    if (!provider) {
      throw AppError.notFound('Provider not found.');
    }

    if (!provider.isAvailable || !provider.isVerified) {
      throw AppError.badRequest('Provider is not currently available.');
    }

    // 3. ❗ CRITICAL: Recheck for double booking
    const hasConflict = await bookingRepository.hasActiveBooking(providerId, date, slot);
    if (hasConflict) {
      throw AppError.conflict(
        'This provider is already booked for the requested date and time slot. Please try a different slot or run auto-match again.'
      );
    }

    // 4. Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + config.booking.expiryMinutes);

    // 5. Create booking
    const booking = await bookingRepository.create({
      userId,
      providerId,
      serviceId,
      date: new Date(date),
      slot,
      price,
      status: BOOKING_STATUS.PENDING,
      expiresAt,
      customerLocation: customerLocation ? {
        type: 'Point',
        coordinates: customerLocation.coordinates,
        address: customerLocation.address || '',
      } : undefined
    });

    logger.info(`📝 Booking created: ${booking._id} | User: ${userId} | Provider: ${providerId} | Expires: ${expiresAt}`);

    // Return populated booking
    return bookingRepository.findById(booking._id);
  }

  /**
   * Create a new instant booking (broadcast to candidates)
   */
  async createInstantBooking(userId, { serviceId, location, customerLocation }) {
    // 1. Validate service exists
    const service = await Service.findById(serviceId);
    if (!service || !service.isActive) {
      throw AppError.notFound('Service not found or is inactive.');
    }

    // 2. Find top 3–5 providers
    // TODO: When Socket.IO is implemented, we should also filter by `isOnline: true`
    let availableProviders;
    const activeLocation = customerLocation || location;
    if (activeLocation && activeLocation.coordinates) {
      availableProviders = await providerRepository.findNearbyBySkills(
        service.requiredSkills,
        activeLocation.coordinates,
        service.searchRadiusKm
      );
    } else {
      availableProviders = await providerRepository.findAvailableBySkills(service.requiredSkills);
    }

    if (availableProviders.length === 0) {
      throw AppError.notFound('No providers are currently available for this service. Please try again later.');
    }

    // Take top 5 candidates
    const topCandidates = availableProviders.slice(0, 5);
    const candidateProviders = topCandidates.map((p) => p._id);
    const candidateUserIds = topCandidates.map((p) => p.userId._id.toString());

    // Calculate price with distance if applicable
    let price = service.basePrice;
    if (activeLocation && service.pricePerKm > 0 && availableProviders.length > 0) {
      const nearestProvider = availableProviders[0];
      if (nearestProvider.location?.coordinates) {
        const geoService = require('../../shared/utils/geo.service');
        const distanceInfo = await geoService.getDistanceAndETA(
          activeLocation.coordinates,
          nearestProvider.location.coordinates
        );
        if (distanceInfo) {
          price = service.basePrice + geoService.calculateDistancePrice(distanceInfo.distanceKm, service.pricePerKm);
        }
      }
    }

    // 3. Create booking
    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + 60000); // 60 seconds from now

    const booking = await bookingRepository.create({
      userId,
      serviceId,
      candidateProviders,
      type: 'INSTANT',
      price,
      status: BOOKING_STATUS.REQUESTED,
      requestedAt,
      expiresAt,
      customerLocation: activeLocation ? {
        type: 'Point',
        coordinates: activeLocation.coordinates,
        address: activeLocation.address || '',
      } : undefined
    });

    logger.info(`⚡ Instant Booking created: ${booking._id} | User: ${userId} | Candidates: ${candidateProviders.length}`);

    const populatedBooking = await bookingRepository.findById(booking._id);
    
    return {
      booking: populatedBooking,
      candidateUserIds,
    };
  }

  /**
   * Get all bookings for a customer
   */
  async getUserBookings(userId, status) {
    const filters = {};
    if (status) {
      filters.status = status;
    }
    return bookingRepository.findByUserId(userId, filters);
  }

  /**
   * Get a single booking detail for a customer
   */
  async getBookingById(userId, bookingId) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    if (booking.userId._id.toString() !== userId.toString()) {
      throw AppError.forbidden('You do not have access to this booking.');
    }

    const isExpiredBooking =
      [BOOKING_STATUS.PENDING, BOOKING_STATUS.REQUESTED].includes(booking.status) &&
      booking.expiresAt &&
      new Date() > booking.expiresAt;

    if (isExpiredBooking) {
      await bookingRepository.updateById(bookingId, { status: BOOKING_STATUS.EXPIRED });
      booking.status = BOOKING_STATUS.EXPIRED;
    }

    return booking;
  }

  // ─────────────────────────────────────────────────────────
  //  WORKER APIs
  // ─────────────────────────────────────────────────────────

  /**
   * Get bookings assigned to a worker (including instant booking candidates)
   */
  async getWorkerBookings(providerId, status) {
    const filters = {};
    if (status) {
      filters.status = status;
    }

    // First, auto-expire any stale bookings that have passed their expiresAt
    await this._expireStaleBookings(providerId);

    // Get regular bookings assigned to this provider
    const assignedBookings = await bookingRepository.findByProviderId(providerId, filters);

    // Get instant bookings where this provider is a candidate
    const instantBookings = await this._getInstantBookingCandidates(providerId, status);

    // Combine and return unique bookings
    const allBookings = [...assignedBookings, ...instantBookings];
    return allBookings;
  }

  /**
   * Get instant bookings where the provider is a candidate
   */
  async _getInstantBookingCandidates(providerId, status) {
    const BookingModel = require('./booking.model');
    const filters = {
      type: 'INSTANT',
      candidateProviders: providerId,
      status: BOOKING_STATUS.REQUESTED, // Only show active instant booking requests
    };

    if (status) {
      filters.status = status;
    }

    filters.expiresAt = { $gt: new Date() };

    return BookingModel.find(filters)
      .populate('userId', 'name email phone')
      .populate('serviceId', 'name basePrice duration')
      .sort({ createdAt: -1 });
  }

  /**
   * Accept a booking
   * CRITICAL: Validates ownership, not expired, valid transition
   */
  async acceptBooking(providerId, bookingId) {
    const booking = await bookingRepository.findById(bookingId);

    // 1. Validate booking exists
    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    // ─────────────────────────────────────────────────────────
    // INSTANT BOOKING ACCEPTANCE FLOW (Atomic)
    // ─────────────────────────────────────────────────────────
    if (booking.type === 'INSTANT') {
      // Ensure worker is in candidateProviders
      // Note: candidateProviders might be populated objects, so check p._id or p depending on if it's populated
      if (!booking.candidateProviders.some((p) => (p._id ? p._id.toString() : p.toString()) === providerId.toString())) {
        throw AppError.forbidden('You are not authorized to accept this instant booking.');
      }

      // Check expiry
      if (booking.status === BOOKING_STATUS.REQUESTED && booking.expiresAt < new Date()) {
        await bookingRepository.updateById(bookingId, { status: BOOKING_STATUS.EXPIRED });
        throw AppError.gone('This booking request has expired.');
      }

      // Perform atomic update
      const otp = this._generateOtp();
      const BookingModel = require('./booking.model'); // Require here to avoid circular dep if any, or just use it
      const updated = await BookingModel.findOneAndUpdate(
        { _id: bookingId, status: BOOKING_STATUS.REQUESTED },
        { 
          status: BOOKING_STATUS.ACCEPTED,
          providerId,
          acceptedAt: new Date(),
          expiresAt: null,
          completionOtp: otp,
        },
        { new: true }
      ).populate('userId', 'name email phone')
       .populate('serviceId', 'name basePrice duration');

      if (!updated) {
        throw AppError.gone('This booking has already been accepted by another provider or has expired.');
      }

      logger.info(`✅ Instant Booking accepted: ${bookingId} by provider: ${providerId} | OTP: ${otp}`);
      
      // Return populated candidate userIds for notifications
      // booking.candidateProviders is already populated by findById
      const candidateUserIds = booking.candidateProviders.map(p => {
        if (p.userId && p.userId._id) return p.userId._id.toString();
        if (p.userId) return p.userId.toString();
        return null;
      }).filter(Boolean);

      return { booking: updated, candidateUserIds, type: 'INSTANT' };
    }

    // ─────────────────────────────────────────────────────────
    // SCHEDULED BOOKING ACCEPTANCE FLOW
    // ─────────────────────────────────────────────────────────
    // 2. Validate ownership
    if (booking.providerId && booking.providerId._id.toString() !== providerId.toString()) {
      throw AppError.forbidden('This booking is not assigned to you.');
    }

    // 3. ❗ Check expiry
    if (booking.isExpired) {
      await bookingRepository.updateById(bookingId, { status: BOOKING_STATUS.EXPIRED });
      throw AppError.gone('This booking has expired and can no longer be accepted.');
    }

    // 4. Validate status transition
    this._validateTransition(booking.status, BOOKING_STATUS.ACCEPTED);

    // 5. Atomically update booking — generate OTP for completion verification
    const otp = this._generateOtp();
    const BookingModel = require('./booking.model');
    const updated = await BookingModel.findOneAndUpdate(
      {
        _id: bookingId,
        providerId,
        status: BOOKING_STATUS.PENDING,
      },
      {
        status: BOOKING_STATUS.ACCEPTED,
        acceptedAt: new Date(),
        expiresAt: null,
        completionOtp: otp,
      },
      { new: true }
    )
      .populate('userId', 'name email phone')
      .populate('serviceId', 'name basePrice duration')
      .populate({
        path: 'providerId',
        select: 'userId skills rating',
        populate: { path: 'userId', select: 'name email phone' },
      });

    if (!updated) {
      throw AppError.gone('This booking has already been updated or is no longer available to accept.');
    }

    logger.info(`✅ Booking accepted: ${bookingId} by provider: ${providerId} | OTP: ${otp}`);

    return { booking: updated, type: 'SCHEDULED' };
  }

  /**
   * Reject a booking
   */
  async rejectBooking(providerId, bookingId) {
    const booking = await bookingRepository.findById(bookingId);

    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    if (booking.providerId._id.toString() !== providerId.toString()) {
      throw AppError.forbidden('This booking is not assigned to you.');
    }

    this._validateTransition(booking.status, BOOKING_STATUS.REJECTED);

    const BookingModel = require('./booking.model');
    const updated = await BookingModel.findOneAndUpdate(
      {
        _id: bookingId,
        providerId,
        status: booking.status,
      },
      {
        status: BOOKING_STATUS.REJECTED,
        rejectedAt: new Date(),
        expiresAt: null,
      },
      { new: true }
    )
      .populate('userId', 'name email phone')
      .populate('serviceId', 'name basePrice duration')
      .populate({
        path: 'providerId',
        select: 'userId skills rating',
        populate: { path: 'userId', select: 'name email phone' },
      });

    if (!updated) {
      throw AppError.gone('This booking has already been updated or is no longer available to reject.');
    }

    logger.info(`❌ Booking rejected: ${bookingId} by provider: ${providerId}`);

    return updated;
  }

  /**
   * Mark a completed booking as paid by cash.
   */
  async payBookingByCash(userId, bookingId, { io, socketStore } = {}) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    if (booking.userId._id.toString() !== userId.toString()) {
      throw AppError.forbidden('You do not have access to this booking.');
    }

    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw AppError.badRequest('Booking is not marked as completed yet. Cash payment can only be recorded on completion.');
    }

    if (booking.paymentStatus === 'paid') {
      return booking;
    }

    const Payment = require('../payment/payment.model');
    await Payment.create({
      bookingId: booking._id,
      userId: booking.userId._id,
      orderId: `cash_${booking._id.toString()}_${Date.now()}`,
      amount: booking.price,
      status: 'paid',
      method: 'cash',
      paidAt: new Date(),
    });

    return this.finalizePayment(bookingId, { io, socketStore, paymentMethod: 'cash' });
  }

  /**
   * Get the completion OTP for a booking (customer-only)
   */
  async getCompletionOtp(userId, bookingId) {
    const BookingModel = require('./booking.model');
    const booking = await BookingModel.findById(bookingId).select('+completionOtp');
    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }
    if (booking.userId.toString() !== userId.toString()) {
      throw AppError.forbidden('You do not have access to this booking.');
    }
    if (booking.status !== BOOKING_STATUS.ACCEPTED) {
      throw AppError.badRequest('OTP is only available for accepted bookings.');
    }
    if (!booking.completionOtp) {
      throw AppError.notFound('OTP not yet generated for this booking.');
    }
    return { otp: booking.completionOtp, bookingId };
  }

  /**
   * Complete a booking — requires OTP verification
   * Only allowed if booking is in ACCEPTED status
   */
  async completeBooking(providerId, bookingId, otp) {
    const BookingModel = require('./booking.model');
    const booking = await BookingModel.findById(bookingId).select('+completionOtp');

    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    if (booking.providerId.toString() !== providerId.toString()) {
      throw AppError.forbidden('This booking is not assigned to you.');
    }

    this._validateTransition(booking.status, BOOKING_STATUS.COMPLETED);

    // ── OTP Verification ──────────────────────────────────────
    if (!booking.completionOtp) {
      throw AppError.badRequest('No OTP was generated for this booking. Please contact support.');
    }
    if (!otp || otp.trim() !== booking.completionOtp) {
      throw AppError.badRequest('Invalid OTP. Please ask the customer for the correct code.');
    }

    const updated = await bookingRepository.updateById(bookingId, {
      status: BOOKING_STATUS.COMPLETED,
      completedAt: new Date(),
      otpVerifiedAt: new Date(),
    });

    // Increment provider's total jobs
    await providerRepository.incrementTotalJobs(providerId);

    logger.info(`🎉 Booking completed: ${bookingId} by provider: ${providerId} (OTP verified)`);

    return updated;
  }

  /**
   * Initiate Cashfree Payment for a COMPLETED booking
   */
  async payBooking(userId, bookingId) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    if (booking.userId._id.toString() !== userId.toString()) {
      throw AppError.forbidden('You do not have access to this booking.');
    }

    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw AppError.badRequest('Booking is not marked as completed yet. Payment can only be made on completion.');
    }

    if (booking.paymentStatus === 'paid') {
      throw AppError.badRequest('Booking has already been paid.');
    }

    // Require paymentService here to avoid circular dependencies
    const paymentService = require('../payment/payment.service');
    const payment = await paymentService.createPaymentOrder(booking);

    // Update booking's payment status to pending
    await bookingRepository.updateById(bookingId, {
      paymentStatus: 'pending',
      paymentMethod: 'cashfree',
    });

    return payment;
  }

  /**
   * Finalize the payment status of a booking to 'paid'
   */
  async finalizePayment(bookingId, { io, socketStore, paymentMethod = 'cashfree' } = {}) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw AppError.notFound('Booking not found during payment finalization.');
    }

    if (booking.paymentStatus === 'paid') {
      return booking;
    }

    const updated = await bookingRepository.updateById(bookingId, {
      paymentStatus: 'paid',
      paymentMethod,
      paidAt: new Date(),
    });
    logger.info(`💳 Booking ${bookingId} payment finalized to 'paid'`);

    // Notify customer and worker via Socket.IO if available
    if (io && socketStore) {
      try {
        // Customer
        const customerSocketId = await socketStore.get(booking.userId._id.toString());
        if (customerSocketId) {
          io.to(customerSocketId).emit('booking-paid', {
            bookingId: booking._id,
            status: booking.status,
            paymentStatus: 'paid',
            paymentMethod,
          });
        }

        // Provider/Worker
        if (booking.providerId && booking.providerId.userId) {
          const providerUserId = booking.providerId.userId._id.toString();
          const providerSocketId = await socketStore.get(providerUserId);
          if (providerSocketId) {
            io.to(providerSocketId).emit('booking-paid', {
              bookingId: booking._id,
              status: booking.status,
              paymentStatus: 'paid',
              paymentMethod,
            });
          }
        }
      } catch (err) {
        logger.error('Error emitting booking-paid socket events:', err);
      }
    }

    return updated;
  }

  // ─────────────────────────────────────────────────────────
  //  PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Validate that a status transition is allowed
   * @private
   */
  _validateTransition(currentStatus, newStatus) {
    const allowedTransitions = BOOKING_TRANSITIONS[currentStatus];

    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw AppError.badRequest(
        `Cannot transition booking from '${currentStatus}' to '${newStatus}'. ` +
        `Allowed transitions: ${allowedTransitions ? allowedTransitions.join(', ') : 'none'}`
      );
    }
  }

  /**
   * Auto-expire stale pending bookings for a provider
   * @private
   */
  async _expireStaleBookings(providerId) {
    try {
      const expiredScheduled = await bookingRepository.findExpiredPending();
      const scheduledForProvider = expiredScheduled.filter(
        (b) => b.providerId.toString() === providerId.toString()
      );

      const expiredRequested = await bookingRepository.findExpiredRequestedForProvider(providerId);

      const allExpired = [...scheduledForProvider, ...expiredRequested];
      if (allExpired.length > 0) {
        const ids = allExpired.map((b) => b._id);
        await bookingRepository.markExpired(ids);
        logger.info(`⏰ Auto-expired ${ids.length} stale bookings for provider: ${providerId}`);
      }
    } catch (error) {
      logger.error('Error expiring stale bookings:', error);
    }
  }
}

module.exports = new BookingService();
