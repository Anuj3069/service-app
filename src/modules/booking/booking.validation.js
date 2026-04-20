/**
 * src/modules/booking/booking.validation.js — Booking Request Schemas
 */

const Joi = require('joi');
const { objectId } = require('../../shared/validators/common.validators');
const { BOOKING_STATUS } = require('../../shared/utils/constants');

const createBookingSchema = {
  body: Joi.object({
    providerId: objectId.required()
      .messages({ 'any.required': 'Provider ID is required' }),
    serviceId: objectId.required()
      .messages({ 'any.required': 'Service ID is required' }),
    date: Joi.date().iso().required()
      .messages({
        'any.required': 'Booking date is required',
      }),
    slot: Joi.string()
      .pattern(/^\d{2}:\d{2}-\d{2}:\d{2}$/)
      .required()
      .messages({
        'string.pattern.base': 'Slot must be in format HH:MM-HH:MM',
        'any.required': 'Time slot is required',
      }),
    price: Joi.number().min(0).required()
      .messages({
        'number.min': 'Price cannot be negative',
        'any.required': 'Price is required',
      }),
  }),
};

const getBookingByIdSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

const bookingActionSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

const listBookingsSchema = {
  query: Joi.object({
    status: Joi.string()
      .valid(...Object.values(BOOKING_STATUS))
      .optional(),
  }),
};

module.exports = {
  createBookingSchema,
  getBookingByIdSchema,
  bookingActionSchema,
  listBookingsSchema,
};
