/**
 * Durable storage for uploaded media, backed by MongoDB GridFS.
 *
 * Production runs on a container filesystem that is replaced on every deploy and is not
 * shared between instances, so anything written under uploads/ disappears while the
 * document referencing it survives. Storing the bytes in the same database keeps the file
 * and the reference to it together.
 */
const path = require('path');
const fsp = require('fs').promises;
const mongoose = require('mongoose');

const BUCKET_NAME = 'uploads';
const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

/** '/uploads/teacher-profiles/a.webp' and 'teacher-profiles/a.webp' both become the latter. */
function normalizeRelativePath(value) {
  let rel = String(value == null ? '' : value)
    .replace(/\\/g, '/')
    .trim();
  if (!rel) return '';
  if (rel.startsWith('/uploads/')) rel = rel.slice('/uploads/'.length);
  rel = rel.replace(/^\/+/, '');
  if (!rel || rel.includes('\0') || /(^|\/)\.\.(?:\/|$)/.test(rel)) return '';
  return rel;
}

/**
 * Reduce an upload reference to a site-relative path.
 * Clients post back img.src, which the DOM reports as an absolute URL, so values like
 * http://localhost:8080/uploads/... otherwise get saved and then fail for everyone else.
 * Anything that is not an /uploads/ URL (data: URLs, external avatars) is left alone.
 */
function normalizeUploadReference(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return raw;
  const match = /^https?:\/\/[^/]+(\/uploads\/.+)$/i.exec(raw);
  return match ? match[1] : raw;
}

function getBucket() {
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1 || !conn.db) return null;
  return new mongoose.mongo.GridFSBucket(conn.db, { bucketName: BUCKET_NAME });
}

/**
 * Newest stored revision of a path, or null when absent.
 * @returns {Promise<{_id: any, length: number, uploadDate: Date, contentType?: string}|null>}
 */
async function findUpload(relativePath) {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) return null;
  const bucket = getBucket();
  if (!bucket) return null;
  const docs = await bucket.find({ filename: rel }).sort({ uploadDate: -1 }).limit(1).toArray();
  return docs && docs.length ? docs[0] : null;
}

function openDownloadStream(fileId) {
  const bucket = getBucket();
  if (!bucket) throw new Error('Database unavailable for upload storage');
  return bucket.openDownloadStream(fileId);
}

async function deleteUpload(relativePath) {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) return;
  const bucket = getBucket();
  if (!bucket) return;
  const docs = await bucket.find({ filename: rel }).toArray();
  for (const doc of docs) {
    await bucket.delete(doc._id).catch(() => {});
  }
}

async function putUpload(relativePath, buffer, contentType) {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) throw new Error('Invalid upload path');
  if (!Buffer.isBuffer(buffer)) throw new TypeError('putUpload expects a Buffer');
  const bucket = getBucket();
  if (!bucket) throw new Error('Database unavailable for upload storage');

  // Names carry a timestamp, but replace same-name revisions so retries cannot pile up.
  await deleteUpload(rel);

  await new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(rel, {
      contentType: contentType || 'application/octet-stream',
      metadata: { relativePath: rel, storedAt: new Date() },
    });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(buffer);
  });

  return '/uploads/' + rel;
}

/**
 * Store bytes and return the public /uploads path to save on the document.
 * Falls back to the local uploads/ directory when the database is unreachable so that
 * development without Mongo still behaves as before.
 */
async function saveUpload(relativePath, buffer, contentType) {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) throw new Error('Invalid upload path');
  try {
    return await putUpload(rel, buffer, contentType);
  } catch (err) {
    console.warn('GridFS upload failed, falling back to local uploads/:', (err && err.message) || err);
    const abs = path.join(UPLOADS_ROOT, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, buffer);
    return '/uploads/' + rel;
  }
}

module.exports = {
  BUCKET_NAME,
  UPLOADS_ROOT,
  normalizeRelativePath,
  normalizeUploadReference,
  findUpload,
  openDownloadStream,
  putUpload,
  saveUpload,
  deleteUpload,
};
