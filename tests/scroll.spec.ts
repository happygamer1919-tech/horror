// Scrolling: the browser's own, on every device; in-page links glide.
// Performance itself is measured by `npm run test:perf` (tests/perf), not here. The corridor,
// the one place that holds the page, is in tests/corridor.spec.ts, the audit of every touch
// and wheel listener in tests/listeners.spec.ts.
import { test, expect, type Page } from '@playwright/test';

const BASE = '/horror';
const LANGS = ['ro', 'ru', 'en'] as const;

const open = async (page: Page, lang: string = 'ro') => {
  await page.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
  await page.goto(`${BASE}/${lang}/`);
};
// The smooth-scroll library the site used on pointer devices marked the root element.
const hasLenis = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('lenis'));
// Where the top edge of an element sits, in viewport pixels, once the page stops moving.
const settledTop = async (page: Page, selector: string) => {
  let last = NaN;
  await expect
    .poll(
      async () => {
        const now = await page.locator(selector).evaluate((el) => Math.round(el.getBoundingClientRect().top));
        const still = now === last;
        last = now;
        return still;
      },
      { timeout: 8000, intervals: [250] },
    )
    .toBe(true);
  return last;
};

test('every device scrolls natively: no smooth scroll library is loaded', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await open(page);
  // Give a late import every chance to show up before saying it did not.
  await page.waitForLoadState('networkidle');
  await page.mouse.move(200, 300);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(400);
  expect(await hasLenis(page)).toBe(false);
  expect(requested.filter((u) => /lenis/i.test(u))).toEqual([]);
  // and a scripted scroll is where it was put, at once: nothing eases it
  expect(await page.evaluate(() => window.scrollY)).toBe(600);
});

test('nothing can hold a scroll back: the browser itself reports no blocking touch or wheel listener', async ({ page, isMobile, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'asked of the browser through CDP');
  await open(page);
  await page.waitForLoadState('networkidle');
  // First input starts the lazy parts (fog), so their listeners are counted too.
  if (isMobile) await page.touchscreen.tap(195, 300);
  else await page.mouse.click(300, 300);
  await page.waitForTimeout(500);
  // A listener registered with passive: false makes the browser wait for page script before
  // it may scroll. Ask the browser itself which listeners exist on the scroll path.
  const cdp = await context.newCDPSession(page);
  const blocking: string[] = [];
  for (const expression of ['window', 'document', 'document.documentElement', 'document.body']) {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId! });
    for (const l of listeners) {
      if (['touchstart', 'touchmove', 'wheel', 'mousewheel'].includes(l.type) && !l.passive) blocking.push(`${expression} ${l.type}`);
    }
  }
  expect(blocking).toEqual([]);
});

for (const lang of LANGS) {
  test(`${lang}: the Check in button lands on the registration card, below the header`, async ({ page }) => {
    await open(page, lang);
    await page.locator('[data-cta]').click();
    await expect(page.locator('#checkin-title')).toBeInViewport({ timeout: 8000 });
    const top = await settledTop(page, '#checkin');
    const header = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
    // The section starts right under the fixed header, not behind it and not far below it.
    expect(top).toBeGreaterThanOrEqual(header - 2);
    expect(top).toBeLessThanOrEqual(header + 2);
    expect(new URL(page.url()).hash).toBe('#checkin');
  });
}

test('in-page links glide and leave no smooth behaviour behind', async ({ page, browserName }) => {
  await open(page);
  // Sample the scroll position while the link is being followed: a jump has no steps in between.
  // And note what the root's scroll behaviour was at each of them.
  await page.evaluate(() => {
    const w = window as unknown as { __ys: number[]; __behaviours: string[] };
    w.__ys = [];
    w.__behaviours = [];
    window.addEventListener(
      'scroll',
      () => {
        w.__ys.push(window.scrollY);
        w.__behaviours.push(getComputedStyle(document.documentElement).scrollBehavior);
      },
      { passive: true },
    );
  });
  await page.locator('[data-cta]').click();
  await expect(page.locator('#checkin-title')).toBeInViewport({ timeout: 8000 });
  await settledTop(page, '#checkin');
  const { steps, behaviours } = await page.evaluate(() => {
    const w = window as unknown as { __ys: number[]; __behaviours: string[] };
    return { steps: new Set(w.__ys).size, behaviours: w.__behaviours };
  });
  expect(behaviours[0], 'the page travels with smooth behaviour').toBe('smooth');
  // WebKit on a CI runner (its Linux build, and a macOS runner without a GPU as well) draws
  // this page a few times a second: a glide of a third of a second is two or three positions
  // there, sometimes one. Everywhere else the glide itself is counted.
  if (!(browserName === 'webkit' && (process.platform === 'linux' || process.env.CI))) expect(steps).toBeGreaterThan(5);
  // Once it has arrived, scripted scrolling is immediate again.
  await expect.poll(() => page.evaluate(() => document.documentElement.style.scrollBehavior), { timeout: 4000 }).toBe('');
  await page.evaluate(() => window.scrollTo(0, 500));
  expect(await page.evaluate(() => window.scrollY)).toBe(500);
});

test('the Book bar and the back-to-top link work with native scroll', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch only');
  await open(page);
  await page.evaluate(() => {
    const el = document.querySelector('#file') as HTMLElement;
    window.scrollTo(0, el.offsetTop + 100);
  });
  const book = page.locator('[data-sticky] a[href="#checkin"]');
  await expect(book).toBeVisible();
  await book.click();
  await expect(page.locator('#checkin-title')).toBeInViewport({ timeout: 8000 });
  await settledTop(page, '#checkin');
  await page.locator('footer a[href="#top"]').click();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 }).toBe(0);
});

test('reduced motion: links jump', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/ro/`);
  await page.waitForLoadState('networkidle');
  expect(await hasLenis(page)).toBe(false);
  await page.locator('[data-cta]').click();
  await expect(page.locator('#checkin-title')).toBeInViewport({ timeout: 4000 });
  expect(await page.evaluate(() => document.documentElement.style.scrollBehavior)).toBe('');
  await context.close();
});

test('on touch the fog waits for the page to rest before it starts', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile, 'touch only');
  // The premise is a scroll event at least every 100 ms. WebKit's Linux build draws this page
  // about ten times a second on a CI runner and hands out scroll events as it draws: the gaps
  // grow past the fog's own wait, and the test would be measuring the machine.
  test.skip(browserName === 'webkit' && process.platform === 'linux', 'scroll events come too far apart on this build to keep the page moving');
  const fogRequests: number[] = [];
  page.on('request', (r) => {
    if (/\/fog\.[^/]*\.js$/.test(r.url())) fogRequests.push(Date.now());
  });
  await open(page);
  // Keep the page moving for a second and a half: a scroll event at least every 100 ms.
  const scrolling = Date.now();
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, 40));
    await page.waitForTimeout(100);
  }
  const stopped = Date.now();
  expect(stopped - scrolling).toBeGreaterThan(1400);
  expect(fogRequests.filter((t) => t < stopped)).toEqual([]);
  // At rest it rolls in.
  await expect.poll(() => fogRequests.length, { timeout: 5000 }).toBe(1);
});

test('on a pointer device the fog starts with the first sign of life', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer only');
  const fogRequests: string[] = [];
  page.on('request', (r) => {
    if (/\/fog\.[^/]*\.js$/.test(r.url())) fogRequests.push(r.url());
  });
  await open(page);
  await page.mouse.move(300, 300);
  await expect.poll(() => fogRequests.length, { timeout: 2000 }).toBe(1);
});
