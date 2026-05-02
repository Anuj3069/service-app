/**
 * src/modules/auth/auth.controller.js — Auth HTTP Handlers
 *
 * Thin controllers: parse request → call service → send response.
 * Includes logout via Redis-backed JWT token blacklisting.
 */

const jwt = require('jsonwebtoken');
const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const authService = require('./auth.service');
const tokenBlacklist = require('../../shared/utils/token-blacklist');

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

/**
 * POST /api/v1/auth/logout
 * Logout — blacklists the current JWT token in Redis
 * The token remains blacklisted until its natural expiry time.
 */
const logout = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (token) {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      await tokenBlacklist.add(token, ttl);
    }
  }

  ApiResponse.ok(res, null, 'Logged out successfully.');
});

module.exports = { register, login, logout };
