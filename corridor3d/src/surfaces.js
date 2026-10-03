// The hero surfaces, authored at true scale: the wallpaper, the walnut wainscot and the carpet
// runner. Each returns an albedo, a height (turned into a normal map) and a roughness canvas.
// Everything that would show the repeat (stains, wear, fading) is left out of the tiles: it is
// painted per wall and per metre of carpet in shell.js, and laid on as decals in props.js.
import { mulberry, clamp } from './util.js';

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Height (canvas, red channel) to a tangent-space normal map. `strength` in pixels of slope.
export function heightToNormal(src, strength = 2, wrap = true) {
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

// Per-pixel noise in [-1, 1], from an integer hash: fibre, tufts, pores.
const ihash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
};

// Smooth value noise on a wrapping lattice of n x n cells over the tile: low-amplitude blotches
// that tile seamlessly.
function lattice(n, seed) {
  const r = mulberry(seed);
  const v = Array.from({ length: n * n }, () => r());
  return (u, w) => {
    const x = u * n;
    const y = w * n;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const g = (a, b) => v[(((b % n) + n) % n) * n + (((a % n) + n) % n)];
    const top = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * sx;
    const bot = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * sx;
    return top + (bot - top) * sy;
  };
}

// Apply fn(x, y, [r, g, b]) -> [r, g, b] (0..255) over a canvas.
function perPixel(c, fn) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const px = [0, 0, 0];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      px[0] = d[i];
      px[1] = d[i + 1];
      px[2] = d[i + 2];
      const o = fn(x, y, px);
      d[i] = o[0];
      d[i + 1] = o[1];
      d[i + 2] = o[2];
    }
  }
  g.putImageData(img, 0, 0);
}

// --- wallpaper ----------------------------------------------------------------------------------
// A regency stripe, the kind a hotel hung in the eighties: a satin stripe and a matte stripe with
// a small damask sprig, divided by a pair of oxblood pin lines. Paper 53 cm wide, four repeats a
// length, a 22 cm sprig drop. The tile is two lengths (1.06 m): the seam between them has opened
// and one edge has lifted. Returns { albedo, height, rough }.
export const WALLPAPER_TILE = 1.06;
export function wallpaper(S) {
  const mm = S / (WALLPAPER_TILE * 1000); // pixels per millimetre
  const albedo = canvas(S);
  const height = canvas(S);
  const rough = canvas(S);
  const A = albedo.getContext('2d');
  const H = height.getContext('2d');
  const R = rough.getContext('2d');
  const fill = (ctx, style, x, y, w, h) => {
    ctx.fillStyle = style;
    ctx.fillRect(x, y, w, h);
  };
  // the ground, a matte ochre that has gone olive
  fill(A, 'rgb(141,128,92)', 0, 0, S, S);
  fill(H, 'rgb(110,110,110)', 0, 0, S, S);
  fill(R, 'rgb(222,222,222)', 0, 0, S, S);
  const unit = 132.5 * mm;
  const units = Math.round(S / unit);
  for (let k = 0; k < units; k++) {
    const x0 = k * unit;
    // satin stripe: paler and glossier, a little proud of the ground
    fill(A, 'rgb(160,148,109)', x0 + 2 * mm, 0, 50 * mm, S);
    fill(H, 'rgb(128,128,128)', x0 + 2 * mm, 0, 50 * mm, S);
    fill(R, 'rgb(140,140,140)', x0 + 2 * mm, 0, 50 * mm, S);
    // its edges: a fine darker line where the satin print stops
    fill(A, 'rgba(110,98,68,0.7)', x0 + 2 * mm, 0, 0.7 * mm, S);
    fill(A, 'rgba(110,98,68,0.7)', x0 + 51.3 * mm, 0, 0.7 * mm, S);
    // the pin lines, oxblood faded to brown
    fill(A, 'rgb(98,66,50)', x0 + 55 * mm, 0, 1.8 * mm, S);
    fill(A, 'rgb(104,74,56)', x0 + 58.6 * mm, 0, 1.0 * mm, S);
    fill(A, 'rgb(98,66,50)', x0 + 127.5 * mm, 0, 1.8 * mm, S);
    for (const [px, pw] of [
      [55, 1.8],
      [58.6, 1],
      [127.5, 1.8],
    ]) {
      fill(H, 'rgb(122,122,122)', x0 + px * mm, 0, pw * mm, S);
      fill(R, 'rgb(190,190,190)', x0 + px * mm, 0, pw * mm, S);
    }
    // the sprig, in the middle of the matte stripe, half a drop up on every other stripe
    const cx = x0 + 93 * mm;
    const drop = S / Math.round(S / (220 * mm)); // a whole number of drops per tile
    for (let y = (k % 2 ? 0.5 : 0) * drop - drop; y < S + drop; y += drop) {
      sprig(A, cx, y, mm, 'rgb(122,108,74)', 'rgba(172,160,118,0.55)');
      sprig(H, cx, y, mm, 'rgb(136,136,136)', null);
      sprig(R, cx, y, mm, 'rgb(186,186,186)', null);
    }
  }
  // the paper: fibre, a faint watered-silk ripple in the satin, and slow blotches of fading
  const blot = lattice(9, 71);
  const blot2 = lattice(23, 72);
  perPixel(albedo, (x, y, p) => {
    const u = x / S;
    const v = y / S;
    const f = 1 + 0.035 * ihash(x, y, 3) + 0.02 * ihash(x >> 1, y >> 2, 4);
    const b = 1 + 0.07 * (blot(u, v) - 0.5) + 0.04 * (blot2(u, v) - 0.5);
    // the second length came from another roll: a shade warmer and a little more faded
    const roll = u >= 0.5 ? [1.025, 1.015, 0.985] : [1, 1, 1];
    const k = f * b;
    return [p[0] * k * roll[0], p[1] * k * roll[1], p[2] * k * roll[2]];
  });
  perPixel(height, (x, y, p) => {
    const v = y / S;
    const satin = p[0] >= 127 && p[0] <= 129 ? 1 : 0;
    const ripple = satin * 6 * Math.sin(v * 380 + Math.sin(x * 0.02) * 2.2);
    const h = p[0] + 10 * ihash(x, y, 5) + 6 * ihash(x >> 2, y >> 2, 6) + ripple;
    return [h, h, h];
  });
  perPixel(rough, (x, y, p) => {
    const r = p[0] + 14 * ihash(x >> 1, y >> 1, 8);
    return [r, r, r];
  });
  // the seams between the lengths: a hairline gap holding dirt, one edge lifted and catching the light
  for (const x of [0, S / 2]) {
    fill(A, 'rgba(38,30,18,0.7)', x - 0.6 * mm, 0, 1.2 * mm, S);
    fill(A, 'rgba(70,58,36,0.18)', x - 7 * mm, 0, 14 * mm, S);
    fill(A, 'rgba(196,184,146,0.22)', x + 0.6 * mm, 0, 2.2 * mm, S);
    fill(H, 'rgb(60,60,60)', x - 0.6 * mm, 0, 1.2 * mm, S);
    const lift = H.createLinearGradient(x + 0.6 * mm, 0, x + 9 * mm, 0);
    lift.addColorStop(0, 'rgb(190,190,190)');
    lift.addColorStop(1, 'rgba(110,110,110,0)');
    H.fillStyle = lift;
    H.fillRect(x + 0.6 * mm, 0, 8.4 * mm, S);
  }
  // the wrap at x = 0 needs the left half of the seam on the right edge too
  fill(A, 'rgba(38,30,18,0.7)', S - 0.6 * mm, 0, 0.6 * mm, S);
  fill(A, 'rgba(70,58,36,0.18)', S - 7 * mm, 0, 7 * mm, S);
  return { albedo, height, rough };
}

// A small damask sprig, about 34 x 48 mm: a pointed bud on a stem between two curling leaves,
// a pair of berries under it. Mirror symmetric, as printed damask is.
function sprig(ctx, cx, cy, mm, fillStyle, edge) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(mm, mm);
  ctx.fillStyle = fillStyle;
  // bud
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.bezierCurveTo(6.5, -16, 6, -6, 0, -1);
  ctx.bezierCurveTo(-6, -6, -6.5, -16, 0, -24);
  ctx.fill();
  // stem
  ctx.fillRect(-0.7, -2, 1.4, 20);
  // leaves
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(s * 5, 1, s * 13, -1, s * 17, -9);
    ctx.bezierCurveTo(s * 14, -2, s * 12, 6, s * 3, 10);
    ctx.closePath();
    ctx.fill();
    // the curl at the tip
    ctx.beginPath();
    ctx.arc(s * 16.2, -10.6, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // lower leaf, smaller
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.bezierCurveTo(s * 4, 11, s * 9, 12, s * 11, 17);
    ctx.bezierCurveTo(s * 7, 16, s * 4, 17, 0, 16);
    ctx.closePath();
    ctx.fill();
    // berries
    ctx.beginPath();
    ctx.arc(s * 3.4, 21.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (edge) {
    // the pale edge of the print on the lit side of the bud
    ctx.strokeStyle = edge;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.bezierCurveTo(-6.5, -16, -6, -6, 0, -1);
    ctx.stroke();
  }
  ctx.restore();
}

// --- wainscot -------------------------------------------------------------------------------------
// Walnut veneer panels, 60 cm wide and book matched (every other leaf mirrored), under a lacquer
// that has gone amber. A V-groove between the panels. The tile is two panels, 1.2 m square.
export const WAINSCOT_TILE = 1.2;
export function wainscot(veneer, S) {
  const albedo = canvas(S);
  const height = canvas(S);
  const rough = canvas(S);
  const A = albedo.getContext('2d');
  const half = S / 2;
  const real = 1.8; // the scanned veneer covers 1.8 m
  const px = S / WAINSCOT_TILE; // pixels per metre
  // the scan (1.8 m of straight-grained walnut, slip matched) graded to dark walnut under a
  // lacquer gone amber
  const Rp = Math.round(real * px);
  const graded = canvas(Rp);
  const rg = graded.getContext('2d');
  rg.filter = 'saturate(0.8) brightness(0.52) contrast(1.12)';
  rg.drawImage(veneer, 0, 0, Rp, Rp);
  for (const k of [0, 1]) {
    A.save();
    A.beginPath();
    A.rect(k * half, 0, half, S);
    A.clip();
    if (k) {
      // book match: the second leaf is the first one turned over
      A.translate(S, 0);
      A.scale(-1, 1);
    }
    // from the floor up (texture v = 0 is the bottom row)
    A.drawImage(graded, -0.35 * px, S - Rp);
    A.restore();
  }
  // the grooves
  for (const x of [0, half, S]) {
    A.fillStyle = 'rgba(14,9,6,0.85)';
    A.fillRect(x - 0.0018 * px, 0, 0.0036 * px, S);
    A.fillStyle = 'rgba(60,40,26,0.5)';
    A.fillRect(x - 0.0045 * px, 0, 0.0027 * px, S);
  }
  // height: the grain, faintly (open pores under the lacquer), and the grooves
  const ad = A.getImageData(0, 0, S, S).data;
  const hctx = height.getContext('2d');
  const himg = hctx.createImageData(S, S);
  for (let i = 0, p = 0; i < ad.length; i += 4, p++) {
    const x = p % S;
    const l = 0.3 * ad[i] + 0.59 * ad[i + 1] + 0.11 * ad[i + 2];
    let h = 128 + 0.35 * (l - 60);
    const dg = Math.min(Math.abs(x), Math.abs(x - half), Math.abs(x - S)) / px;
    if (dg < 0.003) h -= 70 * (1 - dg / 0.003);
    himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = clamp(h, 0, 255);
    himg.data[i + 3] = 255;
  }
  hctx.putImageData(himg, 0, 0);
  // roughness: lacquer, rubbed duller in streaks; the grooves hold dust
  const rctx = rough.getContext('2d');
  const rimg = rctx.createImageData(S, S);
  const streak = lattice(13, 81);
  for (let i = 0, p = 0; i < rimg.data.length; i += 4, p++) {
    const x = p % S;
    const y = Math.floor(p / S);
    const dg = Math.min(Math.abs(x), Math.abs(x - half), Math.abs(x - S)) / px;
    let r = 92 + 40 * streak(x / S, (y / S) * 0.25) + 10 * ihash(x >> 1, y >> 1, 9);
    if (dg < 0.005) r = 230;
    rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = clamp(r, 0, 255);
    rimg.data[i + 3] = 255;
  }
  rctx.putImageData(rimg, 0, 0);
  return { albedo, height, rough };
}

// --- carpet runner --------------------------------------------------------------------------------
// 1.2 m wide, the tile 1.2 m long. An oxblood field with a lattice of double lines, a small
// four-petal flower in each diamond and a knot at each crossing, a key border on both sides.
// Every colour is a heather of tufts (about 1.5 mm), as woven pile is: no flat printed areas.
export function runner(S) {
  const c = canvas(S);
  const g = c.getContext('2d');
  const u = S / 1.2; // pixels per metre
  // the design, drawn as indexed colours: 0 field, 1 dark line, 2 gold, 3 navy, 4 border field, 5 binding
  g.fillStyle = 'rgb(0,0,0)';
  g.fillRect(0, 0, S, S);
  const ink = (n) => `rgb(${n},0,0)`;
  const step = S / 8; // 15 cm diamonds
  const bw = 0.15 * u;
  g.save();
  g.beginPath();
  g.rect(bw, 0, S - 2 * bw, S);
  g.clip();
  for (let j = -1; j <= 8; j++) {
    for (let i = 0; i <= 9; i++) {
      const cx = (i - 0.5) * step + (j % 2 ? step / 2 : 0);
      const cy = j * step;
      // the lattice: a dark line with a gold line inside it
      g.save();
      g.translate(cx, cy);
      g.strokeStyle = ink(1);
      g.lineWidth = 0.009 * u;
      g.beginPath();
      g.moveTo(0, -step);
      g.lineTo(step / 2, 0);
      g.lineTo(0, step);
      g.lineTo(-step / 2, 0);
      g.closePath();
      g.stroke();
      g.strokeStyle = ink(2);
      g.lineWidth = 0.0035 * u;
      g.stroke();
      // the flower in the diamond: four petals, navy heart
      g.fillStyle = ink(2);
      for (let p = 0; p < 4; p++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.ellipse(0, -0.017 * u, 0.0075 * u, 0.015 * u, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = ink(3);
      g.beginPath();
      g.arc(0, 0, 0.007 * u, 0, Math.PI * 2);
      g.fill();
      // a knot where the lines cross
      g.translate(step / 2, 0);
      g.fillStyle = ink(3);
      g.fillRect(-0.008 * u, -0.008 * u, 0.016 * u, 0.016 * u);
      g.fillStyle = ink(2);
      g.fillRect(-0.0035 * u, -0.0035 * u, 0.007 * u, 0.007 * u);
      g.restore();
    }
  }
  g.restore();
  // borders: a dark band with a gold key between two gold lines, the bound edge outside
  for (const side of [0, 1]) {
    g.save();
    if (side) {
      g.translate(S, 0);
      g.scale(-1, 1);
    }
    g.fillStyle = ink(4);
    g.fillRect(0, 0, bw, S);
    g.fillStyle = ink(2);
    g.fillRect(0.016 * u, 0, 0.006 * u, S);
    g.fillRect(bw - 0.022 * u, 0, 0.006 * u, S);
    g.strokeStyle = ink(2);
    g.lineWidth = 0.0065 * u;
    const n = 10;
    const d = S / n;
    for (let j = 0; j < n; j++) {
      const y = j * d;
      const x0 = 0.04 * u;
      const x1 = bw - 0.042 * u;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0, y + d * 0.72);
      g.lineTo(x1, y + d * 0.72);
      g.lineTo(x1, y + d * 0.28);
      g.lineTo((x0 + x1) / 2, y + d * 0.28);
      g.lineTo((x0 + x1) / 2, y + d * 0.5);
      g.stroke();
    }
    g.fillStyle = ink(5);
    g.fillRect(0, 0, 0.009 * u, S);
    g.restore();
  }
  // tufts: each index becomes a heather of two or three yarn colours; edges between colours are
  // decided per tuft, so lines are a little ragged, as in a real pile
  // yarns: faded by forty years of corridor light and shampoo, the gold gone to dull ochre
  const pal = [
    [
      [84, 30, 30],
      [72, 25, 27],
      [94, 38, 34],
    ],
    [
      [38, 16, 18],
      [30, 12, 14],
      [48, 22, 22],
    ],
    [
      [124, 98, 64],
      [108, 86, 56],
      [138, 112, 76],
    ],
    [
      [36, 36, 48],
      [28, 28, 38],
      [46, 44, 56],
    ],
    [
      [50, 22, 26],
      [42, 18, 22],
      [58, 28, 30],
    ],
    [
      [22, 13, 12],
      [18, 11, 10],
      [28, 16, 14],
    ],
  ];
  const src = g.getImageData(0, 0, S, S).data;
  const img = g.createImageData(S, S);
  const T = Math.max(2, Math.round(0.0015 * u)); // tuft size in pixels
  const fade = lattice(7, 91);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tx = Math.floor(x / T);
      const ty = Math.floor(y / T);
      // which design colour this tuft takes: the design sampled at a jittered point inside it
      const jx = clamp(tx * T + Math.floor((ihash(tx, ty, 11) * 0.5 + 0.5) * T), 0, S - 1);
      const jy = (ty * T + Math.floor((ihash(tx, ty, 12) * 0.5 + 0.5) * T)) % S;
      const idx = clamp(src[(jy * S + jx) * 4], 0, 5);
      const h = ihash(tx, ty, 13) * 0.5 + 0.5;
      const yarn = pal[idx][h < 0.5 ? 0 : h < 0.82 ? 1 : 2];
      // inside a tuft: lit tip, shadowed root
      const fx = (x % T) / T - 0.5;
      const fy = (y % T) / T - 0.5;
      const tip = 1.06 - 0.5 * (fx * fx + fy * fy) + 0.05 * ihash(x, y, 14);
      const f = tip * (0.9 + 0.2 * fade(x / S, y / S));
      const i = (y * S + x) * 4;
      img.data[i] = yarn[0] * f;
      img.data[i + 1] = yarn[1] * f;
      img.data[i + 2] = yarn[2] * f;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// A scanned texture regraded on a canvas (CSS filter syntax).
export function graded(img, filter, S = img.width) {
  const c = canvas(S, Math.round((S * img.height) / img.width));
  const g = c.getContext('2d');
  g.filter = filter;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.filter = 'none';
  return c;
}
