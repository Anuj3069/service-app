/**
 * src/modules/address/address.validation.js — Address Request Schemas
 */

const Joi = require('joi');
const { objectId } = require('../../shared/validators/common.validators');

const locationSchema = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  coordinates: Joi.array()
    .ordered(
      Joi.number().min(-180).max(180).required(),
      Joi.number().min(-90).max(90).required()
    )
    .length(2)
    .required()
    .messages({
      'array.length': 'Coordinates must contain exactly [longitude, latitude]',
    }),
});

const createAddressSchema = {
  body: Joi.object({
    label: Joi.string().valid('home', 'work', 'other').default('other'),
    customLabel: Joi.string().trim().max(50).optional(),
    fullAddress: Joi.string().trim().max(500).required()
      .messages({ 'any.required': 'Full address is required' }),
    addressLine2: Joi.string().trim().max(200).optional().allow(''),
    city: Joi.string().trim().max(100).optional().allow(''),
    state: Joi.string().trim().max(100).optional().allow(''),
    pincode: Joi.string().trim().pattern(/^\d{4,10}$/).optional().allow('')
      .messages({ 'string.pattern.base': 'Please provide a valid pincode' }),
    location: locationSchema.required()
      .messages({ 'any.required': 'Location coordinates are required' }),
    placeId: Joi.string().trim().optional().allow(''),
    isDefault: Joi.boolean().default(false),
  }),
};

const updateAddressSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    label: Joi.string().valid('home', 'work', 'other').optional(),
    customLabel: Joi.string().trim().max(50).optional().allow(''),
    fullAddress: Joi.string().trim().max(500).optional(),
    addressLine2: Joi.string().trim().max(200).optional().allow(''),
    city: Joi.string().trim().max(100).optional().allow(''),
    state: Joi.string().trim().max(100).optional().allow(''),
    pincode: Joi.string().trim().pattern(/^\d{4,10}$/).optional().allow('')
      .messages({ 'string.pattern.base': 'Please provide a valid pincode' }),
    location: locationSchema.optional(),
    placeId: Joi.string().trim().optional().allow(''),
    isDefault: Joi.boolean().optional(),
  }).min(1).messages({
    'object.min': 'At least one field is required for update',
  }),
};

const addressIdSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

module.exports = {
  createAddressSchema,
  updateAddressSchema,
  addressIdSchema,
};
