// Shared by the corridor tests: opening the page, reading the stage's state, and making the
// gestures a visitor makes, with what each engine offers.
//   Chromium, touch projects   a finger on the glass, through CDP (Input.dispatchTouchEvent): the
//                              browser makes the scroll and the fling out of it itself
//   Chromium, pointer project  the mouse wheel and the keyboard
//   WebKit                     the keyboard; the mouse wheel in a second context without `isMobile`
//                              (Playwright's mobile WebKit refuses wheel events, and it has no CDP)
import { expect, type Browser, type BrowserContext, type CDPSession, type Page, type TestInfo } from '@playwright/test';

export const BASE = '/horror';
export const VIDEO = /\/corridor\/(d|m)\/(walk|walk-door)\.(av1|h264)\.mp4$/;
export const STILL = /\/corridor\/(d|m)\/(first|last|still-1|still-2)\.webp$/;
export const POSTER = /\/corridor\/poster-(d|m)\.webp$/;
export const SEEN_KEY = 'hotel:corridor';
export const SCARE_KEY = 'hotel:scare';

export type Gesture = 'touch' | 'wheel' | 'key';
export type Variant = 'scare' | 'plain';

export interface Cue {
  cap: number;
  in: number;
  out?: number;
}
export interface ClipInfo {
  duration: number;
  frames: number;
  cues: Cue[];
  sources: { codec: string; src: string; type: string }[];
  scare?: { at: number; end: number; rect: number[] };
}
export interface SetInfo {
  w: number;
  h: number;
  poster: string;
  first: string;
  last: string;
  stills: string[];
  clips: Record<Variant, ClipInfo>;
}

export interface Open {
  lang?: string;
  // how fast the clip plays (a hook the page reads; 1 is the real speed). Most tests are about
  // what happens, not how long it takes, and play fast: as fast as the decoder manages, which
  // on a CI runner decoding in software may be little faster than real time.
  rate?: number;
  // offer only this codec, or 'none'
  codec?: string;
  // a session that has seen the corridor already
  seen?: boolean;
  // a browser that starts no video by itself: play() is refused unless a click has just been made
  refuse?: boolean;
}
export async function open(page: Page, opts: Open = {}) {
  // The lift preloader plays once per session; tests start after it.
  await page.addInitScript(
    ([rate, codec, seen, refuse, key]) => {
      sessionStorage.setItem('hotel:lift', '1');
      if (seen) sessionStorage.setItem(key as string, '1');
      const w = window as unknown as { __corridorRate?: number; __corridorCodec?: string };
      if (rate) w.__corridorRate = rate as number;
      if (codec) w.__corridorCodec = codec as string;
      if (refuse) {
        const play = HTMLMediaElement.prototype.play;
        let clicked = -1e9;
        window.addEventListener('click', (e) => e.isTrusted && (clicked = performance.now()), true);
        HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
          return performance.now() - clicked < 1000 ? play.call(this) : Promise.reject(new DOMException('play() was refused', 'NotAllowedError'));
        };
      }
    },
    [opts.rate ?? 0, opts.codec ?? '', opts.seen ?? false, opts.refuse ?? false, SEEN_KEY] as [number, string, boolean, boolean, string],
  );
  await page.goto(`${BASE}/${opts.lang ?? 'ro'}/`);
}

export const stage = (page: Page) => page.locator('[data-corridor]');
export const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
export const attr = (page: Page, key: string) => stage(page).getAttribute(`data-${key}`);
// The clip on the stage (the newest, where the one before it is still fading out under a still).
export const video = (page: Page) => page.locator('#corridor video').last();
export const skip = (page: Page) => page.locator('[data-corr-skip]');
export const replay = (page: Page) => page.locator('[data-corr-replay]');
export const tap = (page: Page) => page.locator('[data-corr-tap]');
// The stills (the stage carries data-pic for each), and the small poster that comes with the
// page and lies under them all.
export const pic = (page: Page, name: string) => page.locator(`img[data-pic="${name}"]`);
export const poster = (page: Page) => page.locator('#corridor img[data-poster]');

export async function setInfo(page: Page): Promise<{ name: string; set: SetInfo }> {
  const manifest = JSON.parse((await attr(page, 'manifest')) ?? '{}');
  const name = (await attr(page, 'set')) ?? '';
  return { name, set: manifest.sets[name] };
}

// Where the page is when the corridor's top is at the top of the screen (the script measures it).
export async function topOf(page: Page): Promise<number> {
  await expect(stage(page)).toHaveAttribute('data-top', /^\d+$/);
  return Number(await attr(page, 'top'));
}
// Where the corridor's top is on the screen right now.
export const corridorTop = (page: Page) => page.locator('#corridor').evaluate((el) => Math.round(el.getBoundingClientRect().top));

// Put the page somewhere without a gesture, as a reload would. The corridor catches only a
// scroll the visitor is making, so this never starts it.
export async function jumpTo(page: Page, y: number) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
}

// The page has stopped moving: no scroll event for half a second, heard inside the page (two
// readings that agree prove nothing on an engine that draws ten frames a second), and then two
// readings that agree.
export async function settledY(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let timer = 0;
        const quiet = () => {
          window.removeEventListener('scroll', heard);
          resolve();
        };
        const heard = () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(quiet, 500);
        };
        window.addEventListener('scroll', heard, { passive: true });
        heard();
      }),
  );
  let last = NaN;
  await expect
    .poll(
      async () => {
        const now = await scrollY(page);
        const same = now === last;
        last = now;
        return same;
      },
      { timeout: 10000, intervals: [200] },
    )
    .toBe(true);
  return last;
}

const sessions = new WeakMap<Page, CDPSession>();
async function cdp(page: Page) {
  let s = sessions.get(page);
  if (!s) {
    s = await page.context().newCDPSession(page);
    sessions.set(page, s);
  }
  return s;
}

// What is on the screen right now, as a PNG of the whole viewport, asked of Chromium directly
// and with no clip. Playwright's own screenshot works out a clip from the scroll position
// first, and on a page that is gliding the picture it then takes is of a later moment, cut at
// the old offset: a stage that fills the screen came out half a screen lower and read as black.
export async function viewportShot(page: Page): Promise<Buffer> {
  const { data } = await (await cdp(page)).send('Page.captureScreenshot', { format: 'png' });
  return Buffer.from(data, 'base64');
}

export interface Swipe {
  distance?: number;
  speed?: number;
  fling?: boolean;
}
// One finger swipe. dir 1 moves the page forwards (the finger goes up).
// The finger is put down, moved and lifted as touch events with their own times, sixteen
// milliseconds apart and sent at that pace; the browser recognises the drag and, from the speed
// the finger had when it left, the fling. (Input.synthesizeScrollGesture would be one call, but
// with a touch source it does nothing at all in headless Chromium on Linux, which is where the
// suite runs before a deploy.) Without a fling the finger rests before it lifts.
export async function swipe(page: Page, dir: 1 | -1, o: Swipe = {}) {
  const vp = page.viewportSize()!;
  const distance = Math.min(o.distance ?? 300, vp.height - 120);
  const speed = o.speed ?? 1600;
  const x = Math.round(vp.width / 2);
  const from = dir > 0 ? Math.min(vp.height - 30, Math.max(vp.height * 0.8, distance + 60)) : Math.max(30, Math.min(vp.height * 0.25, vp.height - distance - 60));
  const session = await cdp(page);
  const steps = Math.max(4, Math.round(((distance / speed) * 1000) / 16));
  const t0 = Date.now();
  const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number, at: number) => {
    const wait = t0 + at - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: Math.round(y), id: 1 }], timestamp: (t0 + at) / 1000 });
  };
  await send('touchStart', from, 0);
  let at = 0;
  for (let i = 1; i <= steps; i++) {
    at += 16;
    await send('touchMove', from - (dir * distance * i) / steps, at);
  }
  const to = from - dir * distance;
  if (o.fling === false) {
    for (let i = 0; i < 8; i++) {
      at += 24;
      await send('touchMove', to, at);
    }
  }
  await send('touchEnd', to, at + 4);
}

// WebKit's Linux port is the one the suite meets on the CI runner. It is not Safari and not a
// phone, which is why its job there reports and does not hold a deploy back
// (.github/workflows/deploy.yml). It draws this page about ten times a second on a runner, so
// where a test counts positions or frames it says so and allows for it.
export const linuxWebKit = (page: Page) => process.platform === 'linux' && page.context().browser()?.browserType().name() === 'webkit';

// One hard gesture, the kind that carries a page several screens: a fast flick with its
// fling, a long turn of the wheel, or the Page keys.
export async function fling(page: Page, kind: Gesture, dir: 1 | -1 = 1) {
  if (kind === 'touch') return swipe(page, dir, { distance: 700, speed: 9000 });
  if (kind === 'wheel') {
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, dir * 300);
      await page.waitForTimeout(16);
    }
    return;
  }
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press(dir > 0 ? 'PageDown' : 'PageUp');
    await page.waitForTimeout(250);
  }
}

// A second, deliberate gesture while the page is held: a strong swipe, or a new burst of the
// wheel once the one that led here is well over. (Two notches, which is as much as it takes:
// a third would land on the page that has just been let go, and a wheel turned under a glide
// stops the glide.)
export async function again(page: Page, kind: 'touch' | 'wheel', dir: 1 | -1 = 1) {
  if (kind === 'touch') return swipe(page, dir, { distance: 300, speed: 1600 });
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, dir * 130);
    await page.waitForTimeout(40);
  }
}

// Which gestures a project can make, and a page to make them on. WebKit's wheel needs a
// context of its own, without `isMobile`.
export function gesturesOf(info: TestInfo): Gesture[] {
  const use = info.project.use;
  if (use.browserName === 'webkit') return ['key', 'wheel'];
  return use.hasTouch ? ['touch', 'key'] : ['wheel', 'key'];
}
export async function pageFor(browser: Browser, info: TestInfo, kind: Gesture, extra: Parameters<Browser['newContext']>[0] = {}): Promise<{ context: BrowserContext; page: Page }> {
  const use = info.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    isMobile: use.browserName === 'webkit' && kind === 'wheel' ? false : use.isMobile,
    ...extra,
  });
  return { context, page: await context.newPage() };
}

// The first input a visitor makes, without scrolling anywhere: a key that does nothing.
export async function wake(page: Page) {
  await page.keyboard.press('Shift');
}

// The clip the next play needs is fetched, warm and back on its first frame. Returns the codec
// the browser took, or 'none' where it plays neither (WebKit on a CI runner may decode
// nothing: the corridor then shows its stills and the tests say which they saw).
export async function primed(page: Page, variant: Variant = 'scare') {
  await wake(page);
  await expect
    .poll(async () => ((await attr(page, 'codec')) === 'none' ? 'none' : ((await attr(page, 'primed')) ?? '')), { timeout: 30000, message: `the ${variant} clip is fetched and warm` })
    .toMatch(new RegExp(`^(none|${variant})$`));
  return (await attr(page, 'codec')) ?? 'none';
}

// The page is held and the corridor fills the screen, exactly.
export async function expectHeld(page: Page, message = '') {
  await expect(stage(page), `${message} held`).toHaveAttribute('data-lock', '1', { timeout: 10000 });
  expect(Math.abs(await corridorTop(page)), `${message}: the corridor's top is at the top of the screen`).toBeLessThanOrEqual(1);
  const box = await stage(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // (as wide as the header, which is fixed across the screen: where a scrollbar takes room, both stop at it)
    return { position: s.position, touch: s.touchAction, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), vw: Math.round(document.querySelector('header')!.getBoundingClientRect().width), vh: window.innerHeight, body: getComputedStyle(document.body).position, root: getComputedStyle(document.documentElement).overflowY };
  });
  expect(box.position, `${message}: the stage is fixed`).toBe('fixed');
  expect(box.touch).toBe('none');
  expect([box.top, box.left], `${message}: over the whole screen`).toEqual([0, 0]);
  expect(box.w).toBe(box.vw);
  expect(box.h).toBeGreaterThanOrEqual(box.vh);
  expect(box.body, `${message}: the page is held`).toBe('fixed');
  expect(['hidden', 'scroll']).toContain(box.root);
}

// The page has been let go: nothing fixed, nothing hidden, scrolling as before.
export async function expectFree(page: Page, message = '') {
  await expect(stage(page), `${message} let go`).toHaveAttribute('data-lock', '0', { timeout: 30000 });
  const box = await stage(page).evaluate((el) => ({ position: getComputedStyle(el).position, body: getComputedStyle(document.body).position, top: document.body.style.top, root: document.documentElement.className }));
  expect(box.position).toBe('relative');
  expect(box.body).not.toBe('fixed');
  expect(box.top).toBe('');
  expect(box.root).not.toContain('corr-lock');
}

// Every hold the page has made so far, in milliseconds (the script measures each one).
export const holds = (page: Page) => page.evaluate(() => performance.getEntriesByName('corridor:lock').map((e) => Math.round(e.duration)));
// None of them outlasted the clip by more than the second the script allows itself (and what a
// busy machine adds to a timer). `slow` is the playing speed where a test plays slower than real.
export async function expectHoldsBounded(page: Page, clip: ClipInfo, message = '', slow = 1) {
  const all = await holds(page);
  const most = (clip.duration * 1000) / slow + 1000;
  for (const ms of all) expect(ms, `${message} holds so far ${all.join(', ')} ms; the clip is ${clip.duration} s`).toBeLessThanOrEqual(most + 400);
  return all;
}

// The clip is on the stage and moving: its time advances and frames of it reach the screen.
export async function expectPlaying(page: Page, message = '') {
  await expect(stage(page), `${message} playing`).toHaveAttribute('data-state', 'play', { timeout: 10000 });
  await expect(stage(page), `${message}: the clip is shown`).toHaveAttribute('data-mode', 'video', { timeout: 10000 });
  const seen = await video(page).evaluate(
    (el) =>
      new Promise<{ t0: number; t1: number; frames: number; counts: boolean; over: boolean; on: boolean; muted: boolean; inline: boolean; controls: boolean }>((resolve) => {
        const v = el as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void };
        const t0 = v.currentTime;
        let frames = 0;
        const count = () => {
          frames++;
          v.requestVideoFrameCallback?.(count);
        };
        v.requestVideoFrameCallback?.(count);
        const started = performance.now();
        const look = () => {
          // a few frames and some time, or the clip's own end
          const over = v.ended || !v.isConnected;
          if ((v.currentTime > t0 + 0.2 && (frames >= 3 || !v.requestVideoFrameCallback)) || over || performance.now() - started > 8000) resolve({ t0, t1: over ? t0 + 1 : v.currentTime, frames, counts: Boolean(v.requestVideoFrameCallback), over, on: over || v.classList.contains('is-on'), muted: v.muted, inline: v.playsInline, controls: v.controls });
          else requestAnimationFrame(look);
        };
        look();
      }),
  );
  expect(seen.t1, `${message}: the clip's time advances`).toBeGreaterThan(seen.t0);
  if (seen.counts && !seen.over) expect(seen.frames, `${message}: frames are presented`).toBeGreaterThanOrEqual(3);
  expect(seen.on, `${message}: the clip is the layer on top`).toBe(true);
  expect([seen.muted, seen.inline, seen.controls]).toEqual([true, true, false]);
}

// The stage at rest after the clip: the last door, its caption, the Replay button.
export async function expectRest(page: Page, message = '') {
  const s = stage(page);
  await expect(s, `${message} at rest`).toHaveAttribute('data-state', 'idle', { timeout: 30000 });
  await expect(s, `${message} seen`).toHaveAttribute('data-seen', '1');
  await expect(pic(page, 'last'), `${message}: the last door`).toHaveClass(/is-on/);
  await expect.poll(() => pic(page, 'last').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { message: `${message}: the last door has loaded` }).toBe(true);
  await expect(skip(page)).toBeHidden();
  await expect(tap(page)).toBeHidden();
  const on = await page.locator('[data-cap]').evaluateAll((els) => els.map((el, i) => (el.classList.contains('is-on') ? i : -1)).filter((i) => i >= 0));
  expect(on, `${message}: the last caption alone`).toEqual([3]);
  // no clip is left running
  expect(await page.locator('#corridor video').evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length)).toBe(0);
}

// The page has gone on to the next section and stopped right under the header.
export async function expectOnNext(page: Page, message = '') {
  await expect(page.locator('#file'), `${message}: the next section`).toBeInViewport({ timeout: 10000 });
  await settledY(page);
  const top = await page.locator('#file').evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const header = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
  // (WebKit's Linux build comes to rest some pixels short of where a glide was going)
  expect(Math.abs(top - header), `${message}: the next section starts right under the header`).toBeLessThanOrEqual(linuxWebKit(page) ? 24 : 2);
}
