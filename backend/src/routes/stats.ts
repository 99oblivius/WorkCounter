import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validateRequest.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { WorkModel } from '../models/Work.js';
import { query } from '../config/database.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { dateRangeSchema } from '../utils/commonSchemas.js';
import '../types/index.js';

const router = Router();

router.use(requireAuth);

router.get('/overview', validateQuery(dateRangeSchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;

  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

  // Convert validated ISO datetime strings to Date objects
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const workStats = await TimeSessionModel.getStatsByDateRange(userId, start, end);

  // FIX: Fetch all works in a single query instead of N queries (N+1 problem)
  const workIds = workStats.map(stat => stat.work_id);

  if (workIds.length === 0) {
    return sendSuccess(res, {
      dateRange: { start, end },
      works: [],
    });
  }

  // Fetch all works that the user has access to (owner or shared with)
  const worksResult = await query<{
    id: number;
    title: string;
    description: string | null;
    client_name: string | null;
    hourly_rate: number | null;
    status: string;
    tags: string[] | null;
    user_id: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT DISTINCT w.*
     FROM works w
     LEFT JOIN work_shares ws ON w.id = ws.work_id AND ws.shared_with_user_id = $1
     WHERE w.id = ANY($2) AND (w.user_id = $1 OR ws.shared_with_user_id = $1)`,
    [userId, workIds]
  );

  // Build a map of work_id -> work for O(1) lookup
  const worksById = new Map();
  worksResult.rows.forEach(work => {
    worksById.set(work.id, work);
  });

  // Build the response with stats + work data
  const worksMap = new Map();
  for (const stat of workStats) {
    const work = worksById.get(stat.work_id);
    if (work) {
      worksMap.set(stat.work_id, {
        work,
        totalDuration: parseInt(stat.total_duration, 10),
        estimatedEarnings: work.hourly_rate
          ? (parseInt(stat.total_duration, 10) / (1000 * 60 * 60)) * work.hourly_rate
          : null,
      });
    }
  }

  sendSuccess(res, {
    dateRange: { start, end },
    works: Array.from(worksMap.values()),
  });
}));

router.get('/today', asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const workStats = await TimeSessionModel.getStatsByDateRange(userId, today, tomorrow);

  const totalMs = workStats.reduce((sum, stat) => sum + parseInt(stat.total_duration, 10), 0);

  sendSuccess(res, {
    totalDuration: totalMs,
    workCount: workStats.length,
  });
}));

export default router;
