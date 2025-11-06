import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/User.js';
import '../types/index.js';

/**
 * Native authentication middleware
 * Checks if user session exists and user is still active
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Verify user is still active in database
  try {
    const user = await UserModel.findById(req.session.user.userId);

    if (!user) {
      // User deleted - destroy session
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_active) {
      // User deactivated - destroy session
      req.session.destroy(() => {});
      return res.status(401).json({
        error: 'Account deactivated',
        message: 'Your account has been deactivated. Please contact an administrator.'
      });
    }

    // Populate req.user for RBAC middleware
    (req as any).user = req.session.user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
