/**
 * src/modules/admin/promo.model.js — Promo Code Schema
 *
 * Manages promotional coupons, discount parameters, and validity logic.
 */

const mongoose = require('mongoose');

const promoSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Promo code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'flat'],
      default: 'percentage',
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value cannot be negative'],
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: [0, 'Minimum order amount cannot be negative'],
    },
    maxDiscountAmount: {
      type: Number,
      default: 0,
      min: [0, 'Maximum discount amount cannot be negative'],
    },
    usageLimit: {
      type: Number,
      default: null, // null means unlimited
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helper method to check if the promo code is currently valid
promoSchema.methods.isValid = function (bookingAmount) {
  if (!this.isActive) return { valid: false, reason: 'Promo code is inactive' };
  
  const now = new Date();
  if (now < this.startDate) return { valid: false, reason: 'Promo code has not started yet' };
  if (now > this.endDate) return { valid: false, reason: 'Promo code has expired' };
  
  if (this.usageLimit !== null && this.usageCount >= this.usageLimit) {
    return { valid: false, reason: 'Promo code usage limit has been reached' };
  }
  
  if (bookingAmount < this.minOrderAmount) {
    return { valid: false, reason: `Minimum booking amount of ₹${this.minOrderAmount} required` };
  }
  
  return { valid: true };
};

// Helper method to calculate the discount value
promoSchema.methods.calculateDiscount = function (bookingAmount) {
  let discount = 0;
  if (this.discountType === 'flat') {
    discount = this.discountValue;
  } else if (this.discountType === 'percentage') {
    discount = (this.discountValue / 100) * bookingAmount;
    if (this.maxDiscountAmount > 0 && discount > this.maxDiscountAmount) {
      discount = this.maxDiscountAmount;
    }
  }
  
  // Ensure discount does not exceed booking amount
  return Math.min(discount, bookingAmount);
};

module.exports = mongoose.model('PromoCode', promoSchema);
