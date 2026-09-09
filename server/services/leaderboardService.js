/**
 * Dual platform leaderboard — monthly student & teacher rankings (Asia/Manila).
 */
const Booking = require('../models/Booking');
const Feedback = require('../models/Feedback');
const Reward = require('../models/Reward');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const MonthlyStudentScore = require('../models/MonthlyStudentScore');
const MonthlyTeacherScore = require('../models/MonthlyTeacherScore');

const PH_ZONE = 'Asia/Manila';

/** Student badge points (non-capped). */
const STUDENT_PTS = { gold: 50, silver: 25, bronze: 10, attendance: 5, domain: 15 };

/** Teacher metric points. */
const TEACHER_PTS = {
  lessonCompleted: 10,
  fiveStar: 50,
  perfectPunctuality: 100,
  badgeAwarded: 20,
};

const AGE_GROUPS = [
  'ALL',
  'Little Seeds (Age 3)',
  'Sprouts (Age 4)',
  'Saplings (Age 5)',
  'Young Stewards (Age 6)',
];

function manilaParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: PH_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const day = parts.find((p) => p.type === 'day').value;
  return { y, m, day, monthKey: `${y}-${m}` };
}

function currentMonthKey() {
  return manilaParts().monthKey;
}

function normalizeMonth(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return currentMonthKey();
}

/** Inclusive Manila YYYY-MM-DD bounds for a YYYY-MM month. */
function monthDateBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = `${monthKey}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function monthUtcRange(monthKey) {
  const { start, end } = monthDateBounds(monthKey);
  // Approximate Manila day boundaries as UTC±offsets via Date parsing of local-ish strings
  const startUtc = new Date(`${start}T00:00:00+08:00`);
  const endUtc = new Date(`${end}T23:59:59.999+08:00`);
  return { startUtc, endUtc };
}

function privacyStudentName(student) {
  if (!student) return 'Student';
  const first = String(student.firstName || student.username || 'Student').trim();
  const last = String(student.lastName || '').trim();
  const initial = last ? `${last.charAt(0).toUpperCase()}.` : '';
  const firstToken = first.split(/\s+/)[0] || 'Student';
  return initial ? `${firstToken} ${initial}` : firstToken;
}

function teacherDisplayName(t) {
  if (!t) return 'Teacher';
  const nick = (t.nickname && String(t.nickname).trim()) || '';
  if (nick) {
    return nick.toLowerCase().startsWith('teacher') ? nick : `Teacher ${nick}`;
  }
  const first = String(t.firstName || '').trim();
  if (first) return `Teacher ${first}`;
  const full = String(t.fullname || t.username || 'Teacher').trim();
  return full.toLowerCase().startsWith('teacher') ? full : `Teacher ${full.split(/\s+/)[0]}`;
}

function teacherBadgeTitle(score) {
  if (!score) return 'Rising Educator';
  if (score.rank === 1) return 'Gold Mentor';
  if (score.rank === 2) return 'Silver Mentor';
  if (score.rank === 3) return 'Bronze Mentor';
  if ((score.avgStudentRating || 0) >= 4.8 && (score.lessonsCompletedCount || 0) >= 10) {
    return 'Five-Star Guide';
  }
  if ((score.punctualityScore || 0) >= 100) return 'Punctual Pro';
  if ((score.lessonsCompletedCount || 0) >= 20) return 'Dedicated Tutor';
  return 'RemoEd Educator';
}

function minDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
}

function compareStudents(a, b) {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (b.goldCount !== a.goldCount) return b.goldCount - a.goldCount;
  if (b.silverCount !== a.silverCount) return b.silverCount - a.silverCount;
  if (b.bronzeCount !== a.bronzeCount) return b.bronzeCount - a.bronzeCount;
  if (b.domainCount !== a.domainCount) return b.domainCount - a.domainCount;
  if (b.attendanceCount !== a.attendanceCount) return b.attendanceCount - a.attendanceCount;
  const ae = a.earliestAt ? new Date(a.earliestAt).getTime() : Number.MAX_SAFE_INTEGER;
  const be = b.earliestAt ? new Date(b.earliestAt).getTime() : Number.MAX_SAFE_INTEGER;
  return ae - be;
}

function compareTeachers(a, b) {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if ((b.avgStudentRating || 0) !== (a.avgStudentRating || 0)) {
    return (b.avgStudentRating || 0) - (a.avgStudentRating || 0);
  }
  if (b.lessonsCompletedCount !== a.lessonsCompletedCount) {
    return b.lessonsCompletedCount - a.lessonsCompletedCount;
  }
  if ((b.punctualityScore || 0) !== (a.punctualityScore || 0)) {
    return (b.punctualityScore || 0) - (a.punctualityScore || 0);
  }
  const ae = a.earliestAt ? new Date(a.earliestAt).getTime() : Number.MAX_SAFE_INTEGER;
  const be = b.earliestAt ? new Date(b.earliestAt).getTime() : Number.MAX_SAFE_INTEGER;
  return ae - be;
}

function assignRanks(rows, compareFn) {
  const sorted = [...rows].sort(compareFn);
  sorted.forEach((row, i) => {
    row.rank = i + 1;
  });
  return sorted;
}

/**
 * Build student monthly scores from bookings, teacher→student feedback, and in-class rewards.
 * Gold/Silver/Bronze: feedback ratings 5/4/3 + reward star/cookie mapped as gold/bronze.
 */
async function computeStudentScoresForMonth(monthKey) {
  const { start, end } = monthDateBounds(monthKey);
  const { startUtc, endUtc } = monthUtcRange(monthKey);

  const bookings = await Booking.find({
    date: { $gte: start, $lte: end },
    status: { $in: ['completed', 'Completed', 'absent'] },
  })
    .select('studentId studentLevel status attendance date dateTimeUtc finishedAt createdAt lesson')
    .lean();

  const feedbacks = await Feedback.find({
    feedbackRole: { $ne: 'student_to_teacher' },
    $or: [
      { lessonDate: { $gte: startUtc, $lte: endUtc } },
      { submittedAt: { $gte: startUtc, $lte: endUtc } },
    ],
  })
    .select('studentId rating submittedAt lessonDate')
    .lean();

  const rewards = await Reward.find({
    givenAt: { $gte: startUtc, $lte: endUtc },
  })
    .select('studentId type givenAt')
    .lean();

  const byStudent = new Map();

  function ensure(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    if (!byStudent.has(key)) {
      byStudent.set(key, {
        studentId: key,
        month: monthKey,
        totalPoints: 0,
        goldCount: 0,
        silverCount: 0,
        bronzeCount: 0,
        domainCount: 0,
        attendanceCount: 0,
        earliestAt: null,
        ageGroup: 'ALL',
        _domains: new Set(),
        _levels: new Set(),
      });
    }
    return byStudent.get(key);
  }

  for (const b of bookings) {
    const row = ensure(b.studentId);
    if (!row) continue;
    const attended =
      b.status === 'completed' ||
      b.status === 'Completed' ||
      !!(b.attendance && (b.attendance.classCompleted || b.attendance.studentEntered));
    if (attended) {
      row.attendanceCount += 1;
      if (b.studentLevel) {
        row._levels.add(b.studentLevel);
        row._domains.add(b.studentLevel);
      }
      if (b.lesson) row._domains.add(String(b.lesson).trim().toLowerCase());
      const ts =
        b.dateTimeUtc ||
        (b.finishedAt && new Date(b.finishedAt)) ||
        (b.date ? new Date(`${b.date}T12:00:00+08:00`) : null) ||
        b.createdAt;
      row.earliestAt = minDate(row.earliestAt, ts ? new Date(ts) : null);
    }
  }

  for (const f of feedbacks) {
    const row = ensure(f.studentId);
    if (!row) continue;
    const r = Number(f.rating) || 0;
    if (r >= 5) row.goldCount += 1;
    else if (r === 4) row.silverCount += 1;
    else if (r === 3) row.bronzeCount += 1;
    const ts = f.lessonDate || f.submittedAt;
    row.earliestAt = minDate(row.earliestAt, ts ? new Date(ts) : null);
  }

  for (const rw of rewards) {
    const row = ensure(rw.studentId);
    if (!row) continue;
    if (rw.type === 'star') row.goldCount += 1;
    else if (rw.type === 'cookie') row.bronzeCount += 1;
    row.earliestAt = minDate(row.earliestAt, rw.givenAt ? new Date(rw.givenAt) : null);
  }

  const rows = [];
  for (const row of byStudent.values()) {
    row.domainCount = row._domains.size;
    // Primary age group = most common level from attended classes
    const levels = [...row._levels];
    row.ageGroup = levels[0] || 'ALL';
    row.totalPoints =
      row.goldCount * STUDENT_PTS.gold +
      row.silverCount * STUDENT_PTS.silver +
      row.bronzeCount * STUDENT_PTS.bronze +
      row.attendanceCount * STUDENT_PTS.attendance +
      row.domainCount * STUDENT_PTS.domain;
    delete row._domains;
    delete row._levels;
    if (row.totalPoints > 0 || row.attendanceCount > 0) rows.push(row);
  }

  return assignRanks(rows, compareStudents);
}

async function computeTeacherScoresForMonth(monthKey) {
  const { start, end } = monthDateBounds(monthKey);
  const { startUtc, endUtc } = monthUtcRange(monthKey);

  const bookings = await Booking.find({
    date: { $gte: start, $lte: end },
  })
    .select('teacherId status lateMinutes attendance absentType dateTimeUtc finishedAt createdAt date')
    .lean();

  const feedbacks = await Feedback.find({
    feedbackRole: 'student_to_teacher',
    $or: [
      { lessonDate: { $gte: startUtc, $lte: endUtc } },
      { submittedAt: { $gte: startUtc, $lte: endUtc } },
    ],
  })
    .select('teacherId rating submittedAt lessonDate')
    .lean();

  const rewards = await Reward.find({
    givenAt: { $gte: startUtc, $lte: endUtc },
  })
    .select('teacherId givenAt')
    .lean();

  const byTeacher = new Map();

  function ensure(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    if (!byTeacher.has(key)) {
      byTeacher.set(key, {
        teacherId: key,
        month: monthKey,
        totalPoints: 0,
        lessonsCompletedCount: 0,
        avgStudentRating: 0,
        punctualityScore: 0,
        badgesAwardedCount: 0,
        fiveStarCount: 0,
        earliestAt: null,
        _ratingSum: 0,
        _ratingN: 0,
        _lateOrNoShow: 0,
        _eligibleSessions: 0,
      });
    }
    return byTeacher.get(key);
  }

  for (const b of bookings) {
    const row = ensure(b.teacherId);
    if (!row) continue;
    const completed =
      b.status === 'completed' ||
      b.status === 'Completed' ||
      !!(b.attendance && b.attendance.classCompleted);
    const teacherAbsent = b.absentType === 'teacher' || String(b.status).toLowerCase() === 'absent';

    if (completed) {
      row.lessonsCompletedCount += 1;
      row._eligibleSessions += 1;
      if ((Number(b.lateMinutes) || 0) > 0) row._lateOrNoShow += 1;
      const ts =
        b.dateTimeUtc ||
        b.finishedAt ||
        (b.date ? new Date(`${b.date}T12:00:00+08:00`) : null) ||
        b.createdAt;
      row.earliestAt = minDate(row.earliestAt, ts ? new Date(ts) : null);
    } else if (teacherAbsent) {
      row._eligibleSessions += 1;
      row._lateOrNoShow += 1;
    }
  }

  for (const f of feedbacks) {
    const row = ensure(f.teacherId);
    if (!row) continue;
    const r = Number(f.rating) || 0;
    if (r > 0) {
      row._ratingSum += r;
      row._ratingN += 1;
    }
    if (r >= 5) row.fiveStarCount += 1;
    const ts = f.lessonDate || f.submittedAt;
    row.earliestAt = minDate(row.earliestAt, ts ? new Date(ts) : null);
  }

  for (const rw of rewards) {
    const row = ensure(rw.teacherId);
    if (!row) continue;
    row.badgesAwardedCount += 1;
    row.earliestAt = minDate(row.earliestAt, rw.givenAt ? new Date(rw.givenAt) : null);
  }

  const rows = [];
  for (const row of byTeacher.values()) {
    row.avgStudentRating =
      row._ratingN > 0 ? Math.round((row._ratingSum / row._ratingN) * 100) / 100 : 0;
    const perfect =
      row._eligibleSessions > 0 && row._lateOrNoShow === 0;
    row.punctualityScore = perfect ? TEACHER_PTS.perfectPunctuality : 0;
    row.totalPoints =
      row.lessonsCompletedCount * TEACHER_PTS.lessonCompleted +
      row.fiveStarCount * TEACHER_PTS.fiveStar +
      row.punctualityScore +
      row.badgesAwardedCount * TEACHER_PTS.badgeAwarded;
    delete row._ratingSum;
    delete row._ratingN;
    delete row._lateOrNoShow;
    delete row._eligibleSessions;
    if (row.totalPoints > 0 || row.lessonsCompletedCount > 0) rows.push(row);
  }

  return assignRanks(rows, compareTeachers);
}

async function persistStudentScores(monthKey, rows) {
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { month: monthKey, studentId: r.studentId },
      update: {
        $set: {
          totalPoints: r.totalPoints,
          goldCount: r.goldCount,
          silverCount: r.silverCount,
          bronzeCount: r.bronzeCount,
          domainCount: r.domainCount,
          attendanceCount: r.attendanceCount,
          rank: r.rank,
          earliestAt: r.earliestAt,
          ageGroup: r.ageGroup || 'ALL',
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await MonthlyStudentScore.bulkWrite(ops, { ordered: false });
  // Drop stale rows for this month not in latest set
  const ids = rows.map((r) => r.studentId);
  if (ids.length) {
    await MonthlyStudentScore.deleteMany({ month: monthKey, studentId: { $nin: ids } });
  } else {
    await MonthlyStudentScore.deleteMany({ month: monthKey });
  }
}

async function persistTeacherScores(monthKey, rows) {
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { month: monthKey, teacherId: r.teacherId },
      update: {
        $set: {
          totalPoints: r.totalPoints,
          lessonsCompletedCount: r.lessonsCompletedCount,
          avgStudentRating: r.avgStudentRating,
          punctualityScore: r.punctualityScore,
          badgesAwardedCount: r.badgesAwardedCount,
          fiveStarCount: r.fiveStarCount,
          rank: r.rank,
          earliestAt: r.earliestAt,
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await MonthlyTeacherScore.bulkWrite(ops, { ordered: false });
  const ids = rows.map((r) => r.teacherId);
  if (ids.length) {
    await MonthlyTeacherScore.deleteMany({ month: monthKey, teacherId: { $nin: ids } });
  } else {
    await MonthlyTeacherScore.deleteMany({ month: monthKey });
  }
}

const rebuildLocks = new Map();

async function rebuildMonth(monthKey) {
  const key = normalizeMonth(monthKey);
  if (rebuildLocks.get(key)) return rebuildLocks.get(key);
  const p = (async () => {
    const students = await computeStudentScoresForMonth(key);
    const teachers = await computeTeacherScoresForMonth(key);
    await persistStudentScores(key, students);
    await persistTeacherScores(key, teachers);
    return { month: key, students: students.length, teachers: teachers.length };
  })().finally(() => rebuildLocks.delete(key));
  rebuildLocks.set(key, p);
  return p;
}

async function ensureMonthBuilt(monthKey, maxAgeMs = 10 * 60 * 1000) {
  const key = normalizeMonth(monthKey);
  const newest = await MonthlyStudentScore.findOne({ month: key }).sort({ updatedAt: -1 }).lean();
  const newestT = await MonthlyTeacherScore.findOne({ month: key }).sort({ updatedAt: -1 }).lean();
  const ts = Math.max(
    newest && newest.updatedAt ? new Date(newest.updatedAt).getTime() : 0,
    newestT && newestT.updatedAt ? new Date(newestT.updatedAt).getTime() : 0
  );
  if (!ts || Date.now() - ts > maxAgeMs) {
    await rebuildMonth(key);
  }
  return key;
}

async function getStudentLeaderboard({ month, ageGroup = 'ALL', page = 1, pageSize = 20 }) {
  const monthKey = await ensureMonthBuilt(month);
  const ag = AGE_GROUPS.includes(ageGroup) ? ageGroup : 'ALL';
  const filter = { month: monthKey };
  if (ag !== 'ALL') filter.ageGroup = ag;

  let rows = await MonthlyStudentScore.find(filter).sort({ rank: 1 }).lean();
  // If age filter yields empty because ageGroup stored as primary level, re-rank filtered set
  if (ag !== 'ALL') {
    rows = rows.sort(compareStudents).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  const students = await Student.find({
    $or: [
      { username: { $in: rows.map((r) => r.studentId) } },
      { email: { $in: rows.map((r) => r.studentId) } },
    ],
  })
    .select('username email firstName lastName profilePicture photo')
    .lean();

  const byKey = new Map();
  for (const s of students) {
    if (s.username) byKey.set(String(s.username), s);
    if (s.email) byKey.set(String(s.email).toLowerCase(), s);
  }

  const enriched = rows.map((r) => {
    const s =
      byKey.get(r.studentId) ||
      byKey.get(String(r.studentId).toLowerCase()) ||
      null;
    return {
      rank: r.rank,
      studentId: r.studentId,
      displayName: privacyStudentName(s),
      avatar: (s && (s.profilePicture || s.photo)) || null,
      totalPoints: r.totalPoints,
      goldCount: r.goldCount,
      silverCount: r.silverCount,
      bronzeCount: r.bronzeCount,
      domainCount: r.domainCount,
      attendanceCount: r.attendanceCount,
      ageGroup: r.ageGroup,
    };
  });

  const podium = enriched.filter((e) => e.rank >= 1 && e.rank <= 3);
  const tableAll = enriched.filter((e) => e.rank > 3);
  const ps = Math.min(50, Math.max(1, Number(pageSize) || 20));
  const pg = Math.max(1, Number(page) || 1);
  const startIdx = (pg - 1) * ps;
  const table = tableAll.slice(startIdx, startIdx + ps);

  return {
    month: monthKey,
    ageGroup: ag,
    ageGroups: AGE_GROUPS,
    podium,
    table,
    pagination: {
      page: pg,
      pageSize: ps,
      total: tableAll.length,
      totalPages: Math.max(1, Math.ceil(tableAll.length / ps)),
    },
    generatedAt: new Date().toISOString(),
  };
}

async function getTeacherLeaderboard({ month, page = 1, pageSize = 20 }) {
  const monthKey = await ensureMonthBuilt(month);
  const rows = await MonthlyTeacherScore.find({ month: monthKey }).sort({ rank: 1 }).lean();

  const teachers = await Teacher.find({
    teacherId: { $in: rows.map((r) => r.teacherId) },
  })
    .select('teacherId username firstName lastName nickname fullname profilePicture')
    .lean();
  const byId = new Map(teachers.map((t) => [t.teacherId, t]));

  const enriched = rows.map((r) => {
    const t = byId.get(r.teacherId) || null;
    return {
      rank: r.rank,
      teacherId: r.teacherId,
      displayName: teacherDisplayName(t),
      badgeTitle: teacherBadgeTitle(r),
      avatar: (t && t.profilePicture) || null,
      totalPoints: r.totalPoints,
      lessonsCompletedCount: r.lessonsCompletedCount,
      avgStudentRating: r.avgStudentRating,
      punctualityScore: r.punctualityScore,
      badgesAwardedCount: r.badgesAwardedCount,
      fiveStarCount: r.fiveStarCount || 0,
    };
  });

  const podium = enriched.filter((e) => e.rank >= 1 && e.rank <= 3);
  const tableAll = enriched.filter((e) => e.rank > 3);
  const ps = Math.min(50, Math.max(1, Number(pageSize) || 20));
  const pg = Math.max(1, Number(page) || 1);
  const startIdx = (pg - 1) * ps;
  const table = tableAll.slice(startIdx, startIdx + ps);

  return {
    month: monthKey,
    podium,
    table,
    pagination: {
      page: pg,
      pageSize: ps,
      total: tableAll.length,
      totalPages: Math.max(1, Math.ceil(tableAll.length / ps)),
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  PH_ZONE,
  AGE_GROUPS,
  STUDENT_PTS,
  TEACHER_PTS,
  normalizeMonth,
  currentMonthKey,
  rebuildMonth,
  ensureMonthBuilt,
  getStudentLeaderboard,
  getTeacherLeaderboard,
  compareStudents,
  compareTeachers,
};
