/**
 * src/modules/review/review.repository.js — Review Data Access Layer
 */

const Review = require('./review.model');

class ReviewRepository {
  async create(data) {
    return Review.create(data);
  }

  async findByBookingId(bookingId) {
    return Review.findOne({ bookingId });
  }

  async findByProviderId(providerId) {
    return Review.find({ providerId })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });
  }

  async getProviderAverageRating(providerId) {
    const result = await Review.aggregate([
      { $match: { providerId } },
      {
        $group: {
          _id: '$providerId',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);
    return result[0] || { averageRating: 0, totalReviews: 0 };
  }
}

module.exports = new ReviewRepository();
