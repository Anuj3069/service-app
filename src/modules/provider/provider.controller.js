/**
 * src/modules/provider/provider.controller.js — Provider HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const providerService = require('./provider.service');

/**
 * POST /api/v1/worker/profile
 * Create provider profile
 */
const createProfile = asyncHandler(async (req, res) => {
  const provider = await providerService.createProfile(req.user.id, req.body);
  ApiResponse.created(res, { provider }, 'Provider profile created successfully.');
});

/**
 * GET /api/v1/worker/profile
 * Get own provider profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const provider = await providerService.getProfile(req.user.id);
  ApiResponse.ok(res, { provider }, 'Provider profile retrieved successfully.');
});

/**
 * PUT /api/v1/worker/profile
 * Update provider profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const provider = await providerService.updateProfile(req.user.id, req.body);
  ApiResponse.ok(res, { provider }, 'Provider profile updated successfully.');
});

module.exports = { createProfile, getProfile, updateProfile };
