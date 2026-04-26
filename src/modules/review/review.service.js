/**
 * src/modules/review/review.service.js — Review Business Logic
 */

const AppError = require('../../shared/utils/api-error');
const { BOOKING_STATUS } = require('../../shared/utils/constants');
const reviewRepository = require('./review.repository');
const bookingRepository = require('../booking/booking.repository');
const providerRepository = require('../provider/provider.repository');

class ReviewService {
  /**
   * Submit a review for a completed booking
   */
  async createReview(userId, { bookingId, rating, comment }) {
    // 1. Get booking
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    // 2. Verify booking belongs to this user
    if (booking.userId._id.toString() !== userId.toString()) {
      throw AppError.forbidden('You can only review your own bookings.');
    }

    // 3. Verify booking is completed
    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw AppError.badRequest('You can only review completed bookings.');
    }

    // 4. Check if already reviewed
    const existingReview = await reviewRepository.findByBookingId(bookingId);
    if (existingReview) {
      throw AppError.conflict('You have already reviewed this booking.');
    }

    // 5. Create review
    const review = await reviewRepository.create({
      bookingId,
      userId,
      providerId: booking.providerId._id,
      rating,
      comment,
    });

    // 6. Update provider rating
    const { averageRating, totalReviews } = await reviewRepository.getProviderAverageRating(
      booking.providerId._id
    );
    await providerRepository.updateRating(
      booking.providerId._id,
      Math.round(averageRating * 10) / 10,
      totalReviews
    );

    return review;
  }
}

module.exports = new ReviewService();
