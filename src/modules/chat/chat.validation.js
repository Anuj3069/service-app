const Joi = require('joi');
const { objectId } = require('../../shared/validators/common.validators');

const bookingChatParamsSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

const sendMessageSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    message: Joi.string().trim().min(1).max(1000).required(),
  }),
};

module.exports = {
  bookingChatParamsSchema,
  sendMessageSchema,
};
