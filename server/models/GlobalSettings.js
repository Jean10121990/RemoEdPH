const mongoose = require('mongoose');

const globalSettingsSchema = new mongoose.Schema({
  globalRate: {
    type: Number,
    default: 100,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  /** Student plan checkout. maribank_qr is the soft-launch QR. paymongo is the card / GCash / Maya checkout. */
  studentPaymentMethod: {
    type: String,
    enum: ['maribank_qr', 'paymongo'],
    default: 'maribank_qr'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GlobalSettings', globalSettingsSchema); 