const mongoose = require('mongoose');

const peerMessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true, index: true },     // teacherId
  recipientId: { type: String, required: true, index: true },  // teacherId
  /** Text body; may be empty when an attachment is present. */
  message: { type: String, default: '' },
  attachment: {
    url: { type: String, default: null },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: null },
  },
  createdAt: { type: Date, default: Date.now, index: true },
  readAt: { type: Date, default: null }
}, { timestamps: false });

peerMessageSchema.index({ senderId: 1, recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('PeerMessage', peerMessageSchema);

