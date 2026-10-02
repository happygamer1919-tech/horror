// Entry point. Each module guards itself, so a missing section never breaks the rest.
import { initReveal } from './reveal';
import { initLift } from './lift';
import { initTorch } from './torch';
import { initNeon } from './neon';

initLift();
initReveal();
initTorch();
initNeon();

// Heavy or optional parts wait until the browser is idle.
const idle = (fn: () => void) =>
  'requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 2500 }) : window.setTimeout(fn, 600);

idle(() => {
  import('./fog').then((m) => m.initFog()).catch(() => {});
});
