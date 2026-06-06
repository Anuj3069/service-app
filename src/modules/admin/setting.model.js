/**
 * src/modules/admin/setting.model.js — System Settings Schema
 *
 * Singleton configuration document for platform-wide parameters.
 */

const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    commissionRate: {
      type: Number,
      default: 10, // 10% commission
      min: [0, 'Commission rate cannot be negative'],
      max: [100, 'Commission rate cannot exceed 100%'],
    },
    defaultSearchRadiusKm: {
      type: Number,
      default: 10, // 10 km
      min: [1, 'Search radius must be at least 1 km'],
      max: [50, 'Search radius cannot exceed 50 km'],
    },
    bookingExpiryMinutes: {
      type: Number,
      default: 2, // 2 minutes
      min: [1, 'Booking expiry must be at least 1 minute'],
      max: [60, 'Booking expiry cannot exceed 60 minutes'],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Setting', settingSchema);
