/**
 * tests/integration/auth.test.js — Auth Integration Tests
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Set test env vars BEFORE requiring app
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

const app = require('../../src/app');
const User = require('../../src/modules/auth/auth.model');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Auth Module', () => {
  // ─── REGISTER ───────────────────────────────────────────
  describe('POST /api/v1/auth/register', () => {
    const validUser = {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+91-9876543210',
      password: 'password123',
      role: 'customer',
    };

    it('should register a new customer successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser)
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
      // Password should NOT be in response
      expect(res.body.data.user.password).toBeUndefined();
    });

    it('should register a new worker successfully', async () => {
      const workerData = { ...validUser, email: 'worker@example.com', role: 'worker' };
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(workerData)
        .expect(201);

      expect(res.body.data.user.role).toBe('worker');
    });

    it('should reject duplicate email', async () => {
      await request(app).post('/api/v1/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser)
        .expect(409);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('already exists');
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validUser, email: 'invalid-email' })
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validUser, password: '123' })
        .expect(400);

      expect(res.body.status).toBe('fail');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'test@test.com' })
        .expect(400);

      expect(res.body.status).toBe('fail');
    });
  });

  // ─── LOGIN ──────────────────────────────────────────────
  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'customer',
      });
    });

    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'john@example.com', password: 'password123' })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe('john@example.com');
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'john@example.com', password: 'wrongpassword' })
        .expect(401);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('Invalid email or password');
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'noone@example.com', password: 'password123' })
        .expect(401);

      expect(res.body.status).toBe('fail');
    });
  });
});
