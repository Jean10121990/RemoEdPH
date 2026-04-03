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
      contactNo,
      contactNumber,
      currentStage = 'applied',
      status = true,
      testAnswers = {},
      demoVideoUrl = '',
      uploadedDocuments = {}
    } = payload;

    const phone = String(contactNo ?? contactNumber ?? '').trim();
    if (!fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'fullName, email, and contact number are required.'
      });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const existing = await Application.findOne({ email: emailNorm });

    if (existing) {
      const stage = String(existing.currentStage || '').toLowerCase();

      if (stage === 'passed') {
        return res.status(409).json({
          success: false,
          error: 'This email already completed tutor screening. Contact support if you need help.'
        });
      }

      if (stage === 'failed') {
        const eligibleAt = existing.reapplyEligibleAt ? new Date(existing.reapplyEligibleAt) : null;
        if (eligibleAt && Date.now() < eligibleAt.getTime()) {
          return res.status(403).json({
            success: false,
            error: `You may re-apply on or after ${eligibleAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`,
            reapplyEligibleAt: eligibleAt.toISOString()
          });
        }

        existing.fullName = String(fullName).trim();
        existing.contactNo = phone;
        existing.currentStage = 'applied';
        existing.status = true;
        existing.failedAt = null;
        existing.reapplyEligibleAt = null;
        existing.passedAt = null;
        existing.testAnswers = {
          text: String(testAnswers.text || ''),
          videoUrls: Array.isArray(testAnswers.videoUrls) ? testAnswers.videoUrls.filter(Boolean) : []
        };
        existing.demoVideoUrl = String(demoVideoUrl || '');
        existing.uploadedDocuments = {
          nbi: String((uploadedDocuments && uploadedDocuments.nbi) || ''),
          nationalId: String((uploadedDocuments && uploadedDocuments.nationalId) || '')
        };
        await existing.save();

        return res.json({
          success: true,
          message: 'Application submitted successfully.',
          applicationId: existing._id,
          reapplied: true
        });
      }

      return res.status(409).json({
        success: false,
        error: 'An application with this email is already in progress.'
      });
    }

    const doc = await Application.create({
      fullName: String(fullName).trim(),
      email: emailNorm,
      contactNo: phone,
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
