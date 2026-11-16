const test = require('node:test');
const assert = require('node:assert/strict');
const skill = require('../server/services/skillAssessment');

function picture(id, skillName, correctIndex) {
  return { questionId: id, skill: skillName, kind: 'picture', correctIndex };
}

function rating(id, skillName) {
  return { questionId: id, skill: skillName, kind: 'rating', correctIndex: 0 };
}

test('three correct answers in one skill are Strong', () => {
  const questions = [1, 2, 3].map((n) => picture('l' + n, 'listening', 0));
  const answers = questions.map((q) => ({ questionId: q.questionId, choiceIndex: 0 }));
  const profile = skill.scoreSubmission(questions, answers, { firstName: 'Ana Maria', ageBand: '3-4' });
  assert.equal(profile.bands.listening, skill.STRONG);
  assert.equal(profile.marks.listening, 3);
  assert.match(profile.headline, /Ana/);
  assert.doesNotMatch(profile.headline, /Maria/);
});

test('a total of 2 is Growing and a total of 1 is Getting started', () => {
  assert.equal(skill.bandForTotal(2), skill.GROWING);
  assert.equal(skill.bandForTotal(1.5), skill.GROWING);
  assert.equal(skill.bandForTotal(2.5), skill.GROWING);
  assert.equal(skill.bandForTotal(1.49), skill.GETTING);
  assert.equal(skill.bandForTotal(2.51), skill.STRONG);
});

test('skips are left out and fewer than 2 answers is not enough information', () => {
  const questions = [1, 2, 3].map((n) => picture('r' + n, 'reading', 1));
  const skipped = skill.scoreSubmission(
    questions,
    [
      { questionId: 'r1', choiceIndex: 1 },
      { questionId: 'r2', skipped: true },
      { questionId: 'r3', skipped: true },
    ],
    { firstName: 'Leo', ageBand: '5-6' }
  );
  assert.equal(skipped.bands.reading, skill.UNKNOWN);
  assert.equal(skipped.marks.reading, 0);

  const two = skill.scoreSubmission(
    questions,
    [
      { questionId: 'r1', choiceIndex: 1 },
      { questionId: 'r2', skipped: true },
      { questionId: 'r3', choiceIndex: 1 },
    ],
    { firstName: 'Leo', ageBand: '5-6' }
  );
  assert.equal(two.bands.reading, skill.GROWING);
});

test('parent ratings use 1, 0.5, and 0', () => {
  const questions = [1, 2, 3].map((n) => rating('s' + n, 'speaking'));
  const profile = skill.scoreSubmission(
    questions,
    [
      { questionId: 's1', rating: 'clear' },
      { questionId: 's2', rating: 'needed_help' },
      { questionId: 's3', rating: 'not_yet' },
    ],
    { firstName: 'Mia', ageBand: '3-4' }
  );
  assert.equal(profile.bands.speaking, skill.GROWING);
});

test('equal bands say balanced, and a higher skill is named', () => {
  const questions = [];
  ['listening', 'speaking', 'pronunciation', 'reading'].forEach((name) => {
    [1, 2, 3].forEach((n) => questions.push(picture(name + n, name, 0)));
  });
  const even = questions.map((q) => ({ questionId: q.questionId, choiceIndex: 0 }));
  const balanced = skill.scoreSubmission(questions, even, { firstName: 'Kai', ageBand: '5-6' });
  assert.match(balanced.headline, /balanced/);
  assert.equal(balanced.suggestedFocus, 'balanced');

  const readingLead = questions.map((q) => ({
    questionId: q.questionId,
    choiceIndex: q.skill === 'reading' ? 0 : 1,
  }));
  const lead = skill.scoreSubmission(questions, readingLead, { firstName: 'Kai', ageBand: '5-6' });
  assert.match(lead.headline, /strongest in reading/);
  assert.equal(lead.suggestedFocus, 'reading');
});

test('the browser transcript is scored, and chosen skills set the focus', () => {
  const hello = { questionId: 'h1', skill: 'speaking', kind: 'speak', sayText: 'hello', correctIndex: 0 };
  const phrase = { questionId: 'h2', skill: 'speaking', kind: 'speak', sayText: 'I see a cat', correctIndex: 0 };
  const heard = skill.scoreSubmission(
    [hello, phrase, { questionId: 'h3', skill: 'speaking', kind: 'speak', sayText: 'ball', correctIndex: 0 }],
    [
      { questionId: 'h1', transcript: 'Hello!' },
      { questionId: 'h2', transcript: 'I see cat' },
      { questionId: 'h3', transcript: 'sun' },
    ],
    { firstName: 'Mia', ageBand: '3-4', focusSkills: ['speaking', 'reading'] }
  );
  assert.equal(heard.bands.speaking, skill.GROWING);
  assert.equal(heard.wantsMoreReading, true);
  assert.equal(heard.suggestedFocus, 'reading');
  assert.match(heard.practiceLine, /Speaking and Reading/);

  const speakingOnly = skill.scoreSubmission(
    [hello, phrase],
    [
      { questionId: 'h1', transcript: 'hello' },
      { questionId: 'h2', transcript: 'I see a cat' },
    ],
    { firstName: 'Mia', ageBand: '5-6', focusSkills: ['speaking'] }
  );
  assert.equal(speakingOnly.suggestedFocus, 'balanced');
  assert.equal(speakingOnly.wantsMoreReading, false);
});

test('more reading time suggests Reading Focus, and age sets the level name', () => {
  const questions = [1, 2].map((n) => picture('p' + n, 'pronunciation', 0));
  const answers = questions.map((q) => ({ questionId: q.questionId, choiceIndex: 1 }));
  const young = skill.scoreSubmission(questions, answers, {
    firstName: 'Noa',
    ageBand: '3-4',
    wantsMoreReading: true,
  });
  assert.equal(young.suggestedFocus, 'reading');
  assert.equal(young.suggestedLevel, 'Little Seeds');
  assert.ok(skill.LEVELS.includes(young.suggestedLevel));

  const older = skill.scoreSubmission(
    ['listening', 'speaking', 'pronunciation', 'reading'].flatMap((name) =>
      [1, 2, 3].map((n) => picture(name + n, name, 0))
    ),
    ['listening', 'speaking', 'pronunciation', 'reading'].flatMap((name) =>
      [1, 2, 3].map((n) => ({ questionId: name + n, choiceIndex: 0 }))
    ),
    { firstName: 'Noa', ageBand: '5-6' }
  );
  assert.equal(older.suggestedLevel, 'Young Stewards');
});
