const mongoose = require('mongoose');

/** Catalog entry for the Super-Admin permission matrix UI. */
const adminPermissionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    module: { type: String, required: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'permissions' }
);

module.exports = mongoose.model('AdminPermission', adminPermissionSchema);
