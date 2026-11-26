#!/usr/bin/env node
/**
 * Create Level 1 Month 2 lessons (titles, description, teacher notes) and
 * attach the PowerPoint decks stored beside this script's pptx folder.
 *
 *   node scripts/import-l1m2-lessons.js            (dry run)
 *   node scripts/import-l1m2-lessons.js --apply
 *   node scripts/import-l1m2-lessons.js --apply --files
 */
require('dotenv').config();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../server/db');
const Curriculum = require('../server/models/Curriculum');
const Lesson = require('../server/models/Lesson');
const { PRESENTATIONS_ROOT } = require('../server/utils/presentationUpload');
const { convertPptxUploadAssets, countSlidesInPptx } = require('../server/utils/pptxLocalPreview');
const { compressPptxIfLarge } = require('../server/utils/pptxCompress');
const { saveUploadTree } = require('../server/services/uploadStore');

const APPLY = process.argv.includes('--apply');
const WITH_FILES = process.argv.includes('--files');
const PPTX_DIR = path.join(__dirname, 'data', 'l1m2-pptx');
const CONTENT = require('./data/l1m2-lesson-notes.json');
const CURRICULUM_ID = '6aeaf0aaefe7da918dd91fc9';

const FILE_NAMES = {
  1: 'RemoEd L1M2-Lesson-1-Hello-Daddy.pptx',
  2: 'RemoEd L1M2-Lesson-2-Letter-D-is-for-Daddy.pptx',
  3: 'RemoEd L1M2-Lesson-3-The-Round-Circle.pptx',
  4: 'RemoEd L1M2-Lesson-4-Drawing-Across.pptx',
  5: 'RemoEd L1M2-Lesson-5-Family-Hunt-and-Week-1-Review.pptx',
  6: 'RemoEd L1M2-Lesson-6-Hello-Mommy.pptx',
  7: 'RemoEd L1M2-Lesson-7-Letter-E-is-for-Egg.pptx',
  8: 'RemoEd L1M2-Lesson-8-The-Box-is-a-Square.pptx',
  9: 'RemoEd L1M2-Lesson-9-Bye-Bye-Screen.pptx',
  10: 'RemoEd L1M2-Lesson-10-Shape-Hunt-and-Week-2-Review.pptx',
  11: 'RemoEd L1M2-Lesson-11-Boy-and-Girl.pptx',
  12: 'RemoEd L1M2-Lesson-12-Letter-F-is-for-Family.pptx',
  13: 'RemoEd L1M2-Lesson-13-Circles-and-Squares.pptx',
  14: 'RemoEd L1M2-Lesson-14-Tracing-to-Family.pptx',
  15: 'RemoEd L1M2-Lesson-15-Family-Hunt-and-Week-3-Review.pptx',
  16: 'RemoEd L1M2-Lesson-16-The-Shapes-in-My-House.pptx',
  17: 'RemoEd L1M2-Lesson-17-D-E-F-in-the-House.pptx',
  18: 'RemoEd L1M2-Lesson-18-Tracing-the-Long-Road.pptx',
  19: 'RemoEd L1M2-Lesson-19-Thank-You-God-for-Family.pptx',
  20: 'RemoEd L1M2-Lesson-20-Virtual-Garden-Challenge-1.pptx',
  21: 'RemoEd L1M2-Lesson-21-Virtual-Garden-Challenge-2.pptx',
  22: 'RemoEd L1M2-Lesson-22-Monthly-Celebration.pptx'
};

function notesWithRealSlideCount(text) {
  const slides = (String(text).match(/^Slide \d+/gm) || []).length;
  return String(text).replace(
    /2\. FULL SLIDE CURRICULUM\s*:?\s*\d+\s+SLIDES/i,
    '2. FULL SLIDE CURRICULUM: ' + slides + ' SLIDES'
  );
}

function publicUrl(fileId, storedName) {
  return '/uploads/presentations/' + String(fileId) + '/' + encodeURIComponent(storedName);
}

async function attachPptx(lesson, fileName) {
  const src = path.join(PPTX_DIR, fileName);
  if (!fs.existsSync(src)) {
    console.log('  missing pptx ' + fileName);
    return;
  }
  const already = (lesson.files || []).some((f) => f.fileName === fileName);
  if (already) {
    console.log('  file already attached ' + fileName);
    return;
  }
  const fileId = new mongoose.Types.ObjectId();
  const destDir = path.join(PRESENTATIONS_ROOT, String(fileId));
  await fsp.mkdir(destDir, { recursive: true });
  const destPath = path.join(destDir, fileName);
  await fsp.copyFile(src, destPath);
  const compression = await compressPptxIfLarge(destPath);
  const storedSize = (await fsp.stat(destPath)).size;
  const newFile = {
    _id: fileId,
    fileName,
    fileType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    fileSize: storedSize,
    fileData: '',
    presentationType: 'file',
    embedUrl: '',
    html5PackagePath: destDir,
    html5EntryUrl: publicUrl(fileId, fileName),
    slideCount: null,
    slideUrls: [],
    convertedPdfUrl: '',
    uploadedBy: 'admin',
    isPermanent: false
  };
  try {
    const assets = await Promise.race([
      convertPptxUploadAssets({
        sourcePath: destPath,
        fileName,
        fileId,
        destDir
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('preview conversion timed out')), 45000))
    ]);
    newFile.convertedPdfUrl = assets.convertedPdfUrl || '';
    newFile.slideUrls = Array.isArray(assets.slideUrls) ? assets.slideUrls : [];
    newFile.slideCount = assets.slideCount != null ? assets.slideCount : null;
  } catch (err) {
    console.log('  preview conversion skipped: ' + (err.message || err));
    try {
      const n = countSlidesInPptx(destPath);
      if (n >= 1) newFile.slideCount = n;
    } catch (_e) { /* keep null */ }
  }
  await saveUploadTree(destDir, 'presentations/' + String(fileId));
  lesson.files = lesson.files || [];
  lesson.files.push(newFile);
  lesson.markModified('files');
  await lesson.save();
  console.log(
    '  uploaded ' + fileName +
    ' bytes=' + storedSize +
    ' slides=' + (newFile.slideCount || 0) +
    (compression && compression.compressed ? ' compressed' : '')
  );
}

async function main() {
  await connectDB();
  const dbName = mongoose.connection.db && mongoose.connection.db.databaseName;
  if (dbName !== 'test') throw new Error('Refusing: database is "' + dbName + '", expected test.');

  const curriculum = await Curriculum.findOne({
    _id: CURRICULUM_ID,
    title: 'RemoEd Level 1 Month 2',
    level: 'Little Seeds',
    isActive: true
  });
  if (!curriculum) throw new Error('Active Little Seeds curriculum "RemoEd Level 1 Month 2" was not found.');

  for (const item of CONTENT) {
    const teacherNotes = notesWithRealSlideCount(item.teacherNotes);
    let lesson = await Lesson.findOne({ curriculumId: curriculum._id, lessonNumber: item.lessonNumber });
    const verb = lesson ? 'update' : 'create';
    console.log(verb + ' L' + item.lessonNumber + ' ' + item.title +
      ' desc=' + item.description.length + ' notes=' + teacherNotes.length);
    if (!APPLY) continue;
    if (!lesson) {
      lesson = new Lesson({
        curriculumId: curriculum._id,
        lessonNumber: item.lessonNumber,
        order: item.lessonNumber,
        title: item.title,
        description: item.description,
        teacherNotes,
        estimatedDuration: 25,
        isActive: true,
        createdBy: 'admin',
        files: []
      });
    } else {
      lesson.title = item.title;
      lesson.description = item.description;
      lesson.teacherNotes = teacherNotes;
      lesson.order = item.lessonNumber;
      lesson.estimatedDuration = 25;
      lesson.isActive = true;
    }
    await lesson.save();
    if (WITH_FILES) await attachPptx(lesson, FILE_NAMES[item.lessonNumber]);
  }

  const count = await Lesson.countDocuments({ curriculumId: curriculum._id, isActive: true });
  console.log('active lessons on Level 1 Month 2: ' + count);
  if (!APPLY) console.log('dry run; add --apply to save');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
