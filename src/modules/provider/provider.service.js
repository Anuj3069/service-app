/**
 * src/modules/provider/provider.service.js — Provider Business Logic
 */

const AppError = require('../../shared/utils/api-error');
const providerRepository = require('./provider.repository');

class ProviderService {
  /**
   * Create a provider profile for a worker user
   */
  async createProfile(userId, profileData) {
    // Check if profile already exists
    const exists = await providerRepository.existsByUserId(userId);
    if (exists) {
      throw AppError.conflict('Provider profile already exists for this user.');
    }

    const provider = await providerRepository.create({
      userId,
      ...profileData,
    });

    return provider;
  }

  /**
   * Get the authenticated worker's profile
   */
  async getProfile(userId) {
    const provider = await providerRepository.findByUserId(userId);
    if (!provider) {
      throw AppError.notFound('Provider profile not found. Please create one first.');
    }
    return provider;
  }

  /**
   * Update provider profile
   */
  async updateProfile(userId, updateData) {
    const provider = await providerRepository.updateByUserId(userId, updateData);
    if (!provider) {
      throw AppError.notFound('Provider profile not found.');
    }
    return provider;
  }
}

module.exports = new ProviderService();
