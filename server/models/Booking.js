const mongoose = require('mongoose');
const bookingSchema = new mongoose.Schema({
  studentId: { type: String, required: true }, // student email/username
  teacherId: { type: String, required: true }, // Use the new teacherId field (e.g., "kjb00000001")
  date: { type: String, required: true }, // YYYY-MM-DD
  time: { type: String, required: true }, // HH:MM
  dateTimeUtc: { type: Date, default: null }, // canonical UTC datetime for the class
  studentLocalZone: { type: String, default: null }, // IANA timezone of student at booking time
  teacherLocalZone: { type: String, default: null }, // IANA timezone of teacher at booking time
  lesson: { type: String, required: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null }, // Reference to Lesson document
  studentLevel: { type: String, required: true }, // nursery, kinder, preparatory
  paymentMethod: { type: String, default: null }, // Optional - payment handled separately
  status: { type: String, default: 'pending' }, // pending, confirmed, completed, cancelled, absent
  classroomId: { type: String }, // unique classroom/room ID for the live lesson
  attendance: {
    teacherEntered: { type: Boolean, default: false },
    studentEntered: { type: Boolean, default: false },
    teacherEnteredAt: { type: Date },
    studentEnteredAt: { type: Date },
    absentChecked: { type: Boolean, default: false }, // Flag to prevent duplicate absent marking
    // Indicates that the class was completed within the required 15-25 minute duration window
    classCompleted: { type: Boolean, default: false }
  },
  // Timestamp when the class was marked completed. Needed for duration calculation
  finishedAt: { type: Date },
  lateMinutes: { type: Number, default: 0 }, // Number of minutes teacher was late
  // Student absent tracking
  absentMarkedAt: { type: Date },
  absentType: { type: String, enum: ['student', 'teacher'] },
  absentReason: { type: String },
  // Cancellation tracking
  cancellationTime: { type: Date },
  cancellationReason: {
    reason: { type: String },
    rejected: { type: Boolean, default: false }
  },
  // Video recording tracking
  recording: {
    isRecording: { type: Boolean, default: false },
    recordingStartedAt: { type: Date },
    recordingStoppedAt: { type: Date },
    videoPath: { type: String }, // Path to the recorded video file
    videoGeneratedAt: { type: Date }, // When video was fully generated
    videoSize: { type: Number }, // Video file size in bytes
    duration: { type: Number } // Recording duration in seconds
  },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Booking', bookingSchema); 