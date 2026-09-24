const express = require('express');
const path = require('path');
const fs = require('fs');
const TrainingCourse = require('./models/TrainingCourse');
const TrainingModule = require('./models/TrainingModule');
const TeacherTrainingProgress = require('./models/TeacherTrainingProgress');
const Teacher = require('./models/Teacher');
const { verifyToken, requireTeacher } = require('./authMiddleware');
const {
  findUpload,
  openDownloadStream,
  normalizeRelativePath,
  mimeFromPath,
} = require('./services/uploadStore');

const router = express.Router();

router.use(verifyToken, requireTeacher);

const UPLOADS_ROOT = path.join(__dirname, '../uploads');

function fileExt(nameOrPath) {
  return path.extname(String(nameOrPath || '')).toLowerCase();
}

function resolveUnderUploads(storedPath, publicUrl) {
  if (storedPath) {
    const abs = path.isAbsolute(storedPath)
      ? storedPath
      : path.join(__dirname, '..', storedPath);
    const normalized = path.normalize(abs);
    if (normalized.startsWith(path.normalize(UPLOADS_ROOT)) && fs.existsSync(normalized)) {
      return normalized;
    }
  }
  if (publicUrl && String(publicUrl).startsWith('/uploads/')) {
    const rel = String(publicUrl).replace(/^\/uploads\//, '');
    const candidate = path.normalize(path.join(UPLOADS_ROOT, rel));
    if (candidate.startsWith(path.normalize(UPLOADS_ROOT)) && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function mimeForExt(ext) {
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.ppt') return 'application/vnd.ms-powerpoint';
  if (ext === '.pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mp4') return 'video/mp4';
  return 'application/octet-stream';
}

function setInlineHeaders(res, displayName, contentType) {
  const safeName = String(displayName || 'material').replace(/"/g, '');
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + safeName + '"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/** Stream training material for in-browser preview only (no attachment disposition). */
function sendInlineFile(res, absolutePath, displayName) {
  const ext = fileExt(displayName || absolutePath);
  setInlineHeaders(res, displayName || path.basename(absolutePath), mimeForExt(ext));
  fs.createReadStream(absolutePath).pipe(res);
}

/**
 * Production training uploads live in GridFS (see adminTrainingRoutes + gridFsMulterStorage).
 * Disk-only lookup 404s after deploy; fall back to the uploads bucket.
 */
async function sendInlineUpload(res, storedPath, publicUrl, displayName) {
  const abs = resolveUnderUploads(storedPath, publicUrl);
  if (abs) {
    sendInlineFile(res, abs, displayName);
    return true;
  }
  const rel =
    normalizeRelativePath(publicUrl) ||
    normalizeRelativePath(storedPath);
  if (!rel) return false;
  const doc = await findUpload(rel);
  if (!doc) return false;
  const name = displayName || path.basename(rel);
  setInlineHeaders(
    res,
    name,
    doc.contentType || mimeFromPath(name) || mimeForExt(fileExt(name))
  );
  if (Number.isFinite(Number(doc.length))) {
    res.setHeader('Content-Length', String(doc.length));
  }
  const stream = openDownloadStream(doc._id);
  stream.on('error', (err) => {
    console.error('training GridFS stream:', (err && err.message) || err);
    if (!res.headersSent) res.status(404).json({ success: false, message: 'File not found' });
    else res.destroy();
  });
  stream.pipe(res);
  return true;
}

function publicCourseFields(course) {
  const ext = fileExt(course.presentationName || course.presentationUrl || course.presentationPath);
  return {
    _id: course._id,
    title: course.title,
    description: course.description || '',
    category: course.category || 'Course Material',
    published: course.published,
    order: course.order,
    hasPresentation: !!(course.presentationUrl || course.presentationPath),
    presentationName: course.presentationName || '',
    presentationExt: ext,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt
  };
}

function publicModuleFields(mod, progress) {
  const ext = fileExt(mod.assetName || mod.assetUrl);
  return {
    _id: mod._id,
    courseId: mod.courseId,
    moduleIndex: mod.moduleIndex,
    title: mod.title,
    type: mod.type,
    content: mod.content || '',
    durationMinutes: mod.durationMinutes,
    published: mod.published,
    hasVideo: !!mod.videoUrl,
    hasAsset: !!mod.assetUrl,
    assetName: mod.assetName || '',
    assetExt: ext,
    progress: progress || { status: 'not_started', watchSeconds: 0 }
  };
}

async function rollupCourseProgress(teacherId, courseId) {
  const modules = await TrainingModule.find({ courseId, published: true }).select('_id').lean();
  if (!modules.length) return;
  const moduleIds = modules.map((m) => m._id);
  const completed = await TeacherTrainingProgress.countDocuments({
    teacherId,
    courseId,
    moduleId: { $in: moduleIds },
    status: 'completed'
  });
  const progress = Math.round((completed / modules.length) * 100);
  const course = await TrainingCourse.findById(courseId).lean();
  if (!course) return;
  let status = 'available';
  if (progress >= 100) status = 'completed';
  else if (progress > 0) status = 'in-progress';
  await Teacher.findOneAndUpdate(
    { teacherId },
    {
      $pull: { trainingProgress: { courseId: String(courseId) } }
    }
  );
  await Teacher.findOneAndUpdate(
    { teacherId },
    {
      $push: {
        trainingProgress: {
          courseId: String(courseId),
          courseName: course.title,
          status,
          progress,
          startedAt: progress > 0 ? new Date() : null,
          completedAt: progress >= 100 ? new Date() : null
        }
      }
    }
  );
}

router.get('/courses', async (req, res) => {
  try {
    const teacherId = req.user.teacherId || req.user.userId;
    const courses = await TrainingCourse.find({ published: true }).sort({ order: 1 }).lean();
    const teacher = await Teacher.findOne({ teacherId }).select('trainingProgress').lean();
    const progressMap = {};
    (teacher?.trainingProgress || []).forEach((p) => {
      progressMap[p.courseId] = p;
    });
    const out = courses.map((c) => ({
      ...publicCourseFields(c),
      progress: progressMap[String(c._id)]?.progress || 0,
      status: progressMap[String(c._id)]?.status || 'available'
    }));
    res.json({ success: true, courses: out });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/courses/:id', async (req, res) => {
  try {
    const teacherId = req.user.teacherId || req.user.userId;
    const course = await TrainingCourse.findById(req.params.id).lean();
    if (!course || !course.published) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    const modules = await TrainingModule.find({ courseId: course._id, published: true })
      .sort({ moduleIndex: 1 })
      .lean();
    const progressRows = await TeacherTrainingProgress.find({
      teacherId,
      courseId: course._id
    }).lean();
    const byModule = {};
    progressRows.forEach((r) => {
      byModule[String(r.moduleId)] = r;
    });
    const modulesOut = modules.map((m) =>
      publicModuleFields(m, byModule[String(m._id)] || { status: 'not_started', watchSeconds: 0 })
    );
    res.json({ success: true, course: publicCourseFields(course), modules: modulesOut });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Authenticated PDF/PPT stream for course presentation — inline preview, no attachment. */
router.get('/courses/:id/presentation', async (req, res) => {
  try {
    const course = await TrainingCourse.findById(req.params.id).lean();
    if (!course || !course.published) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    const ok = await sendInlineUpload(
      res,
      course.presentationPath,
      course.presentationUrl,
      course.presentationName || 'presentation'
    );
    if (!ok) return res.status(404).json({ success: false, message: 'Presentation file not found' });
  } catch (e) {
    console.error('GET presentation:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Authenticated stream for module PDF/asset — inline preview only. */
router.get('/modules/:id/asset', async (req, res) => {
  try {
    const mod = await TrainingModule.findById(req.params.id).lean();
    if (!mod || !mod.published) {
      return res.status(404).json({ success: false, message: 'Module not found' });
    }
    const course = await TrainingCourse.findById(mod.courseId).lean();
    if (!course || !course.published) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    if (!mod.assetUrl) {
      return res.status(404).json({ success: false, message: 'Asset file not found' });
    }
    const ok = await sendInlineUpload(
      res,
      null,
      mod.assetUrl,
      mod.assetName || path.basename(String(mod.assetUrl))
    );
    if (!ok) return res.status(404).json({ success: false, message: 'Asset file not found' });
  } catch (e) {
    console.error('GET module asset:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Authenticated stream for module video. */
router.get('/modules/:id/video', async (req, res) => {
  try {
    const mod = await TrainingModule.findById(req.params.id).lean();
    if (!mod || !mod.published || !mod.videoUrl) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    const course = await TrainingCourse.findById(mod.courseId).lean();
    if (!course || !course.published) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    const ok = await sendInlineUpload(
      res,
      null,
      mod.videoUrl,
      path.basename(String(mod.videoUrl))
    );
    if (!ok) return res.status(404).json({ success: false, message: 'Video file not found' });
  } catch (e) {
    console.error('GET module video:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/modules/:id/complete', async (req, res) => {
  try {
    const teacherId = req.user.teacherId || req.user.userId;
    if (!teacherId) {
      return res.status(400).json({ success: false, message: 'Missing teacher identity' });
    }
    const mod = await TrainingModule.findById(req.params.id);
    if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
    const watchSeconds = Number(req.body.watchSeconds) || 0;
    await TeacherTrainingProgress.findOneAndUpdate(
      { teacherId, moduleId: mod._id },
      {
        teacherId,
        courseId: mod.courseId,
        moduleId: mod._id,
        status: 'completed',
        watchSeconds,
        completedAt: new Date()
      },
      { upsert: true, new: true }
    );
    try {
      await rollupCourseProgress(teacherId, mod.courseId);
    } catch (rollupErr) {
      console.error('rollupCourseProgress:', rollupErr);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('POST /training/modules/:id/complete', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
