/**
 * src/modules/review/review.controller.js — Review HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const reviewService = require('./review.service');

/**
 * POST /api/v1/user/reviews
 */
const createReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user.id, req.body);
  ApiResponse.created(res, { review }, 'Review submitted successfully. Thank you!');
});

module.exports = { createReview };
