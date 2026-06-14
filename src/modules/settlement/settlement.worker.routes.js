/**
 * src/modules/settlement/settlement.worker.routes.js — Worker Settlement Routes
 *
 * Base: /api/v1/worker/settlement
 * Auth: authenticate + authorize(ROLES.WORKER)
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { ROLES } = require('../../shared/utils/constants');
const { listMySettlementsSchema } = require('./settlement.validation');
const { idParam } = require('../../shared/validators/common.validators');
const { requestSettlement, listMySettlements, getMySettlement } = require('./settlement.worker.controller');

const router = Router();

// All routes require an authenticated worker
router.use(authenticate, authorize(ROLES.WORKER));

router.post('/request', requestSettlement);
router.get('/', validate(listMySettlementsSchema), listMySettlements);
router.get('/:id', validate({ params: idParam }), getMySettlement);

module.exports = router;
