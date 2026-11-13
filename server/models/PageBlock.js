const mongoose = require('mongoose');

/** Published public copy. A missing or unpublished block leaves the HTML file as-is. */
const pageBlockSchema = new mongoose.Schema(
  {
    pageKey: { type: String, required: true, trim: true },
    blockKey: { type: String, required: true, trim: true },
    locale: { type: String, default: 'en', trim: true },
    format: { type: String, enum: ['text', 'html'], default: 'text' },
    label: { type: String, default: '' },
    body: { type: String, default: '' },
    published: { type: Boolean, default: false },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

pageBlockSchema.index({ pageKey: 1, blockKey: 1, locale: 1 }, { unique: true });

module.exports = mongoose.model('PageBlock', pageBlockSchema, 'page_blocks');
