const mongoose = require('mongoose');

/** Append-only. No update or delete routes are exposed. */
const attendanceAuditSchema = new mongoose.Schema(
  {
    actorId: { type: String, default: 'system' },
    actorRole: { type: String, default: 'system' },
    action: { type: String, required: true, index: true },
    entityId: { type: String, default: '', index: true },
    reference: { type: String, default: '', index: true },
    previous: { type: mongoose.Schema.Types.Mixed, default: null },
    next: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('AttendanceAudit', attendanceAuditSchema);
