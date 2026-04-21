const mongoose = require('mongoose');
const { normalizeId } = require('../utils/normalizeId');

const teacherSlotSchema = new mongoose.Schema({
  teacherId: { type: String, required: true, index: true }, // canonical string (emails stored lowercased)
  date: { type: String, required: true }, // e.g., '2025-07-26'
  time: { type: String, required: true }, // e.g., '09:00'
  dateTimeUtc: { type: Date, default: null }, // canonical UTC datetime
  teacherLocalZone: { type: String, default: null }, // IANA timezone of teacher when created
  available: { type: Boolean, default: false }, // Whether this slot is available for booking
  createdAt: { type: Date, default: Date.now }
});

teacherSlotSchema.index({ teacherId: 1, date: 1 });
teacherSlotSchema.index({ teacherId: 1, available: 1, date: 1 });
teacherSlotSchema.index({ teacherId: 1, dateTimeUtc: 1, available: 1 });

teacherSlotSchema.pre('save', function teacherSlotNormalizeTeacherId(next) {
  try {
    if (this.teacherId != null && this.teacherId !== '') {
      this.teacherId = normalizeId(this.teacherId);
    }
  } catch (e) {
    return next(e);
  }
  return next();
});

module.exports = mongoose.model('TeacherSlot', teacherSlotSchema);
