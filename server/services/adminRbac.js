/**
 * Dynamic Admin RBAC — permission catalog, role seeds, and lookups.
 * Super-Admin always bypasses. Other roles resolve from AdminRole.permissions.
 */
const AdminRole = require('../models/AdminRole');
const AdminPermission = require('../models/AdminPermission');

const SYSTEM_SLUGS = ['super_admin', 'admin_hr', 'admin_accounting', 'admin_qa', 'admin_marketing'];

/** @type {{ key: string, module: string, label: string, description?: string, sortOrder?: number }[]} */
const PERMISSION_CATALOG = [
  // Navigation
  { key: 'nav:dashboard', module: 'General', label: 'Dashboard', sortOrder: 10 },
  { key: 'nav:hr_hub', module: 'HR Hub', label: 'HR Hub (sidebar)', sortOrder: 20 },
  { key: 'nav:qa_hub', module: 'QA Hub', label: 'QA Hub (sidebar)', sortOrder: 30 },
  { key: 'nav:accounting_hub', module: 'Accounting Hub', label: 'Accounting Hub (sidebar)', sortOrder: 40 },
  { key: 'nav:admin_fee', module: 'Admin Fee', label: 'Admin Fee (sidebar)', sortOrder: 45 },
  { key: 'nav:marketing', module: 'Marketing Hub', label: 'Marketing Hub (sidebar)', sortOrder: 50 },
  { key: 'nav:leaderboard', module: 'General', label: 'Leaderboard', sortOrder: 60 },
  { key: 'nav:announcements', module: 'General', label: 'Announcements', sortOrder: 70 },
  { key: 'nav:videos', module: 'General', label: 'Videos', sortOrder: 80 },
  { key: 'nav:reports', module: 'General', label: 'Reports', sortOrder: 90 },
  { key: 'nav:messages', module: 'General', label: 'Messages', sortOrder: 100 },
  { key: 'nav:profile_settings', module: 'General', label: 'Profile settings', sortOrder: 110 },
  { key: 'nav:settings', module: 'System', label: 'Settings (System)', sortOrder: 200 },
  { key: 'nav:super_monitor', module: 'System', label: 'System monitor', sortOrder: 210 },
  // QA
  { key: 'qa:lessons_view', module: 'QA Hub', label: 'Lesson Library — View', sortOrder: 300 },
  { key: 'qa:lessons_edit', module: 'QA Hub', label: 'Lesson Library — Add/Edit', sortOrder: 310 },
  { key: 'qa:lessons_upload', module: 'QA Hub', label: 'Lesson Library — Upload', sortOrder: 320 },
  { key: 'qa:lessons_delete', module: 'QA Hub', label: 'Lesson Library — Delete', sortOrder: 330 },
  { key: 'qa:recordings_view', module: 'QA Hub', label: 'Class Recordings — View', sortOrder: 340 },
  { key: 'qa:issues_view', module: 'QA Hub', label: 'Issue Management — View', sortOrder: 350 },
  { key: 'qa:issues_manage', module: 'QA Hub', label: 'Issue Management — Manage', sortOrder: 360 },
  // HR
  { key: 'hr:users_view', module: 'HR Hub', label: 'Staff Directory — View', sortOrder: 400 },
  { key: 'hr:users_edit', module: 'HR Hub', label: 'Staff Directory — Edit', sortOrder: 410 },
  { key: 'hr:documents', module: 'HR Hub', label: 'HR Documents', sortOrder: 420 },
  { key: 'hr:pipeline', module: 'HR Hub', label: 'Teacher Pipeline', sortOrder: 430 },
  { key: 'hr:training', module: 'HR Hub', label: 'Teacher Training', sortOrder: 440 },
  { key: 'hr:schedule', module: 'HR Hub', label: 'Teacher Schedule', sortOrder: 450 },
  { key: 'hr:assessments', module: 'HR Hub', label: 'Teacher Assessments', sortOrder: 460 },
  { key: 'hr:time_override', module: 'HR Hub', label: 'Clock In/Out Override', sortOrder: 470 },
  // Accounting
  { key: 'acct:payroll_view', module: 'Accounting Hub', label: 'Payroll — View', sortOrder: 500 },
  { key: 'acct:payroll_dispense', module: 'Accounting Hub', label: 'Payroll — Dispense / Save', sortOrder: 510 },
  { key: 'acct:subscriptions_view', module: 'Accounting Hub', label: 'Student Subscriptions — View', sortOrder: 520 },
  { key: 'acct:export', module: 'Accounting Hub', label: 'Export Reports', sortOrder: 530 },
  // Fee
  { key: 'fee:view', module: 'Admin Fee', label: 'Admin Fee — View', sortOrder: 550 },
  { key: 'fee:payslip', module: 'Admin Fee', label: 'Admin Fee — Generate Payslip', sortOrder: 560 },
  // Marketing
  { key: 'mkt:commissions_view', module: 'Marketing Hub', label: 'Unique Link Commissions', sortOrder: 600 },
  { key: 'mkt:announcements_create', module: 'Marketing Hub', label: 'Create / Edit Announcements', sortOrder: 610 },
  // System
  { key: 'system:settings', module: 'System', label: 'System Settings APIs', sortOrder: 700 },
  { key: 'system:maintenance', module: 'System', label: 'Maintenance / Cleanup', sortOrder: 710 },
];

const ALL_KEYS = PERMISSION_CATALOG.map((p) => p.key);

const SHARED_GENERAL = [
  'nav:dashboard',
  'nav:leaderboard',
  'nav:announcements',
  'nav:videos',
  'nav:reports',
  'nav:messages',
  'nav:profile_settings',
  'nav:admin_fee',
  'fee:view',
  'fee:payslip',
];

/** Legacy hardcoded matrices → permission keys (excluding super_admin). */
const ROLE_SEED_PERMISSIONS = {
  super_admin: ALL_KEYS.slice(),
  admin_hr: [
    ...SHARED_GENERAL,
    'nav:hr_hub',
    'hr:users_view',
    'hr:users_edit',
    'hr:documents',
    'hr:pipeline',
    'hr:training',
    'hr:schedule',
    'hr:assessments',
    'hr:time_override',
  ],
  admin_qa: [
    ...SHARED_GENERAL,
    'nav:qa_hub',
    'qa:lessons_view',
    'qa:lessons_edit',
    'qa:lessons_upload',
    'qa:lessons_delete',
    'qa:recordings_view',
    'qa:issues_view',
    'qa:issues_manage',
  ],
  admin_accounting: [
    ...SHARED_GENERAL,
    'nav:accounting_hub',
    'nav:marketing',
    'acct:payroll_view',
    'acct:payroll_dispense',
    'acct:subscriptions_view',
    'acct:export',
    'mkt:commissions_view',
  ],
  admin_marketing: [
    'nav:dashboard',
    'nav:marketing',
    'nav:admin_fee',
    'nav:leaderboard',
    'nav:announcements',
    'nav:videos',
    'nav:reports',
    'nav:messages',
    'nav:profile_settings',
    'fee:view',
    'fee:payslip',
    'mkt:commissions_view',
    'mkt:announcements_create',
  ],
};

const ROLE_META = {
  super_admin: { name: 'Super-Admin', description: 'Full portal access' },
  admin_hr: { name: 'Admin — HR', description: 'HR Hub and staff management' },
  admin_qa: { name: 'Admin — QA', description: 'QA Hub, lessons, recordings, issues' },
  admin_accounting: { name: 'Admin — Accounting', description: 'Payroll, subscriptions, commissions view' },
  admin_marketing: { name: 'Admin — Marketing', description: 'Marketing Hub and shared ops pages' },
};

/** Never grantable to non–Super-Admin (System Settings + Admin Roles UI + Monitor). */
const SUPER_ADMIN_ONLY_KEYS = ['nav:settings', 'nav:super_monitor', 'system:settings'];

function stripSuperAdminOnlyKeys(keys) {
  const deny = new Set(SUPER_ADMIN_ONLY_KEYS);
  return (Array.isArray(keys) ? keys : []).filter((k) => !deny.has(String(k)));
}

/** Sidebar item id → permission key */
const NAV_ID_TO_PERM = {
  dashboard: 'nav:dashboard',
  'hr-hub': 'nav:hr_hub',
  'qa-hub': 'nav:qa_hub',
  'accounting-hub': 'nav:accounting_hub',
  'admin-fee': 'nav:admin_fee',
  marketing: 'nav:marketing',
  leaderboard: 'nav:leaderboard',
  announcements: 'nav:announcements',
  videos: 'nav:videos',
  reports: 'nav:reports',
  messages: 'nav:messages',
  'profile-settings': 'nav:profile_settings',
  settings: 'nav:settings',
  'super-monitor': 'nav:super_monitor',
  logout: null, // always visible
};

/** Path fragment → required permission (first match wins) */
const PATH_PERMISSION_RULES = [
  { re: /admin-settings|\/settings\/|super-monitor/, key: 'nav:settings' },
  { re: /admin-hr-hub|admin-users|admin-hr-documents|admin-teacher-pipeline|admin-teacher-training|admin-teacher-schedule|admin-teacher-assessments|admin-assessment-answer-key/, key: 'nav:hr_hub' },
  { re: /admin-qa-hub|admin-lessons-library|admin-classroom-recordings|admin-issue-management/, key: 'nav:qa_hub' },
  { re: /admin-accounting-hub|admin-payroll|admin-student-subscriptions/, key: 'nav:accounting_hub' },
  { re: /admin-fee/, key: 'nav:admin_fee' },
  { re: /admin-marketing-hub|admin-unique-link-commission/, key: 'nav:marketing' },
  { re: /admin-announcements/, key: 'nav:announcements' },
  { re: /admin-videos/, key: 'nav:videos' },
  { re: /admin-reports/, key: 'nav:reports' },
  { re: /admin-messages/, key: 'nav:messages' },
  { re: /leaderboard/, key: 'nav:leaderboard' },
  { re: /admin-dashboard/, key: 'nav:dashboard' },
  { re: /admin-profile-settings/, key: 'nav:profile_settings' },
];

/** API path patterns → required permission (for adminRoleGate augmentation) */
const API_PATH_PERMISSION_RULES = [
  { re: /\/settings\/|\/maintenance|\/cleanup\//, key: 'system:settings' },
  { re: /\/dispense|teachers-weekly-salaries|teacher-period-incentive|admin-fee\/dispense|admin-fee\/payroll/, key: 'acct:payroll_dispense' },
  { re: /student-subscriptions/, key: 'acct:subscriptions_view' },
  { re: /\/issues|issue-reports/, key: 'qa:issues_view' },
  { re: /classroom-recordings/, key: 'qa:recordings_view' },
  { re: /teacher-pipeline/, key: 'hr:pipeline' },
  { re: /unique-link|referral-link/, key: 'mkt:commissions_view' },
  { re: /^\/user(\/|$|\?)/, key: 'hr:users_edit' },
  { re: /admins-list|^\/admins$|teachers-list|students-list/, key: 'hr:users_view' },
  { re: /admin-fee/, key: 'fee:view' },
];

let seedPromise = null;

function slugifyRoleName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'custom_role';
}

async function seedAdminRbac() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    for (const p of PERMISSION_CATALOG) {
      await AdminPermission.findOneAndUpdate(
        { key: p.key },
        {
          $set: {
            key: p.key,
            module: p.module,
            label: p.label,
            description: p.description || '',
            sortOrder: p.sortOrder || 0,
          },
        },
        { upsert: true, new: true }
      );
    }
    for (const slug of SYSTEM_SLUGS) {
      const meta = ROLE_META[slug] || { name: slug, description: '' };
      const perms = ROLE_SEED_PERMISSIONS[slug] || [];
      const existing = await AdminRole.findOne({ slug }).lean();
      if (!existing) {
        await AdminRole.create({
          slug,
          name: meta.name,
          description: meta.description,
          isSystem: true,
          permissions: perms,
        });
      } else if (!Array.isArray(existing.permissions) || !existing.permissions.length) {
        await AdminRole.updateOne(
          { slug },
          { $set: { permissions: perms, isSystem: true, name: meta.name } }
        );
      }
    }
    return true;
  })().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

async function getPermissionsForRole(slug) {
  const role = String(slug || 'super_admin').trim().toLowerCase() || 'super_admin';
  if (role === 'super_admin') return ALL_KEYS.slice();
  await seedAdminRbac().catch(() => {});
  const doc = await AdminRole.findOne({ slug: role }).lean();
  let perms = [];
  if (doc && Array.isArray(doc.permissions)) perms = doc.permissions.slice();
  else if (ROLE_SEED_PERMISSIONS[role]) perms = ROLE_SEED_PERMISSIONS[role].slice();
  return stripSuperAdminOnlyKeys(perms);
}

async function roleHas(slug, permissionKey) {
  const role = String(slug || '').trim().toLowerCase();
  if (!role || role === 'super_admin') return true;
  if (!permissionKey) return true;
  const perms = await getPermissionsForRole(role);
  return perms.includes(permissionKey);
}

function permissionForNavId(navId) {
  if (Object.prototype.hasOwnProperty.call(NAV_ID_TO_PERM, navId)) {
    return NAV_ID_TO_PERM[navId];
  }
  return null;
}

function permissionForPagePath(pathname) {
  const p = String(pathname || '');
  for (const rule of PATH_PERMISSION_RULES) {
    if (rule.re.test(p)) return rule.key;
  }
  return null;
}

function permissionForApiPath(path) {
  const p = String(path || '');
  for (const rule of API_PATH_PERMISSION_RULES) {
    if (rule.re.test(p)) return rule.key;
  }
  return null;
}

function navVisibilityFromPermissions(permissions) {
  const set = new Set(permissions || []);
  const nav = {};
  Object.keys(NAV_ID_TO_PERM).forEach((id) => {
    const key = NAV_ID_TO_PERM[id];
    nav[id] = key == null ? true : set.has(key);
  });
  return nav;
}

function catalogGrouped() {
  const groups = {};
  PERMISSION_CATALOG.forEach((p) => {
    if (!groups[p.module]) groups[p.module] = [];
    groups[p.module].push(p);
  });
  return Object.keys(groups)
    .sort()
    .map((module) => ({
      module,
      permissions: groups[module].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    }));
}

module.exports = {
  SYSTEM_SLUGS,
  SUPER_ADMIN_ONLY_KEYS,
  stripSuperAdminOnlyKeys,
  PERMISSION_CATALOG,
  ALL_KEYS,
  ROLE_SEED_PERMISSIONS,
  ROLE_META,
  NAV_ID_TO_PERM,
  seedAdminRbac,
  getPermissionsForRole,
  roleHas,
  permissionForNavId,
  permissionForPagePath,
  permissionForApiPath,
  navVisibilityFromPermissions,
  catalogGrouped,
  slugifyRoleName,
};
