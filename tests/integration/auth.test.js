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
const { flushRedis } = require('../../src/config/redis');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await User.deleteMany({});
  await flushRedis();
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

    it('should register a new customer successfully without password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Jane Customer',
          email: 'jane_nopass@example.com',
          role: 'customer',
        })
        .expect(201);

      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe('jane_nopass@example.com');
      expect(res.body.data.user.role).toBe('customer');
    });

    it('should reject worker registration without password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Bob Worker',
          email: 'bob_nopass@example.com',
          role: 'worker',
        })
        .expect(400);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('Password is required');
    });
  });

  // ─── LOGIN ──────────────────────────────────────────────
  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'worker', // Use worker role to test password-based login
      });
    });

    it('should login with correct credentials for worker', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'john@example.com', password: 'password123' })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe('john@example.com');
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });

    it('should reject password login for customer', async () => {
      // 1. Register a customer
      await request(app).post('/api/v1/auth/register').send({
        name: 'Customer Jane',
        email: 'jane@example.com',
        password: 'password123',
        role: 'customer',
      });

      // 2. Try to log in with password
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'jane@example.com', password: 'password123' })
        .expect(403);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('Password-based login is disabled for customers');
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

  // ─── CUSTOMER OTP LOGIN ──────────────────────────────────
  describe('Customer OTP Login Flow', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'Customer Jane',
        email: 'jane@example.com',
        password: 'password123',
        role: 'customer',
      });
    });

    it('should successfully send an OTP to customer email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email: 'jane@example.com' })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.message).toContain('OTP sent successfully');

      // Verify OTP stored in Redis
      const { getRedisClient } = require('../../src/config/redis');
      const storedOtp = await getRedisClient().get('otp:customer:jane@example.com');
      expect(storedOtp).toBeDefined();
      expect(storedOtp).toHaveLength(6);
    });

    it('should reject OTP request for non-customer accounts (e.g. worker)', async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'Worker Bob',
        email: 'bob@example.com',
        password: 'password123',
        role: 'worker',
      });

      const res = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email: 'bob@example.com' })
        .expect(403);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('OTP login is only available for customer accounts');
    });

    it('should verify OTP and log in customer successfully', async () => {
      // 1. Send OTP
      await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email: 'jane@example.com' })
        .expect(200);

      // 2. Fetch OTP from Redis mock
      const { getRedisClient } = require('../../src/config/redis');
      const otp = await getRedisClient().get('otp:customer:jane@example.com');

      // 3. Verify OTP
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'jane@example.com', otp })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe('jane@example.com');
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();

      // Redis key should be cleaned up
      const afterVerification = await getRedisClient().get('otp:customer:jane@example.com');
      expect(afterVerification).toBeNull();
    });

    it('should reject invalid OTP', async () => {
      // 1. Send OTP
      await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email: 'jane@example.com' })
        .expect(200);

      // 2. Verify with wrong OTP
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'jane@example.com', otp: '000000' })
        .expect(401);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('Invalid OTP');
    });

    it('should reject verification if OTP expired or not sent', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'jane@example.com', otp: '123456' })
        .expect(401);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('OTP has expired or is invalid');
    });

    it('should auto-register a customer on successful first-time OTP verification', async () => {
      const newEmail = 'new_customer@example.com';

      // 1. Send OTP to unregistered email
      await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ email: newEmail })
        .expect(200);

      // 2. Fetch OTP from Redis mock
      const { getRedisClient } = require('../../src/config/redis');
      const otp = await getRedisClient().get(`otp:customer:${newEmail}`);
      expect(otp).toBeDefined();

      // 3. Verify OTP
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: newEmail, otp })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe(newEmail);
      expect(res.body.data.user.name).toBe('New Customer');
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.tokens.accessToken).toBeDefined();

      // 4. Verify user exists in DB
      const User = require('../../src/modules/auth/auth.model');
      const dbUser = await User.findOne({ email: newEmail });
      expect(dbUser).toBeDefined();
      expect(dbUser.name).toBe('New Customer');
    });
  });

  // ─── FORGOT & RESET PASSWORD ────────────────────────────
  describe('Forgot & Reset Password Flow (Workers & Admins)', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'Worker Bob',
        email: 'bob@example.com',
        password: 'password123',
        role: 'worker',
      });
    });

    it('should send a password reset link/token successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'bob@example.com' })
        .expect(200);

      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('password reset link has been sent');
    });

    it('should reject password reset request for customer accounts', async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'Customer Jane',
        email: 'jane@example.com',
        role: 'customer',
      });

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'jane@example.com' })
        .expect(400);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('do not require a password reset');
    });

    it('should successfully reset password with valid token', async () => {
      // 1. Request reset
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'bob@example.com' })
        .expect(200);

      // 2. Fetch token from Redis mock
      const { getRedisClient } = require('../../src/config/redis');
      const keys = await getRedisClient().keys('password-reset:token:*');
      expect(keys).toHaveLength(1);
      const token = keys[0].split(':').pop();

      // 3. Reset password
      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'newpassword123' })
        .expect(200);

      expect(resetRes.body.status).toBe('success');
      expect(resetRes.body.message).toContain('Password has been reset successfully');

      // 4. Verify login with new password succeeds
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'bob@example.com', password: 'newpassword123' })
        .expect(200);

      expect(loginRes.body.status).toBe('success');
      expect(loginRes.body.data.tokens.accessToken).toBeDefined();

      // Token should be cleaned up from Redis
      const keyExists = await getRedisClient().exists(keys[0]);
      expect(keyExists).toBe(0);
    });

    it('should reject password reset with invalid or expired token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'non-existent-token', password: 'newpassword123' })
        .expect(400);

      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('token is invalid or has expired');
    });
  });
});
