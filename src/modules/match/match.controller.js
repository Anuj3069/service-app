/**
 * src/modules/match/match.controller.js — Match HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const matchService = require('./match.service');

/**
 * POST /api/v1/user/match
 * Auto-match: find the best available provider for a service
 */
const findMatch = asyncHandler(async (req, res) => {
  const { serviceId, date, slot } = req.body;

  const match = await matchService.findMatch({ serviceId, date, slot });

  ApiResponse.ok(res, { match }, 'Provider matched successfully.');
});

module.exports = { findMatch };
