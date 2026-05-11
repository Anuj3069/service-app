/**
 * src/shared/services/expiry.service.js — Redis TTL-Based Booking Expiry
 *
 * Replaces unreliable setTimeout() with Redis key expiration.
 *
 * How it works:
 * 1. On booking creation → SET a Redis key with TTL matching the expiry window
 *    Key format: "booking_expiry:{bookingId}"
 * 2. When the TTL expires → Redis fires a keyspace notification
 * 3. This service listens for expired keys → updates DB → notifies customer
 *
 * This approach survives server restarts and works across multiple instances.
 */

const logger = require('../../config/logger');
const { getRedis, getRedisSub } = require('../../config/redis');

const EXPIRY_KEY_PREFIX = 'booking_expiry:';

class ExpiryService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize the expiry service.
   * Sets up the Redis keyspace notification listener for expired keys.
   *
   * @param {Server} io - Socket.IO server instance
   */
  initialize(io) {
    this.io = io;
    this._setupKeyspaceListener();
    logger.info('⏰ ExpiryService initialized with Redis keyspace notifications');
  }

  /**
   * Schedule a booking expiry using Redis key TTL.
   * When the key expires, the keyspace listener will handle the rest.
   *
   * @param {string} bookingId - The booking ID to schedule expiry for
   * @param {number} expiryMs - Time in milliseconds until expiry
   * @param {object} metadata - Additional data to store (userId, type, etc.)
   */
  async scheduleExpiry(bookingId, expiryMs, metadata = {}) {
    try {
      const redis = getRedis();
      const key = `${EXPIRY_KEY_PREFIX}${bookingId}`;

      // Store metadata as the value so we can use it when the key expires
      // We also store it in a separate persistent key for lookup after expiry
      const metadataKey = `booking_meta:${bookingId}`;
      await redis.set(metadataKey, JSON.stringify(metadata));
      // Metadata key expires 60s after the booking expiry (cleanup buffer)
      await redis.pexpire(metadataKey, expiryMs + 60000);

      // Set the expiry trigger key with TTL
      await redis.set(key, bookingId, 'PX', expiryMs);

      logger.info(`⏰ Scheduled expiry for booking ${bookingId} in ${Math.round(expiryMs / 1000)}s`);
    } catch (error) {
      logger.error(`Error scheduling expiry for booking ${bookingId}:`, error.message);
    }
  }

  /**
   * Cancel a scheduled expiry (e.g., when a booking is accepted before expiry).
   *
   * @param {string} bookingId - The booking ID to cancel expiry for
   */
  async cancelExpiry(bookingId) {
    try {
      const redis = getRedis();
      const key = `${EXPIRY_KEY_PREFIX}${bookingId}`;
      const metadataKey = `booking_meta:${bookingId}`;

      await redis.del(key);
      await redis.del(metadataKey);

      logger.info(`🚫 Cancelled expiry for booking ${bookingId}`);
    } catch (error) {
      logger.error(`Error cancelling expiry for booking ${bookingId}:`, error.message);
    }
  }

  /**
   * Check remaining time until a booking expires.
   *
   * @param {string} bookingId - The booking ID
   * @returns {number} Remaining time in milliseconds, or -1 if not found
   */
  async getRemainingTime(bookingId) {
    try {
      const redis = getRedis();
      const key = `${EXPIRY_KEY_PREFIX}${bookingId}`;
      const ttl = await redis.pttl(key);
      return ttl > 0 ? ttl : -1;
    } catch (error) {
      logger.error(`Error getting remaining time for booking ${bookingId}:`, error.message);
      return -1;
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  PRIVATE: Keyspace Notification Listener
  // ─────────────────────────────────────────────────────────────

  /**
   * Listen for Redis keyspace expired events.
   * When a booking_expiry key expires, update the DB and notify the customer.
   * @private
   */
  _setupKeyspaceListener() {
    try {
      const redisSub = getRedisSub();

      // Subscribe to keyspace expired events on database 0
      redisSub.subscribe('__keyevent@0__:expired', (err) => {
        if (err) {
          logger.error('Failed to subscribe to keyspace notifications:', err.message);
          return;
        }
        logger.info('📡 Subscribed to Redis keyspace expired events');
      });

      redisSub.on('message', async (channel, expiredKey) => {
        if (channel !== '__keyevent@0__:expired') return;
        if (!expiredKey.startsWith(EXPIRY_KEY_PREFIX)) return;

        const bookingId = expiredKey.replace(EXPIRY_KEY_PREFIX, '');
        logger.info(`⏰ Redis key expired for booking: ${bookingId}`);

        await this._handleBookingExpiry(bookingId);
      });
    } catch (error) {
      logger.error('Error setting up keyspace listener:', error.message);
    }
  }

  /**
   * Handle a booking expiry event:
   * 1. Update booking status in MongoDB to 'expired'
   * 2. Notify the customer via NotificationService
   * @private
   */
  async _handleBookingExpiry(bookingId) {
    try {
      const redis = getRedis();
      const Booking = require('../../modules/booking/booking.model');
      const notificationService = require('./notification.service');

      // Atomically update only if still in an expirable status
      const expiredBooking = await Booking.findOneAndUpdate(
        {
          _id: bookingId,
          status: { $in: ['requested', 'pending'] },
        },
        { status: 'expired' },
        { new: true }
      );

      if (!expiredBooking) {
        logger.debug(`Booking ${bookingId} already transitioned (not expired)`);
        return;
      }

      logger.info(`⏰ Booking auto-expired: ${bookingId} (was: ${expiredBooking.type})`);

      // Notify the customer
      const customerUserId = expiredBooking.userId.toString();
      await notificationService.notifyBookingExpired(customerUserId, bookingId);

      // Clean up metadata key
      const metadataKey = `booking_meta:${bookingId}`;
      await redis.del(metadataKey);
    } catch (error) {
      logger.error(`Error handling booking expiry for ${bookingId}:`, error.message);
    }
  }
}

module.exports = new ExpiryService();
