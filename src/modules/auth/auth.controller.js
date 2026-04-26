/**
 * src/modules/auth/auth.controller.js — Auth HTTP Handlers
 *
 * Thin controllers: parse request → call service → send response.
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const authService = require('./auth.service');

/**
 * POST /api/v1/auth/register
 * Register a new user (customer or worker)
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role } = req.body;

  const result = await authService.register({ name, email, phone, password, role });

  ApiResponse.created(res, result, 'Registration successful.');
});

/**
 * POST /api/v1/auth/login
 * Login with email + password
 */
const login = asyncHandler(async (req, res) => {
  const { email, password, expectedRole } = req.body;

  const result = await authService.login(email, password, expectedRole);

  ApiResponse.ok(res, result, 'Login successful.');
});

module.exports = { register, login };
