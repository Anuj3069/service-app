/**
 * src/modules/wallet/wallet.service.js — Wallet Business Logic
 *
 * "Wallet" here is a cash-commission ledger:
 *   - Every time a worker confirms a cash payment, a CashCommission entry is created
 *     recording the admin's share (bookingPrice - workerPayout) as owed.
 *   - Admin marks entries as 'collected' once the worker hands over the commission
 *     (in-person cash, bank transfer, etc.).
 *   - Settlement requests only include online-paid bookings (cash ones are already
 *     "settled" in the worker's pocket).
 */

const AppError = require('../../shared/utils/api-error');
const walletRepository = require('./wallet.repository');
const providerRepository = require('../provider/provider.repository');

class WalletService {
  // ─── WORKER SIDE ──────────────────────────────────────────────

  /**
   * Worker views their own cash-commission wallet.
   * Returns pending balance, transaction history.
   */
  async getMyWallet(userId, pagination = {}) {
    const provider = await providerRepository.findByUserId(userId);
    if (!provider) throw AppError.notFound('Provider profile not found.');

    const [pendingBalance, transactions] = await Promise.all([
      walletRepository.getPendingBalance(provider._id),
      walletRepository.findByProviderId(provider._id, pagination),
    ]);

    return {
      providerId: provider._id,
      pendingCommissionOwed: pendingBalance.total,
      pendingCount: pendingBalance.count,
      transactions,
    };
  }

  // ─── ADMIN SIDE ───────────────────────────────────────────────

  /**
   * Admin: list all cash commission entries (filterable by status / provider)
   */
  async listCashCommissions(filters = {}, pagination = {}) {
    return walletRepository.findAll(filters, pagination);
  }

  /**
   * Admin: aggregated summary — how much each worker owes
   */
  async getCashCommissionSummary() {
    return walletRepository.getPendingSummaryByProvider();
  }

  /**
   * Admin: get single commission entry
   */
  async getCashCommissionById(id) {
    const entry = await walletRepository.findById(id);
    if (!entry) throw AppError.notFound('Cash commission record not found.');
    return entry;
  }

  /**
   * Admin: mark a cash commission as collected.
   * Call this when the worker physically hands over the commission.
   *
   * @param {string} id            - CashCommission document ID
   * @param {string} adminUserId   - The admin user marking it collected
   * @param {string} [note]        - Optional note (e.g., "Paid via UPI ref: 123456")
   */
  async markCommissionCollected(id, adminUserId, note) {
    const entry = await walletRepository.findById(id);
    if (!entry) throw AppError.notFound('Cash commission record not found.');

    if (entry.status === 'collected') {
      throw AppError.badRequest('This commission has already been marked as collected.');
    }

    const updated = await walletRepository.updateById(id, {
      status: 'collected',
      collectedAt: new Date(),
      collectedBy: adminUserId,
      adminNote: note || null,
    });

    return updated;
  }

  // ─── INTERNAL ────────────────────────────────────────────────

  /**
   * Called by booking.service.confirmCashPayment() after a cash payment is confirmed.
   * Creates the CashCommission ledger entry.
   *
   * @param {Object} booking - Populated booking document
   */
  async recordCashCommission(booking) {
    const commissionAmount = booking.price - (booking.payout || 0);

    if (commissionAmount <= 0) return null;

    // Idempotent: don't double-record for the same booking
    const existing = await walletRepository.findByBookingId(booking._id);
    if (existing) return existing;

    return walletRepository.create({
      providerId: booking.providerId._id || booking.providerId,
      bookingId: booking._id,
      commissionAmount,
      bookingPrice: booking.price,
      workerPayout: booking.payout || 0,
      status: 'pending',
    });
  }
}

module.exports = new WalletService();
