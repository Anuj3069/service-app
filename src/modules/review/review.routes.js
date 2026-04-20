/**
 * src/modules/review/review.routes.js — Review Route Definitions
 *
 * POST /api/v1/user/reviews
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { createReviewSchema } = require('./review.validation');
const { createReview } = require('./review.controller');
const { ROLES } = require('../../shared/utils/constants');

const router = Router();

router.post(
  '/',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(createReviewSchema),
  createReview
);

module.exports = router;
