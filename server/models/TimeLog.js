const mongoose = require('mongoose');

const timeLogSchema = new mongoose.Schema({
  // Store the permanent teacherId string (e.g., "kjb00000001"), or "admin:<username>" for admins
  teacherId: {
    type: String,
    required: true
  },
  logOwnerType: {
    type: String,
    enum: ['teacher', 'admin'],
    default: 'teacher',
    index: true
  },
  date: {
    type: String,
    required: true
  },
  clockIn: {
    time: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  clockOut: {
    time: {
      type: String
    },
    timestamp: {
      type: Date
    }
  },
  totalHours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['clocked-in', 'clocked-out'],
    default: 'clocked-out'
  },
  notes: {
    type: String
  },
  /** EMPLOYEE | SYSTEM_AUTOMATIC | HR_APPROVED. Empty on older rows. */
  clockOutSource: { type: String, default: '' },
  /** Cutoff close. Kept after HR approves a different actual time-out. */
  systemClockOut: {
    time: { type: String, default: '' },
    timestamp: { type: Date, default: null },
    reason: { type: String, default: '' },
  },
  /** HR-approved actual time-out. Does not erase systemClockOut. */
  approvedClockOut: {
    time: { type: String, default: '' },
    timestamp: { type: Date, default: null },
    reviewerUsername: { type: String, default: '' },
  },
}, {
  timestamps: true
});

// Index for efficient queries
timeLogSchema.index({ teacherId: 1, date: 1 });

module.exports = mongoose.model('TimeLog', timeLogSchema); 