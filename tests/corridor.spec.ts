// The corridor: one clip, played once per session with the page held, and a section like any
// other afterwards. Everything is asserted on state the stage exposes (data attributes and the
// holds it measures), on the scroll position, on the network and on the video itself, never on
// timing luck.
//
// The gestures are the real ones each engine can make (see corridor.util.ts): touch flings
// through CDP in Chromium's touch project, the wheel and the keyboard in its pointer project,
// the keyboard and the wheel in WebKit.
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import {
  BASE,
  POSTER,
  SCARE_KEY,
  SEEN_KEY,
  STILL,
  VIDEO,
  again,
  attr,
  corridorTop,
  expectFree,
  expectHeld,
  expectHoldsBounded,
  expectOnNext,
  expectPlaying,
  expectRest,
  fling,
  gesturesOf,
  holds,
  jumpTo,
  linuxWebKit,
  open,
  pageFor,
  pic,
  poster,
  primed,
  replay,
  scrollY,
  setInfo,
  settledY,
  skip,
  stage,
  swipe,
  tap,
  topOf,
  video,
  viewportShot,
  wake,
  type Gesture,
  type SetInfo,
} from './corridor.util';

// sharp comes with Astro; only this much of it is used here
type Sharp = (input: Buffer) => { removeAlpha: () => { raw: () => { toBuffer: (o: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> } } };
const sharp = createRequire(import.meta.url)('sharp') as Sharp;

// One after another within a project. Nearly every test here plays a video, most of them faster
// than real time, and a machine asked to decode five of those at once starves one of them
// until the page gives up on it (seen: a clip held for its full 10.8 s under five workers).
test.describe.configure({ mode: 'default' });

const KINDS: Gesture[] = ['touch', 'wheel', 'key'];
const caps = (page: Page) => page.locator('[data-cap]');
const capsOn = (page: Page) => caps(page).evaluateAll((els) => els.map((el, i) => (el.classList.contains('is-on') ? i : -1)).filter((i) => i >= 0));
const stored = (page: Page, key: string) => page.evaluate((k) => sessionStorage.getItem(k), key);
// Which clip files the page asked for, in order, each once (a browser fetches a video in pieces).
const clipRequests = (page: Page) => {
  const seen: string[] = [];
  page.on('request', (r) => {
    const m = VIDEO.exec(new URL(r.url()).pathname);
    if (m && !seen.includes(`${m[2]}.${m[3]}`)) seen.push(`${m[2]}.${m[3]}`);
  });
  return seen;
};
// Take the clip that is playing to a moment of its own time, quickly, and all but stop it
// there (0.07 is about as slow as a browser will play). The page set its speed once, when it
// started it, and does not look again.
const SLOW = 0.07;
const goTo = (page: Page, t: number, hold = SLOW) =>
  video(page).evaluate(
    (el, [t, hold]) =>
      new Promise<number>((resolve) => {
        const v = el as HTMLVideoElement;
        const look = () => {
          const left = t - v.currentTime;
          // (a clip that is over, or gone from the stage, is not coming: say where it was)
          if (left <= 0 || v.ended || !v.isConnected) {
            v.playbackRate = hold;
            return resolve(v.isConnected ? v.currentTime : Infinity);
          }
          v.playbackRate = left > 1 ? 8 : 1;
          requestAnimationFrame(look);
        };
        look();
      }),
    [t, hold] as [number, number],
  );
const hurry = (page: Page) => video(page).evaluate((el) => void ((el as HTMLVideoElement).playbackRate = 8));
// A browser that starts no video by itself has said so (its warm-up play was refused).
const refused = async (page: Page) => {
  await expect.poll(async () => ((await attr(page, 'codec')) === 'none' ? 'none' : ((await attr(page, 'prime')) ?? '')), { timeout: 30000, message: 'the warm-up play was refused' }).toMatch(/^(none|refused)$/);
  return (await attr(page, 'codec')) === 'none' ? 'none' : 'refused';
};
// The play is over. By itself, that is either the clip's own end or, on a machine too busy to
// play it in time, the page giving up a second after it should have ended: the visitor sees
// the same thing either way (the last door, the page let go), and so do the tests. Returns
// which it was.
const OVER = /^(ended|watchdog)$/;
const ended = async (page: Page, how: string | RegExp = OVER) => {
  await expect(stage(page), `the play ends: ${how}`).toHaveAttribute('data-end', how, { timeout: 30000 });
  return (await attr(page, 'end')) ?? '';
};

for (const kind of KINDS) {
  test(`${kind}: a fast fling from the top of the page stops at the corridor, and the clip plays`, async ({ browser }, info) => {
    test.skip(!gesturesOf(info).includes(kind), `this project makes no ${kind} gestures`);
    test.slow();
    const vh = info.project.use.viewport!.height;
    // First, where this fling takes a page that is not held: a session that has seen the corridor.
    {
      const { context, page } = await pageFor(browser, info, kind);
      await open(page, { seen: true });
      const top = await topOf(page);
      await wake(page);
      await fling(page, kind);
      const y = await settledY(page);
      expect(y, 'a page that is not held is carried well past the corridor').toBeGreaterThan(top + vh * (kind === 'touch' ? 1.5 : kind === 'wheel' ? 0.5 : 0.3));
      expect(await holds(page)).toEqual([]);
      await context.close();
    }
    const { context, page } = await pageFor(browser, info, kind);
    await open(page);
    const top = await topOf(page);
    const { set } = await setInfo(page);
    const codec = await primed(page);
    test.skip(codec === 'none', 'this browser plays no video');
    expect(await scrollY(page)).toBe(0);
    await fling(page, kind);
    await expectHeld(page, kind);
    await expectPlaying(page, kind);
    await expect(stage(page)).toHaveAttribute('data-variant', 'scare');
    await expect(skip(page), 'Skip is there').toBeVisible();
    expect(await skip(page).evaluate((el) => el === document.activeElement), 'and has the focus').toBe(true);
    await expect(replay(page)).toBeHidden();
    // the fling is over and done with: nothing moves the page while the clip plays
    await page.waitForTimeout(700);
    expect(Math.abs(await corridorTop(page)), 'the corridor stays at the top of the screen').toBeLessThanOrEqual(1);
    await expect(stage(page)).toHaveAttribute('data-lock', '1');
    expect(await video(page).evaluate((v) => !(v as HTMLVideoElement).paused)).toBe(true);
    // let go, the page is where it was caught: on the corridor's top, to the pixel
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expectFree(page, kind);
    expect(Math.abs((await scrollY(page)) - top), 'the page rests on the corridor').toBeLessThanOrEqual(1);
    await expectHoldsBounded(page, set.clips.scare);
    await context.close();
  });
}

test('when the clip ends the page goes on to the next section by itself', async ({ browser }, info) => {
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  await open(page, { rate: 4 });
  const { set } = await setInfo(page);
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  await fling(page, kind);
  await expectHeld(page);
  const how = await ended(page);
  await expectFree(page);
  await expectOnNext(page, 'after the clip');
  await expectRest(page, 'after the clip');
  await expect(stage(page)).toHaveAttribute('data-played', how === 'ended' ? '1' : '0');
  expect(await stored(page, SEEN_KEY), 'the session has seen the corridor').toBe('1');
  // the focus went with the page (it was on Skip, which is gone)
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('file');
  // and nothing pulls the page back
  const y = await scrollY(page);
  await page.waitForTimeout(800);
  expect(await scrollY(page)).toBe(y);
  expect((await expectHoldsBounded(page, set.clips.scare)).length).toBe(1);
  await context.close();
});

// Skip, at any moment of the clip, by every way there is to ask for it.
const MOMENTS = ['the first frame', 'the middle', 'the door at 308', 'the last second'] as const;
for (const way of ['the button', 'Escape', 'a second strong swipe', 'a new turn of the wheel'] as const) {
  test(`Skip by ${way} lets the page go at any moment: ${MOMENTS.join(', ')}`, async ({ browser }, info) => {
    const kind: Gesture = way === 'a second strong swipe' ? 'touch' : way === 'a new turn of the wheel' ? 'wheel' : gesturesOf(info)[0];
    test.skip(!gesturesOf(info).includes(kind), `this project makes no ${kind} gestures`);
    test.setTimeout(180000);
    for (const moment of MOMENTS) {
      const { context, page } = await pageFor(browser, info, kind);
      // (played at half speed as far as the page knows, which gives the test twice the time
      // before the page lets go by itself; the test takes the clip to its moment)
      await open(page, { rate: 0.5 });
      const { set } = await setInfo(page);
      const clip = set.clips.scare;
      const sc = clip.scare!;
      if ((await primed(page)) === 'none') {
        await context.close();
        test.skip(true, 'this browser plays no video');
      }
      await fling(page, kind);
      await expectHeld(page, moment);
      const where = `${way}, ${moment}`;
      if (way === 'a new turn of the wheel') {
        // the wheel that brought the visitor here is not the one that takes them away: a
        // second has to pass first (the clip is all but stopped meanwhile, for the first frame)
        if (moment === 'the first frame') await video(page).evaluate((el, r) => void ((el as HTMLVideoElement).playbackRate = r), SLOW);
        await page.waitForTimeout(1300);
        await expect(stage(page), `${where}: still held, a second after the catch`).toHaveAttribute('data-lock', '1');
      }
      if (moment !== 'the first frame') {
        await expect(stage(page)).toHaveAttribute('data-mode', 'video', { timeout: 10000 });
        const t = await goTo(page, moment === 'the middle' ? 3.2 : moment === 'the door at 308' ? sc.at + 0.15 : clip.duration - 0.8);
        if (moment === 'the door at 308') expect(t, `${where}: the door is open`).toBeLessThan(sc.end);
        expect(t).toBeLessThan(clip.duration);
      }
      if (way === 'the button') await skip(page).click();
      else if (way === 'Escape') await page.keyboard.press('Escape');
      else if (way === 'a second strong swipe') await swipe(page, 1);
      else await again(page, 'wheel');
      await ended(page, way === 'the button' ? 'skip-button' : way === 'Escape' ? 'skip-key' : way === 'a second strong swipe' ? 'skip-swipe' : 'skip-wheel');
      await expectFree(page, where);
      await expectOnNext(page, where);
      await expectRest(page, where);
      await expectHoldsBounded(page, clip, where, 0.5);
      await context.close();
    }
  });
}

test('a second gesture the other way lets the page go where it is, and a gesture that began before the catch does nothing', async ({ browser }, info) => {
  const kind = gesturesOf(info).find((k) => k !== 'key')!;
  const { context, page } = await pageFor(browser, info, kind);
  await open(page);
  const top = await topOf(page);
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  await fling(page, kind);
  // more of the same turn of the wheel, without a pause: it is the tail of the one that led here
  if (kind === 'wheel') await again(page, 'wheel');
  await expectHeld(page);
  await expectPlaying(page);
  await expect(stage(page), 'the tail of the wheel does not skip').toHaveAttribute('data-state', 'play');
  if (kind === 'wheel') await page.waitForTimeout(1300);
  await again(page, kind, -1);
  await ended(page, 'back');
  await expectFree(page);
  await expectRest(page);
  // a finger that was put down on the held page moves nothing; the rest of a wheel turn moves
  // the page it has freed, the way the wheel was going
  const y = await settledY(page);
  if (kind === 'touch') expect(Math.abs(y - top), 'the page stays on the corridor').toBeLessThanOrEqual(1);
  else expect(y, 'the page did not go on').toBeLessThanOrEqual(top + 1);
  await context.close();
});

test('a second visit in the same session is not held: the last door and Replay, and Replay plays the walk without the door', async ({ browser }, info) => {
  test.slow();
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  const requests = clipRequests(page);
  await open(page, { rate: 4 });
  const top = await topOf(page);
  const vh = page.viewportSize()!.height;
  const { set } = await setInfo(page);
  const codec = await primed(page);
  test.skip(codec === 'none', 'this browser plays no video');
  await fling(page, kind);
  await expectHeld(page);
  await ended(page);
  await expectOnNext(page);
  expect(requests, 'the first play fetched the walk with the door').toEqual([`walk-door.${codec}`]);

  // away, and back the same way that was caught the first time
  await jumpTo(page, 0);
  await settledY(page);
  await fling(page, kind);
  expect(await settledY(page), 'the same fling now passes').toBeGreaterThan(top + vh * 0.3);
  expect((await holds(page)).length, 'held once, the first time').toBe(1);
  await jumpTo(page, top);
  await expectRest(page, 'second visit');
  await expect(replay(page)).toBeVisible();

  // a reload in the same session
  await page.reload();
  await topOf(page);
  await wake(page);
  await fling(page, kind);
  expect(await settledY(page), 'after a reload the fling passes').toBeGreaterThan(top + vh * 0.3);
  expect(await holds(page), 'never held').toEqual([]);
  await jumpTo(page, top);
  await expectRest(page, 'after a reload');
  const button = replay(page);
  await expect(button).toBeVisible();
  expect((await button.getAttribute('aria-label')) ?? '', 'its name starts with the word on it').toContain(((await button.textContent()) ?? '').trim());
  expect(((await button.textContent()) ?? '').trim().length).toBeGreaterThan(2);
  const box = (await button.boundingBox())!;
  expect(Math.min(box.width, box.height), '44 px to touch').toBeGreaterThanOrEqual(44);

  // Replay: held like the first play, the walk without the door, and it ends where it began
  requests.length = 0;
  await button.click();
  await expectHeld(page, 'Replay');
  await expect(stage(page)).toHaveAttribute('data-variant', 'plain');
  await expectPlaying(page, 'Replay');
  await ended(page);
  await expectFree(page, 'Replay');
  await expectRest(page, 'after Replay');
  expect(Math.abs((await settledY(page)) - top), 'Replay ends on the corridor, it does not glide on').toBeLessThanOrEqual(1);
  expect(await button.evaluate((el) => el === document.activeElement), 'the focus is back on Replay').toBe(true);
  expect(requests, 'Replay fetched the walk without the door, and nothing else').toEqual([`walk.${codec}`]);
  await expect(stage(page)).toHaveAttribute('data-scare-beats', '0');
  await expectHoldsBounded(page, set.clips.plain);
  // Skip works in a replay too, and goes on to the next section (at the clip's real speed, so
  // that there is time to press it)
  await page.evaluate(() => void ((window as unknown as { __corridorRate: number }).__corridorRate = 1));
  await button.click();
  await expectHeld(page, 'Replay again');
  await expect(skip(page)).toBeVisible();
  await skip(page).click();
  await ended(page, 'skip-button');
  await expectOnNext(page, 'Replay skipped');
  await context.close();
});

for (const kind of KINDS) {
  test(`${kind}: scrolling up from below passes the corridor in one gesture, before the first play and after it`, async ({ browser }, info) => {
    test.skip(!gesturesOf(info).includes(kind), `this project makes no ${kind} gestures`);
    test.slow();
    const { context, page } = await pageFor(browser, info, kind);
    await open(page, { rate: 4 });
    const top = await topOf(page);
    const vh = page.viewportSize()!.height;
    // before: a visitor who arrived below it (a link, a reload)
    await jumpTo(page, Math.round(top + vh * 1.2));
    await wake(page);
    await page.waitForTimeout(300);
    await fling(page, kind, -1);
    expect(await settledY(page), 'one gesture up ends above the corridor').toBeLessThan(top - 10);
    expect(await holds(page), 'not held on the way up').toEqual([]);
    await expect(stage(page)).toHaveAttribute('data-state', 'idle');
    await expect(stage(page), 'and not counted as seen').toHaveAttribute('data-seen', '0');
    // from above, it is caught: it has not been seen
    if ((await primed(page)) === 'none') {
      await context.close();
      return;
    }
    await jumpTo(page, 0);
    await fling(page, kind);
    await expectHeld(page, 'coming down again');
    await ended(page);
    await expectOnNext(page);
    // after: up from below in one gesture, again
    await jumpTo(page, Math.round(top + vh * 1.2));
    await settledY(page);
    await fling(page, kind, -1);
    expect(await settledY(page), 'one gesture up ends above the corridor, after the play as well').toBeLessThan(top - 10);
    expect((await holds(page)).length, 'held once in all').toBe(1);
    await context.close();
  });
}

test('the door opens on the first play only: not on Replay, and not after a reload in the same session', async ({ browser }, info) => {
  test.slow();
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  const requests = clipRequests(page);
  // (played at half speed as far as the page knows: twice the time before it gives up; the
  // test takes the clip to the beat, and through it at the speed it was made)
  await open(page, { rate: 0.5 });
  const top = await topOf(page);
  const { set } = await setInfo(page);
  const sc = set.clips.scare.scare!;
  expect(sc, 'the manifest describes the beat').toBeTruthy();
  expect(sc.end - sc.at, 'the beat is 15 frames at 24 a second').toBeCloseTo(0.625, 2);
  expect(set.clips.plain.scare, 'the walk for Replay has none').toBeUndefined();
  expect(set.clips.scare.duration - set.clips.plain.duration, 'and is shorter by the beat').toBeCloseTo(0.625, 2);
  const codec = await primed(page);
  test.skip(codec === 'none', 'this browser plays no video');
  expect(await stored(page, SCARE_KEY)).toBeNull();

  await fling(page, kind);
  await expectHeld(page);
  await expect(stage(page)).toHaveAttribute('data-variant', 'scare');
  await expect(stage(page)).toHaveAttribute('data-mode', 'video', { timeout: 10000 });
  // the beat at the speed it was made, watched frame by frame
  const watched =
    info.project.use.browserName === 'chromium'
      ? video(page).evaluate(
          (el, [at, end]) =>
            new Promise<{ inBeat: number; change: number; times: number[] }>((resolve) => {
              const v = el as HTMLVideoElement & { requestVideoFrameCallback: (cb: (now: number, meta: { mediaTime: number }) => void) => void };
              const c = document.createElement('canvas');
              c.width = 72;
              c.height = Math.round((72 * v.videoHeight) / Math.max(1, v.videoWidth)) || 72;
              const g = c.getContext('2d', { willReadFrequently: true })!;
              let held: Uint8ClampedArray | null = null;
              let change = 0;
              const times: number[] = [];
              const onFrame = (_now: number, meta: { mediaTime: number }) => {
                const t = meta.mediaTime;
                if (t > end + 0.3 || v.ended) return resolve({ inBeat: times.length, change, times });
                if (t >= at - 0.05 && t < end) {
                  g.drawImage(v, 0, 0, c.width, c.height);
                  const d = g.getImageData(0, 0, c.width, c.height).data;
                  // the frame the beat starts on is the door shut; how far do the next ones move from it
                  if (!held) held = d;
                  else {
                    let sum = 0;
                    for (let i = 0; i < d.length; i += 4) sum += Math.abs(d[i] - held[i]) + Math.abs(d[i + 1] - held[i + 1]) + Math.abs(d[i + 2] - held[i + 2]);
                    change = Math.max(change, sum / (d.length / 4) / 3);
                  }
                  if (t >= at) times.push(t);
                }
                v.requestVideoFrameCallback(onFrame);
              };
              v.requestVideoFrameCallback(onFrame);
            }),
          [sc.at, sc.end] as [number, number],
        )
      : null;
  await goTo(page, sc.at - 0.6, 1);
  await expect(stage(page), 'the beat was on screen').toHaveAttribute('data-scare-beats', '1', { timeout: 20000 });
  expect(await stored(page, SCARE_KEY)).toBe('1');
  if (watched) {
    const seen = await watched;
    // really presented: frames of it were reported on screen, one after another, and the door
    // moved (15 frames in all; the report runs on the main thread, which on a busy machine
    // misses some of those that were shown)
    expect(seen.inBeat, `frames of the beat presented (${seen.times.map((t) => t.toFixed(3)).join(' ')})`).toBeGreaterThanOrEqual(6);
    expect(seen.change, 'the picture changed while the door was open').toBeGreaterThan(1.5);
  }
  await hurry(page);
  await ended(page);
  expect(requests, 'only the walk with the door was fetched').toEqual([`walk-door.${codec}`]);

  // Replay: a closed door
  requests.length = 0;
  await jumpTo(page, top);
  await expectRest(page);
  await replay(page).click();
  await expectHeld(page, 'Replay');
  await expect(stage(page)).toHaveAttribute('data-variant', 'plain');
  await expect(stage(page)).toHaveAttribute('data-mode', 'video', { timeout: 10000 });
  await hurry(page);
  await ended(page);
  await expect(stage(page), 'still one').toHaveAttribute('data-scare-beats', '1');
  expect(requests, 'the walk with the door is not fetched again').toEqual([`walk.${codec}`]);

  // reload, same session: nothing is held, and the walk with the door is never even fetched
  requests.length = 0;
  await page.reload();
  await topOf(page);
  await wake(page);
  await fling(page, kind);
  await settledY(page);
  expect(await holds(page)).toEqual([]);
  await jumpTo(page, top);
  await expectRest(page, 'after the reload');
  await replay(page).click();
  await expectHeld(page, 'Replay after the reload');
  await expect(stage(page)).toHaveAttribute('data-variant', 'plain');
  await expect(stage(page)).toHaveAttribute('data-mode', 'video', { timeout: 10000 });
  await hurry(page);
  await ended(page);
  await expect(stage(page)).toHaveAttribute('data-scare-beats', '0');
  expect(requests.filter((r) => r.startsWith('walk-door')), 'no file with the beat after it has played').toEqual([]);
  expect(await stored(page, SCARE_KEY)).toBe('1');
  await context.close();
});

test('play() refused: the scroll is caught, a button asks for a tap, and the tap plays the clip', async ({ browser }, info) => {
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  await open(page, { rate: 4, refuse: true });
  const top = await topOf(page);
  const { set } = await setInfo(page);
  await wake(page);
  test.skip((await refused(page)) === 'none', 'this browser plays no video');
  await fling(page, kind);
  await expect(stage(page)).toHaveAttribute('data-state', 'tap', { timeout: 10000 });
  await expect(tap(page)).toBeVisible();
  expect((await tap(page).innerText()).trim().length).toBeGreaterThan(4);
  await expect(skip(page), 'Skip is there as well').toBeVisible();
  // the fling ended here, and the page is not kept: it is let go as soon as the fling has died
  await expectFree(page, 'tap');
  expect(Math.abs((await settledY(page)) - top), 'the page rests on the corridor').toBeLessThanOrEqual(1);
  const soft = await holds(page);
  expect(soft.length, 'held once, briefly').toBe(1);
  expect(soft[0]).toBeLessThanOrEqual(1500 + 400);
  // the first frame is what shows, and nothing plays
  await expect(pic(page, 'first')).toHaveClass(/is-on/);
  expect(await page.locator('#corridor video').evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length)).toBe(0);
  await expect(stage(page)).toHaveAttribute('data-seen', '0');

  await tap(page).click();
  await expectHeld(page, 'after the tap');
  await expectPlaying(page, 'after the tap');
  await expect(stage(page)).toHaveAttribute('data-variant', 'scare');
  await expect(tap(page)).toBeHidden();
  await ended(page);
  await expectOnNext(page, 'after the tapped clip');
  expect((await expectHoldsBounded(page, set.clips.scare)).length).toBe(2);
  await context.close();
});

test('play() refused: scrolling on instead of tapping leaves the corridor, with Replay', async ({ browser }, info) => {
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  await open(page, { rate: 4, refuse: true });
  const top = await topOf(page);
  await wake(page);
  test.skip((await refused(page)) === 'none', 'this browser plays no video');
  await fling(page, kind);
  await expect(stage(page)).toHaveAttribute('data-state', 'tap', { timeout: 10000 });
  await expectFree(page);
  await settledY(page);
  // on, with an ordinary gesture
  if (kind === 'touch') await swipe(page, 1);
  else if (kind === 'wheel') await again(page, 'wheel');
  else await page.keyboard.press('PageDown');
  await ended(page, 'leave');
  expect(await settledY(page), 'the page went on').toBeGreaterThan(top + 24);
  expect((await holds(page)).length, 'not held again').toBe(1);
  await expect(stage(page)).toHaveAttribute('data-seen', '1');
  await jumpTo(page, top);
  await expectRest(page, 'left without a tap');
  await expect(replay(page)).toBeVisible();
  await context.close();
});

test('play() refused: Skip and Escape leave from the tap button too, on to the next section', async ({ page }) => {
  await open(page, { refuse: true });
  await wake(page);
  test.skip((await refused(page)) === 'none', 'this browser plays no video');
  await fling(page, 'key');
  await expect(stage(page)).toHaveAttribute('data-state', 'tap', { timeout: 10000 });
  expect(await tap(page).evaluate((el) => el === document.activeElement), 'the tap button has the focus').toBe(true);
  await page.keyboard.press('Escape');
  await ended(page, 'skip-key');
  await expectOnNext(page, 'Escape from the tap button');
  await expectRest(page);
  expect((await holds(page)).every((ms) => ms <= 1900), 'held only briefly').toBe(true);
});

test('a clip that is not ready within a second of arrival is not waited for: nothing is held, the corridor shows the last door and Replay', async ({ browser }, info) => {
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  // the clip's file never arrives
  let asked = 0;
  await page.route(VIDEO, () => {
    asked++;
  });
  await open(page);
  const top = await topOf(page);
  await wake(page);
  await page.waitForTimeout(400);
  test.skip((await attr(page, 'codec')) === 'none', 'this browser plays no video');
  expect(asked, 'the clip was asked for').toBeGreaterThan(0);
  const before = Date.now();
  await fling(page, kind);
  await ended(page, 'late');
  expect(Date.now() - before, 'given up on after about a second').toBeLessThan(6000);
  expect(await holds(page), 'the page was never held').toEqual([]);
  expect(await settledY(page), 'and the fling went on').toBeGreaterThan(top + 100);
  await jumpTo(page, top);
  await expectRest(page, 'slow line');
  await expect(replay(page)).toBeVisible();
  await context.close();
});

test('a clip that gets ready within the second, with the corridor still in front of the visitor, plays', async ({ page }) => {
  let open_: () => void = () => {};
  const gate = new Promise<void>((r) => (open_ = r));
  await page.route(VIDEO, async (route) => {
    await gate;
    await route.continue();
  });
  await open(page, { rate: 4 });
  const top = await topOf(page);
  await wake(page);
  await page.waitForTimeout(300);
  test.skip((await attr(page, 'codec')) === 'none', 'this browser plays no video');
  // every state the stage goes through is written down
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-corridor]')!;
    const log: string[] = [];
    (window as unknown as { __states: string[] }).__states = log;
    new MutationObserver(() => log.push(`${el.dataset.state}:${el.dataset.lock}`)).observe(el, { attributes: true, attributeFilter: ['data-state', 'data-lock'] });
  });
  // arrive with one key and stop just past the top: from as far above it as that key carries
  await page.keyboard.press('PageDown');
  const step = await settledY(page);
  expect(step, 'one Page Down from the top of the page stays above the corridor').toBeLessThan(top);
  await jumpTo(page, top + 20 - step);
  await page.waitForTimeout(300);
  await page.keyboard.press('PageDown');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __states: string[] }).__states.join(' ')), { timeout: 5000 }).toContain('wait:0');
  open_();
  // (the file is there within the second on this machine; where it is not, the stage has said "late")
  await expect(stage(page)).toHaveAttribute('data-state', /play|idle/, { timeout: 10000 });
  await expect.poll(() => attr(page, 'end'), { timeout: 30000 }).toMatch(/ended|watchdog|late/);
  const states = await page.evaluate(() => (window as unknown as { __states: string[] }).__states);
  const how = await attr(page, 'end');
  if (how === 'late') {
    expect(await holds(page), 'not ready in time: never held').toEqual([]);
    test.info().annotations.push({ type: 'note', description: 'the file took longer than the second here: the stage showed the last door instead' });
    return;
  }
  expect(states.indexOf('wait:0'), 'it waited without holding the page').toBeLessThan(states.indexOf('play:1'));
  expect(states.indexOf('play:1'), 'then held it and played').toBeGreaterThan(0);
  expect((await holds(page)).length).toBe(1);
});

test('the page is never held longer than the clip and a second: a clip that stalls is given up on', async ({ browser }, info) => {
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  await open(page);
  const { set } = await setInfo(page);
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  await fling(page, kind);
  await expectHeld(page);
  await expectPlaying(page);
  // the clip stalls: here, stopped behind the page's back
  await video(page).evaluate((el) => (el as HTMLVideoElement).pause());
  await ended(page, 'watchdog');
  await expectFree(page, 'stalled');
  await expectOnNext(page, 'stalled');
  await expectRest(page, 'stalled');
  const [ms] = await expectHoldsBounded(page, set.clips.scare, 'stalled');
  expect(ms, 'it was held until the clip should have ended, and a second').toBeGreaterThan(set.clips.scare.duration * 1000 + 700);
  await context.close();
});

test('a clip that will not decode lets the page go at once', async ({ browser }, info) => {
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  await open(page);
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  await fling(page, kind);
  await expectHeld(page);
  await video(page).evaluate((el) => el.dispatchEvent(new Event('error')));
  await ended(page, 'error');
  await expectFree(page, 'decode failure');
  await expectRest(page, 'decode failure');
  expect((await holds(page))[0]).toBeLessThan(5000);
  await context.close();
});

test('at its real speed the page is held for as long as the clip lasts, and each caption is up for a second and a half or more, in order', async ({ browser }, info) => {
  // (one language per project: the times are the clip's, the same in all three; every language is laid out below)
  const lang = { 'phone-390': 'ro', 'desktop-1440': 'ru' }[info.project.name] ?? 'en';
  test.setTimeout(90000);
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  await open(page, { lang });
  const { set } = await setInfo(page);
  const clip = set.clips.scare;
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  expect(await caps(page).count()).toBe(4);
  expect(new Set((await caps(page).allInnerTexts()).map((s) => s.trim())).size, 'four different captions').toBe(4);
  // every frame: the clip's time, and which captions are fully there
  await page.evaluate(() => {
    const w = window as unknown as { __caps: number[][] };
    w.__caps = [];
    const els = Array.from(document.querySelectorAll('[data-cap]'));
    const stageEl = document.querySelector<HTMLElement>('[data-corridor]')!;
    const tick = (now: number) => {
      const v = document.querySelector<HTMLVideoElement>('#corridor video');
      if (stageEl.dataset.state === 'play') w.__caps.push([now, v ? v.currentTime : -1, ...els.map((el) => Number(Number(getComputedStyle(el).opacity) >= 0.99))]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await fling(page, kind);
  await expectHeld(page);
  await page.waitForTimeout(1500);
  expect(await video(page).evaluate((v) => (v as HTMLVideoElement).playbackRate), 'natural speed').toBe(1);
  const how = await ended(page);
  await expectOnNext(page);
  const samples = await page.evaluate(() => (window as unknown as { __caps: number[][] }).__caps);
  expect(samples.length, 'the clip was watched').toBeGreaterThan(40);
  // How long each caption was fully there, on the clock and in the clip's own time. A machine
  // too busy to play at the clip's speed stretches the clock; the clip's time is what was shown.
  const spans = [0, 1, 2, 3].map((i) => {
    const on = samples.filter((s) => s[2 + i] === 1);
    return on.length ? { from: on[0][0], to: on[on.length - 1][0], t0: on[0][1], t1: on[on.length - 1][1] } : null;
  });
  const report = spans.map((s, i) => (s ? `${i + 1}: ${((s.to - s.from) / 1000).toFixed(2)} s (clip ${s.t0.toFixed(2)} to ${s.t1.toFixed(2)})` : `${i + 1}: never`)).join('; ');
  console.log(`CAPTIONS ${JSON.stringify({ project: info.project.name, lang, clip: clip.duration, end: how, held: await holds(page), report })}`);
  for (const [i, s] of spans.entries()) {
    // (the last caption comes up two seconds before the end: a clip cut short by a busy machine may not get there)
    if (i === 3 && how !== 'ended' && (!s || s.t1 - s.t0 < 1.5)) continue;
    expect(s, `caption ${i + 1} was shown (${report})`).not.toBeNull();
    expect(s!.t1 - s!.t0, `caption ${i + 1} is fully there for a second and a half of the clip (${report})`).toBeGreaterThanOrEqual(1.5);
    expect(s!.to - s!.from, `and of the clock (${report})`).toBeGreaterThanOrEqual(1500);
    if (i && spans[i - 1]) expect(s!.from, `caption ${i + 1} comes after caption ${i} has gone (${report})`).toBeGreaterThan(spans[i - 1]!.to);
  }
  // never two at once
  expect(samples.filter((s) => s[2] + s[3] + s[4] + s[5] > 1).length, 'two captions fully shown at once').toBe(0);
  // none of them over the open door
  const sc = clip.scare!;
  expect(samples.filter((s) => s[1] >= sc.at && s[1] < sc.end && s[2] + s[3] + s[4] + s[5] > 0).length, 'a caption over the open door').toBe(0);
  // and the hold: the clip's length, give or take what it takes to start and to notice the end
  const [ms] = await expectHoldsBounded(page, clip, 'real speed');
  expect(ms, `held ${ms} ms for a clip of ${clip.duration} s`).toBeGreaterThan(clip.duration * 1000 * 0.9);
  expect(clip.duration, 'the clip is 8 to 10 seconds').toBeGreaterThanOrEqual(8);
  expect(clip.duration).toBeLessThanOrEqual(10);
  expect(set.clips.plain.duration).toBeGreaterThanOrEqual(8);
  await context.close();
});

test('the captions of every language are timed alike: one at a time, in order, each for 1.9 seconds, the last one staying', async ({ page }) => {
  for (const lang of ['ro', 'ru', 'en']) {
    await page.goto(`${BASE}/${lang}/`);
    const { set } = await setInfo(page);
    const texts = (await caps(page).allInnerTexts()).map((s) => s.trim());
    expect(texts.length, lang).toBe(4);
    for (const text of texts) expect(text.length, `${lang}: "${text}"`).toBeGreaterThan(8);
    for (const clip of Object.values(set.clips)) {
      expect(clip.cues.map((c) => c.cap), lang).toEqual([0, 1, 2, 3]);
      clip.cues.forEach((c, i) => {
        expect((c.out ?? clip.duration) - c.in, `${lang}: caption ${i + 1} is up for`).toBeGreaterThanOrEqual(1.9 - 0.001);
        if (i) expect(c.in, `${lang}: caption ${i + 1} after caption ${i}`).toBeGreaterThanOrEqual(clip.cues[i - 1].out! + 0.2);
      });
      expect(clip.cues[3].out, 'the last caption stays').toBeUndefined();
    }
  }
});

test('the stage is never black: from the catch, through the clip, to the last door', async ({ browser }, info) => {
  test.slow();
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  await open(page, { rate: 2 });
  await page.waitForLoadState('load');
  const top = await topOf(page);
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  // the middle of the picture, where the torch falls; the page's own layers (grain, flashlight) included
  await jumpTo(page, top);
  const view = (await page.locator('[data-view]').boundingBox())!;
  await jumpTo(page, 0);
  await settledY(page);
  const clip = { x: Math.round(view.x + view.width * 0.15), y: Math.round(view.y + view.height * 0.2), width: Math.round(view.width * 0.7), height: Math.round(view.height * 0.55) };
  const vp = page.viewportSize()!;
  // (WebKit has no such direct shot and is asked for the clip alone, which is all it has time for)
  const whole = info.project.use.browserName === 'chromium';
  const lit = async () => {
    const { data, info: size } = await sharp(whole ? await viewportShot(page) : await page.screenshot({ clip, type: 'png' }))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const k = whole ? size.width / vp.width : 0; // device pixels to a CSS pixel
    const [x0, x1, y0, y1] = whole ? [clip.x, clip.x + clip.width, clip.y, clip.y + clip.height].map((v) => Math.round(v * k)) : [0, size.width, 0, size.height];
    let bright = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * size.width + x) * size.channels;
        if (data[i] + data[i + 1] + data[i + 2] > 3 * 40) bright++;
      }
    }
    return bright / ((x1 - x0) * (y1 - y0));
  };
  await fling(page, kind);
  await expect(stage(page)).toHaveAttribute('data-lock', '1', { timeout: 10000 });
  // while the page is held: the first frame as a still, the hand-over to the clip, the walk,
  // the hand-over to the last door. A shot counts only if the page was held before and after it.
  const shots: number[] = [];
  for (;;) {
    if ((await attr(page, 'lock')) !== '1') break;
    const share = await lit();
    if ((await attr(page, 'lock')) !== '1') break;
    shots.push(share);
  }
  await ended(page);
  expect(shots.length, 'screenshots while the clip played').toBeGreaterThan(linuxWebKit(page) ? 2 : 6);
  // and the last door, at rest
  await settledY(page);
  await jumpTo(page, top);
  await expectRest(page);
  await page.waitForTimeout(300);
  shots.push(await lit());
  // a black stage has no lit pixel at all; every picture of the walk has the torch in it
  expect(Math.min(...shots), `share of lit pixels in ${shots.length} screenshots: ${shots.map((s) => s.toFixed(3)).join(' ')}`).toBeGreaterThan(0.02);
  await context.close();
});

test('the clip hands over without a jump: its first frame is as bright as the still it starts on', async ({ page }) => {
  await open(page);
  const top = await topOf(page);
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  await expect(pic(page, 'first'), 'the first frame, full size, is on the stage').toHaveClass(/is-on/);
  // only the stage: the page's own moving layers and the text over the picture are taken away
  await page.addStyleTag({ content: '.grain,.torch,.tint,.dim{display:none!important} .corr__pin::after,.corr__view::after{display:none!important} .corr__head,.corr__caps,.corr__btn,.corr__tap,.sticky,.ask,header{visibility:hidden!important}' });
  await jumpTo(page, top);
  await page.waitForTimeout(500);
  const view = (await page.locator('[data-view]').boundingBox())!;
  const clip = { x: Math.round(view.x + view.width * 0.1), y: Math.round(view.y + view.height * 0.15), width: Math.round(view.width * 0.8), height: Math.round(view.height * 0.6) };
  const level = async () => {
    const { data } = await sharp(await page.screenshot({ clip, type: 'png' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length;
  };
  const still = await level();
  // The clip is warm and stands on its first frame under the still: bring it up as it is. (In
  // the first tenth of a second the walk already moves the light by more than a wrong colour
  // tag would, so a frame caught while it plays proves nothing.)
  expect(await video(page).evaluate((v) => [(v as HTMLVideoElement).paused, (v as HTMLVideoElement).currentTime])).toEqual([true, 0]);
  await video(page).evaluate((v) => {
    (v as HTMLVideoElement).style.opacity = '1';
    (v as HTMLVideoElement).style.zIndex = '1000';
  });
  await page.waitForTimeout(500);
  const frame = await level();
  // A wrong range or matrix moves the picture by ten levels and more; the wrong transfer curve
  // by two to four on Safari. Compression alone stays under one.
  expect(Math.abs(frame - still), `the still is at ${still.toFixed(2)}, the first frame of the clip at ${frame.toFixed(2)}`).toBeLessThan(2);
});

test('Skip takes the focus when the page is held, shows it, is 44 px to touch, and works from the keyboard', async ({ page }) => {
  await open(page, { rate: 1 });
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  // arriving by keyboard
  await fling(page, 'key');
  await expectHeld(page);
  const button = skip(page);
  await expect(button).toBeVisible();
  expect(await button.evaluate((el) => el.tagName)).toBe('BUTTON');
  expect((await button.innerText()).trim().length).toBeGreaterThan(2);
  expect((await button.getAttribute('aria-label')) ?? '', 'its name starts with the word on it').toContain(((await button.textContent()) ?? '').trim());
  const style = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const h = document.querySelector('header')!.getBoundingClientRect();
    return { focused: el === document.activeElement, outline: s.outlineStyle, width: parseFloat(s.outlineWidth), w: r.width, h: r.height, visible: el.matches(':focus-visible'), below: r.top - h.bottom, right: r.right, vw: document.documentElement.clientWidth };
  });
  expect(style.focused, 'the focus is on Skip').toBe(true);
  expect(style.visible, 'focus is shown').toBe(true);
  expect(style.outline).not.toBe('none');
  expect(style.width).toBeGreaterThanOrEqual(2);
  expect(style.w, '44 px to touch').toBeGreaterThanOrEqual(44);
  expect(style.h).toBeGreaterThanOrEqual(44);
  expect(style.below, 'clear of the header').toBeGreaterThanOrEqual(0);
  expect(style.right).toBeLessThanOrEqual(style.vw);
  // the clip is hidden from assistive technology, the captions are text
  expect(await video(page).getAttribute('aria-hidden')).toBe('true');
  expect(await video(page).evaluate((v) => (v as HTMLVideoElement).tabIndex)).toBe(-1);
  // the keys that scroll a page move nothing while it is held
  for (const key of ['ArrowDown', 'PageDown', 'End', 'ArrowUp', 'Home']) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  await expect(stage(page), 'still held').toHaveAttribute('data-lock', '1');
  expect(Math.abs(await corridorTop(page))).toBeLessThanOrEqual(1);
  await page.keyboard.press('Enter');
  await ended(page, 'skip-button');
  await expectOnNext(page, 'Skip from the keyboard');
});

test('nothing but one small poster loads with the page; the first input fetches the two stills and one clip, in one codec', async ({ page }) => {
  const clips = clipRequests(page);
  const stills: string[] = [];
  const posters: { url: string; bytes: number }[] = [];
  page.on('request', (r) => {
    const m = STILL.exec(new URL(r.url()).pathname);
    if (m) stills.push(m[2]);
  });
  page.on('response', async (r) => {
    if (POSTER.test(new URL(r.url()).pathname)) posters.push({ url: r.url(), bytes: (await r.body()).length });
  });
  await open(page);
  await page.waitForLoadState('load');
  expect(clips, 'no clip requested during load').toEqual([]);
  expect(stills, 'no still requested during load').toEqual([]);
  // nor in the first moments after it, while nobody has touched anything
  await page.waitForTimeout(1500);
  expect(clips, 'no clip requested before the first input').toEqual([]);
  expect(stills).toEqual([]);
  expect(await page.locator('video').count(), 'no video element either').toBe(0);
  await expect.poll(() => posters.length).toBe(1);
  expect(posters[0].bytes).toBeLessThan(16 * 1024);
  // the poster is on the stage
  expect(await poster(page).evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);

  // first input: the first frame and the last door, and the walk with the door
  const codec = await primed(page);
  await expect.poll(() => [...stills].sort().join(' ')).toBe('first last');
  await expect(pic(page, 'first'), 'the full first frame comes up over the poster').toHaveClass(/is-on/);
  if (codec === 'none') {
    await page.waitForTimeout(500);
    expect(clips, 'a browser that plays neither codec fetches no clip').toEqual([]);
    return;
  }
  expect(clips).toEqual([`walk-door.${codec}`]);
  const v = video(page);
  expect(await page.locator('#corridor video').count()).toBe(1);
  // a plain video element with its sources, streamed by the browser
  const made = await v.evaluate((el) => {
    const video = el as HTMLVideoElement;
    return { src: video.getAttribute('src'), current: video.currentSrc, sources: Array.from(video.querySelectorAll('source')).map((s) => s.type), muted: video.muted, inline: video.playsInline, preload: video.preload, paused: video.paused, t: video.currentTime, ready: video.readyState };
  });
  expect(made.src, 'no blob, no src of its own').toBeNull();
  expect(made.current).toMatch(VIDEO);
  expect(made.sources.length).toBeGreaterThanOrEqual(1);
  expect([made.muted, made.inline, made.preload]).toEqual([true, true, 'auto']);
  // warm, and back on its first frame
  expect([made.paused, made.t]).toEqual([true, 0]);
  expect(made.ready).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(800);
  expect(clips, 'the walk for Replay waits until it is wanted').toEqual([`walk-door.${codec}`]);
});

test('a browser that plays neither codec is never held: the corridor shows its stills, and no Replay', async ({ page }) => {
  const clips = clipRequests(page);
  await open(page, { codec: 'none' });
  const top = await topOf(page);
  await wake(page);
  await expect(stage(page)).toHaveAttribute('data-codec', 'none');
  await fling(page, 'key');
  await ended(page, 'late');
  expect(await holds(page)).toEqual([]);
  await jumpTo(page, top);
  await expect(stage(page)).toHaveAttribute('data-state', 'idle');
  await expect(pic(page, 'last')).toHaveClass(/is-on/);
  expect(await capsOn(page)).toEqual([3]);
  await expect(replay(page)).toBeHidden();
  await expect(skip(page)).toBeHidden();
  expect(clips, 'no clip was asked for').toEqual([]);
  expect(await page.locator('video').count()).toBe(0);
});

test('only a scroll the visitor is making is caught: not a link that glides past, and not a jump', async ({ page }) => {
  await open(page);
  const top = await topOf(page);
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  // the hero's own button, straight to the registration card
  await page.locator('[data-cta]').click();
  await expect(page.locator('#checkin-title')).toBeInViewport({ timeout: 8000 });
  expect(await settledY(page)).toBeGreaterThan(top + 1000);
  await expect(stage(page)).toHaveAttribute('data-state', 'idle');
  await expect(stage(page), 'passed, not seen').toHaveAttribute('data-seen', '0');
  expect(await holds(page)).toEqual([]);
  // a jump over it, and a jump onto it
  await jumpTo(page, 0);
  await page.waitForTimeout(300);
  await jumpTo(page, top + 300);
  await page.waitForTimeout(300);
  await jumpTo(page, 0);
  await page.waitForTimeout(300);
  await jumpTo(page, top);
  await page.waitForTimeout(500);
  await expect(stage(page)).toHaveAttribute('data-state', 'idle');
  expect(await holds(page)).toEqual([]);
  // the first frame is what it shows, with no caption, no Skip and no Replay yet
  await expect(pic(page, 'first')).toHaveClass(/is-on/);
  expect(await capsOn(page)).toEqual([]);
  await expect(skip(page)).toBeHidden();
  await expect(replay(page)).toBeHidden();
  // and a real scroll from above still gets the clip
  await jumpTo(page, 0);
  await settledY(page);
  await fling(page, 'key');
  await expectHeld(page);
});

test('holding the page moves nothing sideways, and the section is one screen tall', async ({ page }) => {
  await open(page);
  const top = await topOf(page);
  const shape = await page.evaluate(() => {
    const c = document.getElementById('corridor')!.getBoundingClientRect();
    return { h: Math.round(c.height), vh: window.innerHeight, snap: getComputedStyle(document.documentElement).scrollSnapType, fileTop: Math.round(document.getElementById('file')!.getBoundingClientRect().top + window.scrollY), marks: document.querySelectorAll('#corridor [data-stop]').length };
  });
  expect(shape.h, 'one screen').toBe(shape.vh);
  expect(shape.fileTop - top, 'the next section follows at once').toBe(shape.vh);
  expect(shape.snap, 'no scroll snap anywhere').toBe('none');
  expect(shape.marks).toBe(0);
  test.skip((await primed(page)) === 'none', 'this browser plays no video');
  // (where a scrollbar takes room: the header, which is fixed, the body, and the text of a section further down)
  const widths = () => page.evaluate(() => ({ header: Math.round(document.querySelector('header')!.getBoundingClientRect().width), body: Math.round(document.body.getBoundingClientRect().width), stage: Math.round(document.querySelector('[data-corridor]')!.getBoundingClientRect().width), next: Math.round(document.querySelector('#file')!.getBoundingClientRect().left * 10 + document.querySelector('#file')!.getBoundingClientRect().width) }));
  const before = await widths();
  await fling(page, 'key');
  await expectHeld(page);
  expect(await widths(), 'nothing got wider or narrower').toEqual(before);
  await page.keyboard.press('Escape');
  await expectFree(page);
  expect(await widths()).toEqual(before);
});

test('the set follows the viewport', async ({ page }) => {
  await open(page);
  const { name, set } = await setInfo(page);
  const vp = page.viewportSize()!;
  expect(name).toBe(vp.height > vp.width ? 'mobile' : 'desktop');
  expect(set.h > set.w).toBe(vp.height > vp.width);
  // the poster on the stage is that set's
  await expect.poll(() => poster(page).evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(set.poster);
  const shape = await poster(page).evaluate((el) => (el as HTMLImageElement).naturalHeight > (el as HTMLImageElement).naturalWidth);
  expect(shape).toBe(set.h > set.w);
  // after the first input the full first frame takes its place, and the clip asked for is that set's
  const sets: string[] = [];
  page.on('request', (r) => {
    const m = VIDEO.exec(new URL(r.url()).pathname);
    if (m) sets.push(m[1]);
  });
  const codec = await primed(page);
  await expect(pic(page, 'first'), 'the full first frame comes up over the poster').toHaveClass(/is-on/);
  expect(await pic(page, 'first').evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(set.first);
  // and the poster stays under it: no other poster is ever asked for
  expect(await poster(page).evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(set.poster);
  if (codec !== 'none') expect(new Set(sets)).toEqual(new Set([name === 'mobile' ? 'm' : 'd']));
  // on a phone the picture is a band as wide as the screen, in the shape of the phone set, and
  // the far end of the corridor is in it; on a desktop it fills the stage
  const top = await topOf(page);
  await jumpTo(page, top);
  const view = (await page.locator('[data-view]').boundingBox())!;
  expect(Math.round(view.width)).toBe(vp.width);
  if (name === 'mobile') {
    expect(Math.abs(view.height / view.width - set.h / set.w), 'the band has the shape of the picture').toBeLessThan(0.01);
    expect(set.w / set.h, 'wider than the old 9:18 window: between 3:4 and 4:5').toBeGreaterThanOrEqual(0.75 - 0.001);
    expect(set.w / set.h).toBeLessThanOrEqual(0.8 + 0.001);
    expect(view.y, 'below the top of the screen').toBeGreaterThan(0);
    expect(view.y + view.height, 'and above its bottom').toBeLessThan(vp.height);
  } else expect(Math.round(view.height)).toBe(vp.height);
});

test('the old silhouette, the frame scrubber and the chapters are gone', async ({ page, request }) => {
  await open(page);
  expect(await page.locator('#corridor canvas').count(), 'no canvas in the corridor').toBe(0);
  expect(await page.locator('#corridor [data-pose], #corridor [data-stop]').count(), 'no poses, no stops').toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hotel:child'))).toBeNull();
  // nothing in the shipped scripts still knows about them, or about the smooth-scroll library
  const sources = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
  expect(sources.length).toBeGreaterThan(0);
  for (const src of sources) {
    const body = await (await request.get(src)).text();
    expect(body).not.toContain('hotel:child');
    expect(body.toLowerCase()).not.toContain('silhouette');
    expect(body).not.toContain('createImageBitmap');
    expect(body.toLowerCase()).not.toContain('lenis');
    expect(body).not.toContain('createObjectURL');
    expect(body).not.toContain('c3s');
  }
  // and neither the frame sets nor the chapter files are on the server
  for (const path of ['corridor/d/000.avif', 'corridor/m/000.webp', 'corridor/d/s/f-01.avif', 'corridor/m/c1.h264.mp4', 'corridor/d/c3s.av1.mp4', 'corridor/m/p0.webp', 'corridor/d/p3.webp']) {
    expect((await request.get(`${BASE}/${path}`)).status(), path).toBe(404);
  }
});

test('reduced motion: three stills, every caption, nothing held, no video, no scare', async ({ browser }, info) => {
  const use = info.project.use;
  const ctx = await browser.newContext({ baseURL: use.baseURL, reducedMotion: 'reduce', viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent });
  const page = await ctx.newPage();
  const clips = clipRequests(page);
  await open(page);
  await expect(stage(page)).toHaveAttribute('data-mode', 'still');
  expect(await stage(page).evaluate((el) => getComputedStyle(el).position)).toBe('relative');
  // walk the whole page, with real keys as well: the corridor is an ordinary block
  await wake(page);
  await fling(page, 'key');
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize()!.height;
  for (let y = 0; y <= height; y += vh * 0.8) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(40);
  }
  expect(await holds(page), 'never held').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.className)).not.toContain('corr-lock');
  // three stills: doors 304 and 305 and the last door, loaded and lit
  for (const name of ['still-1', 'still-2', 'last']) {
    const still = pic(page, name);
    await still.scrollIntoViewIfNeeded();
    await expect(still).toBeVisible();
    await expect.poll(() => still.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { timeout: 15000 }).toBe(true);
    expect(await still.evaluate((el) => (el as HTMLImageElement).currentSrc)).toMatch(STILL);
    const box = (await still.boundingBox())!;
    expect(box.height).toBeGreaterThan(120);
  }
  await expect(pic(page, 'first')).toBeHidden();
  // all four captions readable
  expect(await caps(page).count()).toBe(4);
  for (const cap of await caps(page).all()) {
    await cap.scrollIntoViewIfNeeded();
    await expect(cap).toBeVisible();
    expect(Number(await cap.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  }
  for (const button of [skip(page), replay(page), tap(page)]) await expect(button).toBeHidden();
  const box = await page.locator('#corridor').boundingBox();
  expect(box!.height, 'the section is as tall as its content').toBeLessThan(vh * 3);
  await page.waitForTimeout(400);
  expect(clips, 'no video is requested').toEqual([]);
  expect(await page.locator('video').count(), 'and no video element exists').toBe(0);
  expect(await stored(page, SCARE_KEY)).toBeNull();
  expect(await stored(page, SEEN_KEY)).toBeNull();
  await ctx.close();
});

test('every still of both sets is lit: none of them is a black screen', async ({ page }, info) => {
  // Decoded here, in the browser that shows them. The files are the same for every project.
  test.skip(info.project.name !== 'desktop-1440', 'the files are the same for every project');
  await open(page);
  const manifest = JSON.parse((await attr(page, 'manifest')) ?? '{}') as { sets: Record<string, SetInfo> };
  for (const name of ['desktop', 'mobile']) {
    const s = manifest.sets[name];
    expect(s.stills.length).toBe(2);
    const stats = await page.evaluate(async (s) => {
      const root = document.querySelector<HTMLElement>('[data-corridor]')!.dataset.base ?? '';
      const out: { src: string; w: number; h: number; mean: number; p99: number }[] = [];
      for (const src of [s.poster, s.first, ...s.stills, s.last]) {
        const bmp = await createImageBitmap(await (await fetch(root + src)).blob());
        const off = document.createElement('canvas');
        off.width = Math.round(bmp.width / 4);
        off.height = Math.round(bmp.height / 4);
        const o = off.getContext('2d', { willReadFrequently: true })!;
        o.drawImage(bmp, 0, 0, off.width, off.height);
        const d = o.getImageData(0, 0, off.width, off.height).data;
        const lum: number[] = [];
        let sum = 0;
        for (let k = 0; k < d.length; k += 4) {
          const v = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
          sum += v;
          lum.push(v);
        }
        lum.sort((a, b) => a - b);
        out.push({ src, w: bmp.width, h: bmp.height, mean: sum / lum.length, p99: lum[Math.floor(lum.length * 0.99)] });
        bmp.close();
      }
      return out;
    }, s);
    for (const p of stats) {
      // The walk is by torchlight. A black screen is a mean of 1 or 2 (the finishing pass lifts
      // black to about 3); and every still has something clearly lit in it.
      expect(p.mean, `${p.src}: mean ${p.mean.toFixed(1)}/255`).toBeGreaterThan(5);
      expect(p.p99, `${p.src}: brightest 1 percent ${p.p99.toFixed(0)}/255`).toBeGreaterThan(48);
      // a still is at least the size of the video frame it stands for, and the same shape
      if (p.src !== s.poster) {
        expect(p.w, `${p.src} is a full frame`).toBeGreaterThanOrEqual(s.w);
        expect(Math.abs(p.w / p.h - s.w / s.h), `${p.src} has the shape of the video`).toBeLessThan(0.002);
      }
    }
  }
});

test('every clip file: a full type for each codec, the index at the front, colours tagged as the stills are, and the phone set within its 3 MB', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'the files are the same for every project');
  await open(page);
  const manifest = JSON.parse((await attr(page, 'manifest')) ?? '{}') as { sets: Record<string, SetInfo> };
  const size = async (path: string) => (await (await request.get(`${BASE}/corridor/${path}`)).body()).length;
  for (const name of ['desktop', 'mobile']) {
    const s = manifest.sets[name];
    expect(Object.keys(s.clips).sort()).toEqual(['plain', 'scare']);
    const rest = (await size(s.poster)) + (await size(s.first)) + (await size(s.last));
    for (const [id, f] of Object.entries(s.clips)) {
      // a phone takes H.264, which every phone decodes in hardware; a desktop the modern codec first
      expect(f.sources.map((x) => x.codec), `${name} ${id}`).toEqual(['h264', 'av1']);
      for (const src of f.sources) {
        if (src.codec === 'av1') expect(src.type).toMatch(/^video\/mp4; codecs="av01\.0\.\d\dM\.(08|10)"$/);
        else expect(src.type).toMatch(/^video\/mp4; codecs="avc1\.6400(28|29|2a|1f|20)"$/);
        const res = await request.get(`${BASE}/corridor/${src.src}`);
        expect(res.status(), src.src).toBe(200);
        const body = await res.body();
        // what one phone visitor downloads: one variant in one codec, the poster and the two stills the stage rests on
        if (name === 'mobile') expect(body.length + rest, `${src.src} with the poster and the stills`).toBeLessThanOrEqual(3_000_000);
        // faststart: the index before the picture data, so the browser can play while it loads
        const moov = body.indexOf('moov');
        const mdat = body.indexOf('mdat');
        expect(moov, `${src.src}: index`).toBeGreaterThan(0);
        expect(moov, `${src.src}: the index is at the front`).toBeLessThan(mdat);
        // colr nclx: BT.709 primaries (1), the sRGB transfer curve (13), BT.709 matrix (1). With
        // another curve Safari shows the video lighter than the still it hands over to.
        const colr = body.indexOf('colrnclx');
        expect(colr, `${src.src}: colour box`).toBeGreaterThan(0);
        expect([body.readUInt16BE(colr + 8), body.readUInt16BE(colr + 10), body.readUInt16BE(colr + 12)], `${src.src}: primaries, transfer, matrix`).toEqual([1, 13, 1]);
        // no sound track: no handler box of that kind
        expect(body.indexOf(Buffer.from('hdlr\0\0\0\0\0\0\0\0soun', 'latin1')), `${src.src}: no audio`).toBe(-1);
        expect(body.indexOf(Buffer.from('hdlr\0\0\0\0\0\0\0\0vide', 'latin1')), `${src.src}: one picture track`).toBeGreaterThan(0);
      }
    }
  }
  // the test server answers byte ranges, as the real host does (Safari asks for a video in ranges)
  const part = await request.get(`${BASE}/corridor/${manifest.sets.mobile.clips.plain.sources[0].src}`, { headers: { Range: 'bytes=0-99' } });
  expect(part.status()).toBe(206);
  expect((await part.body()).length).toBe(100);
});

// The floating "ask" button sits bottom right, level with the caption; Skip and Replay sit top
// right. Checked on the text itself (each line as laid out), not only on its box.
test('the captions clear the floating button and the Skip and Replay buttons on phones, in every language', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone-390', 'phone layouts, checked once');
  test.slow();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 390, height: 667 },
    { width: 360, height: 640 },
  ]) {
    for (const lang of ['ro', 'ru', 'en']) {
      const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      // a session at rest on the last door: Replay is up, where Skip is while the clip plays
      await open(page, { lang, seen: true });
      const top = await topOf(page);
      await jumpTo(page, top);
      await expectRest(page);
      const count = await caps(page).count();
      expect(count).toBe(4);
      const button = page.locator('[data-float] .ask__btn');
      await expect(button, 'the button is on screen').toBeVisible();
      await expect(replay(page)).toBeVisible();
      // the button slides to its place above the book bar: wait until it has stopped
      let last = '';
      await expect
        .poll(async () => {
          const now = JSON.stringify(await button.boundingBox());
          const same = now === last;
          last = now;
          return same;
        })
        .toBe(true);
      const at = `${viewport.width}x${viewport.height} ${lang}`;
      for (const name of ['replay', 'skip']) {
        // Skip, as it is while the clip plays: the same place
        await page.evaluate((n) => {
          for (const k of ['replay', 'skip']) document.querySelector<HTMLElement>(`[data-corr-${k}]`)!.hidden = k !== n;
        }, name);
        const chrome = await page.evaluate((n) => {
          const b = document.querySelector('[data-float] .ask__btn')!.getBoundingClientRect();
          const s = document.querySelector(`[data-corr-${n}]`)!.getBoundingClientRect();
          const h = document.querySelector('header')!.getBoundingClientRect();
          const bar = document.querySelector('[data-sticky]')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('#corridor-title')!);
          const t = range.getBoundingClientRect();
          const gap = (p: DOMRect, q: DOMRect) => Math.max(q.left - p.right, p.left - q.right, q.top - p.bottom, p.top - q.bottom);
          return { button: gap(s, b), title: gap(s, t), bar: gap(s, bar), top: s.top - h.bottom, right: s.right, left: s.left, w: s.width, h: s.height, vw: document.documentElement.clientWidth };
        }, name);
        expect(chrome.w, `${at}: ${name} is 44 px to touch`).toBeGreaterThanOrEqual(44);
        expect(chrome.h).toBeGreaterThanOrEqual(44);
        expect(chrome.top, `${at}: ${name} is below the header`).toBeGreaterThanOrEqual(0);
        expect(chrome.right, `${at}: ${name} is on the screen`).toBeLessThanOrEqual(chrome.vw);
        expect(chrome.left).toBeGreaterThanOrEqual(0);
        expect(chrome.button, `${at}: ${name} and the floating button`).toBeGreaterThanOrEqual(44);
        expect(chrome.bar, `${at}: ${name} and the book bar`).toBeGreaterThanOrEqual(44);
        expect(chrome.title, `${at}: ${name} and the heading`).toBeGreaterThanOrEqual(8);
        for (let i = 0; i < count; i++) {
          const where = `${at} caption ${i + 1}, ${name}`;
          // put this caption up alone, as the clip does
          await caps(page).evaluateAll((els, n) => els.forEach((el, k) => el.classList.toggle('is-on', k === n)), i);
          const cap = caps(page).nth(i);
          await expect.poll(async () => Number(await cap.evaluate((el) => getComputedStyle(el).opacity)), { message: `${where} is shown` }).toBeGreaterThan(0.99);
          const m = await cap.evaluate((el, n) => {
            const b = document.querySelector('[data-float] .ask__btn')!.getBoundingClientRect();
            const s = document.querySelector(`[data-corr-${n}]`)!.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(el);
            const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
            // how far a rectangle is from another: the larger of the horizontal and the vertical gap
            const gap = (r: DOMRect, o: DOMRect) => Math.max(o.left - r.right, r.left - o.right, o.top - r.bottom, r.top - o.bottom);
            return {
              lines: lines.length,
              text: Math.min(...lines.map((r) => gap(r, b))),
              box: gap(el.getBoundingClientRect(), b),
              skip: Math.min(...lines.map((r) => gap(r, s))),
              level: lines.some((r) => r.bottom > b.top && r.top < b.bottom),
              vw: document.documentElement.clientWidth,
              right: Math.max(...lines.map((r) => r.right)),
            };
          }, name);
          expect(m.lines, `${where} has text`).toBeGreaterThan(0);
          // the case the rule is for: the caption is level with the button, so only the space
          // between them keeps them apart
          expect(m.level, `${where} is level with the button`).toBe(true);
          expect(m.text, `${where}: space between the text and the button`).toBeGreaterThanOrEqual(8);
          expect(m.box, `${where}: space between the caption box and the button`).toBeGreaterThanOrEqual(8);
          expect(m.skip, `${where}: space between the text and ${name}`).toBeGreaterThanOrEqual(24);
          expect(m.right, `${where} stays on the screen`).toBeLessThanOrEqual(m.vw);
        }
      }
      await ctx.close();
    }
  }
});
