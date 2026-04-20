/**
 * src/modules/service/service.routes.js — Service Route Definitions
 *
 * GET /api/v1/user/services
 * GET /api/v1/user/services/:id
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { getServiceByIdSchema } = require('./service.validation');
const { getAllServices, getServiceById } = require('./service.controller');
const { ROLES } = require('../../shared/utils/constants');

const router = Router();

// All service routes require authentication
router.use(authenticate);

router.get('/', authorize(ROLES.CUSTOMER, ROLES.ADMIN), getAllServices);
router.get('/:id', authorize(ROLES.CUSTOMER, ROLES.ADMIN), validate(getServiceByIdSchema), getServiceById);

module.exports = router;
