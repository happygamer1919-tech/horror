// Hero screenshot helper. Needs `PORT=4342 node scripts/serve.mjs` running after a build.
// Usage: node scripts/hero-shots.mjs ['<json>'] where json is one shot or an array of shots:
//   { out, w, h, touch, lang, still, mouse:[x,y], tap:[x,y], drag:[[x,y],...], eval:"js", settle, wait, clip:{x,y,width,height},
//     unit:{x,y,w,h,pad} (clip given in facade units), scale }
import { chromium } from '@playwright/test';

const PORT = process.env.PORT ?? 4342;
// With no argument it takes the whole hero set listed in scripts/hero-shots.json.
import { readFileSync } from 'node:fs';
const input = JSON.parse(process.argv[2] ?? readFileSync(new URL('./hero-shots.json', import.meta.url), 'utf8'));
const shots = Array.isArray(input) ? input : [input];
const browser = await chromium.launch();
for (const s of shots) {
  const touch = Boolean(s.touch);
  const ctx = await browser.newContext({
    viewport: { width: s.w ?? 390, height: s.h ?? 844 },
    deviceScaleFactor: s.scale ?? (touch ? 2 : 1),
    isMobile: touch,
    hasTouch: touch,
    reducedMotion: s.still ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(`http://localhost:${PORT}/${s.lang ?? 'ro'}/`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(s.settle ?? 700);
  if (s.mouse) await page.mouse.move(s.mouse[0], s.mouse[1], { steps: 4 });
  const cdp = touch ? await ctx.newCDPSession(page) : null;
  const pt = ([x, y]) => [{ x, y, id: 1 }];
  if (s.tap && cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(s.tap) });
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  if (s.drag && cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(s.drag[0]) });
    for (const p of s.drag.slice(1)) {
      await page.waitForTimeout(40);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  if (s.eval) await page.evaluate(s.eval);
  await page.waitForTimeout(s.wait ?? 1200);
  let clip = s.clip;
  if (s.unit) {
    // A crop given in facade units (the 600 x 900 drawing).
    clip = await page.evaluate((b) => {
      const f = document.querySelector('[data-facade]').getBoundingClientRect();
      const u = Math.max(f.width / 600, f.height / 900);
      const ox = f.left + f.width / 2 - 300 * u;
      const pad = b.pad ?? 0;
      return { x: Math.max(0, ox + (b.x - pad) * u), y: Math.max(0, f.top + (b.y - pad) * u), width: (b.w + 2 * pad) * u, height: (b.h + 2 * pad) * u };
    }, s.unit);
  }
  await page.screenshot({ path: s.out, type: s.out.endsWith('.png') ? 'png' : 'jpeg', ...(s.out.endsWith('.png') ? {} : { quality: s.q ?? 84 }), ...(clip ? { clip } : {}) });
  console.log(s.out);
  await ctx.close();
}
await browser.close();
