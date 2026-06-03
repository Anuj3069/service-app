/**
 * src/modules/service/service.repository.js — Service Data Access Layer
 */

const { Category, Service } = require('./service.model');

class ServiceRepository {
  /**
   * Get all active categories with their services
   */
  async findAllCategoriesWithServices() {
    return Category.find({ isActive: true })
      .populate({
        path: 'services',
        match: { isActive: true },
        select: 'name description basePrice duration requiredSkills',
      })
      .sort({ name: 1 });
  }

  /**
   * Find a service by ID
   */
  async findServiceById(id) {
    return Service.findById(id).populate('category', 'name icon');
  }

  /**
   * Find services by category
   */
  async findServicesByCategory(categoryId) {
    return Service.find({ category: categoryId, isActive: true })
      .populate('category', 'name icon')
      .sort({ name: 1 });
  }

  /**
   * Create a category
   */
  async createCategory(data) {
    return Category.create(data);
  }

  /**
   * Create a service
   */
  async createService(data) {
    return Service.create(data);
  }

  /**
   * Bulk create categories
   */
  async bulkCreateCategories(data) {
    return Category.insertMany(data);
  }

  /**
   * Bulk create services
   */
  async bulkCreateServices(data) {
    return Service.insertMany(data);
  }

  /**
   * Update category
   */
  async updateCategory(id, updateData) {
    return Category.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }

  /**
   * Update service
   */
  async updateService(id, updateData) {
    return Service.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }
}

module.exports = new ServiceRepository();
