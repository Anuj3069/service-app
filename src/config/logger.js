/**
 * src/config/logger.js — Winston Logger
 *
 * Structured logging with console + file transports.
 * JSON format in production, colorized in development.
 */

const winston = require('winston');

const config = {
  level: process.env.LOG_LEVEL || 'info',
  env: process.env.NODE_ENV || 'development',
};

const logger = winston.createLogger({
  level: config.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'service-booking' },
  transports: [
    // Write errors to error.log
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// In development, also log to console with colors
if (config.env !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

module.exports = logger;
