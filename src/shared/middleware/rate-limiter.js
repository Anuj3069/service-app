/**
 * src/shared/middleware/rate-limiter.js — Redis-backed Rate Limiting
 *
 * Protects auth endpoints from brute-force attacks using
 * rate-limiter-flexible with Redis as the backing store.
 * Bypassed in test environment to avoid interfering with integration tests.
 */

const config = require('../../config');
const logger = require('../../config/logger');

let authLimiter = null;
let apiLimiter = null;

// Only create Redis-backed limiters in non-test environments
if (config.env !== 'test') {
  const { RateLimiterRedis } = require('rate-limiter-flexible');
  const { getRedisClient } = require('../../config/redis');

  /**
   * Auth rate limiter: 10 attempts per 15-minute window
   * After exceeding the limit, the IP is blocked for 15 minutes.
   */
  authLimiter = new RateLimiterRedis({
    storeClient: getRedisClient(),
    keyPrefix: 'rl:auth',
    points: 10,            // 10 attempts
    duration: 15 * 60,     // per 15 minutes
    blockDuration: 15 * 60, // block for 15 minutes after exceeding
  });

  /**
   * General API rate limiter: 100 requests per minute
   */
  apiLimiter = new RateLimiterRedis({
    storeClient: getRedisClient(),
    keyPrefix: 'rl:api',
    points: 100,
    duration: 60,
  });
}

/**
 * Factory: Create rate limiting middleware from a limiter instance
 * In test environment, the middleware simply calls next() (passthrough).
 * @param {object} limiter
 * @returns {Function} Express middleware
 */
const rateLimitMiddleware = (limiter) => async (req, res, next) => {
  // Bypass rate limiting in test environment
  if (!limiter) return next();

  try {
    await limiter.consume(req.ip);
    next();
  } catch (rejRes) {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfterMs: rejRes.msBeforeNext || 0,
    });
  }
};

module.exports = { authLimiter, apiLimiter, rateLimitMiddleware };
