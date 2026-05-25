const AppError = require('../../shared/utils/api-error');
const { BOOKING_STATUS, ROLES } = require('../../shared/utils/constants');
const Booking = require('../booking/booking.model');
const providerRepository = require('../provider/provider.repository');
const ChatMessage = require('./chat.model');

class ChatService {
  async getMessages(user, bookingId) {
    await this._getParticipantContext(user, bookingId, { requireAccepted: false });

    return ChatMessage.find({ bookingId })
      .populate('senderId', 'name role')
      .populate('receiverId', 'name role')
      .sort({ createdAt: 1 });
  }

  async sendMessage(user, bookingId, message) {
    const text = message?.trim();
    if (!text) {
      throw AppError.badRequest('Message is required.');
    }

    const { receiverId } = await this._getParticipantContext(user, bookingId, {
      requireAccepted: true,
    });

    const created = await ChatMessage.create({
      bookingId,
      senderId: user.id,
      receiverId,
      message: text,
    });

    return ChatMessage.findById(created._id)
      .populate('senderId', 'name role')
      .populate('receiverId', 'name role');
  }

  async _getParticipantContext(user, bookingId, { requireAccepted }) {
    const booking = await Booking.findById(bookingId).populate({
      path: 'providerId',
      select: 'userId',
    });

    if (!booking) {
      throw AppError.notFound('Booking not found.');
    }

    if (requireAccepted && booking.status !== BOOKING_STATUS.ACCEPTED) {
      throw AppError.badRequest('Chat is available only after the booking is accepted.');
    }

    if (![BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
      throw AppError.badRequest('Chat is not available for this booking yet.');
    }

    const customerId = booking.userId.toString();
    const workerUserId = booking.providerId?.userId?.toString();

    if (!workerUserId) {
      throw AppError.badRequest('Accepted provider is not available for this booking.');
    }

    if (user.role === ROLES.CUSTOMER) {
      if (customerId !== user.id.toString()) {
        throw AppError.forbidden('You do not have access to this chat.');
      }
      return { booking, receiverId: workerUserId };
    }

    if (user.role === ROLES.WORKER) {
      const provider = await providerRepository.findByUserId(user.id);
      if (!provider || provider._id.toString() !== booking.providerId._id.toString()) {
        throw AppError.forbidden('You do not have access to this chat.');
      }
      return { booking, receiverId: customerId };
    }

    throw AppError.forbidden('You do not have access to this chat.');
  }
}

module.exports = new ChatService();
