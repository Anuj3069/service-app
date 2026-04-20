/**
 * src/shared/middleware/validate.middleware.js — Request Validation
 *
 * Generic Joi validation middleware.
 * Validates request body, params, and/or query against a Joi schema.
 */

const AppError = require('../utils/api-error');

/**
 * Creates a validation middleware for the given Joi schema object.
 *
 * @param {object} schema - Object with optional keys: body, params, query
 *   Each value should be a Joi schema.
 * @returns {Function} Express middleware
 *
 * Usage:
 *   validate({ body: loginSchema })
 *   validate({ params: idParamSchema, body: updateSchema })
 */
const validate = (schema) => {
  return (req, res, next) => {
    const errors = {};

    // Validate each part of the request
    for (const key of ['body', 'params', 'query']) {
      if (schema[key]) {
        const { error, value } = schema[key].validate(req[key], {
          abortEarly: false,      // Return all errors, not just first
          stripUnknown: true,     // Remove unknown fields
          allowUnknown: false,
        });

        if (error) {
          errors[key] = error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message.replace(/"/g, ''),
          }));
        } else {
          // Replace request data with validated & sanitized data
          req[key] = value;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      const messages = Object.values(errors)
        .flat()
        .map((e) => e.message)
        .join('; ');

      return next(AppError.badRequest(`Validation failed: ${messages}`, errors));
    }

    next();
  };
};

module.exports = validate;
