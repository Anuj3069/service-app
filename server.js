/**
 * server.js — Application Entry Point
 *
 * Connects to the database, starts the HTTP server,
 * and handles graceful shutdown.
 */

require('dotenv').config();

const config = require('./src/config');
const logger = require('./src/config/logger');
const connectDatabase = require('./src/config/database');
const app = require('./src/app');
const http = require('http');
const { Server } = require('socket.io');

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

    // 2. Setup HTTP server and Socket.IO
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: config.env === 'production' ? config.corsOrigin : '*',
        credentials: true,
      },
    });

    // Store io and userSockets map in app so routes can access them
    app.set('io', io);
    const userSockets = new Map();
    app.set('userSockets', userSockets);

    // Handle Socket Connections & User Mapping
    io.on('connection', (socket) => {
      logger.info(`⚡ Socket connected: ${socket.id}`);

      socket.on('register', (data) => {
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
        
        userSockets.set(userId, socket.id);
        logger.info(`👤 User registered to socket: ${userId} -> ${socket.id}`);
      });

      socket.on('disconnect', () => {
        // Find and remove user mapping on disconnect
        for (const [userId, sId] of userSockets.entries()) {
          if (sId === socket.id) {
            userSockets.delete(userId);
            logger.info(`🔴 User disconnected: ${userId} (${socket.id})`);
            break;
          }
        }
      });
    });

    // 3. Start server
    server.listen(config.port, () => {
      logger.info(`🚀 Server running in ${config.env} mode on port ${config.port}`);
      logger.info(`📡 API Base: http://localhost:${config.port}/api/v1`);
      logger.info(`🔌 Socket.IO enabled`);
    });

    // 3. Unhandled Rejection Handler
    process.on('unhandledRejection', (err) => {
      logger.error('UNHANDLED REJECTION 💥 Shutting down...', {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      server.close(() => process.exit(1));
    });

    // 4. Graceful Shutdown (SIGTERM)
    process.on('SIGTERM', () => {
      logger.info('👋 SIGTERM received. Performing graceful shutdown...');
      server.close(() => {
        logger.info('💤 Process terminated.');
      });
    });

    // 5. Graceful Shutdown (SIGINT — Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('👋 SIGINT received. Performing graceful shutdown...');
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
