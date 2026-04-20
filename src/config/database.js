/**
 * src/config/database.js — MongoDB Connection
 *
 * Connects to MongoDB with retry logic and event logging.
 */

const mongoose = require('mongoose');
const config = require('./index');
const logger = require('./logger');

const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      // Mongoose 8 uses these defaults, but being explicit for clarity
      autoIndex: config.env !== 'production', // Don't auto-build indexes in production
    });

    logger.info(`✅ MongoDB connected: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);

    // ── Connection Events ─────────────────────────────────
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected.');
    });

    return conn;
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDatabase;
