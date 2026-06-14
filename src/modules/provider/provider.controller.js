/**
 * src/modules/provider/provider.controller.js — Provider HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const AppError = require('../../shared/utils/api-error');
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

/**
 * PUT /api/v1/worker/location
 * Update worker's current GPS location
 */
const updateLocation = asyncHandler(async (req, res) => {
  const provider = await providerService.updateLocation(req.user.id, req.body);
  ApiResponse.ok(res, { provider }, 'Location updated successfully.');
});

const submitKyc = asyncHandler(async (req, res) => {
  const { documentType } = req.body;
  const file = req.file; // Multer adds file object
  if (!file) {
    throw AppError.badRequest('KYC document file is required');
  }
  const documentUrl = file.cloudinaryUrl; // Set by cloudinaryUploadMiddleware
  const provider = await providerService.submitKyc(req.user.id, documentType, documentUrl);
  ApiResponse.ok(res, { provider }, 'KYC document submitted successfully and is pending verification.');
});

/**
 * GET /api/v1/worker/profile/bank-details
 * Get own bank details
 */
const getBankDetails = asyncHandler(async (req, res) => {
  const provider = await providerService.getProfile(req.user.id);
  ApiResponse.ok(res, { bankDetails: provider.bankDetails ?? null }, 'Bank details retrieved.');
});

/**
 * PUT /api/v1/worker/profile/bank-details
 * Save / update bank details for payouts
 */
const updateBankDetails = asyncHandler(async (req, res) => {
  const provider = await providerService.updateBankDetails(req.user.id, req.body);
  ApiResponse.ok(res, { bankDetails: provider.bankDetails }, 'Bank details saved successfully.');
});

module.exports = {
  createProfile,
  getProfile,
  updateProfile,
  updateLocation,
  submitKyc,
  getBankDetails,
  updateBankDetails,
};
