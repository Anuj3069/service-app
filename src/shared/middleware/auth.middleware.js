/**
 * src/shared/middleware/auth.middleware.js — JWT Authentication & Authorization
 *
 * authenticate: Verifies JWT token from Authorization header
 *               Checks Redis blacklist for revoked tokens (logout support)
 * authorize:    Role-based access control guard
 */

const jwt = require('jsonwebtoken');
const config = require('../../config');
const AppError = require('../utils/api-error');
const tokenBlacklist = require('../utils/token-blacklist');

/**
 * Middleware: Verify JWT access token
 * Extracts token from "Authorization: Bearer <token>" header
 * Checks if the token has been blacklisted (revoked via logout)
 * Attaches decoded user payload to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Extract token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Access token is required. Please provide a valid Bearer token.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw AppError.unauthorized('Access token is malformed.');
    }

    // 2. Check if token is blacklisted (revoked via logout)
    const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
    if (isBlacklisted) {
      throw AppError.unauthorized('Token has been revoked. Please log in again.');
    }

    // 3. Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // 4. Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    if (error.name === 'TokenExpiredError') {
      return next(AppError.unauthorized('Access token has expired. Please refresh your token.'));
    }

    if (error.name === 'JsonWebTokenError') {
      return next(AppError.unauthorized('Invalid access token.'));
    }

    return next(AppError.unauthorized('Authentication failed.'));
  }
};

/**
 * Middleware Factory: Role-based authorization
 * @param  {...string} roles - Allowed roles (e.g., 'customer', 'worker', 'admin')
 * @returns {Function} Express middleware
 *
 * Usage: authorize(ROLES.CUSTOMER) or authorize(ROLES.CUSTOMER, ROLES.ADMIN)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required before authorization.'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Access denied. This resource requires one of the following roles: ${roles.join(', ')}`
        )
      );
    }

    next();
  };
};

module.exports = { authenticate, authorize };
