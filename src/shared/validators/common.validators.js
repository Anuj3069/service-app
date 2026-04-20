/**
 * src/shared/validators/common.validators.js — Shared Joi Schemas
 *
 * Reusable validation schemas used across multiple modules.
 */

const Joi = require('joi');

// MongoDB ObjectId validation
const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .message('{{#label}} must be a valid MongoDB ObjectId');

// Pagination query params
const paginationQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().default('-createdAt'),
});

// Common ID param
const idParam = Joi.object({
  id: objectId.required(),
});

module.exports = {
  objectId,
  paginationQuery,
  idParam,
};
