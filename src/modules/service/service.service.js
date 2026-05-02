/**
 * src/modules/service/service.service.js — Service Business Logic
 *
 * Uses Redis cache for frequently-read service data.
 */

const AppError = require('../../shared/utils/api-error');
const serviceRepository = require('./service.repository');
const cache = require('../../shared/utils/cache');

const CACHE_KEYS = {
  ALL_SERVICES: 'cache:services:all',
  SERVICE_BY_ID: (id) => `cache:service:${id}`,
};

class ServiceService {
  /**
   * Get all services grouped by category
   * Cached for 5 minutes
   */
  async getAllServices() {
    // Check cache first
    const cached = await cache.get(CACHE_KEYS.ALL_SERVICES);
    if (cached) return cached;

    const categories = await serviceRepository.findAllCategoriesWithServices();

    // Store in cache for 5 minutes
    await cache.set(CACHE_KEYS.ALL_SERVICES, categories, 300);

    return categories;
  }

  /**
   * Get a single service by ID
   * Cached for 5 minutes
   */
  async getServiceById(serviceId) {
    // Check cache first
    const cacheKey = CACHE_KEYS.SERVICE_BY_ID(serviceId);
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const service = await serviceRepository.findServiceById(serviceId);
    if (!service) {
      throw AppError.notFound('Service not found.');
    }

    // Store in cache for 5 minutes
    await cache.set(cacheKey, service, 300);

    return service;
  }
}

module.exports = new ServiceService();
