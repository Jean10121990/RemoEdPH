/**
 * Public on purpose: Microsoft PowerPoint (Office for the web) fetches the lesson deck
 * from here with no login. Access is the signed per-file token in the path
 * (server/utils/officeViewerLink.js), valid for a few hours.
 */
const Lesson = require('./models/Lesson');
const { isMongoObjectId } = require('./utils/mongoObjectId');
const { verifyOfficeViewerToken } = require('./utils/officeViewerLink');
const { materializePptxSource } = require('./utils/pptxLocalPreview');

const PPT_TYPES = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
};

async function officeViewerPresentationHandler(req, res) {
  try {
    const fileId = String(req.params.fileId || '');
    if (!isMongoObjectId(fileId) || !verifyOfficeViewerToken(req.params.token, fileId)) {
      return res.status(403).json({ error: 'Link expired or invalid' });
    }
    const lesson = await Lesson.findOne({ 'files._id': fileId }).select('files');
    const file = lesson ? lesson.files.id(fileId) : null;
    if (!file || !/\.(ppt|pptx)$/i.test(String(file.fileName || ''))) {
      return res.status(404).json({ error: 'Presentation not found' });
    }
    const loc = await materializePptxSource(file);
    if (!loc || !loc.sourcePath) {
      return res.status(404).json({ error: 'Presentation file missing' });
    }
    const ext = /\.ppt$/i.test(String(file.fileName)) ? 'ppt' : 'pptx';
    res.setHeader('Content-Type', PPT_TYPES[ext]);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.sendFile(loc.sourcePath);
  } catch (err) {
    console.error('[office-viewer] presentation fetch failed:', err.message || err);
    return res.status(500).json({ error: 'Could not open presentation' });
  }
}

module.exports = { officeViewerPresentationHandler };
