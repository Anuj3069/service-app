/**
 * src/modules/admin/admin.validation.js — Admin Request Schemas
 */

const Joi = require('joi');
const { ROLES } = require('../../shared/utils/constants');
const { objectId, paginationQuery } = require('../../shared/validators/common.validators');

const listUsersSchema = {
  query: paginationQuery.keys({
    role: Joi.string().valid(ROLES.CUSTOMER, ROLES.WORKER, ROLES.ADMIN).optional(),
    isActive: Joi.boolean().optional(),
    search: Joi.string().trim().optional(),
  }),
};

const toggleUserStatusSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    isActive: Joi.boolean().required().messages({
      'any.required': 'isActive boolean is required',
    }),
  }),
};

const updateUserRoleSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    role: Joi.string().valid(ROLES.CUSTOMER, ROLES.WORKER, ROLES.ADMIN).required().messages({
      'any.required': 'role is required',
      'any.only': `role must be one of: ${Object.values(ROLES).join(', ')}`,
    }),
  }),
};

const listProvidersSchema = {
  query: paginationQuery.keys({
    isVerified: Joi.boolean().optional(),
    isAvailable: Joi.boolean().optional(),
    skills: Joi.alternatives().try(Joi.array().items(Joi.string().trim()), Joi.string().trim()).optional(),
  }),
};

const verifyProviderSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    isVerified: Joi.boolean().required().messages({
      'any.required': 'isVerified boolean is required',
    }),
  }),
};

const updateProviderSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    skills: Joi.array().items(Joi.string().trim()).optional(),
    isAvailable: Joi.boolean().optional(),
    address: Joi.string().trim().optional(),
    coordinates: Joi.array().items(Joi.number()).length(2).optional(),
  }),
};

const createCategorySchema = {
  body: Joi.object({
    name: Joi.string().trim().required().messages({
      'any.required': 'Category name is required',
    }),
    icon: Joi.string().trim().optional(),
    description: Joi.string().trim().optional(),
  }),
};

const updateCategorySchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    name: Joi.string().trim().optional(),
    icon: Joi.string().trim().optional(),
    description: Joi.string().trim().optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const createServiceSchema = {
  body: Joi.object({
    name: Joi.string().trim().required().messages({
      'any.required': 'Service name is required',
    }),
    category: objectId.required().messages({
      'any.required': 'Category ID is required',
    }),
    description: Joi.string().trim().optional(),
    basePrice: Joi.number().min(0).required().messages({
      'any.required': 'Base price is required',
      'number.min': 'Base price cannot be negative',
    }),
    duration: Joi.number().integer().min(15).required().messages({
      'any.required': 'Duration is required',
      'number.min': 'Minimum duration is 15 minutes',
    }),
    requiredSkills: Joi.array().items(Joi.string().trim()).optional(),
    searchRadiusKm: Joi.number().min(1).max(50).optional(),
    pricePerKm: Joi.number().min(0).optional(),
  }),
};

const updateServiceSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    name: Joi.string().trim().optional(),
    category: objectId.optional(),
    description: Joi.string().trim().optional(),
    basePrice: Joi.number().min(0).optional(),
    duration: Joi.number().integer().min(15).optional(),
    requiredSkills: Joi.array().items(Joi.string().trim()).optional(),
    searchRadiusKm: Joi.number().min(1).max(50).optional(),
    pricePerKm: Joi.number().min(0).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const listBookingsSchema = {
  query: paginationQuery.keys({
    status: Joi.string().optional(),
    userId: objectId.optional(),
    providerId: objectId.optional(),
  }),
};

const cancelBookingSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    cancellationReason: Joi.string().trim().required().messages({
      'any.required': 'Cancellation reason is required',
    }),
  }),
};

const listPaymentsSchema = {
  query: paginationQuery.keys({
    status: Joi.string().valid('pending', 'paid', 'failed').optional(),
  }),
};

const overridePaymentSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string().valid('pending', 'paid', 'failed').required().messages({
      'any.required': 'Payment status is required',
      'any.only': 'Status must be pending, paid, or failed',
    }),
  }),
};

module.exports = {
  listUsersSchema,
  toggleUserStatusSchema,
  updateUserRoleSchema,
  listProvidersSchema,
  verifyProviderSchema,
  updateProviderSchema,
  createCategorySchema,
  updateCategorySchema,
  createServiceSchema,
  updateServiceSchema,
  listBookingsSchema,
  cancelBookingSchema,
  listPaymentsSchema,
  overridePaymentSchema,
};
