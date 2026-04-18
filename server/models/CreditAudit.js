const mongoose = require('mongoose');

/**
 * Immutable audit log for credit deductions/additions.
 * Used for finance/support visibility (Patrick + team).
 */
const creditAuditSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
    deltaCredits: { type: Number, required: true }, // -1 for consumption
    reason: { type: String, required: true }, // e.g. "Class finished", "Student absent"
    description: { type: String, default: '' },
    actorType: { type: String, enum: ['system', 'teacher', 'student', 'admin', 'unknown'], default: 'system' },
    actorId: { type: String, default: '' },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CreditAudit', creditAuditSchema);

