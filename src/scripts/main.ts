// Entry point. Each module guards itself, so a missing section never breaks the rest.
import { initReveal } from './reveal';
import { initLift } from './lift';
import { initTorch } from './torch';
import { initNeon } from './neon';
import { initScroll } from './scroll';
import { initCorridor } from './corridor';
import { initLevel } from './level';
import { initCheckin, initVoucher } from './checkin';
import { initToday, initTitle, initSticky, initHanger } from './misc';
import { initAudio } from './audio';

initLift();
initScroll();
initReveal();
initTorch();
initNeon();
initCorridor();
initToday();
initTitle();
initLevel();
initCheckin();
initVoucher();
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
let fogStarted = false;
const startFog = () => {
  if (fogStarted) return;
  fogStarted = true;
  fogEvents.forEach((ev) => window.removeEventListener(ev, startFog));
  import('./fog').then((m) => m.initFog()).catch(() => {});
};
const fogEvents = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'scroll'];
fogEvents.forEach((ev) => window.addEventListener(ev, startFog, { passive: true, once: true }));
window.setTimeout(startFog, 6000);
