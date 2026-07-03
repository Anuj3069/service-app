/**
 * src/modules/wallet/wallet.controller.js — Worker Wallet HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const walletService = require('./wallet.service');

/**
 * GET /worker/wallet
 * Worker views their cash-commission balance and history.
 */
const getMyWallet = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const pagination = { page: Number(page) || 1, limit: Number(limit) || 20 };

  const result = await walletService.getMyWallet(req.user._id, pagination);
  ApiResponse.ok(res, result, 'Wallet retrieved successfully.');
});

module.exports = { getMyWallet };
