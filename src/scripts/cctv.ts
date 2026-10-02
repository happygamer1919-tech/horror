// CCTV strip: four fake camera feeds. Each scene is drawn once at 160 x 120 and replayed
// at 8 frames per second with noise and a slow rolling bar. Feed 2 (the corridor) shows one
// brief movement, once per page view.
import { still } from './env';

const W = 160;
const H = 120;
type Ctx = CanvasRenderingContext2D;

const line = (c: Ctx, pts: number[], width = 1) => {
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.stroke();
};

const scenes: ((c: Ctx) => void)[] = [
  // 0: lobby, seen from above the door. Desk, key board, floor tiles.
  (c) => {
    c.fillStyle = '#1b1b1a';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#262624';
    c.fillRect(0, 0, W, 62);
    c.strokeStyle = '#3a3a37';
    for (let i = -4; i <= 12; i++) line(c, [80 + (i - 4) * 9, 62, (i - 4) * 46 + 80, H]);
    for (const y of [70, 82, 98]) line(c, [0, y, W, y]);
    c.fillStyle = '#34342f';
    c.fillRect(52, 20, 60, 30);
    c.fillStyle = '#8a8a7c';
    for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) c.fillRect(58 + k * 8, 25 + r * 8, 2, 4);
    c.fillStyle = '#0e0e0d';
    c.fillRect(34, 54, 96, 22);
    c.fillStyle = '#4a4a44';
    c.fillRect(34, 52, 96, 3);
    c.fillStyle = '#b5b5a2';
    c.fillRect(120, 46, 3, 6);
    c.fillStyle = '#55554d';
    c.fillRect(116, 44, 11, 3);
  },
  // 1: floor 3 corridor from the ceiling corner.
  (c) => {
    c.fillStyle = '#161615';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#242422';
    c.beginPath();
    c.moveTo(0, H);
    c.lineTo(66, 52);
    c.lineTo(96, 52);
    c.lineTo(W, H);
    c.fill();
    c.fillStyle = '#2e2e2b';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(66, 28);
    c.lineTo(66, 52);
    c.lineTo(0, H);
    c.fill();
    c.beginPath();
    c.moveTo(W, 0);
    c.lineTo(96, 28);
    c.lineTo(96, 52);
    c.lineTo(W, H);
    c.fill();
    c.fillStyle = '#3d3d38';
    c.fillRect(66, 28, 30, 24);
    c.fillStyle = '#0c0c0b';
    c.fillRect(75, 33, 12, 19);
    c.fillStyle = '#121211';
    for (const [x, y, w, h] of [
      [10, 34, 16, 62],
      [40, 34, 9, 36],
      [134, 34, 16, 62],
      [111, 34, 9, 36],
    ]) {
      c.fillRect(x, y, w, h);
    }
    c.fillStyle = '#6a6a5e';
    c.fillRect(78, 22, 6, 2);
  },
  // 2: stairwell.
  (c) => {
    c.fillStyle = '#1a1a19';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#272725';
    c.fillRect(0, 0, 70, H);
    c.strokeStyle = '#48483f';
    for (let i = 0; i < 9; i++) {
      const x = 62 + i * 11;
      const y = 104 - i * 10;
      c.fillStyle = i % 2 ? '#2f2f2c' : '#383834';
      c.fillRect(x, y, 100, 10);
      line(c, [x, y, W, y]);
    }
    c.strokeStyle = '#6e6e62';
    line(c, [56, 96, 150, 10], 2);
    for (let i = 0; i < 8; i++) line(c, [64 + i * 11, 90 - i * 10, 64 + i * 11, 104 - i * 10]);
    c.fillStyle = '#0d0d0c';
    c.fillRect(14, 40, 26, 64);
  },
  // 3: basement. Pipes, a door, one hanging bulb.
  (c) => {
    c.fillStyle = '#141413';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#20201e';
    c.fillRect(0, 84, W, 36);
    c.strokeStyle = '#3c3c37';
    line(c, [0, 14, W, 14], 4);
    line(c, [0, 24, W, 24], 2);
    line(c, [118, 0, 118, 84], 3);
    c.fillStyle = '#0a0a09';
    c.fillRect(34, 36, 24, 48);
    c.strokeStyle = '#33332f';
    c.strokeRect(34.5, 36.5, 24, 48);
    c.strokeStyle = '#55554c';
    line(c, [86, 0, 86, 34]);
    const g = c.createRadialGradient(86, 38, 1, 86, 38, 44);
    g.addColorStop(0, 'rgba(220,220,196,0.5)');
    g.addColorStop(1, 'rgba(220,220,196,0)');
    c.fillStyle = g;
    c.fillRect(40, 0, 92, 84);
    c.fillStyle = '#e4e4cf';
    c.fillRect(84, 34, 4, 6);
  },
];

export function initCctv() {
  const root = document.querySelector<HTMLElement>('[data-cctv]');
  if (!root) return;
  const canvases = Array.from(root.querySelectorAll<HTMLCanvasElement>('[data-feed]'));
  const clocks = Array.from(document.querySelectorAll<HTMLElement>('[data-clock]'));

  // Scenes rendered once to offscreen canvases.
  const bases = canvases.map((_, i) => {
    const b = document.createElement('canvas');
    b.width = W;
    b.height = H;
    const c = b.getContext('2d');
    if (c) scenes[i % scenes.length](c);
    return b;
  });
  // A few noise tiles, reused in rotation.
  const tiles = Array.from({ length: 4 }, () => {
    const n = document.createElement('canvas');
    n.width = W;
    n.height = H;
    const c = n.getContext('2d');
    if (c) {
      const img = c.createImageData(W, H);
      for (let p = 0; p < img.data.length; p += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    }
    return n;
  });
  const ctxs = canvases.map((c) => c.getContext('2d'));

  let tick = 0;
  let moveStart = 0;
  let moveArmed = true;
  let seenAt = 0;

  const paint = (now: number) => {
    tick++;
    ctxs.forEach((c, i) => {
      if (!c) return;
      c.globalAlpha = 1;
      c.drawImage(bases[i], 0, 0);
      // The one movement: something leaves the far doorway of the corridor and is gone.
      if (i === 1 && moveStart) {
        const t = (now - moveStart) / 900;
        if (t >= 0 && t <= 1) {
          const x = 78 + t * 13;
          c.fillStyle = '#050505';
          c.fillRect(x, 38, 4, 14);
          c.fillRect(x + 0.5, 35, 3, 3);
        }
      }
      c.globalAlpha = 0.16;
      c.drawImage(tiles[(tick + i) % tiles.length], 0, 0);
      // slow rolling bar
      c.globalAlpha = 0.07;
      c.fillStyle = '#fff';
      c.fillRect(0, ((tick * 2 + i * 31) % (H + 30)) - 30, W, 14);
      c.globalAlpha = 1;
    });
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = () => {
    const d = new Date();
    const s = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    clocks.forEach((c) => (c.textContent = s));
  };
  stamp();
  window.setInterval(stamp, 1000);

  paint(0);
  if (still) return;

  let visible = false;
  let timer = 0;
  const loop = () => {
    const now = performance.now();
    if (moveArmed && seenAt && now - seenAt > 4200) {
      moveArmed = false;
      moveStart = now;
    }
    paint(now);
  };
  new IntersectionObserver(
    (e) => {
      visible = e[0].isIntersecting;
      window.clearInterval(timer);
      if (visible) {
        if (!seenAt) seenAt = performance.now();
        timer = window.setInterval(loop, 125);
      }
    },
    { threshold: 0.2 },
  ).observe(root);
}
