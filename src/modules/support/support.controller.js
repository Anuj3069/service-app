const asyncHandler = require('../../shared/middleware/async-handler');
const ApiResponse = require('../../shared/utils/api-response');
const supportService = require('./support.service');

// ── Customer / Worker ──────────────────────────────────────────

const createTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.createTicket(
    req.user,
    req.params.bookingId,
    req.body.issue
  );

  const io = req.app.get('io');
  const socketStore = req.app.get('socketStore');

  if (io && socketStore) {
    // Notify all connected admin sockets
    io.to('admin').emit('support-ticket-created', {
      ticketId: ticket._id,
      bookingId: req.params.bookingId,
      raisedByRole: req.user.role,
      issue: req.body.issue,
    });
  }

  ApiResponse.created(res, { ticket }, 'Support ticket created successfully.');
});

const getTicketByBooking = asyncHandler(async (req, res) => {
  const ticket = await supportService.getTicketByBooking(req.user, req.params.bookingId);
  ApiResponse.ok(res, { ticket }, 'Support ticket retrieved successfully.');
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await supportService.sendMessage(req.user, req.params.ticketId, req.body.text);

  const io = req.app.get('io');
  if (io) {
    io.to(`support:${req.params.ticketId}`).emit('support-message', {
      ticketId: req.params.ticketId,
      message,
    });
    // Also notify admin room
    io.to('admin').emit('support-message', {
      ticketId: req.params.ticketId,
      message,
    });
  }

  ApiResponse.created(res, { message }, 'Message sent successfully.');
});

const getMessages = asyncHandler(async (req, res) => {
  const messages = await supportService.getMessages(req.user, req.params.ticketId);
  ApiResponse.ok(res, { messages, count: messages.length }, 'Messages retrieved successfully.');
});

// ── Admin ──────────────────────────────────────────────────────

const listTickets = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const result = await supportService.listTickets({ status, page: +page, limit: +limit });
  ApiResponse.ok(res, result, 'Support tickets retrieved successfully.');
});

const getTicketById = asyncHandler(async (req, res) => {
  const ticket = await supportService.getTicketById(req.params.ticketId);
  ApiResponse.ok(res, { ticket }, 'Support ticket retrieved successfully.');
});

const adminSendMessage = asyncHandler(async (req, res) => {
  const { message, status } = await supportService.adminSendMessage(
    req.user,
    req.params.ticketId,
    req.body.text
  );

  const io = req.app.get('io');
  if (io) {
    io.to(`support:${req.params.ticketId}`).emit('support-message', {
      ticketId: req.params.ticketId,
      message,
    });
    if (status !== 'open') {
      io.to(`support:${req.params.ticketId}`).emit('support-status-changed', {
        ticketId: req.params.ticketId,
        status,
      });
    }
  }

  ApiResponse.created(res, { message }, 'Message sent successfully.');
});

const updateStatus = asyncHandler(async (req, res) => {
  const ticket = await supportService.updateStatus(req.params.ticketId, req.body.status);

  const io = req.app.get('io');
  if (io) {
    io.to(`support:${req.params.ticketId}`).emit('support-status-changed', {
      ticketId: req.params.ticketId,
      status: ticket.status,
    });
  }

  ApiResponse.ok(res, { ticket }, 'Ticket status updated successfully.');
});

module.exports = {
  createTicket,
  getTicketByBooking,
  sendMessage,
  getMessages,
  listTickets,
  getTicketById,
  adminSendMessage,
  updateStatus,
};
