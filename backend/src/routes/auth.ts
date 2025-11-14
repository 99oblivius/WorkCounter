import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { UserModel } from '../models/User.js';
import { PasswordService } from '../services/passwordService.js';
import { AuditService } from '../services/auditService.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  sendSuccess,
  sendUnauthorized,
  sendForbidden,
  sendLocked,
  sendBadRequest,
  sendNotFound,
  sendInternalError
} from '../utils/apiResponse.js';
import '../types/index.js';

const router = Router();

// SECURITY: Input validation schemas
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(1, 'New password is required'),
});

// Rate limiting for login attempts - only count failed attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 failed attempts per IP per 15 minutes
  message: { error: 'Too many failed login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * POST /api/auth/login
 * Native authentication - username/email + password
 * SECURITY: Constant-time response to prevent username enumeration
 */
router.post('/login', loginLimiter, validateBody(loginSchema), asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const MIN_RESPONSE_TIME = 300; // Minimum 300ms to match bcrypt timing

  // Extract validated input
  const { username, password } = req.body;

  // Find user by username or email
  const user = await UserModel.findByUsernameOrEmail(username);

  if (!user) {
    // SECURITY: Add artificial delay to match bcrypt timing (prevent username enumeration)
    const elapsed = Date.now() - startTime;
    if (elapsed < MIN_RESPONSE_TIME) {
      await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_TIME - elapsed));
    }

    // Don't reveal whether user exists - generic error message
    await AuditService.log({
      userId: undefined,
      username: username,
      action: 'auth.login_failed',
      resourceType: 'user',
      details: { reason: 'user_not_found', username },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return sendUnauthorized(res, 'Invalid username or password');
  }

  // Check if user is active
  if (!user.is_active) {
    await AuditService.log({
      userId: user.id,
      username: user.username,
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: user.id,
      details: { reason: 'account_inactive' },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return sendForbidden(res, 'Account is inactive. Please contact an administrator.');
  }

  // Check if account is locked
  const isLocked = await UserModel.isAccountLocked(user.id);
  if (isLocked) {
    await AuditService.log({
      userId: user.id,
      username: user.username,
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: user.id,
      details: { reason: 'account_locked' },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return sendLocked(res, 'Account is temporarily locked due to multiple failed login attempts. Please try again in 30 minutes.');
  }

  // Check if user has a password set
  if (!user.password_hash) {
    await AuditService.log({
      userId: user.id,
      username: user.username,
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: user.id,
      details: { reason: 'no_password_set' },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return sendForbidden(res, 'No password set for this account. Please contact an administrator to set up your password.');
  }

  // Verify password
  const isValidPassword = await UserModel.verifyPassword(user.id, password);

  if (!isValidPassword) {
    // Record failed login attempt
    await UserModel.recordFailedLogin(user.id);

    await AuditService.log({
      userId: user.id,
      username: user.username,
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: user.id,
      details: { reason: 'invalid_password' },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return sendUnauthorized(res, 'Invalid username or password');
  }

  // Reset failed login attempts on successful login
  await UserModel.resetFailedLogins(user.id);

  // Update last login timestamp
  await UserModel.updateLastLogin(user.id);

  // Regenerate session ID for security
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Set session data
  req.session.user = {
    userId: user.id,
    email: user.email,
    username: user.username,
  };

  // Save session
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });

  // Log successful login
  await AuditService.log({
    userId: user.id,
    username: user.username,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: user.id,
    details: { method: 'native' },
    status: 'success',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendSuccess(res, {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    forcePasswordReset: user.force_password_reset || false,
  });
}));

/**
 * POST /api/auth/logout
 * Destroy session
 */
router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  const user = req.session.user;

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return sendInternalError(res, 'Logout failed');
    }

    // Log logout
    if (user) {
      AuditService.log({
        userId: user.userId,
        username: user.username,
        action: 'auth.logout',
        resourceType: 'user',
        resourceId: user.userId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(err => console.error('Audit log error:', err));
    }

    sendSuccess(res, { success: true });
  });
}));

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return sendUnauthorized(res, 'Not authenticated');
  }
  sendSuccess(res, req.session.user);
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), asyncHandler(async (req, res) => {
  // Extract validated input
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.user!.userId;

  // Validate new password
  const validation = PasswordService.validatePassword(newPassword);
  if (!validation.valid) {
    return sendBadRequest(res, 'Password does not meet requirements', validation.errors);
  }

  // Get user
  const user = await UserModel.findById(userId);
  if (!user) {
    return sendNotFound(res, 'User not found');
  }

  // If user has a current password, verify it
  if (user.password_hash) {
    const isValid = await UserModel.verifyPassword(userId, currentPassword);
    if (!isValid) {
      await AuditService.log({
        userId,
        username: user.username,
        action: 'auth.password_change_failed',
        resourceType: 'user',
        resourceId: userId,
        details: { reason: 'invalid_current_password' },
        status: 'failure',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return sendUnauthorized(res, 'Current password is incorrect');
    }
  }

  // Set new password
  await UserModel.setPassword(userId, newPassword);

  // Log password change
  await AuditService.log({
    userId,
    username: user.username,
    action: 'auth.password_changed',
    resourceType: 'user',
    resourceId: userId,
    status: 'success',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendSuccess(res, { success: true });
}));

export default router;
