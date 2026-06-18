/**
 * src/modules/address/address.routes.js — Address Route Definitions
 *
 * Customer routes:
 *   POST   /api/v1/user/addresses            — Save a new address
 *   GET    /api/v1/user/addresses            — Get all saved addresses
 *   GET    /api/v1/user/addresses/default    — Get default address
 *   PUT    /api/v1/user/addresses/:id        — Update an address
 *   PUT    /api/v1/user/addresses/:id/default — Set as default
 *   DELETE /api/v1/user/addresses/:id        — Delete an address
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { ROLES } = require('../../shared/utils/constants');
const {
  createAddressSchema,
  updateAddressSchema,
  addressIdSchema,
} = require('./address.validation');
const {
  createAddress,
  getAddresses,
  getDefaultAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} = require('./address.controller');

const router = Router();

// ── CUSTOMER ADDRESS ROUTES ─────────────────────────────────

router.post(
  '/user/addresses',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(createAddressSchema),
  createAddress
);

router.get(
  '/user/addresses',
  authenticate,
  authorize(ROLES.CUSTOMER),
  getAddresses
);

// NOTE: /default must come BEFORE /:id to avoid treating "default" as an ID
router.get(
  '/user/addresses/default',
  authenticate,
  authorize(ROLES.CUSTOMER),
  getDefaultAddress
);

router.put(
  '/user/addresses/:id',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(updateAddressSchema),
  updateAddress
);

router.put(
  '/user/addresses/:id/default',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(addressIdSchema),
  setDefaultAddress
);

router.delete(
  '/user/addresses/:id',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(addressIdSchema),
  deleteAddress
);

module.exports = router;
