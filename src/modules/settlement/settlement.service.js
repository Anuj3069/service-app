/**
 * src/modules/settlement/settlement.service.js — Settlement Business Logic
 *
 * MANDATORY NETTING:
 *   Any outstanding cash commission the worker owes admin is automatically
 *   deducted from their online payout at settlement time.
 *   Worker receives:  onlinePayout − cashCommissionOwed
 *   Admin retains:    cashCommissionOwed  (never needs manual collection)
 *
 * Rejection reversal:
 *   If admin rejects a settlement, all CashCommission entries that were
 *   netted in it are reverted to 'pending' so they can be netted again
 *   in the worker's next settlement request.
 */

const AppError = require('../../shared/utils/api-error');
const providerRepository = require('../provider/provider.repository');
const settlementRepository = require('./settlement.repository');
const Booking = require('../booking/booking.model');
const CashCommission = require('../wallet/wallet.model');

class SettlementService {
  /**
   * Worker requests a payout settlement.
   *
   * Logic:
   *  1.  Load provider & verify bank details
   *  2.  Find all unsettled ONLINE-paid bookings (cash excluded from payout)
   *  3.  Load all pending CashCommission entries for this provider
   *  4.  onlinePayout = sum of booking.payout for online bookings
   *      cashDeduction = sum of CashCommission.commissionAmount
   *      netPayout = onlinePayout − cashDeduction
   *  5.  Block if netPayout ≤ 0 (debt exceeds or equals earnings)
   *  6.  Create settlement for netPayout
   *  7.  Mark CashCommission entries as 'collected' linked to this settlement
   */
  async requestSettlement(userId) {
    // 1. Load provider profile
    const provider = await providerRepository.findByUserId(userId);
    if (!provider) throw AppError.notFound('Provider profile not found.');

    if (!provider.bankDetails || !provider.bankDetails.accountNumber) {
      throw AppError.badRequest('Please add your bank details before requesting a settlement.');
    }

    // 2. Find booking IDs already claimed by active settlements
    const claimedIds = await settlementRepository.findClaimedBookingIds();

    // 3. Find unsettled ONLINE-paid bookings
    //    Cash bookings are excluded from the payout array — worker already
    //    holds those funds. Their commission is handled via netting below.
    const onlineBookings = await Booking.find({
      providerId:    provider._id,
      status:        'completed',
      paymentStatus: 'paid',
      paymentMethod: { $ne: 'cash' },
      ...(claimedIds.length > 0 && { _id: { $nin: claimedIds } }),
    }).lean();

    // 4. Load all pending cash commissions owed by this worker
    const pendingCommissions = await CashCommission.find({
      providerId: provider._id,
      status:     'pending',
    }).lean();

    const onlinePayout  = onlineBookings.reduce((s, b) => s + (b.payout || 0), 0);
    const cashDeduction = pendingCommissions.reduce((s, c) => s + (c.commissionAmount || 0), 0);
    const netPayout     = onlinePayout - cashDeduction;

    // 5. Guard: nothing at all to settle
    if (onlineBookings.length === 0 && pendingCommissions.length === 0) {
      throw AppError.badRequest(
        'No unsettled earnings found. Complete some bookings and try again.'
      );
    }

    // 6. Guard: only cash debt, no online earnings to offset against
    if (onlineBookings.length === 0) {
      throw AppError.badRequest(
        `You have ₹${cashDeduction} in outstanding cash commission but no online earnings to offset it against. ` +
        `Complete online-paid bookings first, or contact admin to resolve manually.`
      );
    }

    // 7. Guard: debt equals or exceeds online earnings
    if (netPayout <= 0) {
      throw AppError.badRequest(
        `Settlement blocked. Your outstanding cash commission (₹${cashDeduction}) equals or exceeds ` +
        `your online earnings (₹${onlinePayout}). Complete more online-paid bookings to build a positive balance.`
      );
    }

    // 8. Snapshot bank details at request time
    const bankSnapshot = {
      accountHolderName: provider.bankDetails.accountHolderName,
      accountNumber:     provider.bankDetails.accountNumber,
      ifscCode:          provider.bankDetails.ifscCode,
      bankName:          provider.bankDetails.bankName,
      upiId:             provider.bankDetails.upiId || null,
    };

    // 9. Create settlement for the NET amount
    const settlement = await settlementRepository.create({
      providerId:             provider._id,
      bookingIds:             onlineBookings.map((b) => b._id),
      totalAmount:            netPayout,
      cashCommissionDeducted: cashDeduction,
      cashCommissionIds:      pendingCommissions.map((c) => c._id),
      status:                 'pending',
      bankSnapshot,
      requestedAt:            new Date(),
    });

    // 10. Mark the CashCommission entries as netted (auto-collected via settlement)
    if (pendingCommissions.length > 0) {
      await CashCommission.updateMany(
        { _id: { $in: pendingCommissions.map((c) => c._id) } },
        {
          $set: {
            status:       'collected',
            collectedAt:  new Date(),
            settlementId: settlement._id,
            adminNote:    `Auto-netted against settlement ${settlement._id}`,
          },
        }
      );
    }

    return {
      settlement,
      summary: {
        onlineEarnings:          onlinePayout,
        cashCommissionDeducted:  cashDeduction,
        netPayout,
        onlineBookingsCount:     onlineBookings.length,
        cashCommissionsCleared:  pendingCommissions.length,
      },
    };
  }

  /**
   * Revert CashCommission entries netted in a settlement back to 'pending'.
   * Called when admin rejects a settlement so those commissions can be
   * included in the worker's next settlement request.
   */
  async revertCashCommissions(settlement) {
    if (!settlement.cashCommissionIds || settlement.cashCommissionIds.length === 0) return;

    await CashCommission.updateMany(
      { _id: { $in: settlement.cashCommissionIds } },
      {
        $set: {
          status:       'pending',
          collectedAt:  null,
          settlementId: null,
          adminNote:    null,
        },
      }
    );
  }

  /**
   * Worker: list own settlement history
   */
  async listMySettlements(userId, pagination) {
    const provider = await providerRepository.findByUserId(userId);
    if (!provider) throw AppError.notFound('Provider profile not found.');
    return settlementRepository.findByProviderId(provider._id, pagination);
  }

  /**
   * Worker: get one settlement (ownership verified)
   */
  async getMySettlement(userId, settlementId) {
    const provider = await providerRepository.findByUserId(userId);
    if (!provider) throw AppError.notFound('Provider profile not found.');

    const settlement = await settlementRepository.findById(settlementId);
    if (!settlement) throw AppError.notFound('Settlement not found.');

    if (settlement.providerId._id.toString() !== provider._id.toString()) {
      throw AppError.forbidden('You do not have access to this settlement.');
    }

    return settlement;
  }
}

module.exports = new SettlementService();
