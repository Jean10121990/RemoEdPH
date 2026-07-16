require('dotenv').config();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const StudentNotification = require('../models/StudentNotification');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/online-learning');
  const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const filter = { createdAt: { $lt: cutoff } };
  const a = await Notification.deleteMany(filter);
  const b = await StudentNotification.deleteMany(filter);
  console.log('Deleted teacher/admin notifications:', a.deletedCount);
  console.log('Deleted student notifications:', b.deletedCount);
  console.log('Cutoff:', cutoff.toISOString());
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
