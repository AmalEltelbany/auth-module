import { defineConfig, devices } from '@playwright/test';

/**
 * Browser e2e: the real web app and API, real cookies, real mail into Mailpit.
 * Needs `docker compose up` (Mongo + Mailpit) and `apps/api/.env` with SMTP_HOST=localhost.
 * Reuses dev servers that are already running, otherwise starts them.
 */
export default defineConfig({
  testDir: 'e2e',
  // One shared database and inbox: run the journeys one at a time.
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -w @auth-module/api',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @auth-module/web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
  ],
});
