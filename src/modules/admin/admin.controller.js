/**
 * src/modules/admin/admin.controller.js — Admin HTTP Handlers
 */

const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const adminService = require('./admin.service');

// ── USER CONTROLLERS ─────────────────────────────────────────

const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, sort, role, isActive, search } = req.query;
  const filters = { role, isActive, search };
  const pagination = { page: Number(page), limit: Number(limit), sort };
  
  const result = await adminService.listUsers(filters, pagination);
  ApiResponse.ok(res, result, 'Users retrieved successfully.');
});

const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  
  const user = await adminService.toggleUserStatus(id, isActive);
  ApiResponse.ok(res, { user }, `User status updated to ${isActive ? 'active' : 'inactive'}.`);
});

const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  
  const user = await adminService.updateUserRole(id, role);
  ApiResponse.ok(res, { user }, `User role updated to ${role}.`);
});

// ── PROVIDER CONTROLLERS ─────────────────────────────────────

const listProviders = asyncHandler(async (req, res) => {
  const { page, limit, sort, isVerified, isAvailable, skills } = req.query;
  const filters = { isVerified, isAvailable, skills };
  const pagination = { page: Number(page), limit: Number(limit), sort };
  
  const result = await adminService.listProviders(filters, pagination);
  ApiResponse.ok(res, result, 'Providers retrieved successfully.');
});

const verifyProvider = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isVerified } = req.body;
  
  const provider = await adminService.verifyProvider(id, isVerified);
  ApiResponse.ok(res, { provider }, `Provider verification set to ${isVerified}.`);
});

const updateProvider = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const provider = await adminService.updateProvider(id, req.body);
  ApiResponse.ok(res, { provider }, 'Provider profile updated successfully.');
});

// ── CATALOG CONTROLLERS ──────────────────────────────────────

const createCategory = asyncHandler(async (req, res) => {
  const category = await adminService.createCategory(req.body);
  ApiResponse.created(res, { category }, 'Category created successfully.');
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const category = await adminService.updateCategory(id, req.body);
  ApiResponse.ok(res, { category }, 'Category updated successfully.');
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await adminService.deleteCategory(id);
  ApiResponse.ok(res, null, 'Category and associated services deactivated successfully.');
});

const createService = asyncHandler(async (req, res) => {
  const service = await adminService.createService(req.body);
  ApiResponse.created(res, { service }, 'Service created successfully.');
});

const updateService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const service = await adminService.updateService(id, req.body);
  ApiResponse.ok(res, { service }, 'Service updated successfully.');
});

const deleteService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await adminService.deleteService(id);
  ApiResponse.ok(res, null, 'Service deactivated successfully.');
});

// ── BOOKING CONTROLLERS ──────────────────────────────────────

const listBookings = asyncHandler(async (req, res) => {
  const { page, limit, sort, status, userId, providerId } = req.query;
  const filters = { status, userId, providerId };
  const pagination = { page: Number(page), limit: Number(limit), sort };
  
  const result = await adminService.listBookings(filters, pagination);
  ApiResponse.ok(res, result, 'Bookings retrieved successfully.');
});

const getBookingById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const booking = await adminService.getBookingById(id);
  ApiResponse.ok(res, { booking }, 'Booking retrieved successfully.');
});

const cancelBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cancellationReason } = req.body;
  
  const booking = await adminService.cancelBooking(id, cancellationReason);
  ApiResponse.ok(res, { booking }, 'Booking cancelled successfully by administrator.');
});

// ── PAYMENT CONTROLLERS ──────────────────────────────────────

const listPayments = asyncHandler(async (req, res) => {
  const { page, limit, sort, status } = req.query;
  const filters = { status };
  const pagination = { page: Number(page), limit: Number(limit), sort };
  
  const result = await adminService.listPayments(filters, pagination);
  ApiResponse.ok(res, result, 'Payments retrieved successfully.');
});

const overridePaymentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const payment = await adminService.overridePaymentStatus(id, status);
  ApiResponse.ok(res, { payment }, `Payment status successfully overridden to '${status}'.`);
});

// ── REVIEW CONTROLLERS ───────────────────────────────────────

const listReviews = asyncHandler(async (req, res) => {
  const { page, limit, sort } = req.query;
  const pagination = { page: Number(page), limit: Number(limit), sort };
  
  const result = await adminService.listReviews(pagination);
  ApiResponse.ok(res, result, 'Reviews retrieved successfully.');
});

const deleteReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await adminService.deleteReview(id);
  ApiResponse.ok(res, result, 'Review deleted and provider rating adjusted.');
});

const reviewKyc = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, rejectionReason } = req.body;
  const provider = await adminService.reviewKyc(id, action, rejectionReason);
  ApiResponse.ok(res, { provider }, `KYC ${action}d successfully.`);
});

module.exports = {
  listUsers,
  toggleUserStatus,
  updateUserRole,
  listProviders,
  verifyProvider,
  updateProvider,
  createCategory,
  updateCategory,
  deleteCategory,
  createService,
  updateService,
  deleteService,
  listBookings,
  getBookingById,
  cancelBooking,
  listPayments,
  overridePaymentStatus,
  listReviews,
  deleteReview,
  reviewKyc,
};
