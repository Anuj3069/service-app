/**
 * src/modules/settlement/settlement.validation.js — Settlement Request Schemas
 */

const Joi = require('joi');
const { paginationQuery, objectId } = require('../../shared/validators/common.validators');
const { SETTLEMENT_STATUS } = require('../../shared/utils/constants');

/**
 * Worker: list own settlements (pagination only)
 */
const listMySettlementsSchema = {
  query: paginationQuery,
};

/**
 * Admin: list all settlements with optional filters
 */
const listSettlementsSchema = {
  query: paginationQuery.keys({
    status: Joi.string()
      .valid(...Object.values(SETTLEMENT_STATUS))
      .optional(),
    providerId: objectId.optional(),
  }),
};

/**
 * Admin: update settlement status
 */
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

module.exports = {
  listMySettlementsSchema,
  listSettlementsSchema,
  updateSettlementStatusSchema,
};
