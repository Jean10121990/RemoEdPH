require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const email = 'jean10121990@gmail.com';
  const username = 'TeacherJean';
  const oldId = '69caa0dbc7874f65c142b583';

  const cols = await db.listCollections().toArray();
  console.log('collections:', cols.map((c) => c.name).sort().join(', '));

  for (const { name } of cols) {
    const hits = await db
      .collection(name)
      .find({
        $or: [
          { username: /teacherjean/i },
          { email: email },
          { teacherId: email },
          { teacherId: username },
          { teacherMongoId: oldId },
          { teacher: oldId },
          { teacherRef: oldId },
        ],
      })
      .limit(3)
      .toArray();
    if (hits.length) {
      console.log('\nHIT', name, hits.length);
      const sample = hits[0];
      const keys = Object.keys(sample).filter((k) => !/password|secret|hash|token/i.test(k));
      console.log('keys:', keys.join(', '));
      if (sample.firstName || sample.fullname || sample.fullnameName || sample.content) {
        console.log('sample snippet:', JSON.stringify(sample).slice(0, 400));
      }
    }
  }

  // Check atlas-style deleted? unlikely
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
