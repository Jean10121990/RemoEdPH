const { GardenError } = require('./errors');

function assertWritable(view) {
  if (String(view || '') === 'parent') {
    throw new GardenError(403, 'PARENT_READ_ONLY', 'Parents can look, not water or claim.');
  }
}

module.exports = { assertWritable };
