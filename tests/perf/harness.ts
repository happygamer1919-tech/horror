// Scroll performance harness: one scripted touch scroll through the whole page, measured.
//
// What it does
//   1. Opens the page in phone emulation (390 x 844, dpr 3, touch, mobile UA) with the main
//      thread throttled 4x through CDP, the preloader skipped.
//   2. Waits for load and for the page to settle.
//   3. Scrolls from the top to the bottom with real touch gestures
//      (CDP Input.synthesizeScrollGesture, gestureSourceType touch: a reading pace drag, two
//      flicks and a hard flick in rotation, with short pauses), so native
//      touch scrolling and any smooth-scroll library behave the way they do under a finger.
//   4. Measures only between the first touch and the moment the last swipe has settled.
//
// The corridor holds the page once per session while its clip plays, so the scroll is made in
// one of two ways, each the same every time:
//   seen    the session has seen the corridor: it is a section like any other, and the scroll
//           runs through the whole page without a stop. This is the scroll measurement.
//   first   a first visit, the clip fetched and warm before the scroll starts: the second
//           swipe is caught, the swipes stop while the page is held, the clip plays to its
//           end and the page glides on, and then the swipes go on. The frames of the clip and
//           of the glide are inside the measured window.
//
// Definitions
//   Frames are counted per display refresh (60 per second here), from the compositor's own
//   PipelineReporter trace events, the source of the DevTools "Frames" track. Refreshes where
//   nothing wanted to change are left out. Each remaining refresh is one of:
//     presented  the full frame reached the screen (compositor and main thread content)
//     partial    only the compositor part reached the screen, the main thread was late
//     stale      a partial frame that Chrome itself flags "affects smoothness": something
//                driven by the main thread was moving (a main thread scroll, a rAF or canvas
//                animation, a JS driven transform), so the eye saw it stand still
//     dropped    nothing reached the screen although an update was due
//   dropped percent = (dropped + stale) / (presented + partial + dropped).
//       This is the number the test asserts. It follows Chrome's smoothness accounting:
//       a refresh where the moving thing did not move counts as dropped.
//   not presented percent = dropped / (presented + partial + dropped). The narrow reading:
//       the screen showed nothing new at all.
//   rAF dropped percent = 1 - (requestAnimationFrame callbacks / (window ms / frame ms)).
//       The cross-check from inside the page: how many main thread frames were produced.
//   long task = a main thread task above 50 ms. Two sources: PerformanceObserver('longtask')
//       inside the page, and RunTask slices on the renderer main thread in the trace.
//       With 4x throttling the durations are the throttled (phone-like) ones.
//
// Limits: Emulation.setCPUThrottlingRate slows the renderer main thread only. Compositor,
// raster and GPU run at desktop speed, so anything that costs raster or GPU time on a real
// phone is under-reported here. docs/perf-notes.md lists what that means for each finding.
import type { Browser, BrowserContextOptions, CDPSession, Page } from '@playwright/test';
import { loadavg } from 'node:os';
import type { Variant } from './variants';

export const PHONE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
};

// The acceptance rate is 4. PERF_CPU raises it for stress runs (never asserted).
export const CPU_THROTTLE = Number(process.env.PERF_CPU ?? 4);
const FRAME_MS = 1000 / 60;

// One finger swipe: travel in CSS px and finger speed in px per second.
// A reading pace, a normal flick and a hard flick, repeated until the page ends.
const SWIPES = [
  { distance: 520, speed: 1500 },
  { distance: 600, speed: 2600 },
  { distance: 420, speed: 1100 },
  { distance: 640, speed: 3800 },
];
const PAUSE_MS = 260;
// An empty page that drops more than this is a busy machine, not a slow site.
export const NOISY_IDLE_DROPPED_PCT = 1;
// The fixed arithmetic of the machine check taking this much longer than on the quiet machine
// means the cores are shared. The same goes for a measured throttle far from the one asked for.
export const NOISY_SPIN_FACTOR = 1.25;
const MAX_SWIPES = 90;

const LIGHT_CATEGORIES = [
  '-*',
  'toplevel',
  'benchmark',
  'input',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
];
const PROFILE_CATEGORIES = [...LIGHT_CATEGORIES, 'v8.execute', 'disabled-by-default-v8.cpu_profiler'];

interface TraceEvent {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  tdur?: number;
  pid: number;
  tid: number;
  id?: string;
  id2?: { local?: string; global?: string };
  args?: Record<string, any>;
}

export interface Offender {
  // The section in the middle of the screen when the task began.
  section: string;
  startMs: number;
  durMs: number;
  // What the task spent its time on: trace slice names with their summed duration.
  slices: { name: string; ms: number; detail?: string }[];
  // CPU profile self time inside the task (only in the profiled run).
  functions: { fn: string; url: string; ms: number }[];
}

export type Visit = 'seen' | 'first';

export interface RunMetrics {
  variant: string;
  // How the corridor was passed, how the play ended ('' when nothing was held), and every hold in ms.
  corridor: { visit: Visit; end: string; holds: number[] };
  // Was the machine itself able to hold 60 fps on an empty page right before and after?
  // Noisy = the machine was busy with something else, so the run is set aside and repeated.
  machine: { load1: number; idleDroppedPct: number; spinMs: number; noisy: boolean };
  // The slowdown actually measured inside the page (same arithmetic, throttled / unthrottled).
  throttleMeasured: number;
  profiled: boolean;
  scrollMs: number;
  pageHeight: number;
  reachedBottom: boolean;
  swipes: number;
  smoothScrollLib: boolean;
  bundle: string;
  compositor: {
    refreshes: number;
    frames: number;
    presented: number;
    partial: number;
    stale: number;
    dropped: number;
    droppedPct: number;
    notPresentedPct: number;
    partialPct: number;
    fps: number;
    fullFps: number;
  };
  raf: { callbacks: number; expected: number; droppedPct: number; maxGapMs: number; p95GapMs: number };
  // How the scroll itself was delivered.
  scroll: {
    // Refreshes during a scroll, by the thread Chrome says the scroll depended on.
    onCompositor: number;
    onMain: number;
    // Finger (or fling) movement to pixels on screen, per scroll update.
    latencyMedianMs: number;
    latencyP95Ms: number;
    latencyMaxMs: number;
    // Chrome's own scroll jank verdict (ScrollJankV4): janky presented scroll frames.
    jankyFrames: number;
    jankyPct: number;
    // Touch events that had to be answered by page JavaScript before or while scrolling.
    touchEventsOnMain: number;
    touchMainMs: number;
  };
  longTasks: {
    observerCount: number;
    observerMaxMs: number;
    traceCount: number;
    traceMaxMs: number;
    over100: number;
    maxMs: number;
    top: Offender[];
  };
  // Main thread and raster time by slice name over the scroll window, in ms.
  mainThread: Record<string, number>;
  mainBusyPct: number;
  raster: { tasks: number; ms: number };
  paints: number;
  // CPU time actually burned (thread time, not wall time), in ms per second of scrolling.
  // Unlike dropped frames it does not care how busy the rest of the machine is and it is
  // not multiplied by the throttle, so it is the number to compare experiments by.
  cpu: {
    main: number;
    compositor: number;
    rasterWorkers: number;
    gpuMain: number;
    viz: number;
    total: number;
    // Main thread CPU by kind of work (inclusive, so nested work is counted in both).
    mainByKind: Record<string, number>;
  };
  // How much of the document each style recalculation touched.
  style: { recalcs: number; medianElements: number; maxElements: number; wholeDocument: number; wholeDocumentMaxMs: number };
  // CPU time per frame. Medians over all frames of the scroll, so a stall or a busy
  // neighbour does not move them. This is what experiments are compared by.
  frame: {
    mainFrames: number;
    // One main thread frame: scroll events, rAF callbacks, style, layout, paint, layerize, commit.
    mainMedianMs: number;
    mainP95Ms: number;
    mainMaxMs: number;
    // Median per frame of each kind of work inside it.
    byKindMedianMs: Record<string, number>;
    // The same, by the section in the middle of the screen. timesCheapest is the ratio to the
    // cheapest section of the same run.
    bySection: {
      section: string;
      frames: number;
      medianMs: number;
      p95Ms: number;
      timesCheapest: number;
      scriptMedianMs: number;
      styleLayoutMedianMs: number;
      paintCommitMedianMs: number;
    }[];
    // Whole-scroll totals divided by presented frames.
    compositorPerFrameMs: number;
    vizPerFrameMs: number;
    gpuPerFrameMs: number;
    // Raster is a fixed job for a fixed page, so the whole-scroll total is comparable.
    rasterTotalMs: number;
    rasterTasks: number;
  };
}

const round = (n: number, d = 1) => Number(n.toFixed(d));

// What the corridor's stage says about itself (its data attributes), read with a plain
// evaluate, and a wait made of such readings. Never a locator and never waitForFunction here:
// both load Playwright's own script into the page, and that script listens to touchstart
// without `passive`. From then on Chrome reports every scroll frame as depending on the main
// thread (measured: 0 of 1183 scroll frames without it, 1105 of 1140 with it, same build), and
// the run measures the test tool.
export const corridorState = (page: Page) =>
  page.evaluate(() => {
    const d = document.querySelector<HTMLElement>('[data-corridor]')?.dataset;
    return { lock: d?.lock ?? '', state: d?.state ?? '', end: d?.end ?? '', primed: d?.primed ?? '', codec: d?.codec ?? '', set: d?.set ?? '', top: Number(d?.top ?? 0) };
  });
export async function until(page: Page, what: string, test: (s: Awaited<ReturnType<typeof corridorState>>) => boolean, timeout = 30000) {
  const started = Date.now();
  for (;;) {
    const s = await corridorState(page);
    if (test(s)) return s;
    if (Date.now() - started > timeout) throw new Error(`corridor: ${what} did not happen within ${timeout} ms (${JSON.stringify(s)})`);
    await page.waitForTimeout(50);
  }
}

async function settle(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Idle work (the CCTV module is loaded from requestIdleCallback) gets time to finish.
  await page.waitForTimeout(3000);
}

// The machine check: an empty page, no throttling. If that cannot hold the refresh rate, or a
// fixed piece of arithmetic takes much longer than usual, something else is using the machine
// and the run says more about the neighbours than about the site.
export async function machineCheck(browser: Browser) {
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  await page.goto('about:blank');
  const r = await page.evaluate(
    (frameMs) =>
      new Promise<{ idleDroppedPct: number; spinMs: number }>((resolve) => {
        const s0 = performance.now();
        let x = 0;
        for (let i = 0; i < 2e7; i++) x += Math.sqrt(i);
        const spinMs = performance.now() - s0 + (x > 0 ? 0 : 1);
        let n = 0;
        let first = 0;
        const tick = (t: number) => {
          if (!first) first = t;
          n++;
          if (t - first < 2000) requestAnimationFrame(tick);
          else resolve({ idleDroppedPct: Math.max(0, 1 - (n - 1) / ((t - first) / frameMs)) * 100, spinMs });
        };
        requestAnimationFrame(tick);
      }),
    FRAME_MS,
  );
  await context.close();
  return { idleDroppedPct: round(r.idleDroppedPct), spinMs: round(r.spinMs) };
}

async function swipe(cdp: CDPSession, distance: number, speed: number) {
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 195,
    y: 720,
    yDistance: -distance,
    speed,
    gestureSourceType: 'touch',
    // No fling after the finger lifts: the distance a fling carries depends on how the last
    // few touch samples happened to be timed, and that made one run cover the page in 7
    // swipes and the next in 14. The flick itself (up to 3800 px/s) is the fast part anyway.
    preventFling: true,
  });
}

export async function measureScroll(
  browser: Browser,
  baseURL: string,
  variant: Variant,
  opts: { profile?: boolean; path?: string; quietSpinMs?: number; visit?: Visit } = {},
): Promise<{ metrics: RunMetrics; trace: Buffer }> {
  const visit = opts.visit ?? 'seen';
  const before = await machineCheck(browser);
  const context = await browser.newContext({ ...PHONE, baseURL });
  await context.addInitScript((seen) => {
    try {
      sessionStorage.setItem('hotel:lift', '1');
      if (seen) sessionStorage.setItem('hotel:corridor', '1');
    } catch {
      /* private mode */
    }
    const w = window as any;
    w.__perf = { longtasks: [] as { start: number; dur: number }[], raf: [] as number[], y: [] as number[], on: false };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__perf.longtasks.push({ start: e.startTime, dur: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* longtask is Chromium only */
    }
  }, visit === 'seen');
  if (variant.init) await context.addInitScript(variant.init);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  // Real phones report hover: none. Playwright's emulation leaves hover: hover, so say it here.
  await cdp
    .send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'hover', value: 'none' },
        { name: 'any-hover', value: 'none' },
        { name: 'pointer', value: 'coarse' },
      ],
    })
    .catch(() => undefined);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

  await page.goto(opts.path ?? '/horror/ro/', { waitUntil: 'load' });
  if (variant.css) await page.addStyleTag({ content: variant.css });
  await settle(page);

  // The throttle does not always survive the first navigation (the page moves to a new
  // renderer process), and a run without it looks several times better than it is. So it is
  // set again here and then checked from inside the page: the same arithmetic has to run
  // about CPU_THROTTLE times slower than it does unthrottled.
  const spin = async (times: number) => {
    let best = Infinity;
    for (let i = 0; i < times; i++) {
      best = Math.min(
        best,
        await page.evaluate(() => {
          const s0 = performance.now();
          let x = 0;
          for (let n = 0; n < 2e7; n++) x += Math.sqrt(n);
          return performance.now() - s0 + (x > 0 ? 0 : 1);
        }),
      );
    }
    return best;
  };
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  await page.waitForTimeout(200);
  const throttledSpin = await spin(2);
  await page.waitForTimeout(500);
  // A first visit: the clip is fetched and warm before the scroll, as it is for a visitor who
  // has spent a moment on the hero (the first input here is a pointer move that touches nothing).
  if (visit === 'first') {
    await page.evaluate(() => void window.dispatchEvent(new Event('pointermove')));
    await until(page, 'the clip being fetched and warm', (c) => c.primed === 'scare' || c.codec === 'none');
    await page.waitForTimeout(500);
  }

  await browser.startTracing(page, { categories: opts.profile ? PROFILE_CATEGORIES : LIGHT_CATEGORIES });

  await page.evaluate(() => {
    const w = window as any;
    w.__perf.on = true;
    w.__perf.t0 = performance.now();
    performance.mark('perf:scroll-start');
    const corridor = document.querySelector<HTMLElement>('[data-corridor]');
    const tick = (t: number) => {
      if (!w.__perf.on) return;
      w.__perf.raf.push(t);
      // (held, the page's own scroll position reads 0: it is on the corridor)
      w.__perf.y.push(corridor?.dataset.lock === '1' ? Number(corridor.dataset.top) : window.scrollY);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const atBottom = () =>
    page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4);
  let swipes = 0;
  let reachedBottom = false;
  while (swipes < MAX_SWIPES) {
    const s = SWIPES[swipes % SWIPES.length];
    await swipe(cdp, s.distance, s.speed);
    swipes++;
    await page.waitForTimeout(PAUSE_MS);
    // Held by the corridor: the finger waits. The clip plays out, the page glides on to the
    // next section, and the scroll goes on from there.
    if ((await corridorState(page)).lock === '1') {
      await until(page, 'the corridor letting the page go', (c) => c.lock === '0', 60000);
      await page.waitForTimeout(1200);
    }
    if (await atBottom()) {
      reachedBottom = true;
      break;
    }
  }
  // Let the last frames land before the window closes.
  await page.waitForTimeout(400);

  const inPage = await page.evaluate(() => {
    const w = window as any;
    w.__perf.on = false;
    performance.mark('perf:scroll-end');
    const t1 = performance.now();
    return {
      t0: w.__perf.t0 as number,
      t1,
      raf: w.__perf.raf as number[],
      longtasks: (w.__perf.longtasks as { start: number; dur: number }[]).filter((l) => l.start >= w.__perf.t0),
      y: w.__perf.y as number[],
      // Where each section starts, so a frame can be placed on the page.
      sections: Array.from(document.querySelectorAll<HTMLElement>('main section[id], footer')).map((el) => ({
        id: el.id || el.tagName.toLowerCase(),
        top: Math.round(el.getBoundingClientRect().top + window.scrollY),
      })),
      viewport: window.innerHeight,
      pageHeight: document.documentElement.scrollHeight,
      smoothScrollLib: document.documentElement.classList.contains('lenis'),
      corridorEnd: document.querySelector<HTMLElement>('[data-corridor]')?.dataset.end ?? '',
      holds: performance.getEntriesByName('corridor:lock').map((e) => Math.round(e.duration)),
      // Which build was measured: the file name of the page's main script carries its hash.
      bundle: (document.querySelector('script[type="module"][src]') as HTMLScriptElement | null)?.src.split('/').pop() ?? '',
    };
  });

  const trace = await browser.stopTracing();
  // The unthrottled reference, taken after the measurement so it cannot disturb it.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.waitForTimeout(400);
  const throttleMeasured = throttledSpin / (await spin(4));
  await context.close();
  const after = await machineCheck(browser);
  const idleDroppedPct = Math.max(before.idleDroppedPct, after.idleDroppedPct);
  const spinMs = Math.max(before.spinMs, after.spinMs);

  const events: TraceEvent[] = JSON.parse(trace.toString('utf8')).traceEvents;
  // Which section is in the middle of the screen at a given time since the scroll began.
  const sectionAt = (ms: number) => {
    let i = 0;
    while (i < inPage.raf.length - 1 && inPage.raf[i + 1] - inPage.t0 <= ms) i++;
    const mid = (inPage.y[i] ?? 0) + inPage.viewport / 2;
    let name = inPage.sections[0]?.id ?? 'page';
    for (const sec of inPage.sections) if (sec.top <= mid) name = sec.id;
    return name;
  };
  const parsed = analyse(events, Boolean(opts.profile), sectionAt);

  const scrollMs = inPage.t1 - inPage.t0;
  const gaps = inPage.raf.slice(1).map((t, i) => t - inPage.raf[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const expected = scrollMs / FRAME_MS;
  const observer = inPage.longtasks;

  const metrics: RunMetrics = {
    variant: variant.name,
    corridor: { visit, end: inPage.corridorEnd, holds: inPage.holds },
    machine: {
      load1: round(loadavg()[0]),
      idleDroppedPct,
      spinMs,
      noisy:
        idleDroppedPct > NOISY_IDLE_DROPPED_PCT ||
        (opts.quietSpinMs !== undefined && spinMs > opts.quietSpinMs * NOISY_SPIN_FACTOR) ||
        throttleMeasured < CPU_THROTTLE * 0.75 ||
        throttleMeasured > CPU_THROTTLE * 1.35,
    },
    throttleMeasured: round(throttleMeasured),
    profiled: Boolean(opts.profile),
    scrollMs: round(scrollMs, 0),
    pageHeight: inPage.pageHeight,
    reachedBottom,
    swipes,
    smoothScrollLib: inPage.smoothScrollLib,
    bundle: inPage.bundle,
    compositor: parsed.compositor,
    scroll: parsed.scroll,
    raf: {
      callbacks: inPage.raf.length,
      expected: round(expected, 0),
      droppedPct: round(Math.max(0, 1 - inPage.raf.length / expected) * 100),
      maxGapMs: round(sorted.length ? sorted[sorted.length - 1] : 0),
      p95GapMs: round(sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0),
    },
    longTasks: {
      observerCount: observer.length,
      observerMaxMs: round(observer.reduce((m, l) => Math.max(m, l.dur), 0)),
      traceCount: parsed.tasks.length,
      traceMaxMs: round(parsed.tasks.reduce((m, t) => Math.max(m, t.durMs), 0)),
      over100: parsed.tasks.filter((t) => t.durMs > 100).length,
      maxMs: round(
        Math.max(
          observer.reduce((m, l) => Math.max(m, l.dur), 0),
          parsed.tasks.reduce((m, t) => Math.max(m, t.durMs), 0),
        ),
      ),
      top: parsed.tasks.slice(0, 5),
    },
    mainThread: parsed.mainThread,
    mainBusyPct: round((parsed.mainBusyMs / scrollMs) * 100),
    raster: parsed.raster,
    paints: parsed.paints,
    cpu: parsed.cpu,
    style: parsed.style,
    frame: parsed.frame,
  };
  return { metrics, trace };
}

// Slices worth naming when a task or the whole scroll is broken down.
const NAMED = new Set([
  'FunctionCall',
  'EvaluateScript',
  'v8.compile',
  'v8.compileModule',
  'v8.evaluateModule',
  'FireAnimationFrame',
  'TimerFire',
  'EventDispatch',
  'FireIdleCallback',
  'RunMicrotasks',
  'UpdateLayoutTree',
  'Layout',
  'PrePaint',
  'Paint',
  'Layerize',
  'Commit',
  'UpdateLayerTree',
  'HitTest',
  'IntersectionObserverController::computeIntersections',
  'ParseHTML',
  'ParseAuthorStyleSheet',
  'MinorGC',
  'MajorGC',
  'V8.GC_SCAVENGER',
  'V8.GC_MARK_COMPACTOR',
  'Decode Image',
  'ScrollLayer',
]);

function analyse(events: TraceEvent[], profiled: boolean, sectionAt: (ms: number) => string) {
  const start = events.find((e) => e.name === 'perf:scroll-start' && e.cat.includes('blink.user_timing'));
  const end = events.find((e) => e.name === 'perf:scroll-end' && e.cat.includes('blink.user_timing'));
  if (!start || !end) throw new Error('scroll window marks are missing from the trace');
  const t0 = start.ts;
  const t1 = end.ts;
  const pid = start.pid;
  const mainTid = start.tid;
  const inWindow = (e: TraceEvent) => e.ts >= t0 && e.ts <= t1;

  // --- Compositor frames -----------------------------------------------------------------
  // PipelineReporter is an async slice per frame; the begin event carries the final state.
  // One display refresh (frame_sequence) can have several reporters, for instance a
  // compositor-only frame plus the late main frame that started on the same refresh, so
  // the refresh is judged by the best thing that happened to it.
  const refresh = new Map<string, { all: boolean; partial: boolean; partialSmooth: boolean; dropped: boolean }>();
  for (const e of events) {
    if (e.name !== 'PipelineReporter' || e.ph !== 'b' || e.pid !== pid || !inWindow(e)) continue;
    const r = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter;
    if (!r) continue;
    const key = `${r.frame_source}:${r.frame_sequence}`;
    const cur = refresh.get(key) ?? { all: false, partial: false, partialSmooth: false, dropped: false };
    if (r.state === 'STATE_PRESENTED_ALL') cur.all = true;
    else if (r.state === 'STATE_PRESENTED_PARTIAL') {
      cur.partial = true;
      if (r.affects_smoothness) cur.partialSmooth = true;
    } else if (r.state === 'STATE_DROPPED' && r.affects_smoothness) cur.dropped = true;
    refresh.set(key, cur);
  }
  // --- Scroll delivery -------------------------------------------------------------------
  let onCompositor = 0;
  let onMain = 0;
  for (const e of events) {
    if (e.name !== 'PipelineReporter' || e.ph !== 'b' || e.pid !== pid || !inWindow(e)) continue;
    const st = (e.args?.frame_reporter ?? e.args?.chrome_frame_reporter)?.scroll_state;
    if (st === 'SCROLL_MAIN_THREAD') onMain++;
    else if (st === 'SCROLL_COMPOSITOR_THREAD') onCompositor++;
  }
  const open = new Map<string, TraceEvent>();
  const latencies: number[] = [];
  let jankTotal = 0;
  let janky = 0;
  let touchEventsOnMain = 0;
  let touchMainUs = 0;
  const mainStage = new Map<string, number>();
  for (const e of events) {
    if (!e.cat.includes('input') || !inWindow(e)) continue;
    const key = `${e.pid}:${e.id2?.local ?? e.id2?.global ?? e.id}`;
    if (e.name === 'EventLatency') {
      if (e.ph === 'b') open.set(key, e);
      else if (e.ph === 'e') {
        const b = open.get(key);
        open.delete(key);
        if (b && /SCROLL_UPDATE/.test(b.args?.event_latency?.event_type ?? '')) latencies.push((e.ts - b.ts) / 1000);
      }
    } else if (e.name === 'ScrollJankV4' && e.ph === 'b') {
      jankTotal++;
      if (e.args?.scroll_jank_v4?.is_janky) janky++;
    } else if (e.name === 'RendererMainProcessing') {
      if (e.ph === 'b') {
        touchEventsOnMain++;
        mainStage.set(key, e.ts);
      } else if (e.ph === 'e' && mainStage.has(key)) {
        touchMainUs += e.ts - mainStage.get(key)!;
        mainStage.delete(key);
      }
    }
  }
  latencies.sort((a, b) => a - b);
  const pct = (q: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))] : 0);

  let presented = 0;
  let partial = 0;
  let stale = 0;
  let dropped = 0;
  for (const r of refresh.values()) {
    if (r.all) presented++;
    else if (r.partial) {
      partial++;
      if (r.partialSmooth) stale++;
    } else if (r.dropped) dropped++;
  }
  const frames = presented + partial + dropped;
  const seconds = (t1 - t0) / 1e6;

  // --- Main thread tasks -----------------------------------------------------------------
  const main = events.filter((e) => e.pid === pid && e.tid === mainTid && e.ph === 'X' && e.dur !== undefined);
  const runTasks = main
    // A task that began before the window is the harness's own call that opened it.
    .filter((e) => /RunTask$/.test(e.name) && e.ts >= t0 && e.ts <= t1)
    .sort((a, b) => a.ts - b.ts);
  // Nested RunTask slices are possible; keep the outermost only.
  const outer: TraceEvent[] = [];
  let coveredUntil = 0;
  for (const t of runTasks) {
    if (t.ts >= coveredUntil) {
      outer.push(t);
      coveredUntil = t.ts + (t.dur ?? 0);
    }
  }
  const mainBusyMs = outer.reduce((s, t) => s + Math.min(t.ts + t.dur!, t1) - Math.max(t.ts, t0), 0) / 1000;

  const named = main.filter((e) => NAMED.has(e.name)).sort((a, b) => a.ts - b.ts);
  // For long task attribution every slice counts, minus the scheduler's own wrappers.
  const WRAPPER = /RunTask|ThreadController|SequenceManager|SimpleWatcher|BlinkScheduler|Receive mojo|Closure|WebFrameWidgetImpl::BeginMainFrame|ProxyMain::BeginMainFrame$|PageAnimator|LocalFrameView::RunStyle|LocalFrameView::RunPaint|LocalFrameView::RunPrePaint|^AnimationFrame/;
  const slices = main.filter((e) => !WRAPPER.test(e.name)).sort((a, b) => a.ts - b.ts || b.dur! - a.dur!);
  const mainThread: Record<string, number> = {};
  for (const e of named) {
    if (!inWindow(e)) continue;
    mainThread[e.name] = (mainThread[e.name] ?? 0) + e.dur! / 1000;
  }
  for (const k of Object.keys(mainThread)) mainThread[k] = round(mainThread[k]);

  // --- CPU profile (profiled run only) ---------------------------------------------------
  const samples: { ts: number; dt: number; fn: string; url: string }[] = [];
  if (profiled) {
    const nodes = new Map<number, { fn: string; url: string }>();
    const chunks = events.filter((e) => e.name === 'ProfileChunk' && e.pid === pid).sort((a, b) => a.ts - b.ts);
    const byProfile = new Map<string, TraceEvent[]>();
    for (const c of chunks) {
      const key = String(c.id ?? c.id2?.local ?? 'p');
      byProfile.set(key, [...(byProfile.get(key) ?? []), c]);
    }
    const startTimes = new Map<string, number>();
    for (const e of events) {
      if (e.name === 'Profile' && e.pid === pid) startTimes.set(String(e.id ?? e.id2?.local ?? 'p'), e.args?.data?.startTime ?? e.ts);
    }
    for (const [key, list] of byProfile) {
      let ts = startTimes.get(key) ?? list[0].ts;
      for (const c of list) {
        const d = c.args?.data ?? {};
        for (const n of d.cpuProfile?.nodes ?? []) {
          nodes.set(n.id, {
            fn: n.callFrame?.functionName || '(anonymous)',
            url: n.callFrame?.url ? `${n.callFrame.url.split('/').pop()}:${(n.callFrame.lineNumber ?? 0) + 1}:${(n.callFrame.columnNumber ?? 0) + 1}` : '',
          });
        }
        const ids: number[] = d.cpuProfile?.samples ?? [];
        const deltas: number[] = d.timeDeltas ?? [];
        for (let i = 0; i < ids.length; i++) {
          ts += deltas[i] ?? 0;
          const n = nodes.get(ids[i]);
          if (n) samples.push({ ts, dt: deltas[i] ?? 0, fn: n.fn, url: n.url });
        }
      }
    }
  }

  const tasks: Offender[] = outer
    .filter((t) => t.dur! > 50000)
    .sort((a, b) => b.dur! - a.dur!)
    .map((t) => {
      const a = t.ts;
      const b = t.ts + t.dur!;
      const inside = slices.filter((e) => e.ts >= a && e.ts + e.dur! <= b);
      // Keep top level slices only, so nested time is not counted twice.
      const tops: TraceEvent[] = [];
      let until = 0;
      for (const e of inside) {
        if (e.ts >= until) {
          tops.push(e);
          until = e.ts + e.dur!;
        }
      }
      const sums = new Map<string, { ms: number; detail?: string }>();
      for (const e of tops) {
        const d = e.args?.data ?? {};
        const detail = d.url ? `${String(d.url).split('/').pop()}${d.functionName ? ` ${d.functionName}` : ''}` : d.type ? String(d.type) : undefined;
        const key = detail ? `${e.name} ${detail}` : e.name;
        const cur = sums.get(key) ?? { ms: 0, detail };
        cur.ms += e.dur! / 1000;
        sums.set(key, cur);
      }
      const fnSums = new Map<string, { fn: string; url: string; ms: number }>();
      for (const s of samples) {
        if (s.ts < a || s.ts > b) continue;
        if (s.fn === '(idle)' || s.fn === '(root)') continue;
        const key = `${s.fn}@${s.url}`;
        const cur = fnSums.get(key) ?? { fn: s.fn, url: s.url, ms: 0 };
        cur.ms += s.dt / 1000;
        fnSums.set(key, cur);
      }
      return {
        section: sectionAt((a - t0) / 1000),
        startMs: round((a - t0) / 1000, 0),
        durMs: round(t.dur! / 1000),
        slices: [...sums.entries()]
          .map(([name, v]) => ({ name, ms: round(v.ms) }))
          .sort((x, y) => y.ms - x.ms)
          .slice(0, 5),
        functions: [...fnSums.values()]
          .map((f) => ({ ...f, ms: round(f.ms) }))
          .sort((x, y) => y.ms - x.ms)
          .slice(0, 5),
      };
    });

  // --- Raster ---------------------------------------------------------------------------
  let rasterTasks = 0;
  let rasterMs = 0;
  let paints = 0;
  for (const e of events) {
    if (e.ph !== 'X' || !inWindow(e)) continue;
    if (e.name === 'RasterTask') {
      rasterTasks++;
      rasterMs += (e.dur ?? 0) / 1000;
    } else if (e.name === 'Paint' && e.pid === pid) paints++;
  }

  // --- CPU time per thread ---------------------------------------------------------------
  const threadName = new Map<string, string>();
  for (const e of events) {
    if (e.name === 'thread_name' && e.ph === 'M') threadName.set(`${e.pid}:${e.tid}`, String(e.args?.name ?? ''));
  }
  const perThread = new Map<string, TraceEvent[]>();
  for (const e of events) {
    if (e.ph !== 'X' || e.tdur === undefined || !/RunTask$/.test(e.name) || !inWindow(e)) continue;
    const key = `${e.pid}:${e.tid}`;
    perThread.set(key, [...(perThread.get(key) ?? []), e]);
  }
  const cpuOf = (match: (name: string, threadPid: number) => boolean) => {
    let us = 0;
    for (const [key, list] of perThread) {
      if (!match(threadName.get(key) ?? '', Number(key.split(':')[0]))) continue;
      list.sort((a, b) => a.ts - b.ts);
      let until = 0;
      for (const t of list) {
        if (t.ts < until) continue;
        until = t.ts + (t.dur ?? 0);
        us += t.tdur ?? 0;
      }
    }
    return us / 1000 / seconds;
  };
  const cpuMain = cpuOf((n, p) => p === pid && n === 'CrRendererMain');
  const cpuCompositor = cpuOf((n, p) => p === pid && n === 'Compositor');
  const cpuWorkers = cpuOf((n, p) => p === pid && /ThreadPool|TileWorker/.test(n));
  const cpuGpuMain = cpuOf((n) => n === 'CrGpuMain');
  const cpuViz = cpuOf((n) => n === 'VizCompositorThread');
  const mainByKind: Record<string, number> = {};
  for (const e of named) {
    if (!inWindow(e) || e.tdur === undefined) continue;
    const kind = e.name === 'EventDispatch' ? `EventDispatch ${e.args?.data?.type ?? ''}`.trim() : e.name;
    mainByKind[kind] = (mainByKind[kind] ?? 0) + e.tdur / 1000 / seconds;
  }
  for (const k of Object.keys(mainByKind)) {
    mainByKind[k] = round(mainByKind[k], 2);
    if (mainByKind[k] < 0.05) delete mainByKind[k];
  }

  // --- Style recalculation size (a count, so it does not depend on machine speed) ----------
  const recalcs = main.filter((e) => e.name === 'UpdateLayoutTree' && inWindow(e));
  const counts = recalcs.map((e) => Number(e.args?.elementCount ?? 0));
  const big = recalcs.filter((e) => Number(e.args?.elementCount ?? 0) >= 200);
  const style = {
    recalcs: recalcs.length,
    medianElements: counts.length ? [...counts].sort((a, b) => a - b)[counts.length >> 1] : 0,
    maxElements: Math.max(0, ...counts),
    // Recalculations that restyled 200 elements or more: on this page that is the whole document.
    wholeDocument: big.length,
    wholeDocumentMaxMs: round(Math.max(0, ...big.map((e) => e.dur! / 1000))),
  };

  // --- CPU time per main frame -----------------------------------------------------------
  const bmf = main.filter((e) => e.name === 'ProxyMain::BeginMainFrame' && inWindow(e) && e.tdur !== undefined).sort((a, b) => a.ts - b.ts);
  const q = (xs: number[], f: number) => {
    if (!xs.length) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  };
  const kinds = ['EventDispatch', 'FireAnimationFrame', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'IntersectionObserverController::computeIntersections'];
  const perKind: Record<string, number[]> = Object.fromEntries(kinds.map((k) => [k, []]));
  let cursor = 0;
  for (const f of bmf) {
    const a = f.ts;
    const b = f.ts + f.dur!;
    const sums: Record<string, number> = Object.fromEntries(kinds.map((k) => [k, 0]));
    while (cursor < named.length && named[cursor].ts < a) cursor++;
    for (let i = cursor; i < named.length && named[i].ts <= b; i++) {
      const e = named[i];
      if (e.name in sums) sums[e.name] += (e.tdur ?? 0) / 1000;
    }
    for (const k of kinds) perKind[k].push(sums[k]);
  }
  const frameCosts = bmf.map((f) => f.tdur! / 1000);
  // The same frames, grouped by the section that was on screen. Costs inside one run are
  // comparable with each other whatever the machine was doing, so the ratio between sections
  // is solid even when the absolute numbers are not.
  const groups = new Map<string, { cost: number[]; raf: number[]; style: number[]; paint: number[] }>();
  bmf.forEach((f, i) => {
    const name = sectionAt((f.ts - t0) / 1000);
    const g = groups.get(name) ?? { cost: [], raf: [], style: [], paint: [] };
    g.cost.push(frameCosts[i]);
    g.raf.push(perKind.FireAnimationFrame[i] + perKind.EventDispatch[i]);
    g.style.push(perKind.UpdateLayoutTree[i] + perKind.Layout[i]);
    g.paint.push(perKind.PrePaint[i] + perKind.Paint[i] + perKind.Layerize[i] + perKind.Commit[i]);
    groups.set(name, g);
  });
  const cheapest = Math.min(...[...groups.values()].filter((g) => g.cost.length >= 10).map((g) => q(g.cost, 0.5))) || 1;
  const bySection = [...groups.entries()].map(([section, g]) => ({
    section,
    frames: g.cost.length,
    medianMs: round(q(g.cost, 0.5), 3),
    p95Ms: round(q(g.cost, 0.95), 3),
    timesCheapest: round(q(g.cost, 0.5) / cheapest, 2),
    scriptMedianMs: round(q(g.raf, 0.5), 3),
    styleLayoutMedianMs: round(q(g.style, 0.5), 3),
    paintCommitMedianMs: round(q(g.paint, 0.5), 3),
  }));
  let rasterCpuUs = 0;
  for (const e of events) if (e.name === 'RasterTask' && e.ph === 'X' && inWindow(e)) rasterCpuUs += e.tdur ?? e.dur ?? 0;
  const shown = Math.max(1, presented + partial);
  const byKindMedianMs: Record<string, number> = {};
  for (const k of kinds) byKindMedianMs[k.replace('IntersectionObserverController::computeIntersections', 'IntersectionObserver')] = round(q(perKind[k], 0.5), 3);

  return {
    compositor: {
      refreshes: refresh.size,
      frames,
      presented,
      partial,
      stale,
      dropped,
      droppedPct: round(frames ? ((dropped + stale) / frames) * 100 : 0),
      notPresentedPct: round(frames ? (dropped / frames) * 100 : 0),
      partialPct: round(frames ? (partial / frames) * 100 : 0),
      fps: round(seconds ? (presented + partial) / seconds : 0),
      fullFps: round(seconds ? presented / seconds : 0),
    },
    scroll: {
      onCompositor,
      onMain,
      latencyMedianMs: round(pct(0.5)),
      latencyP95Ms: round(pct(0.95)),
      latencyMaxMs: round(pct(1)),
      jankyFrames: janky,
      jankyPct: round(jankTotal ? (janky / jankTotal) * 100 : 0),
      touchEventsOnMain,
      touchMainMs: round(touchMainUs / 1000),
    },
    tasks,
    mainThread,
    mainBusyMs,
    raster: { tasks: rasterTasks, ms: round(rasterMs) },
    paints,
    cpu: {
      main: round(cpuMain, 2),
      compositor: round(cpuCompositor, 2),
      rasterWorkers: round(cpuWorkers, 2),
      gpuMain: round(cpuGpuMain, 2),
      viz: round(cpuViz, 2),
      total: round(cpuMain + cpuCompositor + cpuWorkers + cpuGpuMain + cpuViz, 2),
      mainByKind,
    },
    style,
    frame: {
      mainFrames: bmf.length,
      mainMedianMs: round(q(frameCosts, 0.5), 3),
      mainP95Ms: round(q(frameCosts, 0.95), 3),
      mainMaxMs: round(q(frameCosts, 1), 2),
      byKindMedianMs,
      bySection,
      compositorPerFrameMs: round((cpuCompositor * seconds) / shown, 3),
      vizPerFrameMs: round((cpuViz * seconds) / shown, 3),
      gpuPerFrameMs: round((cpuGpuMain * seconds) / shown, 3),
      rasterTotalMs: round(rasterCpuUs / 1000, 1),
      rasterTasks,
    },
  };
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
