/**
 * src/shared/utils/api-error.js — Custom Application Error
 *
 * Extends Error with HTTP status code and operational flag.
 * Operational errors are expected (e.g., validation, not found).
 * Programming errors are unexpected bugs.
 */

class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {object} [options] - Additional options
   * @param {boolean} [options.isOperational=true] - Whether this is an expected error
   * @param {object} [options.errors] - Detailed field-level errors
   */
  constructor(message, statusCode, options = {}) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = options.isOperational !== undefined ? options.isOperational : true;
    this.errors = options.errors || null;

    Error.captureStackTrace(this, this.constructor);
  }

  // ── Factory Methods ─────────────────────────────────────
  static badRequest(message = 'Bad request', errors = null) {
    return new AppError(message, 400, { errors });
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(message, 401);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(message, 403);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404);
  }

  static conflict(message = 'Conflict') {
    return new AppError(message, 409);
  }

  static gone(message = 'Resource expired or no longer available') {
    return new AppError(message, 410);
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, { isOperational: false });
  }
}

module.exports = AppError;
