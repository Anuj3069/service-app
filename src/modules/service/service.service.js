/**
 * src/modules/service/service.service.js — Service Business Logic
 */

const AppError = require('../../shared/utils/api-error');
const serviceRepository = require('./service.repository');

class ServiceService {
  /**
   * Get all services grouped by category
   */
  async getAllServices() {
    const categories = await serviceRepository.findAllCategoriesWithServices();
    return categories;
  }

  /**
   * Get a single service by ID
   */
  async getServiceById(serviceId) {
    const service = await serviceRepository.findServiceById(serviceId);
    if (!service) {
      throw AppError.notFound('Service not found.');
    }
    return service;
  }
}

module.exports = new ServiceService();
