/**
 * src/modules/address/address.model.js — Address Schema
 *
 * Stores saved customer addresses with labels (home, work, other).
 * Supports one default address per user.
 * Uses 2dsphere index for geospatial queries.
 */

const mongoose = require('mongoose');

const ADDRESS_LABELS = ['home', 'work', 'other'];
const MAX_ADDRESSES_PER_USER = 10;

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    label: {
      type: String,
      enum: ADDRESS_LABELS,
      default: 'other',
    },
    customLabel: {
      type: String,
      trim: true,
      maxlength: [50, 'Custom label cannot exceed 50 characters'],
    },
    fullAddress: {
      type: String,
      required: [true, 'Full address is required'],
      trim: true,
      maxlength: [500, 'Address cannot exceed 500 characters'],
    },
    addressLine2: {
      type: String,
      trim: true,
      maxlength: [200, 'Address line 2 cannot exceed 200 characters'],
    },
    city: {
      type: String,
      trim: true,
      maxlength: [100, 'City name cannot exceed 100 characters'],
    },
    state: {
      type: String,
      trim: true,
      maxlength: [100, 'State name cannot exceed 100 characters'],
    },
    pincode: {
      type: String,
      trim: true,
      match: [/^\d{4,10}$/, 'Please provide a valid pincode'],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Coordinates are required'],
        validate: {
          validator: function (v) {
            return (
              Array.isArray(v) &&
              v.length === 2 &&
              v[0] >= -180 && v[0] <= 180 &&
              v[1] >= -90 && v[1] <= 90
            );
          },
          message: 'Coordinates must be [longitude, latitude] within valid ranges',
        },
      },
    },
    placeId: {
      type: String,
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ── INDEXES ─────────────────────────────────────────────────
// Fast lookup for user's addresses, default first
addressSchema.index({ userId: 1, isDefault: -1, createdAt: -1 });

// Geospatial index for location-based queries
addressSchema.index({ location: '2dsphere' });

// ── PRE-SAVE: Ensure only one default per user ─────────────
addressSchema.pre('save', async function (next) {
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id }, isDefault: true },
      { isDefault: false }
    );
  }
  next();
});

// ── STATICS ─────────────────────────────────────────────────
addressSchema.statics.ADDRESS_LABELS = ADDRESS_LABELS;
addressSchema.statics.MAX_ADDRESSES_PER_USER = MAX_ADDRESSES_PER_USER;

const Address = mongoose.model('Address', addressSchema);

module.exports = Address;
