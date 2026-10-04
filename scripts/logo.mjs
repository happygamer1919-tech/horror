// Square logo for the owner to upload as an avatar (EasyWeek, Google): the site wordmark on
// the site's ink background, with the key mark of the favicon above it.
// Usage: node scripts/logo.mjs [--preview=<dir>]
// Writes docs/brand/logo-1024.png and docs/brand/logo-512.png. Nothing is served and nothing
// is built: the page is made here from the site's own font file, colours and favicon.
// Avatars are cropped to a circle, so the whole mark is sized to sit inside the inscribed
// circle with room to spare (SAFE below). --preview also writes the circular crop.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// The wordmark and the colours come from the site, not from this file.
const brand = /brand: '([^']+)'/.exec(read('src/content/site.ts'))[1];
const css = read('src/styles/global.css');
const ink = /--ink: (#[0-9a-f]+)/i.exec(css)[1];
const bone = /--bone: (#[0-9a-f]+)/i.exec(css)[1];
// Two lines, split as on the hero (Hero.astro): at the last space.
const cut = brand.lastIndexOf(' ');
const lines = cut > 0 ? [brand.slice(0, cut), brand.slice(cut + 1)] : [brand];
// The key of the favicon, without its background square.
const key = read('public/favicon.svg')
  .replace(/<rect[^>]*\/>/, '')
  .replace('viewBox="0 0 32 32"', 'viewBox="8 2.5 16 26.5"');
const font = readFileSync(join(root, 'node_modules/@fontsource-variable/playfair-display/files/playfair-display-cyrillic-wght-normal.woff2')).toString('base64');

// How much of the inscribed circle's radius the mark may reach.
const SAFE = 0.85;
const BASE = 512;

const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><style>
@font-face { font-family: 'Logo Serif'; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 400 900; }
html, body { margin: 0; width: ${BASE}px; height: ${BASE}px; background: ${ink}; }
body { display: grid; place-items: center; }
.mark { display: grid; justify-items: center; gap: 0.3em; color: ${bone}; font-family: 'Logo Serif', Georgia, serif; font-weight: 900; font-size: 60px; line-height: 0.92; letter-spacing: -0.02em; text-align: center; }
.mark svg { width: 0.5em; height: auto; display: block; }
.mark span { display: block; white-space: nowrap; }
.ring { position: fixed; inset: 0; border-radius: 50%; box-shadow: 0 0 0 ${BASE}px #fff; display: none; }
.crop .ring { display: block; }
</style><body><div class="mark">${key}<div>${lines.map((l) => `<span>${l}</span>`).join('')}</div></div><div class="ring"></div></body></html>`;

const preview = (process.argv.find((a) => a.startsWith('--preview=')) ?? '').split('=')[1];
const out = join(root, 'docs/brand');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const size of [1024, 512]) {
  const ctx = await browser.newContext({ viewport: { width: BASE, height: BASE }, deviceScaleFactor: size / BASE });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  // The largest type size at which every corner of the mark is inside the safe circle.
  const fit = await page.evaluate(
    ({ safe, base }) => {
      const mark = document.querySelector('.mark');
      const reach = () => {
        const r = mark.getBoundingClientRect();
        const c = base / 2;
        return Math.max(...[r.left, r.right].flatMap((x) => [r.top, r.bottom].map((y) => Math.hypot(x - c, y - c))));
      };
      let size = 20;
      for (let s = 20; s <= 200; s += 0.5) {
        mark.style.fontSize = `${s}px`;
        if (reach() > (base / 2) * safe) break;
        size = s;
      }
      mark.style.fontSize = `${size}px`;
      return { size, reach: reach() / (base / 2), font: document.fonts.check(`900 ${size}px 'Logo Serif'`) };
    },
    { safe: SAFE, base: BASE },
  );
  if (!fit.font) throw new Error('the site font did not load');
  await page.screenshot({ path: join(out, `logo-${size}.png`), type: 'png' });
  console.log(`docs/brand/logo-${size}.png: type ${fit.size}px of ${BASE}, the mark reaches ${(fit.reach * 100).toFixed(0)}% of the circle's radius`);
  if (preview) {
    await page.evaluate(() => document.body.classList.add('crop'));
    await page.screenshot({ path: join(preview, `logo-${size}-circle.png`), type: 'png' });
  }
  await ctx.close();
}
await browser.close();
