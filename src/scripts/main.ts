// Entry point. Each module guards itself, so a missing section never breaks the rest.
import { initReveal } from './reveal';
import { initLift } from './lift';
import { initTorch } from './torch';
import { initNeon } from './neon';
import { initFacade } from './facade';
import { initScroll, nativeScroll } from './scroll';
import { initCorridor } from './corridor';
import { initLevel } from './level';
import { initCheckin } from './checkin';
import { initBooking } from './booking';
import { initToday, initTitle, initSticky, initHanger } from './misc';
import { initAudio } from './audio';

initLift();
initScroll();
initReveal();
initTorch();
initNeon();
initFacade();
initCorridor();
initToday();
initTitle();
initLevel();
initBooking();
initCheckin();
initSticky();
initHanger();
initAudio();

// Heavy or optional parts wait until the browser is idle.
const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
const idle = (fn: () => void) => (ric ? ric(fn, { timeout: 2500 }) : window.setTimeout(fn, 600));

idle(() => {
  import('./cctv').then((m) => m.initCctv()).catch(() => {});
});

// The WebGL fog rolls in on the first sign of life (or after 6 seconds). Until then the
// CSS halo stands in, so the first paint never waits for a GPU context.
//
// Starting it costs one stall (WebGL context plus shader compile, 60 to 140 ms measured, see
// docs/perf-notes.md). On a touch device the first sign of life is nearly always the start of
// a scroll, and a stall under a moving finger is a visible hitch. So there it waits until the
// page has been at rest for a moment. Pointer devices keep the immediate start.
const FOG_REST_MS = 400;
let fogStarted = false;
let fogTimer = 0;
const startFog = () => {
  if (fogStarted) return;
  fogStarted = true;
  window.clearTimeout(fogTimer);
  fogEvents.forEach((ev) => window.removeEventListener(ev, wakeFog));
  import('./fog').then((m) => m.initFog()).catch(() => {});
};
const wakeFog = () => {
  if (!nativeScroll) return startFog();
  window.clearTimeout(fogTimer);
  fogTimer = window.setTimeout(startFog, FOG_REST_MS);
};
const fogEvents = ['pointermove', 'pointerdown', 'touchstart', 'touchmove', 'keydown', 'scroll'];
fogEvents.forEach((ev) => window.addEventListener(ev, wakeFog, { passive: true }));
window.setTimeout(wakeFog, 6000);
