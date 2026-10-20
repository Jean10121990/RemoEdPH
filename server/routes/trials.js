const express = require('express');
const mongoose = require('mongoose');
const TrialBooking = require('../models/TrialBooking');
const Student = require('../models/Student');
const { verifyToken, requireStudent } = require('../authMiddleware');

const router = express.Router();
const TRIAL_DAYS = 7;

function requireLogin(req, res, next) {
  verifyToken(req, res, function () {
    requireStudent(req, res, next);
  });
}

const isId = (v) => mongoose.isValidObjectId(v);

function phoneOnFile(student) {
  return String((student && (student.contact || student.parentContact)) || '').trim();
}

function childNameOf(child) {
  if (!child) return '';
  return String(child.firstName || child.nickname || child.username || '').trim();
}

async function loadOwnTrial(req, res) {
  let trial = null;
  if (isId(req.params.id)) {
    trial = await TrialBooking.findById(req.params.id);
    if (trial && String(trial.parentId) !== String(req.student._id)) {
      res.status(404).json({ error: 'Trial not found.' });
      return null;
    }
  }
  if (!trial) {
    trial = await TrialBooking.findOne({ parentId: req.student._id });
  }
  if (!trial) {
    res.status(404).json({ error: 'Trial not found.' });
    return null;
  }
  if (trial.status !== 'completed' && trial.expiresAt < new Date()) {
    trial.status = 'expired';
    await trial.save();
  }
  if (trial.status === 'expired') {
    res.status(410).json({ error: 'This trial has expired.' });
    return null;
  }
  return trial;
}

function buildReport(trial, child) {
  const total = trial.words.length;
  const firstTry = trial.words.filter((w) => w.correctFirstTry).length;
  const spoke = trial.words.filter((w) => w.spokeIt).length;
  return {
    childName: childNameOf(child),
    wordsLearned: total,
    correctFirstTry: firstTry,
    spokeCount: spoke,
    needsPractice: trial.words.filter((w) => !w.correctFirstTry).map((w) => w.word),
    minutes: Math.round(trial.secondsSpent / 60),
  };
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
  try {
    const { childId, theme } = req.body || {};
    if (!phoneOnFile(req.student)) {
      return res.status(403).json({ error: 'Please verify your phone number first.' });
    }
    const requested = isId(childId) ? String(childId) : String(req.student._id);
    if (requested !== String(req.student._id)) {
      return res.status(404).json({ error: 'Child not found.' });
    }

    const trial = await TrialBooking.create({
      parentId: req.student._id,
      childId: req.student._id,
      theme: ['fruits', 'animals', 'snacks'].includes(theme) ? theme : 'fruits',
      expiresAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    });
    res.status(201).json({ trialId: String(trial._id), expiresAt: trial.expiresAt });
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await TrialBooking.findOne({ parentId: req.student._id });
      if (existing) {
        return res.status(200).json({ trialId: String(existing._id), expiresAt: existing.expiresAt });
      }
      return res.status(409).json({ error: 'This child already used the free trial.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not start the trial.' });
  }
});

router.post('/:id/progress', requireLogin, async (req, res) => {
  try {
    const trial = await loadOwnTrial(req, res);
    if (!trial) return;

    const incoming = Array.isArray(req.body.words) ? req.body.words.slice(0, 10) : [];
    trial.words = incoming
      .filter((w) => w && typeof w.word === 'string')
      .map((w) => ({
        word: w.word.slice(0, 40),
        attempts: Math.min(Math.max(parseInt(w.attempts, 10) || 0, 0), 50),
        correctFirstTry: !!w.correctFirstTry,
        spokeIt: !!w.spokeIt,
      }));
    trial.secondsSpent = Math.min(Math.max(parseInt(req.body.secondsSpent, 10) || 0, 0), 3600);
    if (trial.status === 'ready') {
      trial.status = 'started';
      trial.startedAt = new Date();
    }
    await trial.save();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save progress.' });
  }
});

router.post('/:id/complete', requireLogin, async (req, res) => {
  try {
    const trial = await loadOwnTrial(req, res);
    if (!trial) return;
    if (trial.status !== 'completed') {
      trial.status = 'completed';
      trial.completedAt = new Date();
      await trial.save();
    }
    const child = await Student.findById(trial.childId).select('firstName nickname username');
    res.json({ report: buildReport(trial, child) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not complete the trial.' });
  }
});

router.get('/:id', requireLogin, async (req, res) => {
  try {
    const trial = await loadOwnTrial(req, res);
    if (!trial) return;
    const child = await Student.findById(trial.childId).select('firstName nickname username');
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

module.exports = router;
