import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { AuditService } from '../../services/auditService.js';

const router = Router();

// Apply authentication to all admin routes
router.use(requireAuth);

// Get audit logs with filtering
router.get('/', requirePermission('admin.audit.view'), async (req, res) => {
  try {
    const filters = {
      userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
      action: req.query.action as string | undefined,
      resourceType: req.query.resourceType as string | undefined,
      status: req.query.status as string | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0
    };

    const logs = await AuditService.getLogs(filters);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get audit statistics
router.get('/stats', requirePermission('admin.audit.view'), async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const stats = await AuditService.getStats(days);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ error: 'Failed to fetch audit stats' });
  }
});

// Get user activity
router.get('/user/:userId', requirePermission('admin.audit.view'), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const activity = await AuditService.getUserActivity(userId, limit);
    res.json(activity);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ error: 'Failed to fetch user activity' });
  }
});

export default router;
