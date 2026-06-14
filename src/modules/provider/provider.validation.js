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

const updateLocationSchema = {
  body: Joi.object({
    coordinates: Joi.array()
      .ordered(
        Joi.number().min(-180).max(180).required(), // longitude
        Joi.number().min(-90).max(90).required()    // latitude
      )
      .length(2)
      .required()
      .messages({
        'array.length': 'Coordinates must be [longitude, latitude]',
      }),
    address: Joi.string().trim().optional(),
  }),
};

const submitKycSchema = {
  body: Joi.object({
    documentType: Joi.string()
      .valid('aadhaar', 'pan', 'passport', 'driving_license')
      .required()
      .messages({
        'any.only': 'Document type must be one of: aadhaar, pan, passport, driving_license',
        'any.required': 'Document type is required',
      }),
  }),
};

const updateBankDetailsSchema = {
  body: Joi.object({
    accountHolderName: Joi.string().trim().required().messages({
      'any.required': 'Account holder name is required',
    }),
    accountNumber: Joi.string()
      .pattern(/^\d{9,18}$/)
      .required()
      .messages({
        'any.required': 'Account number is required',
        'string.pattern.base': 'Account number must be 9–18 digits',
      }),
    ifscCode: Joi.string()
      .pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .required()
      .messages({
        'any.required': 'IFSC code is required',
        'string.pattern.base': 'Invalid IFSC code format (e.g. HDFC0001234)',
      }),
    bankName: Joi.string().trim().required().messages({
      'any.required': 'Bank name is required',
    }),
    upiId: Joi.string().trim().optional(),
  }),
};

module.exports = {
  createProfileSchema,
  updateProfileSchema,
  updateLocationSchema,
  submitKycSchema,
  updateBankDetailsSchema,
};
