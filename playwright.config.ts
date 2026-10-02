import { defineConfig } from '@playwright/test';

// PW_PORT lets several checkouts run the suite side by side without sharing a server.
const PORT = Number(process.env.PW_PORT ?? 4323);

export default defineConfig({
  testDir: 'tests',
  testIgnore: 'live.spec.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `npm run build && PORT=${PORT} node scripts/serve.mjs`,
    url: `http://localhost:${PORT}/horror/ro/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'phone-390',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop-1440',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
});
