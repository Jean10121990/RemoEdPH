const mongoose = require('mongoose');

/**
 * Strict 24-hex ObjectId check — avoids Mongoose CastError / BSONError spam
 * when clients pass classroomIds, filenames, "undefined", etc.
 */
function isMongoObjectId(value) {
  const s = String(value == null ? '' : value).trim();
  if (!/^[a-fA-F0-9]{24}$/.test(s)) return false;
  return mongoose.Types.ObjectId.isValid(s);
}

function isBsonOrCastIdError(err) {
  if (!err) return false;
  if (err.name === 'CastError' || err.name === 'BSONError') return true;
  const msg = String(err.message || '');
  return (
    /input must be a 24 character hex string/i.test(msg) ||
    (/Cast to ObjectId failed/i.test(msg) && /ObjectId/i.test(msg))
  );
}

module.exports = {
  isMongoObjectId,
  isBsonOrCastIdError,
};
