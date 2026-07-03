const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { ROLES } = require('../../shared/utils/constants');
const {
  bookingIdParam,
  ticketIdParam,
  createTicketSchema,
  sendMessageSchema,
  updateStatusSchema,
  listTicketsSchema,
} = require('./support.validation');
const {
  createTicket,
  getTicketByBooking,
  sendMessage,
  getMessages,
  listTickets,
  getTicketById,
  adminSendMessage,
  updateStatus,
} = require('./support.controller');

const router = Router();

// ── Customer ────────────────────────────────────────────────────
router.post(
  '/user/bookings/:bookingId/support',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(createTicketSchema),
  createTicket
);

router.get(
  '/user/bookings/:bookingId/support',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(bookingIdParam),
  getTicketByBooking
);

router.post(
  '/user/support/:ticketId/messages',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(sendMessageSchema),
  sendMessage
);

router.get(
  '/user/support/:ticketId/messages',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(ticketIdParam),
  getMessages
);

// ── Worker ─────────────────────────────────────────────────────
router.post(
  '/worker/bookings/:bookingId/support',
  authenticate,
  authorize(ROLES.WORKER),
  validate(createTicketSchema),
  createTicket
);

router.get(
  '/worker/bookings/:bookingId/support',
  authenticate,
  authorize(ROLES.WORKER),
  validate(bookingIdParam),
  getTicketByBooking
);

router.post(
  '/worker/support/:ticketId/messages',
  authenticate,
  authorize(ROLES.WORKER),
  validate(sendMessageSchema),
  sendMessage
);

router.get(
  '/worker/support/:ticketId/messages',
  authenticate,
  authorize(ROLES.WORKER),
  validate(ticketIdParam),
  getMessages
);

// ── Admin ──────────────────────────────────────────────────────
router.get(
  '/admin/support',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(listTicketsSchema),
  listTickets
);

router.get(
  '/admin/support/:ticketId',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(ticketIdParam),
  getTicketById
);

router.post(
  '/admin/support/:ticketId/messages',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(sendMessageSchema),
  adminSendMessage
);

router.patch(
  '/admin/support/:ticketId/status',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(updateStatusSchema),
  updateStatus
);

module.exports = router;
