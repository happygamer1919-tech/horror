// Pictures of the corridor as the built site shows it, for docs/screenshots/:
//   21-clip               the clip as a strip: twelve screenshots at even steps of its playing
//                         time, the first play (the variant with the door), tiled into one image
//   19-scare              the door, open
//   03-corridor-start     the stage before the clip: the first frame
//   03-corridor-rest      the stage after it: the last door, its caption, the Replay button
//   03-corridor-tap       the "Tap to enter" button, where the browser will not start a video
//   03-corridor-still     what a visitor with reduced motion gets
// each at 390 x 844 (touch, 2x) and 1440 x 900. Builds nothing: run `npm run build` first.
//   node scripts/corridor-shots.mjs [lang]
//
//   node scripts/corridor-shots.mjs --framing=NAME:DIR [--framing=NAME:DIR ...]
// makes 22-framing-NAME-390 instead: a strip of the frames in DIR (made by
// `node scripts/corridor-video.mjs --framing=NAME --stills=DIR --at=...`) on the phone stage,
// with the page around them, to compare ways of cutting the phone window.
//
// The clip is played slowly while the screenshots are taken, and held on its frame for each
// one: a screenshot takes longer than a frame lasts, and what is photographed must be the
// frame of that moment. The captions follow the clip's time, so they are where they are at
// full speed. The page is told a speed slower still (its own test hook), because it lets go
// of the page a second after the clip should have ended at the speed it was told, and the
// stops for the screenshots take longer than that. The clip is started the way a visitor
// starts it, by scrolling down to it with a key.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const lang = argv.find((a) => !a.startsWith('--')) ?? 'ro';
const framings = argv.filter((a) => a.startsWith('--framing=')).map((a) => a.slice(10).split(':'));
const PORT = 4343;
const server = spawn('node', [join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const url = `http://localhost:${PORT}/${lang}/`;
const out = (name, w) => join(ROOT, 'docs', 'screenshots', `${name}-${w}.jpg`);
const sizes = [
  { w: 390, h: 844, dpr: 2, mobile: true, tile: 240, cols: 6 },
  { w: 1440, h: 900, dpr: 1, mobile: false, tile: 640, cols: 4 },
];
const STEPS = 12;
const SLOW = 0.15; // how fast the clip plays here
const TOLD = 0.07; // and what the page is told (about as slow as a browser will play)

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
  for (const s of framings.length ? sizes.slice(0, 1) : sizes) {
    const make = async ({ reduced = false, seen = false, rate = 1, refuse = false } = {}) => {
      const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, isMobile: s.mobile, hasTouch: s.mobile, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await ctx.addInitScript(
        ([done, r, no]) => {
          sessionStorage.setItem('hotel:lift', '1');
          if (done) sessionStorage.setItem('hotel:corridor', '1');
          window.__corridorRate = r;
          // a browser that starts no video by itself
          if (no) HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('no', 'NotAllowedError'));
        },
        [seen, rate, refuse],
      );
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log('page error:', e.message));
      await page.goto(url, { waitUntil: 'load' });
      return { ctx, page };
    };
    const stage = (page) => page.locator('[data-corridor]');
    const data = (page, key) => stage(page).evaluate((el, k) => el.dataset[k] ?? '', key);
    const info = (page) => stage(page).evaluate((el) => JSON.parse(el.dataset.manifest).sets[el.dataset.set]);
    const state = (page, want) => page.waitForFunction((v) => document.querySelector('[data-corridor]').dataset.state === v, want, { timeout: 120000 });
    // the corridor at the top of the screen, as it is while the clip plays (a jump: nothing is caught)
    const toTop = (page) => page.evaluate(() => window.scrollTo(0, Number(document.querySelector('[data-corridor]').dataset.top)));
    // a key that does nothing: the page does not take the wait for an idle visitor and dim its lights
    const shoot = async (page) => {
      await page.keyboard.press('Shift');
      return page.screenshot({ type: 'png' });
    };
    // down to the corridor as a visitor comes: by scrolling, here with the keyboard
    const walkIn = async (page) => {
      await page.keyboard.press('Shift');
      await page.waitForFunction(() => document.querySelector('[data-corridor]').dataset.primed || document.querySelector('[data-corridor]').dataset.prime, null, { timeout: 60000 });
      for (let i = 0; i < 6 && (await data(page, 'state')) === 'idle'; i++) {
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(500);
      }
    };
    const at = async (page, t) => {
      await page.waitForFunction(
        (time) => {
          const v = document.querySelector('.corr__video');
          if (!v || v.currentTime < time) return document.querySelector('[data-corridor]').dataset.state !== 'play';
          v.pause();
          return true;
        },
        t,
        { timeout: 120000, polling: 'raf' },
      );
      await page.waitForTimeout(120);
      const png = await shoot(page);
      await page.evaluate(() => document.querySelector('.corr__video')?.play());
      return png;
    };

    // ways of cutting the phone window, side by side: their frames on the stage, with the page
    if (framings.length) {
      for (const [name, dir] of framings) {
        const meta = JSON.parse(await readFile(join(dir, 'frames.json'), 'utf8'));
        const { ctx, page } = await make();
        await page.keyboard.press('Shift');
        await toTop(page);
        await page.waitForTimeout(600);
        const caps = await info(page).then((set) => set.clips.plain.cues);
        const shots = [];
        for (const [t, time] of Object.entries(meta.time)) {
          const file = await readFile(join(dir, `t${String(t).padStart(4, '0')}.webp`));
          await stage(page).evaluate(
            async (el, [src, w, h, cues, time]) => {
              el.style.setProperty('--corr-w', w);
              el.style.setProperty('--corr-h', h);
              const img = el.querySelector('[data-pic="first"]');
              img.src = src;
              await img.decode();
              img.classList.add('is-on');
              el.querySelector('[data-corr-skip]').hidden = false;
              el.querySelectorAll('[data-cap]').forEach((li, i) => li.classList.toggle('is-on', cues.some((c) => c.cap === i && time >= c.in && (c.out === undefined || time < c.out))));
            },
            [`data:image/webp;base64,${file.toString('base64')}`, meta.w, meta.h, caps, time],
          );
          await page.waitForTimeout(350);
          shots.push({ png: await shoot(page), label: `${time.toFixed(2)} s` });
        }
        await sheet(shots, s, out(`22-framing-${name}`, s.w));
        await ctx.close();
      }
      continue;
    }

    // the first play of a fresh session: the clip with the door
    {
      const { ctx, page } = await make({ rate: TOLD });
      const clip = (await info(page)).clips.scare;
      await toTop(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: out('03-corridor-start', s.w), type: 'jpeg', quality: 84 });
      console.log(out('03-corridor-start', s.w));
      await page.evaluate(() => window.scrollTo(0, 0));
      await walkIn(page);
      await state(page, 'play');
      await page.evaluate((r) => (document.querySelector('.corr__video').playbackRate = r), SLOW);
      const shots = [];
      for (let i = 0; i < STEPS; i++) {
        const t = 0.1 + ((clip.duration - 0.25) * i) / (STEPS - 1);
        shots.push({ png: await at(page, t), label: i === STEPS - 1 ? `${clip.duration.toFixed(2)} s, the end` : `${t.toFixed(2)} s` });
        // the beat: the face in the gap, about the middle of it
        if (t < clip.scare.at && 0.1 + ((clip.duration - 0.25) * (i + 1)) / (STEPS - 1) > clip.scare.at) {
          await sharp(await at(page, (clip.scare.at + clip.scare.end) / 2)).jpeg({ quality: 84 }).toFile(out('19-scare', s.w));
          console.log(out('19-scare', s.w), await data(page, 'scareBeats'));
        }
      }
      await sheet(shots, s, out('21-clip', s.w));
      await ctx.close();
    }
    // afterwards: the last door, its caption, the Replay button
    {
      const { ctx, page } = await make({ seen: true });
      await page.keyboard.press('Shift');
      await toTop(page);
      await page.waitForFunction(() => document.querySelector('[data-pic="last"]').classList.contains('is-on'), null, { timeout: 30000 });
      await page.waitForTimeout(900);
      await page.keyboard.press('Shift');
      await page.screenshot({ path: out('03-corridor-rest', s.w), type: 'jpeg', quality: 84 });
      console.log(out('03-corridor-rest', s.w));
      await ctx.close();
    }
    // a browser that will not start a video by itself
    {
      const { ctx, page } = await make({ refuse: true });
      await walkIn(page);
      await state(page, 'tap');
      await page.waitForTimeout(900);
      await page.keyboard.press('Shift');
      await page.screenshot({ path: out('03-corridor-tap', s.w), type: 'jpeg', quality: 84 });
      console.log(out('03-corridor-tap', s.w));
      await ctx.close();
    }
    // reduced motion: three stills, nothing held
    {
      const { ctx, page } = await make({ reduced: true });
      await toTop(page);
      await page.waitForFunction(() => ['still-1', 'still-2', 'last'].every((k) => ((el) => el.complete && el.naturalWidth > 0)(document.querySelector(`img[data-pic="${k}"]`))), null, { timeout: 30000 });
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
