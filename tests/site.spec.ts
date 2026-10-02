import { test, expect, type Page } from '@playwright/test';

const BASE = '/horror';
const LANGS = ['ro', 'ru', 'en'] as const;
const BRAND = { ro: 'Blestemul Hotelului', ru: 'Проклятие Отеля', en: "The Hotel's Curse" };
const SECTIONS = ['#lobby', '#corridor', '#file', '#keys', '#cctv', '#proof', '#checkin', '#info', 'footer.foot'];
const WA = '37368232596';

// Console errors and failed or external requests, collected for the whole page life.
function watch(page: Page) {
  const errors: string[] = [];
  const external: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:', 'about:'].includes(u.protocol)) external.push(r.url());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  return { errors, external, failed };
}

async function open(page: Page, lang: string) {
  // The lift preloader plays once per session; tests start after it.
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/${lang}/`);
}

async function walk(page: Page) {
  // Scroll the whole page in steps so every scroll-driven part runs.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = page.viewportSize()!.height * 0.8;
  for (let y = 0; y <= height; y += step) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(60);
  }
}

for (const lang of LANGS) {
  test.describe(`language: ${lang}`, () => {
    test('every section renders, with no console errors and no external requests', async ({ page }) => {
      const seen = watch(page);
      await open(page, lang);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      // The h1 is the brand name, split into lines: compare without whitespace.
      const h1 = (await page.locator('h1').textContent()) ?? '';
      expect(h1.replace(/\s+/g, '')).toBe(BRAND[lang].replace(/\s+/g, ''));
      await walk(page);
      for (const sel of SECTIONS) {
        const el = page.locator(sel);
        await expect(el, sel).toHaveCount(1);
        await el.scrollIntoViewIfNeeded();
        await expect(el, sel).toBeVisible();
        const box = await el.boundingBox();
        expect(box!.height, `${sel} height`).toBeGreaterThan(120);
        const text = ((await el.textContent()) ?? '').trim();
        expect(text.length, `${sel} text`).toBeGreaterThan(20);
      }
      // All section headings exist and are not empty.
      const h2 = await page.locator('main h2').allTextContents();
      expect(h2.length).toBe(7);
      for (const h of h2) expect(h.trim().length).toBeGreaterThan(2);
      // Canvases actually drew something.
      const painted = await page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('[data-corridor]')!;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4001) sum += d[i];
        return sum;
      });
      expect(painted).toBeGreaterThan(0);

      expect(seen.errors, 'console errors').toEqual([]);
      expect(seen.failed, 'failed requests').toEqual([]);
      expect(seen.external, 'external requests').toEqual([]);
    });

    test('head: preview is not indexable, hreflang is complete', async ({ page }) => {
      await open(page, lang);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      for (const l of [...LANGS, 'x-default']) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${l}"]`)).toHaveCount(1);
      }
      await expect(page.locator(`link[rel="alternate"][hreflang="${lang}"]`)).toHaveAttribute('href', new RegExp(`${BASE}/${lang}/$`));
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
      await expect(page).toHaveTitle(new RegExp(BRAND[lang].split(' ')[0]));
    });

    test('no horizontal overflow', async ({ page }) => {
      await open(page, lang);
      await walk(page);
      const size = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        body: document.body.scrollWidth,
      }));
      expect(size.scroll).toBeLessThanOrEqual(size.client);
      expect(size.body).toBeLessThanOrEqual(size.client);
      // No element sticks out of the viewport on the right either.
      const wide = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *, footer *, header *'))) {
          if (el.closest('.torch, .corr__pin, .hanger, svg, .clip, .hero__glow')) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) out.push(`${el.tagName}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
        }
        return out.slice(0, 8);
      });
      expect(wide).toEqual([]);
    });

    test('check-in card builds a correct wa.me link', async ({ page }) => {
      await open(page, lang);
      await page.evaluate(() => {
        (window as unknown as { __opened: string[] }).__opened = [];
        window.open = ((url: string) => {
          (window as unknown as { __opened: string[] }).__opened.push(String(url));
          return {} as Window;
        }) as typeof window.open;
      });
      const form = page.locator('[data-checkin]');
      await form.scrollIntoViewIfNeeded();
      await form.locator('input[name="date"]').fill('2031-03-14');
      await form.locator('input[name="time"]').fill('19:30');
      await form.locator('input[name="team"]').fill('5');
      await form.locator('input[name="level"][value="hardcore"]').check({ force: true });
      await form.locator('input[name="name"]').fill('Ana Țurcanu');
      await form.locator('input[name="phone"]').fill('+373 600 00 000');
      await form.locator('button[type="submit"]').click();

      const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
      expect(opened).toHaveLength(1);
      const url = new URL(opened[0]);
      expect(url.origin + url.pathname).toBe(`https://wa.me/${WA}`);
      const text = url.searchParams.get('text') ?? '';
      expect(text).toContain(BRAND[lang]);
      for (const part of ['14.03.2031', '19:30', ': 5', 'Hardcore', 'Ana Țurcanu', '+373 600 00 000']) {
        expect(text, part).toContain(part);
      }
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text.split('\n')).toHaveLength(8);
      // The level chosen on the card is the level of the whole page.
      await expect(page.locator('html')).toHaveAttribute('data-level', 'hardcore');
    });

    test('check-in card refuses an empty submit', async ({ page }) => {
      await open(page, lang);
      await page.evaluate(() => {
        (window as unknown as { __opened: string[] }).__opened = [];
        window.open = ((url: string) => {
          (window as unknown as { __opened: string[] }).__opened.push(String(url));
          return {} as Window;
        }) as typeof window.open;
      });
      await page.locator('[data-checkin] button[type="submit"]').click();
      expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toHaveLength(0);
    });

    test('internal links resolve under the base path', async ({ page, request }) => {
      await open(page, lang);
      const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
      expect(hrefs.length).toBeGreaterThan(8);
      const pages = new Set<string>();
      for (const h of hrefs) {
        if (h.startsWith('#')) {
          await expect(page.locator(`[id="${h.slice(1)}"]`), h).toHaveCount(1);
        } else if (h.startsWith('/')) {
          expect(h.startsWith(`${BASE}/`), `${h} is under ${BASE}`).toBe(true);
          pages.add(h);
        } else {
          expect(h, 'only tel:, wa.me and Google Maps leave the site').toMatch(/^(tel:\+37368232596|https:\/\/www\.google\.com\/maps\/)/);
        }
      }
      for (const p of pages) {
        const res = await request.get(p);
        expect(res.status(), p).toBe(200);
      }
      // Assets referenced by the page are under the base path too.
      const assets = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLLinkElement>('link[href]')].map((l) => l.getAttribute('href')!).concat([...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((s) => s.getAttribute('src')!)),
      );
      for (const a of assets.filter((x) => x.startsWith('/'))) {
        expect((await request.get(a)).status(), a).toBe(200);
      }
    });

    test('contact level changes tint and copy', async ({ page }) => {
      await open(page, lang);
      await page.locator('#keys').scrollIntoViewIfNeeded();
      const visible = page.locator('.lvl__text:visible');
      await expect(visible).toHaveCount(1);
      const before = await visible.textContent();
      const tintBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tint-a').trim());
      await page.locator('#keys input[value="hardcore"]').check({ force: true });
      await expect(page.locator('html')).toHaveAttribute('data-level', 'hardcore');
      await expect(visible).toHaveCount(1);
      expect(await visible.textContent()).not.toBe(before);
      const tintAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tint-a').trim());
      expect(tintAfter).not.toBe(tintBefore);
      await expect(page.locator('#checkin input[name="level"][value="hardcore"]')).toBeChecked();
    });

    test('review quotes stay hidden while the config array is empty', async ({ page }) => {
      await open(page, lang);
      await expect(page.locator('#quotes')).toHaveCount(0);
      await expect(page.locator('#proof')).toContainText('39');
    });

    test('reduced motion: static and readable', async ({ browser }) => {
      const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const seen = watch(page);
      await page.goto(`${BASE}/${lang}/`);
      await expect(page.locator('[data-lift]')).toBeHidden();
      await expect(page.locator('.torch')).toBeHidden();
      // No pin: the corridor is an ordinary block and every caption can be read.
      const corr = await page.locator('#corridor').boundingBox();
      expect(corr!.height).toBeLessThan(844 * 2.2);
      for (const cap of await page.locator('[data-cap]').all()) {
        await cap.scrollIntoViewIfNeeded();
        await expect(cap).toBeVisible();
        expect(Number(await cap.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
      }
      for (const el of await page.locator('[data-reveal]').all()) {
        expect(Number(await el.evaluate((e) => getComputedStyle(e).opacity))).toBe(1);
      }
      expect(seen.errors).toEqual([]);
      await ctx.close();
    });
  });
}

test('preloader clears itself in under 1.5 seconds and can be skipped', async ({ page }) => {
  await page.goto(`${BASE}/ro/`);
  const lift = page.locator('[data-lift]');
  await expect(lift).toBeVisible();
  await expect(lift).toBeHidden({ timeout: 1700 });

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(lift).toBeVisible();
  await page.locator('[data-lift-skip]').click();
  await expect(lift).toBeHidden({ timeout: 300 });
});

test('root redirects to the default language and robots.txt blocks crawlers', async ({ page, request }) => {
  const robots = await request.get(`${BASE}/robots.txt`);
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /');
  await page.goto(`${BASE}/`);
  await page.waitForURL(`**${BASE}/ro/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
});

test('unknown paths get the 404 page with links back', async ({ page }) => {
  const res = await page.goto(`${BASE}/no-such-room/`);
  expect(res!.status()).toBe(404);
  for (const l of LANGS) await expect(page.locator(`a[href="${BASE}/${l}/"]`)).toHaveCount(1);
});

test('the neon sign never changes state faster than 3 times per second', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/ro/`);
  // Sample the dying letter for 6 seconds and count on/off transitions per rolling second.
  const worst = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const el = document.querySelector<SVGElement>('[data-dying]')!;
        const flips: number[] = [];
        let last = true;
        const start = performance.now();
        const tick = (now: number) => {
          const on = Number(el.style.opacity || 1) > 0.5;
          if (on !== last) flips.push(now);
          last = on;
          if (now - start < 6000) requestAnimationFrame(tick);
          else {
            let max = 0;
            for (const t of flips) max = Math.max(max, flips.filter((f) => f >= t && f < t + 1000).length);
            resolve(max);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  // A flash is an on-off pair, so 3 flashes per second would be 6 transitions.
  expect(worst).toBeLessThanOrEqual(3);
});
