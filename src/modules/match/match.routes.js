/**
 * src/modules/match/match.routes.js — Match Route Definitions
 *
 * POST /api/v1/user/match
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { findMatchSchema } = require('./match.validation');
const { findMatch } = require('./match.controller');
const { ROLES } = require('../../shared/utils/constants');

const router = Router();

router.post(
  '/',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(findMatchSchema),
  findMatch
);

module.exports = router;
