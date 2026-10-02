// The loose E of the HOTEL sign: an electrical fault, not a switch.
//
// The letter is four tube sections (spine, top, middle and bottom bar), each on its own
// small layers (a red body and a hot core). Every frame each section gets a brightness from a continuous signal:
//   layered noise (mains hum, slow sag)  x  a supply envelope  x  the section's own health.
// The envelope moves through four modes: `run` (lit, with brown-outs and arcs), `dying`
// (a stuttering collapse), `ember` (1 to 3 s of a dim, breathing glow, never black) and
// `recover` (an uneven restrike). Arcs are short bursts at the torn feed cable with a few
// sparks, drawn on a small canvas.
//
// Photosensitivity. The fast flicker lives only in the letter and its tight halo: about
// 110 x 110 facade units, under 1% of a phone screen and far less on a desktop. That is
// well below the area at which flashing counts (WCAG 2.3.1: a quarter of any 10 degree
// field, roughly 341 x 256 px). Everything large that the letter lights (the WebGL fog and
// through it the haze over the top floors; the CSS halo and the red wash are static) follows
// `neonState.level`, which is the mean brightness through a first-order low-pass with a
// 0.6 s time constant. At 3 Hz that filter passes under 9% of a swing, and the fog takes
// only 18% of its light from this letter, so no large area can change by more than about
// 2% at 3 Hz or faster. A general flash needs a 10% swing. The slow part that remains (the
// letter dying and coming back) happens a few times a minute.
import { still } from './env';
import { hooks, ticker } from './hero-hooks';
import { signBuzz } from './audio';

// Smooth 1D value noise.
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (t: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
};
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// The large soft lights follow this value only (see the note above). fog.ts reads it.
export const neonState = { level: 0.62 };

const LOWPASS_S = 0.6;
const EMBER = 0.085;

type Mode = 'run' | 'dying' | 'ember' | 'recover';
type Pose = 'normal' | 'arc' | 'ember' | null;

// Per section: mean brightness when healthy, how much it wanders, how fast, how soon it
// gives up when the supply sags (power > 1 dies first), and its weight in the mean.
const SEGS = [
  { id: 'spine', mean: 0.9, wander: 0.1, speed: 1.9, power: 0.62, weight: 0.38 },
  { id: 'top', mean: 0.74, wander: 0.2, speed: 3.3, power: 1.0, weight: 0.24 },
  { id: 'mid', mean: 0.62, wander: 0.3, speed: 2.6, power: 1.7, weight: 0.14 },
  { id: 'bot', mean: 0.6, wander: 0.24, speed: 4.1, power: 1.25, weight: 0.24 },
];
const POSES: Record<Exclude<Pose, null>, number[]> = {
  normal: [0.93, 0.74, 0.24, 0.52],
  arc: [0.6, 0.42, 0.14, 1],
  ember: [0.2, 0.07, 0.05, 0.09],
};

// Spark canvas geometry, in facade units relative to the canvas box (Hero.astro, SPARK).
const SPARK_W = 112;
const SPARK_H = 150;
const CABLE = { x: 56, y: 36 }; // frayed end of the feed cable
const ELECTRODE = { x: 45, y: 49 }; // end of the bottom bar, where the feed used to sit

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

export function initNeon() {
  const el = document.querySelector<HTMLElement>('[data-dying]');
  const segEls = SEGS.map((s) => document.querySelector<SVGElement>(`[data-seg="${s.id}"]`));
  const coreEls = SEGS.map((s) => document.querySelector<SVGElement>(`[data-core="${s.id}"]`));
  if (!el || segEls.some((s) => !s) || coreEls.some((s) => !s) || still) return;
  const canvas = document.querySelector<HTMLCanvasElement>('[data-sparks]');
  const ctx = canvas?.getContext('2d') ?? null;

  let mode: Mode = 'run';
  let modeStart = performance.now();
  let modeDur = rnd(7000, 13000);
  let ember = EMBER;
  let nextArc = modeStart + rnd(1400, 3200);
  let arcStart = -1;
  let arcDur = 0;
  let dipStart = -1;
  let dipDur = 0;
  let dipDepth = 0;
  let nextDip = modeStart + rnd(2500, 6000);
  let level = neonState.level;
  let slow = neonState.level;
  const segs = SEGS.map((_, i) => POSES.normal[i]);
  const shown = segs.map(() => -1);
  let pose: Pose = null;
  let visible = true;
  let last = 0;
  let lastBuzz = 0;
  const seed = Math.random() * 100;
  const parts: Particle[] = [];
  let canvasDirty = false;

  const setMode = (m: Mode, now: number) => {
    mode = m;
    modeStart = now;
    if (m === 'run') modeDur = rnd(14000, 34000);
    else if (m === 'dying') modeDur = rnd(550, 1100);
    else if (m === 'ember') {
      modeDur = rnd(1000, 3000);
      ember = rnd(0.07, 0.11);
    } else modeDur = rnd(900, 1700);
  };
  const startArc = (now: number, dur = rnd(90, 280)) => {
    arcStart = now;
    arcDur = dur;
    const n = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) spawn();
  };
  const spawn = () => {
    if (parts.length > 24) return;
    const a = rnd(-2.6, -0.2);
    const v = rnd(40, 150);
    const max = rnd(0.28, 0.75);
    parts.push({ x: rnd(ELECTRODE.x, CABLE.x), y: rnd(CABLE.y, ELECTRODE.y), vx: Math.cos(a) * v * 0.7 + 14, vy: Math.sin(a) * v * 0.6, life: max, max });
  };

  // Canvas buffer: sized once per resize, never per frame.
  let scale = 1;
  const sizeCanvas = () => {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    scale = canvas.width / SPARK_W;
    canvasDirty = true;
  };
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas, { passive: true });

  const drawArc = (strength: number, frozen: boolean) => {
    if (!ctx) return;
    const jitter = (i: number) => (frozen ? [0, 2.6, -2.2, 1.8, -1.2][i % 5] : rnd(-3, 3));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // tight halo around the gap
    const mx = (CABLE.x + ELECTRODE.x) / 2;
    const my = (CABLE.y + ELECTRODE.y) / 2;
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 17);
    g.addColorStop(0, `rgba(190, 215, 255, ${0.55 * strength})`);
    g.addColorStop(1, 'rgba(120, 160, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(mx - 17, my - 17, 34, 34);
    for (const [w, c] of [
      [2.6, `rgba(120, 170, 255, ${0.5 * strength})`],
      [1, `rgba(245, 250, 255, ${0.95 * strength})`],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(CABLE.x, CABLE.y);
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        ctx.lineTo(CABLE.x + (ELECTRODE.x - CABLE.x) * t + jitter(i), CABLE.y + (ELECTRODE.y - CABLE.y) * t + jitter(i + 2));
      }
      ctx.lineTo(ELECTRODE.x, ELECTRODE.y);
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c;
      ctx.stroke();
    }
    ctx.restore();
  };
  const drawParts = () => {
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of parts) {
      const a = clamp01(p.life / p.max);
      ctx.strokeStyle = `rgba(255, ${Math.round(150 + 90 * a)}, ${Math.round(70 + 150 * a * a)}, ${0.25 + 0.75 * a})`;
      ctx.lineWidth = 0.9 + 0.7 * a;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
      ctx.stroke();
    }
    ctx.restore();
  };
  const clear = () => {
    if (!ctx || !canvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  };

  const apply = () => {
    for (let i = 0; i < segs.length; i++) {
      if (Math.abs(segs[i] - shown[i]) > 0.004) {
        shown[i] = segs[i];
        // Red body and hot core fade apart, so a starved tube goes deep red before it goes out.
        segEls[i]!.style.opacity = Math.pow(segs[i], 0.6).toFixed(3);
        coreEls[i]!.style.opacity = Math.pow(segs[i], 1.8).toFixed(3);
      }
    }
  };

  const hero = document.getElementById('lobby');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver((e) => {
      visible = e[0].isIntersecting;
      if (visible) kick();
    }).observe(hero);
  }

  // About 30 updates a second, on the shared hero clock: plenty for a flicker.
  const kick = () => ticker.add(frame);
  const park = () => ticker.remove(frame);

  function frame(now: number) {
    if (!visible || document.hidden) {
      last = 0;
      signBuzz(0, false);
      return park();
    }
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.033);
    last = now;
    const t = now / 1000 + seed;

    if (pose) {
      // Frozen for a screenshot: fixed levels, a still arc.
      for (let i = 0; i < segs.length; i++) segs[i] = POSES[pose][i];
      level = segs.reduce((a, v, i) => a + v * SEGS[i].weight, 0);
      slow = level;
      neonState.level = slow;
      apply();
      clear();
      if (pose === 'arc') {
        drawArc(1, true);
        if (ctx) {
          parts.length = 0;
          for (const [x, y, vx, vy] of [
            [50, 60, 40, 170],
            [62, 76, 70, 190],
            [44, 92, -20, 210],
            [58, 30, 60, -120],
            [70, 52, 150, 40],
            [41, 70, -50, 150],
          ])
            parts.push({ x, y, vx, vy, life: 0.4, max: 0.5 });
          drawParts();
          parts.length = 0;
        }
      }
      return park(); // stays frozen until hold(null)
    }

    // 1. Supply envelope.
    const p = clamp01((now - modeStart) / modeDur);
    let env = 1;
    if (mode === 'run') {
      if (now >= nextDip && dipStart < 0) {
        dipStart = now;
        dipDur = rnd(320, 950);
        dipDepth = rnd(0.25, 0.6);
      }
      if (dipStart >= 0) {
        const q = (now - dipStart) / dipDur;
        if (q >= 1) {
          dipStart = -1;
          nextDip = now + rnd(2200, 7000);
        } else env = 1 - dipDepth * Math.sin(Math.PI * q) ** 2;
      }
      if (now >= nextArc && arcStart < 0) {
        startArc(now);
        nextArc = now + rnd(2200, 7000);
      }
      if (p >= 1) {
        setMode('dying', now);
        startArc(now, rnd(160, 300));
      }
    } else if (mode === 'dying') {
      // Falls in uneven steps: the noise gate lets it catch for a moment on the way down.
      const fall = (1 - p) ** 2;
      const gate = 0.55 + 0.45 * smooth(0.3, 0.7, noise(t * 13));
      env = ember + (1 - ember) * fall * gate;
      if (p >= 1) setMode('ember', now);
    } else if (mode === 'ember') {
      env = ember * (0.75 + 0.6 * noise(t * 1.4));
      if (p >= 1) {
        setMode('recover', now);
        startArc(now, rnd(120, 260));
      }
    } else {
      // Restrike: the level climbs, but drops out again and again, less and less.
      const rise = p * p;
      const drop = (1 - p) * 0.85 * smooth(0.42, 0.62, noise(t * 9.5));
      env = Math.max(ember, (ember + (1 - ember) * rise) * (1 - drop));
      if (p > 0.35 && p < 0.42 && arcStart < 0 && Math.random() < 0.2) startArc(now, rnd(70, 140));
      if (p >= 1) {
        setMode('run', now);
        nextArc = now + rnd(1500, 4500);
        nextDip = now + rnd(1500, 5000);
      }
    }

    // 2. Arc: the bottom bar flares, the rest of the letter sags while the current is stolen.
    let arc = 0;
    if (arcStart >= 0) {
      const q = (now - arcStart) / arcDur;
      if (q >= 1) arcStart = -1;
      else {
        arc = rnd(0.55, 1);
        if (Math.random() < 0.5) spawn();
      }
    }

    // 3. Sections.
    let mean = 0;
    for (let i = 0; i < SEGS.length; i++) {
      const s = SEGS[i];
      const wander = noise(t * s.speed + i * 17.3) * 0.65 + noise(t * s.speed * 3.7 + i * 5.1) * 0.35;
      let v = (s.mean - s.wander + 2 * s.wander * wander) * Math.pow(env, s.power);
      // The middle bar gutters on its own: it is the section that is really going.
      if (s.id === 'mid') v *= 0.22 + 0.78 * smooth(0.38, 0.66, noise(t * 2.1 + 40));
      // Mains hum: a small, fast shimmer inside the tube.
      v *= 0.95 + 0.05 * Math.random();
      if (arc > 0) v = s.id === 'bot' ? Math.max(v, 0.72 + 0.28 * arc) : v * (1 - 0.38 * arc);
      // Never black: the gas keeps a trace of glow.
      v = Math.max(0.035, clamp01(v));
      segs[i] = v;
      mean += v * s.weight;
    }
    level = mean;
    slow += (level - slow) * (1 - Math.exp(-dt / LOWPASS_S));
    neonState.level = slow;
    apply();

    // 4. Sparks and the arc itself. The canvas is only touched while something is alive.
    const active = arc > 0 || parts.length > 0;
    if (ctx && (active || canvasDirty)) {
      clear();
      canvasDirty = active; // one more pass after the last spark, to wipe its frame
      if (arc > 0) drawArc(arc, false);
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.life -= dt;
        if (q.life <= 0 || q.y > SPARK_H) {
          parts.splice(i, 1);
          continue;
        }
        q.vy += 520 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
      drawParts();
    }

    // 5. Sound, if the visitor switched it on. A few times a second is enough.
    if (now - lastBuzz > 90) {
      lastBuzz = now;
      signBuzz(level, arc > 0);
    }
  }

  hooks.e = {
    get mode() {
      return pose ? `hold:${pose}` : arcStart >= 0 ? `${mode}+arc` : mode;
    },
    get level() {
      return level;
    },
    get slow() {
      return slow;
    },
    get segs() {
      return segs.slice();
    },
    force(what) {
      const now = performance.now();
      if (what === 'arc') startArc(now, 260);
      else if (what === 'dying') {
        setMode('dying', now);
        startArc(now, 220);
      } else setMode('run', now);
    },
    hold(next) {
      pose = next;
      parts.length = 0;
      arcStart = -1;
      canvasDirty = true;
      last = 0;
      kick();
    },
  };

  kick();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
    else signBuzz(0, false);
  });
}
