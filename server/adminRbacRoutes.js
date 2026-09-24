const express = require('express');
const AdminRole = require('./models/AdminRole');
const {
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requireSuperAdminDb,
} = require('./authMiddleware');
const {
  seedAdminRbac,
  getPermissionsForRole,
  navVisibilityFromPermissions,
  catalogGrouped,
  slugifyRoleName,
  ALL_KEYS,
  SYSTEM_SLUGS,
  stripSuperAdminOnlyKeys,
} = require('./services/adminRbac');

const router = express.Router();

/**
 * Only own RBAC paths. This router is mounted at /api/admin *before* admin.js;
 * a blanket router.use(verifyAdminApiAuth) would run on every /api/admin/* request
 * (including POST /verify-2fa enrollment) and 403 enrollment JWTs that lack isAdmin.
 */
function isAdminRbacPath(p) {
  const path = String(p || '');
  return (
    path === '/me/permissions' ||
    path === '/permissions/catalog' ||
    path === '/roles' ||
    path === '/roles/options' ||
    path.startsWith('/roles/')
  );
}

router.use((req, res, next) => {
  if (!isAdminRbacPath(req.path)) {
    return next('router');
  }
  return verifyAdminApiAuth(req, res, () => {
    requireAdmin(req, res, () => {
      requireAdminTwoFactorSatisfied(req, res, () => {
        requireAdminSessionValid(req, res, next);
      });
    });
  });
});

router.get('/me/permissions', async (req, res) => {
  try {
    await seedAdminRbac().catch(() => {});
    const role = String(req.user.adminRole || 'super_admin').trim().toLowerCase() || 'super_admin';
    const permissions = await getPermissionsForRole(role);
    res.json({
      success: true,
      role,
      permissions,
      nav: navVisibilityFromPermissions(permissions),
      isSuperAdmin: role === 'super_admin',
    });
  } catch (e) {
    console.error('GET /me/permissions', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load permissions' });
  }
});

router.get('/permissions/catalog', requireSuperAdminDb, async (req, res) => {
  try {
    await seedAdminRbac();
    res.json({ success: true, groups: catalogGrouped(), allKeys: ALL_KEYS.slice() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/roles', requireSuperAdminDb, async (req, res) => {
  try {
    await seedAdminRbac();
    const roles = await AdminRole.find({}).sort({ isSystem: -1, name: 1 }).lean();
    res.json({
      success: true,
      roles: roles.map((r) => ({
        id: String(r._id),
        slug: r.slug,
        name: r.name,
        description: r.description || '',
        isSystem: !!r.isSystem,
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Lightweight list for User Management dropdown (any Super-Admin or HR who can edit users). */
router.get('/roles/options', async (req, res) => {
  try {
    await seedAdminRbac().catch(() => {});
    const role = String(req.user.adminRole || '').trim().toLowerCase();
    if (role !== 'super_admin' && role !== 'admin_hr') {
      // Still return system labels for display; assignment stays Super-Admin gated on POST /user
    }
    const roles = await AdminRole.find({}).sort({ isSystem: -1, name: 1 }).select('slug name isSystem').lean();
    res.json({
      success: true,
      roles: roles.map((r) => ({ slug: r.slug, name: r.name, isSystem: !!r.isSystem })),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/roles', requireSuperAdminDb, async (req, res) => {
  try {
    await seedAdminRbac();
    const name = String(req.body.name || '').trim();
    if (!name || name.length < 2) {
      return res.status(400).json({ success: false, message: 'Role name is required (min 2 characters).' });
    }
    let slug = slugifyRoleName(req.body.slug || name);
    if (SYSTEM_SLUGS.includes(slug) || slug === 'super_admin') {
      slug = slugifyRoleName('custom_' + name);
    }
    const exists = await AdminRole.findOne({ slug }).lean();
    if (exists) {
      return res.status(409).json({ success: false, message: 'A role with this slug already exists.' });
    }
    const permissions = Array.isArray(req.body.permissions)
      ? stripSuperAdminOnlyKeys(req.body.permissions.filter((k) => ALL_KEYS.includes(k)))
      : [];
    const doc = await AdminRole.create({
      slug,
      name,
      description: String(req.body.description || '').trim(),
      isSystem: false,
      permissions,
    });
    res.json({
      success: true,
      role: {
        id: String(doc._id),
        slug: doc.slug,
        name: doc.name,
        description: doc.description,
        isSystem: false,
        permissions: doc.permissions,
      },
    });
  } catch (e) {
    console.error('POST /roles', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/roles/:roleId/permissions', requireSuperAdminDb, async (req, res) => {
  try {
    await seedAdminRbac();
    const role = await AdminRole.findById(req.params.roleId);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.slug === 'super_admin') {
      role.permissions = ALL_KEYS.slice();
      await role.save();
      return res.json({
        success: true,
        message: 'Super-Admin always has full access.',
        role: {
          id: String(role._id),
          slug: role.slug,
          name: role.name,
          permissions: role.permissions,
        },
      });
    }
    const incoming = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    const next = stripSuperAdminOnlyKeys([
      ...new Set(incoming.map((k) => String(k)).filter((k) => ALL_KEYS.includes(k))),
    ]);
    role.permissions = next;
    if (req.body.name != null && String(req.body.name).trim()) {
      role.name = String(req.body.name).trim();
    }
    if (req.body.description != null) {
      role.description = String(req.body.description).trim();
    }
    await role.save();
    res.json({
      success: true,
      role: {
        id: String(role._id),
        slug: role.slug,
        name: role.name,
        description: role.description,
        isSystem: !!role.isSystem,
        permissions: role.permissions,
      },
    });
  } catch (e) {
    console.error('PUT /roles/:id/permissions', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
