/**
 * Skill check scoring. Points are added per skill (not averaged):
 * correct or clear = 1, needed help = 0.5, wrong or not yet = 0.
 * Skipped questions are left out. Fewer than 2 answered questions is
 * "Not enough information". Under 1.5 Getting started, 1.5–2.5 Growing,
 * over 2.5 Strong.
 */
const fs = require('fs');
const path = require('path');

const SKILLS = ['listening', 'speaking', 'pronunciation', 'reading'];
const GETTING = 'Getting started';
const GROWING = 'Growing';
const STRONG = 'Strong';
const UNKNOWN = 'Not enough information';
const LEVELS = ['Little Seeds', 'Sprouts', 'Saplings', 'Young Stewards'];
const DISCLAIMER =
  "A quick snapshot, not a full evaluation. Your child's teacher will refine it in the first lesson.";

const RANK = { [STRONG]: 3, [GROWING]: 2, [GETTING]: 1 };

function bandForTotal(total) {
  if (total < 1.5) return GETTING;
  if (total <= 2.5) return GROWING;
  return STRONG;
}

function marksForBand(band) {
  if (band === GETTING) return 1;
  if (band === GROWING) return 2;
  if (band === STRONG) return 3;
  return 0;
}

function pointsFor(question, answer) {
  if (!question || !answer || answer.skipped === true) return null;
  if (question.kind === 'rating') {
    const rating = String(answer.rating || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (rating === 'clear') return 1;
    if (rating === 'needed_help' || rating === 'help') return 0.5;
    if (rating === 'not_yet' || rating === 'notyet') return 0;
    return null;
  }
  if (answer.choiceIndex == null || answer.choiceIndex === '') return null;
  const idx = Number(answer.choiceIndex);
  if (!Number.isInteger(idx)) return null;
  return idx === Number(question.correctIndex) ? 1 : 0;
}

function firstNameOnly(name) {
  const word = String(name || '').trim().split(/\s+/)[0];
  return word || 'Your child';
}

function scoreSubmission(questions, answers, meta) {
  const list = Array.isArray(questions) ? questions : [];
  const given = Array.isArray(answers) ? answers : [];
  const byId = new Map(given.map((row) => [String(row && row.questionId || ''), row]));
  const totals = {};
  const counts = {};
  SKILLS.forEach((skill) => {
    totals[skill] = 0;
    counts[skill] = 0;
  });
  list.forEach((question) => {
    const skill = question && question.skill;
    if (!SKILLS.includes(skill)) return;
    const points = pointsFor(question, byId.get(String(question.questionId || '')));
    if (points == null) return;
    totals[skill] += points;
    counts[skill] += 1;
  });

  const bands = {};
  const marks = {};
  SKILLS.forEach((skill) => {
    const band = counts[skill] < 2 ? UNKNOWN : bandForTotal(totals[skill]);
    bands[skill] = band;
    marks[skill] = marksForBand(band);
  });

  const ageBand = meta && meta.ageBand === '5-6' ? '5-6' : '3-4';
  const wantsMoreReading = !!(meta && meta.wantsMoreReading);
  const profile = {
    ageBand,
    wantsMoreReading,
    bands,
    marks,
    headline: headline(meta && meta.firstName, bands),
    suggestedLevel: suggestedLevel(ageBand, bands),
    suggestedFocus: suggestedFocus(bands, wantsMoreReading),
    disclaimer: DISCLAIMER,
    completedAt: new Date().toISOString(),
  };
  return profile;
}

function headline(name, bands) {
  const child = firstNameOnly(name);
  const scored = SKILLS.map((skill) => ({ skill, band: bands[skill] })).filter((row) => row.band && row.band !== UNKNOWN);
  if (!scored.length || new Set(scored.map((row) => row.band)).size === 1) {
    return child + "'s skills look balanced.";
  }
  const top = Math.max(...scored.map((row) => RANK[row.band] || 0));
  const leaders = scored.filter((row) => (RANK[row.band] || 0) === top).map((row) => row.skill);
  const joined = leaders.length === 1 ? leaders[0] : leaders.slice(0, -1).join(', ') + ' and ' + leaders[leaders.length - 1];
  return child + ' is strongest in ' + joined + '.';
}

function suggestedLevel(ageBand, bands) {
  const scored = SKILLS.map((skill) => bands[skill]).filter((band) => band && band !== UNKNOWN);
  const strong = scored.filter((band) => band === STRONG).length;
  const growing = scored.filter((band) => band === GROWING).length;
  const started = scored.filter((band) => band === GETTING).length;
  if (ageBand === '3-4') {
    if (scored.length && started >= strong + growing) return 'Little Seeds';
    return 'Sprouts';
  }
  if (strong >= 2 && started === 0) return 'Young Stewards';
  if (started > growing + strong) return 'Sprouts';
  return 'Saplings';
}

function suggestedFocus(bands, wantsMoreReading) {
  if (wantsMoreReading) return 'reading';
  const reading = bands && bands.reading;
  if (!reading || reading === UNKNOWN || reading === GETTING) return 'balanced';
  const others = SKILLS.filter((skill) => skill !== 'reading').map((skill) => RANK[bands[skill]] || 0);
  const readingRank = RANK[reading] || 0;
  if (readingRank > Math.max(...others, 0)) return 'reading';
  return 'balanced';
}

function publicQuestion(row) {
  return {
    questionId: row.questionId,
    skill: row.skill,
    ageBand: row.ageBand,
    kind: row.kind,
    prompt: row.prompt || '',
    audioUrl: row.audioUrl || '',
    imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls.slice(0, 4) : [],
    options: Array.isArray(row.options) ? row.options.slice(0, 6) : [],
    order: row.order || 0,
  };
}

function seedRows() {
  const file = path.join(__dirname, '..', 'data', 'skill-assessment-questions.json');
  const raw = fs.readFileSync(file, 'utf8');
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length < 12) {
    throw new Error('Skill assessment seed is incomplete.');
  }
  return rows;
}

async function ensureQuestions() {
  const SkillQuestion = require('../models/SkillQuestion');
  const count = await SkillQuestion.countDocuments();
  if (count > 0) return 0;
  const rows = seedRows();
  await SkillQuestion.insertMany(rows, { ordered: false });
  return rows.length;
}

async function questionsForBand(ageBand) {
  const SkillQuestion = require('../models/SkillQuestion');
  await ensureQuestions();
  const band = ageBand === '5-6' ? '5-6' : '3-4';
  return SkillQuestion.find({ ageBand: band }).sort({ order: 1, questionId: 1 }).lean();
}

module.exports = {
  SKILLS,
  GETTING,
  GROWING,
  STRONG,
  UNKNOWN,
  LEVELS,
  DISCLAIMER,
  bandForTotal,
  scoreSubmission,
  headline,
  suggestedLevel,
  suggestedFocus,
  publicQuestion,
  seedRows,
  ensureQuestions,
  questionsForBand,
};
