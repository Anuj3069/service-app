/**
 * src/shared/utils/expiry-scheduler.js — Redis-based Booking Expiry
 *
 * Replaces the fragile setTimeout approach with Redis key TTL + keyspace notifications.
 * When a key expires, Redis fires an event that our listener catches to update the booking.
 *
 * How it works:
 * 1. On instant booking creation → set a Redis key with TTL matching the expiry window
 * 2. On booking acceptance → delete the key (cancel the expiry)
 * 3. A subscriber listens for keyspace expiration events and handles the expiry logic
 */

const { getRedisClient } = require('../../config/redis');
const logger = require('../../config/logger');

const EXPIRY_PREFIX = 'booking:expiry:';

class ExpiryScheduler {
  /**
   * Schedule a booking to expire at a specific time
   * @param {string} bookingId
   * @param {Date|string} expiresAt
   */
  async schedule(bookingId, expiresAt) {
    const ttlMs = new Date(expiresAt).getTime() - Date.now();
    if (ttlMs <= 0) return;

    const ttlSeconds = Math.ceil(ttlMs / 1000);
    await getRedisClient().set(
      `${EXPIRY_PREFIX}${bookingId}`,
      'pending',
      'EX',
      ttlSeconds
    );
    logger.info(`⏰ Expiry scheduled for booking ${bookingId} in ${ttlSeconds}s`);
  }

  /**
   * Cancel a scheduled expiry (e.g., when booking is accepted)
   * @param {string} bookingId
   */
  async cancel(bookingId) {
    await getRedisClient().del(`${EXPIRY_PREFIX}${bookingId}`);
    logger.info(`⏰ Expiry cancelled for booking ${bookingId}`);
  }

  /**
   * Start listening for expired keys via Redis keyspace notifications.
   * IMPORTANT: This requires a SEPARATE Redis subscriber client because
   * a subscribed client cannot issue regular commands.
   *
   * @param {Function} onExpired - Callback receiving (bookingId) when a booking expires
   */
  startListener(onExpired) {
    const config = require('../../config');

    // In test environment, skip the listener
    if (config.env === 'test') {
      logger.info('⏰ Expiry listener skipped in test environment');
      return;
    }

    const Redis = require('ioredis');
    const sub = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
    });

    // Enable keyspace notifications for expired keys
    getRedisClient().config('SET', 'notify-keyspace-events', 'Ex').catch((err) => {
      logger.warn('Could not set keyspace notifications (may need Redis config):', err.message);
    });

    const channel = `__keyevent@${config.redis.db || 0}__:expired`;
    sub.subscribe(channel, (err) => {
      if (err) {
        logger.error('Failed to subscribe to keyspace events:', err.message);
        return;
      }
      logger.info(`⏰ Expiry listener active on channel: ${channel}`);
    });

    sub.on('message', (ch, key) => {
      if (key.startsWith(EXPIRY_PREFIX)) {
        const bookingId = key.replace(EXPIRY_PREFIX, '');
        logger.info(`⏰ Booking expired via Redis TTL: ${bookingId}`);
        onExpired(bookingId);
      }
    });
  }
}

module.exports = new ExpiryScheduler();
