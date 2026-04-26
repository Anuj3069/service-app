/**
 * src/modules/match/match.service.js — Auto-Match Algorithm (⭐ Core Feature)
 *
 * Matches a customer's service request to the best available provider.
 *
 * Algorithm:
 * 1. Fetch service → get requiredSkills
 * 2. Find verified & available providers with matching skills
 * 3. Check each provider's weekly availability for requested day + slot
 * 4. Query existing bookings to filter out busy providers (providerId + date + slot)
 * 5. Sort by rating (desc), totalJobs (desc)
 * 6. Return best match with price estimate
 */

const AppError = require('../../shared/utils/api-error');
const { Service } = require('../service/service.model');
const providerRepository = require('../provider/provider.repository');
const bookingRepository = require('../booking/booking.repository');
const { BOOKING_STATUS } = require('../../shared/utils/constants');
const logger = require('../../config/logger');

class MatchService {
  /**
   * Find the best available provider for a service request
   *
   * @param {object} matchRequest - { serviceId, date, slot }
   * @returns {object} { provider, price, estimatedDuration }
   */
  async findMatch({ serviceId, date, slot }) {
    // 1. Get service details and required skills
    const service = await Service.findById(serviceId);
    if (!service) {
      throw AppError.notFound('Service not found.');
    }

    if (!service.isActive) {
      throw AppError.badRequest('This service is currently unavailable.');
    }

    logger.info(`🔍 Matching for service: ${service.name}, skills: [${service.requiredSkills}]`);

    // 2. Find providers with matching skills who are verified + online
    const providers = await providerRepository.findAvailableBySkills(service.requiredSkills);

    if (providers.length === 0) {
      throw AppError.notFound('No providers available for this service at the moment.');
    }

    logger.info(`📋 Found ${providers.length} providers with matching skills`);

    // 3. Parse the requested date to get the day of week
    const requestedDate = new Date(date);
    const dayOfWeek = this._getDayOfWeek(requestedDate);

    // 4. Filter providers by their weekly availability schedule
    const availableProviders = providers.filter((provider) => {
      return this._isProviderAvailableOnDay(provider, dayOfWeek, slot);
    });

    if (availableProviders.length === 0) {
      throw AppError.notFound(
        'No providers available for the requested date and time slot. Please try a different slot.'
      );
    }

    logger.info(`📅 ${availableProviders.length} providers available on ${dayOfWeek} at ${slot}`);

    // 5. Check existing bookings to filter out busy providers
    const providerIds = availableProviders.map((p) => p._id);
    const activeStatuses = [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED];

    const existingBookings = await bookingRepository.findBookingsForProviders(
      providerIds,
      date,
      slot,
      activeStatuses
    );

    // Create a set of busy provider IDs
    const busyProviderIds = new Set(
      existingBookings.map((b) => b.providerId.toString())
    );

    const freeProviders = availableProviders.filter(
      (p) => !busyProviderIds.has(p._id.toString())
    );

    if (freeProviders.length === 0) {
      throw AppError.notFound(
        'All matching providers are currently booked for this slot. Please try a different time.'
      );
    }

    logger.info(`✅ ${freeProviders.length} providers free after booking check`);

    // 6. Select the best provider (already sorted by rating desc, totalJobs desc)
    const bestProvider = freeProviders[0];

    // 7. Calculate price (base price from service)
    const price = service.basePrice;

    return {
      provider: {
        id: bestProvider._id,
        name: bestProvider.userId?.name || 'Provider',
        rating: bestProvider.rating,
        totalJobs: bestProvider.totalJobs,
        isVerified: bestProvider.isVerified,
      },
      service: {
        id: service._id,
        name: service.name,
      },
      price,
      estimatedDuration: service.duration,
      date,
      slot,
    };
  }

  /**
   * Get the day of week string from a Date
   * @private
   */
  _getDayOfWeek(date) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  }

  /**
   * Check if a provider has the requested slot on the given day
   * @private
   */
  _isProviderAvailableOnDay(provider, dayOfWeek, slot) {
    if (!provider.availability || provider.availability.length === 0) {
      // If no availability set, assume available (flexible provider)
      return true;
    }

    const daySchedule = provider.availability.find(
      (a) => a.dayOfWeek === dayOfWeek
    );

    if (!daySchedule) {
      return false;
    }

    return daySchedule.slots.includes(slot);
  }
}

module.exports = new MatchService();
