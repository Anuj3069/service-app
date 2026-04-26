/**
 * src/seeds/services.seed.js — Seed Categories & Services
 *
 * Run: node src/seeds/services.seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');
const { Category, Service } = require('../modules/service/service.model');

const seedData = [
  {
    category: { name: 'Home Cleaning', icon: '🧹', description: 'Professional home cleaning services' },
    services: [
      {
        name: 'Deep House Cleaning',
        description: 'Thorough cleaning of entire house including hard-to-reach areas',
        basePrice: 2500,
        duration: 180,
        requiredSkills: ['cleaning', 'deep-cleaning'],
      },
      {
        name: 'Kitchen Cleaning',
        description: 'Professional kitchen deep clean including appliances',
        basePrice: 800,
        duration: 60,
        requiredSkills: ['cleaning', 'kitchen-cleaning'],
      },
      {
        name: 'Bathroom Sanitization',
        description: 'Complete bathroom cleaning and sanitization',
        basePrice: 600,
        duration: 45,
        requiredSkills: ['cleaning', 'sanitization'],
      },
    ],
  },
  {
    category: { name: 'Plumbing', icon: '🔧', description: 'Expert plumbing repair and installation' },
    services: [
      {
        name: 'Pipe Repair',
        description: 'Fix leaking or broken pipes',
        basePrice: 1500,
        duration: 90,
        requiredSkills: ['plumbing', 'pipe-repair'],
      },
      {
        name: 'Tap Installation',
        description: 'Install or replace kitchen/bathroom taps',
        basePrice: 500,
        duration: 45,
        requiredSkills: ['plumbing', 'tap-installation'],
      },
      {
        name: 'Drain Unclogging',
        description: 'Clear clogged drains and sewer lines',
        basePrice: 700,
        duration: 60,
        requiredSkills: ['plumbing', 'drain-cleaning'],
      },
    ],
  },
  {
    category: { name: 'Electrical', icon: '⚡', description: 'Electrical repair and installation services' },
    services: [
      {
        name: 'Wiring Repair',
        description: 'Fix faulty wiring and electrical issues',
        basePrice: 1200,
        duration: 90,
        requiredSkills: ['electrical', 'wiring'],
      },
      {
        name: 'Fan Installation',
        description: 'Install ceiling or wall-mounted fans',
        basePrice: 400,
        duration: 30,
        requiredSkills: ['electrical', 'fan-installation'],
      },
    ],
  },
  {
    category: { name: 'Painting', icon: '🎨', description: 'Interior and exterior painting services' },
    services: [
      {
        name: 'Room Painting',
        description: 'Professional painting for a single room',
        basePrice: 3000,
        duration: 240,
        requiredSkills: ['painting', 'interior-painting'],
      },
      {
        name: 'Wall Touch-up',
        description: 'Touch-up painting for small areas',
        basePrice: 800,
        duration: 60,
        requiredSkills: ['painting', 'touch-up'],
      },
    ],
  },
];

const seedServices = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('📦 Connected to MongoDB');

    // Clear existing data
    await Category.deleteMany({});
    await Service.deleteMany({});
    console.log('🗑️  Cleared existing categories and services');

    for (const item of seedData) {
      // Create category
      const category = await Category.create(item.category);
      console.log(`✅ Category: ${category.name}`);

      // Create services for this category
      const services = item.services.map((s) => ({
        ...s,
        category: category._id,
      }));

      await Service.insertMany(services);
      console.log(`   └─ ${services.length} services created`);
    }

    console.log('\n🎉 Services seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
};

seedServices();
