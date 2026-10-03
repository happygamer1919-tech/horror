// Scroll performance test. Not part of `npm test` (the file name has no .spec or .test).
//   PW_PORT=4334 npm run test:perf
//   PERF_VARIANT=no-torch PW_PORT=4334 npm run test:perf     one experiment, never asserted
//   PERF_RUNS=5 ...                                           more measured runs (default 3)
//   PERF_ASSERT=0 ...                                         measure only
//   PERF_CPU=20 ...                                           stress run at another throttle, never asserted
//   PERF_KEEP_NOISY=1 ...                                     keep runs taken on a busy machine (experiments by per-frame CPU medians)
//   PERF_PROFILE=0 ...                                        skip the extra CPU profiler run
//   PERF_KEEP_TRACE=1 ...                                     keep the profiled trace in test-results/
//   PERF_GPU=0 ...                                            software rendering instead of the GPU
//   PERF_LABEL=before ...                                     names the build measured: perf-summary.<label>.json
//                                                             (to measure another build, serve it on PW_PORT first:
//                                                             the config reuses a server that is already running)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { CPU_THROTTLE, machineCheck, measureScroll, median, type RunMetrics } from './harness';
import { getVariant } from './variants';

const variant = getVariant(process.env.PERF_VARIANT ?? 'base');
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const enforce = variant.name === 'base' && CPU_THROTTLE === 4 && process.env.PERF_ASSERT !== '0';
const outDir = join(process.cwd(), 'test-results');
const label = process.env.PERF_LABEL ?? '';

export const BUDGET = { droppedPct: 10, longTaskMs: 100 };

const stat = (runs: RunMetrics[], pick: (r: RunMetrics) => number) => {
  const xs = runs.map(pick);
  return { median: Number(median(xs).toFixed(1)), worst: Math.max(...xs), best: Math.min(...xs), runs: xs };
};

test(`touch scroll through the full page, ${CPU_THROTTLE}x CPU throttle [${variant.name}]`, async ({ browser, baseURL }) => {
  // The quiet-machine reference: the best of a few empty-page checks.
  let quietSpinMs = Infinity;
  for (let i = 0; i < 4; i++) quietSpinMs = Math.min(quietSpinMs, (await machineCheck(browser)).spinMs);
  // Before each run, wait (up to a minute) for the machine to be that quiet again.
  const waitForQuiet = async () => {
    if (process.env.PERF_KEEP_NOISY === '1') return;
    for (let i = 0; i < 12; i++) {
      const c = await machineCheck(browser);
      quietSpinMs = Math.min(quietSpinMs, c.spinMs);
      if (c.spinMs <= quietSpinMs * 1.15 && c.idleDroppedPct <= 0.5) return;
      await new Promise((r) => setTimeout(r, 5000));
    }
  };

  const runs: RunMetrics[] = [];
  // A run taken on a busy machine (see RunMetrics.machine) is set aside and repeated, up to
  // twice RUNS extra attempts. Everything set aside is still listed in the summary.
  const discarded: RunMetrics[] = [];
  while (runs.length < RUNS) {
    await waitForQuiet();
    const { metrics } = await measureScroll(browser, baseURL!, variant, { quietSpinMs });
    const keep = !metrics.machine.noisy || discarded.length >= RUNS * 2 || process.env.PERF_KEEP_NOISY === '1';
    (keep ? runs : discarded).push(metrics);
    console.log(
      `${keep ? `run ${runs.length}` : 'discarded (busy machine)'}: load ${metrics.machine.load1}, idle dropped ${metrics.machine.idleDroppedPct}%, spin ${metrics.machine.spinMs} ms, throttle measured ${metrics.throttleMeasured}x | ` +
        `dropped ${metrics.compositor.droppedPct}% (not presented ${metrics.compositor.notPresentedPct}%, partial ${metrics.compositor.partialPct}%, ${metrics.compositor.frames} frames, full ${metrics.compositor.fullFps} fps), ` +
        `rAF dropped ${metrics.raf.droppedPct}%, scroll latency p95 ${metrics.scroll.latencyP95Ms} ms (janky ${metrics.scroll.jankyPct}%, on main ${metrics.scroll.onMain}/${metrics.scroll.onMain + metrics.scroll.onCompositor}, touch on main ${metrics.scroll.touchEventsOnMain}), ` +
        `long tasks ${metrics.longTasks.traceCount} (max ${metrics.longTasks.maxMs} ms), main busy ${metrics.mainBusyPct}% | ` +
        `whole-document restyles ${metrics.style.wholeDocument} (max ${metrics.style.wholeDocumentMaxMs} ms) | CPU per frame: main median ${metrics.frame.mainMedianMs} ms (p95 ${metrics.frame.mainP95Ms}), compositor ${metrics.frame.compositorPerFrameMs}, viz ${metrics.frame.vizPerFrameMs}, gpu ${metrics.frame.gpuPerFrameMs}; raster total ${metrics.frame.rasterTotalMs} ms in ${metrics.frame.rasterTasks} tasks`,
    );
  }
  // One more run with the CPU profiler on. It costs time, so it is used for attribution only.
  // PERF_PROFILE=0 skips it (quicker experiment sweeps).
  const profiled =
    process.env.PERF_PROFILE === '0' ? null : (await waitForQuiet(), await measureScroll(browser, baseURL!, variant, { profile: true, quietSpinMs }));

  const summary = {
    label: label || undefined,
    variant: variant.name,
    about: variant.about,
    conditions: {
      viewport: '390x844 dpr 3, touch, mobile UA',
      cpuThrottle: CPU_THROTTLE,
      gpu: process.env.PERF_GPU !== '0',
      runs: RUNS,
      smoothScrollLibActive: runs[0].smoothScrollLib,
      bundle: runs[0].bundle,
      pageHeight: runs[0].pageHeight,
      reachedBottom: runs.every((r) => r.reachedBottom),
      throttleMeasured: runs.map((r) => r.throttleMeasured),
      quietSpinMs,
      machine: runs.map((r) => r.machine),
      discardedBusyMachine: discarded.map((r) => ({ ...r.machine, throttleMeasured: r.throttleMeasured, droppedPct: r.compositor.droppedPct, longTaskMaxMs: r.longTasks.maxMs })),
    },
    budget: BUDGET,
    droppedPct: stat(runs, (r) => r.compositor.droppedPct),
    notPresentedPct: stat(runs, (r) => r.compositor.notPresentedPct),
    partialPct: stat(runs, (r) => r.compositor.partialPct),
    fullFps: stat(runs, (r) => r.compositor.fullFps),
    scrollLatencyP95Ms: stat(runs, (r) => r.scroll.latencyP95Ms),
    scrollLatencyMaxMs: stat(runs, (r) => r.scroll.latencyMaxMs),
    scrollJankyPct: stat(runs, (r) => r.scroll.jankyPct),
    scrollOnMainRefreshes: stat(runs, (r) => r.scroll.onMain),
    scrollOnCompositorRefreshes: stat(runs, (r) => r.scroll.onCompositor),
    touchEventsOnMain: stat(runs, (r) => r.scroll.touchEventsOnMain),
    touchMainMs: stat(runs, (r) => r.scroll.touchMainMs),
    rafDroppedPct: stat(runs, (r) => r.raf.droppedPct),
    rafMaxGapMs: stat(runs, (r) => r.raf.maxGapMs),
    longTaskCount: stat(runs, (r) => r.longTasks.traceCount),
    longTaskOver100: stat(runs, (r) => r.longTasks.over100),
    longTaskMaxMs: stat(runs, (r) => r.longTasks.maxMs),
    longTaskObserverCount: stat(runs, (r) => r.longTasks.observerCount),
    mainBusyPct: stat(runs, (r) => r.mainBusyPct),
    rasterMs: stat(runs, (r) => r.raster.ms),
    paints: stat(runs, (r) => r.paints),
    // CPU ms per second of scrolling (thread time, unthrottled): the stable number.
    cpuMain: stat(runs, (r) => r.cpu.main),
    cpuCompositor: stat(runs, (r) => r.cpu.compositor),
    cpuRasterWorkers: stat(runs, (r) => r.cpu.rasterWorkers),
    cpuGpuMain: stat(runs, (r) => r.cpu.gpuMain),
    cpuViz: stat(runs, (r) => r.cpu.viz),
    cpuTotal: stat(runs, (r) => r.cpu.total),
    wholeDocumentStyleRecalcs: stat(runs, (r) => r.style.wholeDocument),
    wholeDocumentStyleRecalcMaxMs: stat(runs, (r) => r.style.wholeDocumentMaxMs),
    // CPU per frame, medians (see RunMetrics.frame): what experiments are compared by.
    frameMainMedianMs: stat(runs, (r) => r.frame.mainMedianMs),
    frameMainP95Ms: stat(runs, (r) => r.frame.mainP95Ms),
    frameCompositorMs: stat(runs, (r) => r.frame.compositorPerFrameMs),
    frameVizMs: stat(runs, (r) => r.frame.vizPerFrameMs),
    frameGpuMs: stat(runs, (r) => r.frame.gpuPerFrameMs),
    rasterTotalMs: stat(runs, (r) => r.frame.rasterTotalMs),
    rasterTasks: stat(runs, (r) => r.frame.rasterTasks),
    frameByKindMedianMs: runs.map((r) => r.frame.byKindMedianMs),
    frameBySection: runs.map((r) => r.frame.bySection),
    cpuMainByKind: runs[Math.floor(runs.length / 2)].cpu.mainByKind,
    mainThreadMs: runs[0].mainThread,
    topLongTasks: runs.flatMap((r) => r.longTasks.top).sort((a, b) => b.durMs - a.durMs).slice(0, 5),
    profiledRun: profiled && {
      note: 'CPU profiler on: slower than the measured runs, read it for attribution only',
      droppedPct: profiled.metrics.compositor.droppedPct,
      longTaskMaxMs: profiled.metrics.longTasks.maxMs,
      topLongTasks: profiled.metrics.longTasks.top,
    },
    pass: false,
  };
  summary.pass = summary.droppedPct.worst < BUDGET.droppedPct && summary.longTaskMaxMs.worst <= BUDGET.longTaskMs;

  mkdirSync(outDir, { recursive: true });
  const suffix = [label, variant.name === 'base' ? '' : variant.name].filter(Boolean).join('.');
  const file = suffix ? `perf-summary.${suffix}.json` : 'perf-summary.json';
  writeFileSync(join(outDir, file), JSON.stringify(summary, null, 2));
  if (process.env.PERF_KEEP_TRACE && profiled) writeFileSync(join(outDir, `perf-trace.${suffix || 'base'}.json`), profiled.trace);

  const { topLongTasks, profiledRun, mainThreadMs, cpuMainByKind, frameByKindMedianMs, frameBySection, ...line } = summary;
  console.log(`PERF_SUMMARY ${JSON.stringify(line)}`);
  const describe = (t: (typeof topLongTasks)[number]) =>
    `${t.durMs} ms at +${t.startMs} ms in #${t.section}: ${t.slices.map((s) => `${s.name} ${s.ms}`).join(', ')}` +
    (t.functions.length ? ` | ${t.functions.map((f) => `${f.fn} ${f.url} ${f.ms}`).join(', ')}` : '');
  for (const t of topLongTasks) console.log(`long task (measured run) ${describe(t)}`);
  for (const t of profiledRun?.topLongTasks ?? []) console.log(`long task (profiled run) ${describe(t)}`);

  expect(summary.conditions.reachedBottom, 'the scripted scroll reached the end of the page').toBe(true);
  if (!enforce) return;
  expect(summary.droppedPct.worst, 'dropped frames, worst of the runs, percent').toBeLessThan(BUDGET.droppedPct);
  expect(summary.longTaskMaxMs.worst, 'longest main thread task during the scroll, ms').toBeLessThanOrEqual(BUDGET.longTaskMs);
});
