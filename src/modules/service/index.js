/**
 * src/modules/service/index.js — Service Module Public API
 */

const serviceRoutes = require('./service.routes');
const serviceService = require('./service.service');
const { Category, Service } = require('./service.model');

module.exports = { serviceRoutes, serviceService, Category, Service };
