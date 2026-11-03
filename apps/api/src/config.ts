import { z } from 'zod';

// The only place that reads process.env. A bad environment fails at boot.
try {
  process.loadEnvFile();
} catch {
  // ponytail: no .env file → rely on the real environment (CI, Docker, tests)
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    MONGO_URI: z.string().startsWith('mongodb'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    // Empty SMTP_HOST outside production: mail is logged instead of sent.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('Application <no-reply@application.local>'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.SMTP_HOST, {
    path: ['SMTP_HOST'],
    message: 'SMTP_HOST is required in production (reset and verification emails would be lost)',
  });

export const config = envSchema.parse(process.env);
