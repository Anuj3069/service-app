/**
 * src/modules/settlement/settlement.repository.js — Settlement Data Access Layer
 */

const Settlement = require('./settlement.model');

class SettlementRepository {
  /**
   * Create a new settlement record
   */
  async create(data) {
    return Settlement.create(data);
  }

  /**
   * Find settlement by ID, populating the provider's user info
   */
  async findById(id) {
    return Settlement.findById(id)
      .populate({
        path: 'providerId',
        select: 'userId skills rating bankDetails',
        populate: { path: 'userId', select: 'name email phone' },
      })
      .populate('bookingIds', 'price payout status paymentStatus completedAt');
  }

  /**
   * Find all settlements for a specific provider (worker's own history)
   */
  async findByProviderId(providerId, pagination = {}) {
    const { page = 1, limit = 20, sort = '-createdAt' } = pagination;
    const skip = (page - 1) * limit;

    const items = await Settlement.find({ providerId })
      .populate('bookingIds', 'price payout status paymentStatus completedAt')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Settlement.countDocuments({ providerId });

    return { items, total, page: Number(page), limit: Number(limit) };
  }

  /**
   * Find all settlements for admin with optional filters
   */
  async findAll(filters = {}, pagination = {}) {
    const { page = 1, limit = 20, sort = '-createdAt' } = pagination;
    const skip = (page - 1) * limit;

    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.providerId) query.providerId = filters.providerId;

    const items = await Settlement.find(query)
      .populate({
        path: 'providerId',
        select: 'userId skills rating',
        populate: { path: 'userId', select: 'name email phone' },
      })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Settlement.countDocuments(query);

    return { items, total, page: Number(page), limit: Number(limit) };
  }

  /**
   * Update settlement by ID
   */
  async updateById(id, data) {
    return Settlement.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    ).populate({
      path: 'providerId',
      select: 'userId skills rating',
      populate: { path: 'userId', select: 'name email phone' },
    });
  }

  /**
   * Find all booking IDs already claimed by active settlements
   * (pending | processing | settled)
   */
  async findClaimedBookingIds() {
    const settlements = await Settlement.find(
      { status: { $in: ['pending', 'processing', 'settled'] } },
      { bookingIds: 1 }
    ).lean();

    const ids = settlements.flatMap((s) => s.bookingIds.map((id) => id.toString()));
    return [...new Set(ids)];
  }
}

module.exports = new SettlementRepository();
