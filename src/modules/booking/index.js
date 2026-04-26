/**
 * src/modules/booking/index.js — Booking Module Public API
 */

const bookingRoutes = require('./booking.routes');
const bookingService = require('./booking.service');
const Booking = require('./booking.model');

module.exports = { bookingRoutes, bookingService, Booking };
