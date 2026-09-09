/**
 * One-shot restore: TeacherJean was removed by a broken role-change (delete-before-create).
 * Related data (bookings, slots, etc.) still uses teacherId jean10121990@gmail.com.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Teacher = require('../server/models/Teacher');
const Admin = require('../server/models/Admin');

const USERNAME = 'TeacherJean';
const EMAIL = 'jean10121990@gmail.com';
const TEMP_PASSWORD = 'RemoEdTemp2026';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const hash = await bcrypt.hash(TEMP_PASSWORD, 12);

  const existingT = await Teacher.findOne({
    $or: [{ username: USERNAME }, { email: EMAIL }, { teacherId: EMAIL }],
  });
  const existingA = await Admin.findOne({
    $or: [{ username: USERNAME }, { email: EMAIL }],
  });

  if (!existingT) {
    await Teacher.create({
      teacherId: EMAIL,
      username: USERNAME,
      email: EMAIL,
      password: hash,
      firstName: 'Jean',
      nickname: 'TeacherJean',
      status: 'active',
      hasGeneratedPassword: true,
    });
    console.log('Restored Teacher:', USERNAME, EMAIL);
  } else {
    console.log('Teacher already exists:', existingT.username, existingT.teacherId);
  }

  if (!existingA) {
    await Admin.create({
      username: USERNAME,
      email: EMAIL,
      passwordHash: hash,
      adminRole: 'super_admin',
      status: 'active',
      hasGeneratedPassword: true,
      firstName: 'Jean',
    });
    console.log('Restored Admin (super_admin):', USERNAME);
  } else {
    console.log('Admin already exists:', existingA.username, existingA.adminRole);
  }

  console.log('\nTemporary password for both accounts:', TEMP_PASSWORD);
  console.log('Sign in, then change password when prompted (hasGeneratedPassword=true).');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
