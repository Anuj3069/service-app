/**
 * src/shared/utils/token-blacklist.js — JWT Token Blacklisting
 *
 * Stores revoked JWT tokens in Redis with a TTL matching the token's
 * remaining lifetime. This enables secure logout without waiting
 * for token expiration.
 *
 * Redis key: "bl:token:<token>" → "1" with EX = remaining TTL
 */

const { getRedisClient } = require('../../config/redis');

const BLACKLIST_PREFIX = 'bl:token:';

const tokenBlacklist = {
  /**
   * Add a token to the blacklist
   * @param {string} token - The JWT token string
   * @param {number} ttlSeconds - Remaining lifetime of the token in seconds
   */
  async add(token, ttlSeconds) {
    if (ttlSeconds > 0) {
      await getRedisClient().set(`${BLACKLIST_PREFIX}${token}`, '1', 'EX', ttlSeconds);
    }
  },

  /**
   * Check if a token has been blacklisted (revoked)
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async isBlacklisted(token) {
    const result = await getRedisClient().get(`${BLACKLIST_PREFIX}${token}`);
    return result !== null;
  },
};

module.exports = tokenBlacklist;
