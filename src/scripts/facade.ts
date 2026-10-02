// The hotel front, beyond the sign: the guest in the lit room, lightning, rain.
// Nothing here reads layout per frame. Positions are measured on load and on resize, and
// everything stops while the hero is off screen or the tab is hidden.
import { still } from './env';
import { hooks, ticker } from './hero-hooks';
import { torchState } from './torch';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Same shape as the `strike` keyframes in Hero.astro: one rise, one decay.
const STRIKE_MS = 1150;
const STRIKE_CURVE = [
  [0, 0],
  [0.07, 1],
  [0.16, 0.62],
  [0.3, 0.34],
  [0.5, 0.15],
  [0.75, 0.04],
  [1, 0],
];
const strikeLevel = (p: number) => {
  if (p <= 0 || p >= 1) return 0;
  for (let i = 1; i < STRIKE_CURVE.length; i++) {
    const [p1, v1] = STRIKE_CURVE[i];
    if (p <= p1) {
      const [p0, v0] = STRIKE_CURVE[i - 1];
      return v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
    }
  }
  return 0;
};

// The guest: seen on one pass of the light, gone on the next, later closer to the glass.
const FIGURE_CYCLE = ['far', 'gone', 'gone', 'near', 'gone'] as const;
type FigureState = (typeof FIGURE_CYCLE)[number];

interface Drop {
  x: number;
  y: number;
  z: number;
}

export function initFacade() {
  const hero = document.getElementById('lobby');
  const facade = document.querySelector<HTMLElement>('[data-facade]');
  if (!hero || !facade) return;

  // Browsers without container units: give the facade its unit in px.
  if (!(window.CSS && CSS.supports('width', '1cqw'))) {
    const setUnit = () => {
      document.querySelectorAll<HTMLElement>('.facade').forEach((f) => {
        f.style.setProperty('--u', `${Math.max(f.clientWidth / 600, f.clientHeight / 900)}px`);
      });
    };
    setUnit();
    window.addEventListener('resize', setUnit, { passive: true });
  }
  if (still) return;

  const figure = document.querySelector<HTMLElement>('[data-figure]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-rain]');
  const ctx = canvas?.getContext('2d') ?? null;

  // --- cached geometry, in page coordinates ------------------------------------------
  let scrollY = window.scrollY;
  let heroTop = 0;
  let unit = 1;
  let sign = { x: 0, y: 0 };
  let room = { x: 0, y: 0 };
  let cw = 0; // rain canvas, CSS px
  let ch = 0;
  let scale = 1;
  let drops: Drop[] = [];

  const measure = () => {
    scrollY = window.scrollY;
    const h = hero.getBoundingClientRect();
    const f = facade.getBoundingClientRect();
    heroTop = h.top + scrollY;
    unit = Math.max(f.width / 600, f.height / 900);
    const ox = f.left + f.width / 2 - 300 * unit;
    const oy = f.top + scrollY;
    sign = { x: ox + 300 * unit, y: oy + 92 * unit };
    // The lit room is placed by CSS (one window on phones, another on wide screens).
    const fr = figure?.getBoundingClientRect();
    room = fr && fr.width ? { x: fr.left + fr.width / 2, y: fr.top + scrollY + fr.height / 2 } : { x: ox + 388 * unit, y: oy + 350 * unit };
    if (canvas) {
      const c = canvas.getBoundingClientRect();
      cw = c.width;
      ch = c.height;
      // A small buffer: rain is soft, and a phone should not fill a full-size canvas.
      scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(650000 / Math.max(1, cw * ch)), 2);
      canvas.width = Math.max(1, Math.round(cw * scale));
      canvas.height = Math.max(1, Math.round(ch * scale));
      const n = Math.round((cw * ch) / 5200);
      drops = Array.from({ length: n }, () => ({ x: rnd(-0.25 * ch, cw), y: rnd(0, ch), z: Math.random() }));
    }
  };
  measure();
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('scroll', () => (scrollY = window.scrollY), { passive: true });

  // --- visibility ---------------------------------------------------------------------
  let visible = true;
  const awake = () => visible && !document.hidden;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => {
      visible = e[0].isIntersecting;
      hero.classList.toggle('is-off', !visible);
      if (visible) kick();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });

  // --- the guest in the lit room -------------------------------------------------------
  let figIndex = 0;
  let figState: FigureState = 'far';
  let figLit = false;
  let figForced = false;
  let figTimer = 0;
  const setFigure = (s: FigureState) => {
    figState = s;
    if (figure) figure.dataset.figure = s;
  };
  if (figure) {
    window.setInterval(() => {
      if (!awake() || figForced) return;
      const d = torchState.lit ? Math.hypot(torchState.x - room.x, torchState.y + scrollY - room.y) : 1e9;
      const r = torchState.r || 200;
      if (!figLit && d < r * 0.6) {
        // The light is on the room. Whatever was about to change, does not.
        figLit = true;
        window.clearTimeout(figTimer);
        figTimer = 0;
      } else if (figLit && d > r * 1.2) {
        // The light has left. A moment later the room is different.
        figLit = false;
        figTimer = window.setTimeout(() => {
          figTimer = 0;
          if (figLit || figForced) return;
          figIndex = (figIndex + 1) % FIGURE_CYCLE.length;
          setFigure(FIGURE_CYCLE[figIndex]);
        }, 650);
      }
    }, 120);
  }
  hooks.figure = {
    get state() {
      return figState;
    },
    get lit() {
      return figLit;
    },
    set(s) {
      figForced = true;
      window.clearTimeout(figTimer);
      setFigure(s);
    },
  };

  // --- lightning -----------------------------------------------------------------------
  // One soft flash, rarely: the first not before 12 s, then every 40 to 90 s.
  let strikeStart = -1e9;
  let strikes = 0;
  let stormHeld = false;
  let strikeTimer = 0;
  const strike = () => {
    strikes++;
    strikeStart = performance.now();
    hero.classList.remove('is-strike');
    void hero.offsetWidth; // restart the animation (not in a frame loop)
    hero.classList.add('is-strike');
    window.setTimeout(() => hero.classList.remove('is-strike'), STRIKE_MS + 80);
    kick();
  };
  const schedule = (ms: number) => {
    window.clearTimeout(strikeTimer);
    strikeTimer = window.setTimeout(() => {
      if (!awake()) return schedule(4000);
      strike();
      schedule(rnd(40000, 90000));
    }, ms);
  };
  schedule(rnd(12000, 17000));
  hooks.storm = {
    get count() {
      return strikes;
    },
    get active() {
      return stormHeld || performance.now() - strikeStart < STRIKE_MS;
    },
    strike,
    hold(on) {
      stormHeld = on;
      window.clearTimeout(strikeTimer);
      hero.classList.toggle('is-storm-hold', on);
      kick();
    },
  };

  // --- rain ----------------------------------------------------------------------------
  // Thin slanted streaks. A streak is drawn only where something lights it: the visitor's
  // beam, the red of the sign, the lit room, or lightning (which shows all of it).
  const SLANT = 0.2;
  let last = 0;
  let running = false;
  // About 30 frames a second, on the shared hero clock: plenty for streaks.
  function kick() {
    if (ctx) ticker.add(frame);
  }
  function frame(now: number) {
    if (!ctx || !canvas) return ticker.remove(frame);
    if (!awake()) {
      running = false;
      last = 0;
      return ticker.remove(frame);
    }
    running = true;
    const dt = Math.min(0.08, last ? (now - last) / 1000 : 0.033);
    last = now;

    const flash = stormHeld ? 1 : strikeLevel((now - strikeStart) / STRIKE_MS);
    const bx = torchState.x;
    const by = torchState.y + scrollY - heroTop;
    const br = torchState.r || 200;
    const sx = sign.x;
    const sy = sign.y - heroTop;
    const rx = room.x;
    const ry = room.y - heroTop;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = 'round';
    for (const d of drops) {
      const speed = 620 + 760 * d.z;
      d.y += speed * dt;
      d.x += speed * dt * SLANT;
      if (d.y > ch + 40) {
        d.y = -40;
        d.x = rnd(-SLANT * ch, cw);
        d.z = Math.random();
      }
      // Light on this streak.
      const beam = torchState.lit ? 1 - smooth(0.3, 1.35, Math.hypot(d.x - bx, d.y - by) / br) : 0;
      const red = 1 - smooth(0.15, 1, Math.hypot((d.x - sx) / (300 * unit), (d.y - sy) / (150 * unit)));
      const warm = 1 - smooth(0.2, 1, Math.hypot(d.x - rx, d.y - ry) / (80 * unit));
      const cool = beam * 0.8 + flash * 0.9;
      const a = (cool + red * 0.5 + warm * 0.4) * (0.22 + 0.5 * d.z);
      if (a < 0.02) continue;
      const total = cool + red * 0.5 + warm * 0.4;
      const r = (cool * 205 + red * 0.5 * 255 + warm * 0.4 * 240) / total;
      const g = (cool * 214 + red * 0.5 * 80 + warm * 0.4 * 200) / total;
      const b = (cool * 232 + red * 0.5 * 70 + warm * 0.4 * 130) / total;
      const len = 9 + 20 * d.z;
      ctx.strokeStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${Math.min(0.85, a).toFixed(3)})`;
      ctx.lineWidth = 0.7 + 0.5 * d.z;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - len * SLANT, d.y - len);
      ctx.stroke();
    }
  }
  hooks.rain = {
    get running() {
      return running;
    },
    get drops() {
      return drops.length;
    },
  };
  kick();
}
