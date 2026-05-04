/**
 * src/config/index.js — Centralized Configuration
 *
 * Reads and validates all environment variables at startup.
 * If any required variable is missing, the app fails fast.
 */

require('dotenv').config();

const config = {
  // Application
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // MongoDB
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/service-booking-dev',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Booking
  booking: {
    expiryMinutes: parseInt(process.env.BOOKING_EXPIRY_MINUTES, 10) || 2,
    instantExpirySeconds: parseInt(process.env.INSTANT_BOOKING_EXPIRY_SECONDS, 10) || 300, // 5 minutes
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};

// ── Validation ──────────────────────────────────────────────
const requiredVars = [
  { key: 'jwt.secret', value: config.jwt.secret },
  { key: 'jwt.refreshSecret', value: config.jwt.refreshSecret },
];

const missing = requiredVars.filter((v) => !v.value);
if (missing.length > 0 && config.env !== 'test') {
  const keys = missing.map((v) => v.key).join(', ');
  console.error(`❌ FATAL: Missing required environment variables: ${keys}`);
  console.error('   Please check your .env file against .env.example');
  process.exit(1);
}

// Freeze to prevent accidental mutation
Object.freeze(config);
Object.freeze(config.jwt);
Object.freeze(config.booking);

module.exports = config;
