const mongoose = require('mongoose');

const portalVideoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    fileName: { type: String, required: true },
    relativeUrl: { type: String, required: true },
    mimeType: { type: String, default: 'video/mp4' },
    sizeBytes: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    uploadedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

portalVideoSchema.index({ active: 1, createdAt: -1 });

module.exports = mongoose.model('PortalVideo', portalVideoSchema);
