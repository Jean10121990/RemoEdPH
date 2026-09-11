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
const os = require('os');
const { spawn } = require('child_process');
let ffmpegStatic = null;
try {
  ffmpegStatic = require('ffmpeg-static');
} catch (e) {
  ffmpegStatic = null;
}
const ClassroomRecording = require('./models/ClassroomRecording');
const RecordingDownloadTicket = require('./models/RecordingDownloadTicket');
const Booking = require('./models/Booking');
const {
  verifyToken,
  verifyAdminApiAuth,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requireAdminQaOrSuper,
} = require('./authMiddleware');
const {
  putUpload,
  putUploadFromFile,
  concatenateUploads,
  listUploadsByPrefix,
  downloadToFile,
  findUpload,
  openDownloadStream,
  deleteUpload,
} = require('./services/uploadStore');

/** Admin list/download/delete for recordings — QA + Super-Admin only (matches QA Hub UI). */
const adminRecordingAuthChain = [
  verifyAdminApiAuth,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requireAdminQaOrSuper,
];

/**
 * Short-lived download tickets. These let the browser pull a recording with a plain
 * navigation (native progress bar, resumable, no in-memory buffering) without putting the
 * admin JWT in a URL where it would land in proxy/access logs. Valid for the whole TTL
 * rather than one use, so a browser retry or resumed transfer still authenticates.
 */
const DOWNLOAD_TICKET_TTL_MS = 2 * 60 * 1000;

async function issueDownloadTicket(recordingId) {
  const ticket = crypto.randomBytes(24).toString('hex');
  await RecordingDownloadTicket.create({
    token: ticket,
    recordingId: String(recordingId),
    expiresAt: new Date(Date.now() + DOWNLOAD_TICKET_TTL_MS),
  });
  return ticket;
}

async function downloadTicketValid(recordingId, ticket) {
  const key = String(ticket || '');
  if (!key) return false;
  const row = await RecordingDownloadTicket.findOne({ token: key }).lean();
  if (!row) return false;
  if (row.expiresAt <= new Date()) {
    await RecordingDownloadTicket.deleteOne({ token: key }).catch(() => {});
    return false;
  }
  return row.recordingId === String(recordingId || '');
}

const RETENTION_DAYS = Number(process.env.CLASSROOM_RECORDING_RETENTION_DAYS || 7);
const MAX_FILE_BYTES = Number(process.env.CLASSROOM_RECORDING_MAX_MB || 120) * 1024 * 1024;

function partsPrefix(recordingId) {
  return `classroom-recordings/${String(recordingId)}/parts`;
}

function partRelativePath(recordingId, seq) {
  return `${partsPrefix(recordingId)}/part-${String(seq).padStart(6, '0')}`;
}

async function deleteRecordingStorage(doc) {
  if (!doc) return;
  const rel = String(doc.relativePath || '').replace(/\\/g, '/').replace(/^\//, '');
  if (rel) {
    await deleteUpload(rel).catch(() => {});
    await fsp.unlink(path.join(__dirname, '../uploads', rel)).catch(() => {});
  }
  const parts = await listUploadsByPrefix(partsPrefix(doc._id)).catch(() => []);
  for (const p of parts) {
    await deleteUpload(p.filename).catch(() => {});
  }
}

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
        const currentAbs = path.join(os.tmpdir(), `remoed-rec-${id}${path.extname(doc.relativePath || '.webm')}`);
        try {
          await downloadToFile(doc.relativePath, currentAbs);
        } catch (_missing) {
          const diskAbs = path.join(__dirname, '../uploads', doc.relativePath);
          if (!fs.existsSync(diskAbs)) return;
          await fsp.copyFile(diskAbs, currentAbs);
        }

        const mp4Abs = await transcodeWebmToMp4(currentAbs);
        if (mp4Abs) {
          const newRel = doc.relativePath.replace(/\.[^./\\]+$/, '.mp4');
          await putUploadFromFile(newRel, mp4Abs, 'video/mp4');
          if (newRel !== doc.relativePath) await deleteUpload(doc.relativePath).catch(() => {});
          doc.relativePath = newRel;
          doc.mimeType = 'video/mp4';
          try {
            doc.sizeBytes = (await fsp.stat(mp4Abs)).size;
          } catch (_e) {}
          await doc.save();
          await fsp.unlink(currentAbs).catch(() => {});
          await fsp.unlink(mp4Abs).catch(() => {});
          return;
        }
        const remuxed = await remuxSeekableWebm(currentAbs);
        if (remuxed) {
          await putUploadFromFile(doc.relativePath, currentAbs, doc.mimeType || 'video/webm');
        } else {
          console.warn('classroom-recording remux skipped/failed for', id);
        }
        await fsp.unlink(currentAbs).catch(() => {});
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
          await deleteRecordingStorage(s);
          await ClassroomRecording.deleteOne({ _id: s._id });
        } catch (e) {
          console.warn('Failed to clear stale recording session', s._id, e.message);
        }
      }

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
        sizeBytes: 0,
        chunkCount: 0
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

      const chunk = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      const nextSize = doc.sizeBytes + chunk.length;
      if (nextSize > MAX_FILE_BYTES) {
        return res.status(413).json({ success: false, message: 'Recording exceeds maximum size' });
      }

      const headerSeq = Number(req.get('x-chunk-index'));
      let seq;
      if (Number.isFinite(headerSeq) && headerSeq >= 0) {
        seq = Math.floor(headerSeq);
        doc.chunkCount = Math.max(doc.chunkCount || 0, seq + 1);
      } else {
        seq = doc.chunkCount || 0;
        doc.chunkCount = seq + 1;
      }

      await putUpload(partRelativePath(doc._id, seq), chunk, 'application/octet-stream');
      doc.sizeBytes = nextSize;
      doc.lastChunkAt = new Date();
      await doc.save();

      res.json({ success: true, bytesReceived: chunk.length, totalBytes: doc.sizeBytes, seq });
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
      const parts = await listUploadsByPrefix(partsPrefix(doc._id));
      const partRels = parts
        .map((p) => p.filename)
        .filter((n) => /\/part-\d+$/.test(n) || /part-\d+$/.test(n))
        .sort();
      if (!partRels.length) {
        const diskAbs = path.join(__dirname, '../uploads', doc.relativePath);
        try {
          const st = await fsp.stat(diskAbs);
          if (!st.size) throw new Error('empty');
        } catch (e) {
          return res.status(400).json({ success: false, message: 'Recording file missing' });
        }
      } else {
        await concatenateUploads(partRels, doc.relativePath, 'video/webm');
        for (const rel of partRels) {
          await deleteUpload(rel).catch(() => {});
        }
      }

      const stored = await findUpload(doc.relativePath);
      const sourceMime = String(mimeType || doc.mimeType || '');
      doc.status = 'complete';
      doc.sizeBytes = stored && stored.length ? stored.length : doc.sizeBytes;
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
      await deleteRecordingStorage(doc);
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
    retentionDays: RETENTION_DAYS,
    maxBytes: MAX_FILE_BYTES
  });
});

// ——— Admin-only: list / download / delete / purge ———

router.get('/admin/classroom-recordings', ...adminRecordingAuthChain, async (req, res) => {
  try {
    const { date, limit, from, to } = req.query || {};
    const q = {};
    // from/to are explicit UTC instants — lets the client ask for a local (e.g. Manila) day
    const fromDate = from ? new Date(String(from)) : null;
    const toDate = to ? new Date(String(to)) : null;
    if (fromDate && !Number.isNaN(fromDate.getTime()) && toDate && !Number.isNaN(toDate.getTime())) {
      q.createdAt = { $gte: fromDate, $lte: toDate };
    } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
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
        chunkCount: r.chunkCount || 0,
        lastChunkAt: r.lastChunkAt || null,
        fileReady: r.status === 'complete',
        durationSec: r.durationSec,
        mimeType: r.mimeType,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        relativePath: r.relativePath,
        maxBytes: MAX_FILE_BYTES
      }))
    });
  } catch (err) {
    console.error('admin list classroom-recordings:', err);
    res.status(500).json({ success: false, message: err.message || 'List failed' });
  }
});

// Mint a ticket the browser can use for a normal (non-fetch) download navigation
router.post(
  '/admin/classroom-recordings/:id/download-ticket',
  ...adminRecordingAuthChain,
  async (req, res) => {
    try {
      const doc = await ClassroomRecording.findById(req.params.id)
        .select('_id status sizeBytes')
        .lean();
      if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
      if (doc.status !== 'complete') {
        return res.status(409).json({
          success: false,
          message: 'Still uploading. Wait until status is Ready, then download.',
          status: doc.status,
          sizeBytes: doc.sizeBytes || 0
        });
      }
      res.json({
        success: true,
        ticket: await issueDownloadTicket(doc._id),
        expiresInMs: DOWNLOAD_TICKET_TTL_MS
      });
    } catch (err) {
      console.error('admin download-ticket classroom-recording:', err);
      res.status(400).json({ success: false, message: 'Could not prepare download' });
    }
  }
);

/** A valid ticket stands in for the admin auth chain (it was issued to an authed admin). */
const markValidDownloadTicket = async (req, res, next) => {
  try {
    if (await downloadTicketValid(req.params.id, req.query.ticket)) {
      req.recordingTicketOk = true;
    }
  } catch (_e) {}
  next();
};
const skipWhenTicketed = (mw) => (req, res, next) =>
  req.recordingTicketOk ? next() : mw(req, res, next);

router.get(
  '/admin/classroom-recordings/:id/download',
  markValidDownloadTicket,
  ...adminRecordingAuthChain.map(skipWhenTicketed),
  async (req, res) => {
    try {
      const doc = await ClassroomRecording.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
      if (doc.status !== 'complete') {
        return res.status(409).json({
          success: false,
          message: 'Still uploading. The file is assembled only after the classroom upload finishes.',
          status: doc.status,
          sizeBytes: doc.sizeBytes || 0
        });
      }
      const rel = String(doc.relativePath || '').replace(/\\/g, '/').replace(/^\//, '');
      const abs = path.join(__dirname, '../uploads', rel);
      const stored = await findUpload(rel);
      let size = stored && Number(stored.length) ? Number(stored.length) : 0;
      if (!size) {
        try {
          size = (await fsp.stat(abs)).size;
        } catch (statErr) {
          return res.status(404).json({ success: false, message: 'File missing' });
        }
      }
      if (!size) {
        return res.status(409).json({ success: false, message: 'Recording file is empty.' });
      }
      const ext =
        /mp4/i.test(String(doc.mimeType || '')) || /\.mp4$/i.test(doc.relativePath || '')
          ? 'mp4'
          : 'webm';
      const safeName = `classroom-${doc.roomId}-${doc._id}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', ext === 'mp4' ? 'video/mp4' : 'video/webm');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Length', String(size));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      if (stored) {
        const stream = openDownloadStream(stored._id);
        stream.on('error', (err) => {
          console.error('admin download classroom-recording stream:', err);
          if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Could not read recording file.' });
          } else {
            res.destroy(err);
          }
        });
        return stream.pipe(res);
      }
      res.download(abs, safeName, (err) => {
        if (!err) return;
        const code = String(err.code || '');
        if (code === 'ECONNABORTED' || code === 'EPIPE' || code === 'ERR_STREAM_PREMATURE_CLOSE') {
          return;
        }
        console.error('admin download classroom-recording stream:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Could not read recording file.' });
        } else {
          res.destroy(err);
        }
      });
    } catch (err) {
      console.error('admin download classroom-recording:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message || 'Download failed' });
      }
    }
  }
);

router.post(
  '/admin/classroom-recordings/:id/assemble',
  ...adminRecordingAuthChain,
  async (req, res) => {
    try {
      const doc = await ClassroomRecording.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
      if (doc.status === 'complete') {
        return res.json({ success: true, alreadyComplete: true, sizeBytes: doc.sizeBytes });
      }
      const parts = await listUploadsByPrefix(partsPrefix(doc._id));
      const partRels = parts
        .map((p) => p.filename)
        .filter((n) => /\/part-\d+$/.test(n) || /part-\d+$/.test(n))
        .sort();
      if (!partRels.length) {
        return res.status(400).json({
          success: false,
          message: 'No uploaded parts to assemble yet. Wait for the classroom to send more, or delete this row.',
        });
      }
      await concatenateUploads(partRels, doc.relativePath, 'video/webm');
      for (const rel of partRels) {
        await deleteUpload(rel).catch(() => {});
      }
      const stored = await findUpload(doc.relativePath);
      doc.status = 'complete';
      doc.sizeBytes = stored && stored.length ? stored.length : doc.sizeBytes;
      if (!doc.mimeType) doc.mimeType = 'video/webm';
      await doc.save();
      res.json({ success: true, recordingId: doc._id.toString(), sizeBytes: doc.sizeBytes });
      scheduleRecordingPostProcess(doc._id.toString(), doc.mimeType);
    } catch (err) {
      console.error('admin assemble classroom-recording:', err);
      res.status(500).json({ success: false, message: err.message || 'Assemble failed' });
    }
  }
);

async function deleteAdminClassroomRecording(req, res) {
  try {
    const doc = await ClassroomRecording.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    await deleteRecordingStorage(doc);
    await ClassroomRecording.deleteOne({ _id: doc._id });
    res.json({ success: true });
  } catch (err) {
    console.error('admin delete classroom-recording:', err);
    res.status(500).json({ success: false, message: err.message || 'Delete failed' });
  }
}

router.delete('/admin/classroom-recordings/:id', ...adminRecordingAuthChain, deleteAdminClassroomRecording);
router.post('/admin/classroom-recordings/:id/delete', ...adminRecordingAuthChain, deleteAdminClassroomRecording);

router.post('/admin/classroom-recordings/purge-expired', ...adminRecordingAuthChain, async (req, res) => {
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
      await deleteRecordingStorage(r);
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