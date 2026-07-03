/**
 * src/modules/settlement/settlement.worker.controller.js — Worker Settlement HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const settlementService = require('./settlement.service');

/**
 * POST /api/v1/worker/settlement/request
 * Worker requests a payout settlement for all unsettled earnings
 */
const requestSettlement = asyncHandler(async (req, res) => {
  const { settlement, summary } = await settlementService.requestSettlement(req.user.id);
  ApiResponse.created(
    res,
    { settlement, summary },
    `Settlement request submitted. You will receive ₹${summary.netPayout}` +
    (summary.cashCommissionDeducted > 0
      ? ` (₹${summary.onlineEarnings} earned − ₹${summary.cashCommissionDeducted} cash commission).`
      : '.')
  );
});

/**
 * GET /api/v1/worker/settlement
 * List own settlement history
 */
const listMySettlements = asyncHandler(async (req, res) => {
  const { page, limit, sort } = req.query;
  const pagination = { page: Number(page) || 1, limit: Number(limit) || 20, sort };
  const result = await settlementService.listMySettlements(req.user.id, pagination);
  ApiResponse.ok(res, result, 'Settlements retrieved successfully.');
});

/**
 * GET /api/v1/worker/settlement/:id
 * Get a single settlement (must belong to the authenticated worker)
 */
const getMySettlement = asyncHandler(async (req, res) => {
  const settlement = await settlementService.getMySettlement(req.user.id, req.params.id);
  ApiResponse.ok(res, { settlement }, 'Settlement retrieved successfully.');
});

module.exports = { requestSettlement, listMySettlements, getMySettlement };
