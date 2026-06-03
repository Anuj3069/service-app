/**
 * src/modules/admin/admin.service.js — Admin Business Logic
 */

const AppError = require('../../shared/utils/api-error');
const authRepository = require('../auth/auth.repository');
const providerRepository = require('../provider/provider.repository');
const serviceRepository = require('../service/service.repository');
const bookingRepository = require('../booking/booking.repository');
const { Category, Service } = require('../service/service.model');
const Booking = require('../booking/booking.model');
const Payment = require('../payment/payment.model');
const Review = require('../review/review.model');
const cache = require('../../shared/utils/cache');
const bookingService = require('../booking/booking.service');
const logger = require('../../config/logger');

const CACHE_KEYS = {
  ALL_SERVICES: 'cache:services:all',
  SERVICE_BY_ID: (id) => `cache:service:${id}`,
};

class AdminService {
  // ── USER MANAGEMENT ──────────────────────────────────────────

  async listUsers(filters, pagination) {
    return authRepository.findAll(filters, pagination);
  }

  async toggleUserStatus(userId, isActive) {
    const user = await authRepository.updateById(userId, { isActive });
    if (!user) {
      throw AppError.notFound('User not found.');
    }
    return user;
  }

  async updateUserRole(userId, role) {
    const user = await authRepository.updateById(userId, { role });
    if (!user) {
      throw AppError.notFound('User not found.');
    }
    return user;
  }

  // ── PROVIDER MANAGEMENT ──────────────────────────────────────

  async listProviders(filters, pagination) {
    return providerRepository.findAll(filters, pagination);
  }

  async verifyProvider(providerId, isVerified) {
    const provider = await providerRepository.updateById(providerId, { isVerified });
    if (!provider) {
      throw AppError.notFound('Provider not found.');
    }
    return provider;
  }

  async updateProvider(providerId, updateData) {
    const provider = await providerRepository.updateById(providerId, updateData);
    if (!provider) {
      throw AppError.notFound('Provider not found.');
    }
    return provider;
  }

  // ── SERVICE & CATEGORY CATALOG ───────────────────────────────

  async createCategory(data) {
    const category = await serviceRepository.createCategory(data);
    await cache.del(CACHE_KEYS.ALL_SERVICES);
    return category;
  }

  async updateCategory(categoryId, data) {
    const category = await serviceRepository.updateCategory(categoryId, data);
    if (!category) {
      throw AppError.notFound('Category not found.');
    }
    await cache.del(CACHE_KEYS.ALL_SERVICES);
    return category;
  }

  async deleteCategory(categoryId) {
    // Soft delete Category
    const category = await serviceRepository.updateCategory(categoryId, { isActive: false });
    if (!category) {
      throw AppError.notFound('Category not found.');
    }
    // Soft delete all services belonging to this Category
    await Service.updateMany({ category: categoryId }, { $set: { isActive: false } });
    
    await cache.del(CACHE_KEYS.ALL_SERVICES);
    return category;
  }

  async createService(data) {
    const service = await serviceRepository.createService(data);
    await cache.del(CACHE_KEYS.ALL_SERVICES);
    return service;
  }

  async updateService(serviceId, data) {
    const service = await serviceRepository.updateService(serviceId, data);
    if (!service) {
      throw AppError.notFound('Service not found.');
    }
    await cache.del(CACHE_KEYS.ALL_SERVICES);
    await cache.del(CACHE_KEYS.SERVICE_BY_ID(serviceId));
    return service;
  }

  async deleteService(serviceId) {
    // Soft delete Service
    const service = await serviceRepository.updateService(serviceId, { isActive: false });
    if (!service) {
      throw AppError.notFound('Service not found.');
    }
    await cache.del(CACHE_KEYS.ALL_SERVICES);
    await cache.del(CACHE_KEYS.SERVICE_BY_ID(serviceId));
    return service;
  }

  // ── BOOKING MANAGEMENT ───────────────────────────────────────

  async listBookings(filters, pagination) {
    const { page = 1, limit = 20, sort = '-createdAt' } = pagination;
    const skip = (page - 1) * limit;

    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.userId) query.userId = filters.userId;
    if (filters.providerId) query.providerId = filters.providerId;

    const items = await Booking.find(query)
      .populate('userId', 'name email phone')
      .populate('serviceId', 'name basePrice duration')
      .populate({
        path: 'providerId',
        select: 'userId skills rating',
        populate: { path: 'userId', select: 'name email phone' },
      })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments(query);

    return { items, total, page, limit };
  }

  async getBookingById(bookingId) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }
    return booking;
  }

  async cancelBooking(bookingId, cancellationReason) {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    if (['cancelled', 'completed', 'expired'].includes(booking.status)) {
      throw AppError.badRequest(`Cannot cancel booking with status '${booking.status}'`);
    }

    booking.status = 'cancelled';
    booking.cancellationReason = cancellationReason;
    booking.cancelledAt = new Date();
    await booking.save();

    logger.info(`🚨 Booking ${bookingId} manually cancelled by Admin. Reason: ${cancellationReason}`);

    return bookingRepository.findById(bookingId);
  }

  // ── PAYMENT AUDITS ───────────────────────────────────────────

  async listPayments(filters, pagination) {
    const { page = 1, limit = 20, sort = '-createdAt' } = pagination;
    const skip = (page - 1) * limit;

    const query = {};
    if (filters.status) query.status = filters.status;

    const items = await Payment.find(query)
      .populate('userId', 'name email phone')
      .populate('bookingId')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments(query);

    return { items, total, page, limit };
  }

  async overridePaymentStatus(paymentId, status) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw AppError.notFound('Payment record not found.');
    }

    payment.status = status;
    if (status === 'paid') {
      payment.paidAt = payment.paidAt || new Date();
    }
    await payment.save();

    if (status === 'paid') {
      // Reconcile/finalize booking payment status using finalizePayment
      await bookingService.finalizePayment(payment.bookingId);
    } else {
      // Revert booking paymentStatus if not paid
      await bookingRepository.updateById(payment.bookingId, { paymentStatus: status });
    }

    return payment;
  }

  // ── REVIEWS & QUALITY ────────────────────────────────────────

  async listReviews(pagination) {
    const { page = 1, limit = 20, sort = '-createdAt' } = pagination;
    const skip = (page - 1) * limit;

    const items = await Review.find()
      .populate('userId', 'name email')
      .populate({
        path: 'providerId',
        populate: { path: 'userId', select: 'name' },
      })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments();

    return { items, total, page, limit };
  }

  async deleteReview(reviewId) {
    const review = await Review.findById(reviewId);
    if (!review) {
      throw AppError.notFound('Review not found.');
    }

    // Delete review
    await Review.findByIdAndDelete(reviewId);

    // Recalculate provider ratings
    const remainingReviews = await Review.find({ providerId: review.providerId });
    const totalReviews = remainingReviews.length;
    const ratingSum = remainingReviews.reduce((sum, r) => sum + r.rating, 0);
    const newRating = totalReviews > 0 ? Number((ratingSum / totalReviews).toFixed(2)) : 0;

    await providerRepository.updateRating(review.providerId, newRating, totalReviews);

    logger.info(`🗑️ Review ${reviewId} deleted by Admin. Provider ${review.providerId} rating recalculated.`);

    return { success: true, message: 'Review deleted and provider rating updated.' };
  }
}

module.exports = new AdminService();
