/**
 * server.js — Application Entry Point
 *
 * Connects to the database and Redis, starts the HTTP server,
 * initializes Socket.IO with Redis adapter, and handles graceful shutdown.
 */

require('dotenv').config();

const config = require('./src/config');
const logger = require('./src/config/logger');
const connectDatabase = require('./src/config/database');
const { getRedisClient, disconnectRedis } = require('./src/config/redis');
const app = require('./src/app');
const http = require('http');
const { Server } = require('socket.io');
const SocketStore = require('./src/shared/utils/socket-store');
const expiryScheduler = require('./src/shared/utils/expiry-scheduler');

// ── Uncaught Exception Handler ──────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION 💥 Shutting down...', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// ── Start Server ────────────────────────────────────────────
const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDatabase();

    // 2. Connect to Redis
    const redisClient = getRedisClient();
    logger.info('🔴 Redis client initialized');

    // 3. Setup HTTP server and Socket.IO
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: config.env === 'production' ? config.corsOrigin : '*',
        credentials: true,
      },
    });

    // 4. Setup Socket.IO Redis Adapter for horizontal scaling
    if (config.env !== 'test') {
      try {
        const { createAdapter } = require('@socket.io/redis-adapter');
        const pubClient = redisClient;
        const subClient = pubClient.duplicate();
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('🔌 Socket.IO Redis adapter enabled');
      } catch (err) {
        logger.warn('Socket.IO Redis adapter setup failed (non-critical):', err.message);
      }
    }

    // 5. Store io and Redis-backed socketStore in app for route access
    app.set('io', io);
    const socketStore = new SocketStore(redisClient);
    app.set('socketStore', socketStore);

    // Throttle map: workerId -> lastUpdateTimestamp
    const locationThrottles = new Map();
    const THROTTLE_MS = 5000; // 5-second minimum between updates

    // Handle Socket Connections & User Mapping (via Redis)
    io.on('connection', (socket) => {
      logger.info(`⚡ Socket connected: ${socket.id}`);

      socket.on('register', async (data) => {
        let userId;
        if (typeof data === 'string') {
          // If they sent raw string with quotes, strip them
          userId = data.replace(/^"|"$/g, '');
        } else if (data && data.userId) {
          userId = data.userId.toString();
        } else {
          logger.error('Invalid register payload:', data);
          return;
        }
        
        await socketStore.set(userId, socket.id);
        logger.info(`👤 User registered to socket (Redis): ${userId} -> ${socket.id}`);
      });

      // ── LIVE TRACKING: Worker sends location updates ──────
      socket.on('location-update', async (data) => {
        try {
          const { bookingId, coordinates } = data;
          if (!bookingId || !coordinates || coordinates.length !== 2) return;

          // Throttle: max one update per 5 seconds per socket
          const now = Date.now();
          const lastUpdate = locationThrottles.get(socket.id) || 0;
          if (now - lastUpdate < THROTTLE_MS) return; // Silently ignore
          locationThrottles.set(socket.id, now);

          const Booking = require('./src/modules/booking/booking.model');

          // Find the booking and validate it's in ACCEPTED status
          const booking = await Booking.findById(bookingId).select('userId status');
          if (!booking || booking.status !== 'accepted') return;

          // Persist last known location to DB (for REST fallback)
          await Booking.findByIdAndUpdate(bookingId, {
            workerLocation: {
              type: 'Point',
              coordinates,
              updatedAt: new Date(),
            },
          });

          // Relay to the customer in real-time
          const customerSocketId = await socketStore.get(booking.userId.toString());
          if (customerSocketId) {
            io.to(customerSocketId).emit('worker-location', {
              bookingId,
              coordinates,
              timestamp: now,
            });
          }
        } catch (err) {
          logger.error('location-update error:', err.message);
        }
      });

      // ── LIVE TRACKING: Worker signals they're en route ────
      socket.on('tracking-start', async (data) => {
        try {
          const { bookingId } = data;
          if (!bookingId) return;

          const Booking = require('./src/modules/booking/booking.model');
          const booking = await Booking.findById(bookingId).select('userId status');
          if (!booking || booking.status !== 'accepted') return;

          const customerSocketId = await socketStore.get(booking.userId.toString());
          if (customerSocketId) {
            io.to(customerSocketId).emit('tracking-started', { bookingId });
          }
        } catch (err) {
          logger.error('tracking-start error:', err.message);
        }
      });

      socket.on('disconnect', async () => {
        locationThrottles.delete(socket.id); // Clean up throttle
        // Find and remove user mapping on disconnect
        const userId = await socketStore.findBySocketId(socket.id);
        if (userId) {
          await socketStore.delete(userId);
          logger.info(`🔴 User disconnected: ${userId} (${socket.id})`);
        }
      });
    });

    // 6. Start Redis-based expiry listener for instant bookings
    const Booking = require('./src/modules/booking/booking.model');

    expiryScheduler.startListener(async (bookingId) => {
      try {
        const expired = await Booking.findOneAndUpdate(
          { _id: bookingId, status: 'requested' },
          { status: 'expired' },
          { new: true }
        );

        if (expired) {
          logger.info(`⏰ Booking auto-expired: ${bookingId}`);

          // Notify the customer via socket
          const customerSocketId = await socketStore.get(expired.userId.toString());
          if (customerSocketId) {
            io.to(customerSocketId).emit('booking-expired', {
              bookingId,
              message: 'No providers accepted your request in time.',
            });
          }
        }
      } catch (err) {
        logger.error('Error handling booking expiry event:', err);
      }
    });

    // 7. Start server
    server.listen(config.port, () => {
      logger.info(`🚀 Server running in ${config.env} mode on port ${config.port}`);
      logger.info(`📡 API Base: http://localhost:${config.port}/api/v1`);
      logger.info(`🔌 Socket.IO enabled`);
      logger.info(`🔴 Redis-backed features: Socket Store, Expiry Scheduler, Cache, Rate Limiting`);
    });

    // 8. Unhandled Rejection Handler
    process.on('unhandledRejection', (err) => {
      logger.error('UNHANDLED REJECTION 💥 Shutting down...', {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      server.close(() => process.exit(1));
    });

    // 9. Graceful Shutdown (SIGTERM)
    process.on('SIGTERM', async () => {
      logger.info('👋 SIGTERM received. Performing graceful shutdown...');
      await disconnectRedis();
      server.close(() => {
        logger.info('💤 Process terminated.');
      });
    });

    // 10. Graceful Shutdown (SIGINT — Ctrl+C)
    process.on('SIGINT', async () => {
      logger.info('👋 SIGINT received. Performing graceful shutdown...');
      await disconnectRedis();
      server.close(() => {
        logger.info('💤 Process terminated.');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
