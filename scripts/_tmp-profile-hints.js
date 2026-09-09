require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const email = 'jean10121990@gmail.com';

  const app = await db.collection('applications').findOne({
    $or: [{ email: email }, { email: /jean10121990/i }, { username: /teacherjean/i }],
  });
  console.log('application:', app ? JSON.stringify(app, null, 2).slice(0, 2000) : null);

  const logs = await db
    .collection('loginlogs')
    .find({ $or: [{ username: /teacherjean/i }, { email: email }, { teacherId: email }] })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
  console.log(
    'loginlogs:',
    logs.map((l) => ({
      username: l.username,
      email: l.email,
      teacherId: l.teacherId,
      userType: l.userType,
      createdAt: l.createdAt,
    }))
  );

  const booking = await db.collection('bookings').findOne({ teacherId: email });
  console.log('booking teacherId sample:', booking && booking.teacherId);

  const slot = await db.collection('teacherslots').findOne({
    $or: [{ teacherId: email }, { teacherId: 'TeacherJean' }],
  });
  console.log('slot teacherId:', slot && slot.teacherId);

  const adminLogs = await db
    .collection('adminauditlogs')
    .find({ $or: [{ username: /teacherjean/i }, { actorUsername: /teacherjean/i }, { targetUsername: /teacherjean/i }] })
    .limit(5)
    .toArray();
  console.log('adminaudit:', adminLogs.length, adminLogs[0] && Object.keys(adminLogs[0]));

  // any remaining admin with jean email fragment
  const admins = await db
    .collection('admins')
    .find({})
    .project({ username: 1, email: 1, adminRole: 1 })
    .limit(20)
    .toArray();
  console.log('admins sample:', admins);

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
