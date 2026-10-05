// The corridor: three chapters of video on a sticky stage, one gesture each, and the door that
// opens once. Everything is asserted on state the stage exposes (data attributes), on the scroll
// position, on the network and on the video itself, never on timing luck.
//
// The gestures are the real ones each engine can make (see corridor.util.ts): touch swipes
// through CDP in Chromium's touch project, the wheel and the keyboard in its pointer project,
// the keyboard and the wheel in WebKit.
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { BASE, POSE, POSTER, SCARE_KEY, VIDEO, attr, codecOf, expectRest, gesture, gesturesOf, jumpTo, open, pageFor, pose, poster, scrollY, setInfo, settledY, stage, stopsOf, swipe, wake, type Gesture, type SetInfo } from './corridor.util';

// sharp comes with Astro; only this much of it is used here
type Sharp = (input: Buffer) => { removeAlpha: () => { raw: () => { toBuffer: (o: { resolveWithObject: true }) => Promise<{ data: Buffer }> } } };
const sharp = createRequire(import.meta.url)('sharp') as Sharp;

const KINDS: Gesture[] = ['touch', 'wheel', 'key'];
const caps = (page: Page) => page.locator('[data-cap]');
const capsOn = (page: Page) => caps(page).evaluateAll((els) => els.map((el, i) => (el.classList.contains('is-on') ? i : -1)).filter((i) => i >= 0));
const setRate = (page: Page, rate: number) =>
  page.evaluate((r) => {
    (window as unknown as { __corridorRate: number }).__corridorRate = r;
  }, rate);
const videoRequests = (page: Page) => {
  const seen: string[] = [];
  page.on('request', (r) => {
    const m = VIDEO.exec(new URL(r.url()).pathname);
    if (m) seen.push(`${m[2]}.${m[3]}`);
  });
  return seen;
};

for (const kind of KINDS) {
  test(`${kind}: one gesture advances exactly one chapter, three reach the last door, a fourth leaves the corridor`, async ({ browser }, info) => {
    test.skip(!gesturesOf(info).includes(kind), `this project makes no ${kind} gestures`);
    test.slow();
    const { context, page } = await pageFor(browser, info, kind);
    await open(page, { rate: 6 });
    const stops = await stopsOf(page);
    await jumpTo(page, stops[0]);
    await expectRest(page, 0, stops, 'at the start');
    expect(await capsOn(page), 'no caption before the first chapter').toEqual([]);

    for (const k of [1, 2, 3]) {
      await gesture(page, kind, 1);
      // exactly one: the stage says so at once, and it comes to rest there, on that stop
      await expect(stage(page), `gesture ${k}`).toHaveAttribute('data-chapter', String(k));
      await expectRest(page, k, stops, `after gesture ${k}`);
    }
    // the last door: the walk has arrived, the last caption is up and it is the only one
    expect(await capsOn(page)).toEqual([3]);
    await expect.poll(async () => Number(await caps(page).nth(3).evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.99);

    // a fourth gesture leaves normally: the next section comes into view and nothing pulls back
    await gesture(page, kind, 1, 'PageDown');
    const end = await settledY(page);
    expect(end, 'the page moved on past the last stop').toBeGreaterThan(stops[3] + 20);
    const fileTop = await page.locator('#file').evaluate((el) => el.getBoundingClientRect().top);
    expect(fileTop, 'the top of the next section is on screen').toBeLessThan(page.viewportSize()!.height);
    await page.waitForTimeout(900);
    expect(await scrollY(page), 'no snap pulls the page back').toBe(end);
    await expect(stage(page)).toHaveAttribute('data-chapter', '3');
    await context.close();
  });

  test(`${kind}: scrolling back brings the previous end pose and plays nothing`, async ({ browser }, info) => {
    test.skip(!gesturesOf(info).includes(kind), `this project makes no ${kind} gestures`);
    const { context, page } = await pageFor(browser, info, kind);
    await open(page, { rate: 6 });
    const stops = await stopsOf(page);
    await jumpTo(page, stops[0]);
    await expectRest(page, 0, stops);
    await gesture(page, kind, 1);
    await expectRest(page, 1, stops);
    await gesture(page, kind, 1);
    await expectRest(page, 2, stops);
    const played = Number(await attr(page, 'played'));
    // from here on, every state the stage goes through is written down
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-corridor]')!;
      const log: string[] = [];
      (window as unknown as { __states: string[] }).__states = log;
      new MutationObserver(() => log.push(`${el.dataset.chapter}:${el.dataset.state}`)).observe(el, { attributes: true, attributeFilter: ['data-state', 'data-chapter'] });
    });
    await gesture(page, kind, -1);
    await expectRest(page, 1, stops, 'one gesture back');
    expect(await capsOn(page), 'the caption of the stop it went back to').toEqual([0]);
    const states = await page.evaluate(() => (window as unknown as { __states: string[] }).__states);
    expect(states.filter((s) => s.endsWith(':play')), 'nothing played on the way back').toEqual([]);
    expect(Number(await attr(page, 'played'))).toBe(played);
    // and no video is left running or showing
    await expect.poll(() => page.locator('.corr__video').evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length)).toBe(0);
    await expect(pose(page, 1)).toHaveClass(/is-on/);
    await context.close();
  });
}

test('a second gesture while a chapter plays cuts it to its end pose and starts the next', async ({ browser }, info) => {
  const kind = gesturesOf(info)[0];
  const { context, page } = await pageFor(browser, info, kind);
  await open(page, { rate: 1 });
  const stops = await stopsOf(page);
  await jumpTo(page, stops[0]);
  await expectRest(page, 0, stops);
  await gesture(page, kind, 1);
  await expect(stage(page)).toHaveAttribute('data-chapter', '1');
  await expect(stage(page)).toHaveAttribute('data-state', 'play');
  await page.waitForTimeout(700);
  await expect(stage(page), 'chapter 1 takes five seconds: it is still playing').toHaveAttribute('data-state', 'play');
  await setRate(page, 8);
  await gesture(page, kind, 1);
  await expect(stage(page), 'the second gesture is not blocked').toHaveAttribute('data-chapter', '2');
  await expectRest(page, 2, stops, 'after the second gesture');
  expect(await capsOn(page)).toEqual([1]);
  await context.close();
});

test('the door opens once: not on a second pass, and not after a reload in the same session', async ({ page }, info) => {
  test.slow();
  const requested = videoRequests(page);
  await open(page, { rate: 8 });
  const stops = await stopsOf(page);
  const { set } = await setInfo(page);
  const sc = set.files.c3s.scare!;
  expect(sc, 'the manifest describes the beat').toBeTruthy();
  expect(sc.end - sc.at, 'the beat is 15 frames at 24 a second').toBeCloseTo(0.625, 2);
  const codec = await codecOf(page);
  const real = codec !== 'none';
  expect(await page.evaluate((k) => sessionStorage.getItem(k), SCARE_KEY)).toBeNull();

  // up to door 305 quickly, then chapter 3 at its real speed, watched frame by frame
  await jumpTo(page, stops[2]);
  await expectRest(page, 2, stops);
  await setRate(page, 1);
  const watched =
    real && info.project.use.browserName === 'chromium'
      ? page.evaluate(
          ([at, end]) =>
            new Promise<{ inBeat: number; change: number; times: number[] }>((resolve) => {
              const find = () => {
                const v = document.querySelector<HTMLVideoElement>('.corr__video[data-file="c3s"]');
                if (!v) return void requestAnimationFrame(find);
                const c = document.createElement('canvas');
                c.width = 72;
                c.height = Math.round((72 * v.videoHeight) / Math.max(1, v.videoWidth)) || 72;
                const g = c.getContext('2d', { willReadFrequently: true })!;
                let held: Uint8ClampedArray | null = null;
                let change = 0;
                const times: number[] = [];
                const onFrame = (_now: number, meta: { mediaTime: number }) => {
                  const t = meta.mediaTime;
                  if (t > end + 0.3) return resolve({ inBeat: times.length, change, times });
                  if (t >= at - 0.09 && t < end) {
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
                  (v as unknown as { requestVideoFrameCallback: (cb: typeof onFrame) => void }).requestVideoFrameCallback(onFrame);
                };
                (v as unknown as { requestVideoFrameCallback: (cb: typeof onFrame) => void }).requestVideoFrameCallback(onFrame);
              };
              find();
            }),
          [sc.at, sc.end] as [number, number],
        )
      : null;

  // first pass
  await page.keyboard.press('ArrowDown');
  await expect(stage(page)).toHaveAttribute('data-chapter', '3');
  await expect(stage(page)).toHaveAttribute('data-variant', 'scare');
  expect(requested.filter((r) => r.startsWith('c3')), 'only the variant with the beat was fetched').toEqual([`c3s.${codec}`].filter(() => real));
  if (real) {
    await expect(stage(page), 'the beat was on screen').toHaveAttribute('data-scare-beats', '1', { timeout: 20000 });
    expect(await page.evaluate((k) => sessionStorage.getItem(k), SCARE_KEY)).toBe('1');
    if (watched) {
      const seen = await watched;
      // really presented: most of its 15 frames reached the screen, and the door moved
      expect(seen.inBeat, `frames of the beat presented (${seen.times.map((t) => t.toFixed(3)).join(' ')})`).toBeGreaterThanOrEqual(10);
      expect(seen.change, 'the picture changed while the door was open').toBeGreaterThan(1.5);
    }
  } else {
    // no video here: the chapter is a crossfade, nothing of the beat is shown, and it stays owed
    await expect(stage(page)).toHaveAttribute('data-mode', 'poster');
    await expect(stage(page)).toHaveAttribute('data-scare-beats', '0');
  }
  // the rest of the walk to the last door, quickly
  await setRate(page, 8);
  await page.locator('.corr__video').evaluateAll((vs) => vs.forEach((v) => ((v as HTMLVideoElement).playbackRate = 8)));
  await expectRest(page, 3, stops, 'first pass');

  // back one stop and forwards again: a closed door
  requested.length = 0;
  await page.keyboard.press('ArrowUp');
  await expectRest(page, 2, stops, 'back');
  await page.keyboard.press('ArrowDown');
  await expect(stage(page)).toHaveAttribute('data-chapter', '3');
  await expectRest(page, 3, stops, 'second pass');
  if (real) {
    await expect(stage(page)).toHaveAttribute('data-variant', 'plain');
    await expect(stage(page), 'still one').toHaveAttribute('data-scare-beats', '1');
    expect(requested.filter((r) => r.startsWith('c3s')), 'the variant with the beat is not fetched again').toEqual([]);
    expect(requested.filter((r) => r.startsWith('c3.'))).toEqual([`c3.${codec}`]);
  } else {
    await expect(stage(page)).toHaveAttribute('data-scare-beats', '0');
  }

  // reload, same session: the door stays shut and the beat is never even fetched
  requested.length = 0;
  await page.reload();
  await expect(stage(page)).toHaveAttribute('data-scare-beats', '0');
  await jumpTo(page, stops[2]);
  await expectRest(page, 2, stops, 'after the reload');
  await page.keyboard.press('ArrowDown');
  await expect(stage(page)).toHaveAttribute('data-chapter', '3');
  await expectRest(page, 3, stops, 'after the reload');
  if (real) {
    await expect(stage(page)).toHaveAttribute('data-variant', 'plain');
    await expect(stage(page)).toHaveAttribute('data-scare-beats', '0');
    expect(requested.filter((r) => r.startsWith('c3s')), 'no file with the beat after it has played').toEqual([]);
    expect(await page.evaluate((k) => sessionStorage.getItem(k), SCARE_KEY)).toBe('1');
  }
});

test('a visitor who skips past door 308 before it opens keeps the scare for the next pass', async ({ page }) => {
  await open(page, { rate: 1 });
  const stops = await stopsOf(page);
  const codec = await codecOf(page);
  test.skip(codec === 'none', 'this browser plays no video, so there is no beat to keep');
  await jumpTo(page, stops[2]);
  await expect(stage(page)).toHaveAttribute('data-chapter', '2');
  await page.keyboard.press('ArrowDown');
  await expect(stage(page)).toHaveAttribute('data-chapter', '3');
  await expect(stage(page)).toHaveAttribute('data-variant', 'scare');
  await expect(stage(page), 'chapter 3 is under way').toHaveAttribute('data-mode', 'video', { timeout: 15000 });
  // one second in, four before the door: leave by the skip link
  await page.waitForTimeout(1000);
  await page.locator('[data-corr-skip]').click();
  await expect(page.locator('#file')).toBeInViewport({ timeout: 8000 });
  await expect(stage(page)).toHaveAttribute('data-scare-beats', '0');
  expect(await page.evaluate((k) => sessionStorage.getItem(k), SCARE_KEY), 'not counted').toBeNull();
  // the next forward pass still gets it
  await setRate(page, 1);
  await jumpTo(page, stops[2]);
  await expectRest(page, 2, stops);
  await page.keyboard.press('ArrowDown');
  await expect(stage(page)).toHaveAttribute('data-variant', 'scare');
  await expect(stage(page)).toHaveAttribute('data-scare-beats', '1', { timeout: 20000 });
});

test('a hard fling passes the corridor: flings in a row from the top of the page reach the check-in card', async ({ browser }, info) => {
  test.slow();
  const kind: Gesture = gesturesOf(info).includes('touch') ? 'touch' : 'wheel';
  const { context, page } = await pageFor(browser, info, kind);
  await open(page);
  const stops = await stopsOf(page);
  const started = Date.now();
  const positions: number[] = [];
  const reached = () => page.locator('#checkin').evaluate((el) => el.getBoundingClientRect().top < window.innerHeight);
  let flings = 0;
  while (!(await reached())) {
    expect(flings, `flings so far, positions ${positions.join(' ')}`).toBeLessThan(30);
    if (kind === 'touch') await swipe(page, 1, { distance: 700, speed: 9000 });
    else {
      await page.mouse.move(200, 400);
      await page.mouse.wheel(0, 2400);
    }
    flings++;
    await page.waitForTimeout(120);
    positions.push(await scrollY(page));
  }
  // bounded: the corridor is five screens of a page fifteen or so screens long
  expect(Date.now() - started, `${flings} flings`).toBeLessThan(40000);
  // never stuck: every fling moved the page on
  for (let i = 1; i < positions.length; i++) expect(positions[i], `fling ${i + 1} moved the page (${positions.join(' ')})`).toBeGreaterThan(positions[i - 1]);
  expect(positions.filter((p) => p > stops[0] && p < stops[3] - 2).length, 'flings that ended inside the corridor').toBeLessThanOrEqual(4);
  // and the stage it left behind is at rest on the last door
  await expect(stage(page)).toHaveAttribute('data-chapter', '3');
  await expect(stage(page)).toHaveAttribute('data-state', 'rest', { timeout: 15000 });
  await expect(stage(page)).toHaveAttribute('data-pose', '3');
  await context.close();
});

test('the skip link leaves the corridor from the keyboard', async ({ page }) => {
  await open(page, { rate: 6 });
  const stops = await stopsOf(page);
  const skip = page.locator('[data-corr-skip]');
  await expect(skip).toHaveAttribute('href', '#file');
  expect((await skip.innerText()).trim().length).toBeGreaterThan(2);
  // reached with Tab alone, in the page's own order
  // (Safari walks links with Option+Tab unless the visitor has changed its setting)
  const tab = test.info().project.use.browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  let focused = false;
  for (let i = 0; i < 40 && !focused; i++) {
    await page.keyboard.press(tab);
    focused = await skip.evaluate((el) => el === document.activeElement);
  }
  expect(focused, 'the link is in the tab order').toBe(true);
  const style = await skip.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { outline: s.outlineStyle, width: parseFloat(s.outlineWidth), w: r.width, h: r.height, visible: el.matches(':focus-visible') };
  });
  expect(style.visible, 'focus is shown').toBe(true);
  expect(style.outline).not.toBe('none');
  expect(style.width).toBeGreaterThanOrEqual(2);
  expect(style.w, '44 px to touch').toBeGreaterThanOrEqual(44);
  expect(style.h).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(page.locator('#file')).toBeInViewport({ timeout: 8000 });
  const y = await settledY(page);
  expect(y, 'past the last stop').toBeGreaterThan(stops[3]);
  const top = await page.locator('#file').evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const header = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
  expect(Math.abs(top - header), 'the next section starts right under the header').toBeLessThanOrEqual(2);
  expect(new URL(page.url()).hash).toBe('#file');
  await expect(stage(page)).toHaveAttribute('data-chapter', '3');
  await expect(stage(page)).toHaveAttribute('data-state', 'rest', { timeout: 15000 });
});

test('nothing but one small poster loads with the page; each chapter fetches the next while it plays', async ({ page }) => {
  test.slow();
  const videos = videoRequests(page);
  const poses: string[] = [];
  const posters: { url: string; bytes: number }[] = [];
  page.on('request', (r) => {
    const m = POSE.exec(new URL(r.url()).pathname);
    if (m) poses.push(m[2]);
  });
  page.on('response', async (r) => {
    if (POSTER.test(new URL(r.url()).pathname)) posters.push({ url: r.url(), bytes: (await r.body()).length });
  });
  await open(page, { rate: 6 });
  await page.waitForLoadState('load');
  expect(videos, 'no video requested during load').toEqual([]);
  expect(poses, 'no pose requested during load').toEqual([]);
  // nor in the first moments after it, while nobody has touched anything
  await page.waitForTimeout(1500);
  expect(videos, 'no video requested before the first input').toEqual([]);
  expect(poses).toEqual([]);
  expect(await page.locator('video').count(), 'no video element either').toBe(0);
  await expect.poll(() => posters.length).toBe(1);
  expect(posters[0].bytes).toBeLessThan(16 * 1024);
  // the poster is on the stage
  expect(await poster(page).evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);

  // first input: the four poses and chapter 1, nothing more
  const codec = await codecOf(page);
  await expect.poll(() => [...poses].sort().join('')).toBe('0123');
  if (codec === 'none') {
    await page.waitForTimeout(500);
    expect(videos, 'a browser that plays neither codec fetches no video').toEqual([]);
    return;
  }
  await expect.poll(() => videos.join(' ')).toBe(`c1.${codec}`);
  await page.waitForTimeout(600);
  expect(videos.join(' '), 'chapter 2 waits until chapter 1 plays').toBe(`c1.${codec}`);

  const stops = await stopsOf(page);
  await jumpTo(page, stops[0]);
  await page.keyboard.press('ArrowDown');
  await expect(stage(page)).toHaveAttribute('data-chapter', '1');
  await expect.poll(() => videos.join(' ')).toBe(`c1.${codec} c2.${codec}`);
  await expectRest(page, 1, stops);
  expect(videos.length, 'chapter 3 waits until chapter 2 plays').toBe(2);
  await page.keyboard.press('ArrowDown');
  // of chapter 3 only the variant this session needs: the one with the beat
  await expect.poll(() => videos.join(' ')).toBe(`c1.${codec} c2.${codec} c3s.${codec}`);
  await expectRest(page, 2, stops);
  await page.keyboard.press('ArrowDown');
  await expectRest(page, 3, stops);
  expect(videos.join(' ')).toBe(`c1.${codec} c2.${codec} c3s.${codec}`);
});

test('the chapters run without video too: crossfades between the poses, the same captions', async ({ page }) => {
  const videos = videoRequests(page);
  await open(page, { rate: 4, codec: 'none' });
  const stops = await stopsOf(page);
  await jumpTo(page, stops[0]);
  await expectRest(page, 0, stops);
  for (const [k, cap] of [
    [1, 0],
    [2, 1],
    [3, 3],
  ]) {
    await page.keyboard.press('ArrowDown');
    await expect(stage(page)).toHaveAttribute('data-chapter', String(k));
    await expect(stage(page)).toHaveAttribute('data-state', 'play');
    await expectRest(page, k, stops, `chapter ${k} without video`);
    await expect(stage(page)).toHaveAttribute('data-mode', 'poster');
    expect(await capsOn(page)).toEqual([cap]);
    await expect(pose(page, k)).toHaveClass(/is-on/);
  }
  expect(videos, 'no video was asked for').toEqual([]);
  expect(await page.locator('video').count()).toBe(0);
  await expect(stage(page)).toHaveAttribute('data-codec', 'none');
  await expect(stage(page)).toHaveAttribute('data-scare-beats', '0');
});

test('a chapter plays at the speed it was shot and stops on its caption', async ({ page }) => {
  await open(page, { rate: 1 });
  const codec = await codecOf(page);
  test.skip(codec === 'none', 'this browser plays no video');
  const stops = await stopsOf(page);
  const { set } = await setInfo(page);
  const file = set.files.c1;
  await jumpTo(page, stops[0]);
  await expectRest(page, 0, stops);
  // the file is there before the gesture, so what is timed is the chapter and not the download
  await expect(stage(page)).toHaveAttribute('data-loaded', /c1/, { timeout: 20000 });
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-corridor]')!;
    const w = window as unknown as { __t: Record<string, number>; __rates: number[] };
    w.__t = {};
    w.__rates = [];
    new MutationObserver(() => {
      const key = `${el.dataset.state}${el.dataset.mode === 'video' ? ':video' : ''}`;
      if (!(key in w.__t)) w.__t[key] = performance.now();
      const v = document.querySelector<HTMLVideoElement>('.corr__video');
      if (v) w.__rates.push(v.playbackRate);
    }).observe(el, { attributes: true });
  });
  await page.keyboard.press('ArrowDown');
  await expect(stage(page)).toHaveAttribute('data-mode', 'video', { timeout: 10000 });
  // half way: the caption is not up yet, the video is moving
  await page.waitForTimeout(1200);
  expect(await capsOn(page)).toEqual([]);
  const v = page.locator('.corr__video');
  expect(await v.evaluate((el) => !(el as HTMLVideoElement).paused && (el as HTMLVideoElement).muted && (el as HTMLVideoElement).playsInline && !(el as HTMLVideoElement).controls)).toBe(true);
  await expectRest(page, 1, stops);
  expect(await capsOn(page)).toEqual([0]);
  const t = await page.evaluate(() => (window as unknown as { __t: Record<string, number>; __rates: number[] }).__t);
  const took = (t['rest:video'] - t['play:video']) / 1000;
  expect(took, `chapter 1 is ${file.duration} s long and took ${took.toFixed(2)} s`).toBeGreaterThan(file.duration * 0.85);
  expect(took).toBeLessThan(file.duration * 1.25);
  expect(new Set(await page.evaluate(() => (window as unknown as { __rates: number[] }).__rates))).toEqual(new Set([1]));
  await expect(stage(page)).toHaveAttribute('data-played', '1');
  // at rest the stage is a still again: the video has given its decoder back
  await expect.poll(() => page.locator('.corr__video').count()).toBe(0);
});

test('the stage is never black: from the start pose, through a chapter, to its end pose', async ({ page }) => {
  await open(page, { rate: 2 });
  const stops = await stopsOf(page);
  await jumpTo(page, stops[0]);
  await expectRest(page, 0, stops);
  await wake(page);
  await expect(stage(page)).toHaveAttribute('data-codec', /.+/);
  const vp = page.viewportSize()!;
  // the middle of the stage, where the torch falls; the page's own layers (grain, flashlight) included
  const clip = { x: Math.round(vp.width * 0.15), y: Math.round(vp.height * 0.2), width: Math.round(vp.width * 0.7), height: Math.round(vp.height * 0.5) };
  const lit = async () => {
    const { data } = await sharp(await page.screenshot({ clip, type: 'png' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let bright = 0;
    for (let i = 0; i < data.length; i += 3) if (data[i] + data[i + 1] + data[i + 2] > 3 * 40) bright++;
    return bright / (data.length / 3);
  };
  const shots: number[] = [await lit()];
  await page.keyboard.press('ArrowDown');
  // through the hand-over from the pose to the video, the walk, and the hand-over back
  const until = Date.now() + 4500;
  while (Date.now() < until) shots.push(await lit());
  await expectRest(page, 1, stops);
  shots.push(await lit());
  expect(shots.length).toBeGreaterThan(8);
  // a black stage has no lit pixel at all; every picture of the walk has the torch in it
  expect(Math.min(...shots), `share of lit pixels in ${shots.length} screenshots: ${shots.map((s) => s.toFixed(3)).join(' ')}`).toBeGreaterThan(0.02);
});

test('the stops the script works with are the stops the page snaps to, and the rest of the page never snaps', async ({ page }) => {
  await open(page);
  const stops = await stopsOf(page);
  const css = await page.evaluate(() => {
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const padBottom = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0;
    // a stop is where its marker's top comes to the top of the snap area; the first stop is
    // where the bottom of the first free box comes to the bottom of it
    const at = (el: Element) => (el.getAttribute('data-stop') === '0' ? Math.round(el.getBoundingClientRect().bottom + window.scrollY - (window.innerHeight - padBottom)) : Math.round(el.getBoundingClientRect().top + window.scrollY - pad));
    return {
      type: getComputedStyle(document.documentElement).scrollSnapType,
      marks: Array.from(document.querySelectorAll('#corridor [data-stop]')).map(at),
      top: Math.round(document.getElementById('corridor')!.getBoundingClientRect().top + window.scrollY),
      fileTop: Math.round(document.getElementById('file')!.getBoundingClientRect().top + window.scrollY),
      height: document.documentElement.scrollHeight,
      vh: window.innerHeight,
    };
  });
  expect(css.type).toBe('y mandatory');
  expect(css.marks.length).toBe(4);
  for (const [k, m] of css.marks.entries()) expect(Math.abs(m - stops[k]), `stop ${k}: CSS ${m}, script ${stops[k]}`).toBeLessThanOrEqual(1);
  expect(stops[0], 'the stage is pinned before the first stop').toBeGreaterThan(css.top);
  expect(Math.abs(css.fileTop - stops[3] - css.vh), 'one screen after the last stop the corridor ends').toBeLessThanOrEqual(1);
  // the tall boxes that mark the free parts do not make the page longer
  const last = await page.evaluate(() => {
    const f = document.querySelector('footer')!.getBoundingClientRect();
    return Math.round(f.bottom + window.scrollY);
  });
  expect(css.height - last, 'nothing below the footer').toBeLessThanOrEqual(2);

  // outside the corridor a scroll position is kept where it is put: in the hero, on the way
  // down to the first stop, right after the last stop, far below, at the very end
  // (WebKit draws the page to the first stop from up to a sixth of a screen before it, where
  // the stage is already pinned: that last stretch is left out there)
  const lead = test.info().project.use.browserName === 'webkit' ? [] : [css.top + 40, stops[0] - 30];
  for (const y of [240, css.top - 180, ...lead, stops[3] + 37, css.fileTop + 911, css.height - css.vh - 333, css.height - css.vh]) {
    await jumpTo(page, y);
    await page.waitForTimeout(350);
    expect(await settledY(page), `the page stays at ${y}`).toBe(y);
  }
  // inside it the page rests on a stop
  for (const [y, k] of [
    [stops[1] - 150, 1],
    [stops[1] + 220, 1],
    [stops[2] + 300, 2],
  ]) {
    await jumpTo(page, y);
    await page.waitForTimeout(350);
    expect(Math.abs((await settledY(page)) - stops[k]), `from ${y} the page comes to rest on stop ${k}`).toBeLessThanOrEqual(2);
  }
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
  // after the first input the full pose takes its place, and the chapter files asked for are that set's
  const videos: string[] = [];
  page.on('request', (r) => {
    const m = VIDEO.exec(new URL(r.url()).pathname);
    if (m) videos.push(m[1]);
  });
  await wake(page);
  await expect(pose(page, 0), 'the full first pose comes up over the poster').toHaveClass(/is-on/);
  expect(await pose(page, 0).evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(set.poses[0]);
  // and the poster stays under it: no other poster is ever asked for
  expect(await poster(page).evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(set.poster);
  if ((await codecOf(page)) !== 'none') await expect.poll(() => videos.join('')).toBe(name === 'mobile' ? 'm' : 'd');
});

test('the old silhouette and the frame scrubber are gone', async ({ page, request }) => {
  await open(page);
  expect(await page.locator('#corridor canvas').count(), 'no canvas in the corridor').toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hotel:child'))).toBeNull();
  // nothing in the shipped scripts still knows about either, or about the smooth-scroll library
  const sources = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
  expect(sources.length).toBeGreaterThan(0);
  for (const src of sources) {
    const body = await (await request.get(src)).text();
    expect(body).not.toContain('hotel:child');
    expect(body.toLowerCase()).not.toContain('silhouette');
    expect(body).not.toContain('createImageBitmap');
    expect(body.toLowerCase()).not.toContain('lenis');
  }
  // and the frame sets are not on the server
  for (const path of ['corridor/d/000.avif', 'corridor/m/000.webp', 'corridor/d/s/f-01.avif']) {
    expect((await request.get(`${BASE}/${path}`)).status(), path).toBe(404);
  }
});

test('reduced motion: three stills, every caption, no pin, no snap, no video, no scare', async ({ browser }, info) => {
  const use = info.project.use;
  const ctx = await browser.newContext({ baseURL: use.baseURL, reducedMotion: 'reduce', viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent });
  const page = await ctx.newPage();
  const videos = videoRequests(page);
  await open(page);
  await expect(stage(page)).toHaveAttribute('data-mode', 'still');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe('none');
  expect(await stage(page).evaluate((el) => getComputedStyle(el).position)).toBe('relative');
  // walk the whole page: the corridor is an ordinary block
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize()!.height;
  for (let y = 0; y <= height; y += vh * 0.8) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(40);
  }
  // three stills: the end poses of the three chapters, loaded and lit
  for (const k of [1, 2, 3]) {
    const still = pose(page, k);
    await still.scrollIntoViewIfNeeded();
    await expect(still).toBeVisible();
    await expect.poll(() => still.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { timeout: 15000 }).toBe(true);
    expect(await still.evaluate((el) => (el as HTMLImageElement).currentSrc)).toMatch(POSE);
    const box = (await still.boundingBox())!;
    expect(box.height).toBeGreaterThan(120);
  }
  await expect(pose(page, 0)).toBeHidden();
  // all four captions readable
  expect(await caps(page).count()).toBe(4);
  for (const cap of await caps(page).all()) {
    await cap.scrollIntoViewIfNeeded();
    await expect(cap).toBeVisible();
    expect(Number(await cap.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  }
  await expect(page.locator('[data-corr-skip]')).toBeHidden();
  const box = await page.locator('#corridor').boundingBox();
  expect(box!.height, 'no pin: the section is as tall as its content').toBeLessThan(vh * 3);
  await page.waitForTimeout(400);
  expect(videos, 'no video is requested').toEqual([]);
  expect(await page.locator('video').count(), 'and no video element exists').toBe(0);
  expect(await page.evaluate((k) => sessionStorage.getItem(k), SCARE_KEY)).toBeNull();
  await ctx.close();
});

test('every pose of both sets is lit: none of them is a black screen', async ({ page }, info) => {
  // Decoded here, in the browser that shows them. The files are the same for every project.
  test.skip(info.project.name !== 'desktop-1440', 'the files are the same for every project');
  await open(page);
  const manifest = JSON.parse((await attr(page, 'manifest')) ?? '{}') as { sets: Record<string, SetInfo> };
  for (const name of ['desktop', 'mobile']) {
    const s = manifest.sets[name];
    expect(s.poses.length).toBe(4);
    const stats = await page.evaluate(async (s) => {
      const root = document.querySelector<HTMLElement>('[data-corridor]')!.dataset.base ?? '';
      const out: { src: string; w: number; h: number; mean: number; p99: number }[] = [];
      for (const src of [s.poster, ...s.poses]) {
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
      // black to about 3); and every pose has something clearly lit in it.
      expect(p.mean, `${p.src}: mean ${p.mean.toFixed(1)}/255`).toBeGreaterThan(5);
      expect(p.p99, `${p.src}: brightest 1 percent ${p.p99.toFixed(0)}/255`).toBeGreaterThan(48);
      // a pose is at least the size of the video frame it stands for, and the same shape
      if (p.src !== s.poster) {
        expect(p.w, `${p.src} is a full frame`).toBeGreaterThanOrEqual(s.w);
        expect(Math.abs(p.w / p.h - s.w / s.h), `${p.src} has the shape of the video`).toBeLessThan(0.002);
      }
    }
  }
});

test('every chapter file: both codecs with a full type, the index at the front, colours tagged as the stills are', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'the files are the same for every project');
  await open(page);
  const manifest = JSON.parse((await attr(page, 'manifest')) ?? '{}') as { sets: Record<string, SetInfo> };
  for (const name of ['desktop', 'mobile']) {
    const s = manifest.sets[name];
    expect(Object.keys(s.files).sort()).toEqual(['c1', 'c2', 'c3', 'c3s']);
    for (const [id, f] of Object.entries(s.files)) {
      // the modern codec first, each with the codecs string a <source> would carry
      expect(f.sources.map((x) => x.codec), `${name} ${id}`).toEqual(['av1', 'h264']);
      expect(f.sources[0].type).toMatch(/^video\/mp4; codecs="av01\.0\.\d\dM\.(08|10)"$/);
      expect(f.sources[1].type).toMatch(/^video\/mp4; codecs="avc1\.6400(28|29|1f|20)"$/);
      for (const src of f.sources) {
        const res = await request.get(`${BASE}/corridor/${src.src}`);
        expect(res.status(), src.src).toBe(200);
        const body = await res.body();
        // faststart: the index before the picture data, so playback never waits for the end of the file
        const moov = body.indexOf('moov');
        const mdat = body.indexOf('mdat');
        expect(moov, `${src.src}: index`).toBeGreaterThan(0);
        expect(moov, `${src.src}: the index is at the front`).toBeLessThan(mdat);
        // colr nclx: BT.709 primaries (1), the sRGB transfer curve (13), BT.709 matrix (1). With
        // another curve Safari shows the video lighter than the pose it hands over to.
        const colr = body.indexOf('colrnclx');
        expect(colr, `${src.src}: colour box`).toBeGreaterThan(0);
        expect([body.readUInt16BE(colr + 8), body.readUInt16BE(colr + 10), body.readUInt16BE(colr + 12)], `${src.src}: primaries, transfer, matrix`).toEqual([1, 13, 1]);
        // no sound track
        expect(body.indexOf('soun'), `${src.src}: no audio`).toBe(-1);
      }
    }
  }
});

test('a chapter hands over without a jump: its first frame is as bright as the pose it starts on', async ({ page }) => {
  await open(page, { rate: 1 });
  const codec = await codecOf(page);
  test.skip(codec === 'none', 'this browser plays no video');
  const stops = await stopsOf(page);
  await jumpTo(page, stops[0]);
  await expectRest(page, 0, stops);
  await expect(pose(page, 0)).toHaveClass(/is-on/);
  await expect(stage(page)).toHaveAttribute('data-loaded', /c1/, { timeout: 20000 });
  // only the stage: the page's own moving layers and the text over the picture are taken away
  await page.addStyleTag({ content: '.grain,.torch,.tint,.dim{display:none!important} .corr__pin::after{display:none!important} .corr__head,.corr__caps,.corr__skip,.sticky,.ask,header{visibility:hidden!important}' });
  await page.waitForTimeout(500);
  const vp = page.viewportSize()!;
  const clip = { x: Math.round(vp.width * 0.1), y: Math.round(vp.height * 0.15), width: Math.round(vp.width * 0.8), height: Math.round(vp.height * 0.6) };
  const level = async () => {
    const { data } = await sharp(await page.screenshot({ clip, type: 'png' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length;
  };
  const still = await level();
  await page.keyboard.press('ArrowDown');
  // hold the video on its first frame as soon as it is up
  await page.waitForFunction(
    () => {
      const v = document.querySelector<HTMLVideoElement>('.corr__video[data-file="c1"]');
      if (!v || !v.classList.contains('is-on') || v.currentTime <= 0) return false;
      v.pause();
      return true;
    },
    null,
    { timeout: 15000, polling: 'raf' },
  );
  await page.waitForTimeout(500);
  expect(await page.locator('.corr__video').evaluate((v) => (v as HTMLVideoElement).currentTime), 'held within the first frames').toBeLessThan(0.2);
  const moving = await level();
  // A wrong range or matrix moves the picture by ten levels and more; the wrong transfer curve
  // by two to four on Safari. Compression alone stays under one.
  expect(Math.abs(moving - still), `the pose is at ${still.toFixed(2)}, the first frame of the video at ${moving.toFixed(2)}`).toBeLessThan(2);
});

// The floating "ask" button sits bottom right, level with the caption; the skip link sits top
// right. Checked on the text itself (each line as laid out), not only on its box.
test('the captions clear the floating button and the skip link on phones, in every language', async ({ browser }, info) => {
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
      await open(page, { lang, rate: 8 });
      const stops = await stopsOf(page);
      await jumpTo(page, stops[1]);
      await expectRest(page, 1, stops);
      const count = await caps(page).count();
      expect(count).toBe(4);
      const button = page.locator('[data-float] .ask__btn');
      const skip = page.locator('[data-corr-skip]');
      await expect(button, 'the button is on screen').toBeVisible();
      await expect(skip).toBeVisible();
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
      const chrome = await page.evaluate(() => {
        const b = document.querySelector('[data-float] .ask__btn')!.getBoundingClientRect();
        const s = document.querySelector('[data-corr-skip]')!.getBoundingClientRect();
        const h = document.querySelector('header')!.getBoundingClientRect();
        const bar = document.querySelector('[data-sticky]')!.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('#corridor-title')!);
        const t = range.getBoundingClientRect();
        const gap = (p: DOMRect, q: DOMRect) => Math.max(q.left - p.right, p.left - q.right, q.top - p.bottom, p.top - q.bottom);
        return { skipButton: gap(s, b), skipTitle: gap(s, t), skipBar: gap(s, bar), skipTop: s.top - h.bottom, skipRight: s.right, skipW: s.width, skipH: s.height, vw: document.documentElement.clientWidth };
      });
      const at = `${viewport.width}x${viewport.height} ${lang}`;
      expect(chrome.skipW, `${at}: the skip link is 44 px to touch`).toBeGreaterThanOrEqual(44);
      expect(chrome.skipH).toBeGreaterThanOrEqual(44);
      expect(chrome.skipTop, `${at}: the skip link is below the header`).toBeGreaterThanOrEqual(0);
      expect(chrome.skipRight, `${at}: the skip link is on the screen`).toBeLessThanOrEqual(chrome.vw);
      expect(chrome.skipButton, `${at}: the skip link and the floating button`).toBeGreaterThanOrEqual(44);
      expect(chrome.skipBar, `${at}: the skip link and the book bar`).toBeGreaterThanOrEqual(44);
      expect(chrome.skipTitle, `${at}: the skip link and the heading`).toBeGreaterThanOrEqual(8);
      for (let i = 0; i < count; i++) {
        const where = `${at} caption ${i + 1}`;
        // put this caption up alone, as its chapter does
        await caps(page).evaluateAll((els, n) => els.forEach((el, k) => el.classList.toggle('is-on', k === n)), i);
        const cap = caps(page).nth(i);
        await expect.poll(async () => Number(await cap.evaluate((el) => getComputedStyle(el).opacity)), { message: `${where} is shown` }).toBeGreaterThan(0.99);
        const m = await cap.evaluate((el) => {
          const b = document.querySelector('[data-float] .ask__btn')!.getBoundingClientRect();
          const s = document.querySelector('[data-corr-skip]')!.getBoundingClientRect();
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
        });
        expect(m.lines, `${where} has text`).toBeGreaterThan(0);
        // the case the rule is for: the caption is level with the button, so only the space
        // between them keeps them apart
        expect(m.level, `${where} is level with the button`).toBe(true);
        expect(m.text, `${where}: space between the text and the button`).toBeGreaterThanOrEqual(8);
        expect(m.box, `${where}: space between the caption box and the button`).toBeGreaterThanOrEqual(8);
        expect(m.skip, `${where}: space between the text and the skip link`).toBeGreaterThanOrEqual(24);
        expect(m.right, `${where} stays on the screen`).toBeLessThanOrEqual(m.vw);
      }
      await ctx.close();
    }
  }
});
