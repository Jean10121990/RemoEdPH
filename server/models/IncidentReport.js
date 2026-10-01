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
