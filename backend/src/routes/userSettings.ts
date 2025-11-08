import { Router } from 'express';
import { z } from 'zod';
import { UserSettingsModel } from '../models/UserSettings.js';
import { requireAuth } from '../middleware/auth.js';

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
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user!.userId;
    const settings = await UserSettingsModel.getAll(userId);

    // Provide defaults if settings don't exist
    const defaultSettings = {
      theme: 'dark',
      accentColor: '#3b82f6',
      ...settings
    };

    res.json(defaultSettings);
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

/**
 * PATCH /api/user-settings
 * Update multiple settings at once for the current user
 */
router.patch('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user!.userId;

    // Validate input
    const validationResult = updateSettingsSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid settings',
        details: validationResult.error.errors
      });
    }

    const settings = validationResult.data;

    // Update settings in database
    await UserSettingsModel.setMultiple(userId, settings);

    // Return updated settings
    const updatedSettings = await UserSettingsModel.getAll(userId);

    res.json({
      message: 'Settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

/**
 * PUT /api/user-settings/:key
 * Update a single setting
 */
router.put('/:key', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user!.userId;
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ error: 'Value is required' });
    }

    // Validate based on key
    if (key === 'theme') {
      const result = themeSchema.safeParse(value);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid theme value. Must be "dark" or "light"' });
      }
    } else if (key === 'accentColor') {
      const result = accentColorSchema.safeParse(value);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid color value. Must be a hex color (e.g., #3b82f6)' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid setting key' });
    }

    await UserSettingsModel.set(userId, key, value);

    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * DELETE /api/user-settings/:key
 * Delete a single setting (will revert to default)
 */
router.delete('/:key', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user!.userId;
    const { key } = req.params;

    await UserSettingsModel.delete(userId, key);

    res.json({ message: 'Setting deleted successfully' });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

export default router;
