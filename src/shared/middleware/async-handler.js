/**
 * src/shared/middleware/async-handler.js — Async Route Handler Wrapper
 *
 * Wraps async route handlers to automatically catch errors
 * and forward them to Express error middleware.
 * Eliminates the need for try-catch in every controller.
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
