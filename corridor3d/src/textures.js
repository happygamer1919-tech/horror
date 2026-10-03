// Texture loading and the authored (canvas-baked) textures: the wall, carpet and door bakes of
// surfaces.js, the decal atlas (dried blood, water stains, grime, gouges, bare plaster), the clawed
// door face, the number plates and the signs. Everything random is seeded.
import * as THREE from 'three';
import { mulberry, fbm, noise2, clamp, smooth } from './util.js';
import { DOORS, LAST_ROOM } from './layout.js';
import { graded, doubled, printTile, wallPanels, wallAlbedo, wainscotTile, CARPET_PANELS, carpetPanel, carpetAlbedo, doorSkin, doorRough, DOOR_TILE } from './surfaces.js';

const BASE = '/corridor3d/textures';

// How each scan is graded before it is laid (CSS filter syntax).
const GRADE = {
  paper: 'grayscale(0.45) brightness(1.62) contrast(0.9)',
  boards: 'brightness(1.0) saturate(0.55) contrast(1.06)',
  carpet: 'hue-rotate(-14deg) saturate(1.1) contrast(1.12) brightness(0.5)',
  door: 'saturate(0.4) brightness(1.22)',
};
// Door skins: [material name, seed, { grime, kicked }]. scene.js hands them out.
export const DOOR_SKINS = [
  ['door301', 301, { grime: 0.6, kicked: 0.6 }],
  ['door306', 306, { grime: 0.5, kicked: 0.4 }],
  ['door308', 308, { grime: 0.7, kicked: 0.5 }],
  ['door313', 313, { grime: 1.0, kicked: 1.0 }],
  ['doorA', 11, { grime: 0.3, kicked: 0.5 }],
  ['doorB', 12, { grime: 0.6, kicked: 0.3 }],
  ['doorC', 13, { grime: 0.45, kicked: 0.8 }],
  ['doorD', 14, { grime: 0.8, kicked: 0.6 }],
];

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cannot load ${url} (run: npm run corridor:fetch)`));
    img.src = url;
  });

function tex(source, { srgb = false, repeat = true } = {}) {
  const t = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Height (canvas, red channel) to a tangent-space normal map. `strength` in pixels of slope.
function heightToNormal(src, strength = 2, wrap = true) {
  const w = src.width;
  const h = src.height;
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const at = (x, y) => {
    if (wrap) {
      x = (x + w) % w;
      y = (y + h) % h;
    } else {
      x = clamp(x, 0, w - 1);
      y = clamp(y, 0, h - 1);
    }
    return s[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / l) * 127.5 + 127.5;
      img.data[i + 1] = (dy / l) * 127.5 + 127.5; // canvas y is down, GL normal maps are y up
      img.data[i + 2] = (1 / l) * 127.5 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// A canvas multiplied by a colour.
function tinted(c, colour) {
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  return c;
}

// --- decal atlas ----------------------------------------------------------------------------------
// 5 x 5 cells. Each entry returns the UV rectangle of its cell.
export const ATLAS = { n: 5 };
export const cell = (i) => {
  const n = ATLAS.n;
  const x = i % n;
  const y = Math.floor(i / n);
  return { u0: x / n, v0: 1 - (y + 1) / n, u1: (x + 1) / n, v1: 1 - y / n };
};
export const DECAL = { blood1: 0, blood2: 1, blood3: 2, water1: 3, water2: 4, water3: 5, grime1: 6, grime2: 7, gouge1: 8, gouge2: 9, plaster1: 10, plaster2: 11, stain1: 12, stain2: 13, drip1: 14, paste: 15, ghost: 16, scuff: 17, rub: 18 };

function blob(g, R, cx, cy, r, rough, seed, fill) {
  // an irregular closed shape
  g.beginPath();
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - rough + 2 * rough * fbm(Math.cos(a) * 1.7 + 5, Math.sin(a) * 1.7 + 5, seed, 4));
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function decalAtlas(plaster, size) {
  // whole pixels per cell: the painters below address pixels as y * C + x
  const C = Math.floor(size / ATLAS.n);
  const S = C * ATLAS.n;
  const c = canvas(S);
  const g = c.getContext('2d');
  const R = mulberry(4021);
  const inCell = (i, fn) => {
    const x = (i % ATLAS.n) * C;
    const y = Math.floor(i / ATLAS.n) * C;
    g.save();
    g.beginPath();
    g.rect(x + 2, y + 2, C - 4, C - 4);
    g.clip();
    g.translate(x, y);
    fn();
    g.restore();
  };

  // Dried blood: finger drags. Old, brown, soaked in: darker rim, thin centre.
  const drag = (x, y, len, w, lean, seedAlpha) => {
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const a = seedAlpha * (1 - t) * (1 - t) * (0.55 + 0.45 * noise2(t * 9, x * 0.05, 7));
      const ww = w * (1 - 0.55 * t);
      g.fillStyle = `rgba(${46 + 30 * t},${12 + 8 * t},${8 + 4 * t},${a})`;
      g.beginPath();
      g.ellipse(x + lean * t * len + Math.sin(t * 7 + x) * 1.5, y + t * len, ww, ww * 1.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  // dried: nearly black where it was thick, rust at the thin edges, a darker rim where it dried
  // Old blood is brown, not black: thin where it was smeared, soaked into the varnish at the edges.
  const smear = (draw, alpha = 0.9) => {
    g.save();
    g.filter = 'blur(2.5px)';
    g.globalAlpha = alpha * 0.45;
    draw('rgb(104,50,28)', 1.1);
    g.filter = 'blur(1px)';
    g.globalAlpha = alpha * 0.75;
    draw('rgb(74,30,16)', 0.92);
    g.globalAlpha = alpha * 0.5;
    draw('rgb(46,16,9)', 0.66);
    g.restore();
  };
  const bloodMark = (variant) => {
    if (variant === 0) {
      // a left hand pressed flat at handle height and then dragged down the door
      const hx = C * 0.5;
      const hy = C * 0.3;
      const fingers = [
        [-0.075, -0.13, 0.018, 0.07, -0.16],
        [-0.025, -0.155, 0.019, 0.08, -0.05],
        [0.025, -0.15, 0.019, 0.078, 0.04],
        [0.07, -0.125, 0.016, 0.062, 0.14],
      ];
      smear((col, k) => {
        g.fillStyle = col;
        // palm
        blob(g, R, hx, hy, C * 0.085 * k, 0.18, 11, col);
        // fingers and thumb
        for (const [dx, dy, w, l, a] of fingers) {
          g.beginPath();
          g.ellipse(hx + dx * C, hy + dy * C, w * C * k, l * C * k, a, 0, Math.PI * 2);
          g.fill();
        }
        g.beginPath();
        g.ellipse(hx - 0.115 * C, hy + 0.015 * C, 0.02 * C * k, 0.055 * C * k, 0.9, 0, Math.PI * 2);
        g.fill();
        // the slide: the hand went down, the fingers left long tracks, the palm a broad smear
        for (const [dx, , w] of fingers) {
          const x0 = hx + dx * C;
          for (let t = 0; t < 1; t += 0.01) {
            const ww = w * C * k * (1 - 0.6 * t) * (0.7 + 0.3 * noise2(t * 14, dx * 40, 5));
            g.globalAlpha *= 1;
            g.beginPath();
            g.ellipse(x0 + Math.sin(t * 5 + dx * 30) * 2 + t * 6, hy + t * C * 0.5, ww, ww * 1.8, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
        for (let t = 0; t < 1; t += 0.02) {
          const ww = C * 0.07 * k * (1 - 0.75 * t);
          g.beginPath();
          g.ellipse(hx + t * 4, hy + t * C * 0.32, ww, ww * 0.7, 0, 0, Math.PI * 2);
          g.fill();
        }
      }, 0.78);
    } else if (variant === 1) {
      // a sideways wipe along the frame
      g.translate(C / 2, C / 2);
      g.rotate(-1.25);
      g.translate(-C / 2, -C / 2);
      for (let f = 0; f < 3; f++) drag(C * (0.4 + f * 0.09), C * 0.16, C * 0.7, C * 0.022, 0.05, 0.85);
      blob(g, R, C * 0.5, C * 0.2, C * 0.09, 0.4, 21, 'rgba(48,13,8,0.75)');
    } else {
      // three fingers drawn down the door, and drops that ran
      smear((col, k) => {
        g.fillStyle = col;
        for (let f = 0; f < 3; f++) {
          const x0 = C * (0.38 + f * 0.085);
          for (let t = 0; t < 1; t += 0.008) {
            const ww = C * 0.016 * k * (1 - 0.5 * t) * (0.6 + 0.4 * noise2(t * 12, f * 7, 9));
            g.beginPath();
            g.ellipse(x0 + Math.sin(t * 4 + f) * 3 - t * 10, C * (0.12 + 0.72 * t * (0.85 + 0.1 * f)), ww, ww * 1.6, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
        for (let i = 0; i < 14; i++) blob(g, R, C * (0.25 + 0.5 * R()), C * (0.1 + 0.4 * R()), C * (0.004 + 0.012 * R()) * k, 0.3, 30 + i, col);
      }, 0.85);
    }
  };
  inCell(DECAL.blood1, () => bloodMark(0));
  inCell(DECAL.blood2, () => bloodMark(1));
  inCell(DECAL.blood3, () => bloodMark(2));

  // Water stains: an irregular tide line where the water stopped spreading, a paler, patchy
  // middle, and a second, broken line inside from a later leak. Never concentric rings.
  const water = (seed) => {
    const img = g.createImageData(C, C);
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = x / C - 0.5;
        const v = y / C - 0.5;
        const r = Math.hypot(u * (1 + 0.25 * Math.sin(seed)), v) * 2;
        const f = (1 - r) * 1.15 + 0.6 * (fbm(x / C * 2.6 + seed, y / C * 2.6, seed, 5) - 0.5) + 0.12 * (fbm(x / C * 9, y / C * 9, seed + 3, 3) - 0.5);
        const inside = smooth(0.1, 0.14, f);
        const tide = Math.exp(-Math.pow((f - 0.12) / 0.016, 2));
        const tide2 = Math.exp(-Math.pow((f - 0.4) / 0.018, 2)) * smooth(0.48, 0.62, fbm(x / C * 4, y / C * 4, seed + 9, 3));
        const fill = inside * (0.1 + 0.16 * fbm(x / C * 6, y / C * 6, seed + 5, 3));
        const a = clamp(fill + tide * 0.5 + tide2 * 0.32, 0, 0.8);
        const t = clamp((tide + tide2) / Math.max(1e-3, tide + tide2 + fill * 3), 0, 1);
        const i = (y * C + x) * 4;
        img.data[i] = 120 - 40 * t;
        img.data[i + 1] = 92 - 34 * t;
        img.data[i + 2] = 50 - 26 * t;
        img.data[i + 3] = a * 255;
      }
    }
    const tmp = canvas(C);
    tmp.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(tmp, 2, 2, C - 4, C - 4);
  };
  inCell(DECAL.water1, () => water(101));
  inCell(DECAL.water2, () => water(140));
  inCell(DECAL.water3, () => water(177));

  // Grime: soft, uneven, greasy dark.
  const grime = (seed, col) => {
    const img = g.createImageData(C, C);
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const dx = x / C - 0.5;
        const dy = y / C - 0.5;
        const d = Math.hypot(dx, dy) * 2;
        const n = fbm(x / C * 6, y / C * 6, seed, 4);
        const a = clamp((1 - d) * 1.35 - 0.12, 0, 1) * (0.35 + 0.9 * n);
        const i = (y * C + x) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = clamp(a * a * 255 * 1.15, 0, 235);
      }
    }
    const tmp = canvas(C);
    tmp.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(tmp, 2, 2, C - 4, C - 4);
  };
  inCell(DECAL.grime1, () => grime(301, [22, 17, 12]));
  inCell(DECAL.grime2, () => grime(377, [30, 24, 16]));

  // Gouges: fingernail tracks cut through to raw wood or plaster, with a dark lip.
  const gouges = (seed, n, pale) => {
    const r = mulberry(seed);
    for (let i = 0; i < n; i++) {
      const group = Math.floor(i / 4);
      const gx = C * (0.2 + 0.6 * ((group * 0.37 + 0.13) % 1));
      const x = gx + (i % 4) * C * 0.03 + r() * C * 0.008;
      const y0 = C * (0.1 + 0.25 * r());
      const len = C * (0.25 + 0.45 * r());
      const lean = (r() - 0.5) * 0.22;
      for (const pass of [0, 1]) {
        g.strokeStyle = pass ? pale : 'rgba(18,10,6,0.55)';
        g.lineWidth = pass ? C * 0.0035 : C * 0.008;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y0);
        g.bezierCurveTo(x + lean * len * 0.3, y0 + len * 0.3, x + lean * len * 0.8, y0 + len * 0.7, x + lean * len, y0 + len);
        g.stroke();
      }
    }
  };
  // the cut is pale but not white: raw wood, grey plaster dust, in the shade of its own lip
  inCell(DECAL.gouge1, () => gouges(51, 16, 'rgba(150,126,96,0.6)'));
  inCell(DECAL.gouge2, () => gouges(67, 12, 'rgba(120,112,98,0.55)'));

  // Bare plaster where the paper came away: the photographed plaster, ragged alpha.
  const bare = (seed) => {
    const tmp = canvas(C);
    const t = tmp.getContext('2d');
    t.filter = 'brightness(1.25) saturate(0.7)';
    t.drawImage(plaster, 0, 0, C, C);
    t.filter = 'none';
    t.globalCompositeOperation = 'destination-in';
    blob(t, R, C * 0.5, C * 0.5, C * 0.42, 0.22, seed, '#000');
    t.globalCompositeOperation = 'source-over';
    g.drawImage(tmp, 0, 0);
  };
  inCell(DECAL.plaster1, () => bare(801));
  inCell(DECAL.plaster2, () => bare(844));
  // Where a strip of paper came off: grey plaster, old brown paste in streaks, and scraps of
  // the paper's back still stuck to it. Taller than wide, ragged at the edges.
  inCell(DECAL.paste, () => {
    const tmp = canvas(C);
    const t = tmp.getContext('2d');
    t.filter = 'grayscale(0.6) brightness(0.95)';
    t.drawImage(plaster, 0, 0, C, C);
    t.filter = 'none';
    const img = t.getImageData(0, 0, C, C);
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const i = (y * C + x) * 4;
        const n = fbm(x / C * 6, y / C * 18, 607, 4);
        const paste = smooth(0.5, 0.62, n);
        const scrap = smooth(0.66, 0.7, fbm(x / C * 9 + 3, y / C * 5, 611, 4));
        img.data[i] = img.data[i] * (1 - 0.35 * paste) * (1 - scrap) + 150 * scrap;
        img.data[i + 1] = img.data[i + 1] * (1 - 0.42 * paste) * (1 - scrap) + 134 * scrap;
        img.data[i + 2] = img.data[i + 2] * (1 - 0.55 * paste) * (1 - scrap) + 96 * scrap;
        // ragged outline, a strip shape
        const u = Math.abs(x / C - 0.5) * 2;
        const v = Math.abs(y / C - 0.5) * 2;
        const edge = Math.max(u * (1 + 0.25 * (fbm(y / C * 14, 1, 612, 3) - 0.5)), v * (1 + 0.3 * (fbm(x / C * 14, 2, 613, 3) - 0.5)));
        img.data[i + 3] = 255 * smooth(0.98, 0.9, edge);
      }
    }
    t.putImageData(img, 0, 0);
    g.drawImage(tmp, 0, 0);
  });

  // Carpet stains: dark, soaked, with satellites.
  const stain = (seed) => {
    g.filter = `blur(${C * 0.01}px)`;
    blob(g, R, C * 0.5, C * 0.5, C * 0.3, 0.4, seed, 'rgba(14,6,5,0.5)');
    blob(g, R, C * 0.47, C * 0.52, C * 0.2, 0.45, seed + 3, 'rgba(8,3,3,0.45)');
    const r = mulberry(seed);
    for (let i = 0; i < 14; i++) blob(g, R, C * (0.2 + 0.6 * r()), C * (0.2 + 0.6 * r()), C * (0.01 + 0.03 * r()), 0.3, seed + 10 + i, 'rgba(12,5,4,0.5)');
    g.filter = 'none';
  };
  inCell(DECAL.stain1, () => stain(901));
  inCell(DECAL.stain2, () => stain(951));

  // Drips: rusty water run down a wall from the ceiling.
  inCell(DECAL.drip1, () => {
    g.filter = `blur(${C * 0.004}px)`;
    const r = mulberry(77);
    for (let i = 0; i < 12; i++) {
      const x = C * (0.12 + 0.76 * r());
      const len = C * (0.35 + 0.62 * r());
      const w = C * (0.006 + 0.016 * r());
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(78,50,18,0.62)');
      grad.addColorStop(0.85, 'rgba(70,44,16,0.3)');
      grad.addColorStop(1, 'rgba(60,38,14,0)');
      g.fillStyle = grad;
      g.fillRect(x, 4, w, len);
    }
    g.filter = 'none';
  });

  // Where a picture hung for twenty years: the paper under it kept its colour, the paper round
  // it went brown; dust settled along the top of the frame; the nail is gone, its hole is not.
  inCell(DECAL.ghost, () => {
    const x0 = C * 0.14;
    const y0 = C * 0.2;
    const w = C * 0.72;
    const h = C * 0.56;
    g.filter = `blur(${C * 0.006}px)`;
    g.fillStyle = 'rgba(188,176,136,0.42)';
    g.fillRect(x0, y0, w, h);
    g.fillStyle = 'rgba(40,32,20,0.35)';
    g.fillRect(x0 - C * 0.004, y0 - C * 0.012, w + C * 0.008, C * 0.014);
    g.fillStyle = 'rgba(40,32,20,0.16)';
    g.fillRect(x0 - C * 0.006, y0, C * 0.01, h);
    g.fillRect(x0 + w - C * 0.004, y0, C * 0.01, h);
    g.filter = 'none';
    g.fillStyle = 'rgba(16,12,8,0.9)';
    g.beginPath();
    g.arc(C * 0.5, y0 - C * 0.07, C * 0.0055, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(120,108,80,0.5)';
    g.beginPath();
    g.arc(C * 0.5, y0 - C * 0.07, C * 0.011, 0, Math.PI * 2);
    g.fill();
  });

  // Scuffs on lacquered wood at shoe and suitcase height: black rubber streaks, and pale
  // scratches where the lacquer has been cut and the wood under it shows.
  inCell(DECAL.scuff, () => {
    const r = mulberry(1717);
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = C * (0.05 + 0.75 * r());
      const y = C * (0.3 + 0.55 * r());
      const len = C * (0.05 + 0.2 * r());
      const tilt = (r() - 0.5) * 0.25;
      const pale = r() < 0.35;
      g.strokeStyle = pale ? `rgba(150,124,96,${0.35 + 0.3 * r()})` : `rgba(10,8,7,${0.25 + 0.4 * r()})`;
      g.lineWidth = C * (pale ? 0.002 + 0.003 * r() : 0.004 + 0.012 * r());
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len * 0.5, y + len * tilt + (r() - 0.5) * C * 0.01, x + len, y + len * tilt * 1.6);
      g.stroke();
    }
  });

  // Varnish rubbed through by forty years of hands: paler, greyer wood in a soft patch, streaked
  // the way a hand moves, with a greasy dark rim where the dirt collects at its edge.
  inCell(DECAL.rub, () => {
    const img = g.createImageData(C, C);
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const dx = x / C - 0.5;
        const dy = y / C - 0.5;
        const n = fbm(x / C * 4, y / C * 4, 1801, 4);
        const d = Math.hypot(dx * 1.2, dy) * 2 + 0.5 * (n - 0.5);
        const streak = 0.85 + 0.15 * fbm(x / C * 3, y / C * 22, 1805, 3);
        const core = clamp((1 - d) * 1.4, 0, 1) * streak;
        const rim = smooth(0.35, 0.8, d) * smooth(1.1, 0.8, d) * smooth(0.45, 0.7, fbm(x / C * 9, y / C * 9, 1803, 3));
        const i = (y * C + x) * 4;
        const t = core / Math.max(1e-3, core + rim * 0.6);
        img.data[i] = 156 * t + 26 * (1 - t);
        img.data[i + 1] = 124 * t + 19 * (1 - t);
        img.data[i + 2] = 94 * t + 13 * (1 - t);
        img.data[i + 3] = clamp(core * 0.6 + rim * 0.22, 0, 0.75) * 255;
      }
    }
    const tmp = canvas(C);
    tmp.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(tmp, 0, 0);
  });
  return c;
}

// --- the clawed inside of door 305 -------------------------------------------------------------
// Full leaf face, 0.86 x 2.03 m. Returns albedo and height canvases.
function clawedDoor(wood, W, H) {
  const c = canvas(W, H);
  const g = c.getContext('2d');
  // the same varnished veneer as the corridor side of the leaves, at its true scale, so the raw
  // wood in the cuts shows pale against it
  {
    const pat = g.createPattern(wood, 'repeat');
    const k = (DOOR_TILE * (W / 0.86)) / wood.width;
    pat.setTransform(new DOMMatrix().translate(W * 0.37, H * 0.21).scale(k, k));
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    // the inside of a door nobody polished: duller, and darker towards the floor
    const shade = g.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0.12)');
    shade.addColorStop(0.6, 'rgba(0,0,0,0.05)');
    shade.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = shade;
    g.fillRect(0, 0, W, H);
  }
  const hc = canvas(W, H);
  const hg = hc.getContext('2d');
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, W, H);
  const r = mulberry(305);
  const px = W / 0.86; // pixels per metre
  // canvas y runs down from the top of the door
  const yOf = (metres) => H - metres * px;
  // One gouge: a groove cut through the varnish into raw, pale wood. The lip on the lit side is
  // bright, the far wall of the groove is in shadow, fibres are torn up along the edges, and
  // the height map gives it real depth for the normal map.
  const track = (x, y, len, lean, w, depth) => {
    // old cuts have gone grey-brown with dirt, the last ones are still pale
    const tone = 0.7 + 0.42 * Math.pow(r(), 1.6);
    // a nail skids: the line wavers, bites deeper in places and lifts off at the end
    const N = 24;
    const pts = [];
    const wob = r() * 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push([x + lean * len * t + Math.sin(t * 5 + wob) * w * 1.2 + (r() - 0.5) * w * 0.12, y + len * t]);
    }
    const bite = (t) => (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5)) * (1 - smooth(0.75, 1, t)) * (0.7 + 0.3 * Math.sin(t * 9 + wob));
    const seg = (ctx, i, width, style, dx = 0) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(pts[i][0] + dx, pts[i][1]);
      ctx.lineTo(pts[i + 1][0] + dx, pts[i + 1][1]);
      ctx.stroke();
    };
    // butt ends: round caps on translucent segments bead the line like a string of pearls
    g.lineCap = 'butt';
    hg.lineCap = 'butt';
    for (let i = 0; i < N; i++) {
      const b = bite(i / N) * depth;
      // crushed, dirty varnish either side; the walls of the groove raw wood, pale and grey, not
      // gold; the bottom of the cut in its own shadow; a thin torn lip catching the light
      seg(g, i, w * 2.6, `rgba(30,18,10,${0.26 * b})`);
      seg(g, i, w * (0.6 + 0.6 * b), `rgba(${Math.round(tone * (140 + 30 * b))},${Math.round(tone * (118 + 26 * b))},${Math.round(tone * (92 + 20 * b))},${0.35 + 0.5 * b})`);
      seg(g, i, w * 0.32, `rgba(24,15,9,${0.7 * b})`);
      seg(g, i, w * 0.18, `rgba(188,170,142,${0.22 * b * tone})`, -w * 0.42);
      seg(hg, i, w * (0.8 + 0.6 * b), `rgba(0,0,0,${0.35 + 0.6 * b})`);
    }
    // a splinter or two torn up at the deepest point
    for (let i = 0; i < 3; i++) {
      const t = 0.2 + 0.5 * r();
      const k = Math.floor(t * N);
      g.strokeStyle = `rgba(150,132,106,${0.25 + 0.3 * r()})`;
      g.lineWidth = Math.max(1, w * 0.3);
      g.beginPath();
      g.moveTo(pts[k][0], pts[k][1]);
      g.lineTo(pts[k][0] + (r() - 0.5) * w * 3, pts[k][1] + w * (2 + 3 * r()));
      g.stroke();
    }
  };
  // Where the hands worked: most of it at the height a child reaches, on the side of the lock
  // and the handle, where a door might give. Each place was gone over again and again, so the
  // marks come in dense patches, the varnish between them flaked off to bare, dull wood.
  const places = [];
  for (let i = 0; i < 7; i++) {
    const lockSide = i < 4;
    places.push({ x: lockSide ? 0.52 + r() * 0.24 : 0.14 + r() * 0.34, y: i === 5 ? 1.45 + r() * 0.2 : 0.62 + r() * 0.62, rx: 0.08 + r() * 0.07, ry: 0.13 + r() * 0.12, n: lockSide ? 5 + Math.floor(r() * 4) : 3 + Math.floor(r() * 3) });
  }
  for (const pl of places) {
    // the flaked varnish: an uneven pale patch, broken up along the grain
    g.save();
    g.filter = `blur(${px * 0.006}px)`;
    for (let i = 0; i < 46; i++) {
      const a2 = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      g.fillStyle = `rgba(${150 + 30 * r()},${124 + 26 * r()},${96 + 22 * r()},${0.05 + 0.1 * r()})`;
      g.beginPath();
      g.ellipse((pl.x + Math.cos(a2) * d * pl.rx) * px, yOf(pl.y + Math.sin(a2) * d * pl.ry), (0.004 + r() * 0.012) * px, (0.015 + r() * 0.05) * px, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // sets of three or four nails dragged down together: nearly parallel, never crossing like a net
    const bias = (r() - 0.5) * 0.22;
    for (let k = 0; k < pl.n; k++) {
      const x = (pl.x + (r() - 0.5) * 1.6 * pl.rx) * px;
      const top = pl.y + pl.ry * (0.2 + 0.9 * r());
      const len = (0.07 + r() * 0.26) * px;
      const lean = bias + (r() - 0.5) * 0.16;
      const spread = (0.014 + r() * 0.008) * px;
      const fingers = r() < 0.35 ? 3 : 4;
      const w = (0.0034 + r() * 0.003) * px;
      const depth = 0.5 + 0.5 * r();
      for (let f = 0; f < fingers; f++) {
        track(x + f * spread, yOf(top) + Math.abs(f - 1.5) * 0.012 * px + r() * 5, len * (0.6 + 0.4 * r()) * (f === 3 ? 0.75 : 1), lean + (r() - 0.5) * 0.05, w * (f === 3 ? 0.8 : 1), depth * (0.75 + 0.25 * r()));
      }
    }
  }
  // along the lock edge, where the fingers tried to get round the door, the varnish is gone in
  // a ragged strip
  g.filter = `blur(${px * 0.004}px)`;
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${140 + 34 * r()},${112 + 28 * r()},${82 + 20 * r()},${0.1 + 0.22 * r()})`;
    g.beginPath();
    g.ellipse((0.815 + r() * 0.04) * px, yOf(0.7 + r() * 0.62), (0.002 + r() * 0.006) * px, (0.008 + r() * 0.03) * px, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';
  // old, dry, brown: where the nails broke
  g.filter = 'blur(1.5px)';
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(52,16,9,${0.3 + 0.4 * r()})`;
    const x = (0.1 + r() * 0.7) * px;
    const y = yOf(0.45 + r() * 0.8);
    g.fillRect(x, y, (0.003 + r() * 0.004) * px, (0.03 + r() * 0.16) * px);
  }
  g.filter = 'none';
  return { albedo: c, height: hc };
}

// --- number plates: one atlas for every door ----------------------------------------------------
export const PLATES = { n: 4 };
export const plateCell = (no) => {
  const list = [...DOORS.map((d) => d.no), LAST_ROOM].sort((a, b) => a - b);
  const i = list.indexOf(no);
  const n = PLATES.n;
  const x = i % n;
  const y = Math.floor(i / n);
  return { u0: x / n, v0: 1 - (y + 0.5) / n, u1: (x + 1) / n, v1: 1 - y / n };
};
function plates(S) {
  // albedo (brass with blackened digits), roughness/metalness (ORM layout) and height
  const a = canvas(S);
  const m = canvas(S);
  const hgt = canvas(S);
  const ag = a.getContext('2d');
  const mg = m.getContext('2d');
  const hg = hgt.getContext('2d');
  ag.fillStyle = 'rgb(196,158,92)';
  ag.fillRect(0, 0, S, S);
  // roughness in G, metalness in B
  mg.fillStyle = 'rgb(0,96,255)';
  mg.fillRect(0, 0, S, S);
  hg.fillStyle = '#909090';
  hg.fillRect(0, 0, S, S);
  const list = [...DOORS.map((d) => d.no), LAST_ROOM].sort((x, y) => x - y);
  const n = PLATES.n;
  const cw = S / n;
  const chh = S / n / 2;
  const r = mulberry(99);
  list.forEach((no, i) => {
    const x = (i % n) * cw;
    const y = Math.floor(i / n) * (S / n);
    // tarnish
    for (let k = 0; k < 40; k++) {
      ag.fillStyle = `rgba(${70 + 40 * r()},${52 + 30 * r()},${24 + 20 * r()},${0.05 + 0.1 * r()})`;
      ag.beginPath();
      ag.ellipse(x + r() * cw, y + r() * chh, cw * (0.02 + 0.1 * r()), chh * (0.05 + 0.2 * r()), r() * 3, 0, Math.PI * 2);
      ag.fill();
      mg.fillStyle = `rgba(0,${140 + 80 * r()},255,0.25)`;
      mg.beginPath();
      mg.ellipse(x + r() * cw, y + r() * chh, cw * (0.02 + 0.1 * r()), chh * (0.05 + 0.2 * r()), r() * 3, 0, Math.PI * 2);
      mg.fill();
    }
    for (const [ctx, style] of [
      [ag, 'rgb(22,16,10)'],
      [mg, 'rgb(0,150,40)'],
      [hg, '#303030'],
    ]) {
      ctx.fillStyle = style;
      ctx.font = `700 ${chh * 0.72}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(no), x + cw / 2, y + chh * 0.54);
      // engraved border line
      ctx.strokeStyle = style;
      ctx.lineWidth = chh * 0.025;
      ctx.strokeRect(x + cw * 0.06, y + chh * 0.1, cw * 0.88, chh * 0.8);
    }
  });
  return { albedo: a, orm: m, height: hgt };
}

// --- signs and prints -------------------------------------------------------------------------
// One atlas: exit pictogram (top left), do-not-disturb card (top right), three faded prints.
export const SIGN = {
  exit: { u0: 0, v0: 0.75, u1: 0.5, v1: 1 },
  card: { u0: 0.5, v0: 0.5, u1: 0.75, v1: 1 },
  print1: { u0: 0, v0: 0.25, u1: 0.5, v1: 0.75 },
  print2: { u0: 0.75, v0: 0.5, u1: 1, v1: 1 },
  print3: { u0: 0, v0: 0, u1: 0.5, v1: 0.25 },
  switch: { u0: 0.5, v0: 0.25, u1: 0.75, v1: 0.5 },
  evac: { u0: 0.5, v0: 0, u1: 1, v1: 0.25 },
};
function signs(S) {
  const c = canvas(S);
  const g = c.getContext('2d');
  const rect = (r) => [r.u0 * S, (1 - r.v1) * S, (r.u1 - r.u0) * S, (r.v1 - r.v0) * S];
  const R = mulberry(555);
  // exit: white running figure and arrow on green
  {
    const [x, y, w, h] = rect(SIGN.exit);
    g.fillStyle = 'rgb(12,120,60)';
    g.fillRect(x, y, w, h);
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgb(236,244,236)';
    // door slab
    g.fillRect(w * 0.1, h * 0.14, w * 0.2, h * 0.72);
    g.fillStyle = 'rgb(12,120,60)';
    g.fillRect(w * 0.12, h * 0.18, w * 0.16, h * 0.64);
    g.fillStyle = 'rgb(236,244,236)';
    g.strokeStyle = 'rgb(236,244,236)';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // figure, running towards the door on the left
    g.beginPath();
    g.arc(w * 0.44, h * 0.26, h * 0.075, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = h * 0.09;
    g.beginPath();
    g.moveTo(w * 0.42, h * 0.4);
    g.lineTo(w * 0.47, h * 0.6);
    g.stroke();
    g.lineWidth = h * 0.065;
    g.beginPath();
    g.moveTo(w * 0.42, h * 0.42);
    g.lineTo(w * 0.34, h * 0.48);
    g.lineTo(w * 0.31, h * 0.42);
    g.moveTo(w * 0.43, h * 0.42);
    g.lineTo(w * 0.52, h * 0.47);
    g.lineTo(w * 0.57, h * 0.42);
    g.moveTo(w * 0.47, h * 0.6);
    g.lineTo(w * 0.39, h * 0.7);
    g.lineTo(w * 0.33, h * 0.82);
    g.moveTo(w * 0.47, h * 0.6);
    g.lineTo(w * 0.55, h * 0.68);
    g.lineTo(w * 0.62, h * 0.66);
    g.stroke();
    // arrow pointing left
    g.lineWidth = h * 0.07;
    g.beginPath();
    g.moveTo(w * 0.9, h * 0.5);
    g.lineTo(w * 0.7, h * 0.5);
    g.moveTo(w * 0.77, h * 0.36);
    g.lineTo(w * 0.69, h * 0.5);
    g.lineTo(w * 0.77, h * 0.64);
    g.stroke();
    g.restore();
  }
  // do-not-disturb card: red card, a hole, two pale bars standing in for the words
  {
    const [x, y, w, h] = rect(SIGN.card);
    g.fillStyle = 'rgb(128,24,22)';
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgb(222,206,170)';
    g.font = `700 ${w * 0.15}px Georgia, serif`;
    g.textAlign = 'center';
    g.fillText('NU', x + w / 2, y + h * 0.5);
    g.fillText('DERANJAȚI', x + w / 2, y + h * 0.58);
    g.fillRect(x + w * 0.2, y + h * 0.64, w * 0.6, h * 0.008);
    g.font = `700 ${w * 0.1}px Georgia, serif`;
    g.fillText('НЕ БЕСПОКОИТЬ', x + w / 2, y + h * 0.72);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(30,10,8,${0.1 * R()})`;
      g.fillRect(x + R() * w, y + R() * h, w * 0.2 * R(), h * 0.02);
    }
  }
  // prints: faded photographs behind glass
  const print = (r, kind) => {
    const [x, y, w, h] = rect(r);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = 'rgb(196,186,160)';
    g.fillRect(x, y, w, h);
    const mx = w * 0.12;
    const my = h * 0.14;
    const sky = g.createLinearGradient(0, y + my, 0, y + h - my);
    sky.addColorStop(0, 'rgb(150,140,116)');
    sky.addColorStop(0.55, 'rgb(176,160,126)');
    sky.addColorStop(1, 'rgb(84,72,54)');
    g.fillStyle = sky;
    g.fillRect(x + mx, y + my, w - 2 * mx, h - 2 * my);
    g.beginPath();
    g.rect(x + mx, y + my, w - 2 * mx, h - 2 * my);
    g.clip();
    if (kind === 0) {
      // the hotel, long ago
      g.fillStyle = 'rgb(70,60,46)';
      g.fillRect(x + w * 0.28, y + h * 0.36, w * 0.44, h * 0.42);
      g.fillStyle = 'rgb(150,136,104)';
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) g.fillRect(x + w * (0.31 + i * 0.082), y + h * (0.4 + j * 0.085), w * 0.045, h * 0.05);
      g.fillStyle = 'rgb(58,50,40)';
      g.fillRect(x, y + h * 0.76, w, h * 0.2);
    } else if (kind === 1) {
      // a girl in a pale dress, standing, the face scratched out
      g.fillStyle = 'rgb(72,62,48)';
      g.fillRect(x, y + h * 0.7, w, h * 0.3);
      g.fillStyle = 'rgb(196,186,160)';
      g.beginPath();
      g.moveTo(x + w * 0.42, y + h * 0.42);
      g.lineTo(x + w * 0.58, y + h * 0.42);
      g.lineTo(x + w * 0.64, y + h * 0.74);
      g.lineTo(x + w * 0.36, y + h * 0.74);
      g.fill();
      g.fillStyle = 'rgb(60,50,40)';
      g.beginPath();
      g.arc(x + w * 0.5, y + h * 0.36, w * 0.075, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgb(206,198,176)';
      g.lineWidth = w * 0.006;
      for (let i = 0; i < 16; i++) {
        g.beginPath();
        g.moveTo(x + w * (0.43 + 0.14 * R()), y + h * (0.31 + 0.1 * R()));
        g.lineTo(x + w * (0.43 + 0.14 * R()), y + h * (0.31 + 0.1 * R()));
        g.stroke();
      }
    } else {
      // hills and a lake
      g.fillStyle = 'rgb(92,84,62)';
      g.beginPath();
      g.moveTo(x, y + h * 0.6);
      for (let i = 0; i <= 20; i++) g.lineTo(x + (w * i) / 20, y + h * (0.5 + 0.12 * noise2(i * 0.4, 3, 9)));
      g.lineTo(x + w, y + h);
      g.lineTo(x, y + h);
      g.fill();
      g.fillStyle = 'rgb(140,134,112)';
      g.fillRect(x, y + h * 0.7, w, h * 0.08);
    }
    // foxing and a tide mark
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(96,66,30,${0.05 + 0.12 * R()})`;
      g.beginPath();
      g.arc(x + R() * w, y + R() * h, w * (0.004 + 0.02 * R()), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  print(SIGN.print1, 0);
  print(SIGN.print2, 1);
  print(SIGN.print3, 2);
  // light switch plate: cream bakelite, grubby
  {
    const [x, y, w, h] = rect(SIGN.switch);
    g.fillStyle = 'rgb(196,184,150)';
    g.fillRect(x, y, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(50,40,24,${0.06 + 0.1 * R()})`;
      g.beginPath();
      g.arc(x + w * (0.3 + 0.4 * R()), y + h * (0.3 + 0.5 * R()), w * (0.03 + 0.1 * R()), 0, Math.PI * 2);
      g.fill();
    }
  }
  // evacuation plan: a yellowed sheet with a floor diagram
  {
    const [x, y, w, h] = rect(SIGN.evac);
    g.fillStyle = 'rgb(206,196,160)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgb(50,44,36)';
    g.lineWidth = h * 0.012;
    g.strokeRect(x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.2);
    for (let i = 0; i < 7; i++) {
      g.strokeRect(x + w * (0.08 + i * 0.12), y + h * 0.12, w * 0.12, h * 0.18);
      g.strokeRect(x + w * (0.08 + i * 0.12), y + h * 0.5, w * 0.12, h * 0.18);
    }
    g.strokeStyle = 'rgb(150,40,30)';
    g.lineWidth = h * 0.02;
    g.beginPath();
    g.moveTo(x + w * 0.85, y + h * 0.4);
    g.lineTo(x + w * 0.14, y + h * 0.4);
    g.stroke();
    g.fillStyle = 'rgb(50,44,36)';
    for (let i = 0; i < 4; i++) g.fillRect(x + w * 0.1, y + h * (0.76 + i * 0.05), w * (0.5 + 0.2 * R()), h * 0.012);
  }
  return c;
}

// Paper back for the peeled wallpaper: yellowed paper with old paste.
function paperBack(S) {
  const c = canvas(S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm(x / S * 8, y / S * 8, 61, 4);
      const p = fbm(x / S * 40, y / S * 3, 62, 3);
      const i = (y * S + x) * 4;
      // off-white lining paper gone yellow, faint tide marks of old paste
      const k = 0.9 + 0.12 * n - 0.07 * smooth(0.55, 0.85, p);
      const paste = smooth(0.6, 0.9, n);
      img.data[i] = 148 * k - 10 * paste;
      img.data[i + 1] = 128 * k - 16 * paste;
      img.data[i + 2] = 88 * k - 20 * paste;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export async function loadTextures({ size = 2048, small = 1024 } = {}) {
  // Poly Haven scans (Diffuse, nor_gl, Rough) and one ambientCG scan (Color, NormalGL, Roughness)
  const ids = ['dark_wood', 'wood_floor_worn', 'painted_plaster_wall', 'worn_plaster_wall', 'rough_wood', 'decrepit_wallpaper', 'wood_cabinet_worn_long', 'wood_table_001'];
  const img = {};
  await Promise.all([
    ...ids.flatMap((id) =>
      ['Diffuse', 'nor_gl', 'Rough'].map(async (m) => {
        img[`${id}/${m}`] = await loadImage(`${BASE}/${id}/${m}.jpg`);
      }),
    ),
    ...['Color', 'NormalGL', 'Roughness'].map(async (m) => {
      img[`Carpet015/${m}`] = await loadImage(`${BASE}/Carpet015/${m}.jpg`);
    }),
  ]);
  const set = (id) => ({
    map: tex(img[`${id}/Diffuse`], { srgb: true }),
    normalMap: tex(img[`${id}/nor_gl`]),
    roughnessMap: tex(img[`${id}/Rough`]),
  });
  const T = {};
  for (const id of ids) T[id] = set(id);

  // the scans, graded once: forty years of varnish, smoke and dirt take the colour out of them
  const src = {
    paper: tinted(graded(img['decrepit_wallpaper/Diffuse'], GRADE.paper), 'rgb(232,234,196)'),
    print: printTile(),
    cab2: doubled(img['wood_cabinet_worn_long/Diffuse'], GRADE.boards),
    carpet: graded(img['Carpet015/Color'], GRADE.carpet),
    door: graded(img['wood_table_001/Diffuse'], GRADE.door),
  };
  // walls: one albedo per panel, the scans' own normal and roughness under all of them
  T.wall = {};
  for (const p of wallPanels()) T.wall[p.id] = tex(wallAlbedo(p, size, src), { srgb: true });
  T.paperTile = tex(src.paper, { srgb: true });
  T.wainscotNormal = tex(wainscotTile(doubled(img['wood_cabinet_worn_long/nor_gl']), size));
  T.wainscotRough = tex(wainscotTile(doubled(img['wood_cabinet_worn_long/Rough']), size));
  // carpet runner
  T.carpet = [];
  for (let k = 0; k < CARPET_PANELS; k++) T.carpet.push(tex(carpetAlbedo(carpetPanel(k), size, src), { srgb: true }));
  T.carpetNormal = tex(img['Carpet015/NormalGL']);
  T.carpetRough = tex(img['Carpet015/Roughness']);
  // door leaves: the doors the walker stops at have a skin of their own, the rest share four
  T.doorSkins = {};
  for (const [name, seed, o] of DOOR_SKINS) T.doorSkins[name] = tex(doorSkin(seed, size, src, o), { srgb: true });
  T.doorRough = tex(doorRough(512));
  T.floorWood = tex(graded(img['wood_floor_worn/Diffuse'], 'saturate(0.45) brightness(0.8) contrast(1.05)'), { srgb: true });
  T.trimWood = tex(graded(img['dark_wood/Diffuse'], 'saturate(0.55) brightness(0.9)'), { srgb: true });
  T.decals = tex(decalAtlas(img['worn_plaster_wall/Diffuse'], size), { srgb: true, repeat: false });
  const claw = clawedDoor(src.door, Math.round(size * 0.75), Math.round((size * 0.75 * 2.03) / 0.86));
  T.claw = tex(claw.albedo, { srgb: true, repeat: false });
  T.clawNormal = tex(heightToNormal(claw.height, 9, false), { repeat: false });
  const pl = plates(small);
  T.plates = tex(pl.albedo, { srgb: true, repeat: false });
  T.platesOrm = tex(pl.orm, { repeat: false });
  T.platesNormal = tex(heightToNormal(pl.height, 3, false), { repeat: false });
  T.signs = tex(signs(small), { srgb: true, repeat: false });
  T.paperBack = tex(paperBack(512), { srgb: true });
  {
    // emissive map for the lamp shades (lathe v: 0 at the holder, 1 at the rim): frosted glass
    // glows brightest round the bulb and dims towards the rim
    // (u runs round the shade.) Dust lies on the glass in patches, flies have died on it, and
    // somebody once wiped half of it with a wet cloth: the glow is mottled, never a clean gradient.
    const c = canvas(512, 256);
    const gg = c.getContext('2d');
    const im = gg.createImageData(512, 256);
    const rr = mulberry(4411);
    for (let y = 0; y < 256; y++) {
      const v = 1 - y / 255; // 0 at the holder, 1 at the rim
      const base = v < 0.18 ? 0.5 + 0.5 * (v / 0.18) : v < 0.45 ? 1 - 0.3 * ((v - 0.18) / 0.27) : v < 0.8 ? 0.7 - 0.38 * ((v - 0.45) / 0.35) : 0.32 - 0.12 * ((v - 0.8) / 0.2);
      for (let x = 0; x < 512; x++) {
        const u = x / 512;
        // wraps round the shade: blend the noise with itself half a turn on
        const n = (a, b, sd) => fbm(u * a, v * b, sd, 3) * (1 - Math.abs(2 * u - 1)) + fbm((u + 0.5) * a + 7, v * b, sd, 3) * Math.abs(2 * u - 1);
        const dust = 0.55 + 0.75 * n(7, 3, 901);
        const wipe = 1 - 0.3 * smooth(0.5, 0.62, n(2.2, 1.2, 903));
        const k = clamp(base * dust * wipe, 0, 1);
        const i = (y * 512 + x) * 4;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = 255 * Math.pow(k, 1 / 2.2);
        im.data[i + 3] = 255;
      }
    }
    gg.putImageData(im, 0, 0);
    for (let i = 0; i < 46; i++) {
      gg.fillStyle = `rgba(0,0,0,${0.5 + 0.4 * rr()})`;
      gg.beginPath();
      gg.ellipse(rr() * 512, 256 * (0.05 + 0.5 * Math.pow(rr(), 2)), 1 + rr() * 3.4, 0.8 + rr() * 1.6, rr() * 3, 0, Math.PI * 2);
      gg.fill();
    }
    T.shadeGlow = tex(c, { srgb: true });
  }
  return T;
}
