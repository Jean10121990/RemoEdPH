const mongoose = require('mongoose');

/**
 * One row per outbound letter. SMTP passwords stay in the environment.
 * An empty html field means send the letter that is still in emailService.js.
 * Seed inserts a missing key only. It never overwrites a letter an admin already saved.
 */
const emailTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, default: '' },
    subject: { type: String, default: '' },
    html: { type: String, default: '' },
    text: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { collection: 'email_templates', timestamps: true }
);

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
