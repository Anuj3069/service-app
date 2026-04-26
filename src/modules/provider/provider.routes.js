/**
 * src/modules/provider/provider.routes.js — Provider Route Definitions
 *
 * POST /api/v1/worker/profile
 * GET  /api/v1/worker/profile
 * PUT  /api/v1/worker/profile
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { createProfileSchema, updateProfileSchema } = require('./provider.validation');
const { createProfile, getProfile, updateProfile } = require('./provider.controller');
const { ROLES } = require('../../shared/utils/constants');

const router = Router();

// All provider routes require worker role
router.use(authenticate, authorize(ROLES.WORKER));

router.post('/', validate(createProfileSchema), createProfile);
router.get('/', getProfile);
router.put('/', validate(updateProfileSchema), updateProfile);

module.exports = router;
