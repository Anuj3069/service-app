/**
 * src/modules/admin/index.js — Admin Module Entry Point
 */

const adminRoutes = require('./admin.routes');
const adminService = require('./admin.service');
const promoRoutes = require('./promo.routes');

module.exports = { adminRoutes, adminService, promoRoutes };
