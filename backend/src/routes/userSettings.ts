import { Router } from 'express';
import { z } from 'zod';
import { UserSettingsModel } from '../models/UserSettings.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validateRequest.js';
import { sendSuccess, sendBadRequest, sendInternalError } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Validation schemas
const themeSchema = z.enum(['dark', 'light']);
const accentColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color');

const updateSettingsSchema = z.object({
  theme: themeSchema.optional(),
  accentColor: accentColorSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one setting must be provided'
});

/**
 * GET /api/user-settings
 * Get all settings for the current user
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const settings = await UserSettingsModel.getAll(userId);

  // Provide defaults if settings don't exist
  const defaultSettings = {
    theme: 'dark',
    accentColor: '#3b82f6',
    ...settings
  };

  sendSuccess(res, defaultSettings);
}));

/**
 * PATCH /api/user-settings
 * Update multiple settings at once for the current user
 */
router.patch('/', requireAuth, validateBody(updateSettingsSchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const settings = req.body;

  // Update settings in database
  await UserSettingsModel.setMultiple(userId, settings);

  // Return updated settings
  const updatedSettings = await UserSettingsModel.getAll(userId);

  sendSuccess(res, {
    message: 'Settings updated successfully',
    settings: updatedSettings
  });
}));

/**
 * PUT /api/user-settings/:key
 * Update a single setting
 */
router.put('/:key', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const { key } = req.params;
  const { value } = req.body;

  if (!value) {
    return sendBadRequest(res, 'Value is required');
  }

  // Validate based on key
  if (key === 'theme') {
    const result = themeSchema.safeParse(value);
    if (!result.success) {
      return sendBadRequest(res, 'Invalid theme value. Must be "dark" or "light"');
    }
  } else if (key === 'accentColor') {
    const result = accentColorSchema.safeParse(value);
    if (!result.success) {
      return sendBadRequest(res, 'Invalid color value. Must be a hex color (e.g., #3b82f6)');
    }
  } else {
    return sendBadRequest(res, 'Invalid setting key');
  }

  await UserSettingsModel.set(userId, key, value);

  sendSuccess(res, { message: 'Setting updated successfully' });
}));

/**
 * DELETE /api/user-settings/:key
 * Delete a single setting (will revert to default)
 */
router.delete('/:key', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const { key } = req.params;

  await UserSettingsModel.delete(userId, key);

  sendSuccess(res, { message: 'Setting deleted successfully' });
}));

export default router;
