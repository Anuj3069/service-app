const expiryScheduler = require('../../src/shared/utils/expiry-scheduler');
const { getRedisClient, disconnectRedis, flushRedis } = require('../../src/config/redis');

process.env.NODE_ENV = 'test';

let redis;

beforeAll(() => {
  redis = getRedisClient();
});

afterAll(async () => {
  await disconnectRedis();
});

beforeEach(async () => {
  await flushRedis();
});

describe('ExpiryScheduler', () => {
  it('schedules a key with TTL in Redis', async () => {
    const bookingId = 'test-booking-1';
    const expiresAt = new Date(Date.now() + 3000); // 3 seconds

    await expiryScheduler.schedule(bookingId, expiresAt);

    const key = `booking:expiry:${bookingId}`;
    const val = await redis.get(key);
    expect(val).toBe('pending');

    const ttl = await redis.ttl(key);
    expect(Number(ttl)).toBeGreaterThan(0);
  });

  it('cancels a scheduled key', async () => {
    const bookingId = 'test-booking-2';
    const expiresAt = new Date(Date.now() + 5000);

    await expiryScheduler.schedule(bookingId, expiresAt);

    const key = `booking:expiry:${bookingId}`;
    let val = await redis.get(key);
    expect(val).toBe('pending');

    await expiryScheduler.cancel(bookingId);
    val = await redis.get(key);
    expect(val).toBeNull();
  });
});
