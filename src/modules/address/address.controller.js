/**
 * src/modules/address/address.controller.js — Address HTTP Handlers
 *
 * CRUD endpoints for customer saved addresses.
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const addressService = require('./address.service');

/**
 * POST /api/v1/user/addresses
 * Create a new saved address
 */
const createAddress = asyncHandler(async (req, res) => {
  const address = await addressService.createAddress(req.user.id, req.body);
  ApiResponse.created(res, { address }, 'Address saved successfully.');
});

/**
 * GET /api/v1/user/addresses
 * Get all saved addresses for the current user
 */
const getAddresses = asyncHandler(async (req, res) => {
  const addresses = await addressService.getAddresses(req.user.id);
  ApiResponse.ok(res, { addresses, count: addresses.length }, 'Addresses retrieved successfully.');
});

/**
 * GET /api/v1/user/addresses/default
 * Get the default address for the current user
 */
const getDefaultAddress = asyncHandler(async (req, res) => {
  const address = await addressService.getDefaultAddress(req.user.id);
  ApiResponse.ok(res, { address }, 'Default address retrieved successfully.');
});

/**
 * PUT /api/v1/user/addresses/:id
 * Update a saved address
 */
const updateAddress = asyncHandler(async (req, res) => {
  const address = await addressService.updateAddress(req.user.id, req.params.id, req.body);
  ApiResponse.ok(res, { address }, 'Address updated successfully.');
});

/**
 * PUT /api/v1/user/addresses/:id/default
 * Set an address as the default
 */
const setDefaultAddress = asyncHandler(async (req, res) => {
  const address = await addressService.setDefaultAddress(req.user.id, req.params.id);
  ApiResponse.ok(res, { address }, 'Default address updated successfully.');
});

/**
 * DELETE /api/v1/user/addresses/:id
 * Delete a saved address
 */
const deleteAddress = asyncHandler(async (req, res) => {
  await addressService.deleteAddress(req.user.id, req.params.id);
  ApiResponse.ok(res, null, 'Address deleted successfully.');
});

module.exports = {
  createAddress,
  getAddresses,
  getDefaultAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};
