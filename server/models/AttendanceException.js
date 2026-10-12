const mongoose = require('mongoose');

const stampSchema = new mongoose.Schema(
  {
    time: { type: String, default: '' },
    timestamp: { type: Date, default: null },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const decisionSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorId: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    comment: { type: String, default: '' },
    fromStatus: { type: String, default: '' },
    toStatus: { type: String, default: '' },
    fromClassification: { type: String, default: '' },
    toClassification: { type: String, default: '' },
  },
  { _id: false }
);

const attendanceExceptionSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    workerId: { type: String, required: true, index: true },
    ownerType: { type: String, enum: ['teacher', 'admin'], required: true },
    displayName: { type: String, default: '' },
    timeLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'TimeLog', required: true, unique: true },
    attendanceDate: { type: String, required: true, index: true },
    originalTimeIn: { type: stampSchema, default: () => ({}) },
    originalTimeOut: { type: stampSchema, default: () => ({}) },
    systemClockOut: { type: stampSchema, default: () => ({}) },
    reportedClockOut: { type: stampSchema, default: () => ({}) },
    approvedClockOut: { type: stampSchema, default: () => ({}) },
    explanation: { type: String, default: '' },
    evidenceNote: { type: String, default: '' },
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING_REVIEW',
      index: true,
    },
    classification: {
      type: String,
      enum: ['ATTENDANCE_EXCEPTION', 'CONFIRMED_NEGLIGENCE', 'EXCUSED', 'DISMISSED'],
      default: 'ATTENDANCE_EXCEPTION',
      index: true,
    },
    reviewerUsername: { type: String, default: '', index: true },
    reviewerComments: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    clarificationRequest: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    blocksTimeIn: { type: Boolean, default: true, index: true },
    decisions: { type: [decisionSchema], default: [] },
  },
  { timestamps: true }
);

attendanceExceptionSchema.index({ status: 1, attendanceDate: -1 });
attendanceExceptionSchema.index({ workerId: 1, status: 1 });

module.exports = mongoose.model('AttendanceException', attendanceExceptionSchema);
