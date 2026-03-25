const { encryptPiiString, decryptPiiString } = require('./piiCrypto');

/**
 * Mongoose String path: encrypt at rest when PII_ENCRYPTION_KEY is set; transparent decrypt on read.
 * Enable schema option `{ toJSON: { getters: true }, toObject: { getters: true } }` on the model.
 */
function piiContactString(defaultVal = '') {
  return {
    type: String,
    default: defaultVal,
    set(v) {
      if (v === undefined || v === null) return defaultVal;
      const t = String(v).trim();
      if (!t) return defaultVal;
      return encryptPiiString(t);
    },
    get(v) {
      if (v == null || v === '') return defaultVal;
      return decryptPiiString(v);
    },
  };
}

module.exports = { piiContactString };
