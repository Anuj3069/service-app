/**
 * src/modules/provider/provider.repository.js — Provider Data Access Layer
 */

const Provider = require('./provider.model');

class ProviderRepository {
  /**
   * Create a new provider profile
   */
  async create(data) {
    return Provider.create(data);
  }

  /**
   * Find provider profile by user ID
   */
  async findByUserId(userId) {
    return Provider.findOne({ userId }).populate('userId', 'name email phone');
  }

  /**
   * Find provider by its own ID
   */
  async findById(id) {
    return Provider.findById(id).populate('userId', 'name email phone');
  }

  /**
   * Update provider profile
   */
  async updateByUserId(userId, updateData) {
    return Provider.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('userId', 'name email phone');
  }

  /**
   * Find providers by skills who are verified and available
   * Used by the matching algorithm
   */
  async findAvailableBySkills(skills) {
    return Provider.find({
      skills: { $in: skills },
      isVerified: true,
      isAvailable: true,
    })
      .populate('userId', 'name email phone')
      .sort({ rating: -1, totalJobs: -1 });
  }

  /**
   * Check if a provider profile exists for a user
   */
  async existsByUserId(userId) {
    const count = await Provider.countDocuments({ userId });
    return count > 0;
  }

  /**
   * Increment total jobs count
   */
  async incrementTotalJobs(providerId) {
    return Provider.findByIdAndUpdate(providerId, {
      $inc: { totalJobs: 1 },
    });
  }

  /**
   * Update provider rating
   */
  async updateRating(providerId, newRating, totalReviews) {
    return Provider.findByIdAndUpdate(providerId, {
      rating: newRating,
      totalReviews,
    });
  }
}

module.exports = new ProviderRepository();
