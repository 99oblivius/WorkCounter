import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { WorkModel } from '../models/Work.js';
import '../types/index.js';

const router = Router();

router.use(requireAuth);

router.get('/overview', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const workStats = await TimeSessionModel.getStatsByDateRange(userId, start, end);

    const worksMap = new Map();
    for (const stat of workStats) {
      const work = await WorkModel.findById(stat.work_id, userId);
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

    res.json({
      dateRange: { start, end },
      works: Array.from(worksMap.values()),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/today', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const workStats = await TimeSessionModel.getStatsByDateRange(userId, today, tomorrow);

    const totalMs = workStats.reduce((sum, stat) => sum + parseInt(stat.total_duration, 10), 0);

    res.json({
      totalDuration: totalMs,
      workCount: workStats.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
