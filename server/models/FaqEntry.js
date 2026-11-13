const mongoose = require('mongoose');

const faqEntrySchema = new mongoose.Schema(
  {
    sourceId: { type: String, default: '', trim: true },
    sectionId: { type: String, default: 'general', trim: true },
    sectionTitle: { type: String, default: '', trim: true },
    locale: { type: String, default: 'en', trim: true },
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

faqEntrySchema.index({ locale: 1, sortOrder: 1 });
faqEntrySchema.index({ sourceId: 1, locale: 1 }, { unique: true, partialFilterExpression: { sourceId: { $type: 'string', $gt: '' } } });

module.exports = mongoose.model('FaqEntry', faqEntrySchema, 'faq_entries');
