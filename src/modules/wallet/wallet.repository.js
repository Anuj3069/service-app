/**
 * src/modules/wallet/wallet.repository.js — CashCommission Data Access
 */

const CashCommission = require('./wallet.model');

class WalletRepository {
  async create(data) {
    return CashCommission.create(data);
  }

  async findByBookingId(bookingId) {
    return CashCommission.findOne({ bookingId });
  }

  async findById(id) {
    return CashCommission.findById(id)
      .populate('providerId', 'userId skills')
      .populate('bookingId', 'price payout paymentMethod completedAt')
      .populate('collectedBy', 'name email');
  }

  /**
   * All pending/collected commissions for a given provider
   */
  async findByProviderId(providerId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      CashCommission.find({ providerId })
        .populate('bookingId', 'price payout completedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CashCommission.countDocuments({ providerId }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * Pending commission total owed by a provider
   */
  async getPendingBalance(providerId) {
    const result = await CashCommission.aggregate([
      { $match: { providerId, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]);
    return result[0] || { total: 0, count: 0 };
  }

  /**
   * Admin: list all commissions with optional filters
   */
  async findAll({ status, providerId } = {}, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const query = {};
    if (status) query.status = status;
    if (providerId) query.providerId = providerId;

    const [items, total] = await Promise.all([
      CashCommission.find(query)
        .populate({
          path: 'providerId',
          select: 'userId',
          populate: { path: 'userId', select: 'name email phone' },
        })
        .populate('bookingId', 'price payout completedAt paymentMethod')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CashCommission.countDocuments(query),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Admin: total pending commissions grouped by provider (dashboard use)
   */
  async getPendingSummaryByProvider() {
    return CashCommission.aggregate([
      { $match: { status: 'pending' } },
      {
        $group: {
          _id: '$providerId',
          totalPending: { $sum: '$commissionAmount' },
          count: { $sum: 1 },
          oldest: { $min: '$createdAt' },
        },
      },
      {
        $lookup: {
          from: 'providers',
          localField: '_id',
          foreignField: '_id',
          as: 'provider',
        },
      },
      { $unwind: '$provider' },
      {
        $lookup: {
          from: 'users',
          localField: 'provider.userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          providerId: '$_id',
          workerName: '$user.name',
          workerPhone: '$user.phone',
          totalPending: 1,
          count: 1,
          oldest: 1,
        },
      },
      { $sort: { totalPending: -1 } },
    ]);
  }

  async updateById(id, update) {
    return CashCommission.findByIdAndUpdate(id, { $set: update }, { new: true });
  }
}

module.exports = new WalletRepository();
