# Scroll performance notes

The owner saw scroll lag on a phone. This file records how it was measured, what the
baseline costs, what was fixed in `src/scripts/scroll.ts`, and what the other parts of the
page cost, with precise fixes for the files other builders own.

## Short version

- **Cause of the lag: Lenis on touch.** Lenis registers `touchstart` and `touchmove`
  listeners with `passive: false`. That forces the browser to ask the page's main thread
  before it may move the page under a finger. Every scroll frame on a phone depended on the
  main thread (1152 of 1152 scroll frames in the trace), so any main thread work (WebGL fog
  start, canvas drawing, style recalculation, garbage collection) froze the page under the
  finger. With an 800 ms main thread hang, the page stayed frozen for 650 ms after the finger
  started to move. Lenis never smoothed touch here (`syncTouch` was off), so it gave nothing
  in return.
- **Fix (this branch):** native scroll on touch devices, Lenis kept on mouse and trackpad.
  After it, 0 of about 1170 scroll frames depend on the main thread, and the same 800 ms hang
  holds the scroll back for 27 ms instead of 650 ms.
- **The acceptance numbers at 4x pass before and after on this machine** (dropped 0.1 percent,
  no long task). The 4x throttle on an Apple M5 is a fast phone. The difference shows at a
  higher throttle (12x requested, 9.5x to 12.5x measured) and in the hang test, which does not
  depend on machine speed at all. Both are in the tables below.

## The harness

```
PW_PORT=4334 npm run test:perf
```

Separate from `npm test` on purpose: timing on shared CI runners is noisy, so it never gates
the deploy. `playwright.perf.config.ts` only matches `tests/perf/*.perf.ts`; the functional
config (`playwright.config.ts`) only matches `*.spec.ts`, so neither picks up the other.

Files:

| File | What it does |
|------|--------------|
| `tests/perf/scroll.perf.ts` | The acceptance test. 3 measured runs plus 1 profiled run, asserts the budget, prints `PERF_SUMMARY {...}`, writes `test-results/perf-summary.json`. |
| `tests/perf/blocked.perf.ts` | The hang test: does an 800 ms main thread hang hold a touch scroll back? Two control pages first, so the instrument proves itself. Writes `test-results/perf-blocked.json`. |
| `tests/perf/harness.ts` | Emulation, the scripted scroll, trace analysis. |
| `tests/perf/variants.ts` | Experiments: each switches one suspected cause off by injected CSS or a stub, without touching the source. |
| `tests/perf/rest.perf.ts` | Opt-in (`PERF_REST=1`): work per second with no input, per experiment. |
| `tests/perf/layers.mjs` | Layer evidence: every composited layer, its size, why Chrome made it, repaints during a short scroll. |

Conditions: Chromium (Playwright's Chrome for Testing 153), 390 x 844 at dpr 3, `isMobile`,
`hasTouch`, an Android Chrome user agent, `hover: none` and `pointer: coarse` emulated (Playwright
leaves `hover: hover`, a real phone does not), GPU rasterisation on (`--enable-gpu`; headless
otherwise falls back to software rendering, which makes every layer look far more expensive
than on a phone), `Emulation.setCPUThrottlingRate 4`, preloader skipped
(`sessionStorage hotel:lift=1`), load plus fonts plus 3 s for idle work, then the scroll.

The scroll: real touch gestures through `Input.synthesizeScrollGesture`
(`gestureSourceType: touch`), a rotation of four swipes (520 px at 1500 px/s, 600 at 2600,
420 at 1100, 640 at 3800), 260 ms pause after each, until the bottom of the page (about 26
swipes, 14118 px, 18 s). No fling after the finger lifts: fling distance depends on the timing
of the last touch samples and made runs cover the page in 7 to 14 swipes.

Measured only between the first touch and 400 ms after the last swipe:

- **dropped percent** (asserted, below 10): per display refresh (60 Hz) from the compositor's
  own `PipelineReporter` trace events, the source of the DevTools Frames track. Refreshes where
  nothing wanted to change are left out. `(dropped + stale) / (presented + partial + dropped)`,
  where *stale* is a partial frame Chrome itself flags as affecting smoothness (something the
  main thread drives was moving and stood still). Also reported: *not presented percent*
  (nothing new reached the screen) and the **rAF cross-check**
  (`1 - rAF callbacks / expected frames`).
- **long tasks** (asserted, none above 100 ms): `PerformanceObserver('longtask')` in the page
  and `RunTask` slices above 50 ms on the renderer main thread in the trace. Each long task is
  attributed to trace slices and, in the profiled run, to functions and script URLs from the
  V8 CPU profile.
- Also: where the scroll was delivered (compositor or main thread, per frame), finger to screen
  latency, Chrome's own scroll jank verdict, CPU time per thread, per frame and per section,
  whole-document style recalculations, paint and raster counts.

Run it 3 times, report median and worst. Each run is bracketed by a machine check (an empty
page must hold 60 fps, a fixed piece of arithmetic must take its usual time, and the throttle
measured inside the page must be within 0.75x to 1.35x of the one asked for). A run that fails
the check is set aside and repeated, up to 6 times, and listed in the summary.

Options: `PERF_RUNS`, `PERF_CPU` (stress throttle, never asserted), `PERF_VARIANT` (an
experiment, never asserted), `PERF_LABEL` (names the output file, for measuring another build
served on `PW_PORT`), `PERF_KEEP_NOISY`, `PERF_PROFILE=0`, `PERF_KEEP_TRACE=1`, `PERF_GPU=0`,
`PERF_ASSERT=0`.

### Limits, read before quoting a number

- `setCPUThrottlingRate` slows the renderer main thread only. Compositor, raster and GPU run at
  full M5 speed, so GPU and raster costs (large layers, blending, overdraw) are under-reported.
- The 4x asked for measured 3.2x to 3.5x inside the page; 12x measured 9.2x to 12.5x.
- Four builders shared this machine. Another builder's long GPU render (corridor frames) ran
  during much of the session. Runs on a busy machine were discarded by the machine check; the
  experiment sweep could not wait for a quiet machine and is read by counts and CPU per frame
  only (see there).
- A real phone was not tested.

## Before and after

Builds measured: **before** = `ef3a685` (the baseline, untouched), **scroll.ts only** =
baseline plus this branch's `src/scripts/scroll.ts` and nothing else, **after** = this branch
(scroll.ts plus the fog start change in `main.ts`, see "Fog start" below). The other two were
served from a scratch copy on another port and measured with the same harness
(`PERF_LABEL=... PW_PORT=<port>`).

### Acceptance run, 4x CPU, median / worst of 3

| | before | scroll.ts only | after |
|---|---|---|---|
| dropped percent (asserted < 10) | 0.1 / 0.1 | 0.1 / 0.2 | 0.1 / 0.3 |
| not presented percent | 0 / 0 | 0.1 / 0.1 | 0 / 0.2 |
| rAF cross-check, dropped percent | 0 / 0.1 | 0.1 / 0.1 | 0 / 0.1 |
| long tasks, count | 0 / 0 | 0 / 0 | 0 / 0 |
| longest task, ms (asserted <= 100) | 0 / 0 | 0 / 0 | 0 / 0 |
| scroll frames that waited for the main thread | 1152 / 1168 | 0 / 0 | 0 / 0 |
| scroll frames on the compositor alone | 0 / 0 | 1170 / 1181 | 1174 / 1176 |
| main thread CPU, ms per second of scrolling | 95.2 / 98.5 | 74.3 / 87.4 | 71.0 / 72.7 |
| of which Layerize, ms/s | 23.5 | 13.4 | 13.2 |
| all threads CPU, ms/s | 128.3 / 132.2 | 104.1 / 120.3 | 99.6 / 101.4 |
| main thread CPU per frame, median ms | 1.12 / 1.17 | 0.87 / 1.03 | 0.85 / 0.87 |
| verdict | pass | pass | pass |

The "after" build here has the same main script hash (`ED1WXhDB`) as the committed branch.
A later re-run on the committed branch, while another builder's GPU render kept the machine
busy (an empty page dropped 13 to 15 percent of frames), measured about 60 percent dropped on
every run: the machine, not the site. The test now reports such a run as inconclusive instead
of as a missed budget (`verdict` and `noisyRunsKept` in the summary).

Pass on all three. On this machine 4x does not separate them by dropped frames; the
scroll-delivery rows and the CPU rows do (about 22 percent less main thread work, because a
compositor scroll does not re-layerize the whole document every frame).

### Stress run, 12x CPU requested (9.2x to 12.5x measured), median / worst of 3, never asserted

| | before | scroll.ts only | after |
|---|---|---|---|
| dropped percent | 1.9 / 16.9 | 1.9 / 2.1 | 2.0 / 61.7 * |
| not presented percent | 0.1 / 6.6 | 0.1 / 0.1 | 0.2 / 36.2 * |
| long tasks, count | 1 / 7 | 1 / 1 | 1 / 3 * |
| longest task, ms | 82.9 / 643.7 | 68.4 / 72.5 | 80.4 / 251.3 * |
| scroll latency p95, ms | 20.3 / 87.3 | 18.0 / 18.7 | 18.8 / 119.4 * |
| Chrome scroll jank, percent of frames | 0.9 / 3.1 | 0.2 / 0.7 | 0.4 / 51.3 * |
| main thread CPU per frame, median ms | 2.9 / 3.7 | 2.2 / 2.4 | 2.6 / 2.9 |

\* The third "after" run was taken on a busy machine (empty page dropping 21.5 percent) after
six attempts had been set aside; it is kept and marked noisy in the summary. The two clean
"after" runs match "scroll.ts only". The worst "before" run ran at 12.5x measured against
9.2x and 9.6x for the other two, so its 643 ms task (485 ms of it one rAF callback) is partly
that heavier throttle.

### The hang test (`blocked.perf.ts`), finger down to first scrolled frame, ms

An 800 ms busy loop on the main thread; the finger starts to drag 150 ms into it.

| | median | worst | scrolled during the hang |
|---|---|---|---|
| control: plain page, no listener | 15 to 26 | | yes |
| control: plain page, one `passive: false` touchmove | 639 to 648 | | no |
| before | 649.8 | 652.1 | no, 3 of 3 |
| scroll.ts only | 27.0 | 35.6 | yes, 3 of 3 |
| after | 26.5 to 70.6 (two sessions) | 42.9 to 75.4 | yes, 3 of 3 |

This is the owner's symptom, measured independently of machine speed: before, the baseline
behaves exactly like the control page with a blocking listener; after, like the free page.

## Delta attributable to the scroll.ts fix alone

From "before" to "scroll.ts only", same harness, same session:

- Scroll frames that wait for the main thread: 1152 to 0 per scroll (100 percent to 0).
- Scroll start during an 800 ms main thread hang: 650 ms frozen to 27 ms.
- Main thread CPU during the scroll: -22 percent (95 to 74 ms/s); Layerize -43 percent.
- At 12x: worst dropped 16.9 to 2.1 percent, worst scroll latency p95 87 to 19 ms, worst long
  task 644 to 73 ms. (Caveat on the worst before run above.)
- Lenis is no longer downloaded or parsed on touch devices (loaded with a dynamic import on
  pointer devices only).

## Ranked causes

Ranked by what a phone user feels during a scroll. Evidence and cost come from the baseline
unless stated.

| # | Cause | Evidence | Measured cost | Recommended fix | File | After the corridor rewrite |
|---|---|---|---|---|---|---|
| 1 | Lenis on touch: non-passive touch listeners put every scroll frame on the main thread | trace `scroll_state`: 1152 of 1152 scroll frames `SCROLL_MAIN_THREAD`; hang test 650 ms frozen, same as the blocking control | the whole symptom: any main thread task becomes scroll lag; plus 22 percent of main thread CPU | **Done**: native scroll on `(hover: none), (pointer: coarse)`, Lenis on pointer devices only | `src/scripts/scroll.ts` | still valid |
| 2 | Torch beam moved from JavaScript every frame | `torch.ts` writes `beam.style.transform` in a rAF loop that never stops, so the main thread has to produce every frame, scroll or not; at rest, with no input, the page never goes idle (26 to 48 main thread frames per second, `perf-rest.before.json`). Variant `torch-static` (beam style frozen, script still running) | main thread CPU per frame 1.20 to 0.71 ms (-42 percent); `no-torch` 0.63 ms (-48 percent). The largest single per-frame cost on the page. On a slow phone the beam stutters ("stale" frames) whenever the main thread is late | stop the loop once the beam has arrived; on touch run the slow drift as a CSS animation on `transform` (composited) and use script only while a finger is down | `src/scripts/torch.ts` (torch builder) | still valid |
| 3 | WebGL fog start on first input | profiled run: one long task at the first swipe in `#lobby`, 62 to 98 ms at about 10x; V8 profile inside it: `getExtension` 40 to 63 ms, `getContext` 9 to 99 ms, `setShaders` 3 to 8 ms (fog.js, OGL `Renderer` constructor) | the only long task left at 10x; under 50 ms at 4x on this machine. Running fog itself: `no-fog-gl` shows no per-frame change (1.26 ms, within noise) | see "Fog start" | `src/scripts/main.ts` (start), `src/scripts/fog.ts` | still valid |
| 4 | `--torch-dark` written on `<html>` | 10 whole-document style recalculations per scroll in every run (one per section boundary), 8 ms each at 4x, 25 to 27 ms at 10x. Variant `torch-dark-local` (variable written on `.torch`): 0 | 10 frames per scroll that can miss their deadline on a slow phone; removed entirely by the variant | set the variable on the `.torch` element instead of `document.documentElement` | `src/scripts/torch.ts` | still valid |
| 5 | Corridor 2D canvas redrawn per scroll frame | variant `no-corridor`; V8 profile: `fillText` 161 ms over an 18 s scroll at 10x, the largest single canvas call (corridor room plates and CCTV text) | main thread CPU per frame 1.20 to 1.03 ms (-15 percent), p95 4.6 to 3.5 ms | moot after the rewrite; if kept, draw the room plate text once into an offscreen canvas | `src/scripts/corridor.ts` | **obsolete** after the image-sequence rewrite (re-measure the new scrubber with this harness) |
| 6 | Torch beam layer size | `layers.mjs`: `.torch__beam` is 2532 x 2532 CSS px (19.5 screens), 220 MB if fully rastered at dpr 3; compositing reason `WillChangeTransform`. Variant `torch-small` | no change on the main thread (as expected); GPU and raster cost cannot be measured here, the M5 GPU is not throttled. Risk on a phone: GPU memory and tile raster | 200vw x 200vh with the gradient stops in `vmax` (variant `torch-small`, same picture) | `src/styles/global.css` (`.torch__beam`) | still valid |
| 7 | Scroll reveals and the `section#file` overlap layer | variant `no-reveal`: paints 426 to 288, raster tasks 433 to 188 (counts, robust); `layers.mjs`: `section#file` promoted to a 390 x 9729 px layer by `Overlap` (130 MB if fully rastered), 9 repaints in a short scroll through it | half of all paint and raster work during the scroll; raster time small on the M5 (14.5 to 13.4 ms total), larger on a phone | untested suggestion: `isolation: isolate` on `.corr`, or drop `will-change` from `.corr__caps li` once they have shown, so the sections below stop being promoted; re-check with `layers.mjs` | `src/components/Corridor.astro`, reveal CSS in `src/styles/global.css` | the overlap part likely changes with the rewrite |
| 8 | Grain, tint, dim, neon, CCTV, fog blend | variants `no-grain`, `grain-static`, `no-tint-dim`, `no-neon`, `no-cctv`, `no-fog-blend` | none measurable on the main thread (each within plus or minus 0.1 ms per frame of the base, inside the noise). Their cost is GPU fill (full-screen layers blended over everything), which this desktop GPU does not show | no change recommended on this evidence; if a real phone still stutters after rows 1 to 4, try `no-overlays` on that phone first | `src/styles/global.css`, `Hero.astro`, `Cctv.astro` | still valid |

### Experiment sweep (variants on the baseline, 4x)

Each variant switches one suspected cause off (`tests/perf/variants.ts`), 2 runs each, on the
baseline build. The machine was busy with another builder's GPU render for the whole sweep
(an empty page dropped 10 to 26 percent of frames), so dropped percent and long tasks from
this sweep say nothing and are left out. What survives a busy machine: CPU time per frame
(thread time, median over about 1000 frames) and counts.

| variant | what it switches off | main CPU per frame, median ms (2 runs) | p95 ms | paints | raster tasks | whole-document restyles |
|---|---|---|---|---|---|---|
| base | nothing | 1.23, 1.16 | 4.6 | 426 | 433 | 10 |
| floor | everything below at once | 0.12, 0.12 | 1.6 | 323 | 178 | 10 |
| no-torch | flashlight overlay hidden | 0.69, 0.58 | 4.3 | 424 | 421 | 10 |
| torch-static | beam not moving, darkness fixed | 0.69, 0.73 | 4.8 | 417 | 401 | 10 |
| no-overlays | torch, grain, tint, dim hidden | 0.56, 0.65 | 3.6 | 494 | 457 | 10 |
| no-corridor | corridor canvas never draws | 1.00, 1.06 | 3.5 | 430 | 434 | 10 |
| no-reveal | reveals shown at once | 0.93, 1.25 | 3.9 | 288 | 188 | 10 |
| grain-static | grain not animated | 1.07, 1.11 | 4.2 | 422 | 487 | 10 |
| no-grain | grain hidden | 1.16, 1.18 | 4.1 | 446 | 411 | 10 |
| no-neon | dying letter fixed, no drop-shadow | 1.21, 1.13 | 4.9 | 412 | 430 | 10 |
| no-cctv | CCTV feeds never draw | 1.18, 1.14 | 4.7 | 419 | 392 | 10 |
| no-fog-gl | WebGL fog never starts | 1.21, 1.30 | 4.7 | 428 | 423 | 10 |
| no-fog-blend | fog canvas without `mix-blend-mode` | 1.08, 1.30 | 4.7 | 561 | 533 | 10 |
| torch-small | beam 4 screens instead of 19.5 | 1.27, 1.33 | 4.6 | 434 | 463 | 10 |
| torch-dark-local | `--torch-dark` on `.torch`, not `<html>` | 1.42, 1.24 | 4.3 | 391 | 479 | **0** |
| no-tint-dim | tint and dim hidden | 1.86, 1.15 | 5.1 | 447 | 396 | 10 (run 1 on a machine dropping 73 to 88 percent idle, ignore) |

Reading: differences under about 0.15 ms per frame are inside the run-to-run spread. The torch
motion is the one large main thread cost; the corridor canvas is the second. Together with
everything else they are 90 percent of the per-frame main thread work (`floor`).

## Fog start (in `main.ts`, shared file)

The previous builder on this stream changed `src/scripts/main.ts` so that on touch devices the
fog waits until the page has been at rest for 400 ms before it starts (pointer devices keep
the immediate start), with two tests in `tests/scroll.spec.ts`. Kept, but flagged for the
integrator, because the fog belongs to the hero builder:

- What it buys: the fog's start-up stall (row 3) no longer lands under a moving finger.
- What it does not buy: with native scroll the stall no longer freezes the scroll anyway
  (hang test), and in this harness the stall still falls inside the measuring window (in a
  pause between swipes), so the 12x numbers are the same with and without it.
- Recommendation: keep it only if the hero builder agrees; the cleaner fix is in `fog.ts`:
  create the OGL `Renderer` (the `getContext` and `getExtension` calls) from
  `requestIdleCallback` after load, and start drawing only when the hero is in view.

## Exact changes recommended for files this branch does not own

1. `src/scripts/torch.ts` (torch builder, being rebuilt):
   - Replace `root.style.setProperty('--torch-dark', ...)` with
     `torch.style.setProperty('--torch-dark', ...)` where `torch = document.querySelector('.torch')`.
     `.torch` reads `opacity: var(--torch-dark, 0.85)`, so the picture is the same; only one
     element is restyled instead of the whole document. Removes 10 whole-document style
     recalculations per scroll.
   - Animate only `transform` (beam position) and `opacity` (darkness). Already true for
     the beam; keep it so in the rebuild.
   - Stop the rAF loop when the beam is within 0.5 px of its target and nothing drives it;
     restart it from the input handlers. On touch, run the slow drift as a CSS `@keyframes`
     on a wrapper's `transform` (composited, costs no main thread), and use JavaScript only
     for touch-follow while a finger is down.
2. `src/styles/global.css` (`.torch__beam`): make the beam `200vw x 200vh` with
   `margin: -100vh 0 0 -100vw` and gradient stops in `vmax` (exact CSS in
   `tests/perf/variants.ts`, variant `torch-small`): 4 screens instead of 19.5, same picture.
3. `src/scripts/fog.ts`: see "Fog start".
4. `src/components/Corridor.astro`: after the rewrite, run `node tests/perf/layers.mjs` on a
   served build and check that no section below the corridor is promoted by `Overlap`.
5. Any new canvas scrubber (corridor rewrite): draw only when the frame index changes, from a
   ScrollTrigger `onUpdate` that just stores progress and a single rAF that draws; never
   decode images inside the scroll callback (pre-decode with `img.decode()`); re-run
   `PW_PORT=4334 npm run test:perf` on the integrated build.

## Re-running

- Acceptance: `PW_PORT=4334 npm run test:perf` (builds, serves on 4334, about 4 to 8 minutes).
- Another build: serve it on a free port, then `PW_PORT=<port> PERF_LABEL=<name> npm run test:perf`.
- An experiment: `PERF_VARIANT=no-torch PW_PORT=4334 npm run test:perf`.
- Stress: `PERF_CPU=12 PW_PORT=4334 npm run test:perf`.
- At rest: `PERF_REST=1 PW_PORT=4334 npx playwright test --config=playwright.perf.config.ts rest`.
- Layers: serve, then `PW_PORT=4334 node tests/perf/layers.mjs`.
- `npm test` empties `test-results/` when it starts (Playwright clears its output folder), which
  deletes `perf-summary.json`. Run the perf harness after the functional suite, not before.
- `reuseExistingServer` is on outside CI: if something already listens on `PW_PORT`, the
  harness measures that server, not a fresh build. Check the `bundle` field in the summary
  (the hashed name of the page's main script) to be sure which build was measured.
