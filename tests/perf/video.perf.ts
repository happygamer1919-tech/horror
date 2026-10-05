// Corridor playback smoothness. Not part of `npm test`.
//   PW_PORT=4334 npm run test:perf
//
// Each chapter of the corridor is played on the built page, in phone emulation (390 x 844,
// dpr 3, touch, mobile UA) with the main thread throttled 4x through CDP, started by a real
// touch swipe, and the frames that reached the screen are counted with
// requestVideoFrameCallback against the frames the file contains:
//   presented  the browser's own count of frames submitted for composition
//              (`presentedFrames` of the callback's metadata), from the first frame shown to
//              the last. This is the number asserted: at least 95 percent of the file's frames.
//   callbacks  how many times the callback itself ran. It runs on the main thread, so under
//              the throttle it can miss a frame that was presented all the same.
//   dropped    getVideoPlaybackQuality().droppedVideoFrames at the end of the chapter.
// Both codecs are measured where a browser decodes them. Playwright's Chromium has no H.264
// decoder, so the H.264 files are played in the installed Google Chrome when there is one
// (PERF_CHROME=0 skips that); the AV1 files are played in both.
// The numbers are printed as one JSON line per chapter (CORRIDOR_VIDEO ...) and written to
// test-results/perf-video.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, test, expect, type Browser } from '@playwright/test';
import { CPU_THROTTLE, PHONE } from './harness';

const enforce = CPU_THROTTLE === 4 && process.env.PERF_ASSERT !== '0';
const MIN_PRESENTED_PCT = 95;
const outDir = join(process.cwd(), 'test-results');
const gpuArgs = process.env.PERF_GPU === '0' ? [] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])];

interface Rec {
  file: string;
  callbacks: number;
  first: number;
  last: number;
  t0: number;
  t1: number;
  maxGapMs: number;
  width: number;
  height: number;
  total: number;
  dropped: number;
  ended: boolean;
}
interface Row {
  browser: string;
  codec: string;
  file: string;
  chapter: number;
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
  throttle: number;
}

async function measure(browser: Browser, name: string, baseURL: string, codec: string): Promise<Row[] | string> {
  const context = await browser.newContext({ ...PHONE, baseURL });
  await context.addInitScript((c) => {
    sessionStorage.setItem('hotel:lift', '1');
    const w = window as any;
    w.__corridorCodec = c;
    w.__vf = [];
    const watch = (v: any) => {
      const rec = { file: v.dataset.file, callbacks: 0, first: -1, last: -1, t0: -1, t1: -1, maxGapMs: 0, prev: 0, width: 0, height: 0, total: 0, dropped: 0, ended: false };
      w.__vf.push(rec);
      const quality = () => {
        const q = v.getVideoPlaybackQuality?.();
        if (q) {
          rec.total = q.totalVideoFrames;
          rec.dropped = q.droppedVideoFrames;
        }
      };
      const on = (now: number, m: any) => {
        rec.callbacks++;
        if (rec.first < 0) {
          rec.first = m.presentedFrames;
          rec.t0 = m.mediaTime;
        }
        rec.last = m.presentedFrames;
        rec.t1 = m.mediaTime;
        if (rec.prev) rec.maxGapMs = Math.max(rec.maxGapMs, now - rec.prev);
        rec.prev = now;
        rec.width = m.width;
        rec.height = m.height;
        quality();
        v.requestVideoFrameCallback(on);
      };
      v.requestVideoFrameCallback(on);
      v.addEventListener('ended', () => {
        rec.ended = true;
        quality();
      });
    };
    new MutationObserver((list) => {
      for (const m of list) for (const n of Array.from(m.addedNodes)) if (n instanceof HTMLVideoElement) watch(n);
    }).observe(document, { childList: true, subtree: true });
  }, codec);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'any-hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => undefined);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  await page.goto('/horror/ro/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(1500);
  // the throttle does not always survive the first navigation: set it again
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  const stage = page.locator('[data-corridor]');
  const swipe = (dir: 1 | -1) => cdp.send('Input.synthesizeScrollGesture', { x: 195, y: dir > 0 ? 680 : 200, yDistance: -dir * 300, speed: 1600, gestureSourceType: 'touch' });
  const rest = async (k: number) => {
    await expect(stage).toHaveAttribute('data-chapter', String(k), { timeout: 20000 });
    await expect(stage).toHaveAttribute('data-state', 'rest', { timeout: 40000 });
  };
  const manifest = JSON.parse((await stage.getAttribute('data-manifest')) ?? '{}');
  const stops = ((await stage.getAttribute('data-stops')) ?? '').split(' ').map(Number);
  await page.evaluate((y) => window.scrollTo(0, y), stops[0]);
  await page.evaluate(() => window.dispatchEvent(new Event('pointermove')));
  await expect(stage).toHaveAttribute('data-codec', /.+/, { timeout: 10000 });
  const got = await stage.getAttribute('data-codec');
  if (got !== codec) {
    await context.close();
    return `${name} does not play ${codec} (the page chose ${got})`;
  }
  const set = manifest.sets[(await stage.getAttribute('data-set')) ?? 'mobile'];
  // each file is in memory before its chapter starts, so what is measured is playback
  const loaded = (id: string) => expect(stage).toHaveAttribute('data-loaded', new RegExp(`(^| )${id}( |$)`), { timeout: 30000 });
  await rest(0);
  await loaded('c1');
  await swipe(1);
  await rest(1);
  await loaded('c2');
  await swipe(1);
  await rest(2);
  await loaded('c3s');
  await swipe(1);
  await rest(3);
  // second pass through chapter 3: the variant without the beat
  await swipe(-1);
  await rest(2);
  await loaded('c3');
  await swipe(1);
  await rest(3);
  await page.waitForTimeout(300);
  const recs = (await page.evaluate(() => (window as any).__vf)) as Rec[];
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await context.close();
  const rows: Row[] = [];
  for (const id of ['c1', 'c2', 'c3s', 'c3']) {
    const r = recs.find((x) => x.file === id);
    const f = set.files[id];
    if (!r) throw new Error(`${name} ${codec}: ${id} never played (${recs.map((x) => x.file).join(' ')})`);
    const presented = r.first < 0 ? 0 : r.last - r.first + 1;
    rows.push({
      browser: name,
      codec,
      file: id,
      chapter: id === 'c1' ? 1 : id === 'c2' ? 2 : 3,
      frames: f.frames,
      duration: f.duration,
      presented,
      presentedPct: Number(((presented / f.frames) * 100).toFixed(1)),
      callbacks: r.callbacks,
      callbackPct: Number(((r.callbacks / f.frames) * 100).toFixed(1)),
      dropped: r.dropped,
      decoded: r.total,
      maxGapMs: Number(r.maxGapMs.toFixed(1)),
      size: `${r.width}x${r.height}`,
      throttle: CPU_THROTTLE,
    });
  }
  return rows;
}

test(`corridor playback: frames presented per chapter, ${CPU_THROTTLE}x CPU throttle`, async ({ browser, baseURL }) => {
  test.setTimeout(600000);
  const rows: Row[] = [];
  const notes: string[] = [];
  const take = (r: Row[] | string) => (typeof r === 'string' ? notes.push(r) : rows.push(...r));
  take(await measure(browser, 'chromium', baseURL!, 'av1'));
  take(await measure(browser, 'chromium', baseURL!, 'h264'));
  if (process.env.PERF_CHROME !== '0') {
    let chrome: Browser | null = null;
    try {
      chrome = await chromium.launch({ channel: 'chrome', args: gpuArgs });
    } catch {
      notes.push('Google Chrome is not installed here: H.264 was not measured');
    }
    if (chrome) {
      take(await measure(chrome, 'chrome', baseURL!, 'h264'));
      take(await measure(chrome, 'chrome', baseURL!, 'av1'));
      await chrome.close();
    }
  }
  for (const r of rows) console.log(`CORRIDOR_VIDEO ${JSON.stringify(r)}`);
  for (const n of notes) console.log(`CORRIDOR_VIDEO_NOTE ${n}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'perf-video.json'), `${JSON.stringify({ conditions: { viewport: '390x844 dpr 3, touch, mobile UA', cpuThrottle: CPU_THROTTLE, minPresentedPct: MIN_PRESENTED_PCT }, rows, notes }, null, 2)}\n`);
  expect(rows.length, `chapters measured (${notes.join('; ')})`).toBeGreaterThanOrEqual(4);
  if (enforce) {
    for (const r of rows) expect(r.presentedPct, `${r.browser} ${r.codec} ${r.file}: ${r.presented} of ${r.frames} frames presented`).toBeGreaterThanOrEqual(MIN_PRESENTED_PCT);
  }
});
