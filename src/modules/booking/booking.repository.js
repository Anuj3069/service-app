/**
 * src/modules/booking/booking.repository.js — Booking Data Access Layer
 *
 * All database queries related to bookings.
 */

const Booking = require('./booking.model');

class BookingRepository {
  /**
   * Create a new booking
   */
  async create(data) {
    return Booking.create(data);
  }

  /**
   * Find booking by ID with populated refs
   */
  async findById(id) {
    return Booking.findById(id)
      .populate('userId', 'name email phone')
      .populate('serviceId', 'name basePrice duration')
      .populate({
        path: 'providerId',
        select: 'userId skills rating',
        populate: { path: 'userId', select: 'name email phone' },
      })
      .populate({
        path: 'candidateProviders',
        select: 'userId rating',
        populate: { path: 'userId', select: 'name' },
      });
  }

  /**
   * Find bookings for a customer
   */
  async findByUserId(userId, filters = {}) {
    const query = { userId, ...filters };
    return Booking.find(query)
      .populate('serviceId', 'name basePrice duration')
      .populate({
        path: 'providerId',
        select: 'userId skills rating',
        populate: { path: 'userId', select: 'name phone' },
      })
      .sort({ createdAt: -1 });
  }

  /**
   * Find bookings assigned to a provider
   */
  async findByProviderId(providerId, filters = {}) {
    const query = { providerId, ...filters };
    return Booking.find(query)
      .populate('userId', 'name email phone')
      .populate('serviceId', 'name basePrice duration')
      .sort({ createdAt: -1 });
  }

  /**
   * Update a booking by ID
   */
  async updateById(id, updateData) {
    return Booking.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('userId', 'name email phone')
      .populate('serviceId', 'name basePrice duration')
      .populate({
        path: 'providerId',
        select: 'userId skills rating',
        populate: { path: 'userId', select: 'name email phone' },
      });
  }

  /**
   * Check if a provider already has an active booking for a date + slot
   * Used for double-booking prevention
   */
  async hasActiveBooking(providerId, date, slot) {
    const count = await Booking.countDocuments({
      providerId,
      date,
      slot,
      status: { $in: ['pending', 'accepted'] },
    });
    return count > 0;
  }

  /**
   * Find bookings for multiple providers on a specific date + slot
   * Used by the match algorithm to filter out busy providers
   */
  async findBookingsForProviders(providerIds, date, slot, statuses) {
    return Booking.find({
      providerId: { $in: providerIds },
      date: new Date(date),
      slot,
      status: { $in: statuses },
    }).select('providerId');
  }

  /**
   * Find expired pending bookings (for cleanup job)
   */
  async findExpiredPending() {
    return Booking.find({
      status: 'pending',
      expiresAt: { $lte: new Date() },
    });
  }

  /**
   * Find expired instant bookings (requested status that passed expiresAt)
   */
  async findExpiredRequested() {
    return Booking.find({
      status: 'requested',
      type: 'INSTANT',
      expiresAt: { $lte: new Date() },
    });
  }

  /**
   * Bulk update expired bookings to expired status
   */
  async markExpired(bookingIds) {
    return Booking.updateMany(
      { _id: { $in: bookingIds } },
      { $set: { status: 'expired' } }
    );
  }
}

module.exports = new BookingRepository();
