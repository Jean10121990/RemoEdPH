const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const { sanitizeTeacherNotes } = require('./utils/sanitizeHtml');
const Curriculum = require('./models/Curriculum');
const Lesson = require('./models/Lesson');
// LessonFile model removed - files are now embedded in Lesson model
const LessonProgress = require('./models/LessonProgress');
// Import auth middleware
const { isTokenBlacklisted } = require('./services/jwtBlacklist');

const authenticateToken = (req, res, next) => {
  // Accept token from Authorization header, query, or body for flexibility (devtunnels)
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = headerToken || req.query.token || req.body.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }
  if (isTokenBlacklisted(token)) {
    return res.status(403).json({ success: false, message: 'Token has been revoked' });
  }
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const requireTeacher = (req, res, next) => {
  // Allow admin users or teacher users
  const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.username === 'admin');
  const isTeacher = req.user && (req.user.teacherId || req.user.userType === 'teacher');
  
  if (!req.user || (!isTeacher && !isAdmin)) {
    return res.status(403).json({ error: 'Teacher or Admin access required' });
  }
  next();
};

const requireStudent = (req, res, next) => {
  if (!req.user || (!req.user.studentId && req.user.userType !== 'student')) {
    return res.status(403).json({ error: 'Student access required' });
  }
  next();
};

/** Teachers and admins (curriculum specialists) — can see/edit internal lesson notes */
function isStaffUser(req) {
  if (!req.user) return false;
  if (req.user.isAdmin === true || req.user.role === 'admin' || req.user.username === 'admin') return true;
  if (req.user.teacherId || req.user.userType === 'teacher') return true;
  return false;
}

/** Strip data-URL prefix or return raw base64 string from lesson file payload */
function lessonFileBase64Payload(fileData) {
  if (!fileData || typeof fileData !== 'string') return null;
  const s = fileData.trim();
  if (s.startsWith('data:')) {
    const base64Idx = s.indexOf('base64,');
    if (base64Idx !== -1) return s.slice(base64Idx + 7);
    const comma = s.indexOf(',');
    return comma >= 0 ? s.slice(comma + 1) : null;
  }
  return s;
}

/** HTTP Range: bytes=start-end (PDF.js / browsers may request partial content) */
function parseRangeHeader(rangeHeader, size) {
  if (!rangeHeader || typeof rangeHeader !== 'string' || !rangeHeader.startsWith('bytes=')) {
    return null;
  }
  const tail = rangeHeader.slice(6).trim();
  const dash = tail.indexOf('-');
  if (dash === -1) return null;
  const startStr = tail.slice(0, dash);
  const endStr = tail.slice(dash + 1);
  let start;
  let end;
  if (startStr === '') {
    const suffixLen = parseInt(endStr, 10);
    if (Number.isNaN(suffixLen) || suffixLen <= 0) return null;
    start = Math.max(0, size - suffixLen);
    end = size - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === '' ? size - 1 : parseInt(endStr, 10);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
  }
  if (start > end || start >= size) return null;
  if (start < 0) start = 0;
  if (end >= size) end = size - 1;
  return { start, end };
}

async function handleLessonPdfRaw(req, res) {
  let tmpPath = null;
  try {
    const { fileId } = req.params;
    const asDownload = req.query.download === '1' || req.query.download === 'true';

    const lesson = await Lesson.findOne(
      { 'files._id': fileId },
      { 'files.$': 1 }
    );
    if (!lesson || !lesson.files || lesson.files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    const file = lesson.files[0];
    const isPdf = file.fileType === 'pdf' || /\.pdf$/i.test(file.fileName || '');
    if (!isPdf) {
      return res.status(415).json({ error: 'Raw stream only available for PDF files' });
    }

    const b64 = lessonFileBase64Payload(file.fileData);
    if (!b64) {
      return res.status(404).json({ error: 'File data not found' });
    }

    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch (e) {
      return res.status(500).json({ error: 'Invalid file encoding' });
    }

    const rawName = file.fileName || 'lesson.pdf';
    const safeName = rawName.replace(/[^\w.\- ]+/g, '_').slice(0, 180);
    const safeId = String(fileId).replace(/[^a-f0-9]/gi, '');
    tmpPath = path.join(
      os.tmpdir(),
      `remoed-lesson-${safeId || 'f'}-${crypto.randomBytes(8).toString('hex')}.pdf`
    );
    await fsp.writeFile(tmpPath, buf);

    const cleanup = () => {
      if (!tmpPath) return;
      const p = tmpPath;
      tmpPath = null;
      fs.unlink(p, () => {});
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (asDownload) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`
      );
    } else {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`
      );
    }

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', String(buf.length));
      cleanup();
      return res.end();
    }

    const range = parseRangeHeader(req.headers.range, buf.length);
    if (req.headers.range && range === null) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${buf.length}`);
      cleanup();
      return res.end();
    }

    if (range) {
      const { start, end } = range;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${buf.length}`);
      res.setHeader('Content-Length', String(end - start + 1));
      const rs = fs.createReadStream(tmpPath, { start, end });
      try {
        await pipeline(rs, res);
      } finally {
        cleanup();
      }
      return;
    }

    res.setHeader('Content-Length', String(buf.length));
    const rs = fs.createReadStream(tmpPath);
    try {
      await pipeline(rs, res);
    } finally {
      cleanup();
    }
  } catch (error) {
    if (tmpPath) fs.unlink(tmpPath, () => {});
    console.error('❌ [GET FILE RAW] Error streaming lesson file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream file' });
    }
  }
}

// Get all curricula (for dropdown/selection)
router.get('/curricula', authenticateToken, async (req, res) => {
  try {
    const curricula = await Curriculum.find({ isActive: true })
      .select('title description level order');
    
    // Sort by custom order: nursery, kinder, preparatory
    const levelOrder = { 'nursery': 1, 'kinder': 2, 'preparatory': 3, 'elementary': 4, 'intermediate': 5, 'advanced': 6 };
    curricula.sort((a, b) => {
      const orderA = levelOrder[a.level] || 99;
      const orderB = levelOrder[b.level] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.order || 0) - (b.order || 0);
    });
    
    res.json(curricula);
  } catch (error) {
    console.error('Error fetching curricula:', error);
    res.status(500).json({ error: 'Failed to fetch curricula' });
  }
});

// Create a new curriculum - Admin/Teacher only
router.post('/curriculum', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { title, description, level, order } = req.body;
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.username === 'admin');
    const createdBy = isAdmin ? (req.user.username || 'admin') : (req.user.teacherId || req.user.userId);

    console.log(`➕ [CREATE CURRICULUM] Creating new curriculum`);
    console.log(`➕ [CREATE CURRICULUM] Title: ${title}`);
    console.log(`➕ [CREATE CURRICULUM] Level: ${level}`);
    console.log(`➕ [CREATE CURRICULUM] Created by: ${createdBy}`);

    if (!title || !level) {
      return res.status(400).json({ error: 'Title and level are required' });
    }

    // Validate level
    const validLevels = ['nursery', 'kinder', 'preparatory', 'elementary', 'intermediate', 'advanced'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ error: `Invalid level. Must be one of: ${validLevels.join(', ')}` });
    }

    // Check if curriculum with same title and level already exists
    const existingCurriculum = await Curriculum.findOne({ 
      title: title.trim(),
      level: level,
      isActive: true 
    });
    if (existingCurriculum) {
      return res.status(400).json({ error: `A curriculum with title "${title}" already exists for level "${level}"` });
    }

    // Create new curriculum
    const curriculum = new Curriculum({
      title: title.trim(),
      description: description || '',
      level: level,
      order: order ? parseInt(order, 10) : 0,
      createdBy,
      isActive: true
    });

    await curriculum.save();
    console.log(`✅ [CREATE CURRICULUM] Curriculum created successfully: ${curriculum._id}`);

    res.json({
      success: true,
      message: 'Curriculum created successfully',
      curriculum: {
        _id: curriculum._id,
        title: curriculum.title,
        description: curriculum.description,
        level: curriculum.level,
        order: curriculum.order
      }
    });
  } catch (error) {
    console.error('❌ [CREATE CURRICULUM] Error creating curriculum:', error);
    res.status(500).json({ error: 'Failed to create curriculum' });
  }
});

// Update an existing curriculum - Admin/Teacher only
router.put('/curriculum/:curriculumId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { curriculumId } = req.params;
    const { title, description, level, order } = req.body;

    const curriculum = await Curriculum.findById(curriculumId);
    if (!curriculum || !curriculum.isActive) {
      return res.status(404).json({ error: 'Curriculum not found' });
    }

    const validLevels = ['nursery', 'kinder', 'preparatory', 'elementary', 'intermediate', 'advanced'];
    const nextTitle = title !== undefined ? String(title).trim() : curriculum.title;
    const nextLevel = level !== undefined ? level : curriculum.level;
    const nextDescription = description !== undefined ? String(description) : curriculum.description;
    const nextOrder = order !== undefined ? parseInt(order, 10) : curriculum.order;

    if (!nextTitle) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!validLevels.includes(nextLevel)) {
      return res.status(400).json({ error: `Invalid level. Must be one of: ${validLevels.join(', ')}` });
    }
    if (Number.isNaN(nextOrder)) {
      return res.status(400).json({ error: 'Display order must be a number' });
    }

    const duplicate = await Curriculum.findOne({
      _id: { $ne: curriculum._id },
      title: nextTitle,
      level: nextLevel,
      isActive: true
    });
    if (duplicate) {
      return res.status(400).json({
        error: `A curriculum with title "${nextTitle}" already exists for level "${nextLevel}"`
      });
    }

    curriculum.title = nextTitle;
    curriculum.description = nextDescription;
    curriculum.level = nextLevel;
    curriculum.order = nextOrder;
    await curriculum.save();

    console.log(`✏️ [UPDATE CURRICULUM] Updated curriculum: ${curriculum._id}`);

    res.json({
      success: true,
      message: 'Curriculum updated successfully',
      curriculum: {
        _id: curriculum._id,
        title: curriculum.title,
        description: curriculum.description,
        level: curriculum.level,
        order: curriculum.order
      }
    });
  } catch (error) {
    console.error('❌ [UPDATE CURRICULUM] Error:', error);
    res.status(500).json({ error: 'Failed to update curriculum' });
  }
});

// Create a new lesson - Admin/Teacher only
// NOTE: This route must come BEFORE /curriculum/:curriculumId/lessons to avoid route conflicts
router.post(
  '/curriculum/:curriculumId/lesson',
  authenticateToken,
  requireTeacher,
  [
    param('curriculumId').isMongoId().withMessage('Invalid curriculum id'),
    body('title').trim().notEmpty().isLength({ max: 300 }),
    body('lessonNumber').isInt({ min: 1, max: 9999 }),
    body('estimatedDuration').optional({ nullable: true }).isInt({ min: 5, max: 600 }),
    body('description').optional().isString().isLength({ max: 20000 }),
    body('teacherNotes').optional().isString().isLength({ max: 100000 }),
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { curriculumId } = req.params;
    const { title, description, lessonNumber, estimatedDuration, teacherNotes } = req.body;
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.username === 'admin');
    const createdBy = isAdmin ? (req.user.username || 'admin') : (req.user.teacherId || req.user.userId);

    console.log(`➕ [CREATE] Creating new lesson for curriculum: ${curriculumId}`);
    console.log(`➕ [CREATE] Title: ${title}`);
    console.log(`➕ [CREATE] Lesson Number: ${lessonNumber}`);
    console.log(`➕ [CREATE] Created by: ${createdBy}`);

    if (!title || !lessonNumber) {
      return res.status(400).json({ error: 'Title and lesson number are required' });
    }

    // Check if curriculum exists
    const Curriculum = require('./models/Curriculum');
    const curriculum = await Curriculum.findById(curriculumId);
    if (!curriculum) {
      return res.status(404).json({ error: 'Curriculum not found' });
    }

    // Check if lesson number already exists in this curriculum
    const existingLesson = await Lesson.findOne({ 
      curriculumId, 
      lessonNumber,
      isActive: true 
    });
    if (existingLesson) {
      return res.status(400).json({ error: `Lesson number ${lessonNumber} already exists in this curriculum` });
    }

    // Create new lesson
    const lesson = new Lesson({
      curriculumId,
      title,
      description: description || '',
      teacherNotes: sanitizeTeacherNotes(teacherNotes),
      lessonNumber: parseInt(lessonNumber, 10),
      order: parseInt(lessonNumber, 10), // Use lesson number as order
      estimatedDuration: estimatedDuration ? parseInt(estimatedDuration, 10) : 30,
      createdBy,
      files: []
    });

    await lesson.save();
    console.log(`✅ [CREATE] Lesson created successfully: ${lesson._id}`);

    res.json({
      success: true,
      message: 'Lesson created successfully',
      lesson: {
        _id: lesson._id,
        title: lesson.title,
        description: lesson.description,
        teacherNotes: lesson.teacherNotes || '',
        lessonNumber: lesson.lessonNumber,
        estimatedDuration: lesson.estimatedDuration
      }
    });
  } catch (error) {
    console.error('❌ [CREATE] Error creating lesson:', error);
    res.status(500).json({ error: 'Failed to create lesson' });
  }
});

// Get lessons for a curriculum
router.get('/curriculum/:curriculumId/lessons', authenticateToken, async (req, res) => {
  try {
    const { curriculumId } = req.params;
    const staff = isStaffUser(req);
    const selectFields = staff
      ? '_id title description lessonNumber order estimatedDuration teacherNotes'
      : '_id title description lessonNumber order estimatedDuration';
    let lessons = await Lesson.find({ 
      curriculumId, 
      isActive: true 
    })
      .sort({ order: 1, lessonNumber: 1 })
      .select(selectFields)
      .lean();
    if (!staff) {
      lessons = lessons.map(({ teacherNotes: _omit, ...rest }) => rest);
    }
    res.json(lessons);
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Get lesson metadata (teacherNotes only for staff — not exposed to students)
router.get('/lesson/:lessonId', authenticateToken, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await Lesson.findById(lessonId)
      .select('_id title description lessonNumber order estimatedDuration teacherNotes')
      .lean();
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    const staff = isStaffUser(req);
    if (!staff) {
      delete lesson.teacherNotes;
    }
    res.json(lesson);
  } catch (error) {
    console.error('Error fetching lesson:', error);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Delete all lessons for a curriculum - Admin only
router.delete('/curriculum/:curriculumId/lessons', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { curriculumId } = req.params;
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.username === 'admin');
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required to delete all lessons' });
    }

    console.log(`🗑️ [DELETE ALL] Deleting all lessons for curriculum: ${curriculumId}`);

    // Check if curriculum exists
    const Curriculum = require('./models/Curriculum');
    const curriculum = await Curriculum.findById(curriculumId);
    if (!curriculum) {
      return res.status(404).json({ error: 'Curriculum not found' });
    }

    // Delete all lessons for this curriculum (soft delete by setting isActive to false, or hard delete)
    const result = await Lesson.deleteMany({ curriculumId });
    console.log(`✅ [DELETE ALL] Deleted ${result.deletedCount} lesson(s) for curriculum ${curriculumId}`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} lesson(s)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ [DELETE ALL] Error deleting lessons:', error);
    res.status(500).json({ error: 'Failed to delete lessons' });
  }
});

// Delete a single lesson - Admin only
router.delete('/lesson/:lessonId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.username === 'admin');
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required to delete lessons' });
    }

    console.log(`🗑️ [DELETE] Deleting lesson: ${lessonId}`);

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    await Lesson.deleteOne({ _id: lessonId });
    console.log(`✅ [DELETE] Lesson deleted successfully: ${lessonId}`);

    res.json({
      success: true,
      message: 'Lesson deleted successfully'
    });
  } catch (error) {
    console.error('❌ [DELETE] Error deleting lesson:', error);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

// Update lesson details (title, description, estimatedDuration) - Admin/Teacher only
// NOTE: This route must come BEFORE /lesson/:lessonId/files to avoid route conflicts
router.put(
  '/lesson/:lessonId',
  authenticateToken,
  requireTeacher,
  [
    param('lessonId').isMongoId().withMessage('Invalid lesson id'),
    body('title').optional().trim().notEmpty().isLength({ max: 300 }),
    body('description').optional().isString().isLength({ max: 20000 }),
    body('estimatedDuration').optional({ nullable: true }).isInt({ min: 5, max: 600 }),
    body('teacherNotes').optional().isString().isLength({ max: 100000 }),
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { lessonId } = req.params;
    const { title, description, estimatedDuration, teacherNotes } = req.body;

    console.log(`📝 [UPDATE] Updating lesson: ${lessonId}`);
    console.log(`📝 [UPDATE] Title: ${title}`);
    console.log(`📝 [UPDATE] Description: ${description?.substring(0, 50)}...`);
    console.log(`📝 [UPDATE] Duration: ${estimatedDuration} minutes`);

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      console.error(`❌ [UPDATE] Lesson not found: ${lessonId}`);
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Update fields if provided
    if (title !== undefined) lesson.title = title;
    if (description !== undefined) lesson.description = description;
    if (estimatedDuration !== undefined) lesson.estimatedDuration = estimatedDuration;
    if (teacherNotes !== undefined) lesson.teacherNotes = sanitizeTeacherNotes(teacherNotes);

    await lesson.save();
    console.log(`✅ [UPDATE] Lesson updated successfully: ${lessonId}`);

    res.json({ 
      success: true, 
      message: 'Lesson updated successfully',
      lesson: {
        _id: lesson._id,
        title: lesson.title,
        description: lesson.description,
        teacherNotes: lesson.teacherNotes || '',
        estimatedDuration: lesson.estimatedDuration
      }
    });
  } catch (error) {
    console.error('❌ [UPDATE] Error updating lesson:', error);
    res.status(500).json({ error: 'Failed to update lesson' });
  }
});

// Get lesson files for a lesson (from embedded files array)
// Query param ?withData=true to include fileData for classroom use
router.get('/lesson/:lessonId/files', authenticateToken, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const withData = req.query.withData === 'true';
    console.log(`📚 [GET FILES] Fetching files for lesson: ${lessonId}, withData: ${withData}`);
    
    const lesson = await Lesson.findById(lessonId).select('files');
    if (!lesson) {
      console.error(`❌ [GET FILES] Lesson not found: ${lessonId}`);
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    const filesArray = lesson.files || [];
    console.log(`📚 [GET FILES] Found ${filesArray.length} file(s) in lesson "${lesson.title || lessonId}"`);
    
    if (filesArray.length > 0) {
      console.log(`📚 [GET FILES] Files:`, filesArray.map(f => ({
        _id: f._id,
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: f.fileSize,
        hasData: !!f.fileData,
        dataLength: f.fileData?.length || 0
      })));
    }
    
    // Return files with or without fileData based on query param
    const files = filesArray.map(file => {
      const baseFile = {
        _id: file._id,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        uploadedBy: file.uploadedBy,
        uploadedAt: file.uploadedAt
      };
      
      if (withData) {
        baseFile.fileData = file.fileData;
        baseFile.id = file._id.toString(); // Add id for compatibility
        baseFile.name = file.fileName;
        baseFile.type = file.fileType;
        baseFile.size = file.fileSize;
        baseFile.data = file.fileData; // Add data for compatibility
      }
      
      return baseFile;
    });
    
    res.json(files);
  } catch (error) {
    console.error('❌ [GET FILES] Error fetching lesson files:', error);
    res.status(500).json({ error: 'Failed to fetch lesson files' });
  }
});

// Stream PDF from a temp file (fs.createReadStream) so Range requests work; PDFs are stored in Mongo as base64.
router.get('/lesson-file/:fileId/raw', authenticateToken, handleLessonPdfRaw);
router.head('/lesson-file/:fileId/raw', authenticateToken, handleLessonPdfRaw);

// Get a specific lesson file (with data) - from embedded files array
router.get('/lesson-file/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`📄 [GET FILE] Fetching file data for file ID: ${fileId}`);

    const lesson = await Lesson.findOne(
      { 'files._id': fileId },
      { 'files.$': 1 }
    );
    if (!lesson || !lesson.files || lesson.files.length === 0) {
      console.error(`❌ [GET FILE] File not found in any lesson: ${fileId}`);
      return res.status(404).json({ error: 'File not found' });
    }

    const file = lesson.files[0];
    console.log(`✅ [GET FILE] File found:`, {
      _id: file._id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      hasData: !!file.fileData,
      dataLength: file.fileData?.length || 0
    });

    res.set('Cache-Control', 'public, max-age=86400');

    res.json({
      _id: file._id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      fileData: file.fileData,
      uploadedBy: file.uploadedBy,
      uploadedAt: file.uploadedAt,
      isPermanent: file.isPermanent
    });
  } catch (error) {
    console.error('❌ [GET FILE] Error fetching lesson file:', error);
    res.status(500).json({ error: 'Failed to fetch lesson file' });
  }
});

// Upload lesson file (teacher only) - add to embedded files array
router.post('/lesson/:lessonId/upload-file', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { fileName, fileType, fileSize, fileData } = req.body;
    const teacherId = req.user.teacherId || req.user.userId;
    const isAdmin = req.user && (req.user.isAdmin === true || req.user.role === 'admin' || req.user.username === 'admin');
    const uploadedBy = isAdmin ? (req.user.username || 'admin') : (teacherId || req.user.userId);

    console.log(`📤 [UPLOAD] ========== Uploading file to lesson ==========`);
    console.log(`📤 [UPLOAD] Lesson ID: ${lessonId}`);
    console.log(`📤 [UPLOAD] File name: ${fileName}`);
    console.log(`📤 [UPLOAD] File type: ${fileType}`);
    console.log(`📤 [UPLOAD] File size: ${fileSize} bytes`);
    console.log(`📤 [UPLOAD] File data length: ${fileData?.length || 0} bytes`);
    console.log(`📤 [UPLOAD] Uploaded by: ${uploadedBy} (${isAdmin ? 'admin' : 'teacher'})`);

    if (!fileName || !fileType || !fileData) {
      console.error('❌ [UPLOAD] Missing required fields:', { 
        hasFileName: !!fileName, 
        hasFileType: !!fileType, 
        hasFileData: !!fileData 
      });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      console.error(`❌ [UPLOAD] Lesson not found: ${lessonId}`);
      return res.status(404).json({ error: 'Lesson not found' });
    }

    console.log(`✅ [UPLOAD] Lesson found: ${lesson.title}`);
    console.log(`📚 [UPLOAD] Current files count: ${lesson.files?.length || 0}`);

    // Initialize files array if it doesn't exist
    if (!lesson.files) {
      lesson.files = [];
      console.log('📚 [UPLOAD] Initialized empty files array');
    }

    // Check MongoDB document size limit (16MB)
    const estimatedDocSize = JSON.stringify(lesson).length + fileData.length;
    const maxDocSize = 16 * 1024 * 1024; // 16MB
    if (estimatedDocSize > maxDocSize) {
      console.error(`❌ [UPLOAD] File too large! Estimated document size: ${(estimatedDocSize / 1024 / 1024).toFixed(2)} MB (max: 16 MB)`);
      return res.status(400).json({ 
        error: `File is too large. The lesson document would exceed MongoDB's 16MB limit. Please use a smaller file or split the lesson.` 
      });
    }
    
    // Add file to embedded files array
    const newFile = {
      fileName,
      fileType,
      fileSize: fileSize || 0,
      fileData,
      uploadedBy: uploadedBy,
      isPermanent: false
    };
    
    console.log('📚 [UPLOAD] Adding file to lesson.files array...');
    lesson.files.push(newFile);
    console.log(`📚 [UPLOAD] Files array now has ${lesson.files.length} file(s)`);
    
    console.log('💾 [UPLOAD] Saving lesson to database...');
    try {
      await lesson.save();
      console.log('✅ [UPLOAD] Lesson saved successfully');
    } catch (saveError) {
      console.error('❌ [UPLOAD] Error saving lesson:', saveError);
      // Check if it's a size error
      if (saveError.message && saveError.message.includes('too large')) {
        console.error('❌ [UPLOAD] MongoDB document size limit exceeded!');
        return res.status(400).json({ 
          error: `File is too large. The lesson document exceeds MongoDB's 16MB limit. Please use a smaller file.` 
        });
      }
      throw saveError;
    }
    
    // Refresh the lesson from database to verify the save
    const savedLesson = await Lesson.findById(lessonId).select('files');
    const savedFilesCount = savedLesson?.files?.length || 0;
    console.log(`✅ [UPLOAD] Verified: Lesson now has ${savedFilesCount} file(s) in database`);
    
    if (savedFilesCount !== lesson.files.length) {
      console.error(`❌ [UPLOAD] MISMATCH! Saved count (${savedFilesCount}) != expected count (${lesson.files.length})`);
    }
    
    // Verify the specific file was saved
    const savedFile = savedLesson.files[savedLesson.files.length - 1];
    if (!savedFile || !savedFile.fileData) {
      console.error(`❌ [UPLOAD] CRITICAL: Saved file is missing data!`, {
        hasFile: !!savedFile,
        hasData: !!(savedFile?.fileData),
        dataLength: savedFile?.fileData?.length || 0
      });
    } else {
      console.log(`✅ [UPLOAD] Verified: Last file has data (${savedFile.fileData.length} bytes)`);
    }
    
    // Get the newly added file (last one in array)
    const addedFile = savedLesson.files[savedLesson.files.length - 1];
    
    console.log('✅ [UPLOAD] File upload complete:', {
      fileId: addedFile._id,
      fileName: addedFile.fileName,
      fileType: addedFile.fileType,
      fileSize: addedFile.fileSize,
      hasData: !!addedFile.fileData,
      dataLength: addedFile.fileData?.length || 0
    });
    
    // Return the file WITHOUT fileData to save bandwidth (client should fetch separately)
    res.json({ 
      message: 'File uploaded successfully', 
      file: {
        _id: addedFile._id,
        fileName: addedFile.fileName,
        fileType: addedFile.fileType,
        fileSize: addedFile.fileSize,
        uploadedBy: addedFile.uploadedBy,
        uploadedAt: addedFile.uploadedAt,
        isPermanent: addedFile.isPermanent
      }
    });
  } catch (error) {
    console.error('❌ [UPLOAD] Error uploading lesson file:', error);
    console.error('❌ [UPLOAD] Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Delete lesson file (teacher or admin) - remove from embedded files array
router.delete('/lesson-file/:fileId', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { fileId } = req.params;
    const teacherId = req.user.teacherId || req.user.userId;
    // Check for admin - be more explicit about the check
    const isAdmin = req.user && (
      req.user.isAdmin === true || 
      req.user.isAdmin === 'true' ||
      req.user.role === 'admin' || 
      (req.user.username && req.user.username.toLowerCase() === 'admin')
    );
    
    console.log('🗑️ [DELETE] Delete request for file:', fileId);
    console.log('🗑️ [DELETE] Full req.user object:', JSON.stringify(req.user, null, 2));
    console.log('🗑️ [DELETE] User info:', {
      username: req.user?.username,
      isAdmin: req.user?.isAdmin,
      role: req.user?.role,
      teacherId: req.user?.teacherId,
      userId: req.user?.userId,
      isAdminCheck: isAdmin
    });
    
    const lesson = await Lesson.findOne({ 'files._id': fileId });
    if (!lesson) {
      console.log('❌ [DELETE] Lesson not found for file:', fileId);
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = lesson.files.id(fileId);
    if (!file) {
      console.log('❌ [DELETE] File not found in lesson:', fileId);
      return res.status(404).json({ error: 'File not found' });
    }
    
    console.log('🗑️ [DELETE] File found:', {
      fileName: file.fileName,
      uploadedBy: file.uploadedBy,
      teacherId: teacherId,
      isAdmin: isAdmin
    });
    
    // Admin can delete any file - bypass ownership check
    if (isAdmin) {
      console.log('✅ [DELETE] Admin user - allowing deletion regardless of uploader');
    } else if (file.uploadedBy !== teacherId) {
      console.log('❌ [DELETE] Authorization failed:', {
        isAdmin,
        fileUploadedBy: file.uploadedBy,
        userTeacherId: teacherId
      });
      return res.status(403).json({ error: 'Not authorized to delete this file' });
    }
    
    // Check if file is marked as permanent
    if (file.isPermanent && !isAdmin) {
      // Teachers can delete permanent files they uploaded, admins can delete any
      console.log(`⚠️ Deleting permanent file ${fileId} uploaded by ${file.uploadedBy}`);
    }
    
    // Remove file from embedded array
    lesson.files.pull(fileId);
    await lesson.save();
    
    console.log(`✅ File ${fileId} deleted successfully by ${isAdmin ? 'admin' : 'teacher'}`);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting lesson file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get student's lesson progress
router.get('/progress/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const progress = await LessonProgress.find({ studentId })
      .populate('lessonId', 'title lessonNumber')
      .populate('curriculumId', 'title level')
      .sort({ createdAt: -1 });
    res.json(progress);
  } catch (error) {
    console.error('Error fetching lesson progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Update lesson progress (teacher marks as completed)
router.post('/progress/update', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { studentId, lessonId, curriculumId, bookingId, status, notes } = req.body;
    const teacherId = req.user.teacherId || req.user.userId;

    if (!studentId || !lessonId || !curriculumId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const progress = await LessonProgress.findOneAndUpdate(
      { studentId, lessonId },
      {
        studentId,
        lessonId,
        curriculumId,
        bookingId,
        status: status || 'completed',
        completedAt: status === 'completed' ? new Date() : null,
        teacherId,
        notes: notes || ''
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Progress updated successfully', progress });
  } catch (error) {
    console.error('Error updating lesson progress:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// Get full curriculum with lessons and progress (for student/teacher view)
router.get('/curriculum/:curriculumId/full', authenticateToken, async (req, res) => {
  try {
    const { curriculumId } = req.params;
    const studentId = req.user.studentId || req.query.studentId;
    
    const curriculum = await Curriculum.findById(curriculumId);
    if (!curriculum) {
      return res.status(404).json({ error: 'Curriculum not found' });
    }

    const lessons = await Lesson.find({ curriculumId, isActive: true })
      .sort({ order: 1, lessonNumber: 1 });

    let progress = [];
    if (studentId) {
      progress = await LessonProgress.find({ 
        studentId, 
        curriculumId 
      }).select('lessonId status completedAt');
    }

    // Map progress to lessons
    const lessonsWithProgress = lessons.map(lesson => {
      const lessonProgress = progress.find(p => 
        p.lessonId.toString() === lesson._id.toString()
      );
      return {
        ...lesson.toObject(),
        progress: lessonProgress ? {
          status: lessonProgress.status,
          completedAt: lessonProgress.completedAt
        } : { status: 'not_started' }
      };
    });

    res.json({
      curriculum,
      lessons: lessonsWithProgress
    });
  } catch (error) {
    console.error('Error fetching full curriculum:', error);
    res.status(500).json({ error: 'Failed to fetch curriculum' });
  }
});

module.exports = router;

