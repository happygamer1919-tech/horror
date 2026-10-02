// The corridor. A one-point-perspective hotel corridor drawn on a 2D canvas and driven by
// scroll progress: you walk forward, the ceiling lamps fail one after another from the far
// end towards you, and only the lamp over the last door stays on.
//
// Once per browser session a child's silhouette stands in the corridor for about 400ms.
// Safety: lamps only fade out (or back in when scrolling up), nothing strobes.
import { ScrollTrigger } from './scroll';
import { still, once } from './env';

type RGB = [number, number, number];

const W = 1.5; // half width
const H = 2.7; // ceiling height
const EYE = 1.42;
const END = 42; // z of the end wall
const TRAVEL = 39.9; // how far the camera walks
const DZ = 0.5; // shading slice depth
const AMBIENT = 0.075;

const LAMPS = Array.from({ length: 10 }, (_, k) => 2.5 + 4 * k);
const LAST = LAMPS.length - 1;
// Lamp k dies at this progress. Far lamps first, the wave reaches the walker near the middle.
const failAt = (k: number) => 0.1 + (LAST - 1 - k) * 0.072;

interface Door {
  z: number;
  side: -1 | 1;
  no: number;
  ajar?: boolean;
}
const DOORS: Door[] = [];
for (let i = 0; i < 6; i++) {
  DOORS.push({ z: 3 + 6.4 * i, side: -1, no: 301 + i * 2 });
  DOORS.push({ z: 6.2 + 6.4 * i, side: 1, no: 302 + i * 2, ajar: i === 3 });
}
const LAST_ROOM = 313;

const C = {
  wallA: [98, 70, 53] as RGB,
  wallB: [88, 62, 47] as RGB,
  wainscot: [54, 37, 28] as RGB,
  rail: [128, 99, 56] as RGB,
  floor: [38, 27, 21] as RGB,
  carpet: [124, 27, 23] as RGB,
  carpetEdge: [150, 118, 64] as RGB,
  motif: [82, 15, 14] as RGB,
  ceiling: [56, 46, 40] as RGB,
  frame: [34, 23, 17] as RGB,
  leaf: [70, 44, 30] as RGB,
  brass: [196, 160, 92] as RGB,
};

const SIL_AT = 0.62;
const SIL_Z = 35.2;
const SIL_MS = 400;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const shade = (c: RGB, l: number) => {
  const k = clamp(l, 0, 1.15);
  return `rgb(${(c[0] * k) | 0},${(c[1] * k * 0.96) | 0},${(c[2] * k * 0.9) | 0})`;
};

export function initCorridor() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-corridor]');
  const section = document.getElementById('corridor');
  if (!canvas || !section) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const caps = Array.from(section.querySelectorAll<HTMLElement>('[data-cap]'));

  let w = 0;
  let h = 0;
  let f = 1;
  let cx = 0;
  let cy = 0;
  let cam = 0;
  let bobY = 0;
  let swayX = 0;

  const lamp = LAMPS.map(() => 1); // current intensity per lamp
  let progress = still ? 0.06 : 0;
  let drawnP = -1;
  let silStart = 0;
  let silDone = false;
  let lastT = 0;
  let inView = false;
  let raf = 0;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = Math.round(r.width * dpr);
    h = Math.round(r.height * dpr);
    canvas.width = w;
    canvas.height = h;
    f = Math.min(w * 0.95, h * 0.78);
    cx = w / 2;
    cy = h * 0.5;
    drawnP = -1;
    kick();
  };

  const px = (x: number, z: number) => cx + (f * (x - swayX)) / Math.max(z - cam, 0.08);
  const py = (y: number, z: number) => cy - (f * (y - EYE - bobY)) / Math.max(z - cam, 0.08);

  const light = (z: number) => {
    let l = AMBIENT;
    for (let k = 0; k < LAMPS.length; k++) {
      const i = lamp[k];
      if (i < 0.01) continue;
      const reach = k === LAST ? 3.4 : 1.9;
      const d = (z - LAMPS[k]) / reach;
      l += (i * (k === LAST ? 1.25 : 1)) / (1 + d * d);
    }
    return l;
  };

  // A quad on a side wall: x fixed, spans z0..z1 and y0..y1.
  const wallQuad = (x: number, z0: number, z1: number, y0: number, y1: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(px(x, z0), py(y0, z0));
    ctx.lineTo(px(x, z0), py(y1, z0));
    ctx.lineTo(px(x, z1), py(y1, z1));
    ctx.lineTo(px(x, z1), py(y0, z1));
    ctx.fill();
  };
  // A quad on the floor or ceiling: y fixed, spans x0..x1 and z0..z1.
  const flatQuad = (y: number, x0: number, x1: number, z0: number, z1: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(px(x0, z0), py(y, z0));
    ctx.lineTo(px(x1, z0), py(y, z0));
    ctx.lineTo(px(x1, z1), py(y, z1));
    ctx.lineTo(px(x0, z1), py(y, z1));
    ctx.fill();
  };

  const drawEnd = () => {
    const z = END;
    const l = light(z - 0.4);
    ctx.fillStyle = shade(C.wallA, l);
    ctx.fillRect(px(-W, z), py(H, z), px(W, z) - px(-W, z), py(0, z) - py(H, z));
    ctx.fillStyle = shade(C.wainscot, l);
    ctx.fillRect(px(-W, z), py(0.9, z), px(W, z) - px(-W, z), py(0, z) - py(0.9, z));
    // the last door
    ctx.fillStyle = shade(C.frame, l);
    ctx.fillRect(px(-0.62, z), py(2.18, z), px(0.62, z) - px(-0.62, z), py(0, z) - py(2.18, z));
    ctx.fillStyle = shade(C.leaf, l);
    ctx.fillRect(px(-0.52, z), py(2.08, z), px(0.52, z) - px(-0.52, z), py(0, z) - py(2.08, z));
    ctx.strokeStyle = shade(C.frame, l);
    ctx.lineWidth = Math.max(1, (f * 0.015) / (z - cam));
    ctx.strokeRect(px(-0.36, z), py(1.92, z), px(0.36, z) - px(-0.36, z), py(1.1, z) - py(1.92, z));
    ctx.strokeRect(px(-0.36, z), py(0.94, z), px(0.36, z) - px(-0.36, z), py(0.16, z) - py(0.94, z));
    // plate
    const pw = px(0.17, z) - px(-0.17, z);
    const ph = py(1.56, z) - py(1.72, z);
    ctx.fillStyle = shade(C.brass, Math.max(l, 0.3));
    ctx.fillRect(px(-0.17, z), py(1.72, z), pw, ph);
    if (ph > 5) {
      ctx.fillStyle = '#1a120a';
      ctx.font = `700 ${ph * 0.78}px "Playfair Display Variable", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(LAST_ROOM), px(0, z), py(1.64, z) + ph * 0.04);
    }
    // knob
    ctx.fillStyle = shade(C.brass, Math.max(l, 0.2));
    ctx.beginPath();
    ctx.arc(px(0.42, z), py(1.02, z), Math.max(1, (f * 0.035) / (z - cam)), 0, Math.PI * 2);
    ctx.fill();
  };

  const drawDoor = (d: Door) => {
    const near = cam + 0.12;
    const b = d.z + 1.0;
    if (b + 0.07 <= near) return;
    const x = d.side * (W - 0.004);
    const l = light(d.z + 0.5);
    const a0 = Math.max(d.z - 0.07, near);
    const a = Math.max(d.z, near);
    wallQuad(x, a0, b + 0.07, 0, 2.17, shade(C.frame, l));
    if (d.ajar) {
      // left open a hand's width: nothing but dark behind it
      const gap = Math.max(d.z + 0.16, near);
      wallQuad(x, a, gap, 0, 2.08, '#010101');
      wallQuad(x, gap, b, 0, 2.08, shade(C.leaf, l * 0.8));
    } else {
      wallQuad(x, a, b, 0, 2.08, shade(C.leaf, l));
    }
    if (d.z < near) return;
    // panels
    ctx.strokeStyle = shade(C.frame, l);
    ctx.lineWidth = clamp((f * 0.012) / (d.z + 0.5 - cam), 1, 6);
    for (const [y0, y1] of [
      [0.16, 0.94],
      [1.1, 1.92],
    ]) {
      ctx.beginPath();
      ctx.moveTo(px(x, d.z + 0.16), py(y0, d.z + 0.16));
      ctx.lineTo(px(x, d.z + 0.16), py(y1, d.z + 0.16));
      ctx.lineTo(px(x, b - 0.16), py(y1, b - 0.16));
      ctx.lineTo(px(x, b - 0.16), py(y0, b - 0.16));
      ctx.closePath();
      ctx.stroke();
    }
    // knob
    ctx.fillStyle = shade(C.brass, Math.max(l, 0.18));
    ctx.beginPath();
    ctx.arc(px(x, b - 0.12), py(1.02, b - 0.12), clamp((f * 0.035) / (b - 0.12 - cam), 1, 40), 0, Math.PI * 2);
    ctx.fill();

    // Number plate, mounted on the wall on the far side of the door (visible while approaching).
    const p0 = b + 0.16;
    const p1 = b + 0.5;
    const top = 1.74;
    const bot = 1.56;
    wallQuad(x, p0, p1, bot, top, shade(C.brass, Math.max(l, 0.24)));
    // Text: an affine fit of the plate. Near edge is on the outside of the screen.
    const nearX = px(x, p0);
    const farX = px(x, p1);
    const nearTop = py(top, p0);
    const farTop = py(top, p1);
    const nearBot = py(bot, p0);
    const hpx = nearBot - nearTop;
    if (hpx < 7) return;
    const leftIsNear = d.side < 0;
    const ox = leftIsNear ? nearX : farX;
    const oy = leftIsNear ? nearTop : farTop;
    const ux = (leftIsNear ? farX - nearX : nearX - farX) / 100;
    const uy = (leftIsNear ? farTop - nearTop : nearTop - farTop) / 100;
    const vh = (leftIsNear ? hpx : py(bot, p1) - farTop) / 50;
    ctx.save();
    ctx.transform(ux, uy, 0, vh, ox, oy);
    ctx.fillStyle = '#1a120a';
    ctx.font = '700 38px "Playfair Display Variable", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(d.no), 50, 27);
    ctx.restore();
  };

  const drawLamp = (k: number) => {
    const z = LAMPS[k];
    const d = z - cam;
    if (d < 0.25) return;
    const x = px(0, z);
    const y = py(H - 0.03, z);
    const rx = (f * 0.2) / d;
    const ry = rx * clamp((H - EYE) / d, 0.1, 0.8);
    const i = lamp[k];
    if (i > 0.02) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx * 5);
      g.addColorStop(0, `rgba(255,214,140,${0.5 * i})`);
      g.addColorStop(0.3, `rgba(255,190,110,${0.14 * i})`);
      g.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rx * 5, y - rx * 5, rx * 10, rx * 10);
    }
    ctx.fillStyle = i > 0.02 ? `rgb(${(70 + 185 * i) | 0},${(60 + 166 * i) | 0},${(48 + 122 * i) | 0})` : '#2a2420';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1512';
    ctx.lineWidth = Math.max(1, rx * 0.08);
    ctx.stroke();
  };

  // Small, still, backlit by the last lamp. No face, no detail.
  const drawSilhouette = () => {
    const z = SIL_Z;
    // Already walked past where it stood: nothing to draw.
    if (z - cam < 0.6) return;
    const s = f / (z - cam);
    const bx = px(0.12, z);
    const by = py(0, z);
    ctx.fillStyle = '#020202';
    // legs
    ctx.fillRect(bx - 0.07 * s, by - 0.42 * s, 0.045 * s, 0.42 * s);
    ctx.fillRect(bx + 0.025 * s, by - 0.42 * s, 0.045 * s, 0.42 * s);
    // dress
    ctx.beginPath();
    ctx.moveTo(bx - 0.19 * s, by - 0.38 * s);
    ctx.lineTo(bx + 0.19 * s, by - 0.38 * s);
    ctx.lineTo(bx + 0.1 * s, by - 0.93 * s);
    ctx.lineTo(bx - 0.1 * s, by - 0.93 * s);
    ctx.fill();
    // arms, hanging
    ctx.fillRect(bx - 0.15 * s, by - 0.92 * s, 0.045 * s, 0.4 * s);
    ctx.fillRect(bx + 0.105 * s, by - 0.92 * s, 0.045 * s, 0.4 * s);
    // head and hair
    ctx.beginPath();
    ctx.arc(bx, by - 1.05 * s, 0.105 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(bx - 0.105 * s, by - 1.05 * s, 0.21 * s, 0.17 * s);
  };

  const draw = (now: number) => {
    const p = progress;
    cam = (still ? p : p * p * (3 - 2 * p) * 0.35 + p * 0.65) * TRAVEL;
    bobY = still ? 0 : Math.sin(cam * 2.3) * 0.016;
    swayX = still ? 0 : Math.sin(cam * 1.15) * 0.014;

    ctx.fillStyle = '#040303';
    ctx.fillRect(0, 0, w, h);

    drawEnd();

    const near = cam + 0.12;
    const first = Math.floor(near / DZ);
    const last = Math.ceil(END / DZ) - 1;
    for (let i = last; i >= first; i--) {
      const z0 = Math.max(i * DZ, near);
      const z1 = (i + 1) * DZ + 0.03;
      const l = light(i * DZ + DZ / 2);
      const stripe = i % 2 === 0;
      flatQuad(H, -W, W, z0, z1, shade(C.ceiling, l));
      flatQuad(0, -W, W, z0, z1, shade(C.floor, l));
      flatQuad(0, -0.86, 0.86, z0, z1, shade(C.carpetEdge, l * 0.8));
      flatQuad(0, -0.78, 0.78, z0, z1, shade(C.carpet, l));
      for (const sx of [-W, W]) {
        wallQuad(sx, z0, z1, 0.94, H, shade(stripe ? C.wallA : C.wallB, l));
        wallQuad(sx, z0, z1, 0, 0.9, shade(C.wainscot, l));
        wallQuad(sx, z0, z1, 0.9, 0.95, shade(C.rail, l * 0.85));
      }
      // carpet motif: one diamond per metre
      if (i % 2 === 0 && i * DZ >= near) {
        const z = i * DZ;
        ctx.fillStyle = shade(C.motif, light(z + 0.5));
        ctx.beginPath();
        ctx.moveTo(px(0, z + 0.14), py(0, z + 0.14));
        ctx.lineTo(px(0.4, z + 0.5), py(0, z + 0.5));
        ctx.lineTo(px(0, z + 0.86), py(0, z + 0.86));
        ctx.lineTo(px(-0.4, z + 0.5), py(0, z + 0.5));
        ctx.fill();
      }
    }

    for (let i = DOORS.length - 1; i >= 0; i--) drawDoor(DOORS[i]);
    for (let k = LAST; k >= 0; k--) drawLamp(k);

    if (silStart && now - silStart < SIL_MS) drawSilhouette();
    drawnP = p;
  };

  const setCaps = (p: number) => {
    const n = caps.length;
    for (let i = 0; i < n; i++) {
      const a = 0.03 + (i * 0.96) / n;
      const b = a + 0.96 / n - 0.05;
      const o = i === n - 1 ? smooth(a, a + 0.05, p) : smooth(a, a + 0.05, p) * (1 - smooth(b - 0.05, b, p));
      caps[i].style.opacity = o.toFixed(3);
      caps[i].style.transform = `translate3d(0, ${((1 - o) * 14).toFixed(1)}px, 0)`;
    }
  };

  function frame(now: number) {
    raf = 0;
    if (!inView || document.hidden) return;
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016);
    lastT = now;

    // lamps ease towards on/off; about 180ms for a full fade
    let moving = false;
    for (let k = 0; k < LAMPS.length; k++) {
      const target = k === LAST || progress < failAt(k) ? 1 : 0;
      if (Math.abs(lamp[k] - target) > 0.004) {
        lamp[k] += clamp(target - lamp[k], -dt * 5.5, dt * 5.5);
        moving = true;
      } else lamp[k] = target;
    }

    if (!silDone && progress >= SIL_AT && progress < SIL_AT + 0.12) {
      silDone = true;
      if (once('hotel:child')) silStart = now;
    }
    const silActive = silStart > 0 && now - silStart < SIL_MS + 40;

    if (moving || silActive || Math.abs(progress - drawnP) > 0.00015) {
      draw(now);
      setCaps(progress);
    }
    kick();
  }
  function kick() {
    if (!raf && !still) raf = requestAnimationFrame(frame);
  }

  if (still) {
    // Static, fully lit frame. No pin, no walking.
    const ro = new ResizeObserver(() => {
      resize();
      draw(0);
    });
    ro.observe(canvas);
    document.fonts?.ready.then(() => draw(0));
    return;
  }

  new ResizeObserver(resize).observe(canvas);
  document.fonts?.ready.then(() => {
    drawnP = -1;
    kick();
  });

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      progress = self.progress;
      kick();
    },
    onToggle: () => kick(),
  });

  new IntersectionObserver(
    (e) => {
      inView = e[0].isIntersecting;
      if (inView) kick();
    },
    { rootMargin: '20% 0px' },
  ).observe(section);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });
}
