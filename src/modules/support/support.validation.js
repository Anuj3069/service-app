const Joi = require('joi');
const { objectId } = require('../../shared/validators/common.validators');

const bookingIdParam = {
  params: Joi.object({
    bookingId: objectId.required(),
  }),
};

const ticketIdParam = {
  params: Joi.object({
    ticketId: objectId.required(),
  }),
};

const createTicketSchema = {
  params: Joi.object({
    bookingId: objectId.required(),
  }),
  body: Joi.object({
    issue: Joi.string().trim().min(5).max(500).required(),
  }),
};

const sendMessageSchema = {
  params: Joi.object({
    ticketId: objectId.required(),
  }),
  body: Joi.object({
    text: Joi.string().trim().min(1).max(2000).required(),
  }),
};

const updateStatusSchema = {
  params: Joi.object({
    ticketId: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string().valid('open', 'in_progress', 'closed').required(),
  }),
};

const listTicketsSchema = {
  query: Joi.object({
    status: Joi.string().valid('open', 'in_progress', 'closed'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
};

module.exports = {
  bookingIdParam,
  ticketIdParam,
  createTicketSchema,
  sendMessageSchema,
  updateStatusSchema,
  listTicketsSchema,
};
