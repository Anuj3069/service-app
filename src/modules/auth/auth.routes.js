/**
 * src/modules/auth/auth.routes.js — Auth Route Definitions
 *
 * POST /api/v1/auth/register  — Rate limited
 * POST /api/v1/auth/login     — Rate limited
 * POST /api/v1/auth/logout    — Requires authentication
 */

const { Router } = require('express');
const validate = require('../../shared/middleware/validate.middleware');
const { registerSchema, loginSchema } = require('./auth.validation');
const { register, login, logout } = require('./auth.controller');
const { authenticate } = require('../../shared/middleware/auth.middleware');
const { authLimiter, rateLimitMiddleware } = require('../../shared/middleware/rate-limiter');

const router = Router();

router.post('/register', rateLimitMiddleware(authLimiter), validate(registerSchema), register);
router.post('/login', rateLimitMiddleware(authLimiter), validate(loginSchema), login);
router.post('/logout', authenticate, logout);

module.exports = router;
