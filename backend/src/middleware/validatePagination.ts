import { Request, Response, NextFunction } from 'express';
import { sendBadRequest } from '../utils/apiResponse.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const MAX_LIMIT = 100;
const MAX_OFFSET = 1000000; // 1 million records max offset (prevents abuse)

interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  defaultOffset?: number;
  maxOffset?: number;
}

/**
 * Middleware to validate and enforce pagination parameters
 *
 * Prevents unbounded queries by enforcing maximum limits
 * Provides safe defaults for missing parameters
 *
 * Usage:
 *   router.get('/', validatePagination(), asyncHandler(async (req, res) => {
 *     const limit = parseInt(req.query.limit as string);  // Guaranteed safe
 *     const offset = parseInt(req.query.offset as string); // Guaranteed safe
 *   }));
 *
 * Custom limits:
 *   router.get('/', validatePagination({ maxLimit: 25 }), asyncHandler(...));
 */
export function validatePagination(options: PaginationOptions = {}) {
  const {
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
    defaultOffset = DEFAULT_OFFSET,
    maxOffset = MAX_OFFSET,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Parse limit
    let limit = defaultLimit;
    if (req.query.limit) {
      const parsed = parseInt(req.query.limit as string, 10);

      if (isNaN(parsed) || !Number.isFinite(parsed)) {
        return sendBadRequest(res, 'Invalid limit: must be a valid integer');
      }

      if (parsed < 1) {
        return sendBadRequest(res, 'Invalid limit: must be at least 1');
      }

      if (parsed > maxLimit) {
        return sendBadRequest(res, `Invalid limit: must not exceed ${maxLimit}`);
      }

      limit = parsed;
    }

    // Parse offset
    let offset = defaultOffset;
    if (req.query.offset) {
      const parsed = parseInt(req.query.offset as string, 10);

      if (isNaN(parsed) || !Number.isFinite(parsed)) {
        return sendBadRequest(res, 'Invalid offset: must be a valid integer');
      }

      if (parsed < 0) {
        return sendBadRequest(res, 'Invalid offset: must be non-negative');
      }

      if (parsed > maxOffset) {
        return sendBadRequest(res, `Invalid offset: too large (max ${maxOffset})`);
      }

      offset = parsed;
    }

    // Store validated values back into query
    req.query.limit = limit.toString();
    req.query.offset = offset.toString();

    next();
  };
}
