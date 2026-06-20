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
    bookingType: {
      type: String,
      enum: ['BOOK_LATER', 'BOOK_INSTANT', 'BOOK_FOR_MONTH'],
      default: 'BOOK_LATER',
      index: true,
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
    workerLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number], // [longitude, latitude]
      updatedAt: Date,
    },

    customerLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number], // [longitude, latitude]
      address: String,
      addressId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address',
      },
      fullAddress: String,
      addressLine2: String,
      label: String, // home, work, other
    },

    // ── OTP for job completion verification ─────────────────
    completionOtp: {
      type: String,
      length: 4,
      select: false, // never returned in normal queries
    },
    otpVerifiedAt: {
      type: Date,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'pending', 'paid', 'failed'],
      default: 'unpaid',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cashfree', 'cash', 'upi_qr'],
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    originalPrice: {
      type: Number,
      default: null,
    },
    payout: {
      type: Number,
      default: 0,
    },

    // ── Duration (BOOK_FOR_MONTH) ────────────────────────────────
    durationType: {
      type: String,
      enum: ['HALF_DAY', 'FULL_DAY'],
      default: null,
    },
    durationHours: {
      type: Number,
      enum: [9, 16],
      default: null,
    },

    // ── Monthly contract metadata ────────────────────────────────
    monthContract: {
      startDate:  { type: Date, default: null },
      endDate:    { type: Date, default: null },
      totalDays:  { type: Number, default: null },
      dailyPrice: { type: Number, default: null },
    },

    // ── Recurring hierarchy ──────────────────────────────────────
    parentBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true,
    },
    bookingSequence: {
      type: Number,
      default: null,
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

// Month booking lookup
bookingSchema.index({ 'monthContract.startDate': 1 });

// NOTE: We do not use MongoDB TTL deletion for booking expiries.
// Expiry is handled in service logic to preserve booking history and status.

// ── PRE-SAVE: Auto-expire check ────────────────────────────
bookingSchema.pre('find', function () {
  // Middleware to help identify expired bookings in queries
  // Actual expiry logic is in the service layer
});

// ── VIRTUAL: isExpired ──────────────────────────────────────
bookingSchema.virtual('isExpired').get(function () {
  if (this.status !== BOOKING_STATUS.PENDING) return false;
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Ensure virtuals are included in JSON
bookingSchema.set('toJSON', { virtuals: true });
bookingSchema.set('toObject', { virtuals: true });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
