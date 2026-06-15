import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  // Base de datos
  HOST_DB: z.string(),
  PORT_DB: z.coerce.number().default(3306),
  USER_DB: z.string(),
  PASSWORD_DB: z.string(),
  DATABASE_DB: z.string(),
  // Redis
  REDIS_URL: z.string().min(1),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  // App
  ALLOWED_ORIGINS: z.string().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5174'),
  APP_NAME: z.string().default('API'),
  // JWT — access token (15m) + refresh token (30d)
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_REFRESH_TTL_MS: z.coerce.number().default(2592000000),
  // Mail
  MAIL_HOST: z.string().default('smtp.gmail.com'),
  MAIL_PORT: z.coerce.number().default(465),
  MAIL_USER: z.string().email(),
  MAIL_PASS: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  // AWS S3
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
