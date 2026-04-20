/**
 * src/modules/match/match.validation.js — Match Request Schemas
 */

const Joi = require('joi');
const { objectId } = require('../../shared/validators/common.validators');

const findMatchSchema = {
  body: Joi.object({
    serviceId: objectId.required()
      .messages({ 'any.required': 'Service ID is required' }),
    date: Joi.date().iso().min('now').required()
      .messages({
        'date.min': 'Date must be in the future',
        'any.required': 'Date is required',
      }),
    slot: Joi.string()
      .pattern(/^\d{2}:\d{2}-\d{2}:\d{2}$/)
      .required()
      .messages({
        'string.pattern.base': 'Slot must be in format HH:MM-HH:MM (e.g., 09:00-10:00)',
        'any.required': 'Time slot is required',
      }),
  }),
};

module.exports = { findMatchSchema };
