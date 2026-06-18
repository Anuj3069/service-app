/**
 * tests/integration/address.test.js — Address Module Integration Tests
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';

const app = require('../../src/app');
const User = require('../../src/modules/auth/auth.model');
const Address = require('../../src/modules/address/address.model');
const { createTestCustomer, createTestWorker } = require('../helpers/auth.helper');

let mongoServer;
let customer;
let token;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  const result = await createTestCustomer();
  customer = result.user;
  token = result.token;
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Address Module', () => {
  const sampleAddressPayload = {
    label: 'home',
    fullAddress: '123 Main St, Bengaluru, Karnataka',
    addressLine2: 'Apt 4B',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716],
    },
    placeId: 'place_123',
    isDefault: false,
  };

  describe('POST /api/v1/user/addresses', () => {
    it('should successfully create a new address and auto-set it as default if it is the first address', async () => {
      const res = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleAddressPayload)
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.address.fullAddress).toBe(sampleAddressPayload.fullAddress);
      expect(res.body.data.address.isDefault).toBe(true); // Should auto-promote first address to default
      expect(res.body.data.address.userId).toBe(customer._id.toString());
    });

    it('should create a second address as non-default by default', async () => {
      // Create first address
      await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'home' })
        .expect(201);

      // Create second address
      const res = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'work', isDefault: false })
        .expect(201);

      expect(res.body.data.address.isDefault).toBe(false);
    });

    it('should change default address if second address is created with isDefault: true', async () => {
      // Create first address
      const res1 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'home' })
        .expect(201);

      const firstId = res1.body.data.address._id;

      // Create second address as default
      const res2 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'work', isDefault: true })
        .expect(201);

      expect(res2.body.data.address.isDefault).toBe(true);

      // Check first address is no longer default
      const firstAddress = await Address.findById(firstId);
      expect(firstAddress.isDefault).toBe(false);
    });

    it('should reject validation errors (e.g. missing coordinates)', async () => {
      const invalidPayload = { ...sampleAddressPayload };
      delete invalidPayload.location;

      await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayload)
        .expect(400);
    });

    it('should enforce the maximum limit of 10 addresses', async () => {
      // Create 10 addresses
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/v1/user/addresses')
          .set('Authorization', `Bearer ${token}`)
          .send({ ...sampleAddressPayload, fullAddress: `Address ${i}` })
          .expect(201);
      }

      // Try to create 11th address
      const res = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleAddressPayload)
        .expect(400);

      expect(res.body.message).toContain('maximum of 10 addresses');
    });

    it('should reject requests from workers', async () => {
      const { token: workerToken } = await createTestWorker();
      await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${workerToken}`)
        .send(sampleAddressPayload)
        .expect(403);
    });
  });

  describe('GET /api/v1/user/addresses', () => {
    it('should return all addresses sorted with default address first', async () => {
      // Create work (default first)
      const res1 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'home' }); // Default = true

      // Create home as default (this shifts default to work)
      const res2 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'work', isDefault: true });

      const res = await request(app)
        .get('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.addresses).toHaveLength(2);
      expect(res.body.data.addresses[0]._id).toBe(res2.body.data.address._id);
      expect(res.body.data.addresses[0].isDefault).toBe(true);
      expect(res.body.data.addresses[1]._id).toBe(res1.body.data.address._id);
      expect(res.body.data.addresses[1].isDefault).toBe(false);
    });
  });

  describe('GET /api/v1/user/addresses/default', () => {
    it('should fetch the default address', async () => {
      await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleAddressPayload)
        .expect(201);

      const res = await request(app)
        .get('/api/v1/user/addresses/default')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.address.isDefault).toBe(true);
    });

    it('should return 404 if no default address exists', async () => {
      await request(app)
        .get('/api/v1/user/addresses/default')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PUT /api/v1/user/addresses/:id', () => {
    it('should update address details but ignore isDefault: false', async () => {
      const createRes = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleAddressPayload)
        .expect(201);

      const addressId = createRes.body.data.address._id;

      const res = await request(app)
        .put(`/api/v1/user/addresses/${addressId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fullAddress: 'Updated Address Road', isDefault: false })
        .expect(200);

      expect(res.body.data.address.fullAddress).toBe('Updated Address Road');
      expect(res.body.data.address.isDefault).toBe(true); // Should remain default (ignored isDefault: false)
    });

    it('should make an address default when updating with isDefault: true', async () => {
      // First address (default)
      const res1 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'home' });

      // Second address (not default)
      const res2 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'work', isDefault: false });

      const secondId = res2.body.data.address._id;

      const res = await request(app)
        .put(`/api/v1/user/addresses/${secondId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isDefault: true })
        .expect(200);

      expect(res.body.data.address.isDefault).toBe(true);

      // Verify first address was unmarked
      const firstAddress = await Address.findById(res1.body.data.address._id);
      expect(firstAddress.isDefault).toBe(false);
    });

    it('should prevent updating an address owned by another user', async () => {
      const res1 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleAddressPayload);

      const { token: otherToken } = await createTestCustomer();

      await request(app)
        .put(`/api/v1/user/addresses/${res1.body.data.address._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ fullAddress: 'Hacked Road' })
        .expect(403);
    });
  });

  describe('PUT /api/v1/user/addresses/:id/default', () => {
    it('should set an address as the default', async () => {
      const res1 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'home' });

      const res2 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'work', isDefault: false });

      const secondId = res2.body.data.address._id;

      const res = await request(app)
        .put(`/api/v1/user/addresses/${secondId}/default`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.address.isDefault).toBe(true);

      const firstAddress = await Address.findById(res1.body.data.address._id);
      expect(firstAddress.isDefault).toBe(false);
    });
  });

  describe('DELETE /api/v1/user/addresses/:id', () => {
    it('should prevent deleting the only address', async () => {
      const res1 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleAddressPayload);

      const res = await request(app)
        .delete(`/api/v1/user/addresses/${res1.body.data.address._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(res.body.message).toContain('at least one saved address');
    });

    it('should successfully delete an address if there are multiple, and promote another if the deleted one was default', async () => {
      const res1 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'home' }); // default = true

      const res2 = await request(app)
        .post('/api/v1/user/addresses')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...sampleAddressPayload, label: 'work', isDefault: false });

      const firstId = res1.body.data.address._id;
      const secondId = res2.body.data.address._id;

      await request(app)
        .delete(`/api/v1/user/addresses/${firstId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify second address is promoted to default
      const secondAddress = await Address.findById(secondId);
      expect(secondAddress.isDefault).toBe(true);
    });
  });
});
