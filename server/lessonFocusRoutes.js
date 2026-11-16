const express = require('express');
const lessonFocus = require('./services/lessonFocus');

const router = express.Router();

router.get('/lesson-focus', (_req, res) => {
  const copy = lessonFocus.parentCopy();
  res.json({
    balanced: copy.balanced,
    reading: copy.reading,
    helper: copy.helper,
    unsure: copy.unsure,
    readingTip: copy.readingTip,
    lockHours: lessonFocus.lockHours(),
  });
});

module.exports = router;
