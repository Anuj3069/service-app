/**
 * src/modules/admin/admin.validation.js — Admin Request Schemas
 */

const Joi = require('joi');
const { ROLES, SETTLEMENT_STATUS } = require('../../shared/utils/constants');
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
    allowMonthBooking: Joi.boolean().default(false),
    monthBasePrice: Joi.number().min(0).optional(),
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
    allowMonthBooking: Joi.boolean().optional(),
    monthBasePrice: Joi.number().min(0).optional(),
  }),
};

const toggleMonthBookingSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    allowMonthBooking: Joi.boolean().required().messages({
      'any.required': 'allowMonthBooking boolean is required',
    }),
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

const reviewKycSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    action: Joi.string().valid('approve', 'reject').required().messages({
      'any.required': 'action (approve or reject) is required',
      'any.only': 'action must be either approve or reject',
    }),
    rejectionReason: Joi.string().trim().when('action', {
      is: 'reject',
      then: Joi.required(),
      otherwise: Joi.optional()
    }).messages({
      'any.required': 'rejectionReason is required when action is reject',
    }),
  }),
};

const listSettlementsSchema = {
  query: paginationQuery.keys({
    status: Joi.string()
      .valid(...Object.values(SETTLEMENT_STATUS))
      .optional(),
    providerId: objectId.optional(),
  }),
};

const updateSettlementStatusSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string()
      .valid(
        SETTLEMENT_STATUS.PROCESSING,
        SETTLEMENT_STATUS.SETTLED,
        SETTLEMENT_STATUS.REJECTED
      )
      .required()
      .messages({
        'any.required': 'status is required',
        'any.only': 'status must be one of: processing, settled, rejected',
      }),
    adminNote: Joi.string().trim().optional(),
  }),
};

const listCashCommissionsSchema = {
  query: paginationQuery.keys({
    status: Joi.string().valid('pending', 'collected').optional(),
    providerId: objectId.optional(),
  }),
};

const markCommissionCollectedSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    note: Joi.string().trim().max(500).optional(),
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
  toggleMonthBookingSchema,
  listBookingsSchema,
  cancelBookingSchema,
  listPaymentsSchema,
  overridePaymentSchema,
  reviewKycSchema,
  listSettlementsSchema,
  updateSettlementStatusSchema,
  listCashCommissionsSchema,
  markCommissionCollectedSchema,
};
