/**
 * src/modules/address/index.js — Address Module Exports
 */

const addressRoutes = require('./address.routes');
const addressService = require('./address.service');
const Address = require('./address.model');

module.exports = {
  addressRoutes,
  addressService,
  Address,
};
