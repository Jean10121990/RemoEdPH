/**
 * Durable storage for uploaded media, backed by MongoDB GridFS.
 *
 * Production runs on a container filesystem that is replaced on every deploy and is not
 * shared between instances, so anything written under uploads/ disappears while the
 * document referencing it survives. Storing the bytes in the same database keeps the file
 * and the reference to it together.
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pipeline } = require('stream/promises');
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

function isProductionEnv() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
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
  const base = rel.split('/').pop();
  const candidates = [rel];
  if (base && base !== rel) candidates.push(base);
  if (base && !rel.startsWith('files/')) candidates.push('files/' + base);
  for (const name of candidates) {
    const docs = await bucket.find({ filename: name }).sort({ uploadDate: -1 }).limit(1).toArray();
    if (docs && docs.length) return docs[0];
  }
  return null;
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
 * Local/dev falls back to uploads/ when Mongo is unreachable. Production fails closed
 * so we never persist a path whose bytes will vanish on the next Cloud Run deploy.
 */
async function saveUpload(relativePath, buffer, contentType) {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) throw new Error('Invalid upload path');
  try {
    return await putUpload(rel, buffer, contentType);
  } catch (err) {
    if (isProductionEnv()) throw err;
    console.warn('GridFS upload failed, falling back to local uploads/:', (err && err.message) || err);
    const abs = path.join(UPLOADS_ROOT, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, buffer);
    return '/uploads/' + rel;
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listUploadsByPrefix(prefix) {
  const p = normalizeRelativePath(prefix);
  if (!p) return [];
  const bucket = getBucket();
  if (!bucket) return [];
  const re = new RegExp('^' + escapeRegex(p) + '(/|$)');
  return bucket.find({ filename: re }).sort({ filename: 1 }).toArray();
}

async function downloadToFile(relativePath, destAbs) {
  const doc = await findUpload(relativePath);
  if (!doc) throw new Error('Upload not found: ' + relativePath);
  await fsp.mkdir(path.dirname(destAbs), { recursive: true });
  await pipeline(openDownloadStream(doc._id), fs.createWriteStream(destAbs));
  return destAbs;
}

async function putUploadFromFile(relativePath, absPath, contentType) {
  const rel = normalizeRelativePath(relativePath);
  if (!rel) throw new Error('Invalid upload path');
  const bucket = getBucket();
  if (!bucket) throw new Error('Database unavailable for upload storage');
  await deleteUpload(rel);
  await pipeline(
    fs.createReadStream(absPath),
    bucket.openUploadStream(rel, {
      contentType: contentType || mimeFromPath(rel),
      metadata: { relativePath: rel, storedAt: new Date() },
    })
  );
  return '/uploads/' + rel;
}

async function concatenateUploads(partRels, destRel, contentType) {
  const rel = normalizeRelativePath(destRel);
  if (!rel) throw new Error('Invalid upload path');
  const bucket = getBucket();
  if (!bucket) throw new Error('Database unavailable for upload storage');
  await deleteUpload(rel);
  const upload = bucket.openUploadStream(rel, {
    contentType: contentType || mimeFromPath(rel),
    metadata: { relativePath: rel, storedAt: new Date() },
  });
  await new Promise((resolve, reject) => {
    upload.on('error', reject);
    upload.on('finish', resolve);
    (async () => {
      for (const part of partRels) {
        const doc = await findUpload(part);
        if (!doc) continue;
        await new Promise((res, rej) => {
          const src = openDownloadStream(doc._id);
          src.on('error', rej);
          src.on('end', res);
          src.pipe(upload, { end: false });
        });
      }
      upload.end();
    })().catch(reject);
  });
  return '/uploads/' + rel;
}

async function saveUploadTree(absDir, destPrefix) {
  const prefix = normalizeRelativePath(destPrefix);
  if (!prefix) throw new Error('Invalid upload path');
  async function walk(dir, relBase) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = relBase ? relBase + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        await putUploadFromFile(prefix + '/' + rel.replace(/\\/g, '/'), abs, mimeFromPath(rel));
      }
    }
  }
  await walk(absDir, '');
  return '/uploads/' + prefix;
}

module.exports = {
  BUCKET_NAME,
  UPLOADS_ROOT,
  normalizeRelativePath,
  normalizeUploadReference,
  getBucket,
  mimeFromPath,
  findUpload,
  openDownloadStream,
  putUpload,
  putUploadFromFile,
  concatenateUploads,
  saveUploadTree,
  listUploadsByPrefix,
  downloadToFile,
  saveUpload,
  deleteUpload,
};
