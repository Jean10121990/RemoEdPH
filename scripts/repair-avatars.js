#!/usr/bin/env node
/**
 * Repair profile pictures:
 *   1. Rewrite values saved with an absolute origin (e.g. http://localhost:8080/uploads/...)
 *      down to the site-relative /uploads/... path.
 *   2. Make every referenced avatar durable by copying it into GridFS, taking the bytes from
 *      the local uploads/ directory or, with --fetch-from, from a running deployment.
 *
 *   node scripts/repair-avatars.js                                     # report only
 *   node scripts/repair-avatars.js --apply
 *   node scripts/repair-avatars.js --apply --fetch-from=https://remoedph.com
 */
require('dotenv').config();

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const https = require('https');
const mongoose = require('mongoose');

const {
  findUpload,
  putUpload,
  normalizeUploadReference,
  UPLOADS_ROOT,
} = require('../server/services/uploadStore');

const COLLECTIONS = ['teachers', 'students'];
const ABSOLUTE_UPLOAD = /^https?:\/\/[^/]+\/uploads\//i;

function arg(name) {
  const hit = process.argv.find((a) => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return null;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
}

function fetchBuffer(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.request(url, { method: 'GET', timeout: 25000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ status: res.statusCode, buffer: null });
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: 200, buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, buffer: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout', buffer: null });
    });
    req.end();
  });
}

function mimeFor(rel) {
  const ext = path.extname(rel).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

(async () => {
  const apply = arg('apply') !== null;
  const fetchFrom = (arg('fetch-from') || '').replace(/\/+$/, '');

  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('database: ' + mongoose.connection.db.databaseName);
  console.log(apply ? 'mode: APPLYING CHANGES' : 'mode: report only (pass --apply to write)');
  if (fetchFrom) console.log('missing files will be fetched from ' + fetchFrom);
  console.log('');

  const db = mongoose.connection.db;
  const referenced = new Set();
  let rewritten = 0;

  for (const name of COLLECTIONS) {
    const coll = db.collection(name);
    const docs = await coll
      .find({ profilePicture: { $exists: true, $nin: [null, ''] } }, { projection: { profilePicture: 1 } })
      .toArray();
    console.log(name + ': ' + docs.length + ' with a profile picture');

    for (const doc of docs) {
      const current = String(doc.profilePicture);
      if (current.startsWith('data:')) {
        console.log('  inline data URL, left as is: ' + String(doc._id));
        continue;
      }
      const next = normalizeUploadReference(current);
      if (next !== current) {
        console.log('  rewrite ' + String(doc._id));
        console.log('      from ' + current);
        console.log('      to   ' + next);
        if (apply) await coll.updateOne({ _id: doc._id }, { $set: { profilePicture: next } });
        rewritten++;
      } else if (ABSOLUTE_UPLOAD.test(current)) {
        console.log('  still absolute (unexpected): ' + current);
      }
      if (next.startsWith('/uploads/')) referenced.add(next.slice('/uploads/'.length));
    }
  }

  console.log('\nchecking durability of ' + referenced.size + ' referenced avatar file(s)\n');
  let stored = 0;
  let already = 0;
  let imported = 0;
  let fetched = 0;
  const lost = [];

  for (const rel of referenced) {
    if (await findUpload(rel)) {
      already++;
      console.log('  in GridFS      ' + rel);
      continue;
    }
    const abs = path.join(UPLOADS_ROOT, rel);
    let buffer = null;
    let source = '';
    try {
      buffer = await fsp.readFile(abs);
      source = 'local uploads/';
    } catch (_e) {
      if (fetchFrom) {
        const res = await fetchBuffer(fetchFrom + '/uploads/' + rel.split('/').map(encodeURIComponent).join('/'));
        if (res.buffer && res.buffer.length) {
          buffer = res.buffer;
          source = fetchFrom + ' (' + res.status + ')';
        }
      }
    }
    if (!buffer) {
      lost.push(rel);
      console.log('  NO SOURCE      ' + rel);
      continue;
    }
    if (apply) {
      await putUpload(rel, buffer, mimeFor(rel));
      stored++;
    }
    if (source === 'local uploads/') imported++;
    else fetched++;
    console.log('  ' + (apply ? 'stored from  ' : 'would store  ') + rel + '   <- ' + source + ' (' + buffer.length + ' bytes)');
  }

  console.log('\nsummary');
  console.log('  URLs rewritten          : ' + rewritten + (apply ? '' : ' (not written)'));
  console.log('  already durable         : ' + already);
  console.log('  copied from local disk  : ' + imported);
  console.log('  copied from deployment  : ' + fetched);
  console.log('  stored this run         : ' + stored);
  if (lost.length) {
    console.log('  unrecoverable files     : ' + lost.length);
    lost.forEach((l) => console.log('      ' + l + '  (file is gone; that user must re-upload)'));
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error('repair failed: ' + ((err && err.stack) || err));
  process.exit(1);
});
