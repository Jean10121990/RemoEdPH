#!/usr/bin/env node
/**
 * Keep the earliest garden_trees row per (studentId, monthKey); delete later duplicates.
 *
 * Safe defaults:
 * - Only runs against database name `test`.
 * - Never touches students / teachers / admins / lessons / curriculums.
 * - Dry run unless --apply.
 *
 *   node scripts/dedupe-garden-trees.js
 *   node scripts/dedupe-garden-trees.js --apply
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const { planTreeDedupes } = require('../server/garden/migrate');

const APPLY = process.argv.includes('--apply');
const KEEP = new Set(['students', 'teachers', 'admins', 'lessons', 'curriculums']);

function dbNameFromUri(uri) {
  try {
    const u = new URL(String(uri || '').replace('mongodb+srv://', 'https://').replace('mongodb://', 'https://'));
    return decodeURIComponent((u.pathname || '').replace(/^\//, '').split('/')[0] || '');
  } catch (_e) {
    return '';
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || '';
  const dbName = dbNameFromUri(uri);
  if (dbName !== 'test') {
    throw new Error('Refusing to run: MONGODB_URI must end in /test (got ' + (dbName || 'none') + ').');
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('test');
  if (KEEP.has('garden_trees')) throw new Error('Refusing to touch KEEP collection');

  const trees = await db.collection('garden_trees').find({}).toArray();
  const { drop } = planTreeDedupes(trees);
  console.log(APPLY ? 'Apply' : 'Dry run', 'duplicates:', drop.length);
  drop.forEach((t) => {
    console.log('drop', {
      _id: String(t._id),
      studentId: t.studentId,
      monthKey: t.monthKey,
      species: t.species,
      createdAt: t.createdAt,
    });
  });

  if (APPLY && drop.length) {
    const ids = drop.map((t) => t._id).filter((id) => id instanceof ObjectId || id);
    const res = await db.collection('garden_trees').deleteMany({ _id: { $in: ids } });
    console.log('deleted', res.deletedCount);
  }

  if (APPLY) {
    await db.collection('garden_trees').createIndex({ studentId: 1, monthKey: 1 }, { unique: true });
    console.log('ensured unique index on garden_trees (studentId, monthKey)');
  }

  await client.close();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
