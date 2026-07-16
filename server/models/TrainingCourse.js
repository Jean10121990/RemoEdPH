const mongoose = require('mongoose');

const trainingCourseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  /** Tag shown on Training Portal cards (e.g. Course Material). */
  category: { type: String, default: 'Course Material', trim: true },
  /** Local PPT/PPTX path under uploads (public URL derived). */
  presentationPath: { type: String, default: '' },
  presentationUrl: { type: String, default: '' },
  presentationName: { type: String, default: '' },
  order: { type: Number, default: 0, index: true },
  published: { type: Boolean, default: false, index: true },
  audience: { type: String, default: 'all' },
  createdBy: { type: String, default: 'admin' }
}, { timestamps: true });

module.exports = mongoose.model('TrainingCourse', trainingCourseSchema);
