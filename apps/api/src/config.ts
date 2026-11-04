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
    // Proxies in front of the API (1 behind nginx). The throttler then keys on the
    // client IP, not the proxy's. 0 = none: X-Forwarded-For would be client-forged.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
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
