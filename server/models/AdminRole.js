const mongoose = require('mongoose');

const adminRoleSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    /** Built-in roles seeded from legacy hardcoded RBAC — do not delete. */
    isSystem: { type: Boolean, default: false },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'roles' }
);

module.exports = mongoose.model('AdminRole', adminRoleSchema);
