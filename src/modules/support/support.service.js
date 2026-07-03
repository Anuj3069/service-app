const AppError = require('../../shared/utils/api-error');
const { BOOKING_STATUS, ROLES } = require('../../shared/utils/constants');
const Booking = require('../booking/booking.model');
const providerRepository = require('../provider/provider.repository');
const SupportTicket = require('./support.model');

const SUPPORTABLE_STATUSES = [
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
];

class SupportService {
  async createTicket(user, bookingId, issue) {
    const booking = await this._assertBookingAccess(user, bookingId);

    const existing = await SupportTicket.findOne({ bookingId });
    if (existing) {
      throw AppError.conflict('A support ticket already exists for this booking.');
    }

    const ticket = await SupportTicket.create({
      bookingId,
      raisedBy: user.id,
      raisedByRole: user.role,
      issue,
      messages: [
        {
          senderId: user.id,
          senderRole: user.role,
          text: issue,
        },
      ],
    });

    return ticket.populate('raisedBy', 'name phone');
  }

  async getTicketByBooking(user, bookingId) {
    await this._assertBookingAccess(user, bookingId);

    const ticket = await SupportTicket.findOne({ bookingId })
      .populate('raisedBy', 'name phone')
      .populate('bookingId', 'status date slot');

    if (!ticket) {
      throw AppError.notFound('No support ticket found for this booking.');
    }

    return ticket;
  }

  async sendMessage(user, ticketId, text) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw AppError.notFound('Support ticket not found.');

    if (ticket.status === 'closed') {
      throw AppError.badRequest('This support ticket is closed.');
    }

    await this._assertTicketAccess(user, ticket);

    ticket.messages.push({
      senderId: user.id,
      senderRole: user.role,
      text: text.trim(),
    });

    await ticket.save();

    return ticket.messages[ticket.messages.length - 1];
  }

  async getMessages(user, ticketId) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw AppError.notFound('Support ticket not found.');

    await this._assertTicketAccess(user, ticket);

    return ticket.messages;
  }

  // ── Admin methods ──────────────────────────────────────────

  async listTickets({ status, page, limit }) {
    const filter = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate('raisedBy', 'name phone')
        .populate('bookingId', 'status date slot')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SupportTicket.countDocuments(filter),
    ]);

    return { tickets, total, page, limit };
  }

  async getTicketById(ticketId) {
    const ticket = await SupportTicket.findById(ticketId)
      .populate('raisedBy', 'name phone')
      .populate('bookingId', 'status date slot userId providerId');

    if (!ticket) throw AppError.notFound('Support ticket not found.');
    return ticket;
  }

  async adminSendMessage(adminUser, ticketId, text) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw AppError.notFound('Support ticket not found.');

    if (ticket.status === 'closed') {
      throw AppError.badRequest('This support ticket is closed.');
    }

    ticket.messages.push({
      senderId: adminUser.id,
      senderRole: 'admin',
      text: text.trim(),
    });

    if (ticket.status === 'open') {
      ticket.status = 'in_progress';
    }

    await ticket.save();

    return {
      message: ticket.messages[ticket.messages.length - 1],
      status: ticket.status,
    };
  }

  async updateStatus(ticketId, status) {
    const ticket = await SupportTicket.findByIdAndUpdate(
      ticketId,
      { status },
      { new: true, runValidators: true }
    ).populate('raisedBy', 'name phone');

    if (!ticket) throw AppError.notFound('Support ticket not found.');
    return ticket;
  }

  // ── Private helpers ────────────────────────────────────────

  async _assertBookingAccess(user, bookingId) {
    const booking = await Booking.findById(bookingId).populate({
      path: 'providerId',
      select: 'userId',
    });

    if (!booking) throw AppError.notFound('Booking not found.');

    if (!SUPPORTABLE_STATUSES.includes(booking.status)) {
      throw AppError.badRequest(
        'Support is only available for accepted, completed, or cancelled bookings.'
      );
    }

    if (user.role === ROLES.CUSTOMER) {
      if (booking.userId.toString() !== user.id.toString()) {
        throw AppError.forbidden('You do not have access to this booking.');
      }
    } else if (user.role === ROLES.WORKER) {
      const provider = await providerRepository.findByUserId(user.id);
      if (!provider || provider._id.toString() !== booking.providerId?._id?.toString()) {
        throw AppError.forbidden('You do not have access to this booking.');
      }
    }

    return booking;
  }

  async _assertTicketAccess(user, ticket) {
    if (user.role === ROLES.ADMIN) return;

    if (ticket.raisedBy.toString() !== user.id.toString()) {
      throw AppError.forbidden('You do not have access to this ticket.');
    }
  }
}

module.exports = new SupportService();
