/**
 * src/config/redis.js — Redis Connection Singleton
 *
 * Creates two Redis clients using ioredis:
 * - `redis`    → General commands (GET, SET, HSET, PUBLISH, etc.)
 * - `redisSub` → Dedicated subscriber (keyspace events + pub/sub channels)
 *
 * Auto-enables keyspace notifications (notify-keyspace-events Ex)
 * so that expired keys trigger events we can listen to.
 */

const Redis = require('ioredis');
const config = require('./index');
const logger = require('./logger');

let redis = null;
let redisSub = null;

/**
 * Connect to Redis and create both clients.
 * Must be called during server startup before any service that uses Redis.
 */
const connectRedis = async () => {
  try {
    // ── Main client (commands) ──────────────────────────────
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        logger.warn(`🔄 Redis reconnecting... attempt ${times} (delay: ${delay}ms)`);
        return delay;
      },
      lazyConnect: true,
    });

    await redis.connect();

    redis.on('error', (err) => {
      logger.error('❌ Redis client error:', err.message);
    });

    redis.on('reconnecting', () => {
      logger.warn('🔄 Redis client reconnecting...');
    });

    // Enable keyspace notifications for key expiration events
    // 'Ex' = Keyevent events (x = expired events)
    await redis.config('SET', 'notify-keyspace-events', 'Ex');
    logger.info('🔑 Redis keyspace notifications enabled (Ex)');

    // ── Subscriber client (dedicated for subscriptions) ─────
    redisSub = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: true,
    });

    await redisSub.connect();

    redisSub.on('error', (err) => {
      logger.error('❌ Redis subscriber error:', err.message);
    });

    logger.info('✅ Redis connected successfully');
    logger.info(`📡 Redis URL: ${config.redisUrl}`);

    return { redis, redisSub };
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error.message);
    throw error;
  }
};

/**
 * Gracefully disconnect both Redis clients.
 * Called during server shutdown.
 */
const disconnectRedis = async () => {
  try {
    if (redisSub) {
      await redisSub.quit();
      logger.info('🔌 Redis subscriber disconnected');
    }
    if (redis) {
      await redis.quit();
      logger.info('🔌 Redis client disconnected');
    }
  } catch (error) {
    logger.error('Error disconnecting Redis:', error.message);
  }
};

/**
 * Get the main Redis client instance.
 * @returns {Redis} The ioredis client
 */
const getRedis = () => {
  if (!redis) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redis;
};

/**
 * Get the subscriber Redis client instance.
 * @returns {Redis} The ioredis subscriber client
 */
const getRedisSub = () => {
  if (!redisSub) {
    throw new Error('Redis subscriber not initialized. Call connectRedis() first.');
  }
  return redisSub;
};

module.exports = {
  connectRedis,
  disconnectRedis,
  getRedis,
  getRedisSub,
};
