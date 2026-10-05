// Shared by the corridor tests: opening the page, reading the stage's state, and making the
// gestures a visitor makes, with what each engine offers.
//   Chromium, touch projects   real touch scroll gestures through CDP (Input.synthesizeScrollGesture)
//   Chromium, pointer project  the mouse wheel and the keyboard
//   WebKit                     the keyboard; the mouse wheel in a second context without `isMobile`
//                              (Playwright's mobile WebKit refuses wheel events, and it has no CDP)
import { expect, type Browser, type BrowserContext, type CDPSession, type Page, type TestInfo } from '@playwright/test';

export const BASE = '/horror';
export const VIDEO = /\/corridor\/(d|m)\/(c1|c2|c3|c3s)\.(av1|h264)\.mp4$/;
export const POSE = /\/corridor\/(d|m)\/p([0-3])\.webp$/;
export const POSTER = /\/corridor\/poster-(d|m)\.webp$/;
export const SCARE_KEY = 'hotel:scare';

export type Gesture = 'touch' | 'wheel' | 'key';

export interface Cue {
  cap: number;
  in: number;
  out?: number;
}
export interface FileInfo {
  duration: number;
  cues: Cue[];
  sources: { codec: string; src: string; type: string }[];
  scare?: { at: number; end: number; rect: number[] };
}
export interface SetInfo {
  w: number;
  h: number;
  poster: string;
  poses: string[];
  files: Record<'c1' | 'c2' | 'c3' | 'c3s', FileInfo>;
}

// rate: how fast the chapters play (a hook the page reads; 1 is the real speed). Most tests
// are about what happens, not how long it takes, and play fast.
export async function open(page: Page, opts: { lang?: string; rate?: number; codec?: string } = {}) {
  // The lift preloader plays once per session; tests start after it.
  await page.addInitScript(
    ([rate, codec]) => {
      sessionStorage.setItem('hotel:lift', '1');
      const w = window as unknown as { __corridorRate?: number; __corridorCodec?: string };
      if (rate) w.__corridorRate = rate as number;
      if (codec) w.__corridorCodec = codec as string;
    },
    [opts.rate ?? 0, opts.codec ?? ''] as [number, string],
  );
  await page.goto(`${BASE}/${opts.lang ?? 'ro'}/`);
}

export const stage = (page: Page) => page.locator('[data-corridor]');
export const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
export const attr = (page: Page, key: string) => stage(page).getAttribute(`data-${key}`);

export async function setInfo(page: Page): Promise<{ name: string; set: SetInfo }> {
  const manifest = JSON.parse((await attr(page, 'manifest')) ?? '{}');
  const name = (await attr(page, 'set')) ?? '';
  return { name, set: manifest.sets[name] };
}

// Where the page rests for each stop (the script works them out from the section's size).
export async function stopsOf(page: Page): Promise<number[]> {
  await expect(stage(page)).toHaveAttribute('data-stops', /\d+ \d+ \d+ \d+/);
  return ((await attr(page, 'stops')) ?? '').split(' ').map(Number);
}

// Put the page on a stop without a gesture, at rest, as a reload inside the corridor would.
export async function jumpTo(page: Page, y: number) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
}

// The page has stopped moving.
export async function settledY(page: Page) {
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

// The stage is at `chapter`, at rest, and the page rests on that chapter's stop.
export async function expectRest(page: Page, chapter: number, stops: number[], message = '') {
  const s = stage(page);
  await expect(s, `${message} chapter`).toHaveAttribute('data-chapter', String(chapter), { timeout: 15000 });
  await expect(s, `${message} at rest`).toHaveAttribute('data-state', 'rest', { timeout: 30000 });
  await expect(s, `${message} pose`).toHaveAttribute('data-pose', String(chapter));
  await expect.poll(async () => Math.abs((await scrollY(page)) - stops[chapter]), { timeout: 10000, message: `${message}: the page rests on stop ${chapter}` }).toBeLessThanOrEqual(2);
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

export interface Swipe {
  distance?: number;
  speed?: number;
  fling?: boolean;
}
// One finger swipe. dir 1 moves the page forwards (the finger goes up).
export async function swipe(page: Page, dir: 1 | -1, o: Swipe = {}) {
  const vp = page.viewportSize()!;
  const distance = o.distance ?? 300;
  await (await cdp(page)).send('Input.synthesizeScrollGesture', {
    x: Math.round(vp.width / 2),
    y: Math.round(dir > 0 ? vp.height * 0.8 : vp.height * 0.25),
    yDistance: -dir * distance,
    speed: o.speed ?? 1600,
    gestureSourceType: 'touch',
    preventFling: o.fling === false,
  });
}

// One gesture, as a visitor makes it: a swipe with its fling, a turn of the wheel (three
// notches in quick succession), or one key.
export async function gesture(page: Page, kind: Gesture, dir: 1 | -1, key?: string) {
  if (kind === 'touch') return swipe(page, dir);
  if (kind === 'wheel') {
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, dir * 100);
      await page.waitForTimeout(40);
    }
    return;
  }
  await page.keyboard.press(key ?? (dir > 0 ? 'ArrowDown' : 'ArrowUp'));
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

// The picture of a stop (the stage itself carries data-pose too: which one it rests on), and
// the small poster that comes with the page and lies under them all.
export const pose = (page: Page, k: number) => page.locator(`img[data-pose="${k}"]`);
export const poster = (page: Page) => page.locator('#corridor img[data-poster]');

// Does this browser play the corridor's video at all? (WebKit on a CI runner may not decode
// either codec; the chapters then run as crossfades and the tests say which they saw.)
export async function codecOf(page: Page) {
  await wake(page);
  await expect(stage(page)).toHaveAttribute('data-codec', /.+/, { timeout: 10000 });
  return (await attr(page, 'codec')) ?? 'none';
}
