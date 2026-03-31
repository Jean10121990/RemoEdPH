/**
 * QA classroom recordings: chunked WebM upload (teacher or student token),
 * admin-only listing/download/delete. Designed for low bitrate client capture
 * so live WebRTC stays primary (see public/js/classroom-qa-recording.js).
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
let ffmpegStatic = null;
try {
  ffmpegStatic = require('ffmpeg-static');
} catch (e) {
  ffmpegStatic = null;
}
const ClassroomRecording = require('./models/ClassroomRecording');
const Booking = require('./models/Booking');
const { verifyToken, requireAdmin } = require('./authMiddleware');

const UPLOAD_DIR = path.join(__dirname, '../uploads/classroom-recordings');
const RETENTION_DAYS = Number(process.env.CLASSROOM_RECORDING_RETENTION_DAYS || 7);
const MAX_FILE_BYTES = Number(process.env.CLASSROOM_RECORDING_MAX_MB || 120) * 1024 * 1024;

const router = express.Router();

/**
 * MediaRecorder chunk appends can produce WebM files with poor seek metadata.
 * Remuxing at finalize writes proper index/cues so players can fast-forward.
 */
async function remuxSeekableWebm(filePath) {
  const ffmpegBin = process.env.CLASSROOM_RECORDING_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
  const tempOut = `${filePath}.seekable.webm`;

  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const args = [
      '-y',
      '-i', filePath,
      '-map', '0',
      '-c', 'copy',
      '-fflags', '+genpts',
      tempOut
    ];

    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    const killTimer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (e) {
        // ignore
      }
      done(false);
    }, 120000);

    proc.on('error', () => {
      clearTimeout(killTimer);
      done(false);
    });

    proc.on('close', async (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        try {
          await fsp.unlink(tempOut);
        } catch (e) {
          // ignore
        }
        return done(false);
      }
      try {
        const st = await fsp.stat(tempOut);
        if (!st.size) throw new Error('empty remux output');
        await fsp.rename(tempOut, filePath);
        done(true);
      } catch (e) {
        try {
          await fsp.unlink(tempOut);
        } catch (err) {
          // ignore
        }
        done(false);
      }
    });
  });
}

/**
 * Convert uploaded WebM chunks to MP4 for better seek support in players.
 * Returns absolute MP4 path on success, or null on failure.
 */
async function transcodeWebmToMp4(filePath) {
  const ffmpegBin = process.env.CLASSROOM_RECORDING_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
  const outPath = filePath.replace(/\.[^./\\]+$/, '.mp4');
  if (outPath === filePath) return null;

  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const args = [
      '-y',
      '-i', filePath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '30',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '64k',
      '-movflags', '+faststart',
      outPath
    ];

    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    const killTimer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (e) {
        // ignore
      }
      done(null);
    }, 180000);

    proc.on('error', () => {
      clearTimeout(killTimer);
      done(null);
    });

    proc.on('close', async (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        try {
          await fsp.unlink(outPath);
        } catch (e) {
          // ignore
        }
        return done(null);
      }
      try {
        const st = await fsp.stat(outPath);
        if (!st.size) throw new Error('empty transcode output');
        done(outPath);
      } catch (e) {
        try {
          await fsp.unlink(outPath);
        } catch (err) {
          // ignore
        }
        done(null);
      }
    });
  });
}

function uploaderKey(req) {
  if (req.user?.teacherId) return `teacher:${String(req.user.teacherId)}`;
  if (req.user?.studentId) return `student:${String(req.user.studentId)}`;
  return null;
}

function requireTeacherOrStudent(req, res, next) {
  if (uploaderKey(req)) return next();
  return res.status(403).json({ success: false, message: 'Teacher or student session required.' });
}

/**
 * FFmpeg remux/transcode after the HTTP response — prevents nginx/proxy 504 on /complete.
 */
function scheduleRecordingPostProcess(recordingId, sourceMime) {
  const id = String(recordingId);
  const mime = String(sourceMime || '');
  setImmediate(() => {
    (async () => {
      if (!/webm/i.test(mime)) return;
      try {
        const doc = await ClassroomRecording.findById(id);
        if (!doc || doc.status !== 'complete') return;
        const currentAbs = path.join(__dirname, '../uploads', doc.relativePath);
        if (!fs.existsSync(currentAbs)) return;

        const mp4Abs = await transcodeWebmToMp4(currentAbs);
        if (mp4Abs) {
          const oldAbs = currentAbs;
          const newRel = doc.relativePath.replace(/\.[^./\\]+$/, '.mp4');
          doc.relativePath = newRel;
          doc.mimeType = 'video/mp4';
          await doc.save();
          try {
            await fsp.unlink(oldAbs);
          } catch (e) {
            /* ignore */
          }
          return;
        }
        const remuxed = await remuxSeekableWebm(currentAbs);
        if (!remuxed) {
          console.warn('classroom-recording remux skipped/failed for', id);
        }
      } catch (e) {
        console.warn('classroom-recording post-process', id, e.message);
      }
    })().catch((err) => {
      console.warn('classroom-recording post-process async', id, err.message);
    });
  });
}

/** Start upload session — returns id for chunk + complete URLs */
router.post(
  '/classroom-recording/session',
  verifyToken,
  requireTeacherOrStudent,
  async (req, res) => {
    try {
      const { roomId, bookingId } = req.body || {};
      if (!roomId || String(roomId).trim() === '') {
        return res.status(400).json({ success: false, message: 'roomId is required' });
      }

      let teacherId = req.user.teacherId ? String(req.user.teacherId) : null;
      let recordedByRole = req.user.teacherId ? 'teacher' : 'student';

      if (!teacherId && bookingId) {
        const b = await Booking.findById(bookingId).lean();
        if (b && b.teacherId) teacherId = String(b.teacherId);
      }

      const uploader = uploaderKey(req);
      const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86400000);
      const fileBase = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const relativePath = `classroom-recordings/${fileBase}.webm`;
      const absPath = path.join(__dirname, '../uploads', relativePath);

      // Close any stale in-progress uploads for the same class/uploader.
      // This keeps one active recording session per class side (teacher/student)
      // and avoids duplicate rows when Start is clicked multiple times.
      const staleFilter = {
        status: 'uploading',
        recordedByUploaderKey: uploader,
        roomId: String(roomId).trim()
      };
      if (bookingId) staleFilter.bookingId = String(bookingId);
      const stale = await ClassroomRecording.find(staleFilter).lean();
      for (const s of stale) {
        try {
          const staleAbs = path.join(__dirname, '../uploads', s.relativePath);
          await fsp.unlink(staleAbs).catch(() => {});
          await ClassroomRecording.deleteOne({ _id: s._id });
        } catch (e) {
          console.warn('Failed to clear stale recording session', s._id, e.message);
        }
      }

      await fsp.mkdir(UPLOAD_DIR, { recursive: true });
      await fsp.writeFile(absPath, Buffer.alloc(0));

      const doc = await ClassroomRecording.create({
        roomId: String(roomId).trim(),
        bookingId: bookingId ? String(bookingId) : null,
        teacherId,
        recordedByRole,
        recordedByUploaderKey: uploader,
        relativePath,
        mimeType: 'video/webm',
        expiresAt,
        status: 'uploading',
        sizeBytes: 0
      });

      res.json({
        success: true,
        recordingId: doc._id.toString(),
        expiresAt,
        retentionDays: RETENTION_DAYS,
        maxBytes: MAX_FILE_BYTES
      });
    } catch (err) {
      console.error('classroom-recording session:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to start session' });
    }
  }
);

/** Append binary chunk (use sparingly; client should use ~15–30s timeslices) */
router.put(
  '/classroom-recording/session/:id/chunk',
  verifyToken,
  requireTeacherOrStudent,
  express.raw({ type: '*/*', limit: '24mb' }),
  async (req, res) => {
    try {
      const id = req.params.id;
      const doc = await ClassroomRecording.findById(id);
      if (!doc || doc.status === 'failed') {
        return res.status(404).json({ success: false, message: 'Recording not found' });
      }
      if (doc.recordedByUploaderKey !== uploaderKey(req)) {
        return res.status(403).json({ success: false, message: 'Not your upload session' });
      }
      if (doc.status !== 'uploading') {
        return res.status(400).json({ success: false, message: 'Upload already finalized' });
      }

      const abs = path.join(__dirname, '../uploads', doc.relativePath);
      const chunk = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      const nextSize = doc.sizeBytes + chunk.length;
      if (nextSize > MAX_FILE_BYTES) {
        return res.status(413).json({ success: false, message: 'Recording exceeds maximum size' });
      }

      await fsp.appendFile(abs, chunk);
      doc.sizeBytes = nextSize;
      await doc.save();

      res.json({ success: true, bytesReceived: chunk.length, totalBytes: doc.sizeBytes });
    } catch (err) {
      console.error('classroom-recording chunk:', err);
      res.status(500).json({ success: false, message: err.message || 'Chunk failed' });
    }
  }
);

router.post(
  '/classroom-recording/session/:id/complete',
  verifyToken,
  requireTeacherOrStudent,
  async (req, res) => {
    try {
      const id = req.params.id;
      const doc = await ClassroomRecording.findById(id);
      if (!doc) {
        return res.status(404).json({ success: false, message: 'Recording not found' });
      }
      if (doc.recordedByUploaderKey !== uploaderKey(req)) {
        return res.status(403).json({ success: false, message: 'Not your upload session' });
      }

      const { durationSec, mimeType } = req.body || {};
      const abs = path.join(__dirname, '../uploads', doc.relativePath);
      let st;
      try {
        st = await fsp.stat(abs);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Recording file missing' });
      }

      const sourceMime = String(mimeType || doc.mimeType || '');
      doc.status = 'complete';
      doc.sizeBytes = st.size;
      doc.durationSec = durationSec != null ? Number(durationSec) : null;
      if (!doc.mimeType && mimeType) doc.mimeType = String(mimeType);
      await doc.save();

      res.json({ success: true, recordingId: doc._id.toString(), sizeBytes: doc.sizeBytes });

      scheduleRecordingPostProcess(doc._id.toString(), sourceMime);
    } catch (err) {
      console.error('classroom-recording complete:', err);
      res.status(500).json({ success: false, message: err.message || 'Complete failed' });
    }
  }
);

router.post(
  '/classroom-recording/session/:id/abort',
  verifyToken,
  requireTeacherOrStudent,
  async (req, res) => {
    try {
      const id = req.params.id;
      const doc = await ClassroomRecording.findById(id);
      if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
      if (doc.recordedByUploaderKey !== uploaderKey(req)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const abs = path.join(__dirname, '../uploads', doc.relativePath);
      try {
        await fsp.unlink(abs);
      } catch (e) {
        /* ignore */
      }
      await ClassroomRecording.deleteOne({ _id: doc._id });
      res.json({ success: true });
    } catch (err) {
      console.error('classroom-recording abort:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/** Optional: expose config for live-classroom to decide whether to show QA recording UI */
router.get('/classroom-recording/config', (req, res) => {
  res.json({
    // On by default; set CLASSROOM_QA_RECORDING_ENABLED=false to hide QA recording UI
    enabled: String(process.env.CLASSROOM_QA_RECORDING_ENABLED || '').toLowerCase() !== 'false',
    maxDurationMinutes: Number(process.env.CLASSROOM_QA_RECORDING_MAX_MINUTES || 25),
    retentionDays: RETENTION_DAYS
  });
});

// ——— Admin-only: list / download / delete / purge ———

router.get('/admin/classroom-recordings', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { date, limit } = req.query || {};
    const q = {};
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      const d = String(date);
      q.createdAt = {
        $gte: new Date(`${d}T00:00:00.000Z`),
        $lte: new Date(`${d}T23:59:59.999Z`)
      };
    }
    const lim = Math.min(Number(limit) || 200, 500);
    const rows = await ClassroomRecording.find(q)
      .sort({ createdAt: -1 })
      .limit(lim)
      .lean();
    res.json({
      success: true,
      recordings: rows.map((r) => ({
        id: r._id.toString(),
        roomId: r.roomId,
        bookingId: r.bookingId,
        teacherId: r.teacherId,
        recordedByRole: r.recordedByRole,
        status: r.status,
        sizeBytes: r.sizeBytes,
        durationSec: r.durationSec,
        mimeType: r.mimeType,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        relativePath: r.relativePath
      }))
    });
  } catch (err) {
    console.error('admin list classroom-recordings:', err);
    res.status(500).json({ success: false, message: err.message || 'List failed' });
  }
});

router.get('/admin/classroom-recordings/:id/download', verifyToken, requireAdmin, async (req, res) => {
  try {
    const doc = await ClassroomRecording.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const abs = path.join(__dirname, '../uploads', doc.relativePath);
    if (!fs.existsSync(abs)) return res.status(404).json({ success: false, message: 'File missing' });
    const ext = /mp4/i.test(String(doc.mimeType || '')) || /\.mp4$/i.test(doc.relativePath || '') ? 'mp4' : 'webm';
    const safeName = `classroom-${doc.roomId}-${doc._id}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', doc.mimeType || (ext === 'mp4' ? 'video/mp4' : 'video/webm'));
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    console.error('admin download classroom-recording:', err);
    res.status(500).json({ success: false, message: err.message || 'Download failed' });
  }
});

router.delete('/admin/classroom-recordings/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const doc = await ClassroomRecording.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const abs = path.join(__dirname, '../uploads', doc.relativePath);
    try {
      await fsp.unlink(abs);
    } catch (e) {
      /* ignore */
    }
    await ClassroomRecording.deleteOne({ _id: doc._id });
    res.json({ success: true });
  } catch (err) {
    console.error('admin delete classroom-recording:', err);
    res.status(500).json({ success: false, message: err.message || 'Delete failed' });
  }
});

router.post('/admin/classroom-recordings/purge-expired', verifyToken, requireAdmin, async (req, res) => {
  try {
    const n = await purgeExpiredClassroomRecordings();
    res.json({ success: true, removed: n });
  } catch (err) {
    console.error('admin purge classroom-recordings:', err);
    res.status(500).json({ success: false, message: err.message || 'Purge failed' });
  }
});

/** Delete files older than expiresAt (call from cron or admin) */
async function purgeExpiredClassroomRecordings() {
  const now = new Date();
  const expired = await ClassroomRecording.find({ expiresAt: { $lt: now } }).lean();
  let removed = 0;
  for (const r of expired) {
    try {
      const abs = path.join(__dirname, '../uploads', r.relativePath);
      await fsp.unlink(abs).catch(() => {});
      await ClassroomRecording.deleteOne({ _id: r._id });
      removed += 1;
    } catch (e) {
      console.warn('Purge recording failed', r._id, e.message);
    }
  }
  if (removed) console.log(`🧹 Classroom recordings purge: removed ${removed} expired file(s)`);
  return removed;
}

module.exports = router;
module.exports.purgeExpiredClassroomRecordings = purgeExpiredClassroomRecordings;
