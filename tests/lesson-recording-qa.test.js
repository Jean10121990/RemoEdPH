const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QA_CATEGORIES,
  applyCheckpoint,
  applyReview,
  finalizeQa,
  teacherLessonScore,
} = require('../server/services/lessonRecordingQa');

function scored(n) {
  return QA_CATEGORIES.map(([key]) => ({ key, score: n, explanation: key + ' note' }));
}

test('checkpoint averages become the total out of 100', () => {
  let qa = applyCheckpoint(null, { atSec: 45, cameraOn: true, categories: scored(8) });
  qa = applyCheckpoint(qa, { atSec: 90, cameraOn: true, categories: scored(6) });
  qa = finalizeQa(qa);
  assert.equal(qa.categories.find((row) => row.key === 'pronunciation').score, 7);
  assert.equal(qa.total, 70);
  assert.equal(qa.status, 'final');
  assert.equal(qa.categories.length, 10);
  const view = teacherLessonScore(qa);
  assert.equal(view.total, view.categories.reduce((sum, row) => sum + row.score, 0));
  assert.equal(view.total, 70);
});

test('camera off is an open flag with the lesson timestamp', () => {
  const qa = applyCheckpoint(null, { atSec: 65, cameraOn: false });
  const flag = qa.critical.find((row) => row.code === 'camera_off');
  assert.ok(flag);
  assert.equal(flag.status, 'open');
  assert.equal(flag.atSec, 65);
  assert.equal(flag.label, '1:05');
  assert.equal(qa.total, null);
});

test('a score outside 0 to 10 is rejected and resolving a flag keeps the timestamp', () => {
  const qa = applyCheckpoint(null, { atSec: 65, cameraOn: false, categories: scored(5) });
  const high = applyReview(
    qa,
    { categories: QA_CATEGORIES.map(([key]) => ({ key, score: 11 })) },
    'qa'
  );
  assert.equal(high.ok, false);
  const low = applyReview(
    qa,
    { categories: QA_CATEGORIES.map(([key]) => ({ key, score: -1 })) },
    'qa'
  );
  assert.equal(low.ok, false);
  const saved = applyReview(
    qa,
    {
      categories: QA_CATEGORIES.map(([key]) => ({ key, score: 9 })),
      critical: [{ code: 'camera_off', atSec: 65, status: 'resolved' }],
    },
    'qa.admin'
  );
  assert.equal(saved.ok, true);
  assert.equal(saved.qa.total, 90);
  assert.equal(saved.qa.override, true);
  const flag = saved.qa.critical.find((row) => row.code === 'camera_off');
  assert.equal(flag.status, 'resolved');
  assert.equal(flag.atSec, 65);
  assert.equal(flag.label, '1:05');
  const later = applyCheckpoint(saved.qa, { atSec: 120, cameraOn: true, categories: scored(1) });
  assert.equal(later.categories.find((row) => row.key === 'pronunciation').score, 9);
});
