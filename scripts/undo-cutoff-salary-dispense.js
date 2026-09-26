/**
 * Remove teacher paymentHistory rows for one bi-monthly cut-off so Accounting can re-dispense.
 * Usage: node scripts/undo-cutoff-salary-dispense.js
 * Optional: CUTOFF_START=2026-09-16 CUTOFF_END=2026-09-30
 */
require('dotenv').config();
const mongoose = require('mongoose');

function defaultCutoff() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const [y, m, d] = s.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  if (d <= 15) {
    return {
      start: `${y}-${String(m).padStart(2, '0')}-01`,
      end: `${y}-${String(m).padStart(2, '0')}-15`,
    };
  }
  return {
    start: `${y}-${String(m).padStart(2, '0')}-16`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }
  function mongoDbName(uri) {
    const noProto = String(uri).replace(/^mongodb(\+srv)?:\/\//i, '');
    const afterAt = noProto.includes('@') ? noProto.slice(noProto.lastIndexOf('@') + 1) : noProto;
    const path = (afterAt.split('/')[1] || '').split('?')[0];
    return path.replace(/\/$/, '');
  }
  const dbName = mongoDbName(uri);
  console.log('Database name:', dbName || '(none in URI)');
  if (dbName && dbName !== 'test') {
    console.error('Refusing to run: MONGODB_URI is not the test database.');
    process.exit(1);
  }

  const def = defaultCutoff();
  const start = String(process.env.CUTOFF_START || def.start);
  const end = String(process.env.CUTOFF_END || def.end);

  await mongoose.connect(uri);
  const connectedName = mongoose.connection.name;
  console.log('Connected database:', connectedName);
  if (connectedName !== 'test') {
    console.error('Refusing to mutate: connected database is not test.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const Teacher = require('../server/models/Teacher');

  const teachers = await Teacher.find({ 'paymentHistory.0': { $exists: true } })
    .select('teacherId username paymentHistory')
    .lean();

  const matches = [];
  for (const t of teachers) {
    for (const p of t.paymentHistory || []) {
      const m = String(p.duration || '').match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
      if (!m || m[1] !== start || m[2] !== end) continue;
      matches.push({
        teacherId: t.teacherId,
        username: t.username,
        paymentId: String(p._id),
        amount: p.amount,
        status: p.status,
        duration: p.duration,
      });
    }
  }

  console.log(`Cut-off ${start} to ${end}: ${matches.length} payment row(s)`);
  matches.forEach((r) => {
    console.log(`  ${r.username || r.teacherId}  ₱${Number(r.amount || 0).toFixed(2)}  ${r.status}  ${r.duration}`);
  });

  if (!matches.length) {
    await mongoose.disconnect();
    process.exit(0);
  }

  let pulled = 0;
  for (const r of matches) {
    const res = await Teacher.updateOne(
      { teacherId: r.teacherId },
      { $pull: { paymentHistory: { _id: new mongoose.Types.ObjectId(r.paymentId) } } }
    );
    if (res.modifiedCount) pulled += 1;
  }

  console.log(`Removed ${pulled} paymentHistory row(s). Bonus/incentive entries were left in place.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
