/**
 * src/config/redis.js — Redis Client Singleton
 *
 * Provides a shared Redis client for the application.
 * Uses ioredis-mock in test environment so tests don't need a real Redis server.
 */

const config = require('./index');
const logger = require('./logger');

let client = null;

/**
 * Create a new Redis client instance
 * @param {object} [options] - Additional options to pass to ioredis
 * @returns {import('ioredis').Redis}
 */
function createRedisClient(options = {}) {
  // Use mock in test environment
  if (config.env === 'test') {
    const RedisMock = require('ioredis-mock');
    return new RedisMock();
  }

  const Redis = require('ioredis');

  if (config.redis.url) {
    return new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      ...options,
    });
  }

  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3,
    ...options,
  });
}

/**
 * Get or create the Redis client singleton
 * @returns {import('ioredis').Redis}
 */
function getRedisClient() {
  if (client) return client;

  client = createRedisClient();

  client.on('connect', () => logger.info('🔴 Redis connected'));
  client.on('error', (err) => logger.error('Redis connection error:', err.message));

  return client;
}

/**
 * Gracefully disconnect Redis
 */
async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
    logger.info('🔴 Redis disconnected');
  }
}

/**
 * Flush all Redis data (useful for test cleanup between test runs)
 */
async function flushRedis() {
  if (client) {
    await client.flushall();
  }
}

module.exports = { getRedisClient, createRedisClient, disconnectRedis, flushRedis };
