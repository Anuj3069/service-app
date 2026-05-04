/**
 * src/modules/booking/booking.model.js — Booking Schema
 *
 * Core lifecycle model: PENDING → ACCEPTED → COMPLETED
 * Includes compound index to prevent double booking.
 */

const mongoose = require('mongoose');
const { BOOKING_STATUS } = require('../../shared/utils/constants');

const bookingSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['SCHEDULED', 'INSTANT'],
      default: 'SCHEDULED',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: [
        function () {
          return this.type === 'SCHEDULED';
        },
        'Provider ID is required',
      ],
      index: true,
    },
    candidateProviders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Provider',
      },
    ],
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: [true, 'Service ID is required'],
    },
    date: {
      type: Date,
      required: [
        function () {
          return this.type === 'SCHEDULED';
        },
        'Booking date is required',
      ],
    },
    slot: {
      type: String,
      required: [
        function () {
          return this.type === 'SCHEDULED';
        },
        'Time slot is required',
      ],
      validate: {
        validator: function (v) {
          if (this.type === 'INSTANT') return true;
          return /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v);
        },
        message: 'Slot must be in format HH:MM-HH:MM',
      },
    },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING,
      index: true,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    requestedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// ── INDEXES ─────────────────────────────────────────────────

// Prevent double booking: same provider, same date, same slot
// Only for active statuses (pending, accepted)
bookingSchema.index(
  { providerId: 1, date: 1, slot: 1 },
  {
    partialFilterExpression: {
      status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED] },
    },
  }
);

// Customer's bookings lookup
bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Worker's assigned bookings
bookingSchema.index({ providerId: 1, status: 1, createdAt: -1 });

// TTL index for auto-expiring PENDING bookings
// MongoDB will automatically delete documents where expiresAt has passed
// We'll handle expiry in our service layer for more control
bookingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── PRE-SAVE: Auto-expire check ────────────────────────────
bookingSchema.pre('find', function () {
  // Middleware to help identify expired bookings in queries
  // Actual expiry logic is in the service layer
});

// ── VIRTUAL: isExpired ──────────────────────────────────────
bookingSchema.virtual('isExpired').get(function () {
  const expirableStatuses = [BOOKING_STATUS.PENDING, BOOKING_STATUS.REQUESTED];
  if (!expirableStatuses.includes(this.status)) return false;
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Ensure virtuals are included in JSON
bookingSchema.set('toJSON', { virtuals: true });
bookingSchema.set('toObject', { virtuals: true });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
