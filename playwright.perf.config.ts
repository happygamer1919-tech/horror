import { defineConfig } from '@playwright/test';

// Scroll performance harness. Separate from the functional suite on purpose: timing on shared
// CI runners is noisy, so this never gates the deploy. Run it on a quiet machine:
//   PW_PORT=4334 npm run test:perf
// See docs/perf-notes.md for what it measures and how to read the numbers.
const PORT = Number(process.env.PW_PORT ?? 4323);

// A phone has a GPU. Headless Chromium falls back to software rendering (SwiftShader) unless
// told otherwise, which makes every blend layer look far more expensive than it is.
// PERF_GPU=0 switches back to software rendering for comparison.
const gpu = process.env.PERF_GPU !== '0';
const gpuArgs = gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] : [];

export default defineConfig({
  testDir: 'tests/perf',
  testMatch: '*.perf.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Runs taken while the machine is busy are set aside and repeated, which can take a while.
  timeout: 1800000,
  reporter: [['list']],
  // Kept apart from test-results/, which the perf summary is written into.
  outputDir: 'test-results/perf-artifacts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    channel: 'chromium',
    launchOptions: { args: gpuArgs },
  },
  webServer: {
    command: `npm run build && PORT=${PORT} node scripts/serve.mjs`,
    url: `http://localhost:${PORT}/ro/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
