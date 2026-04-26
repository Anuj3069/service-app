/**
 * tests/integration/match.test.js — Auto-Match Integration Tests
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';

const app = require('../../src/app');
const User = require('../../src/modules/auth/auth.model');
const Provider = require('../../src/modules/provider/provider.model');
const { Category, Service } = require('../../src/modules/service/service.model');
const { generateToken, getNextDayOfWeek } = require('../helpers/auth.helper');

let mongoServer;
let customerToken;
let testService;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  // Create customer
  const customer = await User.create({
    name: 'Customer',
    email: 'customer@test.com',
    password: 'password123',
    role: 'customer',
  });
  customerToken = generateToken(customer);

  // Create category + service
  const category = await Category.create({ name: 'Plumbing', icon: '🔧' });
  testService = await Service.create({
    name: 'Pipe Repair',
    category: category._id,
    basePrice: 1500,
    duration: 90,
    requiredSkills: ['plumbing', 'pipe-repair'],
  });

  // Create worker + provider profile
  const worker = await User.create({
    name: 'Plumber Joe',
    email: 'plumber@test.com',
    password: 'password123',
    role: 'worker',
  });

  await Provider.create({
    userId: worker._id,
    skills: ['plumbing', 'pipe-repair', 'drain-cleaning'],
    availability: [
      { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
      { dayOfWeek: 'tuesday', slots: ['09:00-10:00', '10:00-11:00'] },
      { dayOfWeek: 'wednesday', slots: ['09:00-10:00', '10:00-11:00'] },
      { dayOfWeek: 'thursday', slots: ['09:00-10:00', '10:00-11:00'] },
      { dayOfWeek: 'friday', slots: ['09:00-10:00', '10:00-11:00'] },
    ],
    rating: 4.5,
    totalJobs: 100,
    isVerified: true,
    isAvailable: true,
  });
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

describe('Match Module', () => {
  describe('POST /api/v1/user/match', () => {
    it('should match a provider for a valid request', async () => {
      const nextMonday = getNextDayOfWeek('monday');

      const res = await request(app)
        .post('/api/v1/user/match')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: testService._id.toString(),
          date: nextMonday.toISOString(),
          slot: '09:00-10:00',
        })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.match.provider).toBeDefined();
      expect(res.body.data.match.provider.name).toBe('Plumber Joe');
      expect(res.body.data.match.price).toBe(1500);
      expect(res.body.data.match.estimatedDuration).toBe(90);
    });

    it('should return 404 when no providers have matching skills', async () => {
      // Create a service that requires a skill no provider has
      const category = await Category.findOne({});
      const niche = await Service.create({
        name: 'Niche Service',
        category: category._id,
        basePrice: 5000,
        duration: 120,
        requiredSkills: ['quantum-plumbing'],
      });

      const nextMonday = getNextDayOfWeek('monday');

      await request(app)
        .post('/api/v1/user/match')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: niche._id.toString(),
          date: nextMonday.toISOString(),
          slot: '09:00-10:00',
        })
        .expect(404);
    });

    it('should return 404 when no providers available on requested slot', async () => {
      const nextMonday = getNextDayOfWeek('monday');

      await request(app)
        .post('/api/v1/user/match')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: testService._id.toString(),
          date: nextMonday.toISOString(),
          slot: '20:00-21:00', // No provider has this slot
        })
        .expect(404);
    });

    it('should reject invalid service ID', async () => {
      const nextMonday = getNextDayOfWeek('monday');
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .post('/api/v1/user/match')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: fakeId.toString(),
          date: nextMonday.toISOString(),
          slot: '09:00-10:00',
        })
        .expect(404);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app)
        .post('/api/v1/user/match')
        .send({
          serviceId: testService._id.toString(),
          date: new Date().toISOString(),
          slot: '09:00-10:00',
        })
        .expect(401);
    });
  });
});
