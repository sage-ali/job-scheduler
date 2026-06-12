import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const boolEnv = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string().min(1),
  DATABASE_SYNC: boolEnv.default(false),
  DATABASE_LOGGING: boolEnv.default(false),
  DATABASE_SSL: boolEnv.default(false),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_USERNAME: z.string().optional(),
  REDIS_TLS: boolEnv.default(false),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  QUEUE_CONCURRENCY: z.coerce
    .number()
    .int()
    .default(3)
    .transform((v) => Math.max(1, v)),

  // How long a worker holds a job lease before it is considered stalled.
  // Must be >= the longest expected handler duration. Default: 120s.
  LEASE_TTL_SECONDS: z.coerce.number().int().positive().default(120),

  // Jobs sent to the DLQ trigger an email alert once this count is reached.
  DLQ_ALERT_THRESHOLD: z.coerce.number().int().positive().default(10),
  ALERT_EMAIL: z.string().email().default('admin@example.com'),
  EMAIL_FROM: z.string().default('Job Scheduler <noreply@example.com>'),

  SWAGGER_ENABLED: boolEnv.default(true),
  CORS_ORIGIN: z.string().default('*'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:\n', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
