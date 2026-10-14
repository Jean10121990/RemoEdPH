/**
 * Write Level 2 Month 1 lesson descriptions and teacher notes.
 * Refuses any database other than test. Does not replace uploaded files.
 *
 * node scripts/apply-l2-lesson-notes.js path/to/l2-lesson-notes.json
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { connectDB } = require('../server/db');
const Lesson = require('../server/models/Lesson');
const { sanitizeTeacherNotes } = require('../server/utils/sanitizeHtml');

const CURRICULUM_ID = '6aa20511c2cc3a5a0b20f547';

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) throw new Error('Missing notes JSON path');
  const lessons = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (!Array.isArray(lessons) || lessons.length !== 22) {
    throw new Error('Expected 22 Level 2 lessons');
  }

  await connectDB();
  if (mongoose.connection.name !== 'test') {
    throw new Error('Refusing database ' + mongoose.connection.name);
  }

  let updated = 0;
  let created = 0;
  for (const row of lessons) {
    const notes = sanitizeTeacherNotes(row.teacherNotes);
    const existing = await Lesson.findOne({
      curriculumId: CURRICULUM_ID,
      lessonNumber: row.lessonNumber,
      isActive: true,
    });
    if (existing) {
      existing.description = row.description;
      existing.teacherNotes = notes;
      existing.estimatedDuration = 25;
      await existing.save();
      updated += 1;
      console.log('UPDATE n=' + row.lessonNumber + ' ' + existing.title);
    } else {
      await Lesson.create({
        curriculumId: CURRICULUM_ID,
        title: row.title,
        description: row.description,
        teacherNotes: notes,
        lessonNumber: row.lessonNumber,
        order: row.lessonNumber,
        estimatedDuration: 25,
        createdBy: 'admin',
        files: [],
      });
      created += 1;
      console.log('CREATE n=' + row.lessonNumber + ' ' + row.title);
    }
  }
  console.log('DONE updated=' + updated + ' created=' + created);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('FAIL ' + String((err && err.message) || err).replace(/\/\/([^:]+):([^@]+)@/g, '//$1:***@'));
  try { await mongoose.disconnect(); } catch (_e) {}
  process.exit(1);
});
