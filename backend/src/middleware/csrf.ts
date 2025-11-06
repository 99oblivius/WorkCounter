import { Request, Response, NextFunction } from 'express';

/**
 * CSRF Protection Middleware
 *
 * SECURITY: Defense-in-depth CSRF protection beyond SameSite=strict
 * Requires a custom header on all state-changing requests (POST, PUT, PATCH, DELETE)
 *
 * This prevents CSRF attacks even if SameSite cookies are bypassed:
 * - Browsers will not send custom headers on cross-origin form submissions
 * - Only JavaScript from same origin can add custom headers
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Only check state-changing methods
  const statChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (!statChangingMethods.includes(req.method)) {
    return next();
  }

  // Exempt login endpoint (no session exists yet)
  if (req.path === '/api/auth/login') {
    return next();
  }

  // Require X-Requested-With header (standard CSRF prevention)
  const requestedWith = req.get('X-Requested-With');

  if (requestedWith !== 'XMLHttpRequest') {
    console.warn(`[SECURITY] CSRF attempt blocked: ${req.method} ${req.path} from ${req.ip}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Missing required security header'
    });
  }

  next();
};

/**
 * Strict CSRF for critical operations (admin, sharing, deletion)
 * Requires both custom header AND valid origin
 */
export const strictCsrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // First check standard CSRF
  const requestedWith = req.get('X-Requested-With');
  if (requestedWith !== 'XMLHttpRequest') {
    console.warn(`[SECURITY] Strict CSRF attempt blocked (no header): ${req.method} ${req.path} from ${req.ip}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Missing required security header'
    });
  }

  // Also validate origin matches expected frontend URL
  const origin = req.get('Origin') || req.get('Referer');
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.BACKEND_URL,
    // In development, allow localhost
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:3000'] : [])
  ];

  if (origin && !allowedOrigins.some(allowed => origin.startsWith(allowed as string))) {
    console.warn(`[SECURITY] Strict CSRF attempt blocked (bad origin): ${req.method} ${req.path} from ${req.ip}, origin: ${origin}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid request origin'
    });
  }

  next();
};
