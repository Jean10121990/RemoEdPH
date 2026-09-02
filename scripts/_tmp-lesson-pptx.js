require('dotenv').config();
const { connectDB } = require('../server/db');
const Lesson = require('../server/models/Lesson');
const mongoose = require('mongoose');
const axios = require('axios');

(async () => {
  await connectDB();
  const lesson = await Lesson.findOne({ 'files.fileName': /L1M1|L1 M1/i })
    .select('title files.fileName files.html5EntryUrl files.fileSize files._id files.uploadedAt files.presentationType')
    .lean();
  const files = ((lesson && lesson.files) || []).map((f) => ({
    id: String(f._id),
    name: f.fileName,
    url: f.html5EntryUrl,
    size: f.fileSize,
    uploadedAt: f.uploadedAt,
    type: f.presentationType
  }));
  console.log(JSON.stringify({ title: lesson && lesson.title, files }, null, 2));
  const origin = String(process.env.FRONTEND_URL || 'https://remoedph.com').replace(/\/$/, '');
  for (const f of files) {
    if (!f.url) continue;
    const remote = origin + f.url;
    try {
      const head = await axios.head(remote, { timeout: 20000, validateStatus: () => true, maxRedirects: 0 });
      console.log('HEAD', remote, head.status, head.headers['content-type'], head.headers['content-length']);
    } catch (e) {
      console.log('HEAD fail', remote, e.message);
    }
    try {
      const get = await axios.get(remote, {
        timeout: 20000,
        validateStatus: () => true,
        responseType: 'arraybuffer',
        maxContentLength: 2 * 1024 * 1024,
      });
      console.log('GET', remote, get.status, get.headers['content-type'], 'bytes', (get.data && get.data.length) || 0);
    } catch (e) {
      console.log('GET fail', remote, e.message);
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
