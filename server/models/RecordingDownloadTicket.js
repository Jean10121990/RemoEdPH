const mongoose = require('mongoose');

const recordingDownloadTicketSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    recordingId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

recordingDownloadTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RecordingDownloadTicket', recordingDownloadTicketSchema);
