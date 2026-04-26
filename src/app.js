/**
 * src/app.js — Express Application Setup
 *
 * Configures middleware, mounts routes, and sets up error handling.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./config/logger');
const { errorHandler, notFoundHandler } = require('./shared/middleware/error.middleware');

// ── Import Route Modules ────────────────────────────────────
const authRoutes = require('./modules/auth/auth.routes');
const serviceRoutes = require('./modules/service/service.routes');
const providerRoutes = require('./modules/provider/provider.routes');
const matchRoutes = require('./modules/match/match.routes');
const bookingRoutes = require('./modules/booking/booking.routes');
const reviewRoutes = require('./modules/review/review.routes');

const app = express();

// ── Security Middleware ─────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.env === 'production' ? config.corsOrigin : '*',
  credentials: true,
}));

// ── Body Parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Request Logging ─────────────────────────────────────────
if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  }));
}

// ── Health Check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── API Routes ──────────────────────────────────────────────
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/user/services`, serviceRoutes);
app.use(`${API_PREFIX}/worker/profile`, providerRoutes);
app.use(`${API_PREFIX}/user/match`, matchRoutes);

// Booking routes handle both /user/bookings and /worker/bookings
app.use(`${API_PREFIX}`, bookingRoutes);

app.use(`${API_PREFIX}/user/reviews`, reviewRoutes);

// ── 404 Handler ─────────────────────────────────────────────
app.use(notFoundHandler);

// ── Global Error Handler ────────────────────────────────────
app.use(errorHandler);

module.exports = app;
