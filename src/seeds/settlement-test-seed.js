/**
 * src/seeds/settlement-test-seed.js
 *
 * Creates a complete test scenario for the Settlement feature:
 *  - 1 Worker user  (role: worker)
 *  - 1 Admin user   (role: admin)
 *  - 1 Provider profile for the worker
 *  - 2 Bookings in status: completed + paymentStatus: paid
 *
 * Run: node src/seeds/settlement-test-seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User     = require('../modules/auth/auth.model');
const Provider = require('../modules/provider/provider.model');
const Booking  = require('../modules/booking/booking.model');

const MONGO_URI = process.env.MONGODB_URI;

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // ── Clean up old test data ────────────────────────────────
  await User.deleteMany({ email: { $in: ['testworker@settlement.com', 'testadmin@settlement.com'] } });
  console.log('🧹 Cleaned old test users');

  // ── Create Worker User ────────────────────────────────────
  const workerUser = await User.create({
    name:     'Test Worker',
    email:    'testworker@settlement.com',
    phone:    '9000000001',
    password: 'Worker@123',
    role:     'worker',
    isActive: true,
  });
  console.log(`👷 Worker created  → email: testworker@settlement.com  password: Worker@123`);
  console.log(`   Worker userId   → ${workerUser._id}`);

  // ── Create Admin User ─────────────────────────────────────
  const adminUser = await User.create({
    name:     'Test Admin',
    email:    'testadmin@settlement.com',
    phone:    '9000000002',
    password: 'Admin@123',
    role:     'admin',
    isActive: true,
  });
  console.log(`🔑 Admin created   → email: testadmin@settlement.com   password: Admin@123`);
  console.log(`   Admin userId    → ${adminUser._id}`);

  // ── Create Provider Profile ───────────────────────────────
  const provider = await Provider.create({
    userId:       workerUser._id,
    skills:       ['plumbing', 'electrical'],
    isVerified:   true,
    isAvailable:  true,
    rating:       4.5,
    totalJobs:    10,
    location: {
      type:        'Point',
      coordinates: [72.8777, 19.0760], // Mumbai
      address:     'Mumbai, Maharashtra',
    },
  });
  console.log(`🏠 Provider profile → providerId: ${provider._id}`);

  // ── Create 2 Completed + Paid Bookings ───────────────────
  const bookingBase = {
    providerId:    provider._id,
    userId:        workerUser._id,   // using worker as customer for simplicity
    serviceId:     new mongoose.Types.ObjectId(),
    status:        'completed',
    paymentStatus: 'paid',
    paymentMethod: 'cashfree',
    type:          'SCHEDULED',
    date:          new Date('2026-06-10'),
    slot:          '10:00-11:00',
    completedAt:   new Date('2026-06-10T11:00:00.000Z'),
    paidAt:        new Date('2026-06-10T11:05:00.000Z'),
  };

  const booking1 = await Booking.create({
    ...bookingBase,
    price:         500,
    originalPrice: 500,
    payout:        450,   // 500 * 0.90  (10% commission)
    slot:          '10:00-11:00',
  });

  const booking2 = await Booking.create({
    ...bookingBase,
    price:         800,
    originalPrice: 800,
    payout:        720,   // 800 * 0.90
    slot:          '14:00-15:00',
  });

  console.log(`📋 Booking 1 created → id: ${booking1._id}  payout: ₹450`);
  console.log(`📋 Booking 2 created → id: ${booking2._id}  payout: ₹720`);
  console.log(`\n💰 Total expected settlement amount: ₹${450 + 720} (₹1170)`);

  console.log('\n──────────────────────────────────────────────────────────');
  console.log('📋 POSTMAN VARIABLES TO SET:');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`BASE_URL         = http://localhost:3000/api/v1`);
  console.log(`WORKER_EMAIL     = testworker@settlement.com`);
  console.log(`WORKER_PASSWORD  = Worker@123`);
  console.log(`ADMIN_EMAIL      = testadmin@settlement.com`);
  console.log(`ADMIN_PASSWORD   = Admin@123`);
  console.log('──────────────────────────────────────────────────────────');
  console.log('After login, copy the token into workerToken / adminToken variables.');
  console.log('──────────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('✅ Seed complete. DB disconnected.');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
