import { Router } from 'express';
import { getOIDCClient, handleAuthCallback } from '../middleware/auth.js';
import { env } from '../config/env.js';
import '../types/index.js';

const router = Router();

router.get('/login', (req, res) => {
  try {
    const client = getOIDCClient();
    let authUrl = client.authorizationUrl({
      scope: 'openid email profile',
      state: 'random_state_string',
    });

    // Rewrite internal Docker URLs to public domain
    authUrl = authUrl.replace('http://authentik-server:9000', env.FRONTEND_URL);
    authUrl = authUrl.replace('http://localhost:9902', env.FRONTEND_URL);

    res.json({ authUrl });
  } catch (error) {
    res.status(503).json({
      error: 'Authentication service not configured',
      message: 'Please configure Authentik OIDC application'
    });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const userData = await handleAuthCallback(code, `${env.BACKEND_URL}/api/auth/callback`);

    // Regenerate session ID for security and to ensure it's properly set
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    req.session.user = {
      userId: userData.userId,
      authentikId: userData.authentikId,
      email: userData.email,
      username: userData.username,
    };

    // CRITICAL: Save session before redirecting to ensure session is persisted
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          reject(err);
        } else {
          console.log('Session saved successfully for user:', userData.userId);
          resolve();
        }
      });
    });

    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('Auth callback error:', error);
    res.redirect(`${env.FRONTEND_URL}?error=auth_failed`);
  }
});

router.post('/logout', (req, res) => {
  try {
    const client = getOIDCClient();

    // Get Authentik's end session endpoint
    const endSessionEndpoint = client.issuer.metadata.end_session_endpoint;

    // Destroy backend session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }

      // Return Authentik logout URL for frontend to redirect to
      if (endSessionEndpoint) {
        const logoutUrl = `${endSessionEndpoint}?post_logout_redirect_uri=${encodeURIComponent(env.FRONTEND_URL)}`;

        // Rewrite internal Docker URLs to public domain
        const publicLogoutUrl = logoutUrl.replace('http://authentik-server:9000', env.FRONTEND_URL);

        res.json({
          success: true,
          logoutUrl: publicLogoutUrl
        });
      } else {
        // Fallback if no end_session_endpoint
        res.json({
          success: true,
          logoutUrl: `${env.FRONTEND_URL}/login`
        });
      }
    });
  } catch (error) {
    // If OIDC client not available, just destroy session
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({
        success: true,
        logoutUrl: `${env.FRONTEND_URL}/login`
      });
    });
  }
});

router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

export default router;
