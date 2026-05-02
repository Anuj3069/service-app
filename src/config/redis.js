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
 * Get or create the Redis client singleton
 * @returns {import('ioredis').Redis}
 */
function getRedisClient() {
  if (client) return client;

  // Use mock in test environment
  if (config.env === 'test') {
    const RedisMock = require('ioredis-mock');
    client = new RedisMock();
    return client;
  }

  const Redis = require('ioredis');

  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3,
  });

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

module.exports = { getRedisClient, disconnectRedis, flushRedis };
