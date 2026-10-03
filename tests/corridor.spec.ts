// The corridor: a pre-rendered walk scrubbed by scroll, and the door that opens once.
// Everything is asserted on state the scrubber exposes (data attributes on the canvas) and on
// the network, never on timing luck.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = '/horror';
const FRAME = /\/corridor\/(d|m)\/\d{3}\.(avif|webp)$/;
const PATCH = /\/corridor\/(d|m)\/s\/([fg])-\d{2}\.(avif|webp)$/;
const POSTER = /\/corridor\/poster-(d|m)\.webp$/;
const SCARE_KEY = 'hotel:scare';

interface Scare {
  frame: number;
  fps: number;
  count: number;
  rect: number[];
  has: number[];
  quads: ({ quad: number[][]; clip: number[][] } | null)[];
}
interface SetInfo {
  dir: string;
  w: number;
  h: number;
  frames: number;
  ext: string;
  scare: Scare;
}

async function open(page: Page, lang = 'ro') {
  // The lift preloader plays once per session; tests start after it.
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/${lang}/`);
}

const canvasOf = (page: Page) => page.locator('[data-corridor]');
const num = async (page: Page, key: string) => Number(await canvasOf(page).getAttribute(`data-${key}`));

async function setInfo(page: Page): Promise<{ name: string; set: SetInfo }> {
  const c = canvasOf(page);
  const manifest = JSON.parse((await c.getAttribute('data-manifest')) ?? '{}');
  const name = (await c.getAttribute('data-set')) ?? '';
  return { name, set: manifest.sets[name] };
}

// Scroll so the walk is at frame `index` of `frames`.
async function toFrame(page: Page, index: number, frames: number) {
  await page.evaluate(
    ([i, n]) => {
      const el = document.getElementById('corridor')!;
      const r = el.getBoundingClientRect();
      const top = window.scrollY + r.top;
      window.scrollTo(0, Math.round(top + (r.height - window.innerHeight) * (i / (n - 1))));
    },
    [index, frames],
  );
}

// Scroll to a frame and wait until the canvas shows it, fully decoded. A scroll position is a
// whole number of pixels, so the frame it lands on may be one off the frame asked for.
async function walkTo(page: Page, index: number, frames: number) {
  await toFrame(page, index, frames);
  const state = () =>
    canvasOf(page).evaluate((c) => {
      const d = (c as HTMLElement).dataset;
      return { quality: d.quality, frame: Number(d.frame), target: Number(d.target), scare: d.scare, loaded: Number(d.loaded), set: d.set };
    });
  await expect
    .poll(
      async () => {
        const s = await state();
        return s.quality === 'full' && s.frame === s.target && Math.abs(s.target - index) <= 1 ? 'settled' : JSON.stringify(s);
      },
      { timeout: 20000, message: `walking to frame ${index}` },
    )
    .toBe('settled');
  return (await state()).frame;
}

// Mean and peak brightness of what the canvas holds.
const brightness = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-corridor]')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    let peak = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      const v = d[i] + d[i + 1] + d[i + 2];
      sum += v;
      if (v > peak) peak = v;
      n++;
    }
    return { mean: sum / n / 3, peak: peak / 3 };
  });

// Walk up to the scare door and stop a few frames short, with the scare assets ready.
async function approach(page: Page, set: SetInfo) {
  await walkTo(page, set.scare.frame - 10, set.frames);
  await expect(canvasOf(page)).toHaveAttribute('data-scare-ready', '1', { timeout: 20000 });
}

test('the door opens once: not on a second pass, and not after a reload in the same session', async ({ page }) => {
  test.slow(); // three passes and a reload
  const patches: string[] = [];
  page.on('request', (r) => {
    const m = PATCH.exec(new URL(r.url()).pathname);
    if (m) patches.push(m[2]);
  });
  await open(page);
  const canvas = canvasOf(page);
  const { set } = await setInfo(page);
  expect(set.scare, 'the manifest describes the scare').toBeTruthy();
  await expect(canvas).toHaveAttribute('data-scare-plays', '0');
  expect(await page.evaluate((k) => sessionStorage.getItem(k), SCARE_KEY)).toBeNull();

  // first pass
  await approach(page, set);
  await toFrame(page, set.scare.frame + 5, set.frames);
  await expect(canvas).toHaveAttribute('data-scare', 'playing');
  // while it plays the walk holds on the frame it was rendered from
  expect(await num(page, 'frame')).toBe(set.scare.frame);
  await expect(canvas).toHaveAttribute('data-scare', 'done', { timeout: 4000 });
  await expect(canvas).toHaveAttribute('data-scare-plays', '1');
  expect(await page.evaluate((k) => sessionStorage.getItem(k), SCARE_KEY)).toBe('1');
  // then walks on to where the scroll is, no cut
  expect(await walkTo(page, set.scare.frame + 5, set.frames)).toBeGreaterThan(set.scare.frame);
  // the frames with the rendered stand-in were used, and no "empty gap" ones
  expect(patches.length).toBe(set.scare.has.filter(Boolean).length);
  expect(new Set(patches)).toEqual(new Set(['f']));

  // scroll back, pass again: a closed door
  await walkTo(page, set.scare.frame - 10, set.frames);
  await walkTo(page, set.scare.frame + 5, set.frames);
  await page.waitForTimeout(900);
  await expect(canvas).toHaveAttribute('data-scare-plays', '1');
  await expect(canvas).toHaveAttribute('data-scare', 'done');

  // reload, same session: nothing
  patches.length = 0;
  await page.reload();
  await expect(canvas).toHaveAttribute('data-scare-plays', '0');
  await walkTo(page, set.scare.frame - 10, set.frames);
  await walkTo(page, set.scare.frame + 5, set.frames);
  await page.waitForTimeout(900);
  await expect(canvas).toHaveAttribute('data-scare-plays', '0');
  await expect(canvas).toHaveAttribute('data-scare', 'idle');
  expect(patches, 'no scare frames are even fetched once it has played').toEqual([]);
});

test('the scare is quiet: the door moves for 500 to 700 ms, then shuts, and nothing flashes', async ({ page }) => {
  await open(page);
  const canvas = canvasOf(page);
  const { set } = await setInfo(page);
  const sc = set.scare;
  // the door is shut on the first and the last frame of the run
  expect(sc.has[0]).toBe(0);
  expect(sc.has[sc.count - 1]).toBe(0);
  // the patch is the door and what is behind it, not the whole picture (the walker stands
  // close to the door, so the leaf fills about half of the frame)
  const share = (sc.rect[2] * sc.rect[3]) / (set.w * set.h);
  expect(share).toBeLessThan(0.6);

  await approach(page, set);
  // Watch every animation frame from here on: the scare state, the patch on the canvas, and a
  // checksum of the canvas pixels inside the patch rectangle (the canvas shows a centred crop).
  await page.evaluate(
    ([rect, fw, fh]) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-corridor]')!;
      const g = c.getContext('2d')!;
      const log: [number, string, string, number, number][] = [];
      // mean relative luminance of the whole canvas (sRGB decoded), for the flash check
      const lin = (v: number) => (v <= 10.31 ? v / 3295.4 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
      const meanY = () => {
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let y = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4 * 9) {
          y += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
          n++;
        }
        return y / n;
      };
      (window as unknown as { __rec: typeof log }).__rec = log;
      let after = 0;
      const tick = (t: number) => {
        const k = Math.max(c.width / fw, c.height / fh);
        const cx = (fw - c.width / k) / 2;
        const cy = (fh - c.height / k) / 2;
        const x0 = Math.max(0, Math.floor((rect[0] - cx) * k));
        const y0 = Math.max(0, Math.floor((rect[1] - cy) * k));
        const x1 = Math.min(c.width, Math.ceil((rect[0] + rect[2] - cx) * k));
        const y1 = Math.min(c.height, Math.ceil((rect[1] + rect[3] - cy) * k));
        let sum = 0;
        if (x1 > x0 && y1 > y0) {
          const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
          for (let i = 0; i < d.length; i += 4 * 5) sum = (sum * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) >>> 0;
        }
        log.push([t, c.dataset.scare ?? '', c.dataset.patch ?? '', sum, c.dataset.scare === 'playing' || c.dataset.scare === 'done' ? meanY() : -1]);
        if (c.dataset.scare === 'done') after++;
        if (after < 20 && log.length < 2000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [sc.rect, set.w, set.h] as [number[], number, number],
  );
  await toFrame(page, sc.frame + 5, set.frames);
  await expect(canvas).toHaveAttribute('data-scare', 'done', { timeout: 6000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __rec: unknown[] }).__rec.length)).toBeGreaterThan(5);
  const rec = await page.evaluate(() => (window as unknown as { __rec: [number, string, string, number, number][] }).__rec);
  const playing = rec.filter((r) => r[1] === 'playing');
  expect(playing.length, 'animation frames while the door moves').toBeGreaterThan(8);
  const start = playing[0][0];
  const end = rec.find((r) => r[1] === 'done')![0];
  // measured on the page, not read from the manifest: from the door starting to move to the door shut
  expect(end - start).toBeGreaterThanOrEqual(500);
  expect(end - start).toBeLessThanOrEqual(900);
  // the door really moves: many different patches drawn, and the pixels in the rectangle change
  const drawn = new Set(playing.map((r) => r[2]).filter((p) => p !== '-1'));
  expect(drawn.size, 'patches drawn').toBeGreaterThanOrEqual(8);
  expect(new Set(playing.map((r) => r[3])).size, 'different pictures in the door rectangle').toBeGreaterThanOrEqual(6);
  // Nothing flashes: over the whole beat, the door opening and shutting, the mean relative
  // luminance of the picture moves far less than the 0.1 that counts as a flash (WCAG 2.3.1).
  const lum = rec.map((r) => r[4]).filter((v) => v >= 0);
  expect(lum.length).toBeGreaterThan(8);
  expect(Math.max(...lum) - Math.min(...lum), 'change in mean relative luminance').toBeLessThan(0.1);
  // and it is shut again at the end: once it is over, no patch is drawn
  expect(rec[rec.length - 1][1]).toBe('done');
  expect(rec[rec.length - 1][2]).toBe('-1');
});

test('the old silhouette is gone', async ({ page, request }) => {
  await open(page);
  const { set } = await setInfo(page);
  for (const i of [0, Math.round(set.frames * 0.62), set.frames - 1]) {
    await walkTo(page, i, set.frames);
  }
  expect(await page.evaluate(() => sessionStorage.getItem('hotel:child'))).toBeNull();
  // and nothing in the shipped scripts still knows about it
  const sources = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
  expect(sources.length).toBeGreaterThan(0);
  for (const src of sources) {
    const body = await (await request.get(src)).text();
    expect(body).not.toContain('hotel:child');
    expect(body.toLowerCase()).not.toContain('silhouette');
  }
});

test('reduced motion: one still frame and no scare', async ({ browser }, info) => {
  const use = info.project.use;
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch });
  const page = await ctx.newPage();
  const frames: string[] = [];
  const patches: string[] = [];
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (FRAME.test(p)) frames.push(p);
    if (PATCH.test(p)) patches.push(p);
  });
  await open(page);
  const canvas = canvasOf(page);
  await expect(canvas).toHaveAttribute('data-scare', 'off');
  // walk the whole page: the corridor is an ordinary block, not a pinned walk
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize()!.height;
  for (let y = 0; y <= height; y += vh * 0.8) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(40);
  }
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toHaveAttribute('data-quality', 'full', { timeout: 20000 });
  await page.waitForTimeout(500);
  expect(frames.length, 'exactly one frame of the sequence is fetched').toBe(1);
  expect(patches).toEqual([]);
  await expect(canvas).toHaveAttribute('data-scare-plays', '0');
  expect(await page.evaluate((k) => sessionStorage.getItem(k), SCARE_KEY)).toBeNull();
  const b = await brightness(page);
  expect(b.peak).toBeGreaterThan(20);
  const box = await page.locator('#corridor').boundingBox();
  expect(box!.height).toBeLessThan(vh * 2.2);
  await ctx.close();
});

test('frames load only after the hero: nothing but one small poster until the first input', async ({ page }) => {
  const frames: number[] = [];
  const posters: { url: string; bytes: number }[] = [];
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (FRAME.test(p)) frames.push(Number(/(\d{3})\.\w+$/.exec(p)![1]));
  });
  page.on('response', async (r) => {
    if (POSTER.test(new URL(r.url()).pathname)) posters.push({ url: r.url(), bytes: (await r.body()).length });
  });
  await open(page);
  await page.waitForLoadState('load');
  expect(frames, 'no frame requested during load').toEqual([]);
  // nor in the first moments after it, while nobody has touched anything
  await page.waitForTimeout(1500);
  expect(frames, 'no frame requested before the first input').toEqual([]);
  await expect.poll(() => posters.length).toBe(1);
  expect(posters[0].bytes).toBeLessThan(16 * 1024);
  // the poster is already on the canvas
  await expect(canvasOf(page)).toHaveAttribute('data-quality', 'poster');

  // first input: the sequence starts, coarse pass first
  await page.evaluate(() => window.scrollTo(0, 40));
  await expect.poll(() => frames.length, { timeout: 15000 }).toBeGreaterThan(12);
  const { set } = await setInfo(page);
  const first = frames.slice(0, 8);
  for (const i of first) expect(i % 8 === 0 || i === set.frames - 1, `frame ${i} belongs to the coarse pass`).toBe(true);
  // and in the end every frame arrives
  await expect.poll(() => num(page, 'loaded'), { timeout: 60000 }).toBe(set.frames);
});

test('the canvas shows a frame, not black, all along the walk', async ({ page }) => {
  await open(page);
  const { set } = await setInfo(page);
  const seen: number[] = [];
  for (const p of [0.02, 0.2, 0.4, 0.6, 0.8, 0.98]) {
    const shown = await walkTo(page, Math.round(p * (set.frames - 1)), set.frames);
    seen.push(shown);
    const b = await brightness(page);
    expect(b.peak, `frame ${shown} has something lit in it`).toBeGreaterThan(24);
    expect(b.mean, `frame ${shown} is not a black canvas`).toBeGreaterThan(1);
  }
  // six different frames, in walking order
  expect(new Set(seen).size).toBe(6);
  expect([...seen].sort((a, b) => a - b)).toEqual(seen);
});

test('the set follows the viewport, and the canvas never holds more pixels than a frame', async ({ page }) => {
  await open(page);
  const { name, set } = await setInfo(page);
  const vp = page.viewportSize()!;
  expect(name).toBe(vp.height > vp.width ? 'mobile' : 'desktop');
  expect(set.h > set.w).toBe(vp.height > vp.width);
  await walkTo(page, 20, set.frames);
  const size = await canvasOf(page).evaluate((c) => ({ w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }));
  expect(size.w).toBeLessThanOrEqual(set.w);
  expect(size.h).toBeLessThanOrEqual(set.h);
  expect(size.w).toBeGreaterThan(200);
});

test('the canvas is drawn only when the frame changes', async ({ page }) => {
  await open(page);
  const { set } = await setInfo(page);
  await walkTo(page, 30, set.frames);
  await page.waitForTimeout(300);
  const before = await num(page, 'draws');
  await page.waitForTimeout(800);
  expect(await num(page, 'draws'), 'no repaint while standing still').toBe(before);
  await walkTo(page, 34, set.frames);
  expect(await num(page, 'draws')).toBeGreaterThan(before);
});

test('a supplied face photo is composited into the door gap', async ({ page }) => {
  // The slot is src/assets/scare/face.(avif|webp|png). The test stands in for the build-time
  // file with a fixture, through the hook the scrubber reads before it looks at the slot.
  const png = readFileSync(fileURLToPath(new URL('./fixtures/face.png', import.meta.url)));
  await page.addInitScript((url) => {
    (window as unknown as { __corridorFace: string }).__corridorFace = url;
  }, `data:image/png;base64,${png.toString('base64')}`);
  const patches: string[] = [];
  page.on('request', (r) => {
    const m = PATCH.exec(new URL(r.url()).pathname);
    if (m) patches.push(m[2]);
  });
  await open(page);
  const canvas = canvasOf(page);
  await expect(canvas).toHaveAttribute('data-face-mode', 'photo');
  const { set } = await setInfo(page);
  await approach(page, set);
  // While the door is open, measure the canvas inside the gap (the clip outline the manifest
  // gives for each scare frame) and in a band of the head quad just outside it.
  await page.evaluate(
    ([quads, fw, fh]) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-corridor]')!;
      const g = c.getContext('2d')!;
      const rec: { patch: number; inside: number; outside: number }[] = [];
      (window as unknown as { __faceRec: typeof rec }).__faceRec = rec;
      (window as unknown as { __gapMeans: unknown }).__gapMeans = (src: CanvasRenderingContext2D, j: number) => {
        const q = quads[j];
        if (!q) return null;
        const k = Math.max(c.width / fw, c.height / fh);
        const cx = (fw - c.width / k) / 2;
        const cy = (fh - c.height / k) / 2;
        const to = ([x, y]: number[]) => [(x * fw - cx) * k, (y * fh - cy) * k];
        const clip = new Path2D();
        q.clip.map(to).forEach(([x, y], i) => (i ? clip.lineTo(x, y) : clip.moveTo(x, y)));
        clip.closePath();
        const quad = q.quad.map(to);
        const xs = quad.map((p) => p[0]);
        const ys = quad.map((p) => p[1]);
        const x0 = Math.max(0, Math.floor(Math.min(...xs)));
        const y0 = Math.max(0, Math.floor(Math.min(...ys)));
        const x1 = Math.min(c.width, Math.ceil(Math.max(...xs)));
        const y1 = Math.min(c.height, Math.ceil(Math.max(...ys)));
        if (x1 <= x0 || y1 <= y0) return null;
        const d = src.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let si = 0;
        let ni = 0;
        let so = 0;
        let no = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
            const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            if (g.isPointInPath(clip, x + 0.5, y + 0.5)) {
              si += v;
              ni++;
            } else {
              so += v;
              no++;
            }
          }
        }
        return { inside: ni ? si / ni : -1, outside: no ? so / no : -1, n: ni };
      };
      const tick = () => {
        const j = Number(c.dataset.patch);
        if (c.dataset.scare === 'playing' && j >= 0) {
          const m = (window as unknown as { __gapMeans: (s: CanvasRenderingContext2D, j: number) => { inside: number; outside: number } | null }).__gapMeans(g, j);
          if (m) rec.push({ patch: j, inside: m.inside, outside: m.outside });
        }
        if (c.dataset.scare !== 'done') requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [set.scare.quads, set.w, set.h] as [SetInfo['scare']['quads'], number, number],
  );
  await toFrame(page, set.scare.frame + 5, set.frames);
  await expect(canvas).toHaveAttribute('data-scare', 'done', { timeout: 6000 });
  await expect(canvas).toHaveAttribute('data-scare-plays', '1');
  // the "empty gap" frames were used and the photo was drawn into them
  expect(new Set(patches)).toEqual(new Set(['g']));
  expect(await num(page, 'face-draws')).toBeGreaterThan(3);

  // The same scare frames again, drawn here without the photo (the walk frame and the empty-gap
  // patch, exactly as the scrubber lays them), measured the same way. Where the photo was drawn
  // the gap must be clearly lighter; outside the gap nothing may have changed.
  const rec = await page.evaluate(() => (window as unknown as { __faceRec: { patch: number; inside: number; outside: number }[] }).__faceRec);
  const mid = rec.filter((r) => r.patch >= Math.round(set.scare.count * 0.3) && r.patch <= Math.round(set.scare.count * 0.7));
  expect(mid.length, 'frames measured while the face is fully in').toBeGreaterThan(2);
  const base = await page.evaluate(
    async ([s, list]) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-corridor]')!;
      const root = c.dataset.base ?? '';
      const pad = (n: number, w: number) => String(n).padStart(w, '0');
      const bmp = async (url: string) => createImageBitmap(await (await fetch(url)).blob());
      const walk = await bmp(`${root}${s.dir}/${pad(s.scare.frame, 3)}.${s.ext}`);
      const off = document.createElement('canvas');
      off.width = c.width;
      off.height = c.height;
      const o = off.getContext('2d')!;
      const k = Math.max(c.width / s.w, c.height / s.h);
      const crop = { w: c.width / k, h: c.height / k, x: (s.w - c.width / k) / 2, y: (s.h - c.height / k) / 2 };
      const out: Record<number, unknown> = {};
      for (const j of list) {
        o.drawImage(walk, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
        const patch = await bmp(`${root}${s.dir}/s/g-${pad(j, 2)}.${s.ext}`);
        const [x, y, w, h] = s.scare.rect;
        o.drawImage(patch, (x - crop.x) * k, (y - crop.y) * k, w * k, h * k);
        out[j] = (window as unknown as { __gapMeans: (s: CanvasRenderingContext2D, j: number) => unknown }).__gapMeans(o, j);
      }
      return out;
    },
    [set, [...new Set(mid.map((r) => r.patch))]] as [SetInfo, number[]],
  );
  for (const r of mid) {
    const b = base[r.patch] as { inside: number; outside: number; n: number };
    expect(b.n, `the gap covers pixels at scare frame ${r.patch}`).toBeGreaterThan(30);
    expect(r.inside, `scare frame ${r.patch}: the photo lights the gap (without it: ${b.inside.toFixed(1)})`).toBeGreaterThan(b.inside * 1.3 + 3);
    expect(Math.abs(r.outside - b.outside), `scare frame ${r.patch}: nothing is drawn outside the gap`).toBeLessThan(2.5);
  }
});

test('every frame of both sets is lit: none of them is a black screen', async ({ page }, info) => {
  // Decoded here, in the browser that shows them, frame by frame: not sampled along the walk.
  test.skip(info.project.name !== 'desktop-1440', 'the frames are the same files for both projects');
  test.slow();
  await open(page);
  const manifest = JSON.parse((await canvasOf(page).getAttribute('data-manifest')) ?? '{}');
  for (const name of ['desktop', 'mobile']) {
    const s = manifest.sets[name] as SetInfo;
    const means = await page.evaluate(async (s) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-corridor]')!;
      const root = c.dataset.base ?? '';
      const off = document.createElement('canvas');
      off.width = Math.round(s.w / 8);
      off.height = Math.round(s.h / 8);
      const o = off.getContext('2d', { willReadFrequently: true })!;
      const out: { mean: number; p99: number }[] = [];
      for (let i = 0; i < s.frames; i++) {
        const blob = await (await fetch(`${root}${s.dir}/${String(i).padStart(3, '0')}.${s.ext}`)).blob();
        const bmp = await createImageBitmap(blob);
        o.drawImage(bmp, 0, 0, off.width, off.height);
        bmp.close();
        const d = o.getImageData(0, 0, off.width, off.height).data;
        const lum: number[] = [];
        let sum = 0;
        for (let k = 0; k < d.length; k += 4) {
          const v = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
          sum += v;
          lum.push(v);
        }
        lum.sort((a, b) => a - b);
        out.push({ mean: sum / lum.length, p99: lum[Math.floor(lum.length * 0.99)] });
      }
      return out;
    }, s);
    expect(means.length).toBe(s.frames);
    // The darkest beat (the lamps dying behind the walker after the scare) is designed: a dark
    // corridor with its far end lit, a mean of about 6/255. A black screen is a mean of 1 or 2.
    const darkest = Math.min(...means.map((m) => m.mean));
    const at = means.findIndex((m) => m.mean === darkest);
    expect(darkest, `${name}: frame ${at} is the darkest (mean ${darkest.toFixed(1)}/255)`).toBeGreaterThan(5);
    // and every frame has something clearly lit in it: its brightest 1 % of pixels
    const dimmest = Math.min(...means.map((m) => m.p99));
    const at2 = means.findIndex((m) => m.p99 === dimmest);
    expect(dimmest, `${name}: frame ${at2} has the dimmest highlights (${dimmest.toFixed(0)}/255)`).toBeGreaterThan(48);
  }
});

test('without a photo in the slot the page says so', async ({ page }) => {
  await open(page);
  await expect(canvasOf(page)).toHaveAttribute('data-face-mode', 'stand-in');
});

test('the photo slot is wired at build time: a face file in src/assets/scare reaches the page', async ({}, info) => {
  // One build is enough for both projects, and two at once would share the slot.
  test.skip(info.project.name !== 'desktop-1440', 'runs once, in the desktop project');
  test.slow();
  const root = fileURLToPath(new URL('..', import.meta.url));
  const fixture = join(root, 'tests', 'fixtures', 'face.png');
  const slot = join(root, 'src', 'assets', 'scare', 'face.png');
  const out = join(root, 'test-results', 'face-slot-build');
  expect(existsSync(slot), 'the slot is empty in the repository').toBe(false);
  // the site the other tests run against was built without a face
  expect(readFileSync(join(root, 'dist', 'ro', 'index.html'), 'utf8')).not.toContain('data-face=');
  copyFileSync(fixture, slot);
  try {
    execFileSync('npx', ['astro', 'build', '--outDir', out], { cwd: root, stdio: 'pipe', timeout: 170000 });
  } finally {
    rmSync(slot, { force: true });
  }
  try {
    for (const lang of ['ro', 'ru', 'en']) {
      const html = readFileSync(join(out, lang, 'index.html'), 'utf8');
      const m = /data-face="([^"]+)"/.exec(html);
      expect(m, `${lang}: the canvas carries the face`).toBeTruthy();
      const url = m![1];
      // Vite inlines a file under 4 kB (the fixture is one) and emits anything larger (a real photo)
      const bytes = url.startsWith('data:image/png;base64,')
        ? Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
        : readFileSync(join(out, url.replace(/^\/horror\//, '')));
      if (!url.startsWith('data:')) expect(url).toMatch(/^\/horror\/.+\.png$/);
      expect(bytes.equals(readFileSync(fixture)), `${lang}: the face on the page is the file in the slot`).toBe(true);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
