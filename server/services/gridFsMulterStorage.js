/**
 * Multer storage that streams the file into MongoDB GridFS (bucket `uploads`).
 * Large files (portal videos) never buffer in process memory.
 */
const path = require('path');
const crypto = require('crypto');
const { getBucket, normalizeRelativePath, deleteUpload, mimeFromPath } = require('./uploadStore');

function safeExt(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (!ext || ext.length > 12 || /[^a-z0-9.]/i.test(ext)) return '';
  return ext;
}

function defaultBasename(file) {
  return `${Date.now()}-${crypto.randomInt(0, 1e9)}${safeExt(file && file.originalname)}`;
}

/**
 * @param {{ prefix?: string|Function, filename?: Function }} opts
 *   prefix  — GridFS directory, e.g. 'portal-videos' or (req, file) => req.uploadSubdir
 *   filename — optional multer-style (req, file, cb) => cb(null, basename)
 */
function createGridFsStorage(opts) {
  const options = opts || {};

  function resolvePrefix(req, file) {
    const raw =
      typeof options.prefix === 'function' ? options.prefix(req, file) : options.prefix;
    return String(raw || 'uploads')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
  }

  return {
    _handleFile(req, file, cb) {
      const start = (basename) => {
        const prefix = resolvePrefix(req, file);
        const rel = normalizeRelativePath(prefix + '/' + String(basename || defaultBasename(file)));
        if (!rel) return cb(new Error('Invalid upload path'));
        const bucket = getBucket();
        if (!bucket) return cb(new Error('Database unavailable for upload storage'));

        let size = 0;
        const upload = bucket.openUploadStream(rel, {
          contentType: file.mimetype || mimeFromPath(rel),
          metadata: { relativePath: rel, originalName: file.originalname || '', storedAt: new Date() },
        });
        upload.on('error', (err) => cb(err));
        file.stream.on('error', (err) => {
          try {
            upload.destroy(err);
          } catch (_e) {}
          cb(err);
        });
        file.stream.on('data', (chunk) => {
          size += chunk.length;
        });
        upload.on('finish', () => {
          cb(null, {
            filename: path.basename(rel),
            destination: prefix,
            path: rel,
            size,
            gridFsFilename: rel,
            gridFsId: upload.id,
          });
        });
        file.stream.pipe(upload);
      };

      if (typeof options.filename === 'function') {
        options.filename(req, file, (err, name) => {
          if (err) return cb(err);
          start(name);
        });
        return;
      }
      start(defaultBasename(file));
    },

    _removeFile(req, file, cb) {
      const rel = (file && (file.gridFsFilename || file.path)) || '';
      deleteUpload(rel)
        .then(() => cb(null))
        .catch(() => cb(null));
    },
  };
}

module.exports = { createGridFsStorage };
