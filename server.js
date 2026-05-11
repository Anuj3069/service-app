/**
 * server.js — Application Entry Point
 *
 * Connects to MongoDB, Redis, starts the HTTP server with Socket.IO,
 * initializes Redis-backed services, and handles graceful shutdown.
 */

require('dotenv').config();

const config = require('./src/config');
const logger = require('./src/config/logger');
const connectDatabase = require('./src/config/database');
const { connectRedis, disconnectRedis } = require('./src/config/redis');
const app = require('./src/app');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { getRedis } = require('./src/config/redis');

// Redis-backed services
const socketRegistryService = require('./src/shared/services/socket-registry.service');
const notificationService = require('./src/shared/services/notification.service');
const expiryService = require('./src/shared/services/expiry.service');

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
    await connectRedis();

    // 3. Setup HTTP server and Socket.IO
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: config.env === 'production' ? config.corsOrigin : '*',
        credentials: true,
      },
    });

    // 4. Attach Socket.IO Redis Adapter for multi-server support
    const redis = getRedis();
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('🔌 Socket.IO Redis adapter attached (multi-server ready)');

    // 5. Store io in app so routes can access it (still needed for edge cases)
    app.set('io', io);

    // 6. Initialize Redis-backed services
    notificationService.initialize(io);
    expiryService.initialize(io);

    // Clear stale socket mappings from previous server run
    await socketRegistryService.clearAll();

    // 7. Handle Socket Connections via Redis-backed registry
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

        await socketRegistryService.registerUser(userId, socket.id);
      });

      socket.on('disconnect', async () => {
        const userId = await socketRegistryService.removeBySocketId(socket.id);
        if (!userId) {
          logger.debug(`Socket ${socket.id} disconnected (no user mapping found)`);
        }
      });
    });

    // 8. Start server
    server.listen(config.port, () => {
      logger.info(`🚀 Server running in ${config.env} mode on port ${config.port}`);
      logger.info(`📡 API Base: http://localhost:${config.port}/api/v1`);
      logger.info(`🔌 Socket.IO enabled (Redis-backed)`);
      logger.info(`🔴 Redis connected at ${config.redisUrl}`);
    });

    // 9. Unhandled Rejection Handler
    process.on('unhandledRejection', (err) => {
      logger.error('UNHANDLED REJECTION 💥 Shutting down...', {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      server.close(() => process.exit(1));
    });

    // 10. Graceful Shutdown (SIGTERM)
    process.on('SIGTERM', async () => {
      logger.info('👋 SIGTERM received. Performing graceful shutdown...');
      await disconnectRedis();
      server.close(() => {
        logger.info('💤 Process terminated.');
      });
    });

    // 11. Graceful Shutdown (SIGINT — Ctrl+C)
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
