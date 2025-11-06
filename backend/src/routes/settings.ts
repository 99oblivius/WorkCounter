import { Router } from 'express';
import { SettingsService } from '../services/settingsService.js';

const router = Router();

// Get public settings (no auth required - for frontend)
router.get('/public', async (req, res) => {
  try {
    const settings = await SettingsService.getPublicSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching public settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

export default router;
