const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REFERRAL_REWARD_CREDITS } = require('../server/config/studentReferral');
const { shouldGrantLevelReward, LEVEL_LESSON_REWARD_CAP } = require('../server/services/levelLessonReward');

test('a successful parent referral grants 1 lesson credit', () => {
  assert.equal(REFERRAL_REWARD_CREDITS, 1);
  const html = fs.readFileSync(path.join('public', 'student-referrals.html'), 'utf8');
  assert.match(html, /you earn 1 free lesson/);
  assert.doesNotMatch(html, /₱500 referral bonus/);
});

test('lesson 10 of a level grants one flower credit, and the fifth is the last', () => {
  assert.equal(shouldGrantLevelReward({ level: 'Sprouts', completed: 9, alreadyGranted: false, totalGranted: 0 }), false);
  assert.equal(shouldGrantLevelReward({ level: 'Sprouts', completed: 10, alreadyGranted: false, totalGranted: 0 }), true);
  assert.equal(shouldGrantLevelReward({ level: 'Sprouts', completed: 12, alreadyGranted: true, totalGranted: 1 }), false);
  assert.equal(shouldGrantLevelReward({ level: 'Pre-Level', completed: 10, alreadyGranted: false, totalGranted: 0 }), false);
  assert.equal(
    shouldGrantLevelReward({ level: 'Young Stewards', completed: 10, alreadyGranted: false, totalGranted: LEVEL_LESSON_REWARD_CAP }),
    false
  );
});
