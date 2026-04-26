/**
 * src/shared/middleware/error.middleware.js — Global Error Handler
 *
 * Catches all errors and returns a consistent JSON response.
 * Handles: AppError, Mongoose errors, JWT errors, and unexpected errors.
 */

const logger = require('../../config/logger');
const AppError = require('../utils/api-error');

/**
 * 404 Not Found handler — for unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Global error handler middleware
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // ── Mongoose: Cast Error (invalid ObjectId) ───────────
  if (err.name === 'CastError') {
    error = AppError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }

  // ── Mongoose: Duplicate Key ───────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue).join(', ');
    error = AppError.conflict(`Duplicate value for field: ${field}. Please use a different value.`);
  }

  // ── Mongoose: Validation Error ────────────────────────
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    error = AppError.badRequest(`Validation error: ${messages.join('; ')}`);
  }

  // ── JWT Errors ────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    error = AppError.unauthorized('Invalid token.');
  }

  if (err.name === 'TokenExpiredError') {
    error = AppError.unauthorized('Token has expired.');
  }

  // ── Log Error ─────────────────────────────────────────
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational || false;

  if (!isOperational || statusCode >= 500) {
    logger.error('💥 Unexpected Error:', {
      statusCode,
      message: error.message,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  } else {
    logger.warn('⚠️  Operational Error:', {
      statusCode,
      message: error.message,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // ── Send Response ─────────────────────────────────────
  const response = {
    status: error.status || 'error',
    message: error.message || 'Something went wrong',
    ...(error.errors && { errors: error.errors }),
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = { notFoundHandler, errorHandler };
