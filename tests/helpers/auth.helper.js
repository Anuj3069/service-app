/**
 * tests/helpers/auth.helper.js — Test Authentication Helpers
 *
 * Utility functions to create users and generate tokens for testing.
 */

const jwt = require('jsonwebtoken');
const User = require('../../src/modules/auth/auth.model');
const Provider = require('../../src/modules/provider/provider.model');

const JWT_SECRET = 'test-jwt-secret-key';
const JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';

/**
 * Create a test customer user and return user + token
 */
const createTestCustomer = async (overrides = {}) => {
  const userData = {
    name: 'Test Customer',
    email: `customer-${Date.now()}@test.com`,
    phone: '+91-9999999999',
    password: 'password123',
    role: 'customer',
    ...overrides,
  };

  const user = await User.create(userData);
  const token = generateToken(user);

  return { user, token };
};

/**
 * Create a test worker user with provider profile and return all data
 */
const createTestWorker = async (overrides = {}, profileOverrides = {}) => {
  const userData = {
    name: 'Test Worker',
    email: `worker-${Date.now()}@test.com`,
    phone: '+91-8888888888',
    password: 'password123',
    role: 'worker',
    ...overrides,
  };

  const user = await User.create(userData);
  const token = generateToken(user);

  const providerData = {
    userId: user._id,
    skills: ['cleaning', 'plumbing'],
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716],
      address: 'Test Location',
    },
    availability: [
      { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
      { dayOfWeek: 'tuesday', slots: ['09:00-10:00', '10:00-11:00'] },
      { dayOfWeek: 'wednesday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
      { dayOfWeek: 'thursday', slots: ['09:00-10:00', '10:00-11:00'] },
      { dayOfWeek: 'friday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
    ],
    rating: 4.5,
    totalJobs: 50,
    isVerified: true,
    isAvailable: true,
    ...profileOverrides,
  };

  const provider = await Provider.create(providerData);

  return { user, token, provider };
};

/**
 * Generate a JWT token for a user
 */
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
};

/**
 * Get the next occurrence of a specific day of the week
 * @param {string} dayName - e.g., 'monday', 'tuesday'
 * @returns {Date}
 */
const getNextDayOfWeek = (dayName) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = days.indexOf(dayName.toLowerCase());
  const today = new Date();
  const currentDay = today.getDay();

  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget <= 0) {
    daysUntilTarget += 7;
  }

  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  targetDate.setHours(0, 0, 0, 0);

  return targetDate;
};

module.exports = {
  createTestCustomer,
  createTestWorker,
  generateToken,
  getNextDayOfWeek,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
};
