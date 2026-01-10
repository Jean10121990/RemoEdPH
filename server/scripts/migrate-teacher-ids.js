// One-time migration: convert old teacherId formats to new (T<initials><MYYYY><#####>)
// and update dependent collections: TeacherSlot, Booking, TimeLog, Notification

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');

const Teacher = require('../models/Teacher');
const TeacherSlot = require('../models/TeacherSlot');
const Booking = require('../models/Booking');
const TimeLog = require('../models/TimeLog');
const Notification = require('../models/Notification');
const db = require('../db');

async function generateNewId(teacher) {
  const takeInitial = (s) => (s && s.trim().length > 0 ? s.trim()[0].toUpperCase() : 'X');
  let initials = '';
  if (teacher.firstName || teacher.middleName || teacher.lastName) {
    initials = `${takeInitial(teacher.firstName)}${takeInitial(teacher.middleName)}${takeInitial(teacher.lastName)}`;
  } else {
    const parts = (teacher.username || '').split(/[^A-Za-z]+/).filter(Boolean);
    const chars = parts.map(p => p[0]?.toUpperCase()).slice(0, 3);
    while (chars.length < 3) chars.push('X');
    initials = chars.join('');
  }
  const now = new Date();
  const month = String(now.getMonth() + 1);
  const year = String(now.getFullYear());
  const prefix = `T${initials}${month}${year}`;
  const count = await Teacher.countDocuments({ teacherId: { $regex: `^${prefix}` } });
  const seq = String(count + 1).padStart(5, '0');
  return `${prefix}${seq}`;
}

async function migrate() {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const teachers = await Teacher.find({});
    for (const teacher of teachers) {
      if (/^T[A-Z]{3}\d{5}\d{5}$/.test(teacher.teacherId)) {
        // Already in new format
        continue;
      }
      const oldId = teacher.teacherId?.toString();
      const newId = await generateNewId(teacher);
      console.log(`Migrating ${teacher.username}: ${oldId} -> ${newId}`);

      // Update teacher
      teacher.teacherId = newId;
      await teacher.save({ session });

      const filter = { teacherId: oldId };
      // Update dependent collections
      await TeacherSlot.updateMany(filter, { $set: { teacherId: newId } }, { session });
      await Booking.updateMany(filter, { $set: { teacherId: newId } }, { session });
      await TimeLog.updateMany(filter, { $set: { teacherId: newId } }, { session });
      await Notification.updateMany(filter, { $set: { teacherId: newId } }, { session });
    }
    await session.commitTransaction();
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    await session.abortTransaction();
  } finally {
    session.endSession();
    await mongoose.connection.close();
  }
}

migrate();


