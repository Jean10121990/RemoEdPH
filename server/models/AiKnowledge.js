const mongoose = require('mongoose');

const aiKnowledgeSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    language: { type: String, default: 'en' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiKnowledge', aiKnowledgeSchema);
