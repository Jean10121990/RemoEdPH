const mongoose = require('mongoose');

const timeLogSchema = new mongoose.Schema({
  // Store the permanent teacherId string (e.g., "kjb00000001")
  teacherId: {
    type: String,
    required: true
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
  }
}, {
  timestamps: true
});

// Index for efficient queries
timeLogSchema.index({ teacherId: 1, date: 1 });

module.exports = mongoose.model('TimeLog', timeLogSchema); 