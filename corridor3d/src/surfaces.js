// The hero surfaces: walls, carpet runner and door leaves. Each is built from a scanned CC0
// material laid at its true scale and then baked, panel by panel along the corridor, together
// with everything that makes a surface a place and not a tile: seams between the lengths of
// paper, water that came down from the cornice and where it stopped, nicotine, the dirt above
// the rail, the paler rectangles where pictures hung, torn patches, scuffs, the traffic path worn
// into the runner, the grime round a door handle. All of it is a function of the position in
// the corridor (metres), so nothing repeats over the 29 m and a mark runs across a panel joint.
//
// The tracer keeps every texture in one array at one size (2048). The walls are therefore cut
// into panels about 2.5 m long, each with its own albedo; normal and roughness maps are the
// scans themselves, shared, with a texture transform per panel.
import { mulberry, clamp, smooth, fbm, noise2, hash2 } from './util.js';
import { HW, CH, START, END, DOOR, DOORS, DADO, RUNNER, LAMPS, LAST_ROOM } from './layout.js';

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

// A scanned texture regraded on a canvas (CSS filter syntax).
export function graded(img, filter, S = img.width) {
  const c = canvas(S, Math.round((S * img.height) / img.width));
  const g = c.getContext('2d');
  g.filter = filter;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.filter = 'none';
  return c;
}

// A low-resolution field fn(u, v) -> [r, g, b, a] (0..1), as a canvas to be stretched over a panel.
function field(w, h, fn) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = fn((x + 0.5) / w, (y + 0.5) / h);
      const i = (y * w + x) * 4;
      d[i] = clamp(o[0], 0, 1) * 255;
      d[i + 1] = clamp(o[1], 0, 1) * 255;
      d[i + 2] = clamp(o[2], 0, 1) * 255;
      d[i + 3] = (o.length > 3 ? clamp(o[3], 0, 1) : 1) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
// Multiply a colour (r, g, b as 0..1 targets) into an accumulator by an amount a.
const mul = (c, a, r, g, b) => {
  c[0] *= 1 - a * (1 - r);
  c[1] *= 1 - a * (1 - g);
  c[2] *= 1 - a * (1 - b);
};
// An irregular closed outline round (cx, cy).
function blobPath(g, cx, cy, rx, ry, rough, seed) {
  g.beginPath();
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 - rough + 2 * rough * fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, seed, 3);
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

// ================================================================================================
// Walls
// ================================================================================================
export const SEAM = 0.53; // one length of wallpaper
export const WALL_PANELS = 12; // per side wall
export const PANEL_W = (END - START) / WALL_PANELS;
const MARGIN = 0.012; // the texture reaches a little past its panel, so no texel wraps at a joint
export const PAPER_TILE = 2.5; // the wallpaper scan covers 2.5 m
export const PLANK = 0.186; // one board of the wainscot
const PLANK_ORDER = [3, 7, 0, 5, 9, 2, 6, 1, 8, 4, 6, 2, 9, 0, 4, 7, 1, 5, 3, 8];
export const WAINSCOT_TILE = PLANK * PLANK_ORDER.length;

// The panels: twelve along each side wall and one for the end wall. `a0..a1` is the range along
// the wall (s on a side wall, x on the end wall), `q` shifts every noise so no two walls match.
export function wallPanels() {
  const list = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < WALL_PANELS; k++) list.push({ id: `${side < 0 ? 'L' : 'R'}${k}`, side, k, a0: START + k * PANEL_W, a1: START + (k + 1) * PANEL_W });
  }
  list.push({ id: 'E0', side: 0, k: 0, a0: -HW, a1: HW });
  return list;
}
export const panelIndex = (s) => clamp(Math.floor((s - START) / PANEL_W), 0, WALL_PANELS - 1);
// Texture coordinates of a wall point (a along the wall, y up) in its panel.
export const panelUV = (p, a, y) => [(a - p.a0 + MARGIN) / (p.a1 - p.a0 + 2 * MARGIN), (y + MARGIN) / (CH + 2 * MARGIN)];
// The repeat and offset that lay a tile of `size` metres (u along the wall, v up) over a panel.
export function panelTransform(p, tileU, tileV, shiftU = 0, shiftV = 0) {
  const W = p.a1 - p.a0 + 2 * MARGIN;
  const H = CH + 2 * MARGIN;
  return { repeat: [W / tileU, H / tileV], offset: [(p.a0 - MARGIN - shiftU) / tileU, (-MARGIN - shiftV) / tileV] };
}
// Where the paper scan is anchored on each wall, and which board comes first.
export const paperShift = (side) => (side < 0 ? [0.31, 0.2] : side > 0 ? [1.47, 1.1] : [0.9, 0.55]);
export const plankShift = (side) => (side < 0 ? 0 : side > 0 ? 7 * PLANK : 13 * PLANK);
// The along-wall coordinate the dirt is a function of: s on the side walls, and somewhere of its
// own for the end wall.
const along = (p, a) => (p.side === 0 ? 60 + a : a);

// Where pictures hung: the paper under them kept its colour while the rest went brown.
export const GHOSTS = [
  { side: -1, s: 9.75, y: 1.6, w: 0.6, h: 0.5 },
  { side: 1, s: 14.55, y: 1.58, w: 0.5, h: 0.42 },
  { side: 1, s: 21.05, y: 1.56, w: 0.62, h: 0.48 },
  { side: -1, s: 25.0, y: 1.6, w: 0.5, h: 0.42 },
  { side: 1, s: 1.3, y: 1.62, w: 0.36, h: 0.46 },
  { side: -1, s: 16.9, y: 1.55, w: 0.42, h: 0.56 },
  { side: 1, s: 24.3, y: 1.6, w: 0.3, h: 0.4 },
];

// Dirt on the wallpaper as a colour multiplier, for a point of a wall.
function paperDirt(side, s, y) {
  const q = side * 17.3 + 3.1;
  const c = [1, 1, 1];
  // uneven fading at every scale
  let k = 0.84 + 0.2 * fbm(s * 0.35 + q, y * 0.6, 11, 4);
  k *= 0.93 + 0.14 * fbm(s * 2.3 + q, y * 2.3, 17, 3);
  k *= 0.96 + 0.08 * fbm(s * 9 + q, y * 9, 19, 2);
  c[0] = c[1] = c[2] = k;
  // where a picture hung the paper kept its colour; everywhere else it has gone brown with
  // forty years of cigarettes, more towards the ceiling
  let ghost = 0;
  for (const gh of GHOSTS) {
    if (gh.side !== side) continue;
    const e = 0.008;
    ghost = Math.max(ghost, smooth(gh.w / 2 + e, gh.w / 2 - e, Math.abs(s - gh.s)) * smooth(gh.h / 2 + e, gh.h / 2 - e, Math.abs(y - gh.y)));
  }
  const tar = (0.32 + 0.68 * smooth(1.1, CH, y)) * (0.55 + 0.9 * fbm(s * 0.3 + q, 3.1, 43, 3));
  mul(c, tar * (1 - 0.7 * ghost), 0.86, 0.75, 0.55);
  // soot and dust under the cornice
  mul(c, smooth(CH - 0.5, CH - 0.1, y) * (0.45 + 0.55 * fbm(s * 1.3 + q, 7, 47, 3)), 0.46, 0.43, 0.38);
  // the band above the rail: hands, shoulders, mops, trolleys
  mul(c, smooth(DADO + 0.34, DADO + 0.03, y) * (0.3 + 0.7 * fbm(s * 1.7 + q, y * 3, 53, 3)), 0.6, 0.55, 0.48);
  // water from the ceiling: where the roof let it in it ran down the paper, spread and dried,
  // leaving a brown field with a darker tide line at its edge, runs inside it and mould at the top
  const L = smooth(0.5, 0.7, fbm(s * 0.5 + q, 0.5, 23, 3));
  if (L > 0) {
    const reach = 0.3 + 1.3 * L * (0.35 + 0.65 * fbm(s * 2.2 + q, 1.5, 27, 2));
    const yEnd = CH - 0.1 - reach;
    const wet = L * smooth(yEnd, yEnd + 0.5, y) + 0.5 * (fbm(s * 5 + q, y * 1.6, 29, 4) - 0.5);
    const inside = smooth(0.3, 0.36, wet);
    const tide = Math.exp(-Math.pow((wet - 0.33) / 0.03, 2));
    const tide2 = Math.exp(-Math.pow((wet - 0.56) / 0.025, 2)) * smooth(0.45, 0.6, fbm(s * 3 + q, y * 3, 33, 3));
    const run = smooth(0.5, 0.75, fbm(s * 38 + q, y * 0.7, 31, 3));
    mul(c, inside * 0.5, 0.88, 0.78, 0.58);
    mul(c, inside * run * 0.2, 0.74, 0.62, 0.45);
    mul(c, tide * 0.55, 0.56, 0.44, 0.28);
    mul(c, tide2 * 0.35, 0.62, 0.5, 0.34);
    const mould = inside * smooth(0.52, 0.78, fbm(s * 16 + q, y * 16, 61, 3)) * smooth(1.6, 2.45, y);
    mul(c, mould * 0.2, 0.5, 0.52, 0.45);
  }
  // a damp patch in the middle of a wall, where a pipe runs behind it
  const patch = fbm(s * 0.8 + q + 9, y * 1.0 + 3, 57, 4) + 0.1 * (fbm(s * 6 + q, y * 6, 59, 3) - 0.5);
  mul(c, smooth(0.655, 0.685, patch) * 0.26, 0.8, 0.7, 0.54);
  mul(c, Math.exp(-Math.pow((patch - 0.67) / 0.007, 2)) * 0.36, 0.58, 0.47, 0.32);
  // shoulders and trolleys: a rubbed, greasy band about 1.35 m up, here and there
  mul(c, Math.exp(-Math.pow((y - 1.36 - 0.05 * fbm(s * 0.6 + q, 2, 73, 2)) / 0.075, 2)) * smooth(0.45, 0.62, fbm(s * 0.45 + q, 6, 75, 3)) * 0.34, 0.62, 0.56, 0.48);
  // where two walls meet, the paper is cut into the corner and the corner holds the dirt
  {
    const corner = side === 0 ? HW - Math.abs(s - 60) : END - s;
    mul(c, 0.62 * smooth(0.035, 0.0, corner) + 0.2 * smooth(0.14, 0.0, corner), 0.38, 0.34, 0.28);
  }
  // grime at hand height beside every door
  for (const d of side === 0 ? [{ side: 0, s: 60 - DOOR.w / 2 }] : DOORS) {
    if (d.side !== side) continue;
    for (const edge of [d.s - 0.1, d.s + DOOR.w + 0.1]) {
      const dx = (s - edge) / 0.2;
      const dy = (y - 1.15) / 0.42;
      const e = dx * dx + dy * dy;
      if (e < 6) mul(c, 0.55 * Math.exp(-e) * (0.5 + fbm(s * 8, y * 8, 71, 2)), 0.42, 0.37, 0.3);
    }
  }
  return c;
}

// Dirt on the wainscot.
function woodDirt(side, s, y) {
  const q = side * 9.7 + 1.3;
  const c = [1, 1, 1];
  let k = 0.74 + 0.36 * fbm(s * 0.6 + q, y * 1.6, 51, 3);
  k *= 0.88 + 0.24 * fbm(s * 4 + q, y * 4, 55, 2);
  c[0] = c[1] = c[2] = k;
  // kicked, mopped and never dried at the bottom: grey and dark
  mul(c, smooth(0.5, 0.12, y) * (0.45 + 0.55 * fbm(s * 1.1 + q, 2.2, 63, 3)), 0.42, 0.43, 0.44);
  // a tide line left by the mop water
  mul(c, Math.exp(-Math.pow((y - 0.2 - 0.07 * fbm(s * 1.5 + q, 1, 65, 3)) / 0.012, 2)) * 0.35 * smooth(0.35, 0.6, fbm(s * 0.9 + q, 4, 67, 2)), 0.6, 0.6, 0.58);
  // hands along the top, under the rail
  mul(c, smooth(DADO - 0.28, DADO - 0.03, y) * 0.5 * fbm(s * 2.1 + q, 5, 69, 3), 0.5, 0.46, 0.42);
  for (const d of DOORS) {
    if (d.side !== side) continue;
    for (const edge of [d.s - 0.1, d.s + DOOR.w + 0.1]) {
      const dx = (s - edge) / 0.18;
      if (Math.abs(dx) < 2.5) mul(c, 0.4 * Math.exp(-dx * dx), 0.5, 0.48, 0.46);
    }
  }
  return c;
}

// The printed design of the paper, as a multiplier (white leaves the scan as it is): small
// sprigs in a half-drop on a plain ground and a pair of pin lines to each 53 cm length, the ink
// faded. No broad stripes: under these lamps a striped wall reads as boards.
function printTile() {
  const S = 848;
  const mm = S / 530;
  const c = canvas(S);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  const unit = 132.5 * mm;
  const drop = S / 3;
  for (let k = 0; k < 4; k++) {
    const cx = (k + 0.5) * unit;
    for (let y = (k % 2 ? 0.5 : 0) * drop - drop; y < S + drop; y += drop) {
      sprig(g, cx, y, mm * 1.25, 'rgb(180,172,150)');
      // a dot between the sprigs
      g.fillStyle = 'rgb(186,178,156)';
      g.beginPath();
      g.arc(cx, y + drop / 2, 2.2 * mm, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = 'rgb(214,204,190)';
  g.fillRect(0.5 * unit - 67 * mm, 0, 1.2 * mm, S);
  g.fillRect(2.5 * unit - 67 * mm, 0, 1.2 * mm, S);
  return c;
}
// A small damask sprig, about 34 x 48 mm: a pointed bud on a stem between two curling leaves.
function sprig(ctx, cx, cy, mm, fillStyle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(mm, mm);
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.bezierCurveTo(6.5, -16, 6, -6, 0, -1);
  ctx.bezierCurveTo(-6, -6, -6.5, -16, 0, -24);
  ctx.fill();
  ctx.fillRect(-0.7, -2, 1.4, 20);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(s * 5, 1, s * 13, -1, s * 17, -9);
    ctx.bezierCurveTo(s * 14, -2, s * 12, 6, s * 3, 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.bezierCurveTo(s * 4, 11, s * 9, 12, s * 11, 17);
    ctx.bezierCurveTo(s * 7, 16, s * 4, 17, 0, 16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 3.4, 21.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Marks that are placed once for a whole wall (so one that crosses a panel joint is drawn in
// both panels): scratches, scuffs, spots, torn patches.
function wallMarks(side) {
  const r = mulberry(7000 + Math.round((side + 2) * 131));
  const len = side === 0 ? 2 * HW : END - START;
  const at = () => (side === 0 ? 60 - HW : START) + r() * len;
  const marks = { scratches: [], spots: [], tears: [], smudges: [], kicks: [], scrapes: [] };
  const n = side === 0 ? 0.08 : 1;
  for (let i = 0; i < 44 * n; i++) marks.scratches.push({ s: at(), y: DADO + 0.05 + r() * 1.1, len: 0.02 + Math.pow(r(), 2) * 0.2, tilt: (r() - 0.5) * 0.8, pale: r() < 0.4, a: 0.08 + 0.2 * r(), w: 0.0005 + r() * 0.0009 });
  for (let i = 0; i < 260 * n; i++) marks.spots.push({ s: at(), y: DADO + 0.02 + Math.pow(r(), 0.7) * (CH - DADO - 0.1), rad: 0.0012 + Math.pow(r(), 3) * 0.012, a: 0.15 + 0.45 * r(), seed: i });
  for (let i = 0; i < 0; i++) marks.tears.push({ s: at(), y: DADO + 0.08 + r() * 1.2, rx: 0.012 + Math.pow(r(), 2) * 0.06, ry: 0.01 + Math.pow(r(), 2) * 0.045, seed: i * 7 + 3 });
  for (let i = 0; i < 26 * n; i++) marks.smudges.push({ s: at(), y: 0.98 + r() * 0.6, len: 0.15 + r() * 0.7, h: 0.012 + r() * 0.04, a: 0.08 + 0.16 * r() });
  // on the wainscot: black rubber and pale cuts at shoe and suitcase height, and the long
  // scrapes a trolley leaves at the height of its shelves
  for (let i = 0; i < 420 * n; i++) marks.kicks.push({ s: at(), y: 0.14 + Math.pow(r(), 1.6) * 0.42, len: 0.02 + r() * 0.16, tilt: (r() - 0.5) * 0.5, pale: r() < 0.45, a: 0.25 + 0.5 * r(), w: 0.0008 + r() * (r() < 0.2 ? 0.006 : 0.002) });
  for (let i = 0; i < 46 * n; i++) marks.scrapes.push({ s: at(), y: [0.24, 0.6, 0.86][Math.floor(r() * 3)] + (r() - 0.5) * 0.05, len: 0.3 + r() * 1.6, a: 0.2 + 0.4 * r(), w: 0.001 + r() * 0.003, wob: r() * 9 });
  return marks;
}
const MARKS = {};
const marksFor = (side) => (MARKS[side] ??= wallMarks(side));

// One wall panel's albedo: wallpaper above the rail, boards below it.
// src: { paper, paperAlt, print, cab2, plaster } canvases.
export function wallAlbedo(p, S, src) {
  const c = canvas(S);
  const g = c.getContext('2d');
  const W = p.a1 - p.a0 + 2 * MARGIN;
  const H = CH + 2 * MARGIN;
  const kx = S / W;
  const ky = S / H;
  const left = p.a0 - MARGIN;
  // draw in metres: x along the wall, y up from the floor
  const world = (ctx) => ctx.setTransform(kx, 0, 0, -ky, -left * kx, S - MARGIN * ky);
  const pixels = (ctx) => ctx.setTransform(1, 0, 0, 1, 0, 0);
  const side = p.side;
  const sOf = (a) => along(p, a);
  const [shU, shV] = paperShift(side);

  // --- the paper: the scan at its true scale, upright, anchored to the wall -------------------
  world(g);
  const pat = g.createPattern(src.paper, 'repeat');
  pat.setTransform(new DOMMatrix().translate(shU, shV).scale(PAPER_TILE / src.paper.width, -PAPER_TILE / src.paper.height));
  g.fillStyle = pat;
  g.fillRect(left, DADO - 0.02, W, H);
  // a second lay of the same scan, turned over and shifted, let through in slow patches: the eye
  // finds no 2.5 m repeat
  {
    const t = canvas(S);
    const tg = t.getContext('2d');
    world(tg);
    const pat2 = tg.createPattern(src.paper, 'repeat');
    pat2.setTransform(new DOMMatrix().translate(shU + 1.13, shV + 0.71).scale(-PAPER_TILE / src.paper.width, -PAPER_TILE / src.paper.height));
    tg.fillStyle = pat2;
    tg.fillRect(left, DADO - 0.02, W, H);
    pixels(tg);
    tg.globalCompositeOperation = 'destination-in';
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(field(96, 96, (u, v) => {
      const s = sOf(left + u * W);
      const y = (1 - v) * H - MARGIN;
      return [0, 0, 0, smooth(0.42, 0.6, fbm(s * 0.7 + side * 3.3, y * 0.8, 131, 3))];
    }), 0, 0, S, S);
    pixels(g);
    g.drawImage(t, 0, 0);
  }
  // --- the print, and the lengths: each from its own roll, each faded its own way --------------
  world(g);
  g.globalCompositeOperation = 'multiply';
  const pr = g.createPattern(src.print, 'repeat');
  pr.setTransform(new DOMMatrix().scale(SEAM / src.print.width, -SEAM / src.print.height));
  g.fillStyle = pr;
  g.fillRect(left, DADO - 0.02, W, H);
  const n0 = Math.floor(left / SEAM) - 1;
  const n1 = Math.ceil((left + W) / SEAM) + 1;
  for (let n = n0; n <= n1; n++) {
    const h = hash2(n, side + 5, 911);
    const h2 = hash2(n, side + 5, 913);
    const k = 0.965 + 0.035 * h;
    g.fillStyle = `rgb(${255 * k},${255 * k * (0.98 + 0.02 * h2)},${255 * k * (0.94 + 0.06 * h2)})`;
    g.fillRect(n * SEAM, DADO - 0.02, SEAM, H);
  }
  g.globalCompositeOperation = 'source-over';

  // --- the boards of the wainscot ----------------------------------------------------------------
  {
    const pw = src.cab2.width / 20; // one board in the doubled scan
    const off = Math.round(plankShift(side) / PLANK);
    const b0 = Math.floor(left / PLANK) - 1;
    const b1 = Math.ceil((left + W) / PLANK) + 1;
    for (let n = b0; n <= b1; n++) {
      const which = PLANK_ORDER[(((n + off) % 20) + 20) % 20];
      g.save();
      g.translate(n * PLANK, DADO);
      g.scale(1, -1);
      g.drawImage(src.cab2, (0.032 + 0.1 * which) * (src.cab2.width / 2), 0, pw, src.cab2.height, 0, 0, PLANK + 0.0006, DADO + 0.02);
      // no two boards took the stain alike
      const k = 0.72 + 0.28 * hash2(n, side + 9, 921);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${255 * k},${250 * k},${244 * k})`;
      g.fillRect(0, 0, PLANK, DADO + 0.02);
      g.restore();
    }
  }

  // --- dirt, water, nicotine: one slow field over the whole panel ---------------------------------
  pixels(g);
  g.globalCompositeOperation = 'multiply';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const FW = 512;
  g.drawImage(field(FW, FW, (u, v) => {
    const a = left + u * W;
    const y = (1 - v) * H - MARGIN;
    return y >= DADO ? paperDirt(side, sOf(a), y) : woodDirt(side, sOf(a), y);
  }), 0, 0, S, S);
  g.globalCompositeOperation = 'source-over';

  // --- seams between the lengths ------------------------------------------------------------------
  world(g);
  for (let n = n0; n <= n1; n++) {
    const x = n * SEAM;
    const open = hash2(n, side + 2, 931); // how far this seam has opened
    // dirt gathered either side of it
    const halo = g.createLinearGradient(x - 0.012, 0, x + 0.012, 0);
    halo.addColorStop(0, 'rgba(40,30,18,0)');
    halo.addColorStop(0.5, `rgba(40,30,18,${0.1 + 0.16 * open})`);
    halo.addColorStop(1, 'rgba(40,30,18,0)');
    g.fillStyle = halo;
    g.fillRect(x - 0.012, DADO, 0.024, CH - DADO);
    // the joint itself: a hairline that opens and closes on the way up
    for (let y = DADO; y < CH; y += 0.02) {
      const v = fbm(n * 3.7 + side, y * 2.2, 933, 3);
      const gap = Math.max(0, v - 0.42 + 0.25 * open);
      const w = 0.0007 + 0.006 * gap * gap * 4;
      const wob = 0.0012 * (noise2(n * 5.1, y * 9, 935) - 0.5);
      g.fillStyle = `rgba(22,16,10,${0.25 + 0.6 * clamp(gap * 3, 0, 1)})`;
      g.fillRect(x - w / 2 + wob, y, w, 0.0205);
      if (gap > 0.16) {
        // one edge has lifted and catches the light; the plaster shows in the gap
        g.fillStyle = `rgba(150,140,124,${0.55 * clamp((gap - 0.16) * 6, 0, 1)})`;
        g.fillRect(x - w * 0.22 + wob, y, w * 0.44, 0.0205);
        g.fillStyle = `rgba(214,200,170,${0.3 * clamp((gap - 0.16) * 6, 0, 1)})`;
        g.fillRect(x + w / 2 + wob, y, 0.0016, 0.0205);
      }
    }
    // a corner come away at the rail or under the cornice: a triangle of plaster, the paper
    // curled back and pale at its edge
    if (hash2(n, side + 4, 937) < 0.22) {
      const top = hash2(n, side + 4, 939) < 0.45;
      const dir = hash2(n, side + 4, 941) < 0.5 ? 1 : -1;
      const w = 0.012 + 0.03 * hash2(n, side, 943);
      const h = 0.03 + 0.08 * hash2(n, side, 945);
      const y0 = top ? CH - 0.115 : DADO + 0.032;
      const sy = top ? -1 : 1;
      g.fillStyle = 'rgb(92,86,74)';
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + dir * w, y0);
      g.quadraticCurveTo(x + dir * w * 0.35, y0 + sy * h * 0.3, x, y0 + sy * h);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(176,164,136,0.6)';
      g.lineWidth = 0.0028;
      g.beginPath();
      g.moveTo(x + dir * w, y0);
      g.quadraticCurveTo(x + dir * w * 0.35, y0 + sy * h * 0.3, x, y0 + sy * h);
      g.stroke();
      g.strokeStyle = 'rgba(16,11,7,0.55)';
      g.lineWidth = 0.0016;
      g.beginPath();
      g.moveTo(x + dir * (w + 0.003), y0);
      g.quadraticCurveTo(x + dir * (w * 0.35 + 0.004), y0 + sy * h * 0.3, x, y0 + sy * (h + 0.004));
      g.stroke();
    }
  }

  // --- marks ------------------------------------------------------------------------------------
  const M = marksFor(side);
  const vis = (s, pad) => s > sOf(left) - pad && s < sOf(left + W) + pad;
  const ax = (s) => (p.side === 0 ? s - 60 : s);
  g.lineCap = 'round';
  for (const gh of GHOSTS) {
    if (gh.side !== side || !vis(gh.s, 1)) continue;
    const x = ax(gh.s);
    // the line of dust along where the top of the frame was, the faint edges, the nail hole
    g.fillStyle = 'rgba(34,26,16,0.42)';
    g.fillRect(x - gh.w / 2 - 0.003, gh.y + gh.h / 2, gh.w + 0.006, 0.006);
    g.fillStyle = 'rgba(34,26,16,0.16)';
    g.fillRect(x - gh.w / 2 - 0.004, gh.y - gh.h / 2, 0.005, gh.h);
    g.fillRect(x + gh.w / 2 - 0.001, gh.y - gh.h / 2, 0.005, gh.h);
    g.fillStyle = 'rgba(150,140,120,0.6)';
    g.beginPath();
    g.arc(x + 0.01, gh.y + gh.h / 2 + 0.07, 0.006, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(12,9,6,0.95)';
    g.beginPath();
    g.arc(x + 0.01, gh.y + gh.h / 2 + 0.07, 0.0028, 0, Math.PI * 2);
    g.fill();
  }
  for (const m of M.smudges) {
    if (!vis(m.s, 1)) continue;
    const x = ax(m.s);
    const gr = g.createLinearGradient(x, 0, x + m.len, 0);
    gr.addColorStop(0, 'rgba(30,24,16,0)');
    gr.addColorStop(0.3, `rgba(30,24,16,${m.a})`);
    gr.addColorStop(1, 'rgba(30,24,16,0)');
    g.fillStyle = gr;
    g.fillRect(x, m.y, m.len, m.h);
  }
  for (const m of M.tears) {
    if (!vis(m.s, 0.2)) continue;
    const x = ax(m.s);
    // the paper is gone: the grey plaster under it, the torn edge of the paper pale round it
    blobPath(g, x, m.y, m.rx * 1.12, m.ry * 1.12, 0.3, m.seed);
    g.fillStyle = 'rgba(196,184,158,0.75)';
    g.fill();
    blobPath(g, x, m.y - 0.0015, m.rx, m.ry, 0.34, m.seed + 1);
    g.fillStyle = 'rgb(112,106,96)';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = 'rgba(14,10,7,0.5)';
    g.fillRect(x - m.rx * 1.5, m.y + m.ry * 0.55, m.rx * 3, m.ry);
    g.restore();
  }
  for (const m of M.scratches) {
    if (!vis(m.s, 0.4)) continue;
    const x = ax(m.s);
    g.strokeStyle = m.pale ? `rgba(196,186,162,${m.a})` : `rgba(26,20,13,${m.a})`;
    g.lineWidth = m.w;
    g.beginPath();
    g.moveTo(x, m.y);
    g.quadraticCurveTo(x + m.len * 0.5, m.y + m.len * m.tilt * 0.4, x + m.len, m.y + m.len * m.tilt);
    g.stroke();
  }
  for (const m of M.spots) {
    if (!vis(m.s, 0.1)) continue;
    blobPath(g, ax(m.s), m.y, m.rad, m.rad * (0.7 + 0.6 * hash2(m.seed, 1, 951)), 0.3, m.seed);
    g.fillStyle = `rgba(34,25,15,${m.a})`;
    g.fill();
  }
  for (const m of M.scrapes) {
    if (!vis(m.s, 2.2)) continue;
    const x = ax(m.s);
    g.lineWidth = m.w;
    const yy = (t) => m.y + 0.012 * Math.sin(t * 2.1 + m.wob) + 0.005 * (fbm(t * 6, m.wob, 963, 2) - 0.5);
    for (let t = 0; t < m.len; t += 0.03) {
      // it skips: the edge of a shelf touches, lifts, touches again
      const v = noise2(t * 7 + m.wob, m.wob, 961);
      if (v < 0.45) continue;
      g.strokeStyle = `rgba(140,118,96,${m.a * 0.6 * clamp((v - 0.45) * 4, 0, 1)})`;
      g.beginPath();
      g.moveTo(x + t, yy(t));
      g.lineTo(x + t + 0.031, yy(t + 0.03));
      g.stroke();
    }
  }
  for (const m of M.kicks) {
    if (!vis(m.s, 0.3)) continue;
    const x = ax(m.s);
    g.strokeStyle = m.pale ? `rgba(158,132,104,${m.a * 0.8})` : `rgba(8,7,6,${m.a})`;
    g.lineWidth = m.pale ? Math.min(m.w, 0.0016) : m.w;
    g.beginPath();
    g.moveTo(x, m.y);
    g.quadraticCurveTo(x + m.len * 0.5, m.y + m.len * m.tilt * 0.3, x + m.len, m.y + m.len * m.tilt);
    g.stroke();
  }
  pixels(g);
  return c;
}

// The normal and roughness of the wainscot: the boards in the same order as in the albedo, one
// period (twenty boards) long. Returns a canvas for a scan of the boards (already doubled).
export function wainscotTile(scan2, S = 2048) {
  const c = canvas(S, S / 4);
  const g = c.getContext('2d');
  const pw = scan2.width / 20;
  const w = S / PLANK_ORDER.length;
  PLANK_ORDER.forEach((which, i) => g.drawImage(scan2, (0.032 + 0.1 * which) * (scan2.width / 2), 0, pw, scan2.height, i * w, 0, w + 0.5, c.height));
  return c;
}
// A scan drawn twice side by side, so a board that straddles its edge can be cut out whole.
export function doubled(img, filter = 'none') {
  const c = canvas(img.width * 2, img.height);
  const g = c.getContext('2d');
  g.filter = filter;
  g.drawImage(img, 0, 0);
  g.drawImage(img, img.width, 0);
  g.filter = 'none';
  return c;
}
export { printTile };

// ================================================================================================
// Carpet runner
// ================================================================================================
// A woven red runner with a dark stripe down each side, the kind every hotel of the time had,
// 1.2 m wide. Forty years of feet have worn a pale path down its middle and a bald patch in
// front of every door; the edges, where nobody walks, kept their colour and took the dirt.
export const CARPET_PANELS = 16; // 1.87 m each: 0.9 mm a texel along the runner, so the weave is in the albedo
export const CARPET_FROM = START + 0.3;
export const CARPET_TO = END - 0.015; // it runs up to the last door
export const CARPET_LEN = (CARPET_TO - CARPET_FROM) / CARPET_PANELS;
export const CARPET_TILE = 0.4; // the scan covers 40 cm
const CM = 0.01;
export const carpetPanel = (k) => ({ k, s0: CARPET_FROM + k * CARPET_LEN, s1: CARPET_FROM + (k + 1) * CARPET_LEN });
export const carpetIndex = (s) => clamp(Math.floor((s - CARPET_FROM) / CARPET_LEN), 0, CARPET_PANELS - 1);
export const carpetUV = (p, x, s) => [(x + RUNNER + CM) / (2 * RUNNER + 2 * CM), (s - p.s0 + CM) / (p.s1 - p.s0 + 2 * CM)];
export function carpetTransform(p) {
  const W = 2 * RUNNER + 2 * CM;
  const L = p.s1 - p.s0 + 2 * CM;
  return { repeat: [W / CARPET_TILE, L / CARPET_TILE], offset: [(-RUNNER - CM) / CARPET_TILE, (p.s0 - CM) / CARPET_TILE] };
}
// How worn the pile is at a point, 0..1.
export function carpetWear(x, s) {
  const wander = 0.07 * Math.sin(s * 0.7 + 1) + 0.04 * Math.sin(s * 1.9);
  let a = 0.95 * Math.exp(-Math.pow((x - wander) / 0.21, 2)) * (0.15 + 1.3 * fbm(x * 3, s * 1.2, 91, 3));
  for (const d of DOORS) {
    const ds = (s - d.s - DOOR.w / 2) / 0.34;
    if (Math.abs(ds) > 2.5) continue;
    a += 0.75 * Math.exp(-Math.pow((x - d.side * 0.34) / 0.2, 2) - ds * ds) * (0.4 + 0.9 * fbm(x * 7, s * 7, 93, 3));
  }
  a += 0.8 * Math.exp(-Math.pow(x / 0.3, 2) - Math.pow((s - END + 0.55) / 0.3, 2)) * (0.4 + 0.9 * fbm(x * 7, s * 7, 95, 3));
  return clamp(a, 0, 0.85);
}
function carpetDirt(x, s) {
  const c = [1, 1, 1];
  let k = 0.62 + 0.6 * fbm(x * 0.9, s * 0.35, 193, 4);
  k *= 0.8 + 0.4 * fbm(x * 5, s * 5, 195, 3);
  k *= 0.9 + 0.2 * fbm(x * 22, s * 22, 199, 2); // trodden-in grit
  c[0] = c[1] = c[2] = k;
  // dirt collects where nobody walks
  mul(c, smooth(RUNNER - 0.26, RUNNER - 0.02, Math.abs(x)) * (0.55 + 0.6 * fbm(x * 2, s * 1.4, 197, 2)), 0.3, 0.3, 0.31);
  // old stains: soaked in, darker at the rim where they dried
  const f = fbm(x * 1.7 + 9, s * 1.1, 97, 4) + 0.08 * (fbm(x * 9, s * 9, 99, 2) - 0.5);
  mul(c, smooth(0.66, 0.76, f) * 0.3, 0.62, 0.58, 0.55);
  mul(c, Math.exp(-Math.pow((f - 0.675) / 0.012, 2)) * 0.16, 0.5, 0.45, 0.42);
  const f2 = fbm(x * 4.5 + 3, s * 4.5, 101, 3);
  mul(c, smooth(0.72, 0.82, f2) * 0.25, 0.6, 0.56, 0.53);
  return c;
}
// src: { carpet } canvas (the scan, graded).
export function carpetAlbedo(p, S, src) {
  const c = canvas(S);
  const g = c.getContext('2d');
  const W = 2 * RUNNER + 2 * CM;
  const L = p.s1 - p.s0 + 2 * CM;
  const kx = S / W;
  const ky = S / L;
  const world = (ctx) => ctx.setTransform(kx, 0, 0, -ky, (RUNNER + CM) * kx, S + (p.s0 - CM) * ky);
  const pixels = (ctx) => ctx.setTransform(1, 0, 0, 1, 0, 0);
  world(g);
  const pat = g.createPattern(src.carpet, 'repeat');
  pat.setTransform(new DOMMatrix().scale(CARPET_TILE / src.carpet.width, -CARPET_TILE / src.carpet.height));
  g.fillStyle = pat;
  g.fillRect(-RUNNER - CM, p.s0 - CM, W, L);
  // the stripes down each side: two dark green bands between ochre lines, the binding outside
  g.globalCompositeOperation = 'multiply';
  for (const sx of [-1, 1]) {
    // woven, so never ruled: each band wanders a few millimetres and swells and thins along its length
    const band = (x0, x1, col) => {
      g.fillStyle = col;
      for (let s = p.s0 - CM; s < p.s1 + CM; s += 0.04) {
        const j = 0.005 * (fbm(s * 0.9, x0 * 7 + sx, 187, 3) - 0.5) + 0.002 * (noise2(s * 14, x0 * 9 + sx, 189) - 0.5);
        const w = (x1 - x0) * (0.9 + 0.2 * noise2(s * 3, x1 * 5 + sx, 185));
        g.fillRect((sx > 0 ? x0 : -x1) + j, s, w, 0.0405);
      }
    };
    band(0.395, 0.41, 'rgb(150,144,120)');
    band(0.43, 0.5, 'rgb(96,104,82)');
    band(0.515, 0.535, 'rgb(124,126,100)');
    band(0.585, 0.62, 'rgb(84,78,72)');
  }
  g.globalCompositeOperation = 'source-over';
  for (const sx of [-1, 1]) {
    // the ochre lines are woven, not ruled: a little uneven in strength along their length
    for (let s = p.s0 - CM; s < p.s1 + CM; s += 0.05) {
      const k = 0.14 + 0.2 * fbm(s * 1.3, sx * 3, 191, 3);
      const j = 0.005 * (fbm(s * 0.9, 3 + sx, 187, 3) - 0.5);
      g.fillStyle = `rgba(150,118,62,${k * 0.7})`;
      g.fillRect((sx > 0 ? 0.415 : -0.423) + j, s, 0.008, 0.0505);
      g.fillRect((sx > 0 ? 0.505 : -0.512) + j, s, 0.007, 0.0505);
    }
  }
  // dirt and stains
  pixels(g);
  g.imageSmoothingQuality = 'high';
  g.globalCompositeOperation = 'multiply';
  g.drawImage(field(256, 768, (u, v) => carpetDirt(-RUNNER - CM + u * W, p.s0 - CM + (1 - v) * L)), 0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  // wear: the pile trodden flat and dark with dirt down the lane, down to the backing where it is worst
  g.drawImage(field(256, 768, (u, v) => [0.1, 0.082, 0.074, 0.7 * carpetWear(-RUNNER - CM + u * W, p.s0 - CM + (1 - v) * L)]), 0, 0, S, S);
  // lint and grit: along the edges and anywhere the vacuum never reached; a few burns
  world(g);
  const r = mulberry(8800 + p.k);
  const n = Math.round(110 * (p.s1 - p.s0));
  for (let i = 0; i < n; i++) {
    const edge = r() < 0.7;
    const x = (r() < 0.5 ? -1 : 1) * (edge ? RUNNER - 0.1 * Math.pow(r(), 2) : r() * RUNNER);
    const s = p.s0 + r() * (p.s1 - p.s0);
    const k = r();
    g.fillStyle = k < 0.5 ? `rgba(128,118,106,${0.15 + 0.3 * r()})` : `rgba(14,12,10,${0.3 + 0.4 * r()})`;
    const w = 0.001 + r() * 0.0035;
    g.fillRect(x, s, w, w * (0.6 + r() * 2.5));
  }
  for (let i = 0; i < 3; i++) {
    const x = (r() - 0.5) * 0.9;
    const s = p.s0 + r() * (p.s1 - p.s0);
    g.fillStyle = 'rgba(40,26,16,0.5)';
    g.beginPath();
    g.arc(x, s, 0.007, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(8,6,5,0.85)';
    g.beginPath();
    g.arc(x, s, 0.0036, 0, Math.PI * 2);
    g.fill();
  }
  pixels(g);
  return c;
}

// ================================================================================================
// Door leaves
// ================================================================================================
// A leaf is framed: two stiles with the grain upright, three rails with the grain across, two
// panels. The skin is the corridor face of one leaf, 0.853 x 2.03 m, with the handle on the left
// (a leaf whose handle is on the right uses it mirrored).
const LW = DOOR.w - 0.007;
const STILE = 0.108;
const YS = [0.014, 0.21, 0.88, 1.035, DOOR.h - 0.004 - 0.112, DOOR.h - 0.004];
export const DOOR_TILE = 0.8; // the scan covers 1.5 m; laid at half scale its figure is the size of a door's
const HANDLE = { x: -(LW / 2 - 0.058), y: 1.0 };
export const doorUV = (x, y, handleSide) => [(handleSide < 0 ? x + LW / 2 : LW / 2 - x) / LW, y / DOOR.h];

// src: { door } canvas (the scan, graded). opts: { grime 0..1, kicked 0..1 }.
export function doorSkin(seed, S, src, { grime = 0.5, kicked = 0.5 } = {}) {
  const c = canvas(S);
  const g = c.getContext('2d');
  const kx = S / LW;
  const ky = S / DOOR.h;
  const world = (ctx) => ctx.setTransform(kx, 0, 0, -ky, (LW / 2) * kx, S);
  const pixels = (ctx) => ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r = mulberry(seed * 977 + 5);
  const x0 = -LW / 2;
  const x1 = LW / 2;
  const px0 = x0 + STILE;
  const px1 = x1 - STILE;
  world(g);
  // one piece of wood: a rectangle of the scan, grain upright or across, in its own tone
  const k = DOOR_TILE / src.door.width;
  const piece = (a, b, cc, d, across) => {
    g.save();
    g.beginPath();
    g.rect(a, b, cc - a, d - b);
    g.clip();
    const pat = g.createPattern(src.door, 'repeat');
    const m = new DOMMatrix().translate(r() * 3, r() * 3);
    pat.setTransform(across ? m.rotate(90).scale(k, -k) : m.scale(k, -k));
    g.fillStyle = pat;
    g.fillRect(a, b, cc - a, d - b);
    const t = 0.78 + 0.26 * r();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${255 * t},${255 * t * (0.95 + 0.05 * r())},${255 * t * (0.9 + 0.1 * r())})`;
    g.fillRect(a, b, cc - a, d - b);
    g.restore();
  };
  piece(x0, 0, px0, DOOR.h, false);
  piece(px1, 0, x1, DOOR.h, false);
  piece(px0, 0, px1, YS[1], true);
  piece(px0, YS[2], px1, YS[3], true);
  piece(px0, YS[4], px1, DOOR.h, true);
  piece(px0, YS[1], px1, YS[2], false);
  piece(px0, YS[3], px1, YS[4], false);
  // the joints of the frame, opened a hair and full of dirt
  g.strokeStyle = 'rgba(10,6,4,0.6)';
  g.lineWidth = 0.0011;
  for (const y of [YS[1], YS[2], YS[3], YS[4]]) {
    g.beginPath();
    g.moveTo(px0, y);
    g.lineTo(px1, y);
    g.stroke();
  }
  for (const [a, b] of [[0, YS[1]], [YS[2], YS[3]], [YS[4], DOOR.h]]) {
    for (const x of [px0, px1]) {
      g.beginPath();
      g.moveTo(x, a);
      g.lineTo(x, b);
      g.stroke();
    }
  }
  // dirt lies in the mouldings: dark in the corner of every bevel, dust on the ledge that faces up
  for (const [a, b] of [[YS[1], YS[2]], [YS[3], YS[4]]]) {
    g.strokeStyle = 'rgba(8,5,3,0.06)';
    g.lineWidth = 0.014;
    g.strokeRect(px0 + 0.02, a + 0.02, px1 - px0 - 0.04, b - a - 0.04);
    g.strokeStyle = 'rgba(8,5,3,0.04)';
    g.lineWidth = 0.008;
    g.strokeRect(px0 + 0.074, a + 0.074, px1 - px0 - 0.148, b - a - 0.148);
    // every ledge that faces up holds a line of dark dust (a pale ledge under a ceiling lamp
    // reads as a strip light): the lower bevel of the panel and the top chamfer of its raised field
    {
      // (a soft band, never a ruled bar)
      const band = (y0, h, al, xa, xb) => {
        const gr = g.createLinearGradient(0, y0, 0, y0 + h);
        gr.addColorStop(0, 'rgba(16,12,9,0)');
        gr.addColorStop(0.5, `rgba(16,12,9,${al})`);
        gr.addColorStop(1, 'rgba(16,12,9,0)');
        g.fillStyle = gr;
        g.fillRect(xa, y0, xb - xa, h);
      };
      // (only the ledge that faces up, and faintly: bands all round a panel read as painted rectangles)
      band(a - 0.006, 0.046, 0.12, px0 + 0.002, px1 - 0.002);
    }
  }
  // one slow field of dirt: darker to the floor, greasy round the handle, old runs in the varnish
  pixels(g);
  g.globalCompositeOperation = 'multiply';
  g.imageSmoothingQuality = 'high';
  g.drawImage(field(256, 512, (u, v) => {
    const x = x0 + u * LW;
    const y = (1 - v) * DOOR.h;
    const cc = [1, 1, 1];
    let t = 0.78 + 0.3 * fbm(x * 2 + seed, y * 1.2, 301, 3);
    t *= 0.9 + 0.2 * fbm(x * 9 + seed, y * 9, 303, 2);
    cc[0] = cc[1] = cc[2] = t;
    mul(cc, smooth(0.6, 0.02, y) * (0.3 + 0.5 * kicked) * (0.5 + fbm(x * 3 + seed, y * 2, 305, 3)), 0.45, 0.45, 0.46);
    const dx = (x - HANDLE.x - 0.05) / 0.15;
    const dy = (y - HANDLE.y - 0.02) / 0.22;
    mul(cc, (0.4 + 0.6 * grime) * Math.exp(-dx * dx - dy * dy) * (0.45 + 1.1 * fbm(x * 12, y * 12, 307, 2)), 0.22, 0.2, 0.18);
    // a hand's width of grease along the edge where the door is pushed shut
    mul(cc, (0.2 + 0.5 * grime) * smooth(x0 + 0.1, x0, x) * smooth(0.7, 1.0, y) * smooth(1.7, 1.3, y) * (0.4 + 1.2 * fbm(x * 9, y * 6, 317, 2)), 0.3, 0.28, 0.26);
    mul(cc, smooth(0.6, 0.8, fbm(x * 26 + seed, y * 0.5, 309, 3)) * 0.3, 0.6, 0.55, 0.5);
    return cc;
  }), 0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  // where hands push, the varnish is rubbed through to pale wood
  g.drawImage(field(256, 512, (u, v) => {
    const x = x0 + u * LW;
    const y = (1 - v) * DOOR.h;
    const dx = (x - HANDLE.x - 0.07) / 0.085;
    const dy = (y - HANDLE.y - 0.2) / 0.13;
    let a = 0.07 * Math.exp(-dx * dx - dy * dy) * smooth(0.3, 0.7, fbm(x * 9 + seed, y * 5, 311, 3));
    // and along the edge of the lock stile, where it is pulled shut
    a += 0.3 * smooth(x0 + 0.018, x0, x) * smooth(0.45, 0.62, fbm(seed, y * 5, 313, 3)) * smooth(0.5, 0.8, y) * smooth(1.6, 1.3, y);
    return [0.62, 0.48, 0.34, a * (0.6 + 0.6 * grime)];
  }), 0, 0, S, S);
  world(g);
  g.lineCap = 'round';
  // the edges of the mouldings, rubbed pale in broken lines
  const rub = (ax, ay, bx, by) => {
    const len = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t < len; t += 0.012) {
      const v = fbm(t * 4 + ax * 7 + seed, ay * 3 + bx, 315, 3);
      if (v < 0.52) continue;
      g.strokeStyle = `rgba(160,126,90,${clamp((v - 0.52) * 4, 0, 0.55)})`;
      g.lineWidth = 0.0014;
      g.beginPath();
      g.moveTo(ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len);
      g.lineTo(ax + ((bx - ax) * (t + 0.0125)) / len, ay + ((by - ay) * (t + 0.0125)) / len);
      g.stroke();
    }
  };
  for (const [a, b] of [[YS[1], YS[2]], [YS[3], YS[4]]]) {
    // (no pale rub along the panel mouldings: under the lamp over door 313 it read as a painted stripe)
  }
  rub(x0 + 0.0015, 0.02, x0 + 0.0015, DOOR.h);
  rub(x1 - 0.0015, 0.02, x1 - 0.0015, DOOR.h);
  rub(x0, 0.016, x1, 0.016);
  // round the handle plate the varnish is worn through in a ragged ring: every hand lands there
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const rx = 0.03 + 0.02 * r();
    const ry = 0.11 + 0.03 * r();
    g.fillStyle = `rgba(${132 + 30 * r()},${104 + 24 * r()},${76 + 18 * r()},${(0.025 + 0.05 * r()) * (0.4 + grime)})`;
    g.beginPath();
    g.ellipse(HANDLE.x + Math.cos(a) * rx, HANDLE.y - 0.03 + Math.sin(a) * ry, 0.003 + r() * 0.005, 0.004 + r() * 0.009, 0, 0, Math.PI * 2);
    g.fill();
  }
  // kicked along the bottom rail: black rubber, pale cuts, chips out of the edge
  const nk = Math.round(60 + 160 * kicked);
  for (let i = 0; i < nk; i++) {
    const x = x0 + r() * LW;
    const y = 0.02 + Math.pow(r(), 1.7) * 0.36;
    const len = 0.01 + r() * 0.09;
    const pale = r() < 0.5;
    g.strokeStyle = pale ? `rgba(150,120,90,${0.2 + 0.4 * r()})` : `rgba(6,5,4,${0.25 + 0.5 * r()})`;
    g.lineWidth = pale ? 0.0006 + r() * 0.0012 : 0.0008 + r() * 0.004;
    const tilt = (r() - 0.5) * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + len * tilt);
    g.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const bottom = r() < 0.6;
    const x = bottom ? x0 + r() * LW : r() < 0.7 ? x0 + r() * 0.012 : x1 - r() * 0.012;
    const y = bottom ? 0.016 + r() * 0.02 : 0.1 + r() * 1.7;
    blobPath(g, x, y, 0.0015 + r() * 0.003, 0.0015 + r() * 0.004, 0.35, i + seed);
    g.fillStyle = `rgba(${130 + 30 * r()},${100 + 24 * r()},${70 + 20 * r()},${0.35 + 0.35 * r()})`;
    g.fill();
  }
  // a key has missed the lock a thousand times
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.012 + r() * 0.035;
    const x = HANDLE.x + Math.cos(a) * d;
    const y = HANDLE.y - 0.095 + Math.sin(a) * d;
    g.strokeStyle = `rgba(170,140,104,${0.2 + 0.4 * r()})`;
    g.lineWidth = 0.0005 + r() * 0.0006;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 0.02, y + (r() - 0.5) * 0.02);
    g.stroke();
  }
  pixels(g);
  return c;
}

// The sheen of a leaf: old varnish, glossy where nothing touches it, dull where hands and shoes
// do. One map for every leaf (handle on the left, like the skins).
export function doorRough(S = 512) {
  return field(S, S, (u, v) => {
    const x = -LW / 2 + u * LW;
    const y = (1 - v) * DOOR.h;
    let k = 0.3 + 0.2 * fbm(x * 3, y * 1.5, 401, 3) + 0.14 * smooth(0.5, 0.8, fbm(x * 30, y * 0.6, 403, 3));
    const dx = (x - HANDLE.x - 0.05) / 0.16;
    const dy = (y - HANDLE.y - 0.06) / 0.25;
    k += 0.36 * Math.exp(-dx * dx - dy * dy);
    k += 0.38 * smooth(0.5, 0.05, y) * (0.5 + 0.5 * fbm(x * 4, y * 4, 405, 2));
    // dust lies on every ledge that faces up (the lower bevel of each panel and of its raised
    // field): matt, where a clean moulding would throw a white line back at the lamp
    // the mouldings of both panels are matt all the way round (dust, and varnish that never got
    // polished in the corners): a glossy bevel under a lamp is a white bar
    // (Tried and dropped: mouldings matt all the way round. Against a glossy leaf under the lamp
    // they showed as dark concentric rectangles. The whole leaf is a little duller instead, so a
    // moulding gives a broad soft highlight, never a white bar.)
    k += 0.14;
    return [k, k, k];
  });
}
