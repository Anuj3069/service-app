/**
 * tests/setup.js — Test Environment Setup
 *
 * Uses mongodb-memory-server to run an in-memory MongoDB instance.
 * No external database needed for testing.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

/**
 * Connect to in-memory MongoDB before all tests
 */
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  await mongoose.connect(uri);
});

/**
 * Clear all collections between tests
 */
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

/**
 * Disconnect and stop MongoDB after all tests
 */
afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});
