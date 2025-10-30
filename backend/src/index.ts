import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { initializeOIDC } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import worksRoutes from './routes/works.js';
import timeSessionsRoutes from './routes/timeSessions.js';
import timelineEntriesRoutes from './routes/timelineEntries.js';
import statsRoutes from './routes/stats.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
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

    await initializeOIDC();

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
