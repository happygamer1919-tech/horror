// Social share images, 1200 x 630, one per language, rendered from the real hero:
// the neon sign, the facade and the wordmark. Output: public/og/<lang>.jpg (committed).
// Usage: npm run build && node scripts/og.mjs && npm run build
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4329;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
mkdirSync('public/og', { recursive: true });

// Hide everything that is interface rather than picture, and light the whole scene.
const css = `
  .torch, .grain, .tint, .dim, .bar, .sticky, .wa, .lift, .skip-link, .hero__hint, .hero__cta, .hero__sub { display: none !important; }
  .hero { min-height: 630px !important; height: 630px !important; padding: 0 0 64px !important; }
  .hero__body { padding-left: 8px; gap: 16px !important; }
  .hero__title { font-size: 104px !important; }
  .hero__kicker { font-size: 15px !important; }
  .facade { height: 630px !important; width: 420px !important; right: 70px !important; top: 0 !important; max-width: none !important; }
  .hero__glow { opacity: 1 !important; }
  .hero__fog { display: none !important; }
`;

const browser = await chromium.launch();
try {
  for (const lang of ['ro', 'ru', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/horror/${lang}/`, { waitUntil: 'load' });
    await page.addStyleTag({ content: css });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const path = `public/og/${lang}.jpg`;
    await page.screenshot({ path, type: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log(path);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
