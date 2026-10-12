const mongoose = require('mongoose');

const incidentReportSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
  classroomId: { type: String, default: '', index: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
  teacherId: { type: String, required: true, index: true },
  studentId: { type: String, default: '' },
  category: {
    type: String,
    required: true,
    enum: ['technical_failure', 'unaccompanied_child', 'unauthorized_adult', 'safety_distress'],
  },
  tier: { type: Number, enum: [1, 2, 3], required: true },
  description: { type: String, default: '', maxlength: 500 },
  caseRef: { type: String, default: '', index: true },
  originalTier: { type: Number, enum: [1, 2, 3], default: null },
  escalatedFrom: { type: Number, default: null },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: String, default: '' },
  assignedTo: { type: String, default: '' },
  reviewStatus: {
    type: String,
    enum: ['not_required', 'pending', 'reviewed'],
    default: 'not_required',
  },
  troubleshooting: { type: String, default: '' },
  parentContactNote: { type: String, default: '' },
  actions: {
    type: [
      {
        at: { type: Date, default: Date.now },
        actor: { type: String, default: '' },
        action: { type: String, default: '' },
        reason: { type: String, default: '' },
        fromTier: { type: Number, default: null },
        toTier: { type: Number, default: null },
        outcome: { type: String, default: '' },
      },
    ],
    default: [],
  },
  status: {
    type: String,
    enum: ['open', 'withdrawn', 'observing', 'paused', 'terminated', 'resolved'],
    default: 'open',
    index: true,
  },
  raisedBy: { type: String, default: '' },
  resolvedBy: { type: String, default: '' },
  creditRestored: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
});

incidentReportSchema.index({ status: 1, createdAt: -1 });
incidentReportSchema.index({ classroomId: 1, status: 1 });

module.exports = mongoose.model('IncidentReport', incidentReportSchema);
