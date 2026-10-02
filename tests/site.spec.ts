import { test, expect, type Page } from '@playwright/test';

const BASE = '/horror';
const LANGS = ['ro', 'ru', 'en'] as const;
// The wordmark is the same on every language page. RO and EN add a subtitle under it.
const BRAND = 'Проклятие Отеля';
const SUBTITLE: Record<string, string | null> = { ro: 'Blestemul Hotelului', ru: null, en: "The Hotel's Curse" };
const SECTIONS = ['#lobby', '#corridor', '#file', '#keys', '#prices', '#cctv', '#proof', '#voucher', '#checkin', '#info', 'footer.foot'];
const WA = '37368232596';
const ASK = { ro: 'Întrebați recepția', ru: 'Уточните на стойке', en: 'Ask the desk' };
// Price for the whole team, MDL. The source of truth the site must agree with.
const PRICES: Record<number, number> = { 2: 1000, 3: 1000, 4: 1200, 5: 1500, 6: 1800, 7: 2100, 8: 2400, 9: 2700, 10: 3000, 11: 3300 };

// Replace window.open so a submit can be inspected instead of leaving the page.
async function captureOpen(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url: string) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return {} as Window;
    }) as typeof window.open;
  });
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
const messageOf = (url: string) => {
  const u = new URL(url);
  expect(u.origin + u.pathname).toBe(`https://wa.me/${WA}`);
  return u.searchParams.get('text') ?? '';
};

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
      expect(h1.replace(/\s+/g, '')).toBe(BRAND.replace(/\s+/g, ''));
      // The name in the page language is only a subtitle, and only on RO and EN.
      if (SUBTITLE[lang]) await expect(page.locator('.hero__alt')).toHaveText(SUBTITLE[lang]!);
      else await expect(page.locator('.hero__alt')).toHaveCount(0);
      // The footer shows the wordmark once and no translated names.
      await expect(page.locator('.foot__names')).toHaveCount(1);
      await expect(page.locator('.foot__names')).toHaveText(BRAND);
      for (const sub of Object.values(SUBTITLE)) if (sub) await expect(page.locator('footer.foot')).not.toContainText(sub);
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
      expect(h2.length).toBe(9);
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
      await expect(page).toHaveTitle(new RegExp(BRAND));
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

    test('check-in card: booking request with team size and total in the wa.me message', async ({ page }) => {
      await open(page, lang);
      await captureOpen(page);
      const form = page.locator('[data-checkin]');
      await form.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await form.locator('input[name="date"]').fill('2031-03-14');
      await form.locator('input[name="time"]').fill('19:30');
      await form.locator('input[name="team"]').fill('5');
      await form.locator('input[name="name"]').fill('Ana Țurcanu');
      await form.locator('input[name="phone"]').fill('+373 600 00 000');
      await form.locator('textarea[name="comment"]').fill('no touching\nplease');
      await expect(form.locator('[data-total]')).toHaveText('1500 MDL');
      await form.locator('button[type="submit"]').click();

      const urls = await opened(page);
      expect(urls).toHaveLength(1);
      const text = messageOf(urls[0]);
      expect(text).toContain(BRAND);
      const lines = text.split('\n');
      // hello, date, time, guests, total, language, name, phone, comment. No level line.
      expect(lines).toHaveLength(9);
      expect(lines[1]).toContain('14.03.2031');
      expect(lines[2]).toContain('19:30');
      expect(lines[3]).toMatch(/: 5$/);
      expect(lines[4]).toMatch(/: 1500 MDL$/);
      expect(lines[6]).toContain('Ana Țurcanu');
      expect(lines[7]).toContain('+373 600 00 000');
      expect(lines[8]).toMatch(/: no touching please$/);
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text).not.toMatch(/Light|Standard|Hardcore/);
      // The wording next to the button says what this is.
      await expect(form.locator('[data-request]')).toBeVisible();
      expect(((await form.locator('[data-request]').textContent()) ?? '').length).toBeGreaterThan(30);
    });

    test('price total is correct for every team size from 2 to 11', async ({ page }) => {
      await open(page, lang);
      const form = page.locator('[data-checkin]');
      await form.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await form.locator('input[name="date"]').fill('2031-03-14');
      await form.locator('input[name="time"]').fill('19:30');
      await form.locator('input[name="name"]').fill('Test');
      await form.locator('input[name="phone"]').fill('+373 600 00 000');
      const team = form.locator('input[name="team"]');
      await expect(team).toHaveAttribute('min', '2');
      await expect(team).toHaveAttribute('max', '11');
      for (const [n, total] of Object.entries(PRICES)) {
        await captureOpen(page);
        await team.fill(n);
        await expect(form.locator('[data-total]'), `total for ${n}`).toHaveText(`${total} MDL`);
        await form.locator('button[type="submit"]').click();
        const urls = await opened(page);
        expect(urls, `submit for ${n}`).toHaveLength(1);
        const lines = messageOf(urls[0]).split('\n');
        // No comment this time, so the optional line is dropped.
        expect(lines).toHaveLength(8);
        expect(lines[3], `team line for ${n}`).toMatch(new RegExp(`: ${n}$`));
        expect(lines[4], `total line for ${n}`).toMatch(new RegExp(`: ${total} MDL$`));
      }
      // The price list on the page says the same thing.
      const rows = await page.locator('[data-price-row]').evaluateAll((trs) => trs.map((tr) => [tr.getAttribute('data-price-row')!, tr.querySelector('td')!.textContent!.replace(/\s+/g, ' ').trim()]));
      expect(rows).toHaveLength(9);
      for (const [range, shown] of rows) {
        const [from, to] = range.split('-').map(Number);
        for (let n = from; n <= to; n++) expect(shown, `price list row ${range}`).toBe(`${PRICES[n]} MDL`);
      }
    });

    test('check-in card refuses an empty submit and team sizes outside 2 to 11', async ({ page }) => {
      await open(page, lang);
      await captureOpen(page);
      const form = page.locator('[data-checkin]');
      await form.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await form.locator('button[type="submit"]').click();
      expect(await opened(page)).toHaveLength(0);
      await form.locator('input[name="date"]').fill('2031-03-14');
      await form.locator('input[name="time"]').fill('19:30');
      await form.locator('input[name="name"]').fill('Test');
      await form.locator('input[name="phone"]').fill('+373 600 00 000');
      for (const bad of ['1', '12', '0']) {
        await form.locator('input[name="team"]').fill(bad);
        await form.locator('button[type="submit"]').click();
        expect(await opened(page), `team ${bad}`).toHaveLength(0);
      }
    });

    test('gift voucher opens WhatsApp with team size and recipient', async ({ page }) => {
      await open(page, lang);
      await captureOpen(page);
      const form = page.locator('[data-voucher]');
      await form.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const sizes = await form.locator('select[name="team"] option').allTextContents();
      expect(sizes.map(Number)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      await form.locator('button[type="submit"]').click();
      expect(await opened(page), 'recipient is required').toHaveLength(0);
      await form.locator('select[name="team"]').selectOption('6');
      await form.locator('input[name="recipient"]').fill('Mihai B.');
      await form.locator('button[type="submit"]').click();
      const urls = await opened(page);
      expect(urls).toHaveLength(1);
      const lines = messageOf(urls[0]).split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain(BRAND);
      expect(lines[1]).toMatch(/: 6$/);
      expect(lines[2]).toMatch(/: Mihai B\.$/);
    });

    test('confirmed values are shown: no placeholder for players, duration, price or hours', async ({ page }) => {
      await open(page, lang);
      const fob = (no: string) => page.locator(`[data-fob="${no}"] .fob__value`);
      await expect(fob('01')).toHaveText('2-11');
      await expect(fob('02')).toContainText('60');
      await expect(fob('04')).toContainText('1000 MDL');
      for (const no of ['01', '02', '04']) await expect(fob(no)).not.toContainText(ASK[lang]);
      // Age is still unknown, so that one fob keeps the neutral placeholder.
      await expect(fob('03')).toHaveText(ASK[lang]);
      const hours = (await page.locator('[data-hours] li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
      expect(hours).toHaveLength(3);
      expect(hours[0]).toContain('16:00-03:00');
      expect(hours[1]).toContain('16:00-00:00');
      // Saturday and Sunday are round the clock: a phrase, not a time range.
      expect(hours[2]).not.toContain(':');
      for (const sel of ['#prices', '#location', '#checkin']) await expect(page.locator(sel)).not.toContainText(ASK[lang]);
      await expect(page.locator('a[href*="place_id:ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU"]')).toHaveCount(1);
      await expect(page.locator('[data-review]')).toHaveAttribute('href', 'https://search.google.com/local/writereview?placeid=ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU');
    });

    test('share image: og:image and twitter:card are wired to a 1200 x 630 picture', async ({ page, request }) => {
      await open(page, lang);
      const og = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(og).toBe(`https://happygamer1919-tech.github.io${BASE}/og/${lang}.jpg`);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', og!);
      const res = await request.get(`${BASE}/og/${lang}.jpg`);
      expect(res.status()).toBe(200);
      const size = await page.evaluate(
        (src) =>
          new Promise<number[]>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
            img.onerror = () => reject(new Error('image did not load'));
            img.src = src;
          }),
        `${BASE}/og/${lang}.jpg`,
      );
      expect(size).toEqual([1200, 630]);
    });

    test('floating WhatsApp button and no slots link while SLOTS_URL is empty', async ({ page }) => {
      await open(page, lang);
      const wa = page.locator('[data-wa-float]');
      await expect(wa).toBeVisible();
      const href = (await wa.getAttribute('href'))!;
      expect(messageOf(href)).toContain(BRAND);
      await expect(page.locator('[data-slots]')).toHaveCount(0);
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
          expect(h, 'only tel:, wa.me and Google leave the site').toMatch(/^(tel:\+37368232596|https:\/\/wa\.me\/37368232596\?|https:\/\/www\.google\.com\/maps\/|https:\/\/search\.google\.com\/local\/writereview\?)/);
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

    test('contact levels are off: one line about limits, no level promises anywhere', async ({ page }) => {
      await open(page, lang);
      await expect(page.locator('[data-level-input]')).toHaveCount(0);
      await expect(page.locator('[data-limits]')).toBeVisible();
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toMatch(/Hardcore|Standard|Contact level|Nivel de contact|Уровень контакта/);
      await expect(page.locator('html')).toHaveAttribute('data-level', 'standard');
      // The free-text field for limits is still on the card.
      await expect(page.locator('#checkin textarea[name="comment"]')).toHaveCount(1);
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
  await expect(page.locator('[data-wa-float]')).toBeVisible();
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

test('the Check in button brings the registration card on screen', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/ro/`);
  await page.locator('[data-cta]').click();
  await expect(page.locator('#checkin-title')).toBeInViewport({ timeout: 8000 });
});

test('lights dim after 20 seconds without input and come back on input', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/ro/`);
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/idle/);
  await page.clock.fastForward(21000);
  await expect(html).toHaveClass(/idle/);
  await page.keyboard.press('Shift');
  await expect(html).not.toHaveClass(/idle/);
});

test('sound is off by default and the toggle is a real button', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/ro/`);
  const btn = page.locator('[data-sound]');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
});

test('the tab title changes while the tab is hidden', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/ro/`);
  const title = await page.title();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.title()).toBe('Cheia vă așteaptă');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.title()).toBe(title);
});
