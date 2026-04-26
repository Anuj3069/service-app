/**
 * src/modules/provider/provider.validation.js — Provider Request Schemas
 */

const Joi = require('joi');
const { DAYS_OF_WEEK } = require('../../shared/utils/constants');

const slotPattern = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

const createProfileSchema = {
  body: Joi.object({
    skills: Joi.array()
      .items(Joi.string().trim().lowercase())
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one skill is required',
        'any.required': 'Skills are required',
      }),
    location: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).optional(),
      address: Joi.string().trim().optional(),
    }).optional(),
    availability: Joi.array()
      .items(
        Joi.object({
          dayOfWeek: Joi.string().valid(...DAYS_OF_WEEK).required(),
          slots: Joi.array()
            .items(Joi.string().pattern(slotPattern).message('Slot must be in format HH:MM-HH:MM'))
            .min(1)
            .required(),
        })
      )
      .optional(),
  }),
};

const updateProfileSchema = {
  body: Joi.object({
    skills: Joi.array()
      .items(Joi.string().trim().lowercase())
      .min(1)
      .optional(),
    location: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).optional(),
      address: Joi.string().trim().optional(),
    }).optional(),
    availability: Joi.array()
      .items(
        Joi.object({
          dayOfWeek: Joi.string().valid(...DAYS_OF_WEEK).required(),
          slots: Joi.array()
            .items(Joi.string().pattern(slotPattern).message('Slot must be in format HH:MM-HH:MM'))
            .min(1)
            .required(),
        })
      )
      .optional(),
    isAvailable: Joi.boolean().optional(),
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update',
  }),
};

module.exports = { createProfileSchema, updateProfileSchema };
