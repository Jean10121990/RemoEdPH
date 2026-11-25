const mongoose = require('mongoose');

/**
 * QA / admin monitoring: low-quality WebM chunks assembled server-side.
 * Default retention: expiresAt (e.g. 7 days) — delete file + row to save disk.
 */
const classroomRecordingSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    bookingId: { type: String, default: null, index: true },
    teacherId: { type: String, default: null, index: true },
    /** Who started upload: teacher | student (browser in classroom) */
    recordedByRole: { type: String, enum: ['teacher', 'student', 'unknown'], default: 'unknown' },
    /** Stable key from JWT for chunk auth: teacher:<id> or student:<id> */
    recordedByUploaderKey: { type: String, default: '', index: true },
    /** Relative to project uploads dir, e.g. classroom-recordings/<id>.webm */
    relativePath: { type: String, required: true },
    mimeType: { type: String, default: 'video/webm' },
    sizeBytes: { type: Number, default: 0 },
    durationSec: { type: Number, default: null },
    status: { type: String, enum: ['uploading', 'complete', 'failed'], default: 'uploading' },
    /** Auto-delete the video after this time. The score row stays. */
    expiresAt: { type: Date, required: true, index: true },
    /** True after the 7-day purge removed the video file. The score remains. */
    filePurged: { type: Boolean, default: false },
    errorMessage: { type: String, default: '' },
    /** Number of GridFS chunk parts received while status=uploading */
    chunkCount: { type: Number, default: 0 },
    /** Last time a chunk landed — used for live upload progress / stall detection */
    lastChunkAt: { type: Date, default: null },
    /**
     * Live teacher score for this same recording. Checkpoints store category
     * summaries only. JPEG and audio samples are not kept.
     */
    qa: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

classroomRecordingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ClassroomRecording', classroomRecordingSchema);