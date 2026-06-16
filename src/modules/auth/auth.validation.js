/**
 * src/modules/auth/auth.validation.js — Auth Request Schemas
 *
 * Joi validation schemas for registration and login.
 */

const Joi = require('joi');
const { ROLES } = require('../../shared/utils/constants');

const registerSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(50).required()
      .messages({
        'string.min': 'Name must be at least 2 characters',
        'any.required': 'Name is required',
      }),
    email: Joi.string().email().lowercase().trim().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    phone: Joi.string().pattern(/^\+?[\d\s-]{10,15}$/).optional()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number',
      }),
    password: Joi.string().min(6).max(128)
      .when('role', {
        is: ROLES.WORKER,
        then: Joi.required(),
        otherwise: Joi.optional()
      })
      .messages({
        'string.min': 'Password must be at least 6 characters',
        'any.required': 'Password is required',
      }),
    role: Joi.string().valid(ROLES.CUSTOMER, ROLES.WORKER).default(ROLES.CUSTOMER)
      .messages({
        'any.only': `Role must be either '${ROLES.CUSTOMER}' or '${ROLES.WORKER}'`,
      }),
  }),
};

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().trim().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    password: Joi.string().required()
      .messages({
        'any.required': 'Password is required',
      }),
    expectedRole: Joi.string().valid(ROLES.CUSTOMER, ROLES.WORKER).optional()
      .messages({
        'any.only': `expectedRole must be either '${ROLES.CUSTOMER}' or '${ROLES.WORKER}'`,
      }),
  }),
};

const sendOtpSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().trim().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
  }),
};

const verifyOtpSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().trim().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    otp: Joi.string().length(6).pattern(/^\d+$/).required()
      .messages({
        'string.length': 'OTP must be exactly 6 digits',
        'string.pattern.base': 'OTP must contain only numbers',
        'any.required': 'OTP is required',
      }),
  }),
};

const forgotPasswordSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().trim().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
  }),
};

const resetPasswordSchema = {
  body: Joi.object({
    token: Joi.string().required()
      .messages({
        'any.required': 'Reset token is required',
      }),
    password: Joi.string().min(6).max(128).required()
      .messages({
        'string.min': 'New password must be at least 6 characters',
        'any.required': 'New password is required',
      }),
  }),
};

module.exports = { registerSchema, loginSchema, sendOtpSchema, verifyOtpSchema, forgotPasswordSchema, resetPasswordSchema };
