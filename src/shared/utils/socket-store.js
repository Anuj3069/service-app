/**
 * src/shared/utils/socket-store.js — Redis-backed User↔Socket Mapping
 *
 * Replaces the in-memory Map() with a Redis hash so socket mappings
 * survive server restarts and work across multiple Node.js instances.
 *
 * Redis key: "socket:user_map" (Hash)
 *   field = userId
 *   value = socketId
 */

const HASH_KEY = 'socket:user_map';

class SocketStore {
  /**
   * @param {import('ioredis').Redis} redisClient
   */
  constructor(redisClient) {
    this.redis = redisClient;
  }

  /**
   * Register a user's socket connection
   * @param {string} userId
   * @param {string} socketId
   */
  async set(userId, socketId) {
    await this.redis.hset(HASH_KEY, userId, socketId);
  }

  /**
   * Get the socket ID for a user
   * @param {string} userId
   * @returns {Promise<string|null>}
   */
  async get(userId) {
    return this.redis.hget(HASH_KEY, userId);
  }

  /**
   * Remove a user's socket mapping
   * @param {string} userId
   */
  async delete(userId) {
    await this.redis.hdel(HASH_KEY, userId);
  }

  /**
   * Find the userId associated with a socketId (for disconnect cleanup)
   * @param {string} socketId
   * @returns {Promise<string|null>}
   */
  async findBySocketId(socketId) {
    const all = await this.redis.hgetall(HASH_KEY);
    for (const [userId, sId] of Object.entries(all)) {
      if (sId === socketId) return userId;
    }
    return null;
  }
}

module.exports = SocketStore;
