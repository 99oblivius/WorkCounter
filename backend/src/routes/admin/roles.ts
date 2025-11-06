import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { RoleService } from '../../services/roleService.js';

const router = Router();

// Apply authentication to all admin routes
router.use(requireAuth);

// Get all roles with permissions
router.get('/', requirePermission('admin.users.view'), async (req, res) => {
  try {
    const roles = await RoleService.getAllRoles();
    res.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Get all permissions grouped by category
router.get('/permissions', requirePermission('admin.users.view'), async (req, res) => {
  try {
    const permissions = await RoleService.getAllPermissions();
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

export default router;
