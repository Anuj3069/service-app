/**
 * src/modules/admin/index.js — Admin Module Entry Point
 */

const adminRoutes = require('./admin.routes');
const adminService = require('./admin.service');

module.exports = { adminRoutes, adminService };
