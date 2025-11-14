/**
 * Request Validation Middleware
 *
 * Provides consistent validation for request body, query params, and route params
 * using Zod schemas. Eliminates boilerplate validation code in routes.
 *
 * Usage:
 *   router.post('/', validateRequest({ body: createWorkSchema }), asyncHandler(...))
 *   router.get('/', validateRequest({ query: searchSchema }), asyncHandler(...))
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { sendBadRequest } from '../utils/apiResponse.js';

interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * Validates request data against provided Zod schemas
 * Forwards validation errors to error handler middleware
 */
export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate and transform body
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      // Validate and transform query parameters
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }

      // Validate and transform route parameters
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      next();
    } catch (error) {
      // Let the error handler middleware format Zod errors consistently
      next(error);
    }
  };
}

/**
 * Convenience wrapper for body-only validation (most common case)
 */
export function validateBody(schema: z.ZodTypeAny) {
  return validateRequest({ body: schema });
}

/**
 * Convenience wrapper for query-only validation
 */
export function validateQuery(schema: z.ZodTypeAny) {
  return validateRequest({ query: schema });
}

/**
 * Convenience wrapper for params-only validation
 */
export function validateParams(schema: z.ZodTypeAny) {
  return validateRequest({ params: schema });
}
