import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { initializeOIDC } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import './types/index.js';

import authRoutes from './routes/auth.js';
import worksRoutes from './routes/works.js';
import timeSessionsRoutes from './routes/timeSessions.js';
import timelineEntriesRoutes from './routes/timelineEntries.js';
import statsRoutes from './routes/stats.js';

const app = express();

// Trust proxy - required for secure cookies behind reverse proxy
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
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
      sameSite: 'lax', // 'lax' works better with OAuth redirects
      path: '/',
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/works', worksRoutes);
app.use('/api/sessions', timeSessionsRoutes);
app.use('/api/timeline', timelineEntriesRoutes);
app.use('/api/stats', statsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

async function startServer() {
  try {
    await pool.query('SELECT 1');
    console.log('Database connection established');

    // Try to initialize OIDC, but don't fail if it's not ready yet
    try {
      await initializeOIDC();
    } catch (error) {
      console.warn('OIDC initialization failed - authentication will not work until Authentik is configured');
      console.warn('Please configure an OAuth2/OIDC application named "workcounter" in Authentik');
      console.warn('The server will continue to run, but auth endpoints will not function');
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
