/**
 * Seed + helpers for RemoEdKids growth badges (MongoDB).
 */
const mongoose = require('mongoose');
const Badge = require('../models/Badge');
const StudentBadge = require('../models/StudentBadge');
const ProgressReport = require('../models/ProgressReport');
const Student = require('../models/Student');

const DEFAULT_BADGES = [
  {
    key: 'word_explorer',
    name: 'Word Explorer',
    category: 'SKILL',
    description: 'Loved discovering new words in class!',
    unlockHint: 'Keep practicing vocabulary to unlock!',
    iconName: 'book-open',
    colorHex: '#00aeef',
    sortOrder: 1,
  },
  {
    key: 'grammar_star',
    name: 'Grammar Star',
    category: 'SKILL',
    description: 'Built sentences with care and confidence.',
    unlockHint: 'Keep practicing grammar to unlock!',
    iconName: 'sparkle',
    colorHex: '#38bdf8',
    sortOrder: 2,
  },
  {
    key: 'story_reader',
    name: 'Story Reader',
    category: 'SKILL',
    description: 'Read with curiosity and joy.',
    unlockHint: 'Keep practicing reading to unlock!',
    iconName: 'book',
    colorHex: '#0ea5e9',
    sortOrder: 3,
  },
  {
    key: 'creative_writer',
    name: 'Creative Writer',
    category: 'SKILL',
    description: 'Shared ideas through writing.',
    unlockHint: 'Keep practicing writing to unlock!',
    iconName: 'pencil',
    colorHex: '#0284c7',
    sortOrder: 4,
  },
  {
    key: 'spelling_champ',
    name: 'Spelling Champ',
    category: 'SKILL',
    description: 'Spelled words with growing skill.',
    unlockHint: 'Keep practicing spelling to unlock!',
    iconName: 'abc',
    colorHex: '#0369a1',
    sortOrder: 5,
  },
  {
    key: 'clear_voice',
    name: 'Clear Voice',
    category: 'SKILL',
    description: 'Spoke clearly and bravely.',
    unlockHint: 'Keep practicing pronunciation to unlock!',
    iconName: 'mic',
    colorHex: '#075985',
    sortOrder: 6,
  },
  {
    key: 'sunshine_spirit',
    name: 'Sunshine Spirit',
    category: 'CHARACTER',
    description: 'Brought bright energy to the lesson!',
    unlockHint: 'Share your smile and enthusiasm to unlock!',
    iconName: 'sun',
    colorHex: '#f59e0b',
    sortOrder: 10,
  },
  {
    key: 'kindness_captain',
    name: 'Kindness Captain',
    category: 'CHARACTER',
    description: 'Showed kindness to others.',
    unlockHint: 'Be kind in class to unlock!',
    iconName: 'heart',
    colorHex: '#f472b6',
    sortOrder: 11,
  },
  {
    key: 'respectful_scholar',
    name: 'Respectful Scholar',
    category: 'CHARACTER',
    description: 'Listened and spoke with respect.',
    unlockHint: 'Show respect in every lesson to unlock!',
    iconName: 'handshake',
    colorHex: '#a78bfa',
    sortOrder: 12,
  },
  {
    key: 'super_listener',
    name: 'Super Listener',
    category: 'HABIT',
    description: 'Paid wonderful attention today.',
    unlockHint: 'Listen carefully in class to unlock!',
    iconName: 'ear',
    colorHex: '#34d399',
    sortOrder: 20,
  },
  {
    key: 'punctual_pal',
    name: 'Punctual Pal',
    category: 'HABIT',
    description: 'Joined class right on time.',
    unlockHint: 'Arrive on time to unlock!',
    iconName: 'clock',
    colorHex: '#2dd4bf',
    sortOrder: 21,
  },
  {
    key: 'attendance_hero',
    name: 'Attendance Hero',
    category: 'HABIT',
    description: 'Showed up consistently — what a hero!',
    unlockHint: 'Attend regularly to unlock!',
    iconName: 'trophy',
    colorHex: '#00a82d',
    sortOrder: 22,
  },
];

let seedPromise = null;

async function ensureBadgeCatalog() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    for (const b of DEFAULT_BADGES) {
      await Badge.findOneAndUpdate(
        { key: b.key },
        {
          $set: {
            name: b.name,
            category: b.category,
            description: b.description,
            unlockHint: b.unlockHint,
            iconName: b.iconName,
            colorHex: b.colorHex,
            sortOrder: b.sortOrder,
            active: true,
          },
        },
        { upsert: true, new: true }
      );
    }
    return Badge.find({ active: true }).sort({ sortOrder: 1 }).lean();
  })().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

function normalizeStudentId(raw) {
  if (raw == null) return '';
  if (typeof raw === 'object') {
    return String(raw._id || raw.id || raw.username || raw.studentId || '').trim();
  }
  const s = String(raw).trim();
  // Guard against template-string bugs that persist "undefined"/"null" as IDs
  if (!s || s === 'undefined' || s === 'null') return '';
  return s;
}

const OID_RE = /^[a-fA-F0-9]{24}$/;

async function findStudentByAnyId(raw) {
  const sid = normalizeStudentId(raw);
  if (!sid) return null;
  const select =
    '_id username email firstName lastName nickname profilePicture photo level leveling education';
  if (OID_RE.test(sid) && mongoose.Types.ObjectId.isValid(sid)) {
    const byId = await Student.findById(sid).select(select).lean();
    if (byId) return byId;
  }
  return Student.findOne({
    $or: [{ username: sid }, { email: sid }, { email: sid.toLowerCase() }],
  })
    .select(select)
    .lean();
}

/**
 * All identity keys used across bookings (username/email) and JWT (Mongo _id).
 * Progress reports / badges must query with $in of these aliases.
 */
async function resolveStudentIdAliases(raw) {
  const sid = normalizeStudentId(raw);
  if (!sid) return [];
  const aliases = new Set([sid]);
  const student = await findStudentByAnyId(sid);
  if (student) {
    aliases.add(String(student._id));
    if (student.username) aliases.add(String(student.username));
    if (student.email) {
      aliases.add(String(student.email));
      aliases.add(String(student.email).toLowerCase());
    }
  }
  return [...aliases].filter(Boolean);
}

/** Prefer Booking.studentId convention (username) when storing reports/badges. */
async function canonicalBookingStudentId(raw) {
  const sid = normalizeStudentId(raw);
  if (!sid) return '';
  const student = await findStudentByAnyId(sid);
  if (student && student.username) return String(student.username);
  return sid;
}

function quarterDateRange(year, quarter) {
  const q = String(quarter || '').toUpperCase();
  const y = Number(year);
  const map = {
    Q1: [0, 2],
    Q2: [3, 5],
    Q3: [6, 8],
    Q4: [9, 11],
  };
  const range = map[q];
  if (!range || !Number.isFinite(y)) return null;
  const start = new Date(Date.UTC(y, range[0], 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, range[1] + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

async function getStudentBadgeCabinet(studentId) {
  const aliases = await resolveStudentIdAliases(studentId);
  const sid = aliases[0] || normalizeStudentId(studentId);
  const catalog = await ensureBadgeCatalog();
  const earned = await StudentBadge.find(
    aliases.length ? { studentId: { $in: aliases } } : { studentId: sid }
  )
    .sort({ awardedAt: -1 })
    .lean();

  const byKey = new Map();
  for (const row of earned) {
    if (!byKey.has(row.badgeKey)) byKey.set(row.badgeKey, []);
    byKey.get(row.badgeKey).push(row);
  }

  const badges = catalog.map((b) => {
    const awards = byKey.get(b.key) || [];
    const latest = awards[0] || null;
    return {
      id: String(b._id),
      key: b.key,
      name: b.name,
      category: b.category,
      description: b.description,
      unlockHint: b.unlockHint,
      iconName: b.iconName,
      colorHex: b.colorHex,
      earned: awards.length > 0,
      timesEarned: awards.length,
      awardedAt: latest ? latest.awardedAt : null,
      teacherNote: latest ? latest.teacherNote || '' : '',
      awards: awards.slice(0, 5).map((a) => ({
        id: String(a._id),
        awardedAt: a.awardedAt,
        teacherNote: a.teacherNote || '',
        awardedByTeacherId: a.awardedByTeacherId,
      })),
    };
  });

  return {
    studentId: sid,
    earnedCount: badges.filter((b) => b.earned).length,
    totalCount: badges.length,
    badges,
  };
}

async function awardBadgesToStudent({
  studentId,
  teacherId,
  badgeKeys,
  teacherNote,
  bookingId,
}) {
  const sid = await canonicalBookingStudentId(studentId);
  const tid = String(teacherId || '').trim();
  const keys = [...new Set((badgeKeys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  if (!sid || !tid || !keys.length) {
    const err = new Error('studentId, teacherId, and at least one badge are required');
    err.status = 400;
    throw err;
  }
  if (keys.length > 3) {
    const err = new Error('You can award up to 3 badges per lesson');
    err.status = 400;
    throw err;
  }

  await ensureBadgeCatalog();
  const badges = await Badge.find({ key: { $in: keys }, active: true }).lean();
  if (badges.length !== keys.length) {
    const err = new Error('One or more badges were not found');
    err.status = 400;
    throw err;
  }

  const note = String(teacherNote || '').trim().slice(0, 280);
  const bid = bookingId != null ? String(bookingId) : '';
  const created = [];

  for (const badge of badges) {
    const row = await StudentBadge.create({
      studentId: sid,
      badgeId: badge._id,
      badgeKey: badge.key,
      awardedByTeacherId: tid,
      teacherNote: note,
      bookingId: bid,
      awardedAt: new Date(),
    });
    created.push({
      id: String(row._id),
      badgeKey: badge.key,
      name: badge.name,
      colorHex: badge.colorHex,
      iconName: badge.iconName,
      awardedAt: row.awardedAt,
      teacherNote: note,
    });
  }

  return created;
}

async function getBadgesInQuarter(studentId, year, quarter) {
  const range = quarterDateRange(year, quarter);
  if (!range) return [];
  const aliases = await resolveStudentIdAliases(studentId);
  const sid = aliases[0] || normalizeStudentId(studentId);
  const rows = await StudentBadge.find({
    studentId: aliases.length ? { $in: aliases } : sid,
    awardedAt: { $gte: range.start, $lte: range.end },
  })
    .sort({ awardedAt: -1 })
    .lean();

  await ensureBadgeCatalog();
  const catalog = await Badge.find({}).lean();
  const byKey = new Map(catalog.map((b) => [b.key, b]));

  return rows.map((r) => {
    const b = byKey.get(r.badgeKey) || {};
    return {
      id: String(r._id),
      badgeKey: r.badgeKey,
      name: b.name || r.badgeKey,
      category: b.category || 'SKILL',
      description: b.description || '',
      iconName: b.iconName || 'star',
      colorHex: b.colorHex || '#00aeef',
      awardedAt: r.awardedAt,
      teacherNote: r.teacherNote || '',
    };
  });
}

module.exports = {
  DEFAULT_BADGES,
  ensureBadgeCatalog,
  normalizeStudentId,
  findStudentByAnyId,
  resolveStudentIdAliases,
  canonicalBookingStudentId,
  quarterDateRange,
  getStudentBadgeCabinet,
  awardBadgesToStudent,
  getBadgesInQuarter,
  QUALITATIVE_LEVELS: ProgressReport.QUALITATIVE_LEVELS || [
    'Exploring',
    'Growing',
    'Mastering',
  ],
};
