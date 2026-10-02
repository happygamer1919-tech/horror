import { test, expect, type Page, type CDPSession } from '@playwright/test';

// The arrival hero: darkness and the flashlight, the loose E, the route button, the facade.
// The page exposes its hero state on window.__hero (src/scripts/hero-hooks.ts).

const BASE = '/horror';
const LANGS = ['ro', 'ru', 'en'] as const;
const ROUTE_URL =
  'https://www.google.com/maps/dir/?api=1&destination=Strada+Onisifor+Ghibu+10%2C+Chi%C8%99in%C4%83u+MD-2071&destination_place_id=ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU';
const STREET = 'Strada Onisifor Ghibu 10';
const CITY = { ro: 'Chișinău', ru: 'Кишинёв', en: 'Chisinau' };

interface Hooks {
  torch: { x: number; y: number; r: number; touched: boolean };
  e: { mode: string; level: number; slow: number; segs: number[]; force: (w: string) => void; hold: (p: string | null) => void };
  figure: { state: string; lit: boolean; set: (s: string) => void };
  storm: { count: number; active: boolean; strike: () => void; hold: (on: boolean) => void };
  rain: { running: boolean; drops: number };
}
declare global {
  interface Window {
    __hero: Hooks;
  }
}

async function open(page: Page, lang = 'ro') {
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/${lang}/`);
  await page.evaluate(() => document.fonts.ready);
}

function errorsOf(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// Where the beam element really is, read from its transform (not from the hook).
const beamCentres = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.torch__beam')).map((b) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(b).transform);
      return { x: m.m41, y: m.m42 };
    }),
  );
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

const touchPoint = (p: { x: number; y: number }) => [{ x: p.x, y: p.y, id: 1 }];
const touchStart = (cdp: CDPSession, p: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(p) });
const touchMove = (cdp: CDPSession, p: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(p) });
const touchEnd = (cdp: CDPSession) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

for (const lang of LANGS) {
  test(`${lang}: route button has the exact Google Maps URL and the street address under it`, async ({ page }) => {
    await open(page, lang);
    const route = page.locator('#lobby [data-route]');
    await expect(route).toHaveCount(1);
    expect(await route.getAttribute('href')).toBe(ROUTE_URL);
    await expect(route).toHaveAttribute('target', '_blank');
    expect(await route.getAttribute('rel')).toContain('noopener');

    const button = route.locator('.btn');
    const address = route.locator('[data-route-address]');
    await expect(button).toBeVisible();
    await expect(address).toBeVisible();
    await expect(address).toHaveText(`${STREET}, ${CITY[lang]}`);

    const b = (await button.boundingBox())!;
    const a = (await address.boundingBox())!;
    const cta = (await page.locator('#lobby [data-cta]').boundingBox())!;
    // The address sits under the route button, the route button next to the booking button.
    expect(a.y).toBeGreaterThanOrEqual(b.y + b.height);
    expect(a.y - (b.y + b.height)).toBeLessThan(16);
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(cta.x + cta.width);
    expect(Math.abs(b.y - cta.y)).toBeLessThan(2);
    // It is a button second to the red one: brass outline, not the red fill.
    const colours = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopColor, bg: s.backgroundColor };
    });
    const primaryBg = await page.locator('#lobby [data-cta]').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(colours.border).toBe('rgb(227, 200, 135)');
    expect(colours.bg).not.toBe(primaryBg);

    // Booking still goes to the check-in card, and the slots link is gone.
    await expect(page.locator('#lobby [data-cta]')).toHaveAttribute('href', '#checkin');
    await expect(page.locator('#lobby [data-slots]')).toHaveCount(0);
    await expect(page.locator('#lobby a[href^="tel:"]')).toBeVisible();
  });
}

for (const size of [
  { width: 390, height: 667 },
  { width: 360, height: 640 },
]) {
  test(`short phone ${size.width}x${size.height}: both buttons visible, nothing overlaps, the sign stays clear`, async ({ browser }) => {
    for (const lang of LANGS) {
      const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await open(page, lang);
      const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
      // The floating WhatsApp button slides down to its hero position after load. Wait for it.
      await expect.poll(async () => size.height - ((await box('[data-wa-float]')).y + (await box('[data-wa-float]')).height), { timeout: 4000 }).toBeLessThan(13);
      const cta = await box('#lobby [data-cta]');
      const route = await box('#lobby [data-route] .btn');
      const addr = await box('#lobby [data-route-address]');
      const tel = await box('#lobby a[href^="tel:"]');
      const wa = await box('[data-wa-float]');
      const hint = await box('.hero__hint');
      const overlap = (p: typeof cta, q: typeof cta) => p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      for (const b of [cta, route, addr, tel]) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(size.width);
        expect(b.y + b.height).toBeLessThanOrEqual(size.height);
      }
      const all = { cta, route, addr, tel, wa, hint };
      const names = Object.keys(all) as (keyof typeof all)[];
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          expect(overlap(all[names[i]], all[names[j]]), `${lang}: ${names[i]} overlaps ${names[j]}`).toBe(false);
        }
      }
      // The sign (bottom of the letters is 140 facade units down) ends above the copy.
      const signBottom = await page.evaluate(() => {
        const f = document.querySelector('[data-facade]')!.getBoundingClientRect();
        return f.top + 140 * Math.max(f.width / 600, f.height / 900);
      });
      const copyTop = (await box('.hero__kicker')).y;
      expect(copyTop, `${lang}: copy starts under the sign`).toBeGreaterThan(signBottom);
      await ctx.close();
    }
  });
}

test('darkness: close to black outside the beam, buttons above every light layer', async ({ page }) => {
  await open(page);
  await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.querySelector('.torch')!).opacity))).toBeGreaterThanOrEqual(0.95);
  const z = await page.evaluate(() => {
    const zi = (sel: string) => Number(getComputedStyle(document.querySelector(sel)!).zIndex);
    const veil = document.querySelector('.hero__veil')!.getBoundingClientRect();
    const cta = document.querySelector('.hero__cta')!.getBoundingClientRect();
    return { torch: zi('.torch'), body: zi('.hero__body'), cta: zi('.hero__cta'), veilBottom: veil.bottom, ctaTop: cta.top, veilShown: getComputedStyle(document.querySelector('.hero__veil')!).display };
  });
  expect(z.cta).toBeGreaterThan(z.body);
  expect(z.cta).toBeGreaterThan(z.torch);
  // The copy has its own veil, and that veil stops above the buttons.
  expect(z.veilShown).toBe('block');
  expect(z.veilBottom).toBeLessThanOrEqual(z.ctaTop);
  // The sections below keep their approved, softer darkness.
  expect(await page.locator('#corridor').getAttribute('data-dark')).toBe('0.2');
  expect(await page.locator('#keys').getAttribute('data-dark')).toBe('0.4');
});

test('touch: the light rests on the sign, then goes to the touch point and follows a drag', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch input is the phone project');
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize()!;

  // Before the first touch: not a centre light. It rests on the upper facade, over the sign.
  await page.waitForTimeout(400);
  const rest = await page.evaluate(() => ({ ...window.__hero.torch }));
  expect(rest.touched).toBe(false);
  const facade = await page.evaluate(() => {
    const f = document.querySelector('[data-facade]')!.getBoundingClientRect();
    const u = Math.max(f.width / 600, f.height / 900);
    return { cx: f.left + f.width / 2, signY: f.top + 92 * u, rowTwoY: f.top + 392 * u };
  });
  expect(Math.abs(rest.x - facade.cx)).toBeLessThan(2);
  expect(rest.y).toBeGreaterThan(facade.signY);
  expect(rest.y).toBeLessThan(facade.rowTwoY);
  expect(rest.y).toBeLessThan(vp.height * 0.36);
  // And it stays there: no drift.
  await page.waitForTimeout(900);
  const rest2 = await page.evaluate(() => ({ ...window.__hero.torch }));
  expect(dist(rest, rest2)).toBeLessThan(0.5);

  // Touch, lower left: both beam layers converge on the touch point.
  const a = { x: 84, y: Math.round(vp.height * 0.76) };
  await touchStart(cdp, a);
  await expect.poll(async () => Math.max(...(await beamCentres(page)).map((c) => dist(c, a))), { timeout: 3000 }).toBeLessThan(3);
  expect((await beamCentres(page)).length).toBe(2);
  expect(await page.evaluate(() => window.__hero.torch.touched)).toBe(true);

  // Drag up and to the right. This is a scroll drag: the page scrolls, the light stays
  // under the finger.
  const b = { x: 300, y: Math.round(vp.height * 0.3) };
  const steps = 12;
  let worst = 0;
  for (let i = 1; i <= steps; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
    await touchMove(cdp, p);
    await page.waitForTimeout(90);
    worst = Math.max(worst, ...(await beamCentres(page)).map((c) => dist(c, p)));
  }
  // Never further behind the finger than a fraction of the beam (its radius is 177 px here).
  expect(worst).toBeLessThan(45);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(40);
  await touchEnd(cdp);

  // After the finger lifts: it eases to rest at the last touch point and stays.
  await expect.poll(async () => Math.max(...(await beamCentres(page)).map((c) => dist(c, b))), { timeout: 3000 }).toBeLessThan(1.5);
  await page.waitForTimeout(1200);
  for (const c of await beamCentres(page)) expect(dist(c, b)).toBeLessThan(1.5);

  // A second touch somewhere else takes it there.
  const c = { x: 310, y: 150 };
  await touchStart(cdp, c);
  await touchEnd(cdp);
  await expect.poll(async () => Math.max(...(await beamCentres(page)).map((q) => dist(q, c))), { timeout: 3000 }).toBeLessThan(1.5);
});

// Samples the letter on every frame for `ms`.
const sampleE = (page: Page, ms: number) =>
  page.evaluate(
    (duration) =>
      new Promise<{ t: number; level: number; slow: number; mode: string; segs: number[]; dom: number[] }[]>((resolve) => {
        const out: { t: number; level: number; slow: number; mode: string; segs: number[]; dom: number[] }[] = [];
        const els = Array.from(document.querySelectorAll<SVGElement>('[data-seg]'));
        const start = performance.now();
        const tick = (now: number) => {
          const e = window.__hero.e;
          out.push({ t: now - start, level: e.level, slow: e.slow, mode: e.mode, segs: e.segs, dom: els.map((el) => Number(el.style.opacity)) });
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

// Longest stretch (ms) for which `pred` holds without a break.
const longest = <T extends { t: number }>(rows: T[], pred: (r: T) => boolean) => {
  let best = 0;
  let from = -1;
  for (const r of rows) {
    if (pred(r)) {
      if (from < 0) from = r.t;
      best = Math.max(best, r.t - from);
    } else from = -1;
  }
  return best;
};

// Swings of at least `min`: a reversal counts once the value has moved `min` the other way.
const swings = (rows: { t: number; v: number }[], min: number) => {
  const times: number[] = [];
  let lo = rows[0].v;
  let hi = rows[0].v;
  let dir = 0;
  for (const r of rows) {
    if (dir >= 0 && r.v <= hi - min) {
      dir = -1;
      lo = r.v;
      times.push(r.t);
    } else if (dir <= 0 && r.v >= lo + min) {
      dir = 1;
      hi = r.v;
      times.push(r.t);
    }
    if (dir >= 0) hi = Math.max(hi, r.v);
    if (dir <= 0) lo = Math.min(lo, r.v);
  }
  return times;
};
const worstPerSecond = (times: number[]) => times.reduce((m, t) => Math.max(m, times.filter((x) => x >= t && x < t + 1000).length), 0);

test('the E: an analog fault, uneven sections, never a two-state toggle and never fully off', async ({ page }) => {
  test.setTimeout(40000);
  const errors = errorsOf(page);
  await open(page);
  await expect.poll(() => page.evaluate(() => typeof window.__hero?.e?.level)).toBe('number');

  // It hangs: rotated from its fixing, and swaying.
  const hang = await page.evaluate(async () => {
    const el = document.querySelector<HTMLElement>('[data-dying]')!;
    const angle = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    };
    const seen: number[] = [];
    for (let i = 0; i < 16; i++) {
      seen.push(angle());
      await new Promise((r) => setTimeout(r, 120));
    }
    return { min: Math.min(...seen), max: Math.max(...seen), animation: getComputedStyle(el).animationName };
  });
  expect(hang.min).toBeGreaterThan(5);
  expect(hang.max).toBeLessThan(13);
  expect(hang.max - hang.min).toBeGreaterThan(0.3);
  expect(hang.animation).not.toBe('none');

  // Normal running, 6 seconds.
  const run = await sampleE(page, 6000);
  expect(run.length).toBeGreaterThan(120);
  // Never fully off.
  expect(Math.min(...run.map((r) => r.level))).toBeGreaterThan(0.03);
  expect(Math.min(...run.flatMap((r) => r.dom))).toBeGreaterThan(0.1);
  // Not a toggle: the level visits many values, and no two of them hold most of the time.
  const bins = new Map<number, number>();
  for (const r of run) bins.set(Math.round(r.level * 25), (bins.get(Math.round(r.level * 25)) ?? 0) + 1);
  expect(bins.size).toBeGreaterThanOrEqual(6);
  const top2 = [...bins.values()].sort((p, q) => q - p).slice(0, 2).reduce((p, q) => p + q, 0);
  expect(top2 / run.length).toBeLessThan(0.8);
  // What reaches the screen changes too: each section takes many different opacities.
  for (let i = 0; i < 4; i++) expect(new Set(run.map((r) => r.dom[i].toFixed(2))).size).toBeGreaterThan(8);
  // Uneven partial glow: the sections do not move as one.
  const spread = run.reduce((s, r) => s + (Math.max(...r.segs) - Math.min(...r.segs)), 0) / run.length;
  expect(spread).toBeGreaterThan(0.25);

  // Near-death and recovery, forced so the test does not wait for chance.
  await page.evaluate(() => window.__hero.e.force('dying'));
  const death = await sampleE(page, 7000);
  const modes = new Set(death.map((r) => r.mode.replace('+arc', '')));
  for (const m of ['dying', 'ember', 'recover', 'run']) expect(modes.has(m), `mode ${m} seen`).toBe(true);
  const emberMs = longest(death, (r) => r.mode.startsWith('ember'));
  expect(emberMs).toBeGreaterThan(900);
  expect(emberMs).toBeLessThan(3200);
  // A dim ember, but an ember: not off, and never dark for long.
  const ember = death.filter((r) => r.mode.startsWith('ember'));
  expect(Math.max(...ember.map((r) => r.level))).toBeLessThan(0.25);
  expect(Math.min(...death.map((r) => r.level))).toBeGreaterThan(0.03);
  expect(longest(death, (r) => r.level < 0.2)).toBeLessThan(4200);
  // The collapse and the restrike pass through intermediate levels.
  const mid = death.filter((r) => /dying|recover/.test(r.mode) && r.level > 0.2 && r.level < 0.6).length;
  expect(mid).toBeGreaterThan(8);
  // It comes back.
  const tail = death.filter((r) => r.mode.startsWith('run'));
  expect(Math.max(...tail.map((r) => r.level))).toBeGreaterThan(0.5);

  // Large-area safety: what the fog and the halo follow is the low-passed level. Even
  // through a death and a restrike it never swings by 10% more than 3 times in a second.
  const slow = [...run, ...death.map((r) => ({ ...r, t: r.t + 10000 }))].map((r) => ({ t: r.t, v: r.slow }));
  expect(worstPerSecond(swings(slow, 0.1))).toBeLessThanOrEqual(3);
  // The same measure does see the raw flicker of the letter itself, so it is not blind.
  const raw = death.map((r) => ({ t: r.t, v: r.segs[3] }));
  expect(swings(raw, 0.1).length).toBeGreaterThan(swings(death.map((r) => ({ t: r.t, v: r.slow })), 0.1).length);
  expect(errors).toEqual([]);
});

test('the E has three distinct held states for screenshots', async ({ page }) => {
  await open(page);
  await expect.poll(() => page.evaluate(() => typeof window.__hero?.e?.hold)).toBe('function');
  const read = async (pose: string) => {
    await page.evaluate((p) => window.__hero.e.hold(p), pose);
    await page.waitForTimeout(150);
    return page.evaluate(() => ({ mode: window.__hero.e.mode, segs: window.__hero.e.segs, level: window.__hero.e.level }));
  };
  const normal = await read('normal');
  const arc = await read('arc');
  const ember = await read('ember');
  expect(normal.mode).toBe('hold:normal');
  expect(arc.segs[3]).toBeGreaterThan(normal.segs[3]);
  expect(ember.level).toBeLessThan(0.15);
  expect(ember.level).toBeGreaterThan(0.03);
  expect(normal.level).toBeGreaterThan(0.5);
});

test('lightning: none before 12 s, then one soft flash that decays, never a double', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await expect.poll(() => page.evaluate(() => typeof window.__hero?.storm?.count)).toBe('number');
  // fastForward jumps the clock and fires each due timer once, without running every frame.
  await page.clock.fastForward(11000);
  expect(await page.evaluate(() => window.__hero.storm.count)).toBe(0);
  await page.clock.fastForward(7000);
  expect(await page.evaluate(() => window.__hero.storm.count)).toBe(1);
  // The next one is at least 40 s away.
  await page.clock.fastForward(30000);
  expect(await page.evaluate(() => window.__hero.storm.count)).toBe(1);
  // And at most 90 s away.
  await page.clock.fastForward(62000);
  expect(await page.evaluate(() => window.__hero.storm.count)).toBe(2);
});

test('lightning: the flash has a single peak and reveals the watchers', async ({ page }) => {
  await open(page);
  await expect.poll(() => page.evaluate(() => typeof window.__hero?.storm?.strike)).toBe('function');
  const storm = page.locator('[data-storm]');
  expect(Number(await storm.evaluate((el) => getComputedStyle(el).opacity))).toBe(0);
  expect(await storm.locator('ellipse').count()).toBeGreaterThan(8);
  const curve = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const el = document.querySelector('[data-storm]')!;
        const out: number[] = [];
        window.__hero.storm.strike();
        const start = performance.now();
        const tick = (now: number) => {
          out.push(Number(getComputedStyle(el).opacity));
          if (now - start < 1500) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(Math.max(...curve)).toBeGreaterThan(0.6);
  expect(curve[curve.length - 1]).toBe(0);
  // One rise, one fall: after the peak the opacity never climbs again.
  const peak = curve.indexOf(Math.max(...curve));
  for (let i = peak + 1; i < curve.length; i++) expect(curve[i]).toBeLessThanOrEqual(curve[i - 1] + 0.001);
  for (let i = 1; i <= peak; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] - 0.001);
  await expect.poll(() => page.evaluate(() => document.getElementById('lobby')!.classList.contains('is-strike'))).toBe(false);
});

test('the guest in the lit room is there on one pass of the light and gone on the next', async ({ page, isMobile }) => {
  test.skip(isMobile, 'driven with the cursor on the desktop project');
  await open(page);
  await expect.poll(() => page.evaluate(() => window.__hero?.figure?.state)).toBe('far');
  const box = (await page.locator('[data-figure]').boundingBox())!;
  const room = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const away = { x: 120, y: 760 };
  const state = () => page.evaluate(() => window.__hero.figure.state);
  const lit = () => page.evaluate(() => window.__hero.figure.lit);
  const seen: string[] = [];
  for (let pass = 0; pass < 4; pass++) {
    await page.mouse.move(room.x, room.y, { steps: 5 });
    await expect.poll(lit, { timeout: 3000 }).toBe(true);
    const before = await state();
    seen.push(before);
    // Never changes while the light is on it.
    await page.waitForTimeout(1100);
    expect(await state()).toBe(before);
    await page.mouse.move(away.x, away.y, { steps: 5 });
    await expect.poll(lit, { timeout: 3000 }).toBe(false);
    await page.waitForTimeout(1000);
  }
  expect(seen).toEqual(['far', 'gone', 'gone', 'near']);
  await expect(page.locator('[data-figure]')).toHaveAttribute('data-figure', 'gone');
  expect(Number(await page.locator('[data-figure]').evaluate((el) => getComputedStyle(el).opacity))).toBe(0);
});

test('off screen the hero stands still: rain stops, the sway pauses', async ({ page }) => {
  await open(page);
  await expect.poll(() => page.evaluate(() => window.__hero?.rain?.running)).toBe(true);
  expect(await page.evaluate(() => window.__hero.rain.drops)).toBeGreaterThan(10);
  await page.evaluate(() => window.scrollTo(0, document.getElementById('lobby')!.offsetHeight + window.innerHeight * 2));
  await expect.poll(() => page.evaluate(() => window.__hero.rain.running), { timeout: 4000 }).toBe(false);
  expect(await page.evaluate(() => document.getElementById('lobby')!.classList.contains('is-off'))).toBe(true);
  expect(await page.locator('[data-dying]').evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('paused');
  // The letter's loop is parked too: its level stops moving.
  const frozen = await page.evaluate(async () => {
    const a = window.__hero.e.level;
    await new Promise((r) => setTimeout(r, 600));
    return a === window.__hero.e.level;
  });
  expect(frozen).toBe(true);
});

for (const lang of LANGS) {
  test(`${lang}: reduced motion gives a static, readable hero: no flicker, no rain, no lightning`, async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = errorsOf(page);
    await open(page, lang);
    await page.waitForTimeout(500);
    // No flashlight, no veil, no rain canvas, no spark canvas.
    for (const sel of ['.torch', '.hero__veil', '[data-rain]', '[data-sparks]']) await expect(page.locator(sel).first()).toBeHidden();
    // No loops were started.
    const hooks = await page.evaluate(() => ({ e: typeof window.__hero?.e, rain: typeof window.__hero?.rain, storm: typeof window.__hero?.storm }));
    expect(hooks).toEqual({ e: 'undefined', rain: 'undefined', storm: 'undefined' });
    // The E is still, leaning from its fixing, partly lit, and it does not change.
    const read = () =>
      page.evaluate(() => {
        const e = document.querySelector<HTMLElement>('[data-dying]')!;
        const m = new DOMMatrixReadOnly(getComputedStyle(e).transform);
        return {
          angle: (Math.atan2(m.b, m.a) * 180) / Math.PI,
          animation: getComputedStyle(e).animationName,
          segs: Array.from(document.querySelectorAll<SVGElement>('[data-seg], [data-core]')).map((s) => getComputedStyle(s).opacity),
          storm: getComputedStyle(document.querySelector('[data-storm]')!).opacity,
          strike: document.getElementById('lobby')!.classList.contains('is-strike'),
        };
      });
    const first = await read();
    await page.waitForTimeout(1500);
    const second = await read();
    expect(second).toEqual(first);
    expect(first.animation).toBe('none');
    expect(first.angle).toBeGreaterThan(5);
    expect(first.segs.length).toBe(8);
    expect(Math.min(...first.segs.map(Number))).toBeGreaterThan(0.05);
    expect(new Set(first.segs).size).toBeGreaterThan(3);
    expect(first.storm).toBe('0');
    // Everything can be read and used.
    for (const sel of ['.hero__title', '.hero__line', '.hero__sub', '#lobby [data-cta]', '#lobby [data-route]', '#lobby [data-route-address]']) {
      const el = page.locator(sel).first();
      await expect(el).toBeVisible();
      expect(Number(await el.evaluate((n) => getComputedStyle(n).opacity))).toBeGreaterThan(0.8);
    }
    await expect(page.locator('[data-figure]')).toHaveAttribute('data-figure', 'far');
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
