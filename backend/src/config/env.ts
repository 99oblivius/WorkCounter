import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  DB_HOST: z.string(),
  DB_PORT: z.string().transform(Number).default('5432'),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  SESSION_SECRET: z.string().min(32),
  AUTHENTIK_URL: z.string().url(),
  AUTHENTIK_CLIENT_ID: z.string(),
  AUTHENTIK_CLIENT_SECRET: z.string(),
  FRONTEND_URL: z.string().url(),
  BACKEND_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
