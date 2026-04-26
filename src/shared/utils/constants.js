/**
 * src/shared/utils/constants.js — Application Constants & Enums
 *
 * Single source of truth for all enum values used across modules.
 */

const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  WORKER: 'worker',
  ADMIN: 'admin',
});

const BOOKING_STATUS = Object.freeze({
  REQUESTED: 'requested',
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

const DAYS_OF_WEEK = Object.freeze([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

// Status transitions — defines valid "from → to" transitions
const BOOKING_TRANSITIONS = Object.freeze({
  [BOOKING_STATUS.REQUESTED]: [
    BOOKING_STATUS.ACCEPTED,
    BOOKING_STATUS.EXPIRED,
  ],
  [BOOKING_STATUS.PENDING]: [
    BOOKING_STATUS.ACCEPTED,
    BOOKING_STATUS.REJECTED,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.EXPIRED,
  ],
  [BOOKING_STATUS.ACCEPTED]: [
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.CANCELLED,
  ],
  [BOOKING_STATUS.REJECTED]: [],
  [BOOKING_STATUS.COMPLETED]: [],
  [BOOKING_STATUS.CANCELLED]: [],
  [BOOKING_STATUS.EXPIRED]: [],
});

module.exports = {
  ROLES,
  BOOKING_STATUS,
  BOOKING_TRANSITIONS,
  DAYS_OF_WEEK,
};
