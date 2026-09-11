#!/usr/bin/env node
/**
 * Copy files from the local uploads/ directory into GridFS so production can serve them
 * after a deploy (the container filesystem does not keep them).
 *
 *   node scripts/import-uploads-to-gridfs.js                          # avatars only
 *   node scripts/import-uploads-to-gridfs.js --dirs=slides,issue-screenshots
 *   node scripts/import-uploads-to-gridfs.js --all
 *   node scripts/import-uploads-to-gridfs.js --dry-run
 *
 * Already-stored paths are skipped, so re-running is safe.
 */
require('dotenv').config();

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const mongoose = require('mongoose');

const { findUpload, putUpload, UPLOADS_ROOT } = require('../server/services/uploadStore');

const DEFAULT_DIRS = ['teacher-profiles', 'student-profiles'];
const SKIP_DIRS = new Set(['tmp-lesson-uploads', 'classroom-recordings']);

const MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

function arg(name) {
  const hit = process.argv.find((a) => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return null;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
}

async function listFiles(dir, base, out) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (_e) {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await listFiles(abs, rel, out);
    } else if (entry.isFile() && entry.name !== '.gitkeep') {
      out.push({ abs, rel });
    }
  }
  return out;
}

(async () => {
  const all = arg('all') !== null;
  const dryRun = arg('dry-run') !== null;
  const dirsArg = arg('dirs');
  const dirs = all ? [''] : (dirsArg ? dirsArg.split(',').map((d) => d.trim()).filter(Boolean) : DEFAULT_DIRS);

  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    console.error('MONGODB_URI is not set. Point it at the database production uses.');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('connected to ' + mongoose.connection.db.databaseName);
  console.log('uploads root: ' + UPLOADS_ROOT);
  console.log('importing: ' + (all ? 'everything' : dirs.join(', ')) + (dryRun ? '   [dry run]' : '') + '\n');

  const files = [];
  for (const dir of dirs) {
    await listFiles(path.join(UPLOADS_ROOT, dir), dir, files);
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;

  for (const file of files) {
    try {
      if (await findUpload(file.rel)) {
        skipped++;
        continue;
      }
      const buf = await fsp.readFile(file.abs);
      if (!dryRun) {
        await putUpload(file.rel, buf, MIME[path.extname(file.abs).toLowerCase()] || 'application/octet-stream');
      }
      imported++;
      bytes += buf.length;
      console.log('  + ' + file.rel + '  (' + buf.length + ' bytes)');
    } catch (err) {
      failed++;
      console.error('  ! ' + file.rel + ': ' + ((err && err.message) || err));
    }
  }

  console.log(
    '\nfound ' + files.length + ' file(s): imported ' + imported + ', already stored ' + skipped + ', failed ' + failed
  );
  console.log('bytes added: ' + bytes);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('import failed: ' + ((err && err.message) || err));
  process.exit(1);
});
