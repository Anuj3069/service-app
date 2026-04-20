/**
 * src/seeds/providers.seed.js — Seed Test Providers
 *
 * Run: node src/seeds/providers.seed.js
 *
 * Creates 5 worker users with provider profiles.
 * Password for all: "password123"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../modules/auth/auth.model');
const Provider = require('../modules/provider/provider.model');

const providers = [
  {
    user: {
      name: 'Rajesh Kumar',
      email: 'rajesh@worker.com',
      phone: '+91-9876543210',
      password: 'password123',
      role: 'worker',
    },
    profile: {
      skills: ['cleaning', 'deep-cleaning', 'kitchen-cleaning', 'sanitization'],
      location: {
        type: 'Point',
        coordinates: [77.5946, 12.9716], // Bangalore
        address: 'Koramangala, Bangalore',
      },
      availability: [
        { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00', '14:00-15:00'] },
        { dayOfWeek: 'tuesday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00', '15:00-16:00'] },
        { dayOfWeek: 'wednesday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00'] },
        { dayOfWeek: 'thursday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
        { dayOfWeek: 'friday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00', '14:00-15:00'] },
      ],
      rating: 4.5,
      totalJobs: 120,
      isVerified: true,
      isAvailable: true,
    },
  },
  {
    user: {
      name: 'Suresh Patel',
      email: 'suresh@worker.com',
      phone: '+91-9876543211',
      password: 'password123',
      role: 'worker',
    },
    profile: {
      skills: ['plumbing', 'pipe-repair', 'tap-installation', 'drain-cleaning'],
      location: {
        type: 'Point',
        coordinates: [77.6100, 12.9352],
        address: 'Indiranagar, Bangalore',
      },
      availability: [
        { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00'] },
        { dayOfWeek: 'tuesday', slots: ['09:00-10:00', '10:00-11:00'] },
        { dayOfWeek: 'wednesday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00', '15:00-16:00'] },
        { dayOfWeek: 'thursday', slots: ['09:00-10:00', '10:00-11:00'] },
        { dayOfWeek: 'friday', slots: ['09:00-10:00', '14:00-15:00', '15:00-16:00'] },
        { dayOfWeek: 'saturday', slots: ['09:00-10:00', '10:00-11:00'] },
      ],
      rating: 4.8,
      totalJobs: 200,
      isVerified: true,
      isAvailable: true,
    },
  },
  {
    user: {
      name: 'Amit Sharma',
      email: 'amit@worker.com',
      phone: '+91-9876543212',
      password: 'password123',
      role: 'worker',
    },
    profile: {
      skills: ['electrical', 'wiring', 'fan-installation'],
      location: {
        type: 'Point',
        coordinates: [77.5800, 12.9200],
        address: 'Jayanagar, Bangalore',
      },
      availability: [
        { dayOfWeek: 'monday', slots: ['10:00-11:00', '11:00-12:00', '14:00-15:00'] },
        { dayOfWeek: 'wednesday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
        { dayOfWeek: 'friday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00'] },
        { dayOfWeek: 'saturday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00', '14:00-15:00'] },
      ],
      rating: 4.2,
      totalJobs: 85,
      isVerified: true,
      isAvailable: true,
    },
  },
  {
    user: {
      name: 'Vikram Singh',
      email: 'vikram@worker.com',
      phone: '+91-9876543213',
      password: 'password123',
      role: 'worker',
    },
    profile: {
      skills: ['painting', 'interior-painting', 'touch-up'],
      location: {
        type: 'Point',
        coordinates: [77.6200, 12.9500],
        address: 'Whitefield, Bangalore',
      },
      availability: [
        { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00', '14:00-15:00', '15:00-16:00'] },
        { dayOfWeek: 'tuesday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00'] },
        { dayOfWeek: 'wednesday', slots: ['09:00-10:00', '10:00-11:00'] },
        { dayOfWeek: 'thursday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00', '15:00-16:00'] },
        { dayOfWeek: 'friday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
      ],
      rating: 4.6,
      totalJobs: 150,
      isVerified: true,
      isAvailable: true,
    },
  },
  {
    user: {
      name: 'Manoj Verma',
      email: 'manoj@worker.com',
      phone: '+91-9876543214',
      password: 'password123',
      role: 'worker',
    },
    profile: {
      skills: ['cleaning', 'plumbing', 'pipe-repair', 'sanitization'],
      location: {
        type: 'Point',
        coordinates: [77.5700, 12.9800],
        address: 'Malleshwaram, Bangalore',
      },
      availability: [
        { dayOfWeek: 'monday', slots: ['09:00-10:00', '10:00-11:00'] },
        { dayOfWeek: 'tuesday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00'] },
        { dayOfWeek: 'wednesday', slots: ['09:00-10:00', '10:00-11:00', '11:00-12:00'] },
        { dayOfWeek: 'thursday', slots: ['09:00-10:00', '10:00-11:00', '14:00-15:00', '15:00-16:00'] },
        { dayOfWeek: 'friday', slots: ['09:00-10:00', '10:00-11:00'] },
      ],
      rating: 3.9,
      totalJobs: 45,
      isVerified: true,
      isAvailable: true,
    },
  },
];

const seedProviders = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('📦 Connected to MongoDB');

    // Clear existing providers (but not all users)
    await Provider.deleteMany({});
    await User.deleteMany({ role: 'worker' });
    console.log('🗑️  Cleared existing worker users and provider profiles');

    for (const item of providers) {
      // Create worker user
      const user = await User.create(item.user);
      console.log(`✅ Worker: ${user.name} (${user.email})`);

      // Create provider profile
      await Provider.create({
        userId: user._id,
        ...item.profile,
      });
      console.log(`   └─ Profile created with skills: [${item.profile.skills.join(', ')}]`);
    }

    console.log('\n🎉 Providers seeded successfully!');
    console.log('📌 All worker passwords: password123');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
};

seedProviders();
