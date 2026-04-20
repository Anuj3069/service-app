/**
 * src/modules/auth/auth.service.js — Authentication Business Logic
 *
 * Handles registration, login, and JWT token generation.
 */

const jwt = require('jsonwebtoken');
const config = require('../../config');
const AppError = require('../../shared/utils/api-error');
const authRepository = require('./auth.repository');

class AuthService {
  /**
   * Register a new user
   * @param {object} userData - { name, email, phone, password, role }
   * @returns {object} { user, tokens }
   */
  async register(userData) {
    // 1. Check if email already exists
    const exists = await authRepository.emailExists(userData.email);
    if (exists) {
      throw AppError.conflict('A user with this email already exists.');
    }

    // 2. Create user
    const user = await authRepository.create(userData);

    // 3. Generate tokens
    const tokens = this.generateTokens(user);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tokens,
    };
  }

  /**
   * Login with email and password
   * @param {string} email
   * @param {string} password
   * @returns {object} { user, tokens }
   */
  async login(email, password) {
    // 1. Find user with password
    const user = await authRepository.findByEmail(email);
    if (!user) {
      throw AppError.unauthorized('Invalid email or password.');
    }

    // 2. Check if account is active
    if (!user.isActive) {
      throw AppError.forbidden('Your account has been deactivated. Please contact support.');
    }

    // 3. Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password.');
    }

    // 4. Generate tokens
    const tokens = this.generateTokens(user);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tokens,
    };
  }

  /**
   * Generate access + refresh token pair
   * @param {object} user - User document
   * @returns {object} { accessToken, refreshToken }
   */
  generateTokens(user) {
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });

    return { accessToken, refreshToken };
  }
}

module.exports = new AuthService();
