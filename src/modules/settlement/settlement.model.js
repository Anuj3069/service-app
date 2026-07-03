/**
 * src/modules/settlement/settlement.model.js — Settlement Schema
 *
 * Tracks payout requests from workers to admin.
 * A settlement batches all completed+paid unsettled bookings into one record.
 */

const mongoose = require('mongoose');
const { SETTLEMENT_STATUS } = require('../../shared/utils/constants');

const bankSnapshotSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, trim: true },
    accountNumber:     { type: String, trim: true },
    ifscCode:          { type: String, trim: true, uppercase: true },
    bankName:          { type: String, trim: true },
    upiId:             { type: String, trim: true },
  },
  { _id: false }
);

const settlementSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: [true, 'Provider ID is required'],
      index: true,
    },
    bookingIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
      },
    ],
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    status: {
      type: String,
      enum: Object.values(SETTLEMENT_STATUS),
      default: SETTLEMENT_STATUS.PENDING,
      index: true,
    },
    bankSnapshot: {
      type: bankSnapshotSchema,
      required: [true, 'Bank snapshot is required'],
    },
    adminNote: {
      type: String,
      trim: true,
      default: null,
    },
    // Amount deducted from online payout to cover pending cash commissions
    cashCommissionDeducted: {
      type: Number,
      default: 0,
      min: 0,
    },
    // CashCommission document IDs that were netted in this settlement
    cashCommissionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CashCommission',
      },
    ],
    requestedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    settledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────
settlementSchema.index({ providerId: 1, status: 1 });
settlementSchema.index({ status: 1, createdAt: -1 });

const Settlement = mongoose.model('Settlement', settlementSchema);

module.exports = Settlement;
