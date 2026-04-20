/**
 * src/modules/provider/index.js — Provider Module Public API
 */

const providerRoutes = require('./provider.routes');
const providerService = require('./provider.service');
const Provider = require('./provider.model');

module.exports = { providerRoutes, providerService, Provider };
