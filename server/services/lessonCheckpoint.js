const fs = require('fs');
const path = require('path');
const { normalizeCurriculumLevel } = require('../config/curriculumLevels');

const FILE = path.join(__dirname, '../../public/data/lesson-checkpoints.json');
const ANSWER_FILE = path.join(__dirname, '../data/lesson-checkpoint-answers.json');
let cached = null;
let cachedAnswers = null;

function loadCatalog() {
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  cached = raw && typeof raw === 'object' ? raw : { passPercent: 80, levels: {} };
  return cached;
}

function loadAnswers() {
  if (cachedAnswers) return cachedAnswers;
  const raw = JSON.parse(fs.readFileSync(ANSWER_FILE, 'utf8'));
  cachedAnswers = raw && typeof raw === 'object' ? raw : {};
  return cachedAnswers;
}

function passPercent() {
  const n = Number(loadCatalog().passPercent);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 80;
}

function checkpointLessonsByLevel() {
  const levels = loadCatalog().levels || {};
  const out = {};
  Object.keys(levels).forEach((levelName) => {
    const level = normalizeCurriculumLevel(levelName);
    if (!level) return;
    const lessons = Object.keys(levels[levelName] || {})
      .map((n) => Number(n))
      .filter((n) => n >= 1 && n <= 220);
    out[level] = lessons;
  });
  return out;
}

function checkpointFor(levelRaw, lessonNumber) {
  const level = normalizeCurriculumLevel(levelRaw);
  const num = Number(lessonNumber);
  if (!level || !(num >= 1 && num <= 220)) return null;
  const levels = loadCatalog().levels || {};
  const pack = levels[level] && levels[level][String(num)];
  if (!pack || !Array.isArray(pack.questions) || !pack.questions.length) return null;
  return { level, lessonNumber: num, title: pack.title || 'Lesson ' + num, questions: pack.questions };
}

function publicCheckpoint(levelRaw, lessonNumber) {
  const pack = checkpointFor(levelRaw, lessonNumber);
  if (!pack) return null;
  return {
    level: pack.level,
    lessonNumber: pack.lessonNumber,
    title: pack.title,
    passPercent: passPercent(),
    questions: pack.questions.map((q) => ({
      id: String(q.id || ''),
      prompt: String(q.prompt || ''),
      choices: Array.isArray(q.choices) ? q.choices.map((c) => String(c)) : [],
    })),
  };
}

function scoreAnswers(levelRaw, lessonNumber, answers) {
  const pack = checkpointFor(levelRaw, lessonNumber);
  if (!pack) return null;
  const key = loadAnswers();
  const byId = new Map();
  (Array.isArray(answers) ? answers : []).forEach((row) => {
    if (!row || row.id == null) return;
    const choice = Number(row.choice);
    if (!Number.isInteger(choice) || choice < 0) return;
    byId.set(String(row.id), choice);
  });
  let correct = 0;
  pack.questions.forEach((q) => {
    const expected = Number(key[String(q.id)]);
    if (!Number.isInteger(expected)) return;
    if (byId.get(String(q.id)) === expected) correct += 1;
  });
  const total = pack.questions.length;
  const scorePercent = total ? Math.round((correct / total) * 100) : 0;
  return {
    correctCount: correct,
    total,
    scorePercent,
    passed: scorePercent >= passPercent(),
  };
}

module.exports = {
  passPercent,
  checkpointLessonsByLevel,
  checkpointFor,
  publicCheckpoint,
  scoreAnswers,
};
