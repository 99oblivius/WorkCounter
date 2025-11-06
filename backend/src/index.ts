import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { csrfProtection, strictCsrfProtection } from './middleware/csrf.js';
import './types/index.js';

import authRoutes from './routes/auth.js';
import worksRoutes from './routes/works.js';
import timeSessionsRoutes from './routes/timeSessions.js';
import timelineEntriesRoutes from './routes/timelineEntries.js';
import statsRoutes from './routes/stats.js';
import fileStorageRoutes from './routes/fileStorage.js';
import workSharingRoutes from './routes/workSharing.js';
import settingsRoutes from './routes/settings.js';
import userPermissionsRoutes from './routes/userPermissions.js';
import adminUsersRoutes from './routes/admin/users.js';
import adminSettingsRoutes from './routes/admin/settings.js';
import adminAuditRoutes from './routes/admin/audit.js';
import adminRolesRoutes from './routes/admin/roles.js';

const app = express();

// Trust proxy - required for secure cookies behind reverse proxy
app.set('trust proxy', 1);

// SECURITY FIX: Enable CSP in production with proper directives
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // unsafe-inline needed for React dev
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", env.FRONTEND_URL || "'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,  // Allow image loading
}));

app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Redis client for session store
const redisClient = createClient({
  socket: {
    host: env.REDIS_HOST || 'redis',
    port: env.REDIS_PORT || 6379,
  },
  legacyMode: false,
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Connect to Redis
await redisClient.connect();

// Initialize Redis store
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'workcounter:sess:',
});

// Middleware to save original res.end before session wraps it (for tus compatibility)
app.use((req, res, next) => {
  (res as any)._originalEnd = res.end;
  next();
});

app.use(
  session({
    store: redisStore,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'workcounter.sid', // Custom name to avoid conflicts
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      // SECURITY FIX: Changed from 'lax' to 'strict' for CSRF protection
      // Safe to use 'strict' now that we're using native auth (no OAuth redirects)
      sameSite: 'strict',
      path: '/',
    },
  })
);

// SECURITY: Global CSRF protection for all state-changing requests
app.use(csrfProtection);

app.use('/api/auth', authRoutes);
app.use('/api/works', worksRoutes);
app.use('/api/sessions', timeSessionsRoutes);
app.use('/api/timeline', timelineEntriesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/files', fileStorageRoutes);
app.use('/api/work-sharing', workSharingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/user-permissions', userPermissionsRoutes);

// Admin routes - Strict CSRF protection
app.use('/api/admin/users', strictCsrfProtection, adminUsersRoutes);
app.use('/api/admin/settings', strictCsrfProtection, adminSettingsRoutes);
app.use('/api/admin/audit', adminAuditRoutes);
app.use('/api/admin/roles', strictCsrfProtection, adminRolesRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

async function startServer() {
  try {
    await pool.query('SELECT 1');
    console.log('Database connection established');

    // Native authentication is now enabled - no Authentik required
    console.log('Native authentication enabled');

    // Initialize MinIO
    try {
      const { minioService } = await import('./services/minioService.js');
      await minioService.initialize();
      console.log('MinIO service initialized');
    } catch (error) {
      console.error('MinIO initialization failed:', error);
      console.warn('Image upload functionality will not work');
    }

    // Start upload cleanup scheduler
    try {
      const { startCleanupScheduler } = await import('./jobs/cleanupUploads.js');
      startCleanupScheduler();
    } catch (error) {
      console.error('Failed to start cleanup scheduler:', error);
    }

    app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

startServer();
