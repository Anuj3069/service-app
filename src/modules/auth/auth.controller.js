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
 * POST /api/v1/auth/otp/send
 * Request OTP for customer email
 */
const sendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await authService.sendOtp(email);
  ApiResponse.ok(res, result, 'OTP sent successfully.');
});

/**
 * POST /api/v1/auth/otp/verify
 * Verify OTP and log in customer
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const result = await authService.verifyOtp(email, otp);
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

/**
 * POST /api/v1/auth/refresh-token
 * Refresh access token using refresh token
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return ApiResponse.error(res, 'Refresh token is required', 400);
  }

  const result = await authService.refreshToken(refreshToken);

  ApiResponse.ok(res, result, 'Token refreshed successfully.');
});

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset link/token
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await authService.forgotPassword(email);
  ApiResponse.ok(res, result, result.message);
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password using reset token
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const result = await authService.resetPassword(token, password);
  ApiResponse.ok(res, result, result.message);
});

module.exports = { register, login, logout, refreshToken, sendOtp, verifyOtp, forgotPassword, resetPassword };
