/**
 * Admin Fee & Attendance — 1% of subscription gross per bi-monthly cutoff,
 * gated by completed 8-hour shifts.
 */
const express = require('express');
const Admin = require('./models/Admin');
const AdminAttendance = require('./models/AdminAttendance');
const AdminPayout = require('./models/AdminPayout');
const Student = require('./models/Student');
const TimeLog = require('./models/TimeLog');
const {
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
} = require('./authMiddleware');
const { REQUIRED_SHIFT_HOURS, syncAdminAttendanceFromTimeLog } = require('./services/adminAttendanceSync');

const router = express.Router();

router.use(verifyAdminApiAuth, requireAdmin, requireAdminTwoFactorSatisfied, requireAdminSessionValid);

const COMMISSION_RATE = 1; // percent

function parsePayPeriodKey(periodKey) {
  const m = String(periodKey || '').match(/^(\d{4})-(\d{2})-(1|2)$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), half: Number(m[3]) };
}

function getPayPeriodBoundsFromKey(periodKey) {
  const p = parsePayPeriodKey(periodKey);
  if (!p) return null;
  const start = new Date(p.year, p.month - 1, p.half === 1 ? 1 : 16, 0, 0, 0, 0);
  const end =
    p.half === 1
      ? new Date(p.year, p.month - 1, 15, 23, 59, 59, 999)
      : new Date(p.year, p.month, 0, 23, 59, 59, 999);
  return { start, end };
}

function getCurrentPayPeriodKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const half = date.getDate() <= 15 ? '1' : '2';
  return `${y}-${m}-${half}`;
}

function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function adminDisplayName(a) {
  const n = `${a.firstName || ''} ${a.lastName || ''}`.trim();
  return n || a.username || 'Admin';
}

function roleLabel(role) {
  const map = {
    super_admin: 'Super-Admin',
    admin_hr: 'HR',
    admin_accounting: 'Accounting',
    admin_qa: 'QA',
    admin_marketing: 'Marketing',
  };
  return map[role] || role || 'Admin';
}

async function sumSubscriptionGross(periodStart, periodEnd) {
  const students = await Student.find({ 'creditHistory.0': { $exists: true } })
    .select('creditHistory')
    .lean();
  let gross = 0;
  let purchaseCount = 0;
  for (const s of students) {
    for (const h of s.creditHistory || []) {
      if (!h) continue;
      const type = String(h.entryType || 'purchase').toLowerCase();
      if (type !== 'purchase') continue;
      const d = h.date ? new Date(h.date) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      if (d < periodStart || d > periodEnd) continue;
      const amt = Number(h.amountPaid) || 0;
      if (amt <= 0) continue;
      gross += amt;
      purchaseCount += 1;
    }
  }
  return {
    grossSales: Math.round(gross * 100) / 100,
    purchaseCount,
  };
}

async function ensureAttendanceFromTimeLogs(username, startYmd, endYmd) {
  const workerId = `admin:${String(username).toLowerCase()}`;
  const logs = await TimeLog.find({
    teacherId: workerId,
    logOwnerType: 'admin',
    date: { $gte: startYmd, $lte: endYmd },
  }).lean();
  for (const log of logs) {
    await syncAdminAttendanceFromTimeLog(log, username);
  }
}

function summarizeAttendanceRows(rows) {
  let totalHours = 0;
  let totalShifts = 0;
  let completedShifts = 0;
  for (const r of rows) {
    totalShifts += 1;
    totalHours += Number(r.totalHours) || 0;
    if (r.metEightHours || r.status === 'completed') completedShifts += 1;
  }
  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalShifts,
    completedShifts,
    eligible: completedShifts > 0,
  };
}

router.get('/summary', async (req, res) => {
  try {
    const periodKey = String(req.query.period || getCurrentPayPeriodKey()).trim();
    const bounds = getPayPeriodBoundsFromKey(periodKey);
    if (!bounds) {
      return res.status(400).json({
        success: false,
        message: 'period must be YYYY-MM-1 (1st–15th) or YYYY-MM-2 (16th–end).',
      });
    }

    const username = String(req.user.username || '').trim();
    const startYmd = ymd(bounds.start);
    const endYmd = ymd(bounds.end);

    await ensureAttendanceFromTimeLogs(username, startYmd, endYmd);

    const { grossSales, purchaseCount } = await sumSubscriptionGross(bounds.start, bounds.end);
    const commissionPool = Math.round(grossSales * (COMMISSION_RATE / 100) * 100) / 100;

    const attendance = await AdminAttendance.find({
      adminUsername: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      date: { $gte: startYmd, $lte: endYmd },
    })
      .sort({ date: -1 })
      .lean();

    const stats = summarizeAttendanceRows(attendance);
    const estimatedPayout = stats.eligible ? commissionPool : 0;

    const admin = await Admin.findOne({ username: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') })
      .select('username email firstName lastName adminRole status')
      .lean();

    const existingPayout = await AdminPayout.findOne({
      adminUsername: admin ? admin.username : username,
      periodKey,
    }).lean();

    res.json({
      success: true,
      periodKey,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      periodLabel:
        periodKey.endsWith('-1')
          ? `${startYmd} → ${endYmd} (Period 1 · 1st–15th)`
          : `${startYmd} → ${endYmd} (Period 2 · 16th–end)`,
      requiredShiftHours: REQUIRED_SHIFT_HOURS,
      commissionRate: COMMISSION_RATE,
      grossSales,
      purchaseCount,
      adminSharePercent: COMMISSION_RATE,
      adminShareAmount: commissionPool,
      totalEligibleHours: stats.totalHours,
      totalShifts: stats.totalShifts,
      completedShifts: stats.completedShifts,
      eligible: stats.eligible,
      estimatedPayout,
      payoutStatus: existingPayout ? existingPayout.status : 'none',
      admin: admin
        ? {
            username: admin.username,
            email: admin.email || '',
            name: adminDisplayName(admin),
            role: admin.adminRole,
            roleLabel: roleLabel(admin.adminRole),
          }
        : {
            username,
            email: '',
            name: username,
            role: req.user.adminRole || '',
            roleLabel: roleLabel(req.user.adminRole),
          },
      attendance,
    });
  } catch (e) {
    console.error('GET /admin-fee/summary', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load admin fee summary' });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const periodKey = String(req.query.period || getCurrentPayPeriodKey()).trim();
    const bounds = getPayPeriodBoundsFromKey(periodKey);
    if (!bounds) {
      return res.status(400).json({ success: false, message: 'Invalid period key' });
    }
    const username = String(req.user.username || '').trim();
    const startYmd = ymd(bounds.start);
    const endYmd = ymd(bounds.end);
    await ensureAttendanceFromTimeLogs(username, startYmd, endYmd);

    const rows = await AdminAttendance.find({
      adminUsername: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      date: { $gte: startYmd, $lte: endYmd },
    })
      .sort({ date: -1 })
      .lean();

    res.json({
      success: true,
      periodKey,
      requiredShiftHours: REQUIRED_SHIFT_HOURS,
      attendance: rows.map((r) => ({
        date: r.date,
        timeIn: r.timeIn,
        timeOut: r.timeOut,
        timeInLabel: r.timeInLabel,
        timeOutLabel: r.timeOutLabel,
        totalHours: r.totalHours,
        status: r.status,
        metEightHours: r.metEightHours,
        statusLabel:
          r.status === 'completed'
            ? '8h met'
            : r.status === 'short_shift'
              ? 'Under 8h'
              : r.status === 'clocked_in'
                ? 'In progress'
                : 'Incomplete',
      })),
    });
  } catch (e) {
    console.error('GET /admin-fee/attendance', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load attendance' });
  }
});

router.get('/payslip', async (req, res) => {
  try {
    const periodKey = String(req.query.period || getCurrentPayPeriodKey()).trim();
    const bounds = getPayPeriodBoundsFromKey(periodKey);
    if (!bounds) {
      return res.status(400).json({ success: false, message: 'Invalid period key' });
    }
    const username = String(req.user.username || '').trim();
    const startYmd = ymd(bounds.start);
    const endYmd = ymd(bounds.end);
    await ensureAttendanceFromTimeLogs(username, startYmd, endYmd);

    const { grossSales, purchaseCount } = await sumSubscriptionGross(bounds.start, bounds.end);
    const commissionPool = Math.round(grossSales * (COMMISSION_RATE / 100) * 100) / 100;

    const attendance = await AdminAttendance.find({
      adminUsername: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      date: { $gte: startYmd, $lte: endYmd },
    })
      .sort({ date: 1 })
      .lean();
    const stats = summarizeAttendanceRows(attendance);
    const netPayout = stats.eligible ? commissionPool : 0;

    const admin = await Admin.findOne({ username: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') })
      .select('username email firstName lastName adminRole')
      .lean();

    res.json({
      success: true,
      payslip: {
        company: 'RemoEdPH',
        periodKey,
        periodStart: bounds.start,
        periodEnd: bounds.end,
        periodLabel: `${startYmd} to ${endYmd}`,
        admin: {
          name: admin ? adminDisplayName(admin) : username,
          username: admin ? admin.username : username,
          email: (admin && admin.email) || '',
          role: admin ? roleLabel(admin.adminRole) : roleLabel(req.user.adminRole),
        },
        shiftSummary: {
          totalShifts: stats.totalShifts,
          completedShifts: stats.completedShifts,
          totalHours: stats.totalHours,
          requiredHoursPerShift: REQUIRED_SHIFT_HOURS,
          eligible: stats.eligible,
        },
        sales: {
          grossSubscriptionSales: grossSales,
          purchaseCount,
          commissionRate: COMMISSION_RATE,
          commissionAmount: commissionPool,
        },
        netPayout,
        generatedAt: new Date(),
      },
    });
  } catch (e) {
    console.error('GET /admin-fee/payslip', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to build payslip' });
  }
});

/** Persist a payslip snapshot for the current admin (idempotent per period). */
router.post('/record-payout', async (req, res) => {
  try {
    const periodKey = String(req.body.period || req.body.periodKey || getCurrentPayPeriodKey()).trim();
    const bounds = getPayPeriodBoundsFromKey(periodKey);
    if (!bounds) {
      return res.status(400).json({ success: false, message: 'Invalid period key' });
    }
    const username = String(req.user.username || '').trim();
    const startYmd = ymd(bounds.start);
    const endYmd = ymd(bounds.end);
    await ensureAttendanceFromTimeLogs(username, startYmd, endYmd);

    const { grossSales } = await sumSubscriptionGross(bounds.start, bounds.end);
    const commissionPool = Math.round(grossSales * (COMMISSION_RATE / 100) * 100) / 100;
    const attendance = await AdminAttendance.find({
      adminUsername: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      date: { $gte: startYmd, $lte: endYmd },
    }).lean();
    const stats = summarizeAttendanceRows(attendance);
    const totalAmount = stats.eligible ? commissionPool : 0;

    const admin = await Admin.findOne({ username: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') })
      .select('_id username')
      .lean();

    const doc = await AdminPayout.findOneAndUpdate(
      {
        adminUsername: admin ? admin.username : username,
        periodKey,
      },
      {
        $set: {
          adminId: admin ? admin._id : null,
          adminUsername: admin ? admin.username : username,
          periodKey,
          periodStart: bounds.start,
          periodEnd: bounds.end,
          grossSales,
          commissionRate: COMMISSION_RATE,
          totalAmount,
          totalHours: stats.totalHours,
          totalShifts: stats.totalShifts,
          completedShifts: stats.completedShifts,
          eligible: stats.eligible,
          status: 'generated',
          generatedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, payout: doc });
  } catch (e) {
    console.error('POST /admin-fee/record-payout', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to record payout' });
  }
});

/**
 * Accounting Hub — list every admin's fee for a cutoff (like teachers-weekly-salaries).
 */
router.get('/payroll', async (req, res) => {
  try {
    const periodKey = String(req.query.period || getCurrentPayPeriodKey()).trim();
    const bounds = getPayPeriodBoundsFromKey(periodKey);
    if (!bounds) {
      return res.status(400).json({ success: false, message: 'Invalid period key' });
    }
    const startYmd = ymd(bounds.start);
    const endYmd = ymd(bounds.end);
    const { grossSales, purchaseCount } = await sumSubscriptionGross(bounds.start, bounds.end);
    const commissionPool = Math.round(grossSales * (COMMISSION_RATE / 100) * 100) / 100;

    const admins = await Admin.find({ status: { $ne: 'suspended' } })
      .select('_id username email firstName lastName adminRole status')
      .lean();

    const existing = await AdminPayout.find({ periodKey }).lean();
    const byUser = {};
    existing.forEach((p) => {
      byUser[String(p.adminUsername || '').toLowerCase()] = p;
    });

    const rows = [];
    for (const a of admins) {
      await ensureAttendanceFromTimeLogs(a.username, startYmd, endYmd);
      const attendance = await AdminAttendance.find({
        adminUsername: new RegExp('^' + String(a.username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
        date: { $gte: startYmd, $lte: endYmd },
      }).lean();
      const stats = summarizeAttendanceRows(attendance);
      const amount = stats.eligible ? commissionPool : 0;
      const prev = byUser[String(a.username).toLowerCase()];
      const paymentStatus = prev && prev.status === 'paid' ? 'Paid' : amount > 0 ? 'Pending' : 'Ineligible';
      rows.push({
        adminId: String(a._id),
        username: a.username,
        name: adminDisplayName(a),
        email: a.email || '',
        role: roleLabel(a.adminRole),
        adminRole: a.adminRole,
        totalHours: stats.totalHours,
        totalShifts: stats.totalShifts,
        completedShifts: stats.completedShifts,
        eligible: stats.eligible,
        grossSales,
        commissionRate: COMMISSION_RATE,
        feeAmount: amount,
        paymentStatus,
        payoutId: prev ? String(prev._id) : null,
        paidAt: prev && prev.paidAt ? prev.paidAt : null,
      });
    }

    rows.sort((x, y) => String(x.name).localeCompare(String(y.name)));

    res.json({
      success: true,
      periodKey,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      weekPeriod: `${startYmd} to ${endYmd}`,
      grossSales,
      purchaseCount,
      commissionPool,
      requiredShiftHours: REQUIRED_SHIFT_HOURS,
      admins: rows,
    });
  } catch (e) {
    console.error('GET /admin-fee/payroll', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load admin payroll' });
  }
});

/**
 * Dispense admin fees for the period — marks eligible rows paid (like teacher dispense).
 */
router.post('/dispense', async (req, res) => {
  try {
    const periodKey = String(req.body.period || req.body.periodKey || getCurrentPayPeriodKey()).trim();
    const bounds = getPayPeriodBoundsFromKey(periodKey);
    if (!bounds) {
      return res.status(400).json({ success: false, message: 'Invalid period key' });
    }
    const startYmd = ymd(bounds.start);
    const endYmd = ymd(bounds.end);
    const { grossSales } = await sumSubscriptionGross(bounds.start, bounds.end);
    const commissionPool = Math.round(grossSales * (COMMISSION_RATE / 100) * 100) / 100;
    const paidBy = String(req.user.username || '');

    const admins = await Admin.find({ status: { $ne: 'suspended' } })
      .select('_id username email firstName lastName adminRole')
      .lean();

    const dispensed = [];
    const skipped = [];
    let notifyTeacher = null;
    try {
      notifyTeacher = require('./services/notifyService').notifyTeacher;
    } catch (_e) {}

    for (const a of admins) {
      await ensureAttendanceFromTimeLogs(a.username, startYmd, endYmd);
      const attendance = await AdminAttendance.find({
        adminUsername: new RegExp('^' + String(a.username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
        date: { $gte: startYmd, $lte: endYmd },
      }).lean();
      const stats = summarizeAttendanceRows(attendance);
      const amount = stats.eligible ? commissionPool : 0;

      const existing = await AdminPayout.findOne({
        adminUsername: a.username,
        periodKey,
      });

      if (existing && existing.status === 'paid') {
        skipped.push({ username: a.username, reason: 'already_paid', amount: existing.totalAmount });
        continue;
      }
      if (amount <= 0) {
        skipped.push({ username: a.username, reason: 'ineligible', amount: 0 });
        continue;
      }

      const doc = await AdminPayout.findOneAndUpdate(
        { adminUsername: a.username, periodKey },
        {
          $set: {
            adminId: a._id,
            adminUsername: a.username,
            periodKey,
            periodStart: bounds.start,
            periodEnd: bounds.end,
            grossSales,
            commissionRate: COMMISSION_RATE,
            totalAmount: amount,
            totalHours: stats.totalHours,
            totalShifts: stats.totalShifts,
            completedShifts: stats.completedShifts,
            eligible: true,
            status: 'paid',
            generatedAt: existing && existing.generatedAt ? existing.generatedAt : new Date(),
            paidAt: new Date(),
            paidBy,
            notes: `Dispensed by ${paidBy}`,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (typeof notifyTeacher === 'function') {
        try {
          await notifyTeacher(
            a.username,
            'salary',
            `Your admin fee of ₱${amount.toFixed(2)} for ${startYmd} – ${endYmd} has been dispensed.`
          );
        } catch (nErr) {
          console.warn('Admin fee notify failed:', a.username, nErr && nErr.message);
        }
      }

      dispensed.push({
        username: a.username,
        name: adminDisplayName(a),
        amount,
        payoutId: String(doc._id),
      });
    }

    res.json({
      success: true,
      periodKey,
      weekPeriod: `${startYmd} to ${endYmd}`,
      grossSales,
      commissionPool,
      dispensedAdmins: dispensed,
      skipped,
      message: `Dispensed to ${dispensed.length} admin(s).`,
    });
  } catch (e) {
    console.error('POST /admin-fee/dispense', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to dispense admin fees' });
  }
});

/**
 * Payment history for Admin Payroll (mirrors teacher payment-history filters).
 * Query: username (optional), status=paid|pending|all (optional).
 */
router.get('/payment-history', async (req, res) => {
  try {
    const usernameFilter = String(req.query.username || req.query.adminUsername || '').trim();
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const q = {};
    if (usernameFilter) {
      q.adminUsername = new RegExp(
        '^' + usernameFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
        'i'
      );
    }
    if (statusFilter === 'paid' || statusFilter === 'success') {
      q.status = 'paid';
    } else if (statusFilter === 'pending') {
      q.status = { $in: ['draft', 'generated'] };
    } else if (statusFilter === 'void') {
      q.status = 'void';
    }

    const rows = await AdminPayout.find(q).sort({ periodKey: -1, paidAt: -1, updatedAt: -1 }).limit(200).lean();
    const payments = rows.map((p) => {
      const paid = p.status === 'paid';
      return {
        _id: String(p._id),
        adminUsername: p.adminUsername,
        period: p.periodKey,
        periodKey: p.periodKey,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        amount: Number(p.totalAmount) || 0,
        grossSales: Number(p.grossSales) || 0,
        completedShifts: Number(p.completedShifts) || 0,
        totalHours: Number(p.totalHours) || 0,
        status: paid ? 'Success' : p.status === 'void' ? 'Void' : 'Pending',
        issueDate: p.paidAt || p.generatedAt || p.updatedAt || p.createdAt,
        paidBy: p.paidBy || '',
        notes: p.notes || '',
      };
    });

    res.json({ success: true, payments });
  } catch (e) {
    console.error('GET /admin-fee/payment-history', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load payment history' });
  }
});

/** Lightweight admin list for payment-history filter dropdown. */
router.get('/admins-filter-list', async (req, res) => {
  try {
    const admins = await Admin.find({ status: { $ne: 'suspended' } })
      .select('username email firstName lastName adminRole')
      .sort({ username: 1 })
      .lean();
    res.json({
      success: true,
      admins: admins.map((a) => ({
        username: a.username,
        email: a.email || '',
        name: adminDisplayName(a),
        role: roleLabel(a.adminRole),
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Failed to load admins' });
  }
});

module.exports = router;
module.exports.getCurrentPayPeriodKey = getCurrentPayPeriodKey;
module.exports.parsePayPeriodKey = parsePayPeriodKey;
