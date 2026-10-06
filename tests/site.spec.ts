import { test, expect, type Page } from '@playwright/test';

const BASE = '/horror';
const LANGS = ['ro', 'ru', 'en'] as const;
// The wordmark is the same on every language page. RO and EN add a subtitle under it.
const BRAND = 'Проклятие Отеля';
const SUBTITLE: Record<string, string | null> = { ro: 'Blestemul Hotelului', ru: null, en: "The Hotel's Curse" };
const SECTIONS = ['#lobby', '#corridor', '#file', '#keys', '#prices', '#cctv', '#voucher', '#proof', '#checkin', '#info', 'footer.foot'];
const WA = '37368232596';
const TELEGRAM_URL = 'https://t.me/+37368232596';
const SLOTS_URL = 'https://widget.easyweek.io/horror-quest-moldova/team/34544/62497';
// Placeholders of the earlier versions. None of them may be left on the page.
const PLACEHOLDERS = /Întrebați recepția|Уточните на стойке|Ask the desk|Confirmăm acest detaliu|Мы уточняем эту информацию|We are confirming this detail|TODO/;
// Exactly two levels. The third one of the earlier versions is gone in every language.
const LEVEL_NAMES = {
  ro: ['Fără electroșoc', 'Hardcore'],
  ru: ['Без электрошока', 'Хардкор'],
  en: ['No electroshock', 'Hardcore'],
};
// The removed level, as a name in each language and as a key in code.
const REMOVED_LEVEL = [/\bweak\b/i, /\bslab\b/i, /слаб/i];
const INSTAGRAM_URL = 'https://instagram.com/last.quest.moldova';
// The length of a game, as each page words it: on the key tag and the hero line, in the
// "how long" answer, and inside the "what is this" answer and the page description.
const DURATION = {
  ro: { short: '60-90 min', answer: '60-90 de minute.', prose: '60-90 de minute' },
  ru: { short: '60-90 мин', answer: '60-90 минут.', prose: '60-90 минут' },
  en: { short: '60-90 min', answer: '60-90 minutes.', prose: '60-90 minutes' },
};
const DURATION_Q = { ro: 'Cât durează?', ru: 'Сколько длится игра?', en: 'How long does it last?' };
// One rule, said in three places: the age key tag, the age answer, next to the level choice.
const MINORS = {
  ro: { rule: 'Echipele cu minori joacă fără electroșoc.', tag: 'fără electroșoc' },
  ru: { rule: 'Команды с несовершеннолетними играют без электрошока.', tag: 'без электрошока' },
  en: { rule: 'Teams with minors play without electroshock.', tag: 'no electroshock' },
};
// The confirmed facts, as each page words them.
const FACTS = {
  ro: {
    age: 'Fără limită',
    ageNote: 'Acord la sosire. Minori: semnează un părinte, fără electroșoc',
    ageQ: 'Există o vârstă minimă?',
    ageA: ['nu există limită de vârstă', 'semnează un acord la sosire', 'Minorii intră doar dacă acordul este semnat de un părinte'],
    payQ: 'Cum pot plăti?',
    payA: 'Doar în numerar, la fața locului.',
    voucherQ: 'Cum cumpăr un voucher cadou?',
    messageUs: 'Scrieți-ne',
    cash: 'în numerar',
    venue: 'la fața locului',
    langQ: 'În ce limbi se joacă?',
    langA: ['română', 'rusă', 'engleză'],
  },
  ru: {
    age: 'Без ограничений',
    ageNote: 'Соглашение на месте. Несовершеннолетним: подпись родителя, без электрошока',
    ageQ: 'Есть ли минимальный возраст?',
    ageA: ['ограничений по возрасту нет', 'подписывают соглашение на месте', 'Несовершеннолетние допускаются, только если соглашение подпишет родитель'],
    payQ: 'Как можно оплатить?',
    payA: 'Только наличными, на месте.',
    voucherQ: 'Как купить подарочный сертификат?',
    messageUs: 'Напишите нам',
    cash: 'за наличные',
    venue: 'на месте',
    langQ: 'На каких языках проходит игра?',
    langA: ['румынском', 'русском', 'английском'],
  },
  en: {
    age: 'No age limit',
    ageNote: 'Agreement on arrival. Minors: a parent signs, no electroshock',
    ageQ: 'Is there a minimum age?',
    ageA: ['there is no age limit', 'Everyone signs an agreement on arrival', 'Minors enter only if a parent signs it'],
    payQ: 'How can I pay?',
    payA: 'Cash only, at the venue.',
    voucherQ: 'How do I buy a gift voucher?',
    messageUs: 'Message us',
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
      // The corridor stage shows a picture: the poster that lies under everything has loaded.
      const pose = page.locator('#corridor img[data-poster]');
      await expect.poll(() => pose.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);

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
          if (el.closest('.torch, .hero__veil, .corr__pin, .hanger, svg, .clip, .hero__glow')) continue;
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

    test('gift voucher: bought at the venue in cash, no form, no price, "message us" with WhatsApp and Telegram', async ({ page }) => {
      await open(page, lang);
      const block = page.locator('#voucher');
      await expect(block.locator('form, input, select, textarea')).toHaveCount(0);
      const text = (await block.textContent()) ?? '';
      expect(text).toContain(FACTS[lang].cash);
      expect(text.toLowerCase()).toContain(FACTS[lang].venue);
      expect(text, 'no price in the voucher block').not.toMatch(/\d{3,}\s*MDL|MDL/);
      const wa = block.locator('[data-voucher-wa]');
      await expect(wa).toBeVisible();
      // "Message us" names the pair; each button says which channel it opens.
      const group = block.locator('[role="group"]');
      await expect(group).toHaveAccessibleName(FACTS[lang].messageUs);
      await expect(wa).toHaveText('WhatsApp');
      await expect(block.locator('[data-voucher-tg]')).toHaveText('Telegram');
      const [a, b] = [(await wa.boundingBox())!, (await block.locator('[data-voucher-tg]').boundingBox())!];
      expect(Math.abs(a.width - b.width), 'equal buttons').toBeLessThanOrEqual(1);
      expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
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
      await expect(fob('02')).toHaveText(DURATION[lang].short);
      await expect(fob('04')).toContainText('1000 MDL');
      // Age on the key tag: no limit, the agreement on arrival, and a parent signs for a minor.
      await expect(fob('03')).toHaveText(FACTS[lang].age);
      const note = page.locator('[data-fob="03"] .fob__note');
      await expect(note).toHaveText(FACTS[lang].ageNote);
      await expect(note).toBeVisible();
      // The note stays inside the tag: above its rounded bottom and between its sides.
      await page.locator('[data-fob="03"]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect
        .poll(() =>
          page.locator('[data-fob="03"] .fob').evaluate((f) => {
            if (f.getAnimations().some((a) => a.playState !== 'finished')) return 'swinging';
            const n = f.querySelector('.fob__note')!;
            const fr = f.getBoundingClientRect();
            const nr = n.getBoundingClientRect();
            const inside = nr.left >= fr.left + 10 && nr.right <= fr.right - 10 && fr.bottom - nr.bottom >= 24 && n.scrollWidth <= n.clientWidth;
            return inside ? 'inside' : `out ${Math.round(fr.bottom - nr.bottom)}`;
          }),
        )
        .toBe('inside');
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
      // Instagram: one link, in the footer, to the exact profile address, in a new tab.
      const ig = page.locator('a[href*="instagram.com"]');
      await expect(ig).toHaveCount(1);
      await expect(page.locator('footer.foot a[href*="instagram.com"]')).toHaveCount(1);
      expect(await ig.getAttribute('href')).toBe(INSTAGRAM_URL);
      await expect(ig).toHaveAttribute('target', '_blank');
      expect(await ig.getAttribute('rel')).toContain('noopener');
      await expect(ig).toHaveText('Instagram: @last.quest.moldova');
      await ig.scrollIntoViewIfNeeded();
      await expect(ig).toBeVisible();
      expect((await ig.boundingBox())!.height, 'target height').toBeGreaterThanOrEqual(44);
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
          if (h === TELEGRAM_URL || h === SLOTS_URL || h === INSTAGRAM_URL) continue;
          expect(h, 'only tel:, wa.me, Telegram, Instagram, the booking widget and Google leave the site').toMatch(/^(tel:\+37368232596|https:\/\/wa\.me\/37368232596\?|https:\/\/www\.google\.com\/maps\/|https:\/\/search\.google\.com\/local\/writereview\?)/);
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

    test('levels are on: exactly two names, nothing preselected, and no description of what a level contains', async ({ page }) => {
      await open(page, lang);
      // One selector at the desk, one on the card: two levels each.
      await expect(page.locator('[data-level-input]')).toHaveCount(4);
      await expect(page.locator('#keys [data-level-input]')).toHaveCount(2);
      await expect(page.locator('#checkin [data-level-input]')).toHaveCount(2);
      for (const sel of ['#keys', '#checkin']) expect(await page.locator(`${sel} [data-level-input]`).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['none', 'hardcore']);
      // The two cells share the row evenly, at the desk and on the card.
      for (const sel of ['#keys .lvl__opt', '#checkin .card__lvl label']) {
        const boxes = await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
        expect(boxes).toHaveLength(2);
        expect(Math.abs(boxes[0].width - boxes[1].width), `${sel}: equal cells`).toBeLessThan(2);
        expect(Math.abs(boxes[0].top - boxes[1].top), `${sel}: one row`).toBeLessThan(2);
      }
      await expect(page.locator('[data-level-input]:checked')).toHaveCount(0);
      expect(await page.locator('#keys .lvl__opt').allTextContents().then((a) => a.map((x) => x.trim()))).toEqual(LEVEL_NAMES[lang]);
      expect(await page.locator('#checkin .card__lvl label').allTextContents().then((a) => a.map((x) => x.trim()))).toEqual(LEVEL_NAMES[lang]);
      // The key section holds the two names, the rule about minors and one neutral line,
      // nothing per level.
      await expect(page.locator('#keys [data-level-note]')).toBeVisible();
      await expect(page.locator('[data-level-text], [data-limits], .lvl__note')).toHaveCount(0);
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toMatch(/Standard|Contact level|Nivel de contact|Уровень контакта/);
      for (const sel of ['#keys', '#checkin']) expect((await page.locator(sel).textContent()) ?? '').not.toMatch(/Light|Standard/);
      // No level name of the old scheme is left in the page as code either, and nothing
      // in the stylesheets can tint the page by level.
      const html = await page.content();
      expect(html).not.toMatch(/data-level=|data-level\]/);
      await expect(page.locator('html')).not.toHaveAttribute('data-level', /.*/);
      const rules = await page.evaluate(() => [...document.styleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).filter((t) => t.includes('data-level')));
      expect(rules).toEqual([]);
      // The old copy that described the levels is gone.
      expect(body).not.toMatch(/keeps its distance|stops being polite|păstrează distanța|nu mai este politicos|держит дистанцию|перестаёт быть вежливым/);
    });

    test('the third level is gone: no name of it in the page, no key of it in the built page or its scripts', async ({ page, request }) => {
      await open(page, lang);
      // What the visitor can read, the hidden parts included (FAQ answers, dialog, attributes).
      const body = (await page.locator('body').textContent()) ?? '';
      for (const gone of REMOVED_LEVEL) expect(body, `page text, ${gone}`).not.toMatch(gone);
      // What was built: the page itself and every script it can load, the lazy ones too.
      const pageUrl = new URL(page.url());
      const html = await (await request.get(pageUrl.href)).text();
      const seen = new Map<string, string>([[pageUrl.pathname, html]]);
      const queue = [html];
      while (queue.length) {
        const text = queue.pop()!;
        for (const m of text.matchAll(/[\w.-]+\.js\b/g)) {
          const path = `${BASE}/_astro/${m[0]}`;
          if (seen.has(path)) continue;
          const res = await request.get(path);
          if (res.status() !== 200) continue;
          const js = await res.text();
          seen.set(path, js);
          queue.push(js);
        }
      }
      // The page, its main script and the lazy ones (fog, cameras, clipboard, smooth scroll).
      expect(seen.size, 'page plus its scripts').toBeGreaterThanOrEqual(4);
      for (const [path, text] of seen) for (const gone of REMOVED_LEVEL) expect(text, `${path}, ${gone}`).not.toMatch(gone);
      // The two that are left are there.
      for (const name of LEVEL_NAMES[lang]) expect(html).toContain(name);
      // The answer about the levels names two of them.
      const levelsAnswer = (await page.locator('.faq__item p').allTextContents()).find((a) => a.includes(LEVEL_NAMES[lang][0]) && a.includes(LEVEL_NAMES[lang][1]));
      expect(levelsAnswer, 'FAQ answer naming both levels').toBeTruthy();
      expect(levelsAnswer).not.toMatch(/three|trei|три/i);
    });

    test('the duration reads 60-90 min: key tag, hero line, FAQ and the page description', async ({ page }) => {
      await open(page, lang);
      const d = DURATION[lang];
      await expect(page.locator('[data-fob="02"] .fob__value')).toHaveText(d.short);
      // The tag holds it on one line, inside the tag.
      await page.locator('[data-fob="02"]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const value = await page.locator('[data-fob="02"] .fob__value').evaluate((v) => {
        const range = document.createRange();
        range.selectNodeContents(v);
        const f = v.closest('.fob')!.getBoundingClientRect();
        const r = range.getBoundingClientRect();
        return { lines: new Set([...range.getClientRects()].map((c) => Math.round(c.top))).size, inside: r.left >= f.left + 8 && r.right <= f.right - 8, fits: v.scrollWidth <= v.clientWidth };
      });
      expect(value).toEqual({ lines: 1, inside: true, fits: true });
      // The hero line: what, where, how long. The duration is its last part.
      const kicker = await page.locator('.hero__kicker span').allTextContents();
      expect(kicker).toHaveLength(3);
      expect(kicker[2].replace('/', '').trim()).toBe(d.short);
      // FAQ: the "how long" answer, and the "what is this" answer.
      await expect(page.locator('.faq__item', { hasText: DURATION_Q[lang] }).locator('p')).toHaveText(d.answer);
      await expect(page.locator('.faq__item').first().locator('p')).toContainText(d.prose);
      // The page description, which is also the share text.
      for (const sel of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
        expect(await page.locator(sel).getAttribute('content'), sel).toContain(d.prose);
      }
      // Nowhere does the page still say 60 minutes or one hour as the length of the game.
      const all = `${(await page.locator('body').textContent()) ?? ''} ${await page.locator('meta[name="description"]').getAttribute('content')}`;
      expect(all).not.toMatch(/(^|[^-\d])60 (min|мин|de min)|One hour|Один час|O oră ca/);
      // A plain hyphen in the range, never a dash.
      expect(all).not.toMatch(/60[\u2013\u2014]90/);
    });

    test('teams with minors play without electroshock: on the age key tag, in the age answer and next to both level choices', async ({ page }) => {
      await open(page, lang);
      const m = MINORS[lang];
      // The age key tag.
      await expect(page.locator('[data-fob="03"] .fob__note')).toContainText(m.tag, { ignoreCase: true });
      // The age answer in the FAQ.
      await expect(page.locator('.faq__item', { hasText: FACTS[lang].ageQ }).locator('p')).toContainText(m.rule);
      // Next to the level choice: on the card, right under the two cells, and at the desk.
      const onCard = page.locator('#checkin .card__lvl [data-minors]');
      await expect(onCard).toHaveCount(1);
      await expect(onCard).toHaveText(m.rule);
      await page.locator('#checkin .card__lvl').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect(onCard).toBeVisible();
      const card = await page.locator('#checkin .card__lvl').evaluate((f) => {
        const cells = f.querySelector('div')!.getBoundingClientRect();
        const rule = f.querySelector('[data-minors]')!.getBoundingClientRect();
        return { gap: rule.top - cells.bottom, left: rule.left - cells.left, inside: rule.right <= cells.right + 1 };
      });
      expect(card.gap).toBeGreaterThanOrEqual(0);
      expect(card.gap).toBeLessThan(24);
      expect(Math.abs(card.left)).toBeLessThan(2);
      expect(card.inside).toBe(true);
      const atDesk = page.locator('#keys [data-minors]');
      await expect(atDesk).toHaveCount(1);
      await expect(atDesk).toHaveText(m.rule);
      await atDesk.scrollIntoViewIfNeeded();
      await expect(atDesk).toBeVisible();
      const desk = await page.locator('#keys .lvl__pick').evaluate((f) => {
        const cells = f.querySelector('.lvl__opts')!.getBoundingClientRect();
        const rule = f.querySelector('[data-minors]')!.getBoundingClientRect();
        return rule.top - cells.bottom;
      });
      expect(desk).toBeGreaterThanOrEqual(0);
      expect(desk).toBeLessThan(24);
    });

    // The guest book itself (the three reviews, the pull quote, its place before the card) is
    // pinned in tests/reviews.spec.ts.
    test('review quotes are shown in the guest book section, under the rating', async ({ page }) => {
      await open(page, lang);
      await expect(page.locator('#quotes')).toHaveCount(1);
      await expect(page.locator('#proof #quotes [data-entry]')).toHaveCount(3);
      await expect(page.locator('#proof')).toContainText('39');
    });

    test('reduced motion: static and readable', async ({ browser }) => {
      const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const seen = watch(page);
      await page.goto(`${BASE}/${lang}/`);
      await expect(page.locator('[data-lift]')).toBeHidden();
      await expect(page.locator('.torch')).toBeHidden();
      // Nothing held: the corridor is an ordinary block (three stills, under three screens) and
      // every caption can be read.
      const corr = await page.locator('#corridor').boundingBox();
      expect(corr!.height).toBeLessThan(844 * 3);
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
  // The loose E now flickers as an analog fault inside the letter itself (a small area).
  // What every large light follows is its low-passed level, window.__hero.e.slow. Sample it
  // for 6 seconds and count its swings of 10% or more per rolling second. The raw level of
  // the letter is counted the same way, to show the measure is not blind.
  // tests/hero.spec.ts holds the detailed checks.
  type E = { slow: number; level: number };
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __hero?: { e?: E } }).__hero?.e?.slow)).toBe('number');
  const result = await page.evaluate(
    () =>
      new Promise<{ worst: number; samples: number; rawSwings: number; slowSwings: number }>((resolve) => {
        const e = (window as unknown as { __hero: { e: E } }).__hero.e;
        const rows: { t: number; slow: number; raw: number }[] = [];
        // A swing is a reversal after the value has moved at least `min` the other way.
        const swings = (pick: (r: { slow: number; raw: number }) => number, min: number) => {
          const times: number[] = [];
          let lo = pick(rows[0]);
          let hi = lo;
          let dir = 0;
          for (const r of rows) {
            const v = pick(r);
            if (dir >= 0 && v <= hi - min) {
              dir = -1;
              lo = v;
              times.push(r.t);
            } else if (dir <= 0 && v >= lo + min) {
              dir = 1;
              hi = v;
              times.push(r.t);
            }
            if (dir >= 0) hi = Math.max(hi, v);
            if (dir <= 0) lo = Math.min(lo, v);
          }
          return times;
        };
        const start = performance.now();
        const tick = (now: number) => {
          rows.push({ t: now, slow: e.slow, raw: e.level });
          if (now - start < 6000) return requestAnimationFrame(tick);
          const flips = swings((r) => r.slow, 0.1);
          let max = 0;
          for (const t of flips) max = Math.max(max, flips.filter((f) => f >= t && f < t + 1000).length);
          resolve({ worst: max, samples: rows.length, rawSwings: swings((r) => r.raw, 0.1).length, slowSwings: flips.length });
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(result.samples).toBeGreaterThan(100);
  expect(result.rawSwings).toBeGreaterThanOrEqual(result.slowSwings);
  // A flash is an on-off pair, so 3 flashes per second would be 6 transitions.
  expect(result.worst).toBeLessThanOrEqual(3);
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
