/**
 * Upload finished Month 1 decks into QA Hub curricula for Levels 1–4.
 * Skips a lesson that already has a file. Does not touch Free Trial Lessons.
 * Refuses any database other than `test`.
 *
 * node scripts/upload-month1-lesson-decks.js
 */
require('dotenv').config();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../server/db');
const Lesson = require('../server/models/Lesson');
const { PRESENTATIONS_ROOT } = require('../server/utils/presentationUpload');
const { compressPptxIfLarge } = require('../server/utils/pptxCompress');
const { countSlidesInPptx } = require('../server/utils/pptxLocalPreview');
const { saveUploadTree } = require('../server/services/uploadStore');

const CURRICULA = {
  1: '69cafcd18e3e63155ed30c59',
  2: '6aa20511c2cc3a5a0b20f547',
  3: '6aa2055cc2cc3a5a0b20f559',
  4: '6aa20571c2cc3a5a0b20f562',
};

const SCAN_ROOTS = [
  'D:\\Users\\Window11\\Desktop\\JeanDesktop\\RemoEdPH\\A Lesson and Training Materials',
  path.join(__dirname, '..', 'docs', 'lesson-references'),
];

function walkPptx(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_backup' || entry.name === 'node_modules') continue;
      walkPptx(abs, out);
    } else if (entry.isFile() && /\.pptx$/i.test(entry.name)) {
      out.push(abs);
    }
  }
}

function levelOf(filePath) {
  const base = path.basename(filePath);
  const fromName = base.match(/L([1-4])M1/i);
  if (fromName) return Number(fromName[1]);
  const fromDir = filePath.match(/[\\/]Level ([1-4])[\\/]/i);
  return fromDir ? Number(fromDir[1]) : null;
}

function lessonNum(filePath) {
  const m = path.basename(filePath).match(/Lesson[- ](\d+)/i);
  return m ? Number(m[1]) : null;
}

function titleFromName(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const m = base.match(/Lesson[- ]\d+[- ](.+)$/i);
  const raw = m ? m[1] : base;
  return raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function scorePath(filePath) {
  const base = path.basename(filePath);
  let score = 0;
  if (/[\\/]Level [1-4][\\/]/i.test(filePath)) score += 40;
  if (base.startsWith('RemoEd ')) score += 5;
  if (/drive-upload-stage/i.test(filePath)) score -= 15;
  if (/[\\/]lessons[\\/]/i.test(filePath)) score -= 5;
  if (/sample/i.test(base)) score -= 80;
  if (/[\\/]_backup[\\/]/i.test(filePath)) score -= 100;
  return score;
}

function pickDecks() {
  const found = [];
  for (const root of SCAN_ROOTS) walkPptx(root, found);
  const best = new Map();
  for (const filePath of found) {
    const level = levelOf(filePath);
    const num = lessonNum(filePath);
    if (!level || !num || num < 1 || num > 22) continue;
    if (/sample/i.test(path.basename(filePath))) continue;
    const key = level + ':' + num;
    const prev = best.get(key);
    if (!prev || scorePath(filePath) > scorePath(prev)) best.set(key, filePath);
  }
  return best;
}

function safeStoredFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[^a-zA-Z0-9._\- ()[\]]+/g, '_');
  return base || 'file.pptx';
}

async function storeDeck(srcPath) {
  const fileId = new mongoose.Types.ObjectId();
  const destDir = path.join(PRESENTATIONS_ROOT, String(fileId));
  await fsp.mkdir(destDir, { recursive: true });
  const storedName = safeStoredFileName(path.basename(srcPath));
  const destPath = path.join(destDir, storedName);
  await fsp.copyFile(srcPath, destPath);
  const compression = await compressPptxIfLarge(destPath);
  const storedSize = (await fsp.stat(destPath)).size;
  const slideCount = countSlidesInPptx(destPath);
  await saveUploadTree(destDir, 'presentations/' + String(fileId));
  return {
    _id: fileId,
    fileName: storedName,
    fileType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    fileSize: storedSize,
    fileData: '',
    presentationType: 'file',
    embedUrl: '',
    html5PackagePath: destDir,
    html5EntryUrl: '/uploads/presentations/' + fileId + '/' + encodeURIComponent(storedName),
    slideCount: slideCount >= 1 ? slideCount : null,
    slideUrls: [],
    convertedPdfUrl: '',
    uploadedBy: 'admin',
    isPermanent: false,
    compression,
  };
}

async function main() {
  await connectDB();
  if (mongoose.connection.name !== 'test') {
    console.error('REFUSE database ' + mongoose.connection.name);
    process.exit(1);
  }

  const decks = pickDecks();
  const missing = [];
  let uploaded = 0;
  let skipped = 0;

  for (const level of [1, 2, 3, 4]) {
    const curriculumId = CURRICULA[level];
    for (let num = 1; num <= 22; num += 1) {
      const src = decks.get(level + ':' + num);
      const existing = await Lesson.findOne({ curriculumId, lessonNumber: num, isActive: true });
      const hasFile = existing && Array.isArray(existing.files) && existing.files.length > 0;
      if (hasFile) {
        skipped += 1;
        console.log('SKIP L' + level + ' n=' + num + ' already has ' + existing.files[0].fileName);
        continue;
      }
      if (!src) {
        missing.push('L' + level + ' lesson ' + num);
        console.log('MISSING L' + level + ' n=' + num);
        continue;
      }
      const title = existing ? existing.title : titleFromName(src);
      console.log('UPLOAD L' + level + ' n=' + num + ' ' + title + ' <- ' + path.basename(src));
      const stored = await storeDeck(src);
      const compression = stored.compression;
      delete stored.compression;
      let lesson = existing;
      if (!lesson) {
        lesson = new Lesson({
          curriculumId,
          title,
          description: '',
          lessonNumber: num,
          order: num,
          estimatedDuration: 25,
          createdBy: 'admin',
          files: [],
        });
      }
      lesson.files.push(stored);
      await lesson.save();
      uploaded += 1;
      const mb = (stored.fileSize / 1048576).toFixed(1);
      console.log('  saved ' + lesson._id + ' ' + mb + 'MB slides=' + (stored.slideCount || 0) + (compression && compression.compressed ? ' compressed' : ''));
    }
  }

  console.log('DONE uploaded=' + uploaded + ' skipped=' + skipped + ' missing=' + missing.length);
  if (missing.length) console.log('MISSING ' + missing.join(', '));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  const msg = String((err && err.message) || err).replace(/\/\/([^:]+):([^@]+)@/g, '//$1:***@');
  console.error('FAIL ' + msg);
  try { await mongoose.disconnect(); } catch (_e) {}
  process.exit(1);
});
