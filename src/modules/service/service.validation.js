/**
 * src/modules/service/service.validation.js — Service Request Schemas
 */

const Joi = require('joi');
const { objectId } = require('../../shared/validators/common.validators');

const getServiceByIdSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

module.exports = { getServiceByIdSchema };
