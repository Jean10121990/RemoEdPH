const mongoose = require('mongoose');

/**
 * Immutable-style audit trail for sensitive admin actions (e.g. manual credit grants).
 */
const adminAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    actorUsername: { type: String, default: '', index: true },
    actorAdminId: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    subjectType: { type: String, default: 'student' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    subjectEmail: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
