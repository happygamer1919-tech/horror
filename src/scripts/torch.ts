// Flashlight: the page is revealed by a soft light, and the visitor holds it.
// Mouse: it follows the cursor (and drifts slowly until the cursor first moves).
// Touch: it appears where the screen is touched, follows the finger through a touch and
// through a scroll drag, and comes to rest at the last touch point. Before the first touch
// there is no light at all: the darkness has no hole in it (a flat cover, global.css), and
// the sign, the lit room and the buttons are what the visitor sees. The first touch brings
// the light in at the finger.
//
// Only `transform` is written, and only while the light is actually moving. No layout is
// read per frame: the viewport size and the rest point are cached and refreshed on resize.
import { still, touch } from './env';
import { hooks } from './hero-hooks';

const IDLE_MS = 20000;

// Viewport position of the light, shared with the facade (the room that is being watched).
// `lit` is false on a touch screen until the first touch: there is no beam yet.
export const torchState = { x: 0, y: 0, r: 0, touched: false, lit: !touch };

export function initTorch() {
  const root = document.documentElement;
  const beams = Array.from(document.querySelectorAll<HTMLElement>('.torch__beam'));
  hooks.torch = torchState;
  if (!beams.length || still) return;

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let x = vw * 0.5;
  let y = vh * (touch ? 0.26 : 0.38);
  let tx = x;
  let ty = y;
  let scrollY = window.scrollY;
  let lean = 0;
  let running = true;
  let finger = false; // a touch is down right now
  let manual = false; // the visitor has taken the light
  let manualUntil = 0; // mouse: forever. Pen or touch on a hover device: for good as well.
  const measure = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    torchState.r = Math.max(vw, vh) * (touch ? 0.21 : 0.165);
    kick();
  };

  const take = (px: number, py: number) => {
    tx = px;
    ty = py;
    if (!torchState.lit) {
      // First touch: the light comes on where the finger is. It does not travel there.
      x = px;
      y = py;
      torchState.lit = true;
      root.classList.add('has-light');
    }
    manual = true;
    torchState.touched = true;
    kick();
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return; // touch events below do this, also during scroll
      take(e.clientX, e.clientY);
      manualUntil = Infinity;
    },
    { passive: true },
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') return;
      take(e.clientX, e.clientY);
      manualUntil = Infinity;
    },
    { passive: true },
  );

  // Touch events keep coming while the browser scrolls natively (pointer events are
  // cancelled the moment a scroll starts), so the light stays under the finger.
  const onTouch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    finger = true;
    manualUntil = Infinity;
    take(t.clientX, t.clientY);
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) finger = false;
    kick();
  };
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('touchmove', onTouch, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });

  window.addEventListener(
    'scroll',
    () => {
      const s = window.scrollY;
      lean = Math.max(-1, Math.min(1, lean + (s - scrollY) / 240));
      scrollY = s;
      if (!manual) kick();
    },
    { passive: true },
  );

  let raf = 0;
  let last = 0;
  const kick = () => {
    if (!raf && running) raf = requestAnimationFrame(frame);
  };
  const frame = (now: number) => {
    raf = 0;
    if (!running) return;
    const dt = Math.min(64, last ? now - last : 16.7);
    last = now;
    const drifting = !touch && now > manualUntil;
    if (drifting) {
      // Slow drift until the cursor arrives. Two unrelated periods so the path never
      // visibly repeats.
      const t = now / 1000;
      tx = vw * (0.5 + 0.26 * Math.sin(t * 0.21) + 0.06 * Math.sin(t * 0.53 + 1.3));
      ty = vh * (0.42 + 0.14 * Math.sin(t * 0.17 + 2.1) + lean * 0.2);
      lean *= 0.95;
    } else if (!torchState.lit) {
      // Touch screen, nobody has touched yet: no light, nothing to move.
      last = 0;
      return;
    }
    // Follow fast under a finger or a cursor, settle slowly once the finger lifts.
    const rate = finger ? 0.26 : touch ? 0.085 : 0.14;
    const k = 1 - Math.pow(1 - rate, dt / 16.7);
    x += (tx - x) * k;
    y += (ty - y) * k;
    const moving = Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05;
    if (!moving) {
      x = tx;
      y = ty;
    }
    torchState.x = x;
    torchState.y = y;
    const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    for (const b of beams) b.style.transform = tf;
    if (moving || drifting) kick();
    else last = 0;
  };

  if (touch) {
    // Far away from anything that asks where the light is (the rain, the lit room).
    torchState.x = x = tx = -1e5;
    torchState.y = y = ty = -1e5;
  }
  measure();
  window.addEventListener('resize', measure, { passive: true });
  kick();

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    last = 0;
    if (running) kick();
  });

  // Each section declares how dark it is outside the beam. Touch screens get a softer
  // darkness below the hero; a section can pin its own touch value with data-dark-touch.
  const zones = document.querySelectorAll<HTMLElement>('[data-dark]');
  const scale = touch ? 0.8 : 1;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const d = (e.target as HTMLElement).dataset;
            const v = touch && d.darkTouch ? Number(d.darkTouch) : Number(d.dark ?? 0.5) * scale;
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
  ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart', 'touchmove', 'wheel'].forEach((ev) =>
    window.addEventListener(ev, wake, { passive: true }),
  );
  wake();
}
