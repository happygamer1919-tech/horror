// The corridor's clip: how fast it starts, how smoothly it plays, how long the page is held.
// Not part of `npm test`.
//   PW_PORT=4334 npm run test:perf
//
// On the built page, in phone emulation (390 x 844, dpr 3, touch, mobile UA), with the clip
// fetched and warm as it is for a visitor who has spent a moment on the hero, and started the
// way a visitor starts it: a real fast touch fling from the top of the page (touch events
// through CDP, the browser makes the scroll and the fling itself).
//
//   1. First frame. From the catch (the moment the page is put on the corridor's top and held;
//      the script catches a frame and a half ahead of the scroll, so this is at or before the
//      moment the corridor's top would have reached the top of the screen by itself) to the
//      first frame of the clip on screen: the display time the browser reports for the first
//      frame it presents after the catch (requestVideoFrameCallback). Budget: under 300 ms.
//      Measured with no throttle and with the main thread throttled 4x, RUNS times each.
//      Also printed: when the page's main thread first saw the corridor's top at the top of
//      the screen, relative to the catch (negative: the catch came first).
//   2. Smoothness. The whole clip at 4x throttle, per codec: the frames that reached the
//      screen, counted by the browser itself (`presentedFrames` of the callback's metadata,
//      from the first frame after the catch to the last), against the frames the file
//      contains. Budget: 95 percent. `callbacks` is how many times the callback itself ran:
//      it runs on the throttled main thread and can miss a frame that was presented all the
//      same. `dropped` is getVideoPlaybackQuality().droppedVideoFrames.
//   3. The hold. How long the page was held (the script measures it: performance.measure
//      'corridor:lock'), against the clip's length. Budget: the clip and one second.
// Both codecs are measured where a browser decodes them: in Playwright's Chromium, and in the
// installed Google Chrome when there is one (PERF_CHROME=0 skips that).
// The numbers are printed as JSON lines (CORRIDOR_START, CORRIDOR_CLIP) and written to
// test-results/perf-video.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, test, expect, type Browser, type Page } from '@playwright/test';
import { swipe } from '../corridor.util';
import { CPU_THROTTLE, PHONE, median, until } from './harness';

const enforce = CPU_THROTTLE === 4 && process.env.PERF_ASSERT !== '0';
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const FIRST_FRAME_MS = 300;
const MIN_PRESENTED_PCT = 95;
const outDir = join(process.cwd(), 'test-results');
const gpuArgs = process.env.PERF_GPU === '0' ? [] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])];

interface Seen {
  reach: number;
  frames: { now: number; shown: number; t: number; n: number }[];
  dropped: number;
  decoded: number;
  size: string;
}

// A page with the clip fetched and warm, the main thread throttled, and every frame the clip
// presents written down.
async function ready(browser: Browser, baseURL: string, throttle: number, codec = '') {
  const context = await browser.newContext({ ...PHONE, baseURL });
  await context.addInitScript((c) => {
    sessionStorage.setItem('hotel:lift', '1');
    const w = window as any;
    if (c) w.__corridorCodec = c;
    const seen = (w.__seen = { reach: -1, frames: [] as any[], dropped: 0, decoded: 0, size: '' });
    const watch = (v: any) => {
      const on = (now: number, m: any) => {
        seen.frames.push({ now, shown: m.expectedDisplayTime, t: m.mediaTime, n: m.presentedFrames });
        seen.size = `${m.width}x${m.height}`;
        const q = v.getVideoPlaybackQuality?.();
        if (q) {
          seen.dropped = q.droppedVideoFrames;
          seen.decoded = q.totalVideoFrames;
        }
        v.requestVideoFrameCallback(on);
      };
      v.requestVideoFrameCallback(on);
    };
    new MutationObserver((list) => {
      for (const m of list) for (const n of Array.from(m.addedNodes)) if (n instanceof HTMLVideoElement) watch(n);
    }).observe(document, { childList: true, subtree: true });
    // when the page's main thread first sees the corridor's top at the top of the screen
    const look = () => {
      const el = document.getElementById('corridor');
      if (el && el.getBoundingClientRect().top <= 0.5) seen.reach = performance.now();
      else requestAnimationFrame(look);
    };
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(look));
  }, codec);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'any-hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => undefined);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.goto('/horror/ro/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(1000);
  // the throttle does not always survive the first navigation: set it again
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  // The first input, without scrolling: the clip is fetched and warmed up while the visitor
  // is on the hero. (The stage is read with plain evaluates all through: see harness.ts, `until`.)
  await page.evaluate(() => void window.dispatchEvent(new Event('pointermove')));
  const { codec: took, set } = await until(page, 'the clip being fetched and warm', (c) => c.primed === 'scare' || c.codec === 'none');
  const clip = await page.evaluate((name) => JSON.parse(document.querySelector<HTMLElement>('[data-corridor]')!.dataset.manifest!).sets[name].clips.scare, set);
  const end = async () => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
    await context.close();
  };
  return { page, took: took || 'none', clip, end };
}
const flingIn = async (page: Page) => {
  await page.waitForTimeout(300);
  await swipe(page, 1, { distance: 700, speed: 9000 });
  await until(page, 'the catch', (c) => c.lock === '1', 10000);
};
const marked = async (page: Page, name: string, timeout = 10000) => {
  const started = Date.now();
  for (;;) {
    const t = await page.evaluate((n) => performance.getEntriesByName(n)[0]?.startTime ?? -1, name);
    if (t >= 0) return t;
    if (Date.now() - started > timeout) throw new Error(`no ${name} within ${timeout} ms`);
    await page.waitForTimeout(30);
  }
};
const lockStart = (page: Page) => page.evaluate(() => performance.getEntriesByName('corridor:lock-start').pop()?.startTime ?? -1);

test(`corridor: from the catch to the first frame of the clip on screen, no throttle and ${CPU_THROTTLE}x`, async ({ browser, baseURL }) => {
  test.setTimeout(600000);
  const rows: { throttle: number; run: number; codec: string; firstFrameMs: number; revealMs: number; reachMs: number; mediaTime: number }[] = [];
  for (const throttle of [1, CPU_THROTTLE]) {
    for (let run = 1; run <= RUNS; run++) {
      const { page, took, end } = await ready(browser, baseURL!, throttle);
      expect(took, 'this browser plays the clip').not.toBe('none');
      await flingIn(page);
      const reveal = await marked(page, 'corridor:first-frame');
      await page.waitForTimeout(200);
      const t0 = await lockStart(page);
      const seen = (await page.evaluate(() => (window as any).__seen)) as Seen;
      // the first frame the browser presented after the catch, and when it said it would be on screen
      const first = seen.frames.find((f) => f.now >= t0);
      expect(first, 'a frame was presented after the catch').toBeTruthy();
      rows.push({ throttle, run, codec: took, firstFrameMs: Number((first!.shown - t0).toFixed(1)), revealMs: Number((reveal - t0).toFixed(1)), reachMs: Number((seen.reach - t0).toFixed(1)), mediaTime: Number(first!.t.toFixed(3)) });
      console.log(`CORRIDOR_START ${JSON.stringify(rows[rows.length - 1])}`);
      await end();
    }
  }
  const summary = [1, CPU_THROTTLE].map((throttle) => {
    const xs = rows.filter((r) => r.throttle === throttle).map((r) => r.firstFrameMs);
    return { throttle, runs: xs.length, medianMs: Number(median(xs).toFixed(1)), worstMs: Math.max(...xs), bestMs: Math.min(...xs), budgetMs: FIRST_FRAME_MS };
  });
  for (const s of summary) console.log(`CORRIDOR_START_SUMMARY ${JSON.stringify(s)}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'perf-corridor-start.json'), `${JSON.stringify({ conditions: { viewport: '390x844 dpr 3, touch, mobile UA', runs: RUNS, budgetMs: FIRST_FRAME_MS }, summary, rows }, null, 2)}\n`);
  if (enforce) for (const s of summary) expect(s.worstMs, `first frame after the catch at ${s.throttle}x, worst of ${s.runs} runs (median ${s.medianMs} ms)`).toBeLessThan(FIRST_FRAME_MS);
});

interface Row {
  browser: string;
  codec: string;
  frames: number;
  duration: number;
  presented: number;
  presentedPct: number;
  callbacks: number;
  callbackPct: number;
  dropped: number;
  decoded: number;
  maxGapMs: number;
  size: string;
  end: string;
  heldMs: number;
  overClipMs: number;
  throttle: number;
}

async function play(browser: Browser, name: string, baseURL: string, codec: string): Promise<Row | string> {
  const { page, took, clip, end } = await ready(browser, baseURL, CPU_THROTTLE, codec);
  if (took !== codec) {
    await end();
    return `${name} does not play ${codec} (the page took ${took})`;
  }
  await flingIn(page);
  const t0 = await lockStart(page);
  const { end: how } = await until(page, 'the end of the play', (c) => c.end !== '', 60000);
  await page.waitForTimeout(300);
  const seen = (await page.evaluate(() => (window as any).__seen)) as Seen;
  const held = await page.evaluate(() => performance.getEntriesByName('corridor:lock').map((e) => e.duration));
  await end();
  const frames = seen.frames.filter((f) => f.now >= t0);
  const presented = frames.length ? frames[frames.length - 1].n - frames[0].n + 1 : 0;
  let gap = 0;
  for (let i = 1; i < frames.length; i++) gap = Math.max(gap, frames[i].now - frames[i - 1].now);
  return {
    browser: name,
    codec,
    frames: clip.frames,
    duration: clip.duration,
    presented,
    presentedPct: Number(((presented / clip.frames) * 100).toFixed(1)),
    callbacks: frames.length,
    callbackPct: Number(((frames.length / clip.frames) * 100).toFixed(1)),
    dropped: seen.dropped,
    decoded: seen.decoded,
    maxGapMs: Number(gap.toFixed(1)),
    size: seen.size,
    end: how,
    heldMs: Math.round(held[0] ?? -1),
    overClipMs: Math.round((held[0] ?? -1) - clip.duration * 1000),
    throttle: CPU_THROTTLE,
  };
}

test(`corridor: frames presented over the whole clip and the length of the hold, ${CPU_THROTTLE}x CPU throttle`, async ({ browser, baseURL }) => {
  test.setTimeout(600000);
  const rows: Row[] = [];
  const notes: string[] = [];
  const take = (r: Row | string) => (typeof r === 'string' ? notes.push(r) : rows.push(r));
  take(await play(browser, 'chromium', baseURL!, 'h264'));
  take(await play(browser, 'chromium', baseURL!, 'av1'));
  if (process.env.PERF_CHROME !== '0') {
    let chrome: Browser | null = null;
    try {
      chrome = await chromium.launch({ channel: 'chrome', args: gpuArgs });
    } catch {
      notes.push('Google Chrome is not installed here');
    }
    if (chrome) {
      take(await play(chrome, 'chrome', baseURL!, 'h264'));
      take(await play(chrome, 'chrome', baseURL!, 'av1'));
      await chrome.close();
    }
  }
  for (const r of rows) console.log(`CORRIDOR_CLIP ${JSON.stringify(r)}`);
  for (const n of notes) console.log(`CORRIDOR_CLIP_NOTE ${n}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'perf-video.json'), `${JSON.stringify({ conditions: { viewport: '390x844 dpr 3, touch, mobile UA', cpuThrottle: CPU_THROTTLE, minPresentedPct: MIN_PRESENTED_PCT }, rows, notes }, null, 2)}\n`);
  expect(new Set(rows.map((r) => r.codec)).size, `both codecs measured (${notes.join('; ')})`).toBe(2);
  if (!enforce) return;
  for (const r of rows) {
    expect(r.presentedPct, `${r.browser} ${r.codec}: ${r.presented} of ${r.frames} frames presented`).toBeGreaterThanOrEqual(MIN_PRESENTED_PCT);
    expect(r.end, `${r.browser} ${r.codec}: the clip ran to its end`).toBe('ended');
    expect(r.overClipMs, `${r.browser} ${r.codec}: held ${r.heldMs} ms for a clip of ${r.duration} s`).toBeLessThanOrEqual(1000);
  }
});
