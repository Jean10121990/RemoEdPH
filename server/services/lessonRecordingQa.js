'use strict';

/**
 * Teacher score stored on the existing ClassroomRecording row.
 * Checkpoints update that row. JPEG and audio samples are not saved.
 */

const QA_CATEGORIES = [
  ['pronunciation', 'Pronunciation'],
  ['grammar', 'Grammar'],
  ['lesson_content', 'Lesson & Content Knowledge'],
  ['vocabulary', 'Vocabulary'],
  ['talk_time', 'Speaking & Talk-Time Balance'],
  ['warmth', 'Appearance, Smile & Warmth'],
  ['structure', 'Lesson Structure & Pacing Adherence'],
  ['student_care', 'Student Care, Friendliness & Supportiveness'],
  ['technical', 'Technical Quality — Internet, Audio & Video'],
  ['liveliness', 'Liveliness & Classroom Handling'],
];

const CRITICAL_CODES = ['anger', 'badmouthing', 'shouting', 'camera_off'];
const MODEL_CRITICAL = ['anger', 'badmouthing', 'shouting'];

function formatClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function blankQa() {
  return {
    status: 'pending',
    total: null,
    categories: QA_CATEGORIES.map(([key, label]) => ({
      key,
      label,
      score: null,
      explanation: '',
      timestamps: [],
    })),
    critical: [],
    checkpoints: [],
    source: '',
    override: false,
    reviewedBy: '',
    reviewedAt: null,
    updatedAt: null,
  };
}

function ensureQa(qa) {
  const base = blankQa();
  if (!qa || typeof qa !== 'object') return base;
  base.status = qa.status || 'pending';
  base.total = qa.total == null || qa.total === '' ? null : Number(qa.total);
  base.source = String(qa.source || '');
  base.override = !!qa.override;
  base.reviewedBy = String(qa.reviewedBy || '');
  base.reviewedAt = qa.reviewedAt || null;
  base.updatedAt = qa.updatedAt || null;
  base.critical = Array.isArray(qa.critical)
    ? qa.critical
        .map((row) => ({
          code: String(row.code || ''),
          atSec: Math.max(0, Math.floor(Number(row.atSec) || 0)),
          label: String(row.label || formatClock(row.atSec)),
          reason: String(row.reason || '').slice(0, 300),
          status: ['open', 'confirmed', 'resolved'].includes(row.status) ? row.status : 'open',
        }))
        .filter((row) => CRITICAL_CODES.includes(row.code))
    : [];
  base.checkpoints = Array.isArray(qa.checkpoints) ? qa.checkpoints.slice(-40) : [];
  const prior = Array.isArray(qa.categories) ? qa.categories : [];
  base.categories = QA_CATEGORIES.map(([key, label]) => {
    const found = prior.find((row) => row && row.key === key) || {};
    const score = found.score == null || found.score === '' ? null : Number(found.score);
    return {
      key,
      label,
      score: Number.isFinite(score) ? score : null,
      explanation: String(found.explanation || ''),
      timestamps: Array.isArray(found.timestamps)
        ? found.timestamps.map((n) => Math.floor(Number(n) || 0))
        : [],
    };
  });
  return base;
}

function clampModelScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function recompute(qa) {
  const sums = {};
  const counts = {};
  (qa.checkpoints || []).forEach((cp) => {
    (cp.categories || []).forEach((row) => {
      if (!QA_CATEGORIES.some(([key]) => key === row.key)) return;
      const score = clampModelScore(row.score);
      if (score == null) return;
      sums[row.key] = (sums[row.key] || 0) + score;
      counts[row.key] = (counts[row.key] || 0) + 1;
    });
  });
  let total = 0;
  let scored = 0;
  qa.categories = QA_CATEGORIES.map(([key, label]) => {
    if (!counts[key]) {
      return { key, label, score: null, explanation: '', timestamps: [] };
    }
    const avg = Math.round(sums[key] / counts[key]);
    const times = [];
    let explanation = '';
    (qa.checkpoints || []).forEach((cp) => {
      const hit = (cp.categories || []).find((row) => row.key === key);
      if (!hit) return;
      times.push(Math.floor(Number(cp.atSec) || 0));
      if (hit.explanation) explanation = String(hit.explanation).slice(0, 400);
    });
    scored += 1;
    total += avg;
    return { key, label, score: avg, explanation, timestamps: times.slice(-5) };
  });
  qa.total = scored === QA_CATEGORIES.length ? total : null;
}

function pushCritical(qa, code, atSec, reason) {
  const near = qa.critical.find(
    (row) => row.code === code && row.status !== 'resolved' && Math.abs(row.atSec - atSec) < 90
  );
  if (near) return;
  qa.critical.push({
    code,
    atSec,
    label: formatClock(atSec),
    reason: String(reason || 'Flagged during the lesson.').slice(0, 300),
    status: 'open',
  });
}

function applyCheckpoint(qa, input) {
  const next = ensureQa(qa);
  const atSec = Math.max(0, Math.min(3 * 3600, Math.floor(Number(input && input.atSec) || 0)));
  if (input && input.cameraOn === false) {
    pushCritical(next, 'camera_off', atSec, 'Teacher camera was off or not showing the teacher.');
  }
  if (!next.override) {
    const scored = [];
    (Array.isArray(input && input.categories) ? input.categories : []).forEach((row) => {
      const key = String((row && row.key) || '');
      const score = clampModelScore(row && row.score);
      if (!QA_CATEGORIES.some(([id]) => id === key) || score == null) return;
      scored.push({
        key,
        score,
        explanation: String((row && row.explanation) || '').slice(0, 400),
      });
    });
    if (scored.length) {
      next.checkpoints.push({ atSec, categories: scored });
      if (next.checkpoints.length > 40) next.checkpoints = next.checkpoints.slice(-40);
      recompute(next);
      next.source = 'model';
    }
  }
  (Array.isArray(input && input.critical) ? input.critical : []).forEach((flag) => {
    const code = String((flag && flag.code) || '');
    if (!MODEL_CRITICAL.includes(code)) return;
    pushCritical(next, code, atSec, flag && flag.reason);
  });
  if (next.status !== 'final') {
    next.status = next.total != null || next.critical.length ? 'live' : 'pending';
  }
  next.updatedAt = new Date();
  return next;
}

function finalizeQa(qa) {
  const next = ensureQa(qa);
  if (!next.override) recompute(next);
  if (next.total != null || next.override) next.status = 'final';
  else if (next.critical.length) next.status = 'live';
  next.updatedAt = new Date();
  return next;
}

function applyReview(qa, body, username) {
  const next = ensureQa(qa);
  const incoming = Array.isArray(body && body.categories) ? body.categories : [];
  const byKey = {};
  for (let i = 0; i < incoming.length; i += 1) {
    const row = incoming[i] || {};
    const key = String(row.key || '');
    if (!QA_CATEGORIES.some(([id]) => id === key)) continue;
    const n = Number(row.score);
    if (!Number.isInteger(n) || n < 0 || n > 10) {
      return { ok: false, error: 'Each category score must be a whole number from 0 to 10.' };
    }
    byKey[key] = n;
  }
  if (QA_CATEGORIES.some(([key]) => byKey[key] == null)) {
    return { ok: false, error: 'Score every category from 0 to 10.' };
  }
  let total = 0;
  next.categories = QA_CATEGORIES.map(([key, label]) => {
    const prior = next.categories.find((row) => row.key === key) || {};
    total += byKey[key];
    return {
      key,
      label,
      score: byKey[key],
      explanation: String(prior.explanation || ''),
      timestamps: prior.timestamps || [],
    };
  });
  next.total = total;
  (Array.isArray(body && body.critical) ? body.critical : []).forEach((flag) => {
    const code = String((flag && flag.code) || '');
    const atSec = Math.floor(Number(flag && flag.atSec) || 0);
    const status = String((flag && flag.status) || '');
    if (!['open', 'confirmed', 'resolved'].includes(status)) return;
    const match = next.critical.find((row) => row.code === code && row.atSec === atSec);
    if (match) match.status = status;
  });
  next.override = true;
  next.status = 'final';
  next.reviewedBy = String(username || '').slice(0, 120);
  next.reviewedAt = new Date();
  next.updatedAt = next.reviewedAt;
  return { ok: true, qa: next };
}

function applyReanalysis(qa, model, atSec) {
  const next = ensureQa(qa);
  next.critical = next.critical.filter((row) => row.code === 'camera_off');
  next.checkpoints = [];
  next.override = false;
  next.reviewedBy = '';
  next.reviewedAt = null;
  next.status = 'pending';
  const applied = applyCheckpoint(next, {
    atSec: atSec || 0,
    categories: model && model.categories,
    critical: model && model.critical,
  });
  if (applied.total != null) applied.status = 'final';
  applied.source = 'model';
  applied.override = false;
  return applied;
}

function teacherLessonScore(qa) {
  const next = ensureQa(qa);
  const categories = next.categories.map((row) => ({
    key: row.key,
    label: row.label,
    score: row.score == null ? null : row.score,
  }));
  const ready = categories.every((row) => Number.isInteger(row.score));
  const total = ready ? categories.reduce((sum, row) => sum + row.score, 0) : null;
  return {
    total,
    status: next.status || 'pending',
    categories,
    critical: next.critical
      .filter((row) => row.status !== 'resolved')
      .map((row) => ({ label: row.label, reason: row.reason })),
  };
}

function qaSummary(qa) {
  if (!qa || typeof qa !== 'object') {
    return { status: 'pending', total: null, criticalOpen: false, override: false };
  }
  const criticalOpen =
    Array.isArray(qa.critical) && qa.critical.some((row) => row && row.status !== 'resolved');
  return {
    status: qa.status || 'pending',
    total: qa.total == null ? null : Number(qa.total),
    criticalOpen,
    override: !!qa.override,
  };
}

function parseModelJson(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (_err) {
    return null;
  }
}

async function scoreSample(parts) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const keys = QA_CATEGORIES.map(([id, label]) => `${id}: ${label}`).join('\n');
  const prompt = [
    'You score one slice of a live RemoEd English class for ages 3–6.',
    'The class is 25 minutes: Greetings about 1 minute, Objectives about 30 seconds, Warm-Up about 2 minutes, Main Lesson (I Do, We Do, You Do) about 15 minutes, Activity about 2 minutes, Review about 1 minute, Goodbye about 2 minutes.',
    'Return JSON only. categories is an array of all 10 keys with an integer score 0-10 and a short explanation.',
    'critical is an array. Include an item only when you are sure. Codes: anger, badmouthing, shouting.',
    'anger: frustrated, irritated, or angry tone instead of warm.',
    'badmouthing: mocking, insulting, or speaking negatively about the child, parents, or others.',
    'shouting: yelling or a harsh raised voice directed at the child. A lively teacher is not shouting. Loud volume alone is not shouting.',
    'Do not flag camera_off. Do not invent a flag from silence.',
    `Keys:\n${keys}`,
    'Shape: {"categories":[{"key":"pronunciation","score":8,"explanation":"..."}],"critical":[{"code":"anger","reason":"..."}]}',
  ].join('\n');
  const bodyParts = [{ text: prompt }].concat(parts || []);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: bodyParts }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text =
      json &&
      json.candidates &&
      json.candidates[0] &&
      json.candidates[0].content &&
      json.candidates[0].content.parts &&
      json.candidates[0].content.parts.map((part) => part.text || '').join('');
    return parseModelJson(text);
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  QA_CATEGORIES,
  CRITICAL_CODES,
  blankQa,
  ensureQa,
  applyCheckpoint,
  finalizeQa,
  applyReview,
  applyReanalysis,
  teacherLessonScore,
  qaSummary,
  formatClock,
  scoreSample,
  parseModelJson,
};
