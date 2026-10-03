// Texture loading and the authored (canvas-baked) textures: the printed wallpaper, the carpet
// runner, the decal atlas (dried blood, water stains, grime, gouges, bare plaster), the clawed
// door face, the number plates and the signs. Everything random is seeded.
import * as THREE from 'three';
import { mulberry, fbm, noise2, clamp, smooth } from './util.js';
import { DOORS, LAST_ROOM } from './layout.js';

const BASE = '/corridor3d/textures';

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

// Draw an image tiled n times over a canvas.
function tile(ctx, img, n, size) {
  const d = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) ctx.drawImage(img, x * d, y * d, d, d);
}

// --- wallpaper: two 53 cm lengths of striped paper with a small printed ornament ------------
function wallpaper(grunge, S) {
  const c = canvas(S);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(154,146,112)';
  g.fillRect(0, 0, S, S);
  // a woven ground: faint vertical ribbing
  for (let x = 0; x < S; x += 4) {
    g.fillStyle = `rgba(90,82,52,${0.03 + 0.03 * ((x / 4) % 3)})`;
    g.fillRect(x, 0, 1.5, S);
  }
  // damask: tone on tone, a half-drop repeat of 26.5 x 35 cm
  const k = S / 2048;
  const motif = (cx, cy) => {
    g.save();
    g.translate(cx, cy);
    g.scale(k * 1.5, k * 1.5);
    const body = 'rgba(112,104,70,0.62)';
    const line = 'rgba(196,184,134,0.4)';
    g.fillStyle = body;
    g.strokeStyle = line;
    g.lineWidth = 2;
    const leaf = (sx, sy) => {
      g.beginPath();
      g.moveTo(0, sy * 20);
      g.bezierCurveTo(sx * 26, sy * 30, sx * 62, sy * 48, sx * 66, sy * 92);
      g.bezierCurveTo(sx * 46, sy * 74, sx * 30, sy * 70, sx * 12, sy * 84);
      g.bezierCurveTo(sx * 18, sy * 60, sx * 10, sy * 40, 0, sy * 20);
      g.fill();
      g.stroke();
      // the curl at the tip
      g.beginPath();
      g.arc(sx * 60, sy * 100, 9, 0, Math.PI * 2);
      g.fill();
    };
    // central pointed oval with a pale heart
    g.beginPath();
    g.moveTo(0, -112);
    g.bezierCurveTo(40, -62, 40, 62, 0, 112);
    g.bezierCurveTo(-40, 62, -40, -62, 0, -112);
    g.fill();
    g.stroke();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) leaf(sx, sy);
    g.fillStyle = 'rgba(176,166,124,0.7)';
    g.beginPath();
    g.moveTo(0, -58);
    g.bezierCurveTo(17, -26, 17, 26, 0, 58);
    g.bezierCurveTo(-17, 26, -17, -26, 0, -58);
    g.fill();
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, 7, 0, Math.PI * 2);
    g.fill();
    // crown and foot
    for (const sy of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, sy * 112);
      g.lineTo(9, sy * 130);
      g.lineTo(0, sy * 152);
      g.lineTo(-9, sy * 130);
      g.closePath();
      g.fill();
    }
    g.restore();
  };
  const cols = 4;
  const rows = 3;
  for (let i = 0; i < cols; i++) {
    for (let j = -1; j <= rows; j++) motif((i + 0.5) * (S / cols), (j + 0.5 + (i % 2 ? 0.5 : 0)) * (S / rows));
  }
  // small diamonds between the motifs
  g.fillStyle = 'rgba(112,104,70,0.5)';
  for (let i = 0; i < cols; i++) {
    for (let j = -1; j <= rows; j++) {
      const x = i * (S / cols);
      const y = (j + 0.5 + (i % 2 ? 0 : 0.5)) * (S / rows) + S / rows / 4;
      g.beginPath();
      g.moveTo(x, y - 14 * k);
      g.lineTo(x + 9 * k, y);
      g.lineTo(x, y + 14 * k);
      g.lineTo(x - 9 * k, y);
      g.fill();
    }
  }
  // age: the photographed wall, multiplied in
  g.globalCompositeOperation = 'multiply';
  g.filter = 'brightness(1.7) contrast(1.1) saturate(0.7)';
  tile(g, grunge, 1, S);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  // seams between the lengths of paper: a faint dark line
  for (const x of [0, S / 2]) {
    g.fillStyle = 'rgba(40,34,20,0.3)';
    g.fillRect(x - 1, 0, 2.5, S);
  }
  return c;
}

// --- carpet runner: 1.2 m wide, borders on both edges, a lattice in the field ----------------
function runner(pile, S) {
  const c = canvas(S);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(86,33,31)';
  g.fillRect(0, 0, S, S);
  const u = S / 1.2; // pixels per metre
  g.filter = `blur(${S / 1400}px)`; // dye bleeds into the pile, nothing printed stays crisp
  // field lattice: 20 cm diamonds with a small flower
  const step = S / 6;
  for (let j = -1; j <= 6; j++) {
    for (let i = 1; i <= 5; i++) {
      const off = i % 2 ? step / 2 : 0;
      const cx = i * step;
      const cy = j * step + off + step / 2;
      g.save();
      g.translate(cx, cy);
      g.strokeStyle = 'rgba(52,12,16,0.85)';
      g.lineWidth = 0.012 * u;
      g.beginPath();
      g.moveTo(0, -step / 2);
      g.lineTo(step / 2, 0);
      g.lineTo(0, step / 2);
      g.lineTo(-step / 2, 0);
      g.closePath();
      g.stroke();
      g.fillStyle = 'rgba(150,120,66,0.75)';
      for (let p = 0; p < 4; p++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.ellipse(0, -0.022 * u, 0.009 * u, 0.02 * u, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(40,10,14,0.9)';
      g.beginPath();
      g.arc(0, 0, 0.008 * u, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  // borders
  for (const side of [0, 1]) {
    g.save();
    if (side) {
      g.translate(S, 0);
      g.scale(-1, 1);
    }
    const bw = 0.135 * u;
    g.fillStyle = 'rgb(38,14,20)';
    g.fillRect(0, 0, bw, S);
    g.fillStyle = 'rgb(138,110,60)';
    g.fillRect(0.012 * u, 0, 0.007 * u, S);
    g.fillRect(bw - 0.019 * u, 0, 0.007 * u, S);
    g.fillStyle = 'rgb(86,33,31)';
    g.fillRect(0.03 * u, 0, bw - 0.06 * u, S);
    // running key in the border
    g.strokeStyle = 'rgb(138,110,60)';
    g.lineWidth = 0.007 * u;
    const n = 12;
    const d = S / n;
    for (let j = 0; j < n; j++) {
      const y = j * d;
      const x0 = 0.045 * u;
      const x1 = bw - 0.045 * u;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0, y + d * 0.7);
      g.lineTo(x1, y + d * 0.7);
      g.lineTo(x1, y + d * 0.25);
      g.lineTo((x0 + x1) / 2, y + d * 0.25);
      g.stroke();
    }
    // bound edge
    g.fillStyle = 'rgb(24,10,12)';
    g.fillRect(0, 0, 0.008 * u, S);
    g.restore();
  }
  // pile and dirt from the photographed carpet, desaturated so it only carries the weave
  g.filter = 'none';
  g.globalCompositeOperation = 'multiply';
  g.filter = 'grayscale(1) brightness(3.1) contrast(1.15)';
  tile(g, pile, 2, S);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  return c;
}

// --- decal atlas ----------------------------------------------------------------------------------
// 4 x 4 cells. Each entry returns the UV rectangle of its cell.
export const ATLAS = { n: 4 };
export const cell = (i) => {
  const n = ATLAS.n;
  const x = i % n;
  const y = Math.floor(i / n);
  return { u0: x / n, v0: 1 - (y + 1) / n, u1: (x + 1) / n, v1: 1 - y / n };
};
export const DECAL = { blood1: 0, blood2: 1, blood3: 2, water1: 3, water2: 4, water3: 5, grime1: 6, grime2: 7, gouge1: 8, gouge2: 9, plaster1: 10, plaster2: 11, stain1: 12, stain2: 13, drip1: 14, soot1: 15 };

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

function decalAtlas(plaster, S) {
  const c = canvas(S);
  const g = c.getContext('2d');
  const C = S / ATLAS.n;
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
      g.fillStyle = `rgba(${66 + 26 * t},${20 + 6 * t},${11 + 4 * t},${a})`;
      g.beginPath();
      g.ellipse(x + lean * t * len + Math.sin(t * 7 + x) * 1.5, y + t * len, ww, ww * 1.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  const bloodMark = (variant) => {
    g.filter = 'blur(1.2px)';
    if (variant === 0) {
      // a hand that slid down: palm smear and four fingers
      blob(g, R, C * 0.5, C * 0.3, C * 0.13, 0.35, 11, 'rgba(72,22,12,0.62)');
      blob(g, R, C * 0.52, C * 0.31, C * 0.08, 0.4, 12, 'rgba(48,13,8,0.5)');
      for (let f = 0; f < 4; f++) drag(C * (0.36 + f * 0.085), C * (0.2 + 0.03 * Math.abs(f - 1.5)), C * (0.55 + 0.1 * R()), C * 0.017, 0.12 - f * 0.03, 0.75);
      drag(C * 0.7, C * 0.36, C * 0.2, C * 0.02, 0.5, 0.6);
    } else if (variant === 1) {
      // sideways wipe along a frame
      g.translate(C / 2, C / 2);
      g.rotate(-1.25);
      g.translate(-C / 2, -C / 2);
      for (let f = 0; f < 3; f++) drag(C * (0.4 + f * 0.09), C * 0.16, C * 0.7, C * 0.02, 0.05, 0.6);
      blob(g, R, C * 0.5, C * 0.2, C * 0.09, 0.4, 21, 'rgba(68,20,11,0.55)');
    } else {
      // spots and one thumb-wide drag
      for (let i = 0; i < 22; i++) blob(g, R, C * (0.2 + 0.6 * R()), C * (0.15 + 0.6 * R()), C * (0.006 + 0.02 * R() * R()), 0.3, 30 + i, `rgba(70,21,12,${0.45 + 0.4 * R()})`);
      drag(C * 0.45, C * 0.3, C * 0.5, C * 0.026, -0.1, 0.7);
    }
    g.filter = 'none';
  };
  inCell(DECAL.blood1, () => bloodMark(0));
  inCell(DECAL.blood2, () => bloodMark(1));
  inCell(DECAL.blood3, () => bloodMark(2));

  // Water stains: a tide line, a paler middle, older rings inside.
  const water = (seed) => {
    g.filter = `blur(${C * 0.006}px)`;
    for (let ring = 0; ring < 3; ring++) {
      const r = C * (0.4 - ring * 0.1);
      blob(g, R, C * (0.5 + 0.03 * ring), C * (0.5 - 0.02 * ring), r, 0.3, seed + ring * 3, 'rgba(84,56,22,0.42)');
      g.globalCompositeOperation = 'destination-out';
      blob(g, R, C * (0.5 + 0.03 * ring), C * (0.5 - 0.02 * ring), r * 0.955, 0.3, seed + ring * 3, 'rgba(0,0,0,0.86)');
      g.globalCompositeOperation = 'source-over';
    }
    blob(g, R, C * 0.5, C * 0.5, C * 0.38, 0.3, seed, 'rgba(120,92,48,0.1)');
    g.filter = 'none';
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
  inCell(DECAL.soot1, () => grime(412, [10, 9, 8]));

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
        g.strokeStyle = pass ? pale : 'rgba(18,10,6,0.8)';
        g.lineWidth = pass ? C * 0.006 : C * 0.012;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y0);
        g.bezierCurveTo(x + lean * len * 0.3, y0 + len * 0.3, x + lean * len * 0.8, y0 + len * 0.7, x + lean * len, y0 + len);
        g.stroke();
      }
    }
  };
  // the cut is pale but not white: raw wood, grey plaster dust, in the shade of its own lip
  inCell(DECAL.gouge1, () => gouges(51, 16, 'rgba(168,140,104,0.85)'));
  inCell(DECAL.gouge2, () => gouges(67, 12, 'rgba(166,152,128,0.85)'));

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
    for (let i = 0; i < 9; i++) {
      const x = C * (0.15 + 0.7 * r());
      const len = C * (0.3 + 0.6 * r());
      const w = C * (0.006 + 0.012 * r());
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(70,46,18,0.5)');
      grad.addColorStop(1, 'rgba(70,46,18,0)');
      g.fillStyle = grad;
      g.fillRect(x, 4, w, len);
    }
    g.filter = 'none';
  });
  return c;
}

// --- the clawed inside of door 305 -------------------------------------------------------------
// Full leaf face, 0.86 x 2.03 m. Returns albedo and height canvases.
function clawedDoor(wood, W, H) {
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.filter = 'brightness(0.95)';
  g.drawImage(wood, 0, 0, W, H);
  g.filter = 'none';
  const hc = canvas(W, H);
  const hg = hc.getContext('2d');
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, W, H);
  const r = mulberry(305);
  const px = W / 0.86; // pixels per metre
  // canvas y runs down from the top of the door
  const yOf = (metres) => H - metres * px;
  const track = (x, y, len, lean, w, depth) => {
    const x1 = x + lean * len;
    const y1 = y + len;
    const cx1 = x + lean * len * 0.2 + (r() - 0.5) * 0.02 * px;
    const cx2 = x + lean * len * 0.85 + (r() - 0.5) * 0.02 * px;
    const path = () => {
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(cx1, y + len * 0.3, cx2, y + len * 0.7, x1, y1);
    };
    // bruised varnish around the cut
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(40,20,8,0.34)';
    g.lineWidth = w * 2.2;
    path();
    g.stroke();
    // raw, splintered wood
    g.strokeStyle = `rgba(${214 + 20 * r()},${198 + 16 * r()},${164 + 16 * r()},${0.8 + 0.15 * depth})`;
    g.lineWidth = w;
    path();
    g.stroke();
    // years of dirt in the bottom of the groove
    g.strokeStyle = `rgba(30,13,7,${0.7 + 0.25 * depth})`;
    g.lineWidth = w * 0.7;
    path();
    g.stroke();
    hg.lineCap = 'round';
    hg.strokeStyle = `rgba(0,0,0,${0.55 + 0.4 * depth})`;
    hg.lineWidth = w * 1.1;
    hg.beginPath();
    hg.moveTo(x, y);
    hg.bezierCurveTo(cx1, y + len * 0.3, cx2, y + len * 0.7, x1, y1);
    hg.stroke();
  };
  // where the hands worked longest the varnish is rubbed away: pale, matt patches
  g.filter = `blur(${px * 0.012}px)`;
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(206,190,158,${0.14 + 0.16 * r()})`;
    g.beginPath();
    g.ellipse((0.12 + r() * 0.62) * px, yOf(0.5 + r() * 0.9), (0.04 + r() * 0.07) * px, (0.08 + r() * 0.16) * px, (r() - 0.5) * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';
  // a few deep, long gouges
  for (let i = 0; i < 7; i++) track((0.12 + r() * 0.62) * px, yOf(1.0 + r() * 0.6), (0.4 + r() * 0.45) * px, (r() - 0.5) * 0.3, (0.005 + r() * 0.003) * px, 1);
  // sets of four fingers, most of them between knee and shoulder height of a child
  const sets = 34;
  for (let s = 0; s < sets; s++) {
    const low = r() < 0.72;
    const top = low ? 0.55 + r() * 0.75 : 1.2 + r() * 0.65;
    const x = (0.08 + r() * 0.7) * px;
    const len = (0.12 + r() * (low ? 0.42 : 0.3)) * px;
    const lean = (r() - 0.5) * 0.35;
    const spread = (0.016 + r() * 0.008) * px;
    const fingers = r() < 0.2 ? 3 : 4;
    for (let f = 0; f < fingers; f++) {
      track(x + f * spread, yOf(top) + Math.abs(f - 1.5) * 0.012 * px + r() * 6, len * (0.75 + 0.25 * r()), lean, (0.0026 + r() * 0.0018) * px, r());
    }
  }
  // around the handle side edge the varnish is gone altogether
  g.filter = `blur(${px * 0.01}px)`;
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${150 + 40 * r()},${112 + 30 * r()},${74 + 20 * r()},${0.2 + 0.3 * r()})`;
    g.beginPath();
    g.ellipse((0.78 + r() * 0.08) * px, yOf(0.75 + r() * 0.55), 0.012 * px, (0.02 + r() * 0.05) * px, 0, 0, Math.PI * 2);
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
      img.data[i] = 174 * k - 8 * paste;
      img.data[i + 1] = 161 * k - 14 * paste;
      img.data[i + 2] = 130 * k - 20 * paste;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export async function loadTextures({ size = 2048, small = 1024 } = {}) {
  const ids = ['dirty_carpet', 'decrepit_wallpaper', 'dark_wood', 'oak_veneer_01', 'wood_cabinet_worn_long', 'wood_floor_worn', 'painted_plaster_wall', 'worn_plaster_wall', 'rough_wood'];
  const img = {};
  await Promise.all(
    ids.flatMap((id) =>
      ['Diffuse', 'nor_gl', 'Rough'].map(async (m) => {
        img[`${id}/${m}`] = await loadImage(`${BASE}/${id}/${m}.jpg`);
      }),
    ),
  );
  const set = (id) => ({
    map: tex(img[`${id}/Diffuse`], { srgb: true }),
    normalMap: tex(img[`${id}/nor_gl`]),
    roughnessMap: tex(img[`${id}/Rough`]),
  });
  const T = {};
  for (const id of ids) T[id] = set(id);

  T.wallpaper = tex(wallpaper(img['decrepit_wallpaper/Diffuse'], size), { srgb: true });
  T.runner = tex(runner(img['dirty_carpet/Diffuse'], size), { srgb: true });
  T.decals = tex(decalAtlas(img['worn_plaster_wall/Diffuse'], size), { srgb: true, repeat: false });
  const claw = clawedDoor(img['oak_veneer_01/Diffuse'], Math.round(size * 0.5), Math.round((size * 0.5 * 2.03) / 0.86));
  T.claw = tex(claw.albedo, { srgb: true, repeat: false });
  T.clawNormal = tex(heightToNormal(claw.height, 5, false), { repeat: false });
  const pl = plates(small);
  T.plates = tex(pl.albedo, { srgb: true, repeat: false });
  T.platesOrm = tex(pl.orm, { repeat: false });
  T.platesNormal = tex(heightToNormal(pl.height, 3, false), { repeat: false });
  T.signs = tex(signs(small), { srgb: true, repeat: false });
  T.paperBack = tex(paperBack(512), { srgb: true });
  return T;
}
