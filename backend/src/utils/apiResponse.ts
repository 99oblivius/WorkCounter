import type { Response } from 'express';

/**
 * Standardized API response utilities
 * Ensures consistent response format across all endpoints
 */

/**
 * Standard error response shape
 */
export interface ErrorResponse {
  error: string;
  details?: any;
}

/**
 * Send a successful JSON response
 * @param res - Express response object
 * @param data - Data to send (can be any JSON-serializable value)
 * @param statusCode - HTTP status code (default: 200)
 */
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json(data);
}

/**
 * Send a created response (201)
 * @param res - Express response object
 * @param data - Created resource data
 */
export function sendCreated<T>(res: Response, data: T): void {
  res.status(201).json(data);
}

/**
 * Send a no content response (204)
 * Used for successful deletions or updates with no response body
 * @param res - Express response object
 */
export function sendNoContent(res: Response): void {
  res.status(204).send();
}

/**
 * Send an error response with consistent format
 * @param res - Express response object
 * @param message - Error message
 * @param statusCode - HTTP status code (default: 500)
 * @param details - Optional error details (validation errors, etc.)
 */
export function sendError(
  res: Response,
  message: string,
  statusCode: number = 500,
  details?: any
): void {
  const response: ErrorResponse = {
    error: message,
  };

  if (details) {
    response.details = details;
  }

  res.status(statusCode).json(response);
}

/**
 * Send a bad request error (400)
 * @param res - Express response object
 * @param message - Error message
 * @param details - Optional validation details
 */
export function sendBadRequest(res: Response, message: string, details?: any): void {
  sendError(res, message, 400, details);
}

/**
 * Send an unauthorized error (401)
 * @param res - Express response object
 * @param message - Error message (default: 'Unauthorized')
 */
export function sendUnauthorized(res: Response, message: string = 'Unauthorized'): void {
  sendError(res, message, 401);
}

/**
 * Send a forbidden error (403)
 * @param res - Express response object
 * @param message - Error message (default: 'Forbidden')
 */
export function sendForbidden(res: Response, message: string = 'Forbidden'): void {
  sendError(res, message, 403);
}

/**
 * Send a not found error (404)
 * @param res - Express response object
 * @param message - Error message (default: 'Not found')
 */
export function sendNotFound(res: Response, message: string = 'Not found'): void {
  sendError(res, message, 404);
}

/**
 * Send a conflict error (409)
 * Used for duplicate resources, constraint violations, etc.
 * @param res - Express response object
 * @param message - Error message
 */
export function sendConflict(res: Response, message: string): void {
  sendError(res, message, 409);
}

/**
 * Send a locked error (423)
 * Used for account lockouts, resource locks, etc.
 * @param res - Express response object
 * @param message - Error message
 */
export function sendLocked(res: Response, message: string): void {
  sendError(res, message, 423);
}

/**
 * Send an internal server error (500)
 * @param res - Express response object
 * @param message - Error message (default: 'Internal server error')
 */
export function sendInternalError(res: Response, message: string = 'Internal server error'): void {
  sendError(res, message, 500);
}
