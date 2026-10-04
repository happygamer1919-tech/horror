// Flashlight: the page is revealed by a soft light, and the visitor holds it.
// Mouse: it follows the cursor (and drifts slowly until the cursor first moves).
// Touch: the light is on from the first paint and wanders slowly over the hero (drift.ts).
// That drift is a CSS animation on two wrappers around the beam: the compositor moves it and
// this script only knows where it is. At the first touch the drift stops where it is, the
// light goes to the finger, follows it through a touch and through a scroll drag, and comes
// to rest at the last touch point.
//
// Only `transform` is written, and only while the light is actually moving. No layout is
// read per frame: the viewport size and the rest point are cached and refreshed on resize.
import { still, touch } from './env';
import { hooks } from './hero-hooks';
import { driftAt, DRIFT_NAMES } from './drift';

const IDLE_MS = 20000;

// Viewport position of the light, shared with the facade (the room that is being watched).
// While the CSS drift runs, `x` and `y` are worked out from the animation clock when they
// are asked for (arithmetic only, no style or layout read).
let sx = 0;
let sy = 0;
let live: (() => void) | null = null;
export const torchState = {
  get x() {
    live?.();
    return sx;
  },
  get y() {
    live?.();
    return sy;
  },
  r: 0,
  touched: false,
  // There is a light whenever the flashlight is shown at all (not with reduced motion).
  lit: !still,
};

export function initTorch() {
  const root = document.documentElement;
  const torch = document.querySelector<HTMLElement>('.torch');
  const beams = Array.from(document.querySelectorAll<HTMLElement>('.torch__beam'));
  hooks.torch = torchState;
  if (!beams.length || still) return;

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let x = vw * 0.5;
  let y = vh * 0.38;
  let tx = x;
  let ty = y;
  let scrollY = window.scrollY;
  let lean = 0;
  let running = true;
  let finger = false; // a touch is down right now
  let manual = false; // the visitor has taken the light
  let manualUntil = 0; // mouse: forever. Pen or touch on a hover device: for good as well.

  // --- touch: the drift before the first touch -------------------------------------------
  // 'css': the keyframes move the light (the normal case). 'js': no Web Animations API to
  // read the clock from, so this script walks the same path. null: no drift (pointer
  // device, or the visitor has the light).
  let drift: 'css' | 'js' | null = null;
  let heroOn = true;
  let clockA: Animation | null = null;
  let clockB: Animation | null = null;
  const anims: Animation[] = [];
  if (touch) {
    const wraps = Array.from(document.querySelectorAll<HTMLElement>('.torch__drift'));
    const named = (el: HTMLElement, name: string) => (el.getAnimations ? el.getAnimations() : []).find((a) => (a as CSSAnimation).animationName === name) ?? null;
    const pairs = wraps.filter((w) => !w.parentElement?.classList.contains('torch__drift')).map((outer) => {
      const inner = outer.querySelector<HTMLElement>('.torch__drift');
      return { a: named(outer, DRIFT_NAMES.a), b: inner ? named(inner, DRIFT_NAMES.b) : null, page: outer.parentElement === torch };
    });
    const clock = pairs.find((p) => p.page) ?? pairs[0];
    if (pairs.length && pairs.every((p) => p.a && p.b)) {
      drift = 'css';
      clockA = clock.a;
      clockB = clock.b;
      for (const p of pairs) anims.push(p.a!, p.b!);
      // The veil in the hero is parsed before the page flashlight, so its animation may have
      // started a frame earlier. Put every copy on the page flashlight's clock.
      Promise.all(anims.map((a) => a.ready))
        .then(() => {
          if (drift !== 'css') return;
          for (const p of pairs) {
            if (p === clock) continue;
            p.a!.currentTime = clockA!.currentTime;
            p.b!.currentTime = clockB!.currentTime;
          }
        })
        .catch(() => {});
    } else {
      drift = 'js';
      root.classList.add('torch-js');
    }
  }
  const driftPoint = (msA: number, msB: number) => {
    const p = driftAt(msA, msB);
    return { x: p.x * vw, y: p.y * vh };
  };
  const readDrift = () => {
    const p = driftPoint(Number(clockA?.currentTime) || 0, Number(clockB?.currentTime) || 0);
    sx = p.x;
    sy = p.y;
  };
  // The drift stands still while the hero is off screen or the tab is hidden.
  const driftAwake = () => heroOn && !document.hidden;
  const syncDrift = () => {
    if (drift === 'css') for (const a of anims) driftAwake() ? a.play() : a.pause();
    else if (drift === 'js' && driftAwake()) kick();
  };
  let heroIo: IntersectionObserver | null = null;

  const measure = () => {
    // The drift is laid out in percent of the flashlight layer, which fills the viewport.
    vw = (touch && torch?.clientWidth) || window.innerWidth;
    vh = (touch && torch?.clientHeight) || window.innerHeight;
    torchState.r = Math.max(vw, vh) * (touch ? 0.21 : 0.165);
    kick();
  };

  const place = () => {
    sx = x;
    sy = y;
    const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    for (const b of beams) b.style.transform = tf;
  };

  // The visitor takes the light: the drift stops exactly where the light is on the screen,
  // and the beam is handed to the frame loop from that point, so nothing jumps.
  const hold = () => {
    if (!drift) return;
    if (drift === 'css') {
      // One read, at an input event: the beam's own box is its centre (it has no size).
      const r = (torch?.querySelector('.torch__beam') ?? beams[0]).getBoundingClientRect();
      x = r.left;
      y = r.top;
    }
    drift = null;
    live = null;
    heroIo?.disconnect();
    place();
    root.classList.add('torch-js');
  };

  const take = (px: number, py: number) => {
    hold();
    tx = px;
    ty = py;
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
    // While the keyframes move the light there is nothing for a frame to do.
    if (!raf && running && drift !== 'css') raf = requestAnimationFrame(frame);
  };
  const frame = (now: number) => {
    raf = 0;
    if (!running || drift === 'css') return;
    if (drift === 'js') {
      // Fallback: the same path as the keyframes, walked from here.
      if (!driftAwake()) {
        last = 0;
        return;
      }
      const p = driftPoint(now, now);
      x = tx = p.x;
      y = ty = p.y;
      place();
      kick();
      return;
    }
    const dt = Math.min(64, last ? now - last : 16.7);
    last = now;
    const roaming = !touch && now > manualUntil;
    if (roaming) {
      // Slow drift until the cursor arrives. Two unrelated periods so the path never
      // visibly repeats.
      const t = now / 1000;
      tx = vw * (0.5 + 0.26 * Math.sin(t * 0.21) + 0.06 * Math.sin(t * 0.53 + 1.3));
      ty = vh * (0.42 + 0.14 * Math.sin(t * 0.17 + 2.1) + lean * 0.2);
      lean *= 0.95;
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
    place();
    // At rest the loop stops; the input handlers start it again.
    if (moving || roaming) kick();
    else last = 0;
  };

  measure();
  if (drift === 'css') live = readDrift;
  else {
    if (drift === 'js') {
      const p = driftPoint(performance.now(), performance.now());
      x = tx = p.x;
      y = ty = p.y;
    }
    place();
  }
  window.addEventListener('resize', measure, { passive: true });
  kick();

  if (drift) {
    const hero = document.getElementById('lobby');
    if (hero && 'IntersectionObserver' in window) {
      heroIo = new IntersectionObserver((e) => {
        heroOn = e[e.length - 1].isIntersecting;
        syncDrift();
      });
      heroIo.observe(hero);
    }
  }

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    last = 0;
    syncDrift();
    if (running) kick();
  });

  // Each section declares how dark it is outside the beam. Touch screens get a softer
  // darkness below the hero; a section can pin its own touch value with data-dark-touch.
  // The value is set on the flashlight layer itself, not on <html>: a variable on the root
  // would restyle the whole document at every section boundary.
  const zones = document.querySelectorAll<HTMLElement>('[data-dark]');
  const scale = touch ? 0.8 : 1;
  if (torch && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const d = (e.target as HTMLElement).dataset;
            const v = touch && d.darkTouch ? Number(d.darkTouch) : Number(d.dark ?? 0.5) * scale;
            torch.style.setProperty('--torch-dark', v.toFixed(2));
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
