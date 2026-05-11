/**
 * src/shared/services/notification.service.js — Redis Pub/Sub Notification Dispatcher
 *
 * Centralizes all real-time socket event emission.
 * Controllers PUBLISH events to a Redis channel → this service SUBSCRIBES
 * and routes them to the correct Socket.IO clients.
 *
 * This decouples socket logic from HTTP controllers and enables
 * multi-server broadcasting via Redis Pub/Sub.
 *
 * Redis Channel: "booking:notifications"
 *
 * Events:
 *   - new-booking-request  → sent to candidate workers
 *   - booking-confirmed    → sent to customer
 *   - booking-taken        → sent to other candidate workers
 *   - booking-expired      → sent to customer
 */

const logger = require('../../config/logger');
const { getRedis, getRedisSub } = require('../../config/redis');
const socketRegistryService = require('./socket-registry.service');

const NOTIFICATION_CHANNEL = 'booking:notifications';

class NotificationService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize the service with the Socket.IO server instance.
   * Sets up the Redis subscriber to listen for notification events.
   *
   * @param {Server} io - Socket.IO server instance
   */
  initialize(io) {
    this.io = io;
    this._setupSubscriber();
    logger.info('📢 NotificationService initialized with Redis Pub/Sub');
  }

  // ─────────────────────────────────────────────────────────────
  //  PUBLISHER METHODS (called from controllers)
  // ─────────────────────────────────────────────────────────────

  /**
   * Notify candidate workers about a new instant booking request.
   *
   * @param {string[]} candidateUserIds - Worker user IDs to notify
   * @param {object} bookingPayload - Booking details to send
   */
  async notifyNewBookingRequest(candidateUserIds, bookingPayload) {
    await this._publish('new-booking-request', candidateUserIds, bookingPayload);
    logger.info(`[NOTIFY] Published 'new-booking-request' to ${candidateUserIds.length} candidates`);
  }

  /**
   * Notify the customer that their booking has been confirmed by a worker.
   *
   * @param {string} customerUserId - Customer's user ID
   * @param {object} bookingPayload - Booking + provider details
   */
  async notifyBookingConfirmed(customerUserId, bookingPayload) {
    await this._publish('booking-confirmed', [customerUserId], bookingPayload);
    logger.info(`[NOTIFY] Published 'booking-confirmed' to customer: ${customerUserId}`);
  }

  /**
   * Notify other candidate workers that an instant booking has been taken.
   *
   * @param {string[]} candidateUserIds - All candidate worker user IDs
   * @param {string} acceptedByUserId - The worker who accepted (excluded from notification)
   * @param {string} bookingId - The booking ID
   */
  async notifyBookingTaken(candidateUserIds, acceptedByUserId, bookingId) {
    const targets = candidateUserIds.filter(
      (id) => id.toString() !== acceptedByUserId.toString()
    );
    await this._publish('booking-taken', targets, { bookingId });
    logger.info(`[NOTIFY] Published 'booking-taken' to ${targets.length} other candidates`);
  }

  /**
   * Notify the customer that their booking has expired.
   *
   * @param {string} customerUserId - Customer's user ID
   * @param {string} bookingId - The expired booking ID
   */
  async notifyBookingExpired(customerUserId, bookingId) {
    await this._publish('booking-expired', [customerUserId], {
      bookingId,
      message: 'No providers accepted your request in time.',
    });
    logger.info(`[NOTIFY] Published 'booking-expired' to customer: ${customerUserId}`);
  }

  /**
   * Notify the customer that their scheduled booking has been accepted.
   *
   * @param {string} customerUserId - Customer's user ID
   * @param {object} bookingPayload - Booking details
   */
  async notifyScheduledBookingAccepted(customerUserId, bookingPayload) {
    await this._publish('booking-accepted', [customerUserId], bookingPayload);
    logger.info(`[NOTIFY] Published 'booking-accepted' to customer: ${customerUserId}`);
  }

  /**
   * Notify the customer that their scheduled booking has been rejected.
   *
   * @param {string} customerUserId - Customer's user ID
   * @param {object} bookingPayload - Booking details
   */
  async notifyScheduledBookingRejected(customerUserId, bookingPayload) {
    await this._publish('booking-rejected', [customerUserId], bookingPayload);
    logger.info(`[NOTIFY] Published 'booking-rejected' to customer: ${customerUserId}`);
  }

  /**
   * Notify the customer that their booking has been completed.
   *
   * @param {string} customerUserId - Customer's user ID
   * @param {object} bookingPayload - Booking details
   */
  async notifyBookingCompleted(customerUserId, bookingPayload) {
    await this._publish('booking-completed', [customerUserId], bookingPayload);
    logger.info(`[NOTIFY] Published 'booking-completed' to customer: ${customerUserId}`);
  }

  /**
   * Notify the assigned worker about a new scheduled booking.
   *
   * @param {string} workerUserId - Worker's user ID
   * @param {object} bookingPayload - Booking details
   */
  async notifyNewScheduledBooking(workerUserId, bookingPayload) {
    await this._publish('new-scheduled-booking', [workerUserId], bookingPayload);
    logger.info(`[NOTIFY] Published 'new-scheduled-booking' to worker: ${workerUserId}`);
  }

  // ─────────────────────────────────────────────────────────────
  //  PRIVATE METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Publish a notification event to the Redis channel.
   * @private
   */
  async _publish(event, targetUserIds, payload) {
    try {
      const redis = getRedis();
      const message = JSON.stringify({
        event,
        targets: targetUserIds.map((id) => id.toString()),
        payload,
        timestamp: new Date().toISOString(),
      });
      await redis.publish(NOTIFICATION_CHANNEL, message);
    } catch (error) {
      logger.error(`Error publishing notification '${event}':`, error.message);
    }
  }

  /**
   * Set up the Redis subscriber to listen for notification events
   * and route them to the correct Socket.IO clients.
   * @private
   */
  _setupSubscriber() {
    try {
      const redisSub = getRedisSub();

      redisSub.subscribe(NOTIFICATION_CHANNEL, (err) => {
        if (err) {
          logger.error('Failed to subscribe to notification channel:', err.message);
          return;
        }
        logger.info(`📡 Subscribed to Redis channel: ${NOTIFICATION_CHANNEL}`);
      });

      redisSub.on('message', async (channel, message) => {
        if (channel !== NOTIFICATION_CHANNEL) return;

        try {
          const { event, targets, payload } = JSON.parse(message);

          for (const userId of targets) {
            const socketId = await socketRegistryService.getSocketId(userId);
            if (socketId) {
              this.io.to(socketId).emit(event, payload);
              logger.debug(`[SOCKET] Emitted '${event}' to userId: ${userId} (socketId: ${socketId})`);
            } else {
              logger.warn(`[SOCKET] User ${userId} is not connected (no socketId found)`);
            }
          }
        } catch (error) {
          logger.error('Error processing notification message:', error.message);
        }
      });
    } catch (error) {
      logger.error('Error setting up notification subscriber:', error.message);
    }
  }
}

module.exports = new NotificationService();
