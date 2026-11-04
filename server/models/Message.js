const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    text: { type: String, default: '' },
    attachments: { type: [String], default: [] },
    sender: { type: String, enum: ['ai', 'human', 'contact'], default: 'contact' },
    externalId: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
