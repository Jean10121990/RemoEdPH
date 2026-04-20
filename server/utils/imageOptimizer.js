const sharp = require('sharp');
const path = require('path');
const fsp = require('fs').promises;

const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * @param {Buffer} buffer
 * @param {'avatar'|'lesson'} type
 * @returns {Promise<Buffer>}
 */
async function processImage(buffer, type) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('processImage expects a Buffer');
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error('Image too large');
  }

  let pipeline = sharp(buffer).rotate();

  if (type === 'avatar') {
    pipeline = pipeline.resize(200, 200, { fit: 'cover', position: 'center' });
  } else if (type === 'lesson') {
    pipeline = pipeline.resize({
      width: 1200,
      fit: 'inside',
      withoutEnlargement: true,
    });
  } else {
    throw new Error(`Unknown image type: ${type}`);
  }

  return pipeline.webp({ quality: 80 }).toBuffer();
}

/**
 * @param {string} value Profile field value (typically a data URL from the client).
 * @returns {Buffer|null} Raw image bytes, or null if not an inline data URL image.
 */
function extractImageBufferFromDataUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:image')) return null;
  const comma = trimmed.indexOf(',');
  if (comma === -1) return null;
  return Buffer.from(trimmed.slice(comma + 1), 'base64');
}

function getUploadsRoot() {
  return path.join(__dirname, '../../uploads');
}

/**
 * Map a public URL like /uploads/foo/bar.webp to an absolute path under uploads/, or null if unsafe.
 * @param {string} publicPath
 * @returns {string|null}
 */
function uploadsPublicPathToAbsolute(publicPath) {
  const root = path.resolve(getUploadsRoot());
  if (!publicPath || typeof publicPath !== 'string') return null;
  if (!publicPath.startsWith('/uploads/')) return null;
  const rel = publicPath.slice('/uploads/'.length).replace(/^[/\\]+/, '');
  const abs = path.resolve(path.join(root, rel));
  const relative = path.relative(root, abs);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return abs;
}

/**
 * @param {string} publicPath
 * @param {string[]} allowedSubdirs e.g. ['teacher-profiles']
 */
async function safeUnlinkPublicUpload(publicPath, allowedSubdirs) {
  const abs = uploadsPublicPathToAbsolute(publicPath);
  if (!abs) return;
  const rel = path.relative(getUploadsRoot(), abs).replace(/\\/g, '/');
  const top = rel.split('/')[0];
  if (!allowedSubdirs.includes(top)) return;
  await fsp.unlink(abs).catch(() => {});
}

module.exports = {
  processImage,
  extractImageBufferFromDataUrl,
  getUploadsRoot,
  uploadsPublicPathToAbsolute,
  safeUnlinkPublicUpload,
};
