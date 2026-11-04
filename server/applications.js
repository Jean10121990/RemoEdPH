const express = require('express');
const router = express.Router();
const Application = require('./models/Application');

const MIN_ANSWER_CHARS = 80;

function normalizeWrittenAnswers(testAnswers) {
  const raw = testAnswers && Array.isArray(testAnswers.answers) ? testAnswers.answers : [];
  let answers = raw.map((a) => String(a || '').trim()).filter((a) => a.length > 0);
  if (answers.length < 3 && testAnswers && testAnswers.text) {
    const split = String(testAnswers.text)
      .split(/\n\s*\n/)
      .map((a) => a.trim())
      .filter(Boolean);
    if (split.length >= answers.length) answers = split;
  }
  return answers.slice(0, 3);
}

function answersTooShort(answers) {
  if (!Array.isArray(answers) || answers.length !== 3) return true;
  return answers.some((a) => String(a || '').trim().length < MIN_ANSWER_CHARS);
}

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

    const answers = normalizeWrittenAnswers(testAnswers);
    if (answersTooShort(answers)) {
      return res.status(400).json({
        success: false,
        error: 'Each of the 3 written answers must be at least 80 characters.'
      });
    }
    const storedAnswers = {
      answers,
      text: answers.join('\n\n'),
      videoUrls: []
    };

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
        existing.testAnswers = storedAnswers;
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
      testAnswers: storedAnswers,
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

const multer = require('multer');
const { createGridFsStorage } = require('./services/gridFsMulterStorage');
const { fileUploadLimiter } = require('./middleware/apiRateLimits');
const { encryptPiiString } = require('./utils/piiCrypto');

const affiliateUpload = multer({
  storage: createGridFsStorage({ prefix: 'affiliate-applications' }),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const applicationMediaUpload = multer({
  storage: createGridFsStorage({ prefix: 'files' }),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const okExt = /\.(mp4|webm|mov|m4v|jpg|jpeg|png|pdf)$/.test(name);
    const okMime = /^(video\/|image\/|application\/pdf|application\/octet-stream)/.test(mime);
    if (okExt && okMime) return cb(null, true);
    return cb(new Error('Upload a video, image, or PDF.'));
  },
});

/** Public teacher-application files. Classroom /api/upload stays behind a login. */
router.post('/applications/upload', fileUploadLimiter, function (req, res, next) {
  applicationMediaUpload.single('file')(req, res, function (err) {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ success: false, error: tooBig ? 'File is larger than 80 MB.' : err.message });
    }
    next();
  });
}, function (req, res) {
  if (!req.file || !req.file.filename) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  const stored = String(req.file.path || ('files/' + req.file.filename)).replace(/\\/g, '/');
  return res.json({
    success: true,
    file: { filename: req.file.filename, path: stored },
  });
});

router.post(
  '/applications/affiliate',
  fileUploadLimiter,
  affiliateUpload.fields([
    { name: 'englishVideo', maxCount: 1 },
    { name: 'nationalId', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const name = String((req.body && req.body.fullName) || '').trim();
      const email = String((req.body && req.body.email) || '').trim().toLowerCase();
      const phone = String((req.body && req.body.phone) || '').trim();
      const video = req.files && req.files.englishVideo && req.files.englishVideo[0];
      const idFile = req.files && req.files.nationalId && req.files.nationalId[0];
      if (!name || !email || !phone || !video || !idFile) {
        return res.status(400).json({
          success: false,
          error: 'Name, email, phone, English video, and national ID are required.',
        });
      }
      const existing = await Application.findOne({ email });
      if (existing) {
        return res.status(409).json({ success: false, error: 'An application with this email already exists.' });
      }
      const Affiliate = require('./models/Affiliate');
      const affiliateTaken = await Affiliate.findOne({ email }).lean();
      if (affiliateTaken) {
        return res.status(409).json({ success: false, error: 'An affiliate with this email already exists.' });
      }
      const videoUrl = '/uploads/' + String(video.path || video.filename || '').replace(/\\/g, '/');
      const idUrl = '/uploads/' + String(idFile.path || idFile.filename || '').replace(/\\/g, '/');
      const doc = await Application.create({
        fullName: name,
        email,
        contactNo: phone,
        applicantType: 'affiliate',
        currentStage: 'applied',
        status: true,
        demoVideoUrl: videoUrl,
        uploadedDocuments: { nationalId: encryptPiiString(idUrl), nbi: '' },
      });
      return res.status(201).json({ success: true, applicationId: String(doc._id) });
    } catch (error) {
      console.error('Affiliate application failed:', error);
      return res.status(500).json({ success: false, error: 'Failed to submit affiliate application.' });
    }
  }
);

module.exports = router;
