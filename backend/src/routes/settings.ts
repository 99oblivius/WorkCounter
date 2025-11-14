import { Router } from 'express';
import { SettingsService } from '../services/settingsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();

// Get public settings (no auth required - for frontend)
router.get('/public', asyncHandler(async (req, res) => {
  const settings = await SettingsService.getPublicSettings();
  sendSuccess(res, settings);
}));

export default router;
