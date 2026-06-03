/**
 * src/modules/auth/auth.repository.js — User Data Access Layer
 *
 * Encapsulates all database queries for the User model.
 */

const User = require('./auth.model');

class AuthRepository {
  /**
   * Create a new user
   */
  async create(userData) {
    return User.create(userData);
  }

  /**
   * Find user by email (includes password for auth)
   */
  async findByEmail(email) {
    return User.findOne({ email }).select('+password');
  }

  /**
   * Find user by ID (excludes password)
   */
  async findById(id) {
    return User.findById(id);
  }

  /**
   * Check if email already exists
   */
  async emailExists(email) {
    const count = await User.countDocuments({ email });
    return count > 0;
  }

  /**
   * Find users with filters and pagination
   */
  async findAll(filters = {}, pagination = {}) {
    const { page = 1, limit = 20, sort = '-createdAt' } = pagination;
    const skip = (page - 1) * limit;

    const query = {};
    if (filters.role) query.role = filters.role;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const items = await User.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    return { items, total, page, limit };
  }

  /**
   * Update a user by ID
   */
  async updateById(id, updateData) {
    return User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  }
}

module.exports = new AuthRepository();
