import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { SettingsService } from '../../services/settingsService.js';
import type { AuthenticatedRequest } from '../../middleware/rbac.js';

const router = Router();

// Apply authentication to all admin routes
router.use(requireAuth);

// Get all settings (admin only)
router.get('/', requirePermission('admin.settings.view'), async (req, res) => {
  try {
    const settings = await SettingsService.getAllSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get settings by category
router.get('/category/:category', requirePermission('admin.settings.view'), async (req, res) => {
  try {
    const settings = await SettingsService.getByCategory(req.params.category);
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update setting
router.patch('/:key', requirePermission('admin.settings.edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    await SettingsService.set(
      key,
      value,
      req.user!.userId,
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating setting:', error);
    res.status(400).json({ error: error.message || 'Failed to update setting' });
  }
});

// Get setting history
router.get('/:id/history', requirePermission('admin.settings.view'), async (req, res) => {
  try {
    const settingId = parseInt(req.params.id);
    const history = await SettingsService.getHistory(settingId);

    res.json(history);
  } catch (error) {
    console.error('Error fetching setting history:', error);
    res.status(500).json({ error: 'Failed to fetch setting history' });
  }
});

export default router;
