const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const File = require('./models/File');
const { fileUploadLimiter } = require('./middleware/apiRateLimits');

const router = express.Router();

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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + crypto.randomInt(0, 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
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

// Upload file (limiter on handler so all mount prefixes share one cap, e.g. /api/upload and /api/files/upload)
router.post('/upload', fileUploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { room, uploader } = req.body;
    
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

    const filePath = path.join(uploadsDir, file.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(filePath, file.originalName);

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

    const filePath = path.join(uploadsDir, file.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set appropriate headers for inline viewing
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', 'inline; filename="' + file.originalName + '"');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
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

    // Delete file from disk
    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
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