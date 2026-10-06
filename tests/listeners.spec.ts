// Nothing on the page may hold a scroll back. A touch or wheel listener that is not passive
// makes the browser wait for the page's JavaScript before it may move the page, and one that
// calls preventDefault stops it. So: every touch and wheel listener the page ever registers is
// recorded, with its options, from before the first script runs, while the whole page is used
// (the hero, the corridor with the page held under its clip, the booking dialog, the floating
// menu, the footer), and each one must have been registered with `passive: true`. Runs on
// phone, desktop and WebKit.
import { test, expect } from '@playwright/test';
import { again, expectHeld, expectRest, fling, gesturesOf, jumpTo, open, primed, replay, stage, topOf } from './corridor.util';

const TYPES = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel', 'mousewheel'];

interface Seen {
  type: string;
  passive: unknown;
  target: string;
  where: string;
}

test('no touch or wheel listener on the page is ever registered without passive: true, and none prevents a scroll', async ({ page }) => {
  test.slow();
  await page.addInitScript((types) => {
    const seen: Seen[] = [];
    const prevented: string[] = [];
    (window as unknown as { __listeners: Seen[]; __prevented: string[] }).__listeners = seen;
    (window as unknown as { __prevented: string[] }).__prevented = prevented;
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      if (types.includes(type)) {
        const name = this === window ? 'window' : this === document ? 'document' : this instanceof Element ? `${this.tagName.toLowerCase()}${this.id ? `#${this.id}` : ''}${typeof this.className === 'string' && this.className ? `.${this.className.split(' ')[0]}` : ''}` : String(this);
        const passive = typeof options === 'object' && options !== null ? options.passive : undefined;
        // where it was registered: the first frame of the stack that is not this wrapper
        const where = (new Error().stack ?? '').split('\n').slice(2, 3).join('').trim().slice(0, 160);
        seen.push({ type, passive, target: name, where });
      }
      return add.call(this, type, listener, options);
    };
    // and nothing may cancel one of these events, however it was registered
    const prevent = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function (this: Event) {
      if (types.includes(this.type)) prevented.push(this.type);
      return prevent.call(this);
    };
  }, TYPES);

  await open(page, { rate: 8 });
  await page.waitForLoadState('load');
  const vp = page.viewportSize()!;
  const touch = Boolean(test.info().project.use.hasTouch);

  // the hero: move, tap, and the first input that starts the lazy parts (the fog, the corridor)
  await page.mouse.move(vp.width / 2, vp.height / 2);
  if (touch) await page.touchscreen.tap(vp.width / 2, vp.height * 0.4);
  else await page.mouse.click(vp.width / 2, vp.height * 0.4);
  await page.waitForTimeout(700);

  // the corridor: caught by a real scroll and held while its clip plays (the page may not hold
  // a scroll back with a listener there either), a second gesture made on the held page, the
  // clip played out, and played again by its button
  const top = await topOf(page);
  // (Playwright's phone WebKit makes neither a finger swipe nor a wheel turn: keys there)
  const kind = test.info().project.use.browserName === 'webkit' ? 'key' : gesturesOf(test.info())[0];
  if ((await primed(page)) !== 'none') {
    await jumpTo(page, 0);
    await fling(page, kind);
    await expectHeld(page);
    if (kind === 'wheel') await page.waitForTimeout(1200);
    if (kind === 'key') await page.keyboard.press('Escape');
    else await again(page, kind, -1);
    await expect(stage(page)).toHaveAttribute('data-state', 'idle', { timeout: 30000 });
    await jumpTo(page, top);
    await expectRest(page);
    await replay(page).click();
    await expectHeld(page);
    await expect(stage(page)).toHaveAttribute('data-end', /ended|watchdog/, { timeout: 30000 });
  }

  // the rest of the page, top to bottom, so everything that waits for its section has started
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = top + vp.height + 40; y <= height; y += vp.height * 0.7) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);

  // the floating menu
  const ask = page.locator('[data-float-toggle]');
  await page.evaluate(() => window.scrollTo(0, document.getElementById('file')!.offsetTop + 80));
  await expect(ask).toBeVisible();
  await ask.click();
  await expect(page.locator('[data-float-menu]')).toBeVisible();
  await page.keyboard.press('Escape');

  // the booking dialog: fill the card, open it, scroll inside it, close it. The widget is
  // somebody else's page and gets a local answer: the dialog around it is ours.
  await page.route('https://widget.easyweek.io/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title><body style="height:3000px">stub' }));
  const form = page.locator('[data-checkin]');
  await form.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await form.locator('input[name="team"]').fill('4');
  await form.locator('input[name="level"][value="none"]').check({ force: true });
  await form.locator('[data-book]').click();
  const dialog = page.locator('[data-booking]');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (!test.info().project.use.isMobile) await page.mouse.wheel(0, 200);
  else await page.touchscreen.tap(box.x + box.width / 2, box.y + 30);
  await page.waitForTimeout(200);
  await page.locator('[data-booking-close]').click();
  await expect(dialog).toBeHidden();
  await expect(stage(page)).toHaveAttribute('data-state', 'idle');

  const seen = await page.evaluate(() => (window as unknown as { __listeners: Seen[] }).__listeners);
  const prevented = await page.evaluate(() => (window as unknown as { __prevented: string[] }).__prevented);
  // the audit saw the page's listeners (the first-input ones at least), or it proves nothing
  expect(seen.length, 'touch and wheel listeners recorded').toBeGreaterThanOrEqual(4);
  // Playwright itself adds touch listeners while it clicks (its hit-target check). They are the
  // test tool's, not the page's.
  const own = seen.filter((l) => !/HitTargetInterceptor/i.test(l.where));
  const blocking = own.filter((l) => l.passive !== true);
  expect(blocking, `listeners registered without passive: true, of ${own.length} recorded`).toEqual([]);
  expect(prevented, 'touch or wheel events whose default was prevented').toEqual([]);
  console.log(`LISTENERS ${JSON.stringify({ project: test.info().project.name, total: own.length, toolOwn: seen.length - own.length, byType: Object.fromEntries(TYPES.map((t) => [t, own.filter((l) => l.type === t).length]).filter(([, n]) => n)), targets: [...new Set(own.map((l) => `${l.target} ${l.type}`))] })}`);
});
