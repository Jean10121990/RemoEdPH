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
    type: String,
    default: ''
  },
  presentationType: {
    type: String,
    enum: ['file', 'office_embed', 'html5_zip'],
    default: 'file'
  },
  embedUrl: {
    type: String,
    default: ''
  },
  html5PackagePath: {
    type: String,
    default: ''
  },
  html5EntryUrl: {
    type: String,
    default: ''
  },
  uploader: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    default: function () {
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
  }
}, {
  timestamps: true
});

lessonMaterialSchema.index({ room: 1, uploadedAt: -1 });
lessonMaterialSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LessonMaterial', lessonMaterialSchema);
