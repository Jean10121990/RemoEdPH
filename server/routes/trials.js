const express = require('express');
const mongoose = require('mongoose');
const TrialBooking = require('../models/TrialBooking');
const Student = require('../models/Student');
const { verifyToken, requireStudent } = require('../authMiddleware');

const router = express.Router();
const TRIAL_DAYS = 7;
const THEMES = ['fruits', 'animals', 'snacks'];

function requireLogin(req, res, next) {
  verifyToken(req, res, function () {
    requireStudent(req, res, next);
  });
}

const isId = (v) => mongoose.isValidObjectId(v);

function childNameOf(child) {
  if (!child) return '';
  return String(child.firstName || child.nickname || child.username || '').trim();
}

function themeOf(value, fallback) {
  return THEMES.includes(value) ? value : (fallback || 'fruits');
}

function freshExpiry() {
  return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

function isExpired(trial) {
  if (!trial) return false;
  if (trial.status === 'expired') return true;
  return !!(trial.expiresAt && trial.expiresAt < new Date() && trial.status !== 'completed');
}

function cleanWords(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const row of list) {
    if (!row || typeof row.word !== 'string') continue;
    const word = row.word.replace(/[^\w\s'-]/g, '').trim().slice(0, 40);
    if (!word) continue;
    const attempts = parseInt(row.attempts, 10);
    out.push({
      word,
      attempts: Math.min(Math.max(Number.isFinite(attempts) ? attempts : 0, 0), 50),
      correctFirstTry: !!row.correctFirstTry,
      spokeIt: !!row.spokeIt,
    });
    if (out.length >= 10) break;
  }
  return out;
}

function cleanSeconds(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 3600);
}

function buildReport(trial, child) {
  const words = Array.isArray(trial && trial.words) ? trial.words : [];
  const seconds = Number(trial && trial.secondsSpent) || 0;
  return {
    childName: childNameOf(child),
    wordsLearned: words.length,
    correctFirstTry: words.filter((w) => w && w.correctFirstTry).length,
    spokeCount: words.filter((w) => w && w.spokeIt).length,
    needsPractice: words.filter((w) => w && w.word && !w.correctFirstTry).map((w) => w.word),
    minutes: Math.round(seconds / 60),
  };
}

async function persist(trial) {
  try {
    await trial.save();
    return trial;
  } catch (err) {
    if (!err || err.name !== 'VersionError' || !trial._id) throw err;
    const fresh = await TrialBooking.findById(trial._id);
    if (!fresh) throw err;
    fresh.theme = trial.theme;
    fresh.words = trial.words;
    fresh.secondsSpent = trial.secondsSpent;
    fresh.status = trial.status;
    fresh.startedAt = trial.startedAt;
    fresh.completedAt = trial.completedAt;
    fresh.expiresAt = trial.expiresAt;
    await fresh.save();
    return fresh;
  }
}

function reopen(trial, theme) {
  trial.theme = themeOf(theme, trial.theme);
  trial.words = [];
  trial.secondsSpent = 0;
  trial.status = 'ready';
  trial.startedAt = null;
  trial.completedAt = null;
  if (!trial.expiresAt || trial.expiresAt < new Date()) trial.expiresAt = freshExpiry();
}

function keepAlive(trial) {
  if (isExpired(trial) || !trial.expiresAt) {
    trial.expiresAt = freshExpiry();
    if (trial.status === 'expired') trial.status = 'ready';
  }
}

async function loadOwnTrial(req) {
  let trial = null;
  if (isId(req.params.id)) {
    trial = await TrialBooking.findById(req.params.id);
    if (trial && String(trial.parentId) !== String(req.student._id)) return { missing: true };
  }
  if (!trial) trial = await TrialBooking.findOne({ parentId: req.student._id });
  if (!trial) return { missing: true };
  return { trial };
}

router.get('/mine', requireLogin, async (req, res) => {
  try {
    const trial = await TrialBooking.findOne({ parentId: req.student._id })
      .select('status expiresAt theme')
      .lean();
    res.json({
      trial: trial
        ? { trialId: String(trial._id), status: trial.status, expiresAt: trial.expiresAt, theme: trial.theme }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load the trial.' });
  }
});

router.post('/', requireLogin, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const childId = body.childId;
  const theme = themeOf(body.theme);
  try {
    // Kids play this trial after signup — do not require a phone on file.
    const requested = isId(childId) ? String(childId) : String(req.student._id);
    if (requested !== String(req.student._id)) {
      return res.status(404).json({ error: 'Child not found.' });
    }

    const trial = await TrialBooking.create({
      parentId: req.student._id,
      childId: req.student._id,
      theme: theme,
      expiresAt: freshExpiry(),
    });
    res.status(201).json({ trialId: String(trial._id), expiresAt: trial.expiresAt });
  } catch (err) {
    if (err && err.code === 11000) {
      try {
        const existing = await TrialBooking.findOne({ parentId: req.student._id });
        if (!existing) return res.status(409).json({ error: 'This child already used the free trial.' });
        reopen(existing, theme);
        const saved = await persist(existing);
        return res.status(200).json({ trialId: String(saved._id), expiresAt: saved.expiresAt });
      } catch (saveErr) {
        console.error(saveErr);
        return res.status(500).json({ error: 'Could not start the trial.' });
      }
    }
    console.error(err);
    res.status(500).json({ error: 'Could not start the trial.' });
  }
});

router.post('/:id/progress', requireLogin, async (req, res) => {
  try {
    const loaded = await loadOwnTrial(req);
    if (!loaded.trial) return res.status(404).json({ error: 'Trial not found.' });
    const trial = loaded.trial;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    keepAlive(trial);
    trial.words = cleanWords(body.words);
    trial.secondsSpent = cleanSeconds(body.secondsSpent);
    if (trial.status === 'ready' || trial.status === 'expired') {
      trial.status = 'started';
      trial.startedAt = trial.startedAt || new Date();
    }
    await persist(trial);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save progress.' });
  }
});

router.post('/:id/complete', requireLogin, async (req, res) => {
  try {
    const loaded = await loadOwnTrial(req);
    if (!loaded.trial) return res.status(404).json({ error: 'Trial not found.' });
    let trial = loaded.trial;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (Array.isArray(body.words)) {
      trial.words = cleanWords(body.words);
      trial.secondsSpent = cleanSeconds(body.secondsSpent);
    }
    keepAlive(trial);
    if (trial.status !== 'completed') {
      trial.status = 'completed';
      trial.completedAt = new Date();
    }
    trial = await persist(trial);
    let child = null;
    try {
      child = await Student.findById(trial.childId).select('firstName nickname username');
    } catch (lookupErr) {
      console.error(lookupErr);
    }
    res.json({ report: buildReport(trial, child) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not complete the trial.' });
  }
});

router.get('/:id', requireLogin, async (req, res) => {
  try {
    const loaded = await loadOwnTrial(req);
    if (!loaded.trial) return res.status(404).json({ error: 'Trial not found.' });
    const trial = loaded.trial;
    let child = null;
    try {
      child = await Student.findById(trial.childId).select('firstName nickname username');
    } catch (lookupErr) {
      console.error(lookupErr);
    }
    res.json({
      status: trial.status,
      theme: trial.theme,
      expiresAt: trial.expiresAt,
      report: buildReport(trial, child),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load the trial.' });
  }
});

router.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Could not save the trial.' });
});

module.exports = router;
