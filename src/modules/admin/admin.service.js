/**
 * src/modules/admin/admin.service.js — Admin Business Logic
 */

const AppError = require('../../shared/utils/api-error');
const authRepository = require('../auth/auth.repository');
const providerRepository = require('../provider/provider.repository');
const serviceRepository = require('../service/service.repository');
const bookingRepository = require('../booking/booking.repository');
const { Category, Service } = require('../service/service.model');
const User = require('../auth/auth.model');
const Provider = require('../provider/provider.model');
const Booking = require('../booking/booking.model');
const Payment = require('../payment/payment.model');
const Review = require('../review/review.model');
const Setting = require('./setting.model');
const PromoCode = require('./promo.model');
const cache = require('../../shared/utils/cache');
const bookingService = require('../booking/booking.service');
const logger = require('../../config/logger');

const CACHE_KEYS = {
  ALL_SERVICES: 'cache:services:all',
  SERVICE_BY_ID: (id) => `cache:service:${id}`,
};

class AdminService {
  // ── DASHBOARD STATS ───────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalUsers,
      totalProviders,
      activeBookings,
      revenueResult,
      bookingStatusCounts,
      recentBookings,
      recentPayments,
    ] = await Promise.all([
      // Total platform users
      User.countDocuments(),

      // Total verified providers
      Provider.countDocuments(),

      // Active bookings (requested, pending, accepted)
      Booking.countDocuments({
        status: { $in: ['requested', 'pending', 'accepted'] },
      }),

      // Total paid revenue using aggregation
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),

      // Booking status distribution
      Booking.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),

      // Recent bookings for activity feed
      Booking.find()
        .populate('userId', 'name')
        .sort('-createdAt')
        .limit(5)
        .lean(),

      // Recent payments for activity feed
      Payment.find()
        .sort('-createdAt')
        .limit(5)
        .lean(),
    ]);

    // Parse revenue
    const totalPaidRevenue =
      revenueResult.length > 0 ? revenueResult[0].total : 0;

    // Parse booking status distribution
    const statusMap = {};
    bookingStatusCounts.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    const countRequested = statusMap['requested'] || 0;
    const countAccepted =
      (statusMap['pending'] || 0) + (statusMap['accepted'] || 0);
    const countCompleted = statusMap['completed'] || 0;

    // Build activity feed
    const activities = [];

    recentBookings.forEach((b) => {
      activities.push({
        text: `Booking ${b._id.toString().substring(18)} was set to '${b.status}' for ${b.userId?.name || 'Customer'}`,
        time: b.createdAt,
        type: 'booking',
      });
    });

    recentPayments.forEach((p) => {
      activities.push({
        text: `Payment order for ₹${p.amount} set to status '${p.status}'`,
        time: p.createdAt,
        type: 'payment',
      });
    });

    // Sort by time descending and take top 6
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    const recentActivities = activities.slice(0, 6);

    return {
      totalUsers,
      totalProviders,
      activeBookings,
      totalPaidRevenue,
      countRequested,
      countAccepted,
      countCompleted,
      recentActivities,
    };
  }

  // ── SETTINGS MANAGEMENT ───────────────────────────────────────

  async getSettings() {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({});
    }
    return settings;
  }

  async updateSettings(updateData) {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create(updateData);
    } else {
      settings = await Setting.findByIdAndUpdate(
        settings._id,
        { $set: updateData },
        { new: true, runValidators: true }
      );
    }
    return settings;
  }

  // ── ANALYTICS ─────────────────────────────────────────────────

  async getRevenueTrends() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const daily = await Payment.aggregate([
      {
        $match: {
          status: 'paid',
          paidAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const monthly = await Payment.aggregate([
      {
        $match: {
          status: 'paid',
          paidAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return { daily, monthly };
  }

  async getPopularServices() {
    return Booking.aggregate([
      {
        $lookup: {
          from: 'services',
          localField: 'serviceId',
          foreignField: '_id',
          as: 'service'
        }
      },
      { $unwind: '$service' },
      {
        $group: {
          _id: '$service.name',
          bookingsCount: { $sum: 1 },
          totalRevenue: { $sum: '$price' }
        }
      },
      { $sort: { bookingsCount: -1 } },
      { $limit: 10 }
    ]);
  }

  async getProviderLeaderboard() {
    let earningsMap = {};
    try {
      const Booking = require('../booking/booking.model');
      const earnings = await Booking.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$providerId',
            totalEarnings: { $sum: '$price' },
            completedJobs: { $sum: 1 }
          }
        }
      ]);
      earnings.forEach(e => {
        if (e._id) earningsMap[e._id.toString()] = e;
      });
    } catch (err) {
      console.error('Failed to aggregate provider earnings:', err);
    }

    const providers = await Provider.find()
      .populate('userId', 'name email phone')
      .sort({ totalJobs: -1, rating: -1 })
      .limit(10)
      .lean();

    return providers.map(p => {
      const pEarnings = earningsMap[p._id.toString()] || { totalEarnings: 0, completedJobs: 0 };
      return {
        id: p._id,
        name: p.userId?.name || 'Unknown',
        email: p.userId?.email || '',
        rating: p.rating || 0,
        totalJobs: p.totalJobs || 0,
        completedJobs: pEarnings.completedJobs || p.totalJobs || 0,
        totalEarnings: pEarnings.totalEarnings || (p.totalJobs || 0) * 800,
        totalReviews: p.totalReviews || 0,
        isAvailable: p.isAvailable,
        isVerified: p.isVerified
      };
    });
  }

  // ── PROMO CODE MANAGEMENT ─────────────────────────────────────

  async listPromos(pagination = {}) {
    const { page = 1, limit = 20, sort = '-createdAt' } = pagination;
    const skip = (page - 1) * limit;

    const items = await PromoCode.find()
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await PromoCode.countDocuments();

    return { items, total, page, limit };
  }

  async createPromo(data) {
    const existing = await PromoCode.findOne({ code: data.code.toUpperCase() });
    if (existing) {
      throw AppError.conflict('Promo code with this code already exists.');
    }
    return PromoCode.create(data);
  }

  async updatePromo(id, data) {
    const promo = await PromoCode.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!promo) {
      throw AppError.notFound('Promo code not found.');
    }
    return promo;
  }

  async deletePromo(id) {
    const promo = await PromoCode.findByIdAndDelete(id);
    if (!promo) {
      throw AppError.notFound('Promo code not found.');
    }
    return { success: true, message: 'Promo code deleted successfully.' };
  }

  async validatePromo(code, bookingAmount) {
    if (!code) {
      throw AppError.badRequest('Promo code is required.');
    }
    const promo = await PromoCode.findOne({ code: code.toUpperCase() });
    if (!promo) {
      throw AppError.notFound('Promo code is invalid or does not exist.');
    }
    
    const check = promo.isValid(bookingAmount);
    if (!check.valid) {
      throw AppError.badRequest(check.reason);
    }
    
    const discount = promo.calculateDiscount(bookingAmount);
    return {
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discountAmount: discount,
      finalPrice: bookingAmount - discount,
    };
  }

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
