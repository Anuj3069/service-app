/**
 * src/modules/wallet/wallet.routes.js — Worker Wallet Routes
 *
 * Mounted at /api/v1/worker/wallet
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const { ROLES } = require('../../shared/utils/constants');
const { getMyWallet } = require('./wallet.controller');

const router = Router();

router.use(authenticate, authorize(ROLES.WORKER));

// GET /worker/wallet — balance + transaction history
router.get('/', getMyWallet);

module.exports = router;
