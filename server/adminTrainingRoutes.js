const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const TrainingCourse = require('./models/TrainingCourse');
const TrainingModule = require('./models/TrainingModule');
const { verifyAdminApiAuth, requireAdmin } = require('./authMiddleware');

const router = express.Router();

router.use((req, res, next) => {
  verifyAdminApiAuth(req, res, (err) => {
    if (err) return;
    requireAdmin(req, res, next);
  });
});

const trainingStorage = multer.diskStorage({
  destination(req, file, cb) {
    const sub = req.uploadSubdir || 'training-assets';
    const dir = path.join(__dirname, '../uploads', sub);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const unique = Date.now() + '-' + crypto.randomInt(0, 1e9);
    const ext = path.extname(file.originalname || '') || '';
    cb(null, 'tr-' + unique + ext);
  }
});

const ALLOWED_PRESENTATION_EXTS = new Set(['.ppt', '.pptx', '.pdf']);
const ALLOWED_PRESENTATION_MIMES = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/mspowerpoint',
  'application/x-mspowerpoint',
]);

function isAllowedPresentationFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  return ALLOWED_PRESENTATION_EXTS.has(ext) || ALLOWED_PRESENTATION_MIMES.has(mime);
}

const upload = multer({
  storage: trainingStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    // Non-presentation uploads (video/asset) skip this filter when field !== presentation
    if (file.fieldname === 'presentation' && !isAllowedPresentationFile(file)) {
      return cb(new Error('Only .ppt, .pptx, or .pdf files are allowed'));
    }
    cb(null, true);
  }
});

router.get('/courses', async (req, res) => {
  try {
    const courses = await TrainingCourse.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, courses });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const { title, description, order, published, audience, category } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'Title required' });
    }
    const course = await TrainingCourse.create({
      title: String(title).trim(),
      description: String(description || ''),
      category: String(category || 'Course Material').trim() || 'Course Material',
      order: Number(order) || 0,
      published: published !== false,
      audience: audience || 'all',
      createdBy: req.user?.username || 'admin'
    });
    res.json({ success: true, course });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/courses/:id', async (req, res) => {
  try {
    const updates = {
      title: req.body.title,
      description: req.body.description,
      order: req.body.order,
      published: req.body.published,
      audience: req.body.audience
    };
    if (req.body.category != null) {
      updates.category = String(req.body.category).trim() || 'Course Material';
    }
    const course = await TrainingCourse.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!course) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, course });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    await TrainingModule.deleteMany({ courseId: req.params.id });
    await TrainingCourse.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Create course with optional PPT/PPTX/PDF (multipart: title, category, description, published, presentation). */
router.post('/courses/with-presentation', (req, res) => {
  req.uploadSubdir = 'training-assets';
  upload.single('presentation')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const title = String(req.body.title || '').trim();
      if (!title) {
        return res.status(400).json({ success: false, message: 'Title required' });
      }
      if (req.file && !isAllowedPresentationFile(req.file)) {
        try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
        return res.status(400).json({ success: false, message: 'Only .ppt, .pptx, or .pdf files are allowed' });
      }
      const publishedRaw = req.body.published;
      const published =
        publishedRaw === undefined || publishedRaw === ''
          ? true
          : publishedRaw === true || publishedRaw === 'true' || publishedRaw === '1';
      const payload = {
        title,
        description: String(req.body.description || ''),
        category: String(req.body.category || 'Course Material').trim() || 'Course Material',
        order: Number(req.body.order) || 0,
        published,
        audience: req.body.audience || 'all',
        createdBy: req.user?.username || 'admin'
      };
      if (req.file) {
        payload.presentationPath = req.file.path;
        payload.presentationUrl = '/uploads/training-assets/' + req.file.filename;
        payload.presentationName = req.file.originalname || req.file.filename;
      }
      const course = await TrainingCourse.create(payload);
      // Seed an Introduction module so teachers see the PDF in the module viewer pane.
      if (req.file && payload.presentationUrl) {
        await TrainingModule.create({
          courseId: course._id,
          moduleIndex: 0,
          title: 'Introduction',
          type: 'asset',
          content: '',
          assetUrl: payload.presentationUrl,
          assetName: payload.presentationName || req.file.filename,
          durationMinutes: 15,
          published: true
        });
      }
      res.json({ success: true, course });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

router.post('/courses/:id/upload-presentation', (req, res) => {
  req.uploadSubdir = 'training-assets';
  upload.single('presentation')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
      if (!isAllowedPresentationFile(req.file)) {
        try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
        return res.status(400).json({ success: false, message: 'Only .ppt, .pptx, or .pdf files are allowed' });
      }
      const url = '/uploads/training-assets/' + req.file.filename;
      const presentationName = req.file.originalname || req.file.filename;
      const course = await TrainingCourse.findByIdAndUpdate(
        req.params.id,
        {
          presentationPath: req.file.path,
          presentationUrl: url,
          presentationName
        },
        { new: true }
      );
      if (!course) return res.status(404).json({ success: false, message: 'Not found' });
      const firstMod = await TrainingModule.findOne({ courseId: course._id }).sort({ moduleIndex: 1 });
      if (firstMod) {
        firstMod.type = 'asset';
        firstMod.assetUrl = url;
        firstMod.assetName = presentationName;
        await firstMod.save();
      } else {
        await TrainingModule.create({
          courseId: course._id,
          moduleIndex: 0,
          title: 'Introduction',
          type: 'asset',
          assetUrl: url,
          assetName: presentationName,
          durationMinutes: 15,
          published: true
        });
      }
      res.json({ success: true, course, presentationUrl: url });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

router.get('/courses/:id/modules', async (req, res) => {
  try {
    const modules = await TrainingModule.find({ courseId: req.params.id }).sort({ moduleIndex: 1 }).lean();
    res.json({ success: true, modules });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/courses/:id/modules', async (req, res) => {
  try {
    const courseId = req.params.id;
    const course = await TrainingCourse.findById(courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const count = await TrainingModule.countDocuments({ courseId });
    const mod = await TrainingModule.create({
      courseId,
      moduleIndex: req.body.moduleIndex != null ? Number(req.body.moduleIndex) : count,
      title: String(req.body.title || 'New module').trim(),
      type: req.body.type || 'guideline',
      content: String(req.body.content || ''),
      videoUrl: String(req.body.videoUrl || ''),
      assetUrl: String(req.body.assetUrl || ''),
      assetName: String(req.body.assetName || ''),
      durationMinutes: Number(req.body.durationMinutes) || 5,
      published: req.body.published !== false
    });
    res.json({ success: true, module: mod });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/modules/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.title != null) updates.title = String(req.body.title).trim();
    if (req.body.type != null) updates.type = req.body.type;
    if (req.body.content != null) updates.content = String(req.body.content);
    if (req.body.videoUrl != null) updates.videoUrl = String(req.body.videoUrl);
    if (req.body.assetUrl != null) updates.assetUrl = String(req.body.assetUrl);
    if (req.body.assetName != null) updates.assetName = String(req.body.assetName);
    if (req.body.durationMinutes != null) updates.durationMinutes = Number(req.body.durationMinutes) || 5;
    if (req.body.published != null) updates.published = req.body.published !== false && req.body.published !== 'false';
    if (req.body.moduleIndex != null) updates.moduleIndex = Number(req.body.moduleIndex) || 0;

    const mod = await TrainingModule.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!mod) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, module: mod });
  } catch (e) {
    console.error('PUT /training/modules/:id', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/modules/:id', async (req, res) => {
  try {
    await TrainingModule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/modules/:id/upload-video', (req, res, next) => {
  req.uploadSubdir = 'training-videos';
  upload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
      const url = '/uploads/training-videos/' + req.file.filename;
      const mod = await TrainingModule.findByIdAndUpdate(
        req.params.id,
        { type: 'video', videoUrl: url, assetName: req.file.originalname },
        { new: true }
      );
      res.json({ success: true, module: mod, videoUrl: url });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

router.post('/modules/:id/upload-asset', (req, res, next) => {
  req.uploadSubdir = 'training-assets';
  upload.single('asset')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
      const url = '/uploads/training-assets/' + req.file.filename;
      const mod = await TrainingModule.findByIdAndUpdate(
        req.params.id,
        { type: 'asset', assetUrl: url, assetName: req.file.originalname },
        { new: true }
      );
      res.json({ success: true, module: mod, assetUrl: url });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

module.exports = router;
