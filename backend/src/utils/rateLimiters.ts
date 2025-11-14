/**
 * Rate Limiter Factory
 * Centralized rate limiter configurations to prevent duplication
 */

import rateLimit from 'express-rate-limit';

/**
 * Create a user-based rate limiter
 * Uses userId from session as key for per-user rate limiting
 */
export function createUserRateLimiter(
  windowMs: number,
  max: number,
  message: string = 'Too many requests, please try again later'
) {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => {
      return req.session?.user?.userId ? `user:${req.session.user.userId}` : 'anonymous';
    },
  });
}

/**
 * Create a global rate limiter
 * Applies same limit to all users combined
 */
export function createGlobalRateLimiter(
  windowMs: number,
  max: number,
  message: string = 'System is busy, please try again later'
) {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: () => 'global',
  });
}

/**
 * Create an IP-based rate limiter
 * Uses client IP address as key
 */
export function createIpRateLimiter(
  windowMs: number,
  max: number,
  message: string = 'Too many requests from this IP, please try again later'
) {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    // Uses default keyGenerator which is IP address
  });
}

/**
 * Pre-configured rate limiters for common scenarios
 */
export const rateLimiters = {
  // Admin operations - strict limits to prevent abuse
  admin: createUserRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // 100 requests per 15 minutes
    'Too many admin operations, please try again later'
  ),

  // Authentication - prevent brute force
  auth: createIpRateLimiter(
    15 * 60 * 1000, // 15 minutes
    10, // 10 attempts per 15 minutes
    'Too many login attempts, please try again later'
  ),

  // File uploads - prevent spam
  fileUpload: createUserRateLimiter(
    15 * 60 * 1000, // 15 minutes
    50, // 50 uploads per 15 minutes
    'Too many file uploads, please try again later'
  ),

  // File downloads - prevent abuse
  fileDownload: createUserRateLimiter(
    1 * 60 * 1000, // 1 minute
    100, // 100 downloads per minute
    'Too many download requests, please try again later'
  ),

  // File deletions - prevent spam
  fileDeletion: createUserRateLimiter(
    5 * 60 * 1000, // 5 minutes
    30, // 30 deletions per 5 minutes
    'Too many delete requests, please try again later'
  ),

  // Global system limit for uploads
  globalUpload: createGlobalRateLimiter(
    30 * 1000, // 30 seconds
    30, // 30 uploads across all users
    'System is busy, please try again in a moment'
  ),

  // Standard API rate limit
  api: createUserRateLimiter(
    15 * 60 * 1000, // 15 minutes
    1000, // 1000 requests per 15 minutes
    'Rate limit exceeded, please slow down'
  ),
};
