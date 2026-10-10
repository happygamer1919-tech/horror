// Screenshot helper for the build loop.
// Usage: node scripts/shots.mjs <name> [selector] [lang] [--lift] [--full] [--y=0.5] [--wait=800] [--still]
// Needs `node scripts/serve.mjs` running on port 4321 (after `npm run build`). Writes docs/screenshots/<name>-<width>.jpg
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k, v ?? true]));
const [name = 'page', selector = '', lang = 'ro'] = args.filter((a) => !a.startsWith('--'));
const url = `http://localhost:4321/${lang}/`;
const sizes = [
  { w: 390, h: 844, dpr: 2, mobile: true },
  { w: 1440, h: 900, dpr: 1, mobile: false },
];

const browser = await chromium.launch();
for (const s of sizes) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: s.dpr,
    isMobile: s.mobile,
    hasTouch: s.mobile,
    reducedMotion: flags.still ? 'reduce' : 'no-preference',
  });
  if (!flags.lift) await ctx.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(url, { waitUntil: 'load' });
  if (selector) {
    const frac = Number(flags.y ?? 0);
    await page.evaluate(
      ([sel, f]) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        window.scrollTo(0, window.scrollY + r.top + (r.height - window.innerHeight) * f);
      },
      [selector, frac],
    );
  }
  if (!s.mobile && flags.mouse) {
    const [mx, my] = String(flags.mouse).split(',').map(Number);
    await page.mouse.move(mx, my);
  }
  const path = `docs/screenshots/${name}-${s.w}.jpg`;
  if (flags.el && selector) {
    // Whole element: walk through it first so scroll reveals fire, and hide the fixed overlays.
    await page.addStyleTag({ content: '.torch,.bar,.sticky,.skip-link,.grain,.tint{display:none!important}' });
    const box = await page.locator(selector).boundingBox();
    for (let y = 0; y <= box.height; y += s.h * 0.6) {
      await page.evaluate((dy) => window.scrollBy(0, dy), s.h * 0.6);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(Number(flags.wait ?? 1200));
    await page.locator(selector).screenshot({ path, type: 'jpeg', quality: 80 });
  } else {
    await page.waitForTimeout(Number(flags.wait ?? 1200));
    await page.screenshot({ path, fullPage: Boolean(flags.full), type: 'jpeg', quality: 80 });
  }
  console.log(path);
  await ctx.close();
}
await browser.close();
