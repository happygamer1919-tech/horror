// Does a busy main thread hold the scroll back?
//
// The page's JavaScript is made to hang for BLOCK_MS, and a finger starts to drag 150 ms into
// the hang. With a blocking (passive: false) touch listener on the page, the browser has to
// wait for the script before it may scroll, so the page stays frozen under the finger until
// the hang ends. Without one, the compositor scrolls at once.
//
// This is the measurement of "scroll lag" that does not depend on how fast the machine is:
// the answer is either "about as long as the hang" or "a few frames".
//
// Two control pages run first, so the instrument proves itself before it judges the site:
//   control-free      a plain tall page with no listeners: must scroll during the hang
//   control-blocking  the same page with one passive: false touchmove listener: must wait
// If either control gives the wrong answer, the measurement says nothing about the site and
// the test fails as broken, whatever the site's number is.
//   PW_PORT=4334 npm run test:perf
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Browser } from '@playwright/test';
import { PHONE, median } from './harness';

const BLOCK_MS = 800;
const RUNS = Number(process.env.PERF_RUNS ?? 3);
// Generous: a few frames on a quiet machine, and far below the hang either way.
const BUDGET_MS = 250;
const label = process.env.PERF_LABEL ?? '';

interface Ev {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  pid: number;
  id2?: { local?: string };
  args?: Record<string, any>;
}

// .invalid never resolves, so a control page can never reach a real host.
const CONTROL_URL = 'http://perf-control.invalid/';
const controlPage = (script: string) =>
  `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><div id="file" style="height:20000px;background:linear-gradient(#222,#999)"></div><script>${script}</script>`;
const ARMS = [
  { name: 'control-free', html: controlPage("addEventListener('touchstart',()=>{},{passive:true});") },
  { name: 'control-blocking', html: controlPage("document.addEventListener('touchmove',()=>{},{passive:false});") },
  { name: 'site', path: '/horror/ro/' },
] as const;

type Run = { touchToScrollMs: number; scrolledDuringHang: boolean; hangMs: number };

async function measureOnce(browser: Browser, baseURL: string, arm: (typeof ARMS)[number]): Promise<Run> {
  const context = await browser.newContext({ ...PHONE, baseURL });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('hotel:lift', '1');
    } catch {
      /* private mode */
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp
    .send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] })
    .catch(() => undefined);
  if ('html' in arm) {
    await page.route(CONTROL_URL, (r) => r.fulfill({ contentType: 'text/html', body: arm.html }));
    await page.goto(CONTROL_URL, { waitUntil: 'load' });
  } else {
    await page.goto(arm.path, { waitUntil: 'load' });
  }
  await page.waitForTimeout(2500);
  // Past the hero, in a plain text section, so nothing else is starting up.
  await page.evaluate(() => window.scrollTo(0, (document.getElementById('file') as HTMLElement).offsetTop + 200));
  await page.waitForTimeout(800);

  // The first synthetic gesture of a page waits for the renderer to report ready, which
  // would itself wait for the hang. Spend that on a throwaway drag first.
  await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 500, yDistance: -60, speed: 800, gestureSourceType: 'touch', preventFling: true });
  await page.waitForTimeout(500);

  await browser.startTracing(page, { categories: ['-*', 'input', 'benchmark', 'blink.user_timing', 'disabled-by-default-devtools.timeline.frame'] });
  await page.evaluate((ms) => {
    window.setTimeout(() => {
      performance.mark('perf:hang-start');
      const end = performance.now() + ms;
      while (performance.now() < end) {
        /* hang */
      }
      performance.mark('perf:hang-end');
    }, 30);
  }, BLOCK_MS);
  await page.waitForTimeout(180);
  await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 700, yDistance: -500, speed: 1600, gestureSourceType: 'touch', preventFling: true });
  await page.waitForTimeout(BLOCK_MS + 400);
  const events: Ev[] = JSON.parse((await browser.stopTracing()).toString('utf8')).traceEvents;
  await context.close();

  const mark = (n: string) => events.find((e) => e.name === n && e.cat.includes('blink.user_timing'))?.ts ?? NaN;
  const hangStart = mark('perf:hang-start');
  const hangEnd = mark('perf:hang-end');
  // Finger down: the first touch event the browser generated.
  const touchDown = Math.min(...events.filter((e) => e.name === 'InputLatency::TouchStart' && e.ph === 'b').map((e) => e.ts));
  // First scrolled frame on screen: the end of the first scroll update's latency slice.
  const begins = new Map<string, Ev>();
  let firstScrollShown = Infinity;
  for (const e of events) {
    if (e.name !== 'EventLatency') continue;
    const key = `${e.pid}:${e.id2?.local}`;
    if (e.ph === 'b') begins.set(key, e);
    else if (e.ph === 'e') {
      const b = begins.get(key);
      if (b && /SCROLL_UPDATE/.test(b.args?.event_latency?.event_type ?? '') && b.ts >= touchDown) firstScrollShown = Math.min(firstScrollShown, e.ts);
    }
  }
  // The finger has to go down inside the hang, with most of it still to come, or the run
  // measures nothing.
  expect(touchDown, `${arm.name}: the finger went down while the script was hanging`).toBeGreaterThan(hangStart);
  expect(touchDown, `${arm.name}: at least 300 ms of the hang were still to come`).toBeLessThan(hangEnd - 300000);
  expect(Number.isFinite(firstScrollShown), `${arm.name}: the drag scrolled the page at all`).toBe(true);
  return {
    touchToScrollMs: Number(((firstScrollShown - touchDown) / 1000).toFixed(1)),
    scrolledDuringHang: firstScrollShown < hangEnd,
    hangMs: Number(((hangEnd - hangStart) / 1000).toFixed(0)),
  };
}

test(`a ${BLOCK_MS} ms main thread hang does not hold a touch scroll back`, async ({ browser, baseURL }) => {
  const results: Record<string, { touchToScrollMs: { median: number; worst: number; runs: number[] }; scrolledDuringHang: boolean[] }> = {};
  for (const arm of ARMS) {
    const runs: Run[] = [];
    // Controls need one run each to prove the instrument; the site gets RUNS.
    const n = arm.name === 'site' ? RUNS : 1;
    for (let i = 0; i < n; i++) {
      const r = await measureOnce(browser, baseURL!, arm);
      runs.push(r);
      console.log(`${arm.name} run ${i + 1}: hang ${r.hangMs} ms, finger down to first scrolled frame ${r.touchToScrollMs} ms, scrolled during the hang: ${r.scrolledDuringHang}`);
    }
    const xs = runs.map((r) => r.touchToScrollMs);
    results[arm.name] = { touchToScrollMs: { median: median(xs), worst: Math.max(...xs), runs: xs }, scrolledDuringHang: runs.map((r) => r.scrolledDuringHang) };
  }

  const instrumentOk = results['control-free'].touchToScrollMs.worst < BUDGET_MS && results['control-blocking'].touchToScrollMs.worst >= BUDGET_MS;
  const summary = {
    test: 'scroll start while the main thread hangs',
    label: label || undefined,
    hangMs: BLOCK_MS,
    budgetMs: BUDGET_MS,
    instrumentOk,
    controls: { free: results['control-free'], blocking: results['control-blocking'] },
    touchToScrollMs: results.site.touchToScrollMs,
    scrolledDuringHang: results.site.scrolledDuringHang,
    pass: instrumentOk && results.site.touchToScrollMs.worst < BUDGET_MS,
  };
  const outDir = join(process.cwd(), 'test-results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, label ? `perf-blocked.${label}.json` : 'perf-blocked.json'), JSON.stringify(summary, null, 2));
  console.log(`PERF_BLOCKED ${JSON.stringify(summary)}`);
  expect(instrumentOk, 'the instrument tells a free page from a blocking one (controls)').toBe(true);
  if (process.env.PERF_ASSERT === '0') return;
  expect(summary.touchToScrollMs.worst, 'finger down to first scrolled frame, worst run, ms').toBeLessThan(BUDGET_MS);
});
