/**
 * src/modules/auth/index.js — Auth Module Public API
 */

const authRoutes = require('./auth.routes');
const authService = require('./auth.service');
const User = require('./auth.model');

module.exports = { authRoutes, authService, User };
