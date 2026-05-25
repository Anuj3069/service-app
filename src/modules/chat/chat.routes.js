const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth.middleware');
const validate = require('../../shared/middleware/validate.middleware');
const { ROLES } = require('../../shared/utils/constants');
const { bookingChatParamsSchema, sendMessageSchema } = require('./chat.validation');
const { getMessages, sendMessage } = require('./chat.controller');

const router = Router();

router.get(
  '/user/bookings/:id/chat',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(bookingChatParamsSchema),
  getMessages
);

router.post(
  '/user/bookings/:id/chat',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(sendMessageSchema),
  sendMessage
);

router.get(
  '/worker/bookings/:id/chat',
  authenticate,
  authorize(ROLES.WORKER),
  validate(bookingChatParamsSchema),
  getMessages
);

router.post(
  '/worker/bookings/:id/chat',
  authenticate,
  authorize(ROLES.WORKER),
  validate(sendMessageSchema),
  sendMessage
);

module.exports = router;
