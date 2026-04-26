/**
 * src/modules/review/index.js — Review Module Public API
 */

const reviewRoutes = require('./review.routes');
const reviewService = require('./review.service');
const Review = require('./review.model');

module.exports = { reviewRoutes, reviewService, Review };
