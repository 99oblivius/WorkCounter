/**
 * Custom Error Classes
 * Provides structured error handling with proper status codes
 *
 * Benefits:
 * - Type-safe error throwing
 * - Automatic HTTP status code assignment
 * - Better error discrimination in errorHandler middleware
 * - Eliminates need for manual status code tracking
 *
 * Usage:
 *   throw new NotFoundError('Work not found');
 *   throw new ValidationError('Invalid email format', { field: 'email' });
 *   throw new ConflictError('Username already exists');
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;
  public readonly isOperational: boolean; // Distinguishes expected errors from bugs

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly for instanceof checks to work
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 400 Bad Request - Invalid input data
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * 409 Conflict - Resource already exists or constraint violation
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

/**
 * 423 Locked - Resource is locked (e.g., account locked after too many attempts)
 */
export class LockedError extends AppError {
  constructor(message: string = 'Resource locked', details?: any) {
    super(message, 423, 'LOCKED', details);
    this.name = 'LockedError';
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', details?: any) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
    this.name = 'RateLimitError';
  }
}

/**
 * 500 Internal Server Error - Unexpected system error
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', isOperational: boolean = false) {
    super(message, 500, 'INTERNAL_ERROR', undefined, isOperational);
    this.name = 'InternalError';
  }
}

/**
 * Database constraint violation errors
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'DATABASE_ERROR', details, false); // Usually not operational
    this.name = 'DatabaseError';
  }
}

/**
 * Convert PostgreSQL error to appropriate AppError
 */
export function fromDatabaseError(error: any): AppError {
  const code = error.code;

  // PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
  switch (code) {
    case '23505': // unique_violation
      return new ConflictError('Duplicate entry', {
        field: error.constraint,
        detail: error.detail
      });

    case '23503': // foreign_key_violation
      return new ConflictError('Invalid reference', {
        constraint: error.constraint,
        detail: error.detail
      });

    case '23502': // not_null_violation
      return new ValidationError('Missing required field', {
        column: error.column,
        detail: error.detail
      });

    case '23514': // check_violation
      return new ValidationError('Invalid data', {
        constraint: error.constraint,
        detail: error.detail
      });

    case '22P02': // invalid_text_representation (e.g., invalid UUID)
      return new ValidationError('Invalid format', { detail: error.message });

    case '22001': // string_data_right_truncation
      return new ValidationError('Value too long', { detail: error.message });

    default:
      // Unknown database error - not operational
      return new DatabaseError(error.message, {
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
  }
}

/**
 * Type guard to check if error is an operational error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
