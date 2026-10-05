// Pictures of the corridor as the built site shows it, for docs/screenshots/:
//   20-chapter-1, -2, -3      each chapter as a strip: eight screenshots at even steps of its
//                             playing time, tiled into one image
//   20-chapter-3-scare        the door beat: eight screenshots across its 625 ms
//   03-corridor-1, -2, -3     the stage at rest at the end of each chapter
//   03-corridor-still         what a visitor with reduced motion gets
//   19-scare                  the door, open
// each at 390 x 844 (touch, 2x) and 1440 x 900. Builds nothing: run `npm run build` first.
//   node scripts/corridor-shots.mjs [lang]
//
// The chapters are played slowly while the screenshots are taken (the page's own test hook for
// the playing speed): a screenshot takes longer than a frame lasts, and what is photographed
// must be the frame of that moment. The captions follow the video's time, so they are where
// they are at full speed. Each chapter is started by putting the page on its stop, and a key
// that does nothing is pressed before every screenshot, so the page does not take the slow
// playing for an idle visitor and dim its lights.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const lang = process.argv[2] ?? 'ro';
const PORT = 4343;
const server = spawn('node', [join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const url = `http://localhost:${PORT}/horror/${lang}/`;
const out = (name, w) => join(ROOT, 'docs', 'screenshots', `${name}-${w}.jpg`);
const sizes = [
  { w: 390, h: 844, dpr: 2, mobile: true, tile: 240, cols: 8 },
  { w: 1440, h: 900, dpr: 1, mobile: false, tile: 640, cols: 4 },
];
const STEPS = 8;
const SLOW = 0.25;

// tiles in rows of `cols`, each with its time written under it
async function sheet(shots, s, file) {
  const th = Math.round((s.tile * s.h) / s.w);
  const label = 26;
  const gap = 6;
  const rows = Math.ceil(shots.length / s.cols);
  const tiles = await Promise.all(
    shots.map(async (shot, i) => {
      const img = await sharp(shot.png).resize(s.tile, th).toBuffer();
      const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s.tile}" height="${label}"><rect width="100%" height="100%" fill="#111"/><text x="8" y="18" font-family="Menlo, monospace" font-size="13" fill="#d8ccb4">${shot.label}</text></svg>`);
      const left = (i % s.cols) * (s.tile + gap);
      const top = Math.floor(i / s.cols) * (th + label + gap);
      return [
        { input: img, left, top },
        { input: text, left, top: top + th },
      ];
    }),
  );
  await sharp({ create: { width: s.cols * s.tile + (s.cols - 1) * gap, height: rows * (th + label) + (rows - 1) * gap, channels: 3, background: '#000' } })
    .composite(tiles.flat())
    .jpeg({ quality: 86 })
    .toFile(file);
  console.log(file);
}

const browser = await chromium.launch();
try {
  for (const s of sizes) {
    const make = async ({ reduced = false, scareDone = false, rate = 8 } = {}) => {
      const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, isMobile: s.mobile, hasTouch: s.mobile, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await ctx.addInitScript(
        ([done, r]) => {
          sessionStorage.setItem('hotel:lift', '1');
          if (done) sessionStorage.setItem('hotel:scare', '1');
          window.__corridorRate = r;
        },
        [scareDone, rate],
      );
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log('page error:', e.message));
      await page.goto(url, { waitUntil: 'load' });
      return { ctx, page };
    };
    const stage = (page) => page.locator('[data-corridor]');
    const state = (page) => stage(page).evaluate((el) => ({ ...el.dataset, manifest: undefined }));
    const stops = async (page) => (await stage(page).getAttribute('data-stops')).split(' ').map(Number);
    const info = (page) => stage(page).evaluate((el) => JSON.parse(el.dataset.manifest).sets[el.dataset.set]);
    const rest = (page, k) => page.waitForFunction((n) => ((d) => d.chapter === String(n) && d.state === 'rest')(document.querySelector('[data-corridor]').dataset), k, { timeout: 120000 });
    const setRate = (page, r) => page.evaluate((v) => (window.__corridorRate = v), r);
    const to = async (page, k) => {
      // stop k, at rest
      const st = await stops(page);
      await page.evaluate((y) => window.scrollTo(0, y), st[Math.max(0, k)]);
      await rest(page, Math.max(0, k));
      await page.waitForTimeout(500);
    };
    const shoot = async (page) => {
      await page.keyboard.press('Shift');
      return page.screenshot({ type: 'png' });
    };
    // forwards one stop: the chapter of that stop starts
    const start = async (page, k) => {
      const st = await stops(page);
      await page.evaluate((y) => window.scrollTo(0, y), st[k]);
    };
    // Play chapter k from the stop before it and take a screenshot each time the video reaches
    // one of `times` (seconds of the chapter).
    const strip = async (page, k, id, times) => {
      await to(page, k - 1);
      await page.waitForFunction((f) => document.querySelector('[data-corridor]').dataset.loaded.split(' ').includes(f), id, { timeout: 60000 });
      await setRate(page, SLOW);
      await start(page, k);
      const shots = [];
      for (const t of times) {
        await page.waitForFunction(
          ([f, at]) => {
            const d = document.querySelector('[data-corridor]').dataset;
            const v = document.querySelector(`.corr__video[data-file="${f}"]`);
            return (v && v.currentTime >= at) || (d.state === 'rest' && d.played !== '0');
          },
          [id, t],
          { timeout: 120000, polling: 'raf' },
        );
        shots.push({ png: await shoot(page), label: `${t.toFixed(2)} s` });
      }
      await setRate(page, 8);
      return shots;
    };
    const even = (duration) => Array.from({ length: STEPS }, (_, i) => 0.12 + ((duration - 0.3) * i) / (STEPS - 1));

    // the three chapters, the scare switched off so chapter 3 is the plain walk
    {
      const { ctx, page } = await make({ scareDone: true });
      const set = await info(page);
      for (const [k, id] of [[1, 'c1'], [2, 'c2'], [3, 'c3']]) {
        const shots = await strip(page, k, id, even(set.files[id].duration));
        await rest(page, k);
        await page.waitForTimeout(900); // the caption has finished coming up
        await page.keyboard.press('Shift');
        await page.screenshot({ path: out(`03-corridor-${k}`, s.w), type: 'jpeg', quality: 84 });
        console.log(out(`03-corridor-${k}`, s.w));
        shots[shots.length - 1] = { png: await shoot(page), label: `${set.files[id].duration.toFixed(2)} s, at rest` };
        await sheet(shots, s, out(`20-chapter-${k}`, s.w));
      }
      await ctx.close();
    }
    // the scare, first pass of a fresh session: the beat, and the frame with the door open
    {
      const { ctx, page } = await make();
      const set = await info(page);
      const sc = set.files.c3s.scare;
      const times = Array.from({ length: STEPS }, (_, i) => sc.at - 1 / 24 + ((sc.end - sc.at + 2 / 24) * i) / (STEPS - 1));
      // up to the door at speed, then slowly through the beat
      await to(page, 2);
      await page.waitForFunction(() => document.querySelector('[data-corridor]').dataset.loaded.split(' ').includes('c3s'), null, { timeout: 60000 });
      await setRate(page, 1);
      await start(page, 3);
      await page.waitForFunction((at) => ((v) => v && v.currentTime >= at - 0.6)(document.querySelector('.corr__video[data-file="c3s"]')), sc.at, { timeout: 60000, polling: 'raf' });
      await page.evaluate((r) => (document.querySelector('.corr__video[data-file="c3s"]').playbackRate = r), 0.1);
      const shots = [];
      for (const t of times) {
        await page.waitForFunction((at) => document.querySelector('.corr__video[data-file="c3s"]').currentTime >= at, t, { timeout: 60000, polling: 'raf' });
        const png = await shoot(page);
        shots.push({ png, label: `${t.toFixed(3)} s` });
        // the frame the review still was taken from: the face in the gap, about the middle of the beat
        if (shots.length === Math.ceil(STEPS / 2) + 1) {
          await sharp(png).jpeg({ quality: 84 }).toFile(out('19-scare', s.w));
          console.log(out('19-scare', s.w), (await state(page)).scareBeats);
        }
      }
      await sheet(shots, s, out('20-chapter-3-scare', s.w));
      await ctx.close();
    }
    // reduced motion: three stills, no pin
    {
      const { ctx, page } = await make({ reduced: true });
      await page.evaluate(() => document.getElementById('corridor').scrollIntoView());
      await page.waitForFunction(() => [1, 2, 3].every((k) => ((el) => el.complete && el.naturalWidth > 0)(document.querySelector(`img[data-pose="${k}"]`))), null, { timeout: 30000 });
      await page.waitForTimeout(300);
      // the fixed layers would be stitched into the middle of a picture this tall
      await page.addStyleTag({ content: '.torch,.bar,.sticky,.skip-link,.ask{display:none!important}' });
      await page.locator('#corridor').screenshot({ path: out('03-corridor-still', s.w), type: 'jpeg', quality: 84 });
      console.log(out('03-corridor-still', s.w));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
