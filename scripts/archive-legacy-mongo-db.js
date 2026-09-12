#!/usr/bin/env node
/**
 * Archive Atlas DB `online-distance-learning` without touching `test`.
 *
 * Default (cluster is over quota): dump collections as EJSON to a local folder,
 * verify counts, then drop the Atlas source (and any leftover empty archive DB).
 *
 *   node scripts/archive-legacy-mongo-db.js
 *   node scripts/archive-legacy-mongo-db.js --drop-only
 */
require('dotenv').config();
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('mongodb/lib/bson');

const SOURCE = 'online-distance-learning';
const LEFTOVER_DEST = 'odl-archive-20260912';
const FORBIDDEN = new Set(['test', 'admin', 'local', 'config']);
const stamp = '20260912';
const OUT_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || process.cwd(),
  'Documents',
  'RemoEdPH-backups',
  'odl-archive-' + stamp
);

function dbNameFromUri(uri) {
  try {
    const u = new URL(uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'https://'));
    return decodeURIComponent((u.pathname || '').replace(/^\//, '').split('/')[0] || '');
  } catch (_e) {
    return '';
  }
}

function maskUri(uri) {
  return String(uri || '').replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

async function dropLegacyDatabase(client, name, { optional = false } = {}) {
  if (FORBIDDEN.has(name)) {
    throw new Error('Refusing to drop protected database ' + name);
  }
  const db = client.db(name);
  const cols = await db.listCollections().toArray();
  if (!cols.length) {
    if (optional) return;
    console.log('No collections left in ' + name + '.');
    return;
  }
  try {
    await db.dropDatabase();
    console.log('Dropped Atlas database ' + name + '.');
    return;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (!/not allowed|not authorized|Unauthorized/i.test(msg)) throw err;
    console.log('dropDatabase denied on ' + name + '; dropping collections instead.');
  }
  for (const info of cols) {
    await db.collection(info.name).drop();
    console.log('Dropped collection ' + name + '.' + info.name);
  }
}

async function dumpCollection(col, filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const out = fs.createWriteStream(filePath, { encoding: 'utf8' });
  let n = 0;
  const cursor = col.find({}, { noCursorTimeout: false });
  try {
    for await (const doc of cursor) {
      out.write(EJSON.stringify(doc) + '\n');
      n += 1;
    }
  } finally {
    await cursor.close().catch(() => {});
  }
  await new Promise((resolve, reject) => {
    out.end((err) => (err ? reject(err) : resolve()));
  });
  return n;
}

(async () => {
  const uri = String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  const uriDb = dbNameFromUri(uri);
  if (uriDb && uriDb !== 'test') {
    console.error('Refusing to run: MONGODB_URI database is "' + uriDb + '", expected test.');
    process.exit(1);
  }
  if (FORBIDDEN.has(SOURCE)) {
    console.error('Refusing unsafe source name.');
    process.exit(1);
  }

  console.log('Connecting ' + maskUri(uri));
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });
  await client.connect();

  try {
    const src = client.db(SOURCE);
    const live = client.db('test');
    const liveCols = await live.listCollections().toArray();
    if (!liveCols.length) {
      console.error('Refusing: live database "test" has no collections. Aborting.');
      process.exit(1);
    }

    const infos = await src.listCollections().toArray();
    if (process.argv.includes('--drop-only')) {
      const manifestPath = path.join(OUT_DIR, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        console.error('Refusing --drop-only: local archive manifest is missing.');
        process.exit(1);
      }
      console.log('Drop-only. Local archive: ' + OUT_DIR);
      console.log('Live: test (' + liveCols.length + ' collections) — not modified');
      await dropLegacyDatabase(client, SOURCE);
      await dropLegacyDatabase(client, LEFTOVER_DEST, { optional: true });
      console.log('Live database "test" was not changed.');
      return;
    }
    if (!infos.length) {
      console.error('Source database is empty or missing. Aborting.');
      process.exit(1);
    }

    await fsp.mkdir(OUT_DIR, { recursive: true });
    console.log('Source: ' + SOURCE + ' (' + infos.length + ' collections)');
    console.log('Local archive: ' + OUT_DIR);
    console.log('Live: test (' + liveCols.length + ' collections) — not modified');

    const manifest = { createdAt: new Date().toISOString(), source: SOURCE, collections: [] };

    for (const info of infos) {
      const name = info.name;
      if (info.type === 'view') {
        console.log('skip view ' + name);
        continue;
      }
      const srcCol = src.collection(name);
      const expected = await srcCol.countDocuments();
      const fileName = name.replace(/[^a-zA-Z0-9._-]/g, '_') + '.jsonl';
      const filePath = path.join(OUT_DIR, fileName);
      console.log('dump ' + name + ' (' + expected + ' docs)');
      const written = await dumpCollection(srcCol, filePath);
      if (written !== expected) {
        throw new Error('Count mismatch on ' + name + ': source=' + expected + ' dumped=' + written);
      }
      const indexes = await srcCol.indexes();
      manifest.collections.push({
        name,
        documents: written,
        file: fileName,
        indexes,
      });
    }

    await fsp.writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('\nLocal archive verified.');

    await dropLegacyDatabase(client, SOURCE);
    await dropLegacyDatabase(client, LEFTOVER_DEST, { optional: true });

    console.log('Live database "test" was not changed.');
    console.log('Archive folder: ' + OUT_DIR);
  } finally {
    await client.close();
  }
})().catch((err) => {
  console.error('Archive failed:', err && err.message ? err.message : err);
  process.exit(1);
});
