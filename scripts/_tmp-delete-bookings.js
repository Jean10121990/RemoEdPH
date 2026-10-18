require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../server/db');

(async () => {
  const ok = await connectDB();
  if (!ok) process.exit(1);
  const db = mongoose.connection.db;
  const names = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => /slot|book|feedback|issue|incident|chat|cancel/i.test(n))
    .sort();
  const counts = {};
  for (const name of names) {
    counts[name] = await db.collection(name).countDocuments();
  }
  const TeacherSlot = require('../server/models/TeacherSlot');
  const slotName = TeacherSlot.collection.name;
  const unavailable = await db.collection(slotName).countDocuments({ available: false });
  const available = await db.collection(slotName).countDocuments({ available: true });
  console.log(JSON.stringify({ slotName, unavailable, available, counts }, null, 2));
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
