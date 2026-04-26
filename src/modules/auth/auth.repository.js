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
}

module.exports = new AuthRepository();
