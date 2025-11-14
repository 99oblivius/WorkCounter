import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { AuditService } from '../../services/auditService.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendBadRequest } from '../../utils/apiResponse.js';
import { paginationSchema, dateRangeSchema, userIdParamSchema } from '../../utils/commonSchemas.js';
import { parseNumericParams } from '../../middleware/parseNumericParams.js';
import { validatePagination } from '../../middleware/validatePagination.js';
import { validateQuery, validateParams } from '../../middleware/validateRequest.js';
import { rateLimiters } from '../../utils/rateLimiters.js';

const router = Router();

// Apply authentication and rate limiting to all admin routes
router.use(requireAuth);
router.use(rateLimiters.admin);

// Zod schema for audit log filters
const auditFiltersSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  action: z.string().min(1).max(100).optional(),
  resourceType: z.string().min(1).max(50).optional(),
  status: z.enum(['success', 'failure', 'warning']).optional(),
  ...dateRangeSchema.shape,
  ...paginationSchema.shape
});

// Get audit logs with filtering
router.get('/', requirePermission('admin.audit.view'), validatePagination(), validateQuery(auditFiltersSchema), asyncHandler(async (req, res) => {
  const { startDate, endDate, ...filters } = req.query;

  // Convert datetime strings to Date objects
  const parsedFilters = {
    ...filters,
    startDate: startDate ? new Date(startDate as string) : undefined,
    endDate: endDate ? new Date(endDate as string) : undefined
  };

  const logs = await AuditService.getLogs(parsedFilters);
  sendSuccess(res, logs);
}));

// Zod schema for stats query
const auditStatsSchema = z.object({
  days: z.coerce.number().int().positive().min(1).max(3650).default(30)
});

// Get audit statistics
router.get('/stats', requirePermission('admin.audit.view'), validateQuery(auditStatsSchema), asyncHandler(async (req, res) => {
  const { days } = req.query;
  const stats = await AuditService.getStats(days as unknown as number);

  sendSuccess(res, stats);
}));

// Zod schema for user activity query
const userActivitySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20)
});

// Get user activity
router.get('/user/:userId', requirePermission('admin.audit.view'), parseNumericParams(['userId']), validateQuery(userActivitySchema), validateParams(userIdParamSchema), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { limit } = req.query;

  const activity = await AuditService.getUserActivity(userId as unknown as number, limit as unknown as number);
  sendSuccess(res, activity);
}));

export default router;
