/**
 * src/modules/service/service.model.js — Service & Category Schemas
 *
 * Category groups related services (e.g., "Plumbing", "Electrical").
 * Service represents a specific offering under a category.
 */

const mongoose = require('mongoose');

// ── Category Schema ─────────────────────────────────────────
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
    },
    icon: {
      type: String,
      default: '🔧',
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: populate services belonging to this category
categorySchema.virtual('services', {
  ref: 'Service',
  localField: '_id',
  foreignField: 'category',
});

// ── Service Schema ──────────────────────────────────────────
const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Price cannot be negative'],
    },
    duration: {
      type: Number, // Duration in minutes
      required: [true, 'Duration is required'],
      min: [15, 'Minimum duration is 15 minutes'],
    },
    requiredSkills: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────
serviceSchema.index({ category: 1, isActive: 1 });
serviceSchema.index({ requiredSkills: 1 });

const Category = mongoose.model('Category', categorySchema);
const Service = mongoose.model('Service', serviceSchema);

module.exports = { Category, Service };
