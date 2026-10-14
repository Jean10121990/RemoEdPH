/**
 * Write Month 1 lesson descriptions and teacher notes.
 * Refuses any database other than test. Does not replace titles or uploaded files.
 *
 * node scripts/apply-lesson-notes.js <curriculumId> <notes.json>
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { connectDB } = require('../server/db');
const Curriculum = require('../server/models/Curriculum');
const Lesson = require('../server/models/Lesson');
const { sanitizeTeacherNotes } = require('../server/utils/sanitizeHtml');

const ALLOWED = {
  '69cafcd18e3e63155ed30c59': /little seeds/i,
  '6aa2055cc2cc3a5a0b20f559': /saplings/i,
  '6aa20571c2cc3a5a0b20f562': /young stewards/i,
};

async function main() {
  const curriculumId = process.argv[2];
  const jsonPath = process.argv[3];
  const expected = ALLOWED[curriculumId];
  if (!expected) throw new Error('Curriculum is not Level 1, 3, or 4');
  if (!jsonPath) throw new Error('Missing notes JSON path');

  const lessons = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (!Array.isArray(lessons) || lessons.length !== 22) {
    throw new Error('Expected 22 lessons');
  }
  const numbers = lessons.map((row) => row.lessonNumber).sort((a, b) => a - b);
  if (numbers.join(',') !== '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22') {
    throw new Error('Lesson numbers must be 1 through 22');
  }
  for (const row of lessons) {
    if (!String(row.description || '').startsWith('Unit:')) {
      throw new Error('Lesson ' + row.lessonNumber + ' is missing a unit description');
    }
    if (!String(row.teacherNotes || '').startsWith('TEACHER GUIDEBOOK')) {
      throw new Error('Lesson ' + row.lessonNumber + ' is missing the teacher guidebook');
    }
    if (String(row.teacherNotes).includes('Art Prompt')) {
      throw new Error('Lesson ' + row.lessonNumber + ' still contains art prompts');
    }
  }

  await connectDB();
  if (mongoose.connection.name !== 'test') {
    throw new Error('Refusing database ' + mongoose.connection.name);
  }

  const curriculum = await Curriculum.findById(curriculumId).lean();
  if (!curriculum || !expected.test(curriculum.level || '') && !expected.test(curriculum.title || '')) {
    throw new Error('Curriculum title/level does not match ' + curriculumId);
  }
  console.log('CURRICULUM ' + curriculum.level + ' | ' + curriculum.title);

  const before = await Lesson.find({ curriculumId }).select('lessonNumber title files isActive').lean();
  const beforeFiles = {};
  for (const row of before) {
    beforeFiles[row.lessonNumber] = (row.files || []).length;
    console.log(
      'BEFORE n=' + row.lessonNumber +
      ' active=' + row.isActive +
      ' files=' + (row.files || []).length +
      ' ' + row.title
    );
  }

  let updated = 0;
  let created = 0;
  for (const row of lessons) {
    const notes = sanitizeTeacherNotes(row.teacherNotes);
    if (!notes || notes.length > 100000) {
      throw new Error('Notes failed sanitize for lesson ' + row.lessonNumber);
    }
    const existing = await Lesson.findOne({
      curriculumId,
      lessonNumber: row.lessonNumber,
    }).sort({ isActive: -1 });
    if (existing) {
      const fileCount = (existing.files || []).length;
      existing.description = row.description;
      existing.teacherNotes = notes;
      existing.estimatedDuration = 25;
      await existing.save();
      const saved = await Lesson.findById(existing._id).select('files title').lean();
      if ((saved.files || []).length !== fileCount || saved.title !== existing.title) {
        throw new Error('Lesson ' + row.lessonNumber + ' title or files changed');
      }
      updated += 1;
      console.log('UPDATE n=' + row.lessonNumber + ' files=' + fileCount + ' ' + saved.title);
    } else {
      await Lesson.create({
        curriculumId,
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
      console.log('CREATE n=' + row.lessonNumber + ' files=0 ' + row.title);
    }
  }

  const after = await Lesson.find({ curriculumId, isActive: true }).select('lessonNumber files description teacherNotes').lean();
  for (const row of after) {
    const files = (row.files || []).length;
    if (beforeFiles[row.lessonNumber] != null && beforeFiles[row.lessonNumber] !== files) {
      throw new Error('File count changed for lesson ' + row.lessonNumber);
    }
    if (!String(row.description || '').startsWith('Unit:')) {
      throw new Error('Saved description missing for lesson ' + row.lessonNumber);
    }
    if (!String(row.teacherNotes || '').startsWith('TEACHER GUIDEBOOK')) {
      throw new Error('Saved notes missing for lesson ' + row.lessonNumber);
    }
  }
  console.log('DONE updated=' + updated + ' created=' + created + ' active=' + after.length);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('FAIL ' + String((err && err.message) || err).replace(/\/\/([^:]+):([^@]+)@/g, '//$1:***@'));
  try { await mongoose.disconnect(); } catch (_e) {}
  process.exit(1);
});
