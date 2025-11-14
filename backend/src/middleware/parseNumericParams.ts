import { Request, Response, NextFunction } from 'express';
import { sendBadRequest } from '../utils/apiResponse.js';

/**
 * Middleware to safely parse numeric route parameters
 *
 * Usage:
 *   router.get('/:id', parseNumericParams(['id']), asyncHandler(async (req, res) => {
 *     const id = req.params.id as unknown as number; // Now guaranteed to be a valid number
 *   }));
 *
 * This eliminates the need for manual parseInt() calls and NaN checks throughout routes
 */
export function parseNumericParams(paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const paramName of paramNames) {
      const value = req.params[paramName];

      if (value === undefined) {
        continue; // Optional parameter not provided
      }

      const parsed = parseInt(value, 10);

      if (isNaN(parsed) || !Number.isFinite(parsed)) {
        return sendBadRequest(res, `Invalid ${paramName}: must be a valid integer`);
      }

      if (parsed < 1) {
        return sendBadRequest(res, `Invalid ${paramName}: must be greater than 0`);
      }

      if (parsed > Number.MAX_SAFE_INTEGER) {
        return sendBadRequest(res, `Invalid ${paramName}: value too large`);
      }

      // Store parsed value back into params (TypeScript will see it as string, but it's a validated number)
      req.params[paramName] = parsed.toString();
    }

    next();
  };
}

/**
 * Middleware to safely parse numeric query parameters
 *
 * Usage:
 *   router.get('/', parseNumericQuery(['limit', 'offset']), asyncHandler(async (req, res) => {
 *     const limit = req.query.limit as unknown as number;
 *   }));
 */
export function parseNumericQuery(paramNames: string[], options: { required?: boolean; min?: number; max?: number } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const paramName of paramNames) {
      const value = req.query[paramName];

      if (value === undefined || value === null || value === '') {
        if (options.required) {
          return sendBadRequest(res, `Missing required query parameter: ${paramName}`);
        }
        continue; // Optional parameter not provided
      }

      const parsed = parseInt(value as string, 10);

      if (isNaN(parsed) || !Number.isFinite(parsed)) {
        return sendBadRequest(res, `Invalid ${paramName}: must be a valid integer`);
      }

      if (options.min !== undefined && parsed < options.min) {
        return sendBadRequest(res, `Invalid ${paramName}: must be at least ${options.min}`);
      }

      if (options.max !== undefined && parsed > options.max) {
        return sendBadRequest(res, `Invalid ${paramName}: must be at most ${options.max}`);
      }

      // Store parsed value back into query
      req.query[paramName] = parsed.toString();
    }

    next();
  };
}
