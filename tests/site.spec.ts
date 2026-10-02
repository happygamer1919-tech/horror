import { test, expect, type Page } from '@playwright/test';

const BASE = '/horror';
const LANGS = ['ro', 'ru', 'en'] as const;
// The wordmark is the same on every language page. RO and EN add a subtitle under it.
const BRAND = 'Проклятие Отеля';
const SUBTITLE: Record<string, string | null> = { ro: 'Blestemul Hotelului', ru: null, en: "The Hotel's Curse" };
const SECTIONS = ['#lobby', '#corridor', '#file', '#keys', '#prices', '#cctv', '#proof', '#voucher', '#checkin', '#info', 'footer.foot'];
const WA = '37368232596';
const TELEGRAM_URL = 'https://t.me/+37368232596';
const SLOTS_URL = 'https://widget.easyweek.io/horror-quest-moldova/team/34544/62497';
// Placeholders of the earlier versions. None of them may be left on the page.
const PLACEHOLDERS = /Întrebați recepția|Уточните на стойке|Ask the desk|Confirmăm acest detaliu|Мы уточняем эту информацию|We are confirming this detail|TODO/;
const LEVEL_NAMES = {
  ro: ['Fără electroșoc', 'Electroșoc slab', 'Hardcore'],
  ru: ['Без электрошока', 'Слабый электрошок', 'Хардкор'],
  en: ['No electroshock', 'Weak electroshock', 'Hardcore'],
};
// The confirmed facts, as each page words them.
const FACTS = {
  ro: {
    age: 'Fără limită',
    ageQ: 'Există o vârstă minimă?',
    ageA: ['nu există limită de vârstă', 'semnează un acord la sosire', 'Minorii intră doar dacă acordul este semnat de un părinte'],
    payQ: 'Cum pot plăti?',
    payA: 'Doar în numerar, la fața locului.',
    voucherQ: 'Cum cumpăr un voucher cadou?',
    cash: 'în numerar',
    venue: 'la fața locului',
    langQ: 'În ce limbi se joacă?',
    langA: ['română', 'rusă', 'engleză'],
  },
  ru: {
    age: 'Без ограничений',
    ageQ: 'Есть ли минимальный возраст?',
    ageA: ['ограничений по возрасту нет', 'подписывают соглашение на месте', 'Несовершеннолетние допускаются, только если соглашение подпишет родитель'],
    payQ: 'Как можно оплатить?',
    payA: 'Только наличными, на месте.',
    voucherQ: 'Как купить подарочный сертификат?',
    cash: 'за наличные',
    venue: 'на месте',
    langQ: 'На каких языках проходит игра?',
    langA: ['румынском', 'русском', 'английском'],
  },
  en: {
    age: 'No age limit',
    ageQ: 'Is there a minimum age?',
    ageA: ['there is no age limit', 'Everyone signs an agreement on arrival', 'Minors enter only if a parent signs it'],
    payQ: 'How can I pay?',
    payA: 'Cash only, at the venue.',
    voucherQ: 'How do I buy a gift voucher?',
    cash: 'in cash',
    venue: 'at the venue',
    langQ: 'What languages is the game played in?',
    langA: ['Romanian', 'Russian', 'English'],
  },
};
// Price for the whole team, MDL. The source of truth the site must agree with.
const PRICES: Record<number, number> = { 2: 1000, 3: 1000, 4: 1200, 5: 1500, 6: 1800, 7: 2100, 8: 2400, 9: 2700, 10: 3000, 11: 3300 };

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

    // The booking flow itself (summary line, dialog, Telegram, floating menu) is pinned in
    // tests/booking.spec.ts.
    test('check-in card: live total, and the WhatsApp question carries team size and total for every size from 2 to 11', async ({ page }) => {
      await open(page, lang);
      const form = page.locator('[data-checkin]');
      await form.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      const team = form.locator('input[name="team"]');
      await expect(team).toHaveAttribute('min', '2');
      await expect(team).toHaveAttribute('max', '11');
      for (const [n, total] of Object.entries(PRICES)) {
        await team.fill(n);
        await expect(form.locator('[data-total]'), `total for ${n}`).toHaveText(`${total} MDL`);
        const lines = messageOf((await form.locator('[data-ask-wa]').getAttribute('href'))!).split('\n');
        // greeting, then the one-line summary: team, language, total (no level chosen yet).
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain(BRAND);
        const parts = lines[1].split(' - ');
        expect(parts).toHaveLength(3);
        expect(parts[0], `team part for ${n}`).toMatch(new RegExp(`: ${n}$`));
        expect(parts[2], `total part for ${n}`).toMatch(new RegExp(`: ${total} MDL$`));
        expect(lines[1]).not.toMatch(/\{\w+\}/);
      }
      // The price list on the page says the same thing.
      const rows = await page.locator('[data-price-row]').evaluateAll((trs) => trs.map((tr) => [tr.getAttribute('data-price-row')!, tr.querySelector('td')!.textContent!.replace(/\s+/g, ' ').trim()]));
      expect(rows).toHaveLength(9);
      for (const [range, shown] of rows) {
        const [from, to] = range.split('-').map(Number);
        for (let n = from; n <= to; n++) expect(shown, `price list row ${range}`).toBe(`${PRICES[n]} MDL`);
      }
      // The wording next to the button says what happens with the line.
      await expect(form.locator('[data-request]')).toBeVisible();
      expect(((await form.locator('[data-request]').textContent()) ?? '').trim().length).toBeGreaterThan(30);
      // A team size outside the price list has no total and is left out of the message.
      for (const bad of ['1', '12', '0']) {
        await team.fill(bad);
        await expect(form.locator('[data-total]')).toHaveText('...');
        const text = messageOf((await form.locator('[data-ask-wa]').getAttribute('href'))!);
        expect(text.split('\n')[1].split(' - '), `team ${bad}`).toHaveLength(1);
      }
    });

    test('gift voucher: bought at the venue in cash, no form, no price, one "message us" button', async ({ page }) => {
      await open(page, lang);
      const block = page.locator('#voucher');
      await expect(block.locator('form, input, select, textarea')).toHaveCount(0);
      const text = (await block.textContent()) ?? '';
      expect(text).toContain(FACTS[lang].cash);
      expect(text.toLowerCase()).toContain(FACTS[lang].venue);
      expect(text, 'no price in the voucher block').not.toMatch(/\d{3,}\s*MDL|MDL/);
      const wa = block.locator('[data-voucher-wa]');
      await expect(wa).toBeVisible();
      const message = messageOf((await wa.getAttribute('href'))!);
      expect(message).toContain(BRAND);
      expect(message.split('\n')).toHaveLength(1);
      const tg = block.locator('[data-voucher-tg]');
      await expect(tg).toHaveAttribute('href', TELEGRAM_URL);
      await expect(tg).toHaveAttribute('data-message', message);
      // The FAQ says the same.
      const answer = page.locator('.faq__item', { hasText: FACTS[lang].voucherQ }).locator('p');
      await expect(answer).toContainText(FACTS[lang].cash);
      await expect(answer).not.toContainText('MDL');
    });

    test('confirmed values are shown: no placeholder is left for age, languages, payment or anything else', async ({ page }) => {
      await open(page, lang);
      const fob = (no: string) => page.locator(`[data-fob="${no}"] .fob__value`);
      await expect(fob('01')).toHaveText('2-11');
      await expect(fob('02')).toContainText('60');
      await expect(fob('04')).toContainText('1000 MDL');
      // Age: no limit, with the short note about the agreement.
      await expect(fob('03')).toHaveText(FACTS[lang].age);
      expect(((await page.locator('[data-fob="03"] .fob__note').textContent()) ?? '').trim().length).toBeGreaterThan(10);
      // FAQ: the age answer states all three facts, payment is cash only, languages are named.
      const answer = (q: string) => page.locator('.faq__item', { hasText: q }).locator('p');
      for (const fact of FACTS[lang].ageA) await expect(answer(FACTS[lang].ageQ)).toContainText(fact);
      await expect(answer(FACTS[lang].payQ)).toHaveText(FACTS[lang].payA);
      for (const name of FACTS[lang].langA) await expect(answer(FACTS[lang].langQ)).toContainText(name);
      expect((await page.locator('body').textContent()) ?? '').not.toMatch(PLACEHOLDERS);
      const hours = (await page.locator('[data-hours] li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
      expect(hours).toHaveLength(3);
      expect(hours[0]).toContain('16:00-03:00');
      expect(hours[1]).toContain('16:00-00:00');
      // Saturday and Sunday are round the clock: a phrase, not a time range.
      expect(hours[2]).not.toContain(':');
      await expect(page.locator('a[href*="place_id:ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU"]')).toHaveCount(1);
      await expect(page.locator('[data-review]')).toHaveAttribute('href', 'https://search.google.com/local/writereview?placeid=ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU');
      // Instagram is still unknown: no link.
      await expect(page.locator('a[href*="instagram.com"]')).toHaveCount(0);
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

    test('floating control is on the page and WhatsApp in it carries the brand', async ({ page }) => {
      await open(page, lang);
      await expect(page.locator('[data-wa-float]')).toBeVisible();
      await page.locator('[data-float-toggle]').click();
      const href = (await page.locator('[data-float-wa]').getAttribute('href'))!;
      expect(messageOf(href)).toContain(BRAND);
      await expect(page.locator('[data-float-tg]')).toHaveAttribute('href', TELEGRAM_URL);
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
          if (h === TELEGRAM_URL || h === SLOTS_URL) continue;
          expect(h, 'only tel:, wa.me, Telegram, the booking widget and Google leave the site').toMatch(/^(tel:\+37368232596|https:\/\/wa\.me\/37368232596\?|https:\/\/www\.google\.com\/maps\/|https:\/\/search\.google\.com\/local\/writereview\?)/);
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

    test('levels are on: three names, nothing preselected, and no description of what a level contains', async ({ page }) => {
      await open(page, lang);
      // One selector at the desk, one on the card.
      await expect(page.locator('[data-level-input]')).toHaveCount(6);
      await expect(page.locator('[data-level-input]:checked')).toHaveCount(0);
      expect(await page.locator('#keys .lvl__opt').allTextContents().then((a) => a.map((x) => x.trim()))).toEqual(LEVEL_NAMES[lang]);
      expect(await page.locator('#checkin .card__lvl label').allTextContents().then((a) => a.map((x) => x.trim()))).toEqual(LEVEL_NAMES[lang]);
      // The key section holds the three names and one neutral line, nothing per level.
      await expect(page.locator('#keys [data-level-note]')).toBeVisible();
      await expect(page.locator('[data-level-text], [data-limits], .lvl__note')).toHaveCount(0);
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toMatch(/Standard|Contact level|Nivel de contact|Уровень контакта/);
      for (const sel of ['#keys', '#checkin']) expect((await page.locator(sel).textContent()) ?? '').not.toMatch(/Light|Standard/);
      // The old copy that described the levels is gone.
      expect(body).not.toMatch(/keeps its distance|stops being polite|păstrează distanța|nu mai este politicos|держит дистанцию|перестаёт быть вежливым/);
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
