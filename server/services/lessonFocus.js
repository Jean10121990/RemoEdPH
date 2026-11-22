/**
 * Lesson focus: balanced or reading. Missing values are balanced.
 * The cutoff is site setting lessonFocusLockHours (default 24).
 */
const { readSetting } = require('./siteSettings');

const DEFAULT_BALANCED = 'Listening, speaking, pronunciation, and reading in one lesson.';
const OLD_READING = 'More time on letter sounds, sight words, and reading together.';
const DEFAULT_READING = 'More time on the skill your child needs, such as listening, speaking, vocabulary, or reading.';
const HELPER = 'Same level, same teacher, same 1 credit. You can change it before each lesson.';
const UNSURE = 'Not sure? Choose Balanced. Every lesson still practices the skills.';
const READING_TIP = 'The teacher spends more time on the skill your child is building.';

function parseLessonFocus(value, options) {
  const allowEmpty = !options || options.allowEmpty !== false;
  if (value == null || String(value).trim() === '') return allowEmpty ? 'balanced' : null;
  const v = String(value).trim().toLowerCase();
  if (v === 'balanced' || v === 'reading') return v;
  return null;
}

function normalizeLessonFocus(value) {
  return parseLessonFocus(value) || 'balanced';
}

function focusLabel(value) {
  return normalizeLessonFocus(value) === 'reading' ? 'Skills-based' : 'Balanced';
}

function lockHours() {
  let n = 24;
  try {
    const raw = Number(readSetting('lessonFocusLockHours'));
    if (Number.isFinite(raw)) n = raw;
  } catch (_err) {
    n = 24;
  }
  if (!Number.isFinite(n)) n = 24;
  return Math.min(168, Math.max(1, Math.round(n)));
}

function focusLocked(booking, now) {
  const start = booking && booking.dateTimeUtc ? new Date(booking.dateTimeUtc) : null;
  if (!start || Number.isNaN(start.getTime())) return true;
  const clock = now instanceof Date ? now : new Date();
  return start.getTime() - clock.getTime() <= lockHours() * 3600000;
}

function parentCopy() {
  let balanced = DEFAULT_BALANCED;
  let reading = DEFAULT_READING;
  try {
    const savedBalanced = readSetting('lessonFocusBalancedText');
    const savedReading = readSetting('lessonFocusReadingText');
    if (savedBalanced) balanced = String(savedBalanced);
    if (savedReading && String(savedReading).trim() !== OLD_READING) reading = String(savedReading);
  } catch (_err) {
    /* catalog defaults */
  }
  return {
    balanced,
    reading,
    helper: HELPER,
    unsure: UNSURE,
    readingTip: READING_TIP,
  };
}

function confirmationLines(booking) {
  const focus = normalizeLessonFocus(booking && booking.lessonFocus);
  const copy = parentCopy();
  const level = booking && booking.studentLevel ? String(booking.studentLevel) : '';
  const lines = [
    'Level: ' + (level || "your child's level") + '.',
    'Focus: ' + focusLabel(focus) + '.',
    focus === 'reading' ? copy.reading : copy.balanced,
  ];
  if (focus === 'reading') lines.push(copy.readingTip);
  return lines;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendFocusNote(to, subject, lines) {
  const email = String(to || '').trim();
  if (!email || !lines || !lines.length) return { success: false };
  try {
    const { sendRawEmail } = require('../emailService');
    const text = lines.join('\n');
    const html = lines.map((line) => '<p>' + escapeHtml(line) + '</p>').join('');
    return await sendRawEmail(email, subject, html, text);
  } catch (err) {
    console.warn('Lesson focus email:', err && err.message ? err.message : err);
    return { success: false };
  }
}

module.exports = {
  DEFAULT_BALANCED,
  DEFAULT_READING,
  HELPER,
  UNSURE,
  READING_TIP,
  parseLessonFocus,
  normalizeLessonFocus,
  focusLabel,
  lockHours,
  focusLocked,
  parentCopy,
  confirmationLines,
  sendFocusNote,
};
