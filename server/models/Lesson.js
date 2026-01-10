const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  curriculumId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Curriculum',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  lessonNumber: {
    type: Number,
    required: true
  },
  order: {
    type: Number,
    default: 0,
    index: true
  },
  estimatedDuration: {
    type: Number, // in minutes
    default: 30
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String, // teacherId or 'admin'
    default: 'admin'
  },
  // Embedded files array - consolidates lessonfiles collection
  files: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    fileName: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      required: true // pdf, doc, ppt, image, video, etc.
    },
    fileSize: {
      type: Number,
      required: true
    },
    fileData: {
      type: String, // Base64 data URL
      required: true
    },
    uploadedBy: {
      type: String, // teacherId
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    isPermanent: {
      type: Boolean,
      default: false // Files can be deleted and edited
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
lessonSchema.index({ curriculumId: 1, order: 1 });
lessonSchema.index({ isActive: 1 });

module.exports = mongoose.model('Lesson', lessonSchema);

