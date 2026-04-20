/**
 * tests/integration/services.test.js — Service Listing Tests
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';

const app = require('../../src/app');
const User = require('../../src/modules/auth/auth.model');
const { Category, Service } = require('../../src/modules/service/service.model');
const { generateToken } = require('../helpers/auth.helper');

let mongoServer;
let customerToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  // Create a customer user
  const customer = await User.create({
    name: 'Test Customer',
    email: 'customer@test.com',
    password: 'password123',
    role: 'customer',
  });
  customerToken = generateToken(customer);

  // Seed test services
  const category = await Category.create({
    name: 'Plumbing',
    icon: '🔧',
    description: 'Plumbing services',
  });

  await Service.insertMany([
    {
      name: 'Pipe Repair',
      category: category._id,
      description: 'Fix pipes',
      basePrice: 1500,
      duration: 90,
      requiredSkills: ['plumbing', 'pipe-repair'],
    },
    {
      name: 'Tap Installation',
      category: category._id,
      description: 'Install taps',
      basePrice: 500,
      duration: 45,
      requiredSkills: ['plumbing', 'tap-installation'],
    },
  ]);
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

describe('Service Module', () => {
  describe('GET /api/v1/user/services', () => {
    it('should list all services grouped by category', async () => {
      const res = await request(app)
        .get('/api/v1/user/services')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.categories).toHaveLength(1);
      expect(res.body.data.categories[0].name).toBe('Plumbing');
      expect(res.body.data.categories[0].services).toHaveLength(2);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app)
        .get('/api/v1/user/services')
        .expect(401);
    });

    it('should reject worker role', async () => {
      const worker = await User.create({
        name: 'Worker',
        email: 'worker@test.com',
        password: 'password123',
        role: 'worker',
      });
      const workerToken = generateToken(worker);

      await request(app)
        .get('/api/v1/user/services')
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(403);
    });
  });

  describe('GET /api/v1/user/services/:id', () => {
    it('should get a single service by ID', async () => {
      const service = await Service.findOne({ name: 'Pipe Repair' });

      const res = await request(app)
        .get(`/api/v1/user/services/${service._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.data.service.name).toBe('Pipe Repair');
      expect(res.body.data.service.basePrice).toBe(1500);
    });

    it('should return 404 for non-existent service', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await request(app)
        .get(`/api/v1/user/services/${fakeId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(404);
    });
  });
});
