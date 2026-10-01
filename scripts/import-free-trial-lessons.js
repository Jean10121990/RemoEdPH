#!/usr/bin/env node
/**
 * Attach local Free Trial PPTX files to the Pre-Level "Free Trial Lessons" curriculum.
 * Does not start the app server. Writes lesson records and presentation files only.
 *
 *   node scripts/import-free-trial-lessons.js
 */
require('dotenv').config();

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const mongoose = require('mongoose');
const Curriculum = require('../server/models/Curriculum');
const Lesson = require('../server/models/Lesson');
const { PRESENTATIONS_ROOT } = require('../server/utils/presentationUpload');
const { convertPptxUploadAssets } = require('../server/utils/pptxLocalPreview');
const { saveUploadTree } = require('../server/services/uploadStore');

const LIVE = 'test';
const SOURCE_DIRS = [
  'D:\\Users\\Window11\\Desktop\\JeanDesktop\\RemoEdPH',
  path.join(__dirname, '..', 'tmp-trial-lessons'),
];

function titleFromFileName(fileName, lessonNumber) {
  let title = fileName.replace(/\.pptx$/i, '');
  title = title.replace(/^RemoEd Free Trial Lesson\s+\d+\s*[-–]?\s*/i, '').trim();
  if (/staright/i.test(title)) title = title.replace(/staright/i, 'straight');
  if (/^Hellow\b/i.test(title)) title = title.replace(/^Hellow\b/i, 'Hello');
  return title || ('Lesson ' + lessonNumber);
}

function discoverDecks() {
  const byNumber = new Map();
  for (const dir of SOURCE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const match = /^RemoEd Free Trial Lesson\s+(\d+)\b/i.exec(name);
      if (!match || !/\.pptx$/i.test(name)) continue;
      const lessonNumber = Number(match[1]);
      if (!byNumber.has(lessonNumber)) {
        byNumber.set(lessonNumber, {
          lessonNumber,
          title: titleFromFileName(name, lessonNumber),
          fileName: name,
          sourcePath: path.join(dir, name),
        });
      }
    }
  }
  return [...byNumber.values()].sort((a, b) => a.lessonNumber - b.lessonNumber);
}

function dbNameFromUri(uri) {
  try {
    const u = new URL(uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'https://'));
    return decodeURIComponent((u.pathname || '').replace(/^\//, '').split('/')[0] || '');
  } catch (_e) {
    return '';
  }
}

function safeStoredFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[^a-zA-Z0-9._\- ()[\]]+/g, '_');
  return base || 'file.bin';
}

async function main() {
  const uri = String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
  if (!uri) throw new Error('MONGODB_URI is not set.');
  const uriDb = dbNameFromUri(uri);
  if (uriDb && uriDb !== LIVE) {
    throw new Error('Refusing: MONGODB_URI database is "' + uriDb + '", expected ' + LIVE + '.');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('connected to ' + mongoose.connection.db.databaseName);

  let curriculum = await Curriculum.findOne({ title: 'Free Trial Lessons', level: 'Pre-Level', isActive: true });
  if (!curriculum) {
    curriculum = await Curriculum.create({
      title: 'Free Trial Lessons',
      description: 'Free trial / pre-level lessons',
      level: 'Pre-Level',
      order: 0,
      createdBy: 'admin',
      isActive: true,
    });
    console.log('created curriculum ' + curriculum._id);
  } else {
    console.log('using curriculum ' + curriculum._id);
  }

  const decks = discoverDecks();
  if (!decks.length) throw new Error('No Free Trial PPTX files found.');
  console.log('found ' + decks.length + ' deck(s): ' + decks.map((d) => d.lessonNumber).join(', '));

  for (const deck of decks) {
    const sourcePath = deck.sourcePath;
    const stat = await fsp.stat(sourcePath);
    const header = Buffer.alloc(2);
    const fh = await fsp.open(sourcePath, 'r');
    await fh.read(header, 0, 2, 0);
    await fh.close();
    if (header.toString() !== 'PK') throw new Error(deck.fileName + ' is not a PPTX');

    let lesson = await Lesson.findOne({
      curriculumId: curriculum._id,
      lessonNumber: deck.lessonNumber,
      isActive: true,
    });
    if (!lesson) {
      lesson = await Lesson.create({
        curriculumId: curriculum._id,
        title: deck.title,
        description: '',
        lessonNumber: deck.lessonNumber,
        order: deck.lessonNumber,
        estimatedDuration: 25,
        createdBy: 'admin',
        files: [],
      });
      console.log('created lesson ' + deck.lessonNumber + ' ' + lesson._id);
    }

    const already = (lesson.files || []).find(
      (f) => f.fileName === deck.fileName && Number(f.fileSize) === stat.size
    );
    if (already) {
      console.log('skip lesson ' + deck.lessonNumber + ' (already stored, ' + stat.size + ' bytes)');
      continue;
    }

    const fileId = new mongoose.Types.ObjectId();
    const destDir = path.join(PRESENTATIONS_ROOT, String(fileId));
    await fsp.mkdir(destDir, { recursive: true });
    const storedName = safeStoredFileName(deck.fileName);
    const destPath = path.join(destDir, storedName);
    await fsp.copyFile(sourcePath, destPath);

    const entryUrl = '/uploads/presentations/' + fileId + '/' + encodeURIComponent(storedName);
    const newFile = {
      _id: fileId,
      fileName: deck.fileName,
      fileType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: stat.size,
      fileData: '',
      presentationType: 'file',
      embedUrl: '',
      html5PackagePath: destDir,
      html5EntryUrl: entryUrl,
      slideCount: null,
      slideUrls: [],
      convertedPdfUrl: '',
      uploadedBy: 'admin',
      isPermanent: false,
    };

    try {
      const assets = await convertPptxUploadAssets({
        sourcePath: destPath,
        fileName: deck.fileName,
        fileId,
        destDir,
      });
      newFile.convertedPdfUrl = assets.convertedPdfUrl || '';
      newFile.slideUrls = Array.isArray(assets.slideUrls) ? assets.slideUrls : [];
      newFile.slideCount = assets.slideCount != null ? assets.slideCount : null;
      console.log('converted lesson ' + deck.lessonNumber + ' slides=' + (newFile.slideCount || 0));
    } catch (err) {
      console.warn('conversion skipped for lesson ' + deck.lessonNumber + ': ' + (err.message || err));
    }

    await saveUploadTree(destDir, 'presentations/' + String(fileId));
    lesson.files.push(newFile);
    await lesson.save();
    console.log('stored lesson ' + deck.lessonNumber + ' file ' + fileId + ' (' + stat.size + ' bytes)');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try { await mongoose.disconnect(); } catch (_e) { /* ignore */ }
  process.exit(1);
});
