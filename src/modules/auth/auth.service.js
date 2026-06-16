/**
 * src/modules/auth/auth.service.js — Authentication Business Logic
 *
 * Handles registration, login, and JWT token generation.
 */

const jwt = require('jsonwebtoken');
const config = require('../../config');
const AppError = require('../../shared/utils/api-error');
const authRepository = require('./auth.repository');
const { ROLES } = require('../../shared/utils/constants');

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
   * @param {string} [expectedRole] - Optional role expected by the requesting app
   * @returns {object} { user, tokens }
   */
  async login(email, password, expectedRole) {
    // 1. Find user with password
    const user = await authRepository.findByEmail(email);
    if (!user) {
      throw AppError.unauthorized('Invalid email or password.');
    }

    // 2. Check if account is active
    if (!user.isActive) {
      throw AppError.forbidden('Your account has been deactivated. Please contact support.');
    }

    // 3. Force OTP login for customers
    if (user.role === ROLES.CUSTOMER) {
      throw AppError.forbidden('Password-based login is disabled for customers. Please use OTP login.');
    }

    // 4. Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password.');
    }

    // 5. Validate expected role (if provided)
    if (expectedRole && user.role !== expectedRole) {
      throw AppError.forbidden(`Access denied. This account is registered as a ${user.role}, please use the correct app to log in.`);
    }

    // 6. Generate tokens
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
   * Send OTP to customer's email
   * @param {string} email
   * @returns {Promise<object>}
   */
  async sendOtp(email) {
    // 1. Find user (if exists)
    const user = await authRepository.findByEmail(email);
    if (user) {
      // Check if user is a customer
      if (user.role !== ROLES.CUSTOMER) {
        throw AppError.forbidden('OTP login is only available for customer accounts.');
      }

      // Check if account is active
      if (!user.isActive) {
        throw AppError.forbidden('Your account has been deactivated. Please contact support.');
      }
    }

    // 2. Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Store OTP in Redis
    const redisKey = `otp:customer:${email}`;
    const otpTtl = 300; // 5 minutes in seconds
    const redisClient = require('../../config/redis').getRedisClient();
    await redisClient.set(redisKey, otp, 'EX', otpTtl);

    // 4. Send email via SendGrid utility
    const { sendEmail } = require('../../shared/utils/email');
    await sendEmail({
      to: email,
      subject: 'Your OTP for Customer Login',
      text: `Your OTP for login is: ${otp}. It is valid for 5 minutes.`,
      html: `<p>Your OTP for login is: <strong>${otp}</strong>. It is valid for 5 minutes.</p>`,
    });

    return { message: 'OTP sent successfully.' };
  }

  /**
   * Verify OTP and complete login (auto-registers new customers)
   * @param {string} email
   * @param {string} otp
   * @returns {Promise<object>} { user, tokens }
   */
  async verifyOtp(email, otp) {
    // 1. Retrieve OTP from Redis
    const redisKey = `otp:customer:${email}`;
    const redisClient = require('../../config/redis').getRedisClient();
    const storedOtp = await redisClient.get(redisKey);

    if (!storedOtp) {
      throw AppError.unauthorized('OTP has expired or is invalid.');
    }

    // 2. Verify OTP match
    if (storedOtp !== otp) {
      throw AppError.unauthorized('Invalid OTP.');
    }

    // 3. Delete OTP from Redis
    await redisClient.del(redisKey);

    // 4. Find user or register them
    let user = await authRepository.findByEmail(email);

    if (user) {
      // Check if user is a customer
      if (user.role !== ROLES.CUSTOMER) {
        throw AppError.forbidden('OTP login is only available for customer accounts.');
      }

      // Check if account is active
      if (!user.isActive) {
        throw AppError.forbidden('Your account has been deactivated. Please contact support.');
      }
    } else {
      // Auto-register new customer
      const name = email.split('@')[0]
        .split(/[._-]/)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');

      const randomPassword = require('crypto').randomBytes(16).toString('hex');

      user = await authRepository.create({
        name,
        email,
        password: randomPassword,
        role: ROLES.CUSTOMER,
        isActive: true
      });
    }

    // 5. Generate tokens
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

  /**
   * Refresh the access token
   * @param {string} token - The refresh token
   * @returns {object} { user, tokens }
   */
  async refreshToken(token) {
    if (!token) {
      throw AppError.unauthorized('Refresh token is missing.');
    }

    try {
      // 1. Verify token
      const decoded = jwt.verify(token, config.jwt.refreshSecret);

      // 2. Fetch user to ensure they still exist and are active
      const user = await authRepository.findById(decoded.id);
      if (!user || !user.isActive) {
        throw AppError.unauthorized('User not found or deactivated.');
      }

      // 3. Generate new tokens
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
    } catch (error) {
      throw AppError.unauthorized('Invalid or expired refresh token.');
    }
  }

  /**
   * Request password reset token
   * @param {string} email
   * @returns {Promise<object>}
   */
  async forgotPassword(email) {
    // 1. Find user by email
    const user = await authRepository.findByEmail(email);
    if (!user) {
      // Return success message anyway to prevent user enumeration
      return { message: 'If the email exists, a password reset link has been sent.' };
    }

    // 2. Reject if customer
    if (user.role === ROLES.CUSTOMER) {
      throw AppError.badRequest('Customers use OTP login and do not require a password reset.');
    }

    // 3. Reject if user deactivated
    if (!user.isActive) {
      throw AppError.forbidden('Your account has been deactivated. Please contact support.');
    }

    // 4. Generate secure token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    // 5. Save in Redis with 10-minute expiry (600 seconds)
    const redisKey = `password-reset:token:${token}`;
    const redisClient = require('../../config/redis').getRedisClient();
    await redisClient.set(redisKey, email, 'EX', 600);

    // 6. Send email with reset token
    const { sendEmail } = require('../../shared/utils/email');
    const resetLink = `http://localhost:3000/api/v1/auth/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Please use the following link or token to reset your password: ${resetLink}. It is valid for 10 minutes.`,
      html: `<p>You requested a password reset. Please click the link below or use the token to reset your password:</p>
             <p><a href="${resetLink}">${resetLink}</a></p>
             <p>Reset Token: <strong>${token}</strong></p>
             <p>This link is valid for 10 minutes.</p>`,
    });

    return { message: 'If the email exists, a password reset link has been sent.' };
  }

  /**
   * Reset password using token
   * @param {string} token
   * @param {string} newPassword
   * @returns {Promise<object>}
   */
  async resetPassword(token, newPassword) {
    // 1. Retrieve email from Redis
    const redisKey = `password-reset:token:${token}`;
    const redisClient = require('../../config/redis').getRedisClient();
    const email = await redisClient.get(redisKey);

    if (!email) {
      throw AppError.badRequest('Password reset token is invalid or has expired.');
    }

    // 2. Fetch user
    const user = await authRepository.findByEmail(email);
    if (!user || !user.isActive) {
      throw AppError.unauthorized('User not found or deactivated.');
    }

    // 3. Update password (pre-save hook hashes it)
    user.password = newPassword;
    await user.save();

    // 4. Delete token from Redis
    await redisClient.del(redisKey);

    return { message: 'Password has been reset successfully.' };
  }
}

module.exports = new AuthService();
