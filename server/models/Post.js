const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    body: { type: String, default: '' },
    platforms: { type: [String], default: [] },
    language: { type: String, default: 'en' },
    scheduledAt: { type: Date, default: null },
    status: { type: String, enum: ['draft', 'scheduled', 'published', 'failed', 'manual'], default: 'draft' },
    mediaPath: { type: String, default: '' },
    affiliateKit: { type: Boolean, default: false },
    results: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Post', postSchema);
