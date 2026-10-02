import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// Booking flow: the check-in card, the summary line, the booking dialog, Telegram, the
// floating control. Hermetic: the widget, t.me and wa.me are answered locally.

const BASE = '/horror';
const LANGS = ['ro', 'ru', 'en'] as const;
type L = (typeof LANGS)[number];
const BRAND = 'Проклятие Отеля';
const WA = '37368232596';
const TELEGRAM_URL = 'https://t.me/+37368232596';
const SLOTS_URL = 'https://widget.easyweek.io/horror-quest-moldova/team/34544/62497';
const PRICES: Record<number, number> = { 2: 1000, 3: 1000, 4: 1200, 5: 1500, 6: 1800, 7: 2100, 8: 2400, 9: 2700, 10: 3000, 11: 3300 };

const LABELS: Record<L, { team: string; level: string; language: string; total: string }> = {
  ro: { team: 'Echipă', level: 'Nivel', language: 'Limbă', total: 'Total' },
  ru: { team: 'Команда', level: 'Уровень', language: 'Язык', total: 'Итого' },
  en: { team: 'Team', level: 'Level', language: 'Language', total: 'Total' },
};
const LEVELS: Record<L, Record<'none' | 'weak' | 'hardcore', string>> = {
  ro: { none: 'Fără electroșoc', weak: 'Electroșoc slab', hardcore: 'Hardcore' },
  ru: { none: 'Без электрошока', weak: 'Слабый электрошок', hardcore: 'Хардкор' },
  en: { none: 'No electroshock', weak: 'Weak electroshock', hardcore: 'Hardcore' },
};
// Names of the three game languages, as each page spells them.
const LANG_NAMES: Record<L, Record<L, string>> = {
  ro: { ro: 'Română', ru: 'Rusă', en: 'Engleză' },
  ru: { ro: 'Румынский', ru: 'Русский', en: 'Английский' },
  en: { ro: 'Romanian', ru: 'Russian', en: 'English' },
};
const TOAST: Record<L, string> = {
  ro: 'Mesaj copiat - lipiți-l în Telegram',
  ru: 'Сообщение скопировано - вставьте его в Telegram',
  en: 'Message copied - paste it in Telegram',
};
// Each case: team size, level, game language.
const CASES: { team: number; level: 'none' | 'weak' | 'hardcore'; game: L }[] = [
  { team: 2, level: 'none', game: 'ro' },
  { team: 4, level: 'weak', game: 'en' },
  { team: 7, level: 'hardcore', game: 'ru' },
  { team: 11, level: 'weak', game: 'ro' },
];

const line = (lang: L, c: { team: number; level: 'none' | 'weak' | 'hardcore'; game: L }) =>
  `${LABELS[lang].team}: ${c.team} - ${LABELS[lang].level}: ${LEVELS[lang][c.level]} - ${LABELS[lang].language}: ${LANG_NAMES[lang][c.game]} - ${LABELS[lang].total}: ${PRICES[c.team]} MDL`;

// Nothing in this file reaches the network: the three outside hosts get a local answer.
async function seal(context: BrowserContext) {
  const hits: string[] = [];
  for (const host of ['widget.easyweek.io', 't.me', 'wa.me', 'api.whatsapp.com']) {
    await context.route(`https://${host}/**`, (route) => {
      hits.push(route.request().url());
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>stub</title><p>stub ${host}</p>` });
    });
  }
  return hits;
}

async function open(page: Page, lang: string) {
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/${lang}/`);
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

async function fill(page: Page, lang: L, c: { team: number; level: string; game: L }) {
  const form = page.locator('[data-checkin]');
  await form.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await form.locator('input[name="team"]').fill(String(c.team));
  await form.locator('select[name="language"]').selectOption(LANG_NAMES[lang][c.game]);
  await form.locator(`input[name="level"][value="${c.level}"]`).check({ force: true });
  return form;
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

for (const lang of LANGS) {
  test.describe(`booking: ${lang}`, () => {
    test('the card keeps team size, level and language; no level is preselected; the page language is', async ({ page, context }) => {
      await seal(context);
      await open(page, lang);
      const form = page.locator('[data-checkin]');
      // The widget collects the slot, name, phone and comment, so the card no longer does.
      for (const gone of ['date', 'time', 'name', 'phone', 'comment']) await expect(form.locator(`[name="${gone}"]`)).toHaveCount(0);
      await expect(form.locator('input[name="team"]')).toHaveAttribute('min', '2');
      await expect(form.locator('input[name="team"]')).toHaveAttribute('max', '11');
      const radios = form.locator('input[name="level"]');
      await expect(radios).toHaveCount(3);
      expect(await radios.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['none', 'weak', 'hardcore']);
      expect(await radios.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).dataset.name))).toEqual(Object.values(LEVELS[lang]));
      expect(await radios.evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).checked).length), 'no default level').toBe(0);
      expect(await radios.evaluateAll((els) => els.every((e) => (e as HTMLInputElement).required))).toBe(true);
      // Game languages: exactly RO, RU, EN, with the page language selected.
      expect(await form.locator('select[name="language"] option').allTextContents()).toEqual(Object.values(LANG_NAMES[lang]));
      await expect(form.locator('select[name="language"]')).toHaveValue(LANG_NAMES[lang][lang]);
      await expect(form.locator('[data-book]')).toBeVisible();
      await expect(form.locator('a[href="tel:+37368232596"]')).toBeVisible();
    });

    test('"Book a time slot" copies the summary line: team size, level, language and total', async ({ page, context }) => {
      await seal(context);
      await open(page, lang);
      const dialog = page.locator('[data-booking]');
      for (const c of CASES) {
        const form = await fill(page, lang, c);
        await expect(form.locator('[data-total]')).toHaveText(`${PRICES[c.team]} MDL`);
        await form.locator('[data-book]').click();
        await expect(dialog).toHaveJSProperty('open', true);
        const expected = line(lang, c);
        await expect.poll(() => clipboard(page), `clipboard for team ${c.team}`).toBe(expected);
        // One line, plain hyphens only.
        expect(expected).not.toMatch(/[\n\u2013\u2014]/);
        await expect(dialog.locator('[data-booking-line]')).toHaveText(expected);
        await expect(dialog.locator('[data-booking-state]')).toHaveText(/\S/);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveJSProperty('open', false);
      }
    });

    test('the booking dialog opens the widget, closes with Esc and the button, and gives focus back', async ({ page, context }) => {
      const hits = await seal(context);
      await open(page, lang);
      const dialog = page.locator('[data-booking]');
      const frame = dialog.locator('iframe');
      // Nothing of the widget is loaded with the page.
      await expect(frame).not.toHaveAttribute('src', /.*/);
      await expect(frame).toHaveAttribute('title', /EasyWeek/);
      await expect(dialog).toBeHidden();
      expect(hits).toEqual([]);

      const form = await fill(page, lang, CASES[1]);
      const book = form.locator('[data-book]');
      await book.click();
      await expect(dialog).toBeVisible();
      await expect(frame).toHaveAttribute('src', SLOTS_URL);
      await expect.poll(() => hits).toContain(SLOTS_URL);
      await expect(page.frameLocator('[data-booking-frame]').locator('p')).toHaveText('stub widget.easyweek.io');
      // Dialog semantics: modal, named, scroll locked, Lenis kept out.
      expect(await dialog.evaluate((d) => d.matches(':modal'))).toBe(true);
      await expect(dialog).toHaveAttribute('aria-labelledby', 'bk-title');
      await expect(dialog).toHaveAttribute('data-lenis-prevent', '');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
      // The new-tab fallback is always there.
      const tab = dialog.locator('[data-booking-tab]');
      await expect(tab).toBeVisible();
      await expect(tab).toHaveAttribute('href', SLOTS_URL);
      await expect(tab).toHaveAttribute('target', '_blank');
      // The widget keeps most of the screen.
      const box = (await frame.boundingBox())!;
      expect(box.height / page.viewportSize()!.height, 'share of the viewport height left to the widget').toBeGreaterThan(0.6);
      if (page.viewportSize()!.width < 900) expect(box.width, 'full width on phones').toBe(page.viewportSize()!.width);

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(book).toBeFocused();
      await expect(frame).not.toHaveAttribute('src', /.*/);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');

      await book.click();
      await expect(dialog).toBeVisible();
      const close = dialog.locator('[data-booking-close]');
      await expect(close).toBeVisible();
      await expect(close).toHaveText(/\S/);
      await close.click();
      await expect(dialog).toBeHidden();
      await expect(book).toBeFocused();
    });

    test('"Copy again" writes the line to the clipboard again', async ({ page, context }) => {
      await seal(context);
      await open(page, lang);
      const form = await fill(page, lang, CASES[2]);
      await form.locator('[data-book]').click();
      const expected = line(lang, CASES[2]);
      await expect.poll(() => clipboard(page)).toBe(expected);
      await page.evaluate(() => navigator.clipboard.writeText('something else'));
      await page.locator('[data-booking-copy]').click();
      await expect.poll(() => clipboard(page)).toBe(expected);
      await expect(page.locator('[data-booking-state]')).toHaveText(/\S/);
    });

    test('when the clipboard refuses, the line is shown as selectable text and the dialog says so', async ({ page, context }) => {
      await seal(context);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')), readText: () => Promise.resolve('') } });
        document.execCommand = () => false;
      });
      await open(page, lang);
      const form = await fill(page, lang, CASES[0]);
      await form.locator('[data-book]').click();
      const dialog = page.locator('[data-booking]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveClass(/is-manual/);
      const shown = dialog.locator('[data-booking-line]');
      await expect(shown).toHaveText(line(lang, CASES[0]));
      expect(await shown.evaluate((el) => getComputedStyle(el).userSelect)).toBe('all');
      const said = await dialog.locator('[data-booking-state]').textContent();
      expect(said).toBe(await dialog.getAttribute('data-not-copied'));
      expect(said!.length).toBeGreaterThan(20);
      // The line is handed over already selected.
      expect(await page.evaluate(() => String(window.getSelection()))).toBe(line(lang, CASES[0]));
    });

    test('the card refuses to book without a level and with a team size outside 2 to 11', async ({ page, context }) => {
      await seal(context);
      await open(page, lang);
      const form = page.locator('[data-checkin]');
      const dialog = page.locator('[data-booking]');
      await form.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await form.locator('[data-book]').click();
      await expect(dialog, 'no level chosen').toBeHidden();
      await form.locator('input[name="level"][value="weak"]').check({ force: true });
      for (const bad of ['1', '12', '0', '']) {
        await form.locator('input[name="team"]').fill(bad);
        await form.locator('[data-book]').click();
        await expect(dialog, `team "${bad}"`).toBeHidden();
      }
      await form.locator('input[name="team"]').fill('3');
      await form.locator('[data-book]').click();
      await expect(dialog).toBeVisible();
    });

    test('ask a question on WhatsApp: the prefilled message is the greeting plus the summary line', async ({ page, context }) => {
      await seal(context);
      await open(page, lang);
      for (const c of CASES) {
        const form = await fill(page, lang, c);
        const href = (await form.locator('[data-ask-wa]').getAttribute('href'))!;
        const u = new URL(href);
        expect(u.origin + u.pathname).toBe(`https://wa.me/${WA}`);
        const lines = (u.searchParams.get('text') ?? '').split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain(BRAND);
        expect(lines[1]).toBe(line(lang, c));
      }
      await expect(page.locator('[data-ask-wa]')).toHaveAttribute('target', '_blank');
    });

    test('ask a question on Telegram: copies the message, shows the toast, opens Telegram in a new tab', async ({ page, context }) => {
      const hits = await seal(context);
      await open(page, lang);
      const form = await fill(page, lang, CASES[3]);
      const tg = form.locator('[data-ask-tg]');
      await expect(tg).toHaveAttribute('href', TELEGRAM_URL);
      const toast = page.locator('[data-toast]');
      await expect(toast).toHaveAttribute('role', 'status');
      await expect(toast).toHaveAttribute('aria-live', 'polite');
      await expect(toast).toBeHidden();
      const [popup] = await Promise.all([page.waitForEvent('popup'), tg.click()]);
      await popup.waitForLoadState();
      expect(popup.url()).toBe(TELEGRAM_URL);
      expect(hits).toContain(TELEGRAM_URL);
      await popup.close();
      await page.bringToFront();
      const copied = (await clipboard(page)).split('\n');
      expect(copied).toHaveLength(2);
      expect(copied[0]).toContain(BRAND);
      expect(copied[1]).toBe(line(lang, CASES[3]));
      await expect(toast).toBeVisible();
      await expect(toast).toHaveText(TOAST[lang]);
      // The toast never sits on the booking button or on the link that was pressed.
      const t = (await toast.boundingBox())!;
      for (const sel of ['[data-book]', '[data-ask-tg]']) {
        const b = await form.locator(sel).boundingBox();
        if (b) expect(t.y + t.height <= b.y || b.y + b.height <= t.y, `toast clear of ${sel}`).toBe(true);
      }
      // It leaves by itself after about 4 seconds.
      await expect(toast).toBeHidden({ timeout: 6000 });
      await expect(toast).toHaveText('');
    });

    test('the floating control opens a menu with WhatsApp and Telegram, keyboard and Esc work', async ({ page, context }) => {
      await seal(context);
      await open(page, lang);
      const toggle = page.locator('[data-float-toggle]');
      const wa = page.locator('[data-float-wa]');
      const tg = page.locator('[data-float-tg]');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveAttribute('aria-controls', 'ask-menu');
      expect(((await toggle.getAttribute('aria-label')) ?? '').length).toBeGreaterThan(5);
      await expect(wa).toBeHidden();
      await expect(tg).toBeHidden();

      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(wa).toBeVisible();
      await expect(tg).toBeVisible();
      await expect(wa).toHaveText('WhatsApp');
      await expect(tg).toHaveText('Telegram');
      for (const item of [wa, tg, toggle]) {
        const box = (await item.boundingBox())!;
        expect(box.height, 'target height').toBeGreaterThanOrEqual(44);
        expect(box.width, 'target width').toBeGreaterThanOrEqual(44);
      }
      const u = new URL((await wa.getAttribute('href'))!);
      expect(u.origin + u.pathname).toBe(`https://wa.me/${WA}`);
      expect(u.searchParams.get('text')).toContain(BRAND);
      await expect(tg).toHaveAttribute('href', TELEGRAM_URL);

      // Esc closes the menu and focus goes back to the button.
      await page.keyboard.press('Shift+Tab');
      await expect(tg).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(tg).toBeHidden();
      await expect(toggle).toBeFocused();

      // Telegram from the menu: copy, toast, new tab.
      await toggle.click();
      const [popup] = await Promise.all([page.waitForEvent('popup'), tg.click()]);
      await popup.waitForLoadState();
      expect(popup.url()).toBe(TELEGRAM_URL);
      await popup.close();
      await page.bringToFront();
      expect(await clipboard(page)).toContain(BRAND);
      await expect(page.locator('[data-toast]')).toHaveText(TOAST[lang]);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('every "book" link leads to the card, and no link bypasses it to the widget', async ({ page, context }) => {
      await seal(context);
      await open(page, lang);
      await expect(page.locator('[data-sticky] a.btn--primary')).toHaveAttribute('href', '#checkin');
      // Only the dialog itself (new-tab fallback) may point at the widget: a link anywhere
      // else, the hero included, would book a slot without the summary line.
      const outside = await page.locator('a[href*="easyweek"]').evaluateAll((as) => as.filter((a) => !a.closest('[data-booking]')).length);
      expect(outside).toBe(0);
      await expect(page.locator('[data-booking] a[href*="easyweek"]')).toHaveCount(2);
      await expect(page.locator('a[data-slots]')).toHaveCount(0);
      // The hero actions: the card, the route in Google Maps and the phone. None of them books directly.
      expect(await page.locator('#lobby .hero__cta a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual([
        '#checkin',
        'https://www.google.com/maps/dir/?api=1&destination=Strada+Onisifor+Ghibu+10%2C+Chi%C8%99in%C4%83u+MD-2071&destination_place_id=ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU',
        'tel:+37368232596',
      ]);
    });
  });
}

test('the booking dialog puts the new-tab fallback forward when the widget does not load in time', async ({ page, context }) => {
  await context.route('https://widget.easyweek.io/**', () => {
    // Never answered: the widget hangs.
  });
  await page.clock.install();
  await open(page, 'en');
  const form = await fill(page, 'en', CASES[1]);
  await form.locator('[data-book]').click();
  const dialog = page.locator('[data-booking]');
  const slow = dialog.locator('[data-booking-slow]');
  await expect(dialog).toBeVisible();
  await expect(slow).toBeHidden();
  await page.clock.fastForward(11000);
  await expect(slow).toBeVisible();
  await expect(slow.locator('a')).toHaveAttribute('href', SLOTS_URL);
  await expect(slow.locator('a')).toHaveAttribute('target', '_blank');
  await context.unrouteAll({ behavior: 'ignoreErrors' });
});

test('without dialog support "Book a time slot" copies the line and opens the widget in a new tab', async ({ page, context }) => {
  const hits = await seal(context);
  await page.addInitScript(() => {
    // A browser without <dialog>.showModal.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
  });
  for (const lang of LANGS) {
    await open(page, lang);
    const form = await fill(page, lang, CASES[3]);
    const [tab] = await Promise.all([context.waitForEvent('page'), form.locator('[data-book]').click()]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe(SLOTS_URL);
    expect(hits).toContain(SLOTS_URL);
    await tab.close();
    await page.bringToFront();
    await expect.poll(() => clipboard(page)).toBe(line(lang, CASES[3]));
    await expect(page.locator('[data-booking]')).toHaveJSProperty('open', false);
    await expect(page.locator('[data-booking-frame]')).not.toHaveAttribute('src', /.*/);
    hits.length = 0;
  }
});

test('on phones the floating control steps aside while FAQ rows pass under it, and comes back after', async ({ page, context }) => {
  await seal(context);
  await open(page, 'ru');
  const float = page.locator('[data-float]');
  const phone = page.viewportSize()!.width < 900;
  await expect(float).toBeVisible();
  const rows = page.locator('.faq__item');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    // Put each row where the control sits.
    await rows.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 2 - (window.innerHeight - 110));
    });
    // Let the observers report the new position before looking: an assertion made at
    // once would still see the state of the previous row.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 450)))));
    if (phone) await expect(float, `row ${i + 1}`).toBeHidden();
    else await expect(float).toBeVisible();
    // The plus sign of the row is never under the control.
    const hit = await rows.nth(i).locator('summary i').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(top && top.closest('[data-float]'));
    });
    expect(hit, `row ${i + 1} toggle covered`).toBe(false);
  }
  await page.locator('#location').evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.locator('#voucher').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(float).toBeVisible();
});

test('on phones the floating control steps aside while the card is on screen', async ({ page, context }) => {
  await seal(context);
  await open(page, 'ro');
  const float = page.locator('[data-float]');
  await expect(float).toBeVisible();
  await page.locator('[data-checkin]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  if (page.viewportSize()!.width < 900) await expect(float).toBeHidden();
  else await expect(float).toBeVisible();
});

test('the 404 page has the floating control with both channels and the toast', async ({ page, context }) => {
  await seal(context);
  const res = await page.goto(`${BASE}/no-such-room/`);
  expect(res!.status()).toBe(404);
  const toggle = page.locator('[data-float-toggle]');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('[data-float-wa]')).toBeVisible();
  const tg = page.locator('[data-float-tg]');
  await expect(tg).toBeVisible();
  const [popup] = await Promise.all([page.waitForEvent('popup'), tg.click()]);
  await popup.close();
  await page.bringToFront();
  expect(await clipboard(page)).toContain(BRAND);
  await expect(page.locator('[data-toast]')).toHaveText(TOAST.ro);
});

test('picking a level at the desk preselects it on the card', async ({ page, context }) => {
  await seal(context);
  await open(page, 'en');
  await page.locator('#keys input[data-level-input][value="hardcore"]').check({ force: true });
  await expect(page.locator('#checkin input[name="level"][value="hardcore"]')).toBeChecked();
  const href = (await page.locator('[data-ask-wa]').getAttribute('href'))!;
  expect(new URL(href).searchParams.get('text')).toContain('Level: Hardcore');
  // No tint follows the level: the page never hints at what a level contains.
  const neon = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--neon').trim());
  expect(await neon()).toBe('#ff2d2d');
});
