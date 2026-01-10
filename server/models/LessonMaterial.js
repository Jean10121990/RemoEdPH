const mongoose = require('mongoose');

const lessonMaterialSchema = new mongoose.Schema({
  room: {
    type: String,
    required: true,
    index: true
  },
  materialId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  data: {
    type: String, // Base64 data URL
    required: true
  },
  uploader: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true // For cleanup queries
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Expire after 1 day
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    },
    index: true // For cleanup queries
  }
}, {
  timestamps: true
});

// Index for efficient queries
lessonMaterialSchema.index({ room: 1, uploadedAt: -1 });
lessonMaterialSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

module.exports = mongoose.model('LessonMaterial', lessonMaterialSchema);

