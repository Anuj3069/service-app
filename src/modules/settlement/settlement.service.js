/**
 * src/modules/settlement/settlement.service.js — Settlement Business Logic
 */

const AppError = require('../../shared/utils/api-error');
const providerRepository = require('../provider/provider.repository');
const bookingRepository = require('../booking/booking.repository');
const settlementRepository = require('./settlement.repository');
const Booking = require('../booking/booking.model');

class SettlementService {
  /**
   * Worker requests a payout settlement.
   *
   * Steps:
   *  1. Load provider by userId
   *  2. Verify bank details are saved
   *  3. Find all completed+paid bookings not already in an active settlement
   *  4. Throw if no unsettled bookings found
   *  5. Sum payout values and create the settlement record
   */
  async requestSettlement(userId) {
    // 1. Load provider profile
    const provider = await providerRepository.findByUserId(userId);
    if (!provider) {
      throw AppError.notFound('Provider profile not found.');
    }

    // 2. Verify bank details exist
    if (!provider.bankDetails || !provider.bankDetails.accountNumber) {
      throw AppError.badRequest('Please add your bank details before requesting a settlement.');
    }

    // 3. Find booking IDs already claimed by active settlements
    const claimedIds = await settlementRepository.findClaimedBookingIds();

    // 4. Find eligible bookings: completed + paid + not already settled
    const eligibleBookings = await Booking.find({
      providerId: provider._id,
      status: 'completed',
      paymentStatus: 'paid',
      ...(claimedIds.length > 0 && { _id: { $nin: claimedIds } }),
    }).lean();

    if (eligibleBookings.length === 0) {
      throw AppError.badRequest('No unsettled earnings found. All completed bookings have already been included in a previous settlement.');
    }

    // 5. Sum payout
    const totalAmount = eligibleBookings.reduce((sum, b) => sum + (b.payout || 0), 0);

    // 6. Snapshot bank details at request time
    const bankSnapshot = {
      accountHolderName: provider.bankDetails.accountHolderName,
      accountNumber:     provider.bankDetails.accountNumber,
      ifscCode:          provider.bankDetails.ifscCode,
      bankName:          provider.bankDetails.bankName,
      upiId:             provider.bankDetails.upiId || null,
    };

    // 7. Create settlement record
    const settlement = await settlementRepository.create({
      providerId:  provider._id,
      bookingIds:  eligibleBookings.map((b) => b._id),
      totalAmount,
      status:      'pending',
      bankSnapshot,
      requestedAt: new Date(),
    });

    return settlement;
  }

  /**
   * Worker: list own settlement history
   */
  async listMySettlements(userId, pagination) {
    const provider = await providerRepository.findByUserId(userId);
    if (!provider) {
      throw AppError.notFound('Provider profile not found.');
    }
    return settlementRepository.findByProviderId(provider._id, pagination);
  }

  /**
   * Worker: get one settlement (ownership verified)
   */
  async getMySettlement(userId, settlementId) {
    const provider = await providerRepository.findByUserId(userId);
    if (!provider) {
      throw AppError.notFound('Provider profile not found.');
    }

    const settlement = await settlementRepository.findById(settlementId);
    if (!settlement) {
      throw AppError.notFound('Settlement not found.');
    }

    // Verify this settlement belongs to the requesting worker
    if (settlement.providerId._id.toString() !== provider._id.toString()) {
      throw AppError.forbidden('You do not have access to this settlement.');
    }

    return settlement;
  }
}

module.exports = new SettlementService();
