import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { SettingsService } from '../../services/settingsService.js';
import type { AuthenticatedRequest } from '../../middleware/rbac.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendBadRequest } from '../../utils/apiResponse.js';
import { idParamSchema } from '../../utils/commonSchemas.js';
import { parseNumericParams } from '../../middleware/parseNumericParams.js';
import { validateParams, validateBody } from '../../middleware/validateRequest.js';
import { rateLimiters } from '../../utils/rateLimiters.js';

const router = Router();

// Apply authentication and rate limiting to all admin routes
router.use(requireAuth);
router.use(rateLimiters.admin);

// Zod schema for category parameter
const categoryParamSchema = z.object({
  category: z.string().min(1).max(50)
});

// Get all settings (admin only)
router.get('/', requirePermission('admin.settings.view'), asyncHandler(async (req, res) => {
  const settings = await SettingsService.getAllSettings();
  sendSuccess(res, settings);
}));

// Get settings by category
router.get('/category/:category', requirePermission('admin.settings.view'), validateParams(categoryParamSchema), asyncHandler(async (req, res) => {
  const { category } = req.params;
  const settings = await SettingsService.getByCategory(category);
  sendSuccess(res, settings);
}));

// Zod schema for setting update
const settingKeyParamSchema = z.object({
  key: z.string().min(1).max(100)
});

const settingValueSchema = z.object({
  value: z.union([
    z.string().max(10000),
    z.number(),
    z.boolean(),
    z.null()
  ])
});

// Update setting
router.patch('/:key', requirePermission('admin.settings.edit'), validateParams(settingKeyParamSchema), validateBody(settingValueSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { key } = req.params;
  const { value } = req.body;

  try {
    await SettingsService.set(
      key,
      value,
      req.user!.userId,
      req.ip,
      req.get('user-agent')
    );

    sendSuccess(res, { success: true });
  } catch (error: any) {
    console.error('Error updating setting:', error);
    sendBadRequest(res, error.message || 'Failed to update setting');
  }
}));

// Get setting history
router.get('/:id/history', requirePermission('admin.settings.view'), parseNumericParams(['id']), validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const history = await SettingsService.getHistory(id as unknown as number);

  sendSuccess(res, history);
}));

export default router;
