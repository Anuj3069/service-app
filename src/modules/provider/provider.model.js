/**
 * src/modules/provider/provider.model.js — Provider Profile Schema
 *
 * Extends a User (role=worker) with professional details:
 * skills, availability, location, verification status.
 */

const mongoose = require('mongoose');
const { DAYS_OF_WEEK } = require('../../shared/utils/constants');

const availabilitySlotSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: String,
      enum: DAYS_OF_WEEK,
      required: true,
    },
    slots: [{
      type: String, // Format: "09:00-10:00"
      validate: {
        validator: (v) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v),
        message: 'Slot must be in format HH:MM-HH:MM',
      },
    }],
  },
  { _id: false }
);

const providerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    skills: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
      address: {
        type: String,
        trim: true,
      },
    },
    availability: [availabilitySlotSchema],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    totalJobs: {
      type: Number,
      default: 0,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isAvailable: {
      type: Boolean,
      default: true, // Online/offline toggle
    },
    fcmToken: {
      type: String,
      default: null,
    },
    kyc: {
      documentType: {
        type: String,
        enum: ['aadhaar', 'pan', 'passport', 'driving_license'],
      },
      documentUrl: {
        type: String,
      },
      status: {
        type: String,
        enum: ['not_submitted', 'pending', 'approved', 'rejected'],
        default: 'not_submitted',
        index: true,
      },
      rejectionReason: {
        type: String,
        trim: true,
      },
      submittedAt: {
        type: Date,
      },
      reviewedAt: {
        type: Date,
      },
    },
    bankDetails: {
      accountHolderName: { type: String, trim: true },
      accountNumber:     { type: String, trim: true },
      ifscCode:          { type: String, trim: true, uppercase: true },
      bankName:          { type: String, trim: true },
      upiId:             { type: String, trim: true },
      submittedAt:       { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────
providerSchema.index({ skills: 1 });
providerSchema.index({ isVerified: 1, isAvailable: 1 });
providerSchema.index({ 'location': '2dsphere' }); // For geo queries (future)
providerSchema.index({ rating: -1, totalJobs: -1 }); // For sorting in match

const Provider = mongoose.model('Provider', providerSchema);

module.exports = Provider;
