const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['messenger', 'instagram', 'webchat', 'email'], default: 'webchat' },
    externalThreadId: { type: String, default: '', index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: ['open', 'ai', 'needs_human', 'closed'], default: 'ai' },
    assignedTo: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);
