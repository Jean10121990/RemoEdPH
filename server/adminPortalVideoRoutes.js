/**
 * Admin library videos for the live classroom (Videos tab).
 * Mounted in index.js before the main admin router so these paths always register.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const PortalVideo = require('./models/PortalVideo');
const { verifyAdminApiAuth, requireAdmin } = require('./authMiddleware');

const router = express.Router();

router.use((req, res, next) => {
  verifyAdminApiAuth(req, res, (err) => {
    if (err) return;
    requireAdmin(req, res, next);
  });
});

const portalVideoStorage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, '../uploads/portal-videos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const unique = Date.now() + '-' + crypto.randomInt(0, 1e9);
    const ext = path.extname(file.originalname || '') || '.mp4';
    cb(null, 'pv-' + unique + ext);
  },
});

const portalVideoUpload = multer({
  storage: portalVideoStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    const mimeOk = /^video\/(mp4|webm|quicktime|x-msvideo|x-matroska|3gpp)/.test(mime);
    const extOk = /\.(mp4|webm|mov|avi|mkv|m4v)$/.test(name);
    if (mimeOk || extOk) return cb(null, true);
    cb(new Error('Only video files are allowed (e.g. MP4, WebM, MOV).'));
  },
});

function portalVideoUploadMiddleware(req, res, next) {
  portalVideoUpload.single('video')(req, res, (err) => {
    if (err) {
      const msg =
        err instanceof multer.MulterError
          ? err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large (max 500 MB).'
            : err.message
          : err.message || 'Upload failed';
      return res.status(400).json({ success: false, message: msg });
    }
    next();
  });
}

router.get('/portal-videos', async (req, res) => {
  try {
    const list = await PortalVideo.find().sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      videos: list.map((v) => ({
        id: String(v._id),
        title: v.title,
        description: v.description || '',
        url: v.relativeUrl,
        mimeType: v.mimeType || 'video/mp4',
        sizeBytes: v.sizeBytes || 0,
        active: v.active !== false,
        uploadedBy: v.uploadedBy || '',
        createdAt: v.createdAt,
      })),
    });
  } catch (err) {
    console.error('admin portal-videos list:', err);
    res.status(500).json({ success: false, message: 'Failed to load videos' });
  }
});

router.post('/portal-videos', portalVideoUploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file uploaded' });
    }
    const title = String(req.body.title || '').trim() || req.file.originalname || 'Untitled';
    const description = String(req.body.description || '').trim();
    const relativeUrl = '/uploads/portal-videos/' + req.file.filename;
    const uploadedBy =
      req.user && (req.user.username || req.user.email)
        ? String(req.user.username || req.user.email)
        : '';
    const doc = await PortalVideo.create({
      title,
      description,
      fileName: req.file.filename,
      relativeUrl,
      mimeType: req.file.mimetype || 'video/mp4',
      sizeBytes: req.file.size || 0,
      uploadedBy,
      active: true,
    });
    res.json({
      success: true,
      video: {
        id: String(doc._id),
        title: doc.title,
        description: doc.description,
        url: doc.relativeUrl,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        active: doc.active,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    console.error('admin portal-videos upload:', err);
    res.status(500).json({ success: false, message: 'Failed to save video' });
  }
});

/** Remove file from disk and delete DB row (must be registered before /portal-videos/:id) */
router.delete('/portal-videos/:id/permanent', async (req, res) => {
  try {
    const v = await PortalVideo.findById(req.params.id);
    if (!v) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    const base = path.basename(String(v.fileName || ''));
    if (!base || base.includes('..') || !/^pv-[\w.-]+$/i.test(base)) {
      await PortalVideo.deleteOne({ _id: v._id });
      return res.json({ success: true, message: 'Record removed (file name was invalid).' });
    }
    const abs = path.join(__dirname, '../uploads/portal-videos', base);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch (e) {
        console.warn('portal-videos permanent delete unlink:', e.message);
      }
    }
    await PortalVideo.deleteOne({ _id: v._id });
    res.json({ success: true });
  } catch (err) {
    console.error('admin portal-videos permanent delete:', err);
    res.status(500).json({ success: false, message: 'Failed to delete video' });
  }
});

/** Soft-delete (hide from live classroom only) */
router.delete('/portal-videos/:id', async (req, res) => {
  try {
    const v = await PortalVideo.findById(req.params.id);
    if (!v) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    v.active = false;
    await v.save();
    res.json({ success: true });
  } catch (err) {
    console.error('admin portal-videos hide:', err);
    res.status(500).json({ success: false, message: 'Failed to hide video' });
  }
});

module.exports = router;
