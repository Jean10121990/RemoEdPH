#!/usr/bin/env node
/**
 * One-time care-model grandfather for current-month trees that still treat
 * ledger drops as growth. Writes a migrate care_action and increments
 * totalEcoDropsSpent so availableDrops = earned − applied growth.
 *
 * Safe defaults:
 * - Only runs against database name `test`.
 * - Never drops KEEP collections.
 * - Idempotent: a second run finds migrate:<studentId>:<monthKey> and skips.
 * - Dry run unless --apply.
 *
 *   node scripts/grandfather-garden-care.js
 *   node scripts/grandfather-garden-care.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { createMongoRepository } = require('../server/garden/repository');
const { grandfatherCurrentTree } = require('../server/garden/migrate');
const config = require('../server/garden/garden.config');

const APPLY = process.argv.includes('--apply');

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

  await mongoose.connect(uri);
  const repo = createMongoRepository();
  const { GardenTree } = require('../server/garden/models');
  const monthKey = DateTime.now().setZone(config.GARDEN_TIMEZONE).toFormat('yyyy-MM');
  const open = await GardenTree.find({ monthKey, careModel: { $ne: 'actions' } }).lean();
  console.log(APPLY ? 'Apply' : 'Dry run', 'open current-month trees:', open.length, 'month', monthKey);

  for (const tree of open) {
    if (!APPLY) {
      const drops = await repo.countMonthDrops(tree.studentId, tree.monthKey);
      console.log('would migrate', { studentId: tree.studentId, monthKey: tree.monthKey, species: tree.species, applyPoints: drops });
      continue;
    }
    const result = await grandfatherCurrentTree(repo, { studentId: tree.studentId, monthKey: tree.monthKey, now: new Date() });
    console.log('migrated', { studentId: tree.studentId, monthKey: tree.monthKey, ...result });
  }

  if (APPLY) {
    const { CareAction } = require('../server/garden/models');
    await CareAction.syncIndexes();
    await GardenTree.syncIndexes();
    console.log('ensured care_actions and garden_trees indexes');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
