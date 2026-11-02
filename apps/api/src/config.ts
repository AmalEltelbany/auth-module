import { z } from 'zod';

// The only place that reads process.env. A bad environment fails at boot.
try {
  process.loadEnvFile();
} catch {
  // ponytail: no .env file → rely on the real environment (CI, Docker, tests)
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  MONGO_URI: z.string().startsWith('mongodb'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  APP_URL: z.url(),
});

export const config = envSchema.parse(process.env);
