const mongoose = require('mongoose');

const peerMessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true, index: true },     // teacherId
  recipientId: { type: String, required: true, index: true },  // teacherId
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
  readAt: { type: Date, default: null }
}, { timestamps: false });

peerMessageSchema.index({ senderId: 1, recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('PeerMessage', peerMessageSchema);

