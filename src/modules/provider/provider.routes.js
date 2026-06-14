/**
 * src/modules/provider/provider.routes.js — Provider Route Definitions
 *
 * POST /api/v1/worker/profile
 * GET  /api/v1/worker/profile
 * PUT  /api/v1/worker/profile
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const { uploadKyc, cloudinaryUploadMiddleware } = require('../../shared/middleware/upload.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { submitKycSchema, updateBankDetailsSchema } = require('./provider.validation');
const { submitKyc, getBankDetails, updateBankDetails } = require('./provider.controller');
const { createProfileSchema, updateProfileSchema, updateLocationSchema } = require('./provider.validation');
const { createProfile, getProfile, updateProfile, updateLocation } = require('./provider.controller');
const { ROLES } = require('../../shared/utils/constants');

const router = Router();

// All provider routes require worker role
router.use(authenticate, authorize(ROLES.WORKER));

router.post('/', validate(createProfileSchema), createProfile);
router.get('/', getProfile);
router.put('/', validate(updateProfileSchema), updateProfile);
router.put('/location', validate(updateLocationSchema), updateLocation);

router.post('/kyc', uploadKyc.single('document'), cloudinaryUploadMiddleware, validate(submitKycSchema), submitKyc);

// ── Bank Details Routes ──────────────────────────────────────
router.put('/bank-details', validate(updateBankDetailsSchema), updateBankDetails);
router.get('/bank-details', getBankDetails);

module.exports = router;
