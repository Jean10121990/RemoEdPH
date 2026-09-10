/**
 * Unified in-app notifications for teachers/admins (Notification) and students (StudentNotification).
 * Features: importance, preference gates, quiet hours, bookingId+type dedupe, delivery log, socket emit.
 */
const Notification = require('../models/Notification');
const StudentNotification = require('../models/StudentNotification');
const Student = require('../models/Student');
const Admin = require('../models/Admin');
const realtime = require('../realtime');

const TEACHER_ROOM = (id) => `notif:teacher:${String(id || '').trim()}`;
const STUDENT_ROOM = (username) => `notif:student:${String(username || '').trim()}`;
const ADMIN_ROOM = (username) => `notif:admin:${String(username || '').trim()}`;

const RETENTION_DAYS = 31;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Badge / always-deliver types (still honor hard preference off for some). */
const ACTIONABLE_TYPES = new Set([
  'booking',
  'cancel',
  'reminder',
  'reschedule-available',
  'reschedule',
  'reschedule-declined',
  'absent',
  'credits-low',
  'credits-topup',
  'trial-ending',
  'teacher-joined',
  'teacher-late',
  'schedule-change',
  'cancellation-request',
  'cancellation-rejected',
  'peer-message',
  'class-completed',
]);

const DEFAULT_PREFS = {
  reminders: true,
  announcements: true,
  peerMessages: true,
  salary: true,
  credits: true,
  digestEmail: false,
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

function isActionableType(type) {
  return ACTIONABLE_TYPES.has(String(type || ''));
}

function mergePrefs(raw) {
  return { ...DEFAULT_PREFS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

function manilaHourNow() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const h = parts.find((p) => p.type === 'hour');
    return Number(h && h.value != null ? h.value : new Date().getHours()) % 24;
  } catch (_e) {
    return new Date().getHours();
  }
}

function inQuietHours(prefs) {
  if (!prefs || !prefs.quietHoursEnabled) return false;
  const start = Number(prefs.quietHoursStart);
  const end = Number(prefs.quietHoursEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const hour = manilaHourNow();
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function prefAllows(prefs, type) {
  const t = String(type || '');
  const p = mergePrefs(prefs);
  if (t === 'reminder' && p.reminders === false) return false;
  if (t === 'announcement' && p.announcements === false) return false;
  if (t === 'peer-message' && p.peerMessages === false) return false;
  if (t === 'salary' && p.salary === false) return false;
  if ((t === 'credits-topup' || t === 'credits-low' || t === 'trial-ending') && p.credits === false) {
    return false;
  }
  return true;
}

async function logDelivery(entry) {
  try {
    const NotificationDeliveryLog = require('../models/NotificationDeliveryLog');
    await NotificationDeliveryLog.create({
      audience: entry.audience,
      recipientId: String(entry.recipientId || ''),
      type: String(entry.type || ''),
      bookingId: entry.bookingId != null ? String(entry.bookingId) : null,
      status: entry.status,
      reason: entry.reason || null,
      createdAt: new Date(),
    });
  } catch (e) {
    console.warn('[notify] delivery log failed:', e.message || e);
  }
}

function emitNotificationNew(audience, recipientId, doc) {
  try {
    const payload = {
      audience,
      recipientId: String(recipientId || ''),
      notification: doc && typeof doc.toObject === 'function' ? doc.toObject() : doc,
      ts: Date.now(),
    };
    if (audience === 'teacher') {
      realtime.emitToRoom(TEACHER_ROOM(recipientId), 'notification:new', payload);
    } else if (audience === 'student') {
      realtime.emitToRoom(STUDENT_ROOM(recipientId), 'notification:new', payload);
    } else if (audience === 'admin') {
      realtime.emitToRoom(ADMIN_ROOM(recipientId), 'notification:new', payload);
    }
    realtime.emitAll('notification:new', payload);
  } catch (e) {
    console.warn('[notify] emit failed:', e.message || e);
  }
}

async function resolveStudentUsername(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.includes('@') || !/^[a-f0-9]{24}$/i.test(s)) {
    const byUser = await Student.findOne({
      $or: [{ username: s }, { email: s.toLowerCase() }],
    })
      .select('username')
      .lean();
    if (byUser) return byUser.username;
    return s;
  }
  const byId = await Student.findById(s).select('username').lean();
  return byId ? byId.username : null;
}

async function loadStudentPrefs(username) {
  try {
    const doc = await Student.findOne({ username }).select('notificationPrefs').lean();
    return mergePrefs(doc && doc.notificationPrefs);
  } catch (_e) {
    return mergePrefs(null);
  }
}

async function loadTeacherPrefs(teacherId) {
  try {
    const Teacher = require('../models/Teacher');
    const doc = await Teacher.findOne({
      $or: [{ teacherId: String(teacherId) }, { username: String(teacherId) }, { email: String(teacherId) }],
    })
      .select('notificationPrefs')
      .lean();
    return mergePrefs(doc && doc.notificationPrefs);
  } catch (_e) {
    return mergePrefs(null);
  }
}

async function alreadySent(Model, recipientField, recipientId, type, bookingId) {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  if (bookingId) {
    const hit = await Model.findOne({
      [recipientField]: recipientId,
      type: String(type),
      bookingId: String(bookingId),
      createdAt: { $gte: since },
    })
      .select('_id')
      .lean();
    return !!hit;
  }
  // Only a few non-booking types should be rate-limited to once/day
  const dayDedupe = new Set(['credits-low', 'credits-topup', 'trial-ending']);
  if (!dayDedupe.has(String(type))) return false;
  const dayHit = await Model.findOne({
    [recipientField]: recipientId,
    type: String(type),
    createdAt: { $gte: since },
  })
    .select('_id')
    .lean();
  return !!dayHit;
}

async function gateAndCreate({
  audience,
  recipientId,
  type,
  message,
  extra,
  prefs,
  Model,
  recipientField,
}) {
  const t = String(type || '');
  const rid = String(recipientId || '').trim();
  if (!rid || !t || !message) return null;

  const bookingId = extra.bookingId != null ? String(extra.bookingId) : null;
  const importance = extra.importance || (isActionableType(t) ? 'actionable' : 'fyi');
  const actionable = importance === 'actionable' || isActionableType(t);

  if (!prefAllows(prefs, t)) {
    await logDelivery({
      audience,
      recipientId: rid,
      type: t,
      bookingId,
      status: 'skipped_pref',
      reason: 'preference_off',
    });
    return null;
  }

  if (!actionable && inQuietHours(prefs)) {
    await logDelivery({
      audience,
      recipientId: rid,
      type: t,
      bookingId,
      status: 'skipped_quiet',
      reason: 'quiet_hours',
    });
    return null;
  }

  if (
    bookingId &&
    !extra.skipDedupe &&
    (await alreadySent(Model, recipientField, rid, t, bookingId))
  ) {
    await logDelivery({
      audience,
      recipientId: rid,
      type: t,
      bookingId,
      status: 'skipped_dedupe',
      reason: 'duplicate_booking_type',
    });
    return null;
  }

  try {
    const doc = await Model.create({
      [recipientField]: rid,
      type: t,
      message: String(message),
      read: false,
      senderId: extra.senderId != null ? String(extra.senderId) : null,
      bookingId,
      actionUrl: extra.actionUrl != null ? String(extra.actionUrl) : null,
      meta: extra.meta && typeof extra.meta === 'object' ? extra.meta : null,
      importance: actionable ? 'actionable' : 'fyi',
    });
    emitNotificationNew(audience, rid, doc);
    await logDelivery({
      audience,
      recipientId: rid,
      type: t,
      bookingId,
      status: 'sent',
    });
    return doc;
  } catch (e) {
    console.error(`[notify] ${audience} failed:`, e.message || e);
    await logDelivery({
      audience,
      recipientId: rid,
      type: t,
      bookingId,
      status: 'failed',
      reason: String(e.message || e).slice(0, 200),
    });
    return null;
  }
}

async function notifyTeacher(teacherId, type, message, extra = {}) {
  const tid = String(teacherId || '').trim();
  if (!tid) return null;
  const prefs = await loadTeacherPrefs(tid);
  return gateAndCreate({
    audience: 'teacher',
    recipientId: tid,
    type,
    message,
    extra,
    prefs,
    Model: Notification,
    recipientField: 'teacherId',
  });
}

async function notifyAdmin(type, message, extra = {}) {
  const usernames = new Set(['admin']);
  try {
    const admins = await Admin.find({}).select('username').limit(50).lean();
    for (const a of admins) {
      if (a && a.username) usernames.add(String(a.username));
    }
  } catch (_e) {
    /* ignore */
  }
  const created = [];
  for (const username of usernames) {
    const doc = await notifyTeacher(username, type, message, extra);
    if (doc) {
      emitNotificationNew('admin', username, doc);
      created.push(doc);
    }
  }
  return created;
}

async function notifyStudent(studentKey, type, message, extra = {}) {
  const username = await resolveStudentUsername(studentKey);
  if (!username) return null;
  const prefs = await loadStudentPrefs(username);
  return gateAndCreate({
    audience: 'student',
    recipientId: username,
    type,
    message,
    extra,
    prefs,
    Model: StudentNotification,
    recipientField: 'studentId',
  });
}

async function resolveStudentNotificationKeys(user) {
  const keys = new Set();
  const push = (v) => {
    const s = String(v || '').trim();
    if (s) keys.add(s);
  };
  push(user && user.username);
  push(user && user.email);
  push(user && user.studentId);
  push(user && user.id);
  push(user && user._id);
  try {
    const or = [];
    if (user && user.studentId && /^[a-f0-9]{24}$/i.test(String(user.studentId))) {
      or.push({ _id: String(user.studentId) });
    }
    if (user && user.username) or.push({ username: String(user.username) });
    if (user && user.email) or.push({ email: String(user.email).toLowerCase() });
    if (or.length) {
      const me = await Student.findOne({ $or: or }).select('username email _id').lean();
      if (me) {
        push(me.username);
        push(me.email);
        push(me._id);
      }
    }
  } catch (_e) {
    /* non-fatal */
  }
  return [...keys];
}

async function resolveTeacherNotificationRecipientIds(user) {
  const ids = new Set();
  const push = (v) => {
    const s = String(v || '').trim();
    if (s) ids.add(s);
  };
  push(user && user.teacherId);
  push(user && user.username);
  push(user && user.teacherMongoId);
  push(user && user.id);
  push(user && user._id);
  const tid = String((user && user.teacherId) || '');
  const atTid = tid.indexOf('@');
  if (atTid > 0) push(tid.slice(0, atTid));

  try {
    const Teacher = require('../models/Teacher');
    const or = [];
    if (user && user.teacherId) {
      or.push({ teacherId: String(user.teacherId) });
      or.push({ email: String(user.teacherId).toLowerCase() });
    }
    if (user && user.username) or.push({ username: String(user.username) });
    if (user && user.teacherMongoId) {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(String(user.teacherMongoId))) {
        or.push({ _id: String(user.teacherMongoId) });
      }
    }
    if (or.length) {
      const doc = await Teacher.findOne({ $or: or })
        .select('teacherId email username _id')
        .lean();
      if (doc) {
        push(doc.teacherId);
        push(doc.email);
        push(doc.username);
        push(doc._id);
        const email = String(doc.email || doc.teacherId || '');
        const at = email.indexOf('@');
        if (at > 0) push(email.slice(0, at));
      }
    }
  } catch (_e) {
    /* non-fatal */
  }
  return [...ids];
}

function enrichNotificationList(list) {
  return (list || []).map((n) => {
    const type = n.type;
    const importance = n.importance || (isActionableType(type) ? 'actionable' : 'fyi');
    return { ...n, importance, actionable: importance === 'actionable' };
  });
}

function countActionableUnread(list) {
  return enrichNotificationList(list).filter((n) => !n.read && n.actionable).length;
}

module.exports = {
  notifyTeacher,
  notifyStudent,
  notifyAdmin,
  resolveStudentUsername,
  resolveStudentNotificationKeys,
  emitNotificationNew,
  resolveTeacherNotificationRecipientIds,
  isActionableType,
  mergePrefs,
  DEFAULT_PREFS,
  RETENTION_DAYS,
  enrichNotificationList,
  countActionableUnread,
  TEACHER_ROOM,
  STUDENT_ROOM,
  ADMIN_ROOM,
};
