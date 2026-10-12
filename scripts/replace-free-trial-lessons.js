#!/usr/bin/env node
/**
 * Replace the Pre-Level "Free Trial Lessons" catalog with the 3 free-plan lessons.
 * Does not delete presentation files on disk or in GridFS.
 *
 *   node scripts/replace-free-trial-lessons.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../server/db');
const Curriculum = require('../server/models/Curriculum');
const Lesson = require('../server/models/Lesson');
const Student = require('../server/models/Student');

const NEW_LESSONS = [
  {
    lessonNumber: 1,
    title: 'Orientation Part 1: How to Navigate the Student Portal',
    description: 'How to move around the student portal.',
  },
  {
    lessonNumber: 2,
    title: 'About RemoEd PH',
    description: 'What RemoEd PH is.',
  },
  {
    lessonNumber: 3,
    title: 'Welcome Lesson',
    description: 'Welcome lesson for the free plan.',
  },
];

async function main() {
  await connectDB();
  const dbName = mongoose.connection.db && mongoose.connection.db.databaseName;
  if (dbName !== 'test') {
    throw new Error('Refusing: database is "' + dbName + '", expected test.');
  }

  const curriculum = await Curriculum.findOne({
    title: 'Free Trial Lessons',
    level: 'Pre-Level',
    isActive: true,
  });
  if (!curriculum) {
    throw new Error('Active Pre-Level curriculum "Free Trial Lessons" was not found.');
  }

  const existing = await Lesson.find({ curriculumId: curriculum._id }).select('lessonNumber title isActive').lean();
  console.log('curriculum ' + curriculum._id + ' has ' + existing.length + ' lesson(s)');
  const expected = NEW_LESSONS.map((item) => item.lessonNumber + ':' + item.title).join('|');
  const current = existing
    .slice()
    .sort((a, b) => Number(a.lessonNumber) - Number(b.lessonNumber))
    .map((item) => item.lessonNumber + ':' + item.title)
    .join('|');
  if (existing.length === NEW_LESSONS.length && current === expected) {
    console.log('already the 3 free lessons; left them in place');
    await mongoose.disconnect();
    return;
  }

  const removed = await Lesson.deleteMany({ curriculumId: curriculum._id });
  console.log('removed ' + removed.deletedCount + ' lesson record(s)');

  for (const item of NEW_LESSONS) {
    const lesson = await Lesson.create({
      curriculumId: curriculum._id,
      title: item.title,
      description: item.description,
      lessonNumber: item.lessonNumber,
      order: item.lessonNumber,
      estimatedDuration: 25,
      createdBy: 'admin',
      isActive: true,
      files: [],
    });
    console.log('created ' + item.lessonNumber + ' ' + lesson._id + ' ' + item.title);
  }

  const reset = await Student.updateMany(
    {},
    {
      $set: {
        freeLessonCompletedCount: 0,
        freeLessonPeriodKey: '',
        freeLessonActiveBookingId: null,
      },
    }
  );
  console.log('reset free-lesson progress on ' + (reset.modifiedCount || 0) + ' student(s)');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
