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
    url: `http://localhost:${PORT}/ro/`,
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
    // The closest stand-in for iPhone Safari that runs here: Playwright's WebKit with an
    // iPhone's screen, touch and user agent. It runs the corridor, the scroll and the listener
    // tests; everything else stays on Chromium.
    {
      name: 'webkit-phone',
      testMatch: ['corridor.spec.ts', 'scroll.spec.ts', 'listeners.spec.ts'],
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      },
    },
  ],
});
