/** Sharing defaults. Students under this age stay private until a parent turns sharing on. */
const { readSetting } = require('../services/siteSettings');

const MIN_SHARE_AGE = 13;

function minShareAge() {
  const n = Number(readSetting('minShareAge'));
  return Number.isInteger(n) && n >= 1 ? n : MIN_SHARE_AGE;
}
const SHARE_VIEW_LIMIT = 60;
const SHARE_VIEW_WINDOW_MS = 60 * 1000;
const ANONYMOUS_NAME = 'A RemoEd student';
const CARD_SIZES = {
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
};

module.exports = {
  MIN_SHARE_AGE,
  minShareAge,
  SHARE_VIEW_LIMIT,
  SHARE_VIEW_WINDOW_MS,
  ANONYMOUS_NAME,
  CARD_SIZES,
};
