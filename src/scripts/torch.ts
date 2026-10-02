// Flashlight: the page is revealed by a soft light.
// Pointer devices: it follows the cursor. Touch devices: it drifts slowly and leans with the scroll.
import { still, touch } from './env';

const IDLE_MS = 20000;

export function initTorch() {
  const root = document.documentElement;
  const beam = document.querySelector<HTMLElement>('.torch__beam');
  if (!beam || still) return;

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let x = vw * 0.5;
  let y = vh * 0.38;
  let tx = x;
  let ty = y;
  let manualUntil = 0;
  let lean = 0;
  let lastScroll = window.scrollY;
  let running = true;

  const onResize = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
  };
  window.addEventListener('resize', onResize, { passive: true });

  window.addEventListener(
    'pointermove',
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      manualUntil = performance.now() + (e.pointerType === 'mouse' ? 1e9 : 2500);
    },
    { passive: true },
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      manualUntil = performance.now() + (e.pointerType === 'mouse' ? 1e9 : 2500);
    },
    { passive: true },
  );
  window.addEventListener(
    'scroll',
    () => {
      const s = window.scrollY;
      lean = Math.max(-1, Math.min(1, lean + (s - lastScroll) / 240));
      lastScroll = s;
    },
    { passive: true },
  );

  let raf = 0;
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const frame = (now: number) => {
    raf = 0;
    if (!running) return;
    if (now > manualUntil) {
      // Slow drift. Two unrelated periods so the path never visibly repeats.
      const t = now / 1000;
      tx = vw * (0.5 + 0.26 * Math.sin(t * 0.21) + 0.06 * Math.sin(t * 0.53 + 1.3));
      ty = vh * (0.42 + 0.14 * Math.sin(t * 0.17 + 2.1) + lean * 0.2);
    }
    lean *= 0.95;
    const k = touch ? 0.045 : 0.14;
    x += (tx - x) * k;
    y += (ty - y) * k;
    beam.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    kick();
  };
  kick();

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) kick();
  });

  // Each section declares how dark it is outside the beam.
  const zones = document.querySelectorAll<HTMLElement>('[data-dark]');
  const scale = touch ? 0.8 : 1;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const v = Number((e.target as HTMLElement).dataset.dark ?? 0.5) * scale;
            root.style.setProperty('--torch-dark', v.toFixed(2));
          }
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    zones.forEach((z) => io.observe(z));
  }

  // After 20 seconds without input the lights go down. Any input brings them back.
  let idleTimer = 0;
  const wake = () => {
    root.classList.remove('idle');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => root.classList.add('idle'), IDLE_MS);
  };
  ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach((ev) =>
    window.addEventListener(ev, wake, { passive: true }),
  );
  wake();
}
