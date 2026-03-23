const express = require('express');
const router = express.Router();
const Application = require('./models/Application');

// Public endpoint: create a new teacher application
router.post('/applications', async (req, res) => {
  try {
    const payload = req.body || {};
    const {
      fullName,
      email,
      password,
      currentStage = 'applied',
      status = true,
      testAnswers = {},
      demoVideoUrl = '',
      uploadedDocuments = {}
    } = payload;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'fullName, email, and password are required.'
      });
    }

    const existing = await Application.findOne({ email: String(email).toLowerCase().trim() }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An application with this email already exists.'
      });
    }

    const doc = await Application.create({
      fullName: String(fullName).trim(),
      email: String(email).toLowerCase().trim(),
      password: String(password),
      currentStage,
      status: Boolean(status),
      testAnswers: {
        text: String(testAnswers.text || ''),
        videoUrls: Array.isArray(testAnswers.videoUrls) ? testAnswers.videoUrls.filter(Boolean) : []
      },
      demoVideoUrl: String(demoVideoUrl || ''),
      uploadedDocuments: {
        nbi: String((uploadedDocuments && uploadedDocuments.nbi) || ''),
        nationalId: String((uploadedDocuments && uploadedDocuments.nationalId) || '')
      }
    });

    return res.json({
      success: true,
      message: 'Application submitted successfully.',
      applicationId: doc._id
    });
  } catch (error) {
    console.error('Application submission failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit application.'
    });
  }
});

module.exports = router;
