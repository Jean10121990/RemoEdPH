#!/usr/bin/env node
/**
 * Archive the old multi-plot garden collections and ensure the new indexes.
 *
 * Safe defaults:
 * - Only runs against database name `test`.
 * - Renames old plot collections; never drops students / teachers / admins / lessons / curriculums.
 * - Does not grant Eco-Drops or change student totals.
 *
 *   node scripts/archive-legacy-garden-plots.js
 *   node scripts/archive-legacy-garden-plots.js --apply
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');
const KEEP = new Set(['students', 'teachers', 'admins', 'lessons', 'curriculums']);
const OLD_NAMES = [
  'studentgardenitems',
  'student_garden_items',
  'ecodropledgers',
  'eco_drop_ledgers',
];

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
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const plan = [];

  for (const name of OLD_NAMES) {
    if (!existing.has(name)) continue;
    if (KEEP.has(name)) throw new Error('Refusing to touch KEEP collection ' + name);
    const dest = name + '_archived_' + stamp;
    plan.push({ from: name, to: dest, count: await db.collection(name).countDocuments() });
  }

  console.log(APPLY ? 'Apply' : 'Dry run', plan.length ? plan : '(no old plot collections)');

  if (APPLY) {
    for (const row of plan) {
      await db.collection(row.from).rename(row.to);
      console.log('renamed', row.from, '->', row.to, '(' + row.count + ' docs)');
    }
    const { EcoDropEntry, GardenTree } = require('../server/garden/models');
    await EcoDropEntry.syncIndexes();
    await GardenTree.syncIndexes();
    console.log('ensured unique indexes on eco_drop_ledger and garden_trees');
  }

  await client.close();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
