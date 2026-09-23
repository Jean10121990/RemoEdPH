const mongoose = require('mongoose');

/**
 * Daily admin shift record (PH business date).
 * Kept in sync with TimeLog (logOwnerType: admin) on clock-in / clock-out.
 */
const adminAttendanceSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
      index: true,
    },
    adminUsername: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    timeIn: { type: Date, default: null },
    timeOut: { type: Date, default: null },
    timeInLabel: { type: String, default: '' },
    timeOutLabel: { type: String, default: '' },
    totalHours: { type: Number, default: 0 },
    /** incomplete | clocked_in | completed | short_shift */
    status: {
      type: String,
      enum: ['incomplete', 'clocked_in', 'completed', 'short_shift'],
      default: 'incomplete',
    },
    metEightHours: { type: Boolean, default: false },
    timeLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TimeLog',
      default: null,
    },
  },
  { timestamps: true, collection: 'admin_attendance' }
);

adminAttendanceSchema.index({ adminUsername: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AdminAttendance', adminAttendanceSchema);
