/**
 * One-time restore: TeacherJean was deleted by broken /api/auth/user-role.
 * Recreates teacher (same teacherId for bookings) + super_admin portal account.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const EMAIL = 'jean10121990@gmail.com';
const USERNAME = 'TeacherJean';
const OLD_TEACHER_MONGO_ID = '69caa0dbc7874f65c142b583';

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const existingT = await db.collection('teachers').findOne({
    $or: [{ username: USERNAME }, { email: EMAIL }, { teacherId: EMAIL }],
  });
  const existingA = await db.collection('admins').findOne({
    $or: [{ username: USERNAME }, { email: EMAIL }],
  });
  if (existingT || existingA) {
    console.log('ABORT: account already exists', {
      teacher: existingT && String(existingT._id),
      admin: existingA && String(existingA._id),
    });
    await mongoose.disconnect();
    process.exit(1);
  }

  const tempPassword = 'RemoEd!' + crypto.randomBytes(4).toString('hex');
  const hash = await bcrypt.hash(tempPassword, 12);
  const now = new Date();

  const teacherDoc = {
    _id: new mongoose.Types.ObjectId(OLD_TEACHER_MONGO_ID),
    teacherId: EMAIL,
    username: USERNAME,
    password: hash,
    email: EMAIL,
    firstName: 'Jean',
    lastName: '',
    nickname: 'TeacherJean',
    status: 'active',
    hasGeneratedPassword: true,
    hourlyRate: 100,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.collection('teachers').insertOne(teacherDoc);
    console.log('Restored teacher', OLD_TEACHER_MONGO_ID);
  } catch (e) {
    if (e.code === 11000) {
      delete teacherDoc._id;
      const r = await db.collection('teachers').insertOne(teacherDoc);
      console.log('Restored teacher with new id', String(r.insertedId));
    } else {
      throw e;
    }
  }

  await db.collection('admins').insertOne({
    username: USERNAME,
    email: EMAIL,
    passwordHash: hash,
    password: hash,
    adminRole: 'super_admin',
    status: 'active',
    firstName: 'Jean',
    lastName: '',
    hasGeneratedPassword: true,
    createdAt: now,
  });
  console.log('Restored admin', USERNAME);

  console.log('\nTEMP_PASSWORD=' + tempPassword);
  console.log('Login as teacher with username TeacherJean or email', EMAIL);
  console.log('Login as admin with username TeacherJean');
  console.log('hasGeneratedPassword=true — change password after login.');

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
