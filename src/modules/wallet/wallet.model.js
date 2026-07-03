/**
 * src/modules/wallet/wallet.model.js — CashCommission Schema
 *
 * Tracks commission owed to admin for every cash-paid booking.
 * When a worker collects cash from a customer they physically hold the full
 * booking price. This ledger records the admin's share (commissionAmount)
 * so it can be collected separately.
 *
 * Lifecycle:  pending → collected
 */

const mongoose = require('mongoose');

const cashCommissionSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: [true, 'Provider ID is required'],
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking ID is required'],
      unique: true, // one record per cash booking
      index: true,
    },
    // The commission owed: booking.price - booking.payout
    commissionAmount: {
      type: Number,
      required: [true, 'Commission amount is required'],
      min: [0, 'Commission amount cannot be negative'],
    },
    // Full booking price (snapshot for audit)
    bookingPrice: {
      type: Number,
      required: true,
    },
    // Worker's payout amount (snapshot for audit)
    workerPayout: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'collected'],
      default: 'pending',
      index: true,
    },
    collectedAt: {
      type: Date,
      default: null,
    },
    // Admin user who marked this as collected
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adminNote: {
      type: String,
      trim: true,
      default: null,
    },
    // Set when this commission is cleared via settlement netting (not manual collection)
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Settlement',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

cashCommissionSchema.index({ providerId: 1, status: 1 });
cashCommissionSchema.index({ status: 1, createdAt: -1 });

const CashCommission = mongoose.model('CashCommission', cashCommissionSchema);

module.exports = CashCommission;
