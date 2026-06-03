/**
 * src/seeds/promote-admin.js
 *
 * Utility script to promote an existing user or create a new user with the admin role.
 * Usage: node src/seeds/promote-admin.js <email> [name] [password]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../modules/auth/auth.model');
const { ROLES } = require('../shared/utils/constants');

const email = process.argv[2];
const name = process.argv[3] || 'System Admin';
const password = process.argv[4] || 'AdminPass123!';

if (!email) {
  console.error('❌ Error: Email address is required.');
  console.log('Usage: node src/seeds/promote-admin.js <email> [name] [password]');
  process.exit(1);
}

const promote = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not set in environment variables.');
    }

    console.log('🔌 Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB.');

    let user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user) {
      console.log(`👤 User found: "${user.name}" (${user.email}). Promoting to ADMIN...`);
      user.role = ROLES.ADMIN;
      user.isActive = true;
      await user.save();
      console.log('🚀 User successfully promoted to ADMIN role!');
    } else {
      console.log(`👤 User with email "${email}" not found. Creating new ADMIN user...`);
      user = await User.create({
        name,
        email: email.toLowerCase().trim(),
        password,
        role: ROLES.ADMIN,
        isActive: true,
      });
      console.log(`🚀 Admin user successfully created!`);
      console.log(`📧 Email: ${user.email}`);
      console.log(`🔑 Password: ${password}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error promoting user:', error.message);
    process.exit(1);
  }
};

promote();
