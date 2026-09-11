const mongoose = require('mongoose');

const jwtBlacklistSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

jwtBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('JwtBlacklistEntry', jwtBlacklistSchema);
