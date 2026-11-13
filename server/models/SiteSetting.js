const mongoose = require('mongoose');

/**
 * One row per site setting. Payroll globalRate stays on GlobalSettings.
 * Seed inserts a missing key only. It never overwrites a value an admin already saved.
 */
const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    group: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['number', 'string', 'boolean', 'json'] },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    defaultValue: { type: mongoose.Schema.Types.Mixed, required: true },
    label: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteSetting', siteSettingSchema);
