/**
 * src/modules/address/address.repository.js — Address Data Access Layer
 *
 * CRUD operations for saved addresses.
 * Handles default address toggling atomically.
 */

const Address = require('./address.model');

class AddressRepository {
  /**
   * Create a new address
   */
  async create(data) {
    return Address.create(data);
  }

  /**
   * Find all addresses for a user (default first, then by creation date)
   */
  async findByUserId(userId) {
    return Address.find({ userId })
      .sort({ isDefault: -1, createdAt: -1 });
  }

  /**
   * Find a single address by ID
   */
  async findById(id) {
    return Address.findById(id);
  }

  /**
   * Update an address by ID
   */
  async updateById(id, data) {
    return Address.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Delete an address by ID
   */
  async deleteById(id) {
    return Address.findByIdAndDelete(id);
  }

  /**
   * Get the default address for a user
   */
  async getDefault(userId) {
    return Address.findOne({ userId, isDefault: true });
  }

  /**
   * Set an address as default (atomic: unset all others, set this one)
   */
  async setDefault(userId, addressId) {
    // Unset all defaults for this user
    await Address.updateMany(
      { userId, isDefault: true },
      { isDefault: false }
    );
    // Set the specified address as default
    return Address.findOneAndUpdate(
      { _id: addressId, userId },
      { isDefault: true },
      { new: true }
    );
  }

  /**
   * Count addresses for a user
   */
  async countByUserId(userId) {
    return Address.countDocuments({ userId });
  }
}

module.exports = new AddressRepository();
