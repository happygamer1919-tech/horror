// What does the page do while nobody touches it?
//
// A page at rest should cost nothing. This counts, per second and with no input at all:
//   main frames   how often the main thread had to produce a frame (style, paint, commit)
//   commits       how often it pushed a new layer tree to the compositor
//   drawn         how often the compositor drew the screen again
// for the site as built and for each experiment in variants.ts, at three places on the page.
// Counts, not timings: they do not depend on how fast or how busy the machine is, only on
// what the page asks for. Never asserted, and skipped unless asked for (it takes minutes):
//   PERF_REST=1 PW_PORT=4334 npx playwright test --config=playwright.perf.config.ts rest
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { PHONE } from './harness';
import { getVariant } from './variants';

const NAMES = (process.env.PERF_REST_VARIANTS ?? 'base,no-torch,torch-static,no-grain,grain-static,no-neon,no-fog-gl,no-cctv,no-overlays,floor').split(',');
const WINDOW_MS = 2000;

test('work per second with no input, by experiment', async ({ browser, baseURL }) => {
  test.skip(process.env.PERF_REST !== '1', 'experiment sweep: set PERF_REST=1');
  const rows: Record<string, string | number>[] = [];
  for (const name of NAMES) {
    const variant = getVariant(name);
    const context = await browser.newContext({ ...PHONE, baseURL });
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem('hotel:lift', '1');
      } catch {
        /* private mode */
      }
    });
    if (variant.init) await context.addInitScript(variant.init);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp
      .send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] })
      .catch(() => undefined);
    await page.goto('/horror/ro/', { waitUntil: 'load' });
    if (variant.css) await page.addStyleTag({ content: variant.css });
    // One tap, so the parts that wait for a first sign of life (the fog) are running.
    await page.touchscreen.tap(195, 300);
    await page.waitForTimeout(2500);
    const stops = await page.evaluate(() => {
      const top = (id: string) => (document.getElementById(id) as HTMLElement).offsetTop;
      return { hero: 0, text: top('file') + 300, cctv: top('cctv') };
    });
    for (const [where, y] of Object.entries(stops)) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(1500);
      await browser.startTracing(page, { categories: ['-*', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'] });
      await page.evaluate(() => performance.mark('perf:rest-start'));
      await page.waitForTimeout(WINDOW_MS);
      await page.evaluate(() => performance.mark('perf:rest-end'));
      const events: { name: string; cat: string; ph: string; ts: number; pid: number }[] = JSON.parse((await browser.stopTracing()).toString('utf8')).traceEvents;
      const a = events.find((e) => e.name === 'perf:rest-start')!;
      const b = events.find((e) => e.name === 'perf:rest-end')!;
      const seconds = (b.ts - a.ts) / 1e6;
      const count = (n: string, ph = 'X') => events.filter((e) => e.name === n && e.ph === ph && e.pid === a.pid && e.ts >= a.ts && e.ts <= b.ts).length;
      rows.push({
        variant: name,
        where,
        mainFramesPerS: Math.round(count('BeginMainThreadFrame', 'I') / seconds),
        commitsPerS: Math.round(count('Commit') / seconds),
        drawnPerS: Math.round(count('DrawFrame', 'I') / seconds),
        paintsPerS: Math.round(count('Paint') / seconds),
        rasterTasksPerS: Math.round(count('RasterTask') / seconds),
      });
    }
    await context.close();
  }
  console.table(rows);
  const outDir = join(process.cwd(), 'test-results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, process.env.PERF_LABEL ? `perf-rest.${process.env.PERF_LABEL}.json` : 'perf-rest.json'), JSON.stringify(rows, null, 2));
  console.log(`PERF_REST ${JSON.stringify(rows)}`);
});
