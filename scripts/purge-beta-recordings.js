#!/usr/bin/env node
/**
 * Delete classroom recordings + orphan GridFS chunks in live `test`.
 * Does not touch students, teachers, admins, lessons, or other uploads.
 *
 *   node scripts/purge-beta-recordings.js
 */
require('dotenv').config();
const { MongoClient, GridFSBucket } = require('mongodb');

const LIVE = 'test';
const KEEP = ['students', 'teachers', 'admins', 'lessons', 'curriculums'];

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

async function counts(db) {
  const out = {};
  for (const name of KEEP) {
    out[name] = await db.collection(name).countDocuments();
  }
  return out;
}

(async () => {
  const uri = String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  const uriDb = dbNameFromUri(uri);
  if (uriDb && uriDb !== LIVE) {
    console.error('Refusing: MONGODB_URI database is "' + uriDb + '", expected ' + LIVE + '.');
    process.exit(1);
  }

  console.log('Connecting ' + maskUri(uri));
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  try {
    const db = client.db(LIVE);
    const before = await counts(db);
    console.log('Keep-before:', JSON.stringify(before));

    const filesCol = db.collection('uploads.files');
    const chunksCol = db.collection('uploads.chunks');
    const recFiles = await filesCol.find({
      filename: { $regex: /^classroom-recordings\// },
    }).project({ filename: 1, length: 1 }).toArray();
    const recBytes = recFiles.reduce((s, f) => s + (f.length || 0), 0);
    console.log('Recording files to delete: ' + recFiles.length + ' (' + (recBytes / 1024 / 1024).toFixed(2) + ' MB)');

    const bucket = new GridFSBucket(db, { bucketName: 'uploads' });
    let deletedFiles = 0;
    for (const f of recFiles) {
      await bucket.delete(f._id);
      deletedFiles += 1;
    }
    console.log('Deleted GridFS recording files: ' + deletedFiles);

    const recDocs = await db.collection('classroomrecordings').deleteMany({});
    console.log('Deleted classroomrecordings docs: ' + recDocs.deletedCount);
    const tickets = await db.collection('recordingdownloadtickets').deleteMany({});
    console.log('Deleted recordingdownloadtickets: ' + tickets.deletedCount);

    const remainingIds = await filesCol.find({}, { projection: { _id: 1 } }).map((d) => d._id).toArray();
    const orphanDel = await chunksCol.deleteMany({ files_id: { $nin: remainingIds } });
    console.log('Deleted orphan chunks: ' + orphanDel.deletedCount);

    const leftoverRec = await filesCol.countDocuments({ filename: { $regex: /^classroom-recordings\// } });
    const leftoverRecDocs = await db.collection('classroomrecordings').countDocuments();
    const leftoverOrphans = await chunksCol.countDocuments({ files_id: { $nin: remainingIds } });
    const afterIds = await filesCol.find({}, { projection: { _id: 1 } }).map((d) => d._id).toArray();
    const leftoverOrphans2 = await chunksCol.countDocuments({ files_id: { $nin: afterIds } });

    const after = await counts(db);
    console.log('Keep-after:', JSON.stringify(after));
    for (const name of KEEP) {
      if (before[name] !== after[name]) {
        throw new Error('Protected collection count changed: ' + name + ' ' + before[name] + ' -> ' + after[name]);
      }
    }

    const fileStats = await filesCol.aggregate([
      { $group: { _id: { $arrayElemAt: [{ $split: ['$filename', '/'] }, 0] }, n: { $sum: 1 }, bytes: { $sum: '$length' } } },
      { $sort: { bytes: -1 } },
    ]).toArray();
    console.log('Remaining uploads by folder:');
    for (const row of fileStats) {
      console.log('  ' + row._id + '\tfiles=' + row.n + '\tMB=' + (row.bytes / 1024 / 1024).toFixed(2));
    }

    console.log('leftover_recording_files=' + leftoverRec);
    console.log('leftover_recording_docs=' + leftoverRecDocs);
    console.log('leftover_orphan_chunks=' + leftoverOrphans2);
    console.log('Live database "' + LIVE + '" kept. Users and lessons unchanged.');
  } finally {
    await client.close();
  }
})().catch((err) => {
  console.error('Purge failed:', err && err.message ? err.message : err);
  process.exit(1);
});
