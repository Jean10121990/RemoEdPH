const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const File = require('./models/File');
const { fileUploadLimiter } = require('./middleware/apiRateLimits');
const { verifyToken } = require('./authMiddleware');
const { getCookieValue } = require('./middleware/uploadsAccess');
const { createGridFsStorage } = require('./services/gridFsMulterStorage');
const { findUpload, openDownloadStream, deleteUpload } = require('./services/uploadStore');

const router = express.Router();

/** Allow <a target=_blank> / window.open downloads to auth via remoed_media_token cookie. */
function attachMediaTokenFromCookie(req, res, next) {
  const hasAuth =
    (req.headers && req.headers.authorization) ||
    (req.query && req.query.token) ||
    (req.body && req.body.token);
  if (!hasAuth) {
    const cookieToken = getCookieValue(req, 'remoed_media_token');
    if (cookieToken) {
      req.headers.authorization = 'Bearer ' + cookieToken;
    }
  }
  next();
}

function normRole(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function isAdminUser(user) {
  if (!user) return false;
  if (user.isAdmin === true) return true;
  return normRole(user.role) === 'admin';
}

function isTeacherUser(user) {
  if (!user) return false;
  if (user.teacherId) return true;
  return (
    normRole(user.userType) === 'teacher' ||
    normRole(user.userRole) === 'teacher' ||
    normRole(user.role) === 'teacher'
  );
}

function actorLabel(user) {
  if (!user) return '';
  return String(
    user.username ||
      user.email ||
      user.teacherId ||
      user.studentId ||
      user.adminId ||
      ''
  ).trim();
}

function canDeleteFile(user, file) {
  if (!user || !file) return false;
  if (isAdminUser(user) || isTeacherUser(user)) return true;
  const actor = actorLabel(user);
  if (!actor) return false;
  return String(file.uploader || '') === actor;
}

function getAllowedExtension(fileName) {
  const name = String(fileName || '').toLowerCase();
  return name.match(/\.(\w+)$/)?.[0] || '';
}

function resolveMimeType(fileName, providedMimeType) {
  const ext = getAllowedExtension(fileName);
  if (ext === '.pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (ext === '.ppt') {
    return 'application/vnd.ms-powerpoint';
  }
  if (ext === '.pdf') {
    return 'application/pdf';
  }
  if (ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (ext === '.doc') {
    return 'application/msword';
  }
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.gif') {
    return 'image/gif';
  }
  if (ext === '.txt') {
    return 'text/plain';
  }
  return providedMimeType || 'application/octet-stream';
}

const uploadsDir = path.join(__dirname, '../uploads');

async function resolveStoredFile(filename) {
  const name = path.basename(String(filename || ''));
  if (!name || name.includes('..')) return null;
  for (const rel of ['files/' + name, name]) {
    const doc = await findUpload(rel);
    if (doc) return { kind: 'gridfs', doc, rel };
  }
  const disk = path.join(uploadsDir, name);
  if (fs.existsSync(disk)) return { kind: 'disk', disk };
  return null;
}

function pipeGridFs(doc, res) {
  const stream = openDownloadStream(doc._id);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.destroy();
    }
    console.warn('GridFS file stream:', err && err.message);
  });
  stream.pipe(res);
}

const storage = createGridFsStorage({
  prefix: 'files',
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + crypto.randomInt(0, 1e9);
    const safe = String(file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, uniqueSuffix + '-' + safe);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit (supports short demo recordings)
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'video/webm',
      'video/mp4',
      'application/octet-stream'
    ];
    const ext = getAllowedExtension(file.originalname || '');
    const normalizedMime = String(file.mimetype || '').toLowerCase();
    const isPowerPoint = ext === '.ppt' || ext === '.pptx';
    const isTextDocument = ['.pdf', '.doc', '.docx', '.txt'].includes(ext);
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
    const isVideo = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'].includes(ext);
    const isAudio = ['.mp3', '.wav', '.m4a', '.ogg'].includes(ext);

    if (allowedTypes.includes(normalizedMime) || isPowerPoint || isTextDocument || isImage || isVideo || isAudio) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: documents, images, audio, and video files.'), false);
    }
  }
});

// All classroom file APIs require a valid JWT (header, query, body, or media cookie).
router.use(attachMediaTokenFromCookie);
router.use(verifyToken);

// Upload file (limiter on handler so all mount prefixes share one cap, e.g. /api/upload and /api/files/upload)
router.post('/upload', fileUploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { room } = req.body;
    const uploader = actorLabel(req.user) || String(req.body.uploader || '').trim();
    
    if (!room || !uploader) {
      return res.status(400).json({ error: 'Room and uploader are required' });
    }

    // Save file metadata to MongoDB
    const resolvedMimeType = resolveMimeType(req.file.originalname, req.file.mimetype);
    const fileDoc = new File({
      filename: req.file.filename,
      originalName: req.file.originalname,
      room: room,
      uploader: uploader,
      fileSize: req.file.size,
      mimeType: resolvedMimeType
    });

    await fileDoc.save();

    res.json({
      success: true,
      file: {
        id: fileDoc._id,
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: resolvedMimeType,
        uploadDate: fileDoc.uploadDate
      }
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Get files for a room
router.get('/files/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const files = await File.find({ room: room }).sort({ uploadDate: -1 });
    
    res.json({
      success: true,
      files: files.map(file => ({
        id: file._id,
        filename: file.filename,
        originalName: file.originalName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        uploader: file.uploader,
        uploadDate: file.uploadDate
      }))
    });

  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

// Download file (forces download)
router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await File.findById(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stored = await resolveStoredFile(file.filename);
    if (!stored) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const safeName = String(file.originalName || file.filename).replace(/[\r\n"]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    if (stored.kind === 'gridfs') {
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      if (Number.isFinite(Number(stored.doc.length))) {
        res.setHeader('Content-Length', String(stored.doc.length));
      }
      return pipeGridFs(stored.doc, res);
    }
    res.download(stored.disk, file.originalName);

  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'File download failed' });
  }
});

// Preview file (for inline viewing)
router.get('/preview/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await File.findById(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stored = await resolveStoredFile(file.filename);
    if (!stored) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', 'inline; filename="' + file.originalName + '"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (stored.kind === 'gridfs') {
      return pipeGridFs(stored.doc, res);
    }
    const fileStream = fs.createReadStream(stored.disk);
    fileStream.pipe(res);

  } catch (error) {
    console.error('File preview error:', error);
    res.status(500).json({ error: 'File preview failed' });
  }
});

// Delete file
router.delete('/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await File.findById(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (!canDeleteFile(req.user, file)) {
      return res.status(403).json({ error: 'Not allowed to delete this file' });
    }

    const stored = await resolveStoredFile(file.filename);
    if (stored && stored.kind === 'gridfs') {
      await deleteUpload(stored.rel).catch(() => {});
    } else if (stored && stored.kind === 'disk') {
      try {
        fs.unlinkSync(stored.disk);
      } catch (unlinkErr) {
        console.warn('File unlink failed (continuing DB delete):', unlinkErr && unlinkErr.message);
      }
    }

    // Delete from MongoDB
    await File.findByIdAndDelete(fileId);

    res.json({ success: true, message: 'File deleted successfully' });

  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({ error: 'File deletion failed' });
  }
});

// Multer/file filter error handler for cleaner API messages
router.use((error, req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
    return res.status(400).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Upload failed.'
          : String(error && error.message ? error.message : 'Upload failed.'),
    });
  }
  return res.status(400).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'Upload failed.'
        : String(error && error.message ? error.message : 'Upload failed.'),
  });
});

module.exports = router;
