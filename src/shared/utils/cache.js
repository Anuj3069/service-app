/**
 * src/shared/utils/cache.js — Redis Cache Utility
 *
 * Generic cache helper for caching MongoDB query results in Redis.
 * Supports get, set with TTL, delete, and pattern-based invalidation.
 */

const { getRedisClient } = require('../../config/redis');

const cache = {
  /**
   * Get a cached value by key
   * @param {string} key
   * @returns {Promise<any|null>} Parsed JSON value or null if not found
   */
  async get(key) {
    const data = await getRedisClient().get(key);
    return data ? JSON.parse(data) : null;
  },

  /**
   * Set a value in cache with optional TTL
   * @param {string} key
   * @param {any} value - Will be JSON.stringify'd
   * @param {number} [ttlSeconds=300] - Time to live in seconds (default: 5 minutes)
   */
  async set(key, value, ttlSeconds = 300) {
    await getRedisClient().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  },

  /**
   * Delete a specific cache key
   * @param {string} key
   */
  async del(key) {
    await getRedisClient().del(key);
  },

  /**
   * Delete all keys matching a pattern (e.g., 'cache:providers:*')
   * NOTE: Use sparingly — KEYS command can be slow on large datasets.
   * For production, consider SCAN-based approach.
   * @param {string} pattern
   */
  async delPattern(pattern) {
    const keys = await getRedisClient().keys(pattern);
    if (keys.length > 0) {
      await getRedisClient().del(...keys);
    }
  },
};

module.exports = cache;
