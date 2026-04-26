/**
 * src/modules/review/review.validation.js — Review Request Schemas
 */

const Joi = require('joi');
const { objectId } = require('../../shared/validators/common.validators');

const createReviewSchema = {
  body: Joi.object({
    bookingId: objectId.required()
      .messages({ 'any.required': 'Booking ID is required' }),
    rating: Joi.number().integer().min(1).max(5).required()
      .messages({
        'number.min': 'Rating must be at least 1',
        'number.max': 'Rating cannot exceed 5',
        'any.required': 'Rating is required',
      }),
    comment: Joi.string().trim().max(500).optional()
      .messages({
        'string.max': 'Comment cannot exceed 500 characters',
      }),
  }),
};

module.exports = { createReviewSchema };
