// Screenshots of the corridor as the site shows it, for docs/screenshots/:
//   03-corridor-1..6   six points of the walk
//   03-corridor-still  what a visitor with reduced motion gets
//   19-scare           the door, open
// each at 390 x 844 (touch, 2x) and 1440 x 900. Builds nothing: run `npm run build` first.
//   node scripts/corridor-shots.mjs [lang]
import { chromium } from '@playwright/test';
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
  { w: 390, h: 844, dpr: 2, mobile: true },
  { w: 1440, h: 900, dpr: 1, mobile: false },
];
// the start, then points inside each caption (not on a fade), then the last door
const POINTS = [0.02, 0.09, 0.4, 0.6, 0.86, 0.99];

const toFrame = (page, i, n) =>
  page.evaluate(
    ([idx, frames]) => {
      const el = document.getElementById('corridor');
      const r = el.getBoundingClientRect();
      window.scrollTo(0, Math.round(window.scrollY + r.top + (r.height - window.innerHeight) * (idx / (frames - 1))));
    },
    [i, n],
  );
const settle = (page, i) =>
  page.waitForFunction(
    (idx) => {
      const d = document.querySelector('[data-corridor]').dataset;
      return d.quality === 'full' && d.frame === d.target && Math.abs(Number(d.target) - idx) <= 1;
    },
    i,
    { timeout: 30000 },
  );

const browser = await chromium.launch();
try {
  for (const s of sizes) {
    const make = async (reduced) => {
      const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, isMobile: s.mobile, hasTouch: s.mobile, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await ctx.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log('page error:', e.message));
      await page.goto(url, { waitUntil: 'load' });
      return { ctx, page };
    };
    const shot = (page, name) => page.screenshot({ path: out(name, s.w), type: 'jpeg', quality: 84 });

    // the walk; the scare is switched off for these so every frame is the plain walk
    {
      const { ctx, page } = await make(false);
      await page.evaluate(() => sessionStorage.setItem('hotel:scare', '1'));
      await page.reload({ waitUntil: 'load' });
      const info = await page.evaluate(() => {
        const c = document.querySelector('[data-corridor]');
        return JSON.parse(c.dataset.manifest).sets[c.dataset.set];
      });
      for (let k = 0; k < POINTS.length; k++) {
        const i = Math.round(POINTS[k] * (info.frames - 1));
        await toFrame(page, i, info.frames);
        await settle(page, i);
        await page.waitForTimeout(700); // captions finish their fade
        await shot(page, `03-corridor-${k + 1}`);
        console.log(`03-corridor-${k + 1}-${s.w}  frame ${i}`);
      }
      await ctx.close();
    }
    // the scare, first pass of a fresh session, at the frame the review still was taken from
    {
      const { ctx, page } = await make(false);
      const info = await page.evaluate(() => {
        const c = document.querySelector('[data-corridor]');
        return JSON.parse(c.dataset.manifest).sets[c.dataset.set];
      });
      const f = info.scare.frame;
      await toFrame(page, f - 8, info.frames);
      await settle(page, f - 8);
      await page.waitForFunction(() => document.querySelector('[data-corridor]').dataset.scareReady === '1', null, { timeout: 30000 });
      await toFrame(page, f + 1, info.frames);
      await page.waitForFunction(() => Number(document.querySelector('[data-corridor]').dataset.patch) >= 8, null, { timeout: 10000, polling: 'raf' });
      await shot(page, '19-scare');
      console.log(`19-scare-${s.w}  frame ${f}, patch ${await page.evaluate(() => document.querySelector('[data-corridor]').dataset.patch)}`);
      await ctx.close();
    }
    // reduced motion: one still frame, no pin
    {
      const { ctx, page } = await make(true);
      await page.evaluate(() => document.getElementById('corridor').scrollIntoView());
      await page.waitForFunction(() => document.querySelector('[data-corridor]').dataset.quality === 'full', null, { timeout: 30000 });
      await page.waitForTimeout(300);
      await shot(page, '03-corridor-still');
      console.log(`03-corridor-still-${s.w}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
