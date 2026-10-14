#!/usr/bin/env node
/**
 * Write the description and teacher notes onto the 3 Pre-Level "Free Trial Lessons".
 * Only those two fields change; titles, files, order and student progress stay as they are.
 *
 *   node scripts/set-free-trial-lesson-notes.js           (dry run)
 *   node scripts/set-free-trial-lesson-notes.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../server/db');
const Curriculum = require('../server/models/Curriculum');
const Lesson = require('../server/models/Lesson');
const CONTENT = require('./data/free-trial-lesson-notes');

const APPLY = process.argv.includes('--apply');

async function main() {
  await connectDB();
  const dbName = mongoose.connection.db && mongoose.connection.db.databaseName;
  if (dbName !== 'test') {
    throw new Error('Refusing: database is "' + dbName + '", expected test.');
  }

  const curriculum = await Curriculum.findOne({ title: 'Free Trial Lessons', level: 'Pre-Level', isActive: true });
  if (!curriculum) throw new Error('Active Pre-Level curriculum "Free Trial Lessons" was not found.');

  for (const item of CONTENT) {
    const lesson = await Lesson.findOne({ curriculumId: curriculum._id, lessonNumber: item.lessonNumber, title: item.title });
    if (!lesson) {
      console.log('skip ' + item.lessonNumber + ' ' + item.title + ': not found');
      continue;
    }
    const same = lesson.description === item.description && lesson.teacherNotes === item.teacherNotes;
    console.log(
      (same ? 'unchanged ' : APPLY ? 'updated ' : 'would update ') +
        item.lessonNumber + ' ' + item.title +
        ' (description ' + item.description.length + ' chars, notes ' + item.teacherNotes.length + ' chars)'
    );
    if (!same && APPLY) {
      await Lesson.updateOne(
        { _id: lesson._id },
        { $set: { description: item.description, teacherNotes: item.teacherNotes } }
      );
    }
  }
  if (!APPLY) console.log('dry run; add --apply to save');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
