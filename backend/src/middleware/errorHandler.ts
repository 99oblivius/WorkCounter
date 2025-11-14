import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { sendError } from '../utils/apiResponse.js';
import { AppError, fromDatabaseError, isOperationalError } from '../utils/errors.js';

/**
 * Centralized error handling middleware
 * Provides consistent error response format across all endpoints
 *
 * ENHANCED: Now handles custom error classes with proper status codes
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);

  // Custom application errors (ValidationError, NotFoundError, etc.)
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode, err.details);
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    return sendError(res, 'Validation error', 400, err.errors);
  }

  // Database errors (PostgreSQL constraint violations, etc.)
  if (err instanceof Error && 'code' in err && typeof (err as any).code === 'string') {
    const dbError = fromDatabaseError(err);
    return sendError(res, dbError.message, dbError.statusCode, dbError.details);
  }

  // Unauthorized errors (from auth middleware - legacy support)
  if (err.name === 'UnauthorizedError') {
    return sendError(res, 'Unauthorized', 401);
  }

  // Unexpected errors (bugs, system failures)
  // Log full stack trace for debugging
  if (!isOperationalError(err)) {
    console.error('UNEXPECTED ERROR:', err.stack);
  }

  // In production, hide error details; in development, show full error message
  const errorMessage = env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  sendError(res, errorMessage, 500);
}
