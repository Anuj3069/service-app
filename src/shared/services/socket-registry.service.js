/**
 * src/shared/services/socket-registry.service.js — Redis-Backed User↔Socket Mapping
 *
 * Replaces the in-memory `userSockets` Map with Redis HASH operations.
 * All user-to-socket mappings now persist across server restarts
 * and are shared across multiple Node.js instances.
 *
 * Redis key: "online_users" (HASH)
 *   field = userId
 *   value = socketId
 */

const logger = require('../../config/logger');
const { getRedis } = require('../../config/redis');

const ONLINE_USERS_KEY = 'online_users';

class SocketRegistryService {
  /**
   * Register a user's socket connection.
   * Maps userId → socketId in Redis HASH.
   *
   * @param {string} userId - The user's database ID
   * @param {string} socketId - The Socket.IO socket ID
   */
  async registerUser(userId, socketId) {
    try {
      const redis = getRedis();
      await redis.hset(ONLINE_USERS_KEY, userId, socketId);
      logger.info(`👤 User registered to socket: ${userId} -> ${socketId}`);
    } catch (error) {
      logger.error(`Error registering user ${userId}:`, error.message);
    }
  }

  /**
   * Unregister a user by userId.
   * Removes the userId → socketId mapping from Redis.
   *
   * @param {string} userId - The user's database ID
   */
  async unregisterUser(userId) {
    try {
      const redis = getRedis();
      await redis.hdel(ONLINE_USERS_KEY, userId);
      logger.info(`🔴 User unregistered: ${userId}`);
    } catch (error) {
      logger.error(`Error unregistering user ${userId}:`, error.message);
    }
  }

  /**
   * Remove a user mapping by their socketId (used on disconnect).
   * Scans the HASH to find which userId owns this socketId, then removes it.
   *
   * @param {string} socketId - The Socket.IO socket ID that disconnected
   * @returns {string|null} The userId that was removed, or null
   */
  async removeBySocketId(socketId) {
    try {
      const redis = getRedis();
      const allUsers = await redis.hgetall(ONLINE_USERS_KEY);

      for (const [userId, storedSocketId] of Object.entries(allUsers)) {
        if (storedSocketId === socketId) {
          await redis.hdel(ONLINE_USERS_KEY, userId);
          logger.info(`🔴 User disconnected: ${userId} (${socketId})`);
          return userId;
        }
      }
      return null;
    } catch (error) {
      logger.error(`Error removing socket ${socketId}:`, error.message);
      return null;
    }
  }

  /**
   * Get the socketId for a given userId.
   *
   * @param {string} userId - The user's database ID
   * @returns {string|null} The Socket.IO socket ID, or null if offline
   */
  async getSocketId(userId) {
    try {
      const redis = getRedis();
      const socketId = await redis.hget(ONLINE_USERS_KEY, userId);
      return socketId || null;
    } catch (error) {
      logger.error(`Error getting socket for user ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Check if a user is currently online (has an active socket).
   *
   * @param {string} userId - The user's database ID
   * @returns {boolean}
   */
  async isOnline(userId) {
    try {
      const redis = getRedis();
      return await redis.hexists(ONLINE_USERS_KEY, userId) === 1;
    } catch (error) {
      logger.error(`Error checking online status for ${userId}:`, error.message);
      return false;
    }
  }

  /**
   * Get count of currently online users.
   *
   * @returns {number}
   */
  async getOnlineCount() {
    try {
      const redis = getRedis();
      return await redis.hlen(ONLINE_USERS_KEY);
    } catch (error) {
      logger.error('Error getting online count:', error.message);
      return 0;
    }
  }

  /**
   * Get all online user IDs.
   *
   * @returns {string[]} Array of online user IDs
   */
  async getAllOnlineUsers() {
    try {
      const redis = getRedis();
      return await redis.hkeys(ONLINE_USERS_KEY);
    } catch (error) {
      logger.error('Error getting all online users:', error.message);
      return [];
    }
  }

  /**
   * Clear all online user mappings.
   * Useful on server startup to reset stale mappings.
   */
  async clearAll() {
    try {
      const redis = getRedis();
      await redis.del(ONLINE_USERS_KEY);
      logger.info('🧹 Cleared all online user mappings');
    } catch (error) {
      logger.error('Error clearing online users:', error.message);
    }
  }
}

module.exports = new SocketRegistryService();
