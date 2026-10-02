import { defineConfig } from '@playwright/test';

// Live checks only: no local server, no browser needed.
export default defineConfig({
  testDir: 'tests',
  testMatch: 'live.spec.ts',
  retries: 2,
  reporter: [['list']],
});
