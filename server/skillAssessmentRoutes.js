const express = require('express');
const rateLimit = require('express-rate-limit');
const skill = require('./services/skillAssessment');

const router = express.Router();

const scoreLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many assessment attempts. Please wait and try again.' },
});

router.get('/skill-assessment/questions', async (req, res) => {
  try {
    const ageBand = req.query.ageBand === '5-6' ? '5-6' : '3-4';
    const rows = await skill.questionsForBand(ageBand);
    res.json({
      ageBand,
      questions: rows.map(skill.publicQuestion),
    });
  } catch (err) {
    console.error('skill questions:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Could not load the skill check.' });
  }
});

router.post('/skill-assessment/score', scoreLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const ageBand = body.ageBand === '5-6' ? '5-6' : '3-4';
    const questions = await skill.questionsForBand(ageBand);
    const firstName = String(body.childFirstName || body.childName || '')
      .trim()
      .split(/\s+/)[0];
    const profile = skill.scoreSubmission(questions, body.answers, skill.metaFromBody(body, firstName || 'Your child'));
    res.json({
      success: true,
      firstName: firstName || 'Your child',
      headline: profile.headline,
      bands: profile.bands,
      marks: profile.marks,
      suggestedLevel: profile.suggestedLevel,
      suggestedFocus: profile.suggestedFocus,
      focusSkills: profile.focusSkills,
      practiceLine: profile.practiceLine,
      disclaimer: profile.disclaimer,
    });
  } catch (err) {
    console.error('skill score:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Could not score the skill check.' });
  }
});

module.exports = router;
