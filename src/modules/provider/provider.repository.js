/**
 * src/modules/provider/provider.repository.js — Provider Data Access Layer
 *
 * Uses Redis cache for skill-based provider lookups (short TTL).
 */

const Provider = require('./provider.model');
const cache = require('../../shared/utils/cache');

class ProviderRepository {
  /**
   * Create a new provider profile
   * Invalidates provider cache since a new provider is available
   */
  async create(data) {
    const provider = await Provider.create(data);
    await cache.delPattern('cache:providers:*');
    return provider;
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
   * Find multiple providers by their IDs
   */
  async findManyByIds(ids) {
    return Provider.find({ _id: { $in: ids } }).populate('userId', 'name email phone');
  }

  /**
   * Update provider profile
   * Invalidates provider cache since availability/skills may have changed
   */
  async updateByUserId(userId, updateData) {
    const provider = await Provider.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('userId', 'name email phone');
    await cache.delPattern('cache:providers:*');
    return provider;
  }

  /**
   * Find providers by skills who are verified and available
   * Cached for 60 seconds to reduce DB load during high-frequency matching
   */
  async findAvailableBySkills(skills) {
    const cacheKey = `cache:providers:skills:${skills.sort().join(',')}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const providers = await Provider.find({
      skills: { $in: skills },
      isVerified: true,
      isAvailable: true,
    })
      .populate('userId', 'name email phone')
      .sort({ rating: -1, totalJobs: -1 });

    // Cache for 60 seconds (short TTL because provider availability changes frequently)
    await cache.set(cacheKey, providers, 60);

    return providers;
  }

  /**
   * Find nearby providers with matching skills within a radius
   * Uses MongoDB 2dsphere index on provider.location for efficient geo queries
   *
   * Results are automatically sorted by distance (nearest first) thanks to $near
   */
  async findNearbyBySkills(skills, coordinates, radiusKm = 10) {
    const radiusMeters = radiusKm * 1000;
    const cacheKey = `cache:providers:nearby:${coordinates.join(',')}:${radiusKm}:${skills.sort().join(',')}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const providers = await Provider.find({
      skills: { $in: skills },
      isVerified: true,
      isAvailable: true,
      'location.coordinates': { $ne: [0, 0] }, // Skip providers without location
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates, // [longitude, latitude]
          },
          $maxDistance: radiusMeters,
        },
      },
    })
      .populate('userId', 'name email phone')
      .limit(20);

    // Very short TTL — locations change frequently
    await cache.set(cacheKey, providers, 15);
    return providers;
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
    await cache.delPattern('cache:providers:*');
    return Provider.findByIdAndUpdate(providerId, {
      $inc: { totalJobs: 1 },
    });
  }

  /**
   * Update provider rating
   */
  async updateRating(providerId, newRating, totalReviews) {
    await cache.delPattern('cache:providers:*');
    return Provider.findByIdAndUpdate(providerId, {
      rating: newRating,
      totalReviews,
    });
  }
}

module.exports = new ProviderRepository();
