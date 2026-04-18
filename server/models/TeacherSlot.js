const mongoose = require('mongoose');
const teacherSlotSchema = new mongoose.Schema({
  teacherId: { type: String, required: true, index: true }, // e.g., "kjb00000001"
  date: { type: String, required: true }, // e.g., '2025-07-26'
  time: { type: String, required: true }, // e.g., '09:00'
  dateTimeUtc: { type: Date, default: null }, // canonical UTC datetime
  teacherLocalZone: { type: String, default: null }, // IANA timezone of teacher when created
  available: { type: Boolean, default: false }, // Whether this slot is available for booking
  createdAt: { type: Date, default: Date.now }
});

teacherSlotSchema.index({ teacherId: 1, date: 1 });
teacherSlotSchema.index({ teacherId: 1, available: 1, date: 1 });

module.exports = mongoose.model('TeacherSlot', teacherSlotSchema); 