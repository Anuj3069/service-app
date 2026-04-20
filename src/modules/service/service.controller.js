/**
 * src/modules/service/service.controller.js — Service HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const serviceService = require('./service.service');

/**
 * GET /api/v1/user/services
 * List all services grouped by category
 */
const getAllServices = asyncHandler(async (req, res) => {
  const categories = await serviceService.getAllServices();
  ApiResponse.ok(res, { categories }, 'Services retrieved successfully.');
});

/**
 * GET /api/v1/user/services/:id
 * Get a single service detail
 */
const getServiceById = asyncHandler(async (req, res) => {
  const service = await serviceService.getServiceById(req.params.id);
  ApiResponse.ok(res, { service }, 'Service retrieved successfully.');
});

module.exports = { getAllServices, getServiceById };
