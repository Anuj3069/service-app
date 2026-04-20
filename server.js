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

    // 2. Start Express server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Server running in ${config.env} mode on port ${config.port}`);
      logger.info(`📡 API Base: http://localhost:${config.port}/api/v1`);
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
