const mongoose = require('mongoose');

const curriculumSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  level: {
    type: String,
    required: true,
    enum: ['nursery', 'kinder', 'preparatory', 'elementary', 'intermediate', 'advanced'],
    index: true
  },
  order: {
    type: Number,
    default: 0,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String, // teacherId or 'admin'
    default: 'admin'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
curriculumSchema.index({ level: 1, order: 1 });
curriculumSchema.index({ isActive: 1 });

module.exports = mongoose.model('Curriculum', curriculumSchema);

