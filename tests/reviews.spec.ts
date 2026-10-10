import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The guest book: three Google reviews as handwritten entries, the rating and the links
// above them, one line pulled out large, the whole section right before the registration card.

const BASE = '';
const LANGS = ['ro', 'ru', 'en'] as const;
type L = (typeof LANGS)[number];

const PROFILE_URL = 'https://www.google.com/maps/place/?q=place_id:ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU';
const REVIEW_URL = 'https://search.google.com/local/writereview?placeid=ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU';
const AUTHORS = ['Catalina G.', 'Diana R.', 'Ruslana P.'];
// The second review is an excerpt.
const EXCERPT = [false, true, false];

// Romanian: the originals, character for character. Russian and English: the translations.
const QUOTES: Record<L, string[]> = {
  ro: [
    'Cel mai tare quest horror! Foarte înfricoșător, plin de adrenalină și extrem de captivant. Ne-am speriat serios și ne-a plăcut enorm. Recomand 100%!',
    'O experiență de neuitat! Am fost la acest horror quest cu prietenii și pot spune că a fost absolut genial! Atmosfera este incredibil de bine realizată, decorurile sunt detaliate și te fac să simți că ești într-un film de groază.',
    'Quest, pușca, racheta, bomba, țunami!!! Emoții de neuitat, încăperea e amenajată perfect, actorii fenomenali 10/10. Nu e ultima dată când voi mai vizita acest Quest!!!',
  ],
  ru: [
    'Самый крутой хоррор-квест! Очень страшный, полный адреналина и крайне захватывающий. Мы серьёзно испугались, и нам невероятно понравилось. Рекомендую на 100%!',
    'Незабываемые впечатления! Я была на этом хоррор-квесте с друзьями и могу сказать, что это было абсолютно гениально! Атмосфера создана невероятно хорошо, декорации детальные и заставляют почувствовать, что ты в фильме ужасов.',
    'Квест, пушка, ракета, бомба, цунами!!! Незабываемые эмоции, помещение оформлено идеально, актёры феноменальные 10/10. Это не последний раз, когда я посещу этот Квест!!!',
  ],
  en: [
    'The coolest horror quest! Very scary, full of adrenaline and extremely captivating. We got seriously scared and we enjoyed it enormously. I recommend it 100%!',
    'An unforgettable experience! I went to this horror quest with friends and I can say it was absolutely brilliant! The atmosphere is incredibly well done, the sets are detailed and make you feel like you are in a horror film.',
    'Quest, gun, rocket, bomb, tsunami!!! Unforgettable emotions, the room is set up perfectly, the actors phenomenal 10/10. This is not the last time I will visit this Quest!!!',
  ],
};
const PULL: Record<L, string> = { ro: 'Cel mai tare quest horror!', ru: 'Самый крутой хоррор-квест!', en: 'The coolest horror quest!' };
// Under each entry on the pages that show a translation. The Romanian page shows none.
const TRANSLATED: Record<L, string | null> = { ro: null, ru: 'перевод с румынского', en: 'translated from Romanian' };
const STARS: Record<L, string> = { ro: '5 din 5', ru: '5 из 5', en: '5 out of 5' };
const RATING: Record<L, { value: string; count: string; source: string }> = {
  ro: { value: '4,8', count: '39 de recenzii', source: 'Rating Google' },
  ru: { value: '4,8', count: '39 отзывов', source: 'Рейтинг Google' },
  en: { value: '4.8', count: '39 reviews', source: 'Google rating' },
};
const READ_ALL: Record<L, string> = { ro: 'Citiți toate recenziile pe Google', ru: 'Читать все отзывы в Google', en: 'Read all reviews on Google' };
const LEAVE: Record<L, string> = { ro: 'Lăsați o recenzie', ru: 'Оставить отзыв', en: 'Leave a review' };
// Every section of the page, in order. The guest book is the one right before the card.
const ORDER = ['lobby', 'corridor', 'file', 'keys', 'prices', 'cctv', 'voucher', 'proof', 'checkin', 'info'];

async function open(page: Page, lang: string) {
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/${lang}/`);
}

for (const lang of LANGS) {
  test.describe(`guest book: ${lang}`, () => {
    test('all three reviews are in the book: text, name, five stars, and the translation label where it is a translation', async ({ page }) => {
      await open(page, lang);
      const book = page.locator('#proof [data-guestbook]');
      await expect(book).toHaveCount(1);
      const entries = book.locator('[data-entry]');
      await expect(entries).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        const entry = entries.nth(i);
        await entry.scrollIntoViewIfNeeded();
        await expect(entry).toBeVisible();
        // The text, exactly: the original on the Romanian page, the translation elsewhere.
        const text = entry.locator('[data-review-text]');
        await expect(text).toHaveText(QUOTES[lang][i]);
        expect(await text.textContent()).toBe(QUOTES[lang][i]);
        await expect(entry.locator('blockquote')).toHaveAttribute('lang', lang);
        // An excerpt ends with three plain dots; a whole review does not.
        const whole = ((await entry.locator('blockquote').textContent()) ?? '').replace(/\s+/g, ' ').trim();
        if (EXCERPT[i]) {
          await expect(entry.locator('[data-excerpt]')).toHaveCount(1);
          expect(whole).toBe(`${QUOTES[lang][i]} ...`);
          expect(whole.endsWith('...')).toBe(true);
        } else {
          await expect(entry.locator('[data-excerpt]')).toHaveCount(0);
          expect(whole).toBe(QUOTES[lang][i]);
        }
        // First name and the initial of the last name.
        await expect(entry.locator('[data-review-author]')).toHaveText(AUTHORS[i]);
        // Five stars, drawn, with a name a screen reader can say.
        const stars = entry.getByRole('img', { name: STARS[lang] });
        await expect(stars).toHaveCount(1);
        await expect(stars.locator('path')).toHaveCount(5);
        await expect(stars.locator('svg')).toHaveAttribute('aria-hidden', 'true');
        // The label: on every entry of a page that shows translations, on none in Romanian.
        const label = entry.locator('[data-translated]');
        if (TRANSLATED[lang]) await expect(label).toHaveText(TRANSLATED[lang]!);
        else await expect(label).toHaveCount(0);
      }
      if (!TRANSLATED[lang]) expect((await page.locator('#proof').textContent()) ?? '').not.toMatch(/tradus|translated|перевод/i);
      // Handwriting in the book, print around it: the entries are in the italic serif on the
      // paper, the same pairing as the registry in the archive.
      const look = await entries.first().locator('blockquote').evaluate((el) => {
        const s = getComputedStyle(el);
        const paper = getComputedStyle(el.closest('[data-guestbook]')!).backgroundColor;
        const registry = getComputedStyle(document.querySelector('.registry')!).backgroundColor;
        return { italic: s.fontStyle, serif: /Playfair/.test(s.fontFamily), samePaper: paper === registry };
      });
      expect(look).toEqual({ italic: 'italic', serif: true, samePaper: true });
    });

    test('the rating leads the block, with "read all reviews on Google" and "leave a review"', async ({ page }) => {
      await open(page, lang);
      const proof = page.locator('#proof');
      await expect(proof.locator('.score__val')).toHaveText(RATING[lang].value);
      await expect(proof.locator('.score__count')).toHaveText(RATING[lang].count);
      await expect(proof.locator('.score__src')).toHaveText(RATING[lang].source);
      const readAll = proof.getByRole('link', { name: READ_ALL[lang] });
      await expect(readAll).toHaveCount(1);
      expect(await readAll.getAttribute('href')).toBe(PROFILE_URL);
      await expect(readAll).toHaveAttribute('target', '_blank');
      expect(await readAll.getAttribute('rel')).toContain('noopener');
      const leave = proof.getByRole('link', { name: LEAVE[lang] });
      await expect(leave).toHaveCount(1);
      expect(await leave.getAttribute('href')).toBe(REVIEW_URL);
      await expect(leave).toHaveAttribute('target', '_blank');
      expect(await leave.getAttribute('rel')).toContain('noopener');
      // The rating and the links come first, then the pull quote, then the book.
      const tops = await proof.evaluate((el) => {
        const top = (sel: string) => el.querySelector(sel)!.getBoundingClientRect().top;
        return { score: top('.score'), links: top('.score__links'), pull: top('[data-pull]'), book: top('[data-guestbook]') };
      });
      expect(tops.score).toBeLessThan(tops.pull);
      expect(tops.links).toBeLessThan(tops.pull);
      expect(tops.pull).toBeLessThan(tops.book);
    });

    test('the guest book is the section right before the registration card', async ({ page }) => {
      await open(page, lang);
      const ids = await page.locator('main > section').evaluateAll((els) => els.map((e) => e.id));
      expect(ids).toEqual(ORDER);
      // Stated on its own: it is the one before the card, and everything else is before it.
      expect(ids[ids.indexOf('checkin') - 1]).toBe('proof');
      for (const earlier of ['prices', 'cctv', 'voucher']) expect(ids.indexOf(earlier)).toBeLessThan(ids.indexOf('proof'));
      // On the page as well: the book ends above the card, with nothing in between.
      const y = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        return { bookBottom: r('[data-guestbook]').bottom, proofBottom: r('#proof').bottom, cardTop: r('#checkin').top, voucherBottom: r('#voucher').bottom, proofTop: r('#proof').top };
      });
      expect(y.bookBottom).toBeLessThan(y.cardTop);
      expect(Math.abs(y.proofBottom - y.cardTop)).toBeLessThan(2);
      expect(y.voucherBottom).toBeLessThanOrEqual(y.proofTop + 1);
      // The directory numbers follow the order of the page.
      const numbers = await page.locator('main > section .place__no').allTextContents();
      expect(numbers.map(Number)).toEqual([...numbers.map(Number)].sort((a, b) => a - b));
      expect(new Set(numbers).size).toBe(numbers.length);
      await expect(page.locator('#proof .place__no')).toHaveText('08');
      await expect(page.locator('#checkin .place__no')).toHaveText('09');
    });

    test('one line is pulled out large, with the name of the guest who wrote it', async ({ page }) => {
      await open(page, lang);
      const pull = page.locator('#proof [data-pull]');
      await expect(pull).toHaveCount(1);
      await expect(pull.locator('blockquote p')).toHaveText(PULL[lang]);
      await expect(pull.locator('blockquote')).toHaveAttribute('lang', lang);
      await expect(pull.locator('figcaption')).toHaveText(AUTHORS[0]);
      // It is the first sentence of the first review, word for word.
      expect(QUOTES[lang][0].startsWith(PULL[lang])).toBe(true);
      await pull.scrollIntoViewIfNeeded();
      await expect(pull).toBeVisible();
      const size = (sel: string) => page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      const big = await size('#proof [data-pull] blockquote p');
      const entry = await size('#proof [data-entry] blockquote');
      expect(big).toBeGreaterThan(entry * 1.8);
      // And it fits the screen.
      const box = (await pull.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    });

    test('nothing in the block sticks out of the screen, and the entries stay on the paper', async ({ page }) => {
      await open(page, lang);
      await page.locator('#proof').evaluate((el) => el.scrollIntoView());
      const out = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const book = document.querySelector('[data-guestbook]')!.getBoundingClientRect();
        const wide: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('#proof [data-entry], #proof [data-entry] *, #proof [data-pull] *'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.right > vw + 1 || r.left < -1) wide.push(`screen: ${el.tagName}.${el.className}`);
          // The sheet is tilted by half a degree on a wide screen: a few pixels of slack.
          if (el.closest('[data-entry]') && (r.left < book.left - 6 || r.right > book.right + 6)) wide.push(`paper: ${el.tagName}.${el.className}`);
        }
        return { wide, scroll: document.documentElement.scrollWidth - vw };
      });
      expect(out.wide).toEqual([]);
      expect(out.scroll).toBeLessThanOrEqual(0);
    });

    test('no structured data in the preview build', async ({ page }) => {
      await open(page, lang);
      // The preview is not indexable, so no JSON-LD at all is printed.
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
      expect(await page.content()).not.toMatch(/"@type":\s*"Review"/);
    });
  });
}

test('reduced motion: the three entries are there at once, static, and nothing overflows at 390 in Russian', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/ru/`);
  // No scrolling, no input: everything in the block is already in its final state.
  const state = await page.evaluate(() => {
    const shown = (el: Element) => {
      const s = getComputedStyle(el);
      return s.opacity === '1' && s.visibility === 'visible' && s.display !== 'none' && el.getBoundingClientRect().height > 0;
    };
    const entries = Array.from(document.querySelectorAll('#proof [data-entry]'));
    return {
      scrolled: window.scrollY,
      entries: entries.map(shown),
      revealed: entries.map((e) => getComputedStyle(e).transform),
      pull: shown(document.querySelector('#proof [data-pull]')!),
      book: shown(document.querySelector('#proof [data-guestbook]')!),
      // The pen stroke under each signature is fully drawn.
      strokes: Array.from(document.querySelectorAll('#proof [data-review-author]')).map((c) => getComputedStyle(c).backgroundSize.split(' ')[0]),
      running: document.querySelector('#proof')!.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(state.scrolled).toBe(0);
  expect(state.entries).toEqual([true, true, true]);
  expect(state.revealed).toEqual(['none', 'none', 'none']);
  expect(state.pull).toBe(true);
  expect(state.book).toBe(true);
  expect(state.strokes).toEqual(['100%', '100%', '100%']);
  expect(state.running).toBe(0);
  expect(state.overflow).toBeLessThanOrEqual(0);
  for (let i = 0; i < 3; i++) await expect(page.locator('#proof [data-review-text]').nth(i)).toHaveText(QUOTES.ru[i]);
  await ctx.close();
});

test('with motion the entries come in with the approved reveal and nothing in the block loops', async ({ page }) => {
  await open(page, 'ro');
  const entry = page.locator('#proof [data-entry]').first();
  // Same mechanism as everywhere else on the page: data-reveal, opacity and transform.
  await expect(entry).toHaveAttribute('data-reveal', '');
  expect(await entry.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe('opacity, transform');
  await entry.scrollIntoViewIfNeeded();
  await expect(entry).toHaveClass(/is-in/);
  await expect.poll(() => entry.evaluate((el) => getComputedStyle(el).opacity), { timeout: 5000 }).toBe('1');
  const loops = await page.locator('#proof').evaluate((el) =>
    el
      .getAnimations({ subtree: true })
      .filter((a) => (a.effect?.getTiming().iterations ?? 1) === Infinity).length,
  );
  expect(loops).toBe(0);
});

test('indexable build: the reviews add no Review markup and no second rating', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'one build is enough');
  test.setTimeout(240000);
  // The same site, built the way it will be once it is opened to search engines.
  const out = mkdtempSync(join(tmpdir(), 'horror-indexable-'));
  try {
    execFileSync('npx', ['astro', 'build', '--outDir', out], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, SITE_INDEXABLE: 'true' }, stdio: 'pipe' });
    for (const lang of LANGS) {
      const html = readFileSync(join(out, lang, 'index.html'), 'utf8');
      const blocks = Array.from(html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)).map((m) => JSON.parse(m[1]));
      expect(blocks.length, `${lang}: JSON-LD is printed in an indexable build`).toBeGreaterThanOrEqual(2);
      // Every typed node, at any depth.
      const types: string[] = [];
      const keys: string[] = [];
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === 'object') {
          for (const [k, v] of Object.entries(node)) {
            keys.push(k);
            if (k === '@type') types.push(String(v));
            walk(v);
          }
        }
      };
      walk(blocks);
      // No review is marked up, and no quote text is in the structured data.
      expect(types).not.toContain('Review');
      expect(keys).not.toContain('review');
      expect(keys).not.toContain('reviewBody');
      const json = JSON.stringify(blocks);
      for (const quote of [...QUOTES[lang], ...AUTHORS]) expect(json).not.toContain(quote);
      // No rating is marked up either: the owner had the aggregate rating removed from the
      // business entry. The rating is shown on the page only.
      expect(types).not.toContain('AggregateRating');
      expect(keys).not.toContain('aggregateRating');
      const business = blocks.find((b) => b['@type'] === 'LocalBusiness');
      expect(business).toBeTruthy();
      expect(business.aggregateRating).toBeUndefined();
      // The quotes themselves are on the page.
      for (const quote of QUOTES[lang]) expect(html).toContain(quote.replace(/&/g, '&amp;'));
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
