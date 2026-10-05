// Builds the corridor frames the site ships from the masters in corridor-src/ (see
// corridor-src/SOURCES.md for where those came from):
//   public/corridor/d/NNN.avif         desktop walk, 1600 x 900
//   public/corridor/m/NNN.webp         phone walk, 900 x 1800 (a portrait window cut from the same frames)
//   public/corridor/{d,m}/s/f-NN.*     scare patches as generated and graded (the face in the gap)
//   public/corridor/{d,m}/s/g-NN.*     scare patches with a dark gap (for a supplied photograph)
//   public/corridor/poster-{d,m}.webp  first frame, small, loads with the page
//   public/corridor/manifest.json      what src/scripts/corridor.ts reads
//
//   npm run corridor:frames                          build everything
//   node scripts/corridor-frames.mjs --windows=DIR   only render the phone window at each keyframe into DIR
//   node scripts/corridor-frames.mjs --scare         only the scare patches and the manifest (the walk frames stay)
//   node scripts/corridor-frames.mjs --verify=DIR    also compare every finished desktop frame with DIR/NNN.png
//                                                    (the reference frames of the review round), pixel for pixel
//
// Needs ffmpeg on the PATH (or FFMPEG=/path/to/ffmpeg). Frames are extracted once into
// corridor-src/.cache/ (gitignored, about 2.5 GB).
//
// The walk. Four clips, each from one keyframe still to the next: clip N ends on the still clip
// N+1 starts on. The two renderings of that still differ a little, so the duplicate is dropped
// and the last three frames of a clip dissolve into the first frame of the next. The clips ease
// in and out of every keyframe, so taking every n-th frame would rush through the middle of a
// clip and freeze at its ends. Instead the frames are picked at equal steps of accumulated
// motion (mean absolute difference between consecutive frames): scrubbing is a steady walk.
//
// The scare. A locked-off clip that starts on the same keyframe as the walk reaches at door 308.
// Its first frame IS the walk frame there, in both sets, so the scare patches (the region of the
// picture that changes, feathered into that frame) lie over it without a seam.
//
// Every shipped frame, at its final size, has its sharpness evened out (corridor-even.cjs: the
// keyframes come out of the video model crisper than the frames in motion) and then gets the
// finishing pass (corridor-finish.cjs); every scare frame gets the grade (corridor-grade.cjs)
// before it is resized. Those three files are the functions the review stills were made with;
// the timeline, the dissolves and the sampling below follow the reference build of the review
// round step for step, so the desktop set is the reviewed frames, pixel for pixel, before
// encoding.
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir, rm, stat, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { finish } = require('./corridor-finish.cjs');
const { evenSharpness, lapVar } = require('./corridor-even.cjs');
const { grade } = require('./corridor-grade.cjs');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'corridor-src');
const CACHE = join(SRC, '.cache');
const PUB = join(ROOT, 'public', 'corridor');
const FFMPEG = process.env.FFMPEG ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));

const W = 2560; // the masters
const H = 1440;
const WALK = ['seg1', 'seg2', 'seg3', 'seg4c'];
const SCARE = 'scarec';
const FRAMES = { seg1: 124, seg2: 124, seg3: 124, seg4c: 243, scarec: 124 }; // frames in each clip
const DISSOLVE = [1 / 3, 2 / 3, 1]; // the last three frames of a clip, towards the next keyframe
const MOTION_FLOOR = 0.4; // the least a step of the timeline counts for
const DARK_FADE = 30; // timeline frames over which the extra darkening of the first two clips fades out
const LW = 320; // motion is measured at this size
const LH = 180;

// seed: the finishing pass's grain seed for frame `index` of the set
const SETS = {
  desktop: { dir: 'd', ext: 'avif', w: 1600, h: 900, frames: 168, poster: [640, 360], seed: 1000 },
  mobile: { dir: 'm', ext: 'webp', w: 900, h: 1800, frames: 112, poster: [360, 720], seed: 3000 },
};
const SCARE_SEED = 5000; // plus the clip frame number
// The phone window: 720 x 1440 of the master, enlarged to 900 x 1800. Where its centre is at
// each keyframe (x in master pixels); in between it moves with the walk, eased.
//   K1 the lit wall and door 301        K2 door 304, its plate, the shoes, the wall running away
//   K3 door 305, plate and scratches    K4 door 308: plate, handle, the hand and the gap to its right
//   K5 door 313 with plate and handle, the exit doors and the green sign at the right edge
const WIN_W = 720;
const WINDOW = [830, 1520, 1100, 1770, 1300];

// The scare beat: 15 frames at 24 fps. The first and the last are the held walk frame itself
// (the door shut); the 13 between come from these frames of the clip: fingers come round the
// door edge and the door opens in three, the face is there for eight, the door shuts in two.
const SCARE_FPS = 24;
const SCARE_PICK = [0, 38, 44, 50, 54, 58, 62, 66, 70, 74, 78, 84, 92, 100, 0];
// Where the gap opens (the grade's window, master pixels): between the handle edge of the leaf
// and the jamb to the right of it.
const GAP_X0 = 1790;
const GAP_X1 = 1968;
// The "g" variant, for a supplied photograph: the gap is taken to near black from the top of
// the frame down to just above the hand on the door edge.
const HAND_TOP = 812;
const GAP_BLACK = 0.07;
// Where the photograph goes: the head, in master pixels (hairline to chin of the generated
// face). The quad hangs on the jamb, which does not move: `lead` is how far left of the jamb
// the picture starts, so that its left eye sits where the generated one does.
const HEAD = { top: 410, bottom: 640, width: 175, lead: 71 };

const pad = (n, w = 3) => String(n).padStart(w, '0');
const exists = (p) => stat(p).then(() => true, () => false);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);

// --- extraction ------------------------------------------------------------------------------
async function extract() {
  for (const clip of [...WALK, SCARE]) {
    const dir = join(CACHE, clip);
    const have = (await exists(dir)) ? (await readdir(dir)).filter((f) => f.endsWith('.png')).length : 0;
    if (have === FRAMES[clip]) continue;
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    console.log(`extracting ${clip}.mp4`);
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', join(SRC, `${clip}.mp4`), join(dir, '%03d.png')], { stdio: 'inherit' });
    const got = (await readdir(dir)).filter((f) => f.endsWith('.png')).length;
    if (got !== FRAMES[clip]) throw new Error(`${clip}.mp4: ${got} frames, expected ${FRAMES[clip]}`);
  }
}
const png = (clip, n) => join(CACHE, clip, `${pad(n)}.png`);
const raw = async (clip, n) => {
  const { data, info } = await sharp(png(clip, n)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H) throw new Error(`${clip}/${n}: ${info.width} x ${info.height}`);
  return data;
};

// --- the timeline ------------------------------------------------------------------------------
// One entry per frame of the walk: a source frame `a`, and optionally a second one `b` it is
// dissolved into with weight `w`. 612 entries; `keys` are the timeline indices of K1 to K5.
function timeline() {
  const out = [];
  const keys = [0];
  WALK.forEach((clip, s) => {
    // what this clip ends on: the first frame of the next clip, or of the scare clip at door 308
    const next = s === 2 ? SCARE : WALK[s + 1];
    const plain = FRAMES[clip] - (next ? DISSOLVE.length : 0);
    if (s === 3) {
      // The clip after door 308 starts on its own rendering of that keyframe, not on the scare
      // clip's: its second and third frame dissolve out of the held frame.
      out.push({ a: [clip, 2], b: [SCARE, 1], w: 2 / 3 }, { a: [clip, 3], b: [SCARE, 1], w: 1 / 3 });
    }
    for (let n = s === 0 ? 1 : s === 3 ? 4 : 2; n <= plain; n++) out.push({ a: [clip, n] });
    if (next) DISSOLVE.forEach((w, k) => out.push({ a: [clip, plain + 1 + k], b: [next, 1], w }));
    keys.push(out.length - 1);
  });
  return { frames: out, keys };
}
// A timeline frame at a set's size: each source is brought to that size first and the dissolve
// is done there (the order of the reference build). `fit` turns a source file into raw pixels.
const blend = async (e, fit) => {
  const a = await fit(png(...e.a));
  if (!e.b || !e.w) return a;
  const b = await fit(png(...e.b));
  for (let j = 0; j < a.length; j++) a[j] = Math.round(a[j] * (1 - e.w) + b[j] * e.w);
  return a;
};
const FIT = {
  small: (file) => sharp(file).resize(LW, LH, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer(),
  desktop: () => (file) => sharp(file).resize(SETS.desktop.w, SETS.desktop.h, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer(),
  mobile: (left) => (file) => sharp(file).extract({ left, top: 0, width: WIN_W, height: H }).resize(SETS.mobile.w, SETS.mobile.h, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer(),
};
const mad = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

// Motion along the timeline: mean absolute difference between consecutive frames at 320 x 180.
// The small frames are kept in one cache file.
async function motion(tl) {
  const size = LW * LH * 3;
  const file = join(CACHE, `timeline-${LW}.bin`);
  const key = JSON.stringify(tl.frames);
  let small = null;
  if ((await exists(file)) && (await exists(`${file}.json`)) && (await readFile(`${file}.json`, 'utf8')) === key) {
    const all = await readFile(file);
    if (all.length === size * tl.frames.length) small = tl.frames.map((_, i) => all.subarray(i * size, (i + 1) * size));
  }
  if (!small) {
    console.log('measuring motion');
    small = new Array(tl.frames.length);
    const queue = tl.frames.map((e, i) => [e, i]);
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) small[job[1]] = await blend(job[0], FIT.small);
      }),
    );
    const fh = await open(file, 'w');
    for (const b of small) await fh.write(b);
    await fh.close();
    await writeFile(`${file}.json`, key);
  }
  const steps = small.slice(1).map((f, i) => mad(f, small[i]));
  const cum = [0];
  for (const d of steps) cum.push(cum[cum.length - 1] + Math.max(d, MOTION_FLOOR));
  return { steps, cum };
}

// Pick `count` frames at equal steps of accumulated motion. The pick nearest the keyframe at
// door 308 is moved onto it, the picks are kept strictly increasing, and the last pick is the
// last frame.
function pick(cum, k4, count) {
  const total = cum[cum.length - 1];
  const list = [];
  let k = 0;
  for (let j = 0; j < count; j++) {
    const c = (total * j) / (count - 1);
    while (k < cum.length - 1 && Math.abs(cum[k + 1] - c) <= Math.abs(cum[k] - c)) k++;
    list.push(k);
  }
  let near = 0;
  list.forEach((p, j) => {
    if (Math.abs(p - k4) < Math.abs(list[near] - k4)) near = j;
  });
  list[near] = k4;
  for (let j = 1; j < count; j++) if (list[j] <= list[j - 1]) list[j] = Math.min(cum.length - 1, list[j - 1] + 1);
  list[count - 1] = cum.length - 1;
  for (let j = 1; j < count; j++) if (list[j] <= list[j - 1]) throw new Error(`pick ${j} is not after pick ${j - 1}`);
  if (list[near] !== k4) throw new Error('the keyframe at door 308 is not in the set');
  return { list, scare: near };
}

// The phone window's left edge for a timeline index.
function windowLeft(cum, keys, i) {
  let s = 0;
  while (s < keys.length - 2 && i > keys[s + 1]) s++;
  const u = clamp((cum[i] - cum[keys[s]]) / (cum[keys[s + 1]] - cum[keys[s]]), 0, 1);
  const cx = WINDOW[s] + (WINDOW[s + 1] - WINDOW[s]) * smooth(u);
  return clamp(Math.round(cx - WIN_W / 2), 0, W - WIN_W);
}

// How much further the finishing pass pulls down everything outside the beam, for a timeline
// index: fully up to the keyframe at door 305 (in the first two clips the video model lit the
// whole corridor as if by a second lamp), fading to nothing over the next 30 timeline frames.
// The held frame at door 308 and the scare frames get none.
const darkAt = (t, k3) => (t <= k3 ? 1 : Math.max(0, 1 - (t - k3) / DARK_FADE));

// --- encoding ----------------------------------------------------------------------------------
// Format per set, as the frames have always been shipped. Desktop: AVIF. Phone: WebP, which
// every phone decodes, and fast. Dark frames get a higher quality: at the base setting the
// encoders smooth the grain out of the shadows and leave flat, blocky steps there. `dark` is
// the mean luma (0..255) of the frame.
const darkBoost = (dark) => (dark < 22 ? 12 : dark < 40 ? 8 : dark < 60 ? 4 : 0);
const ENCODE = {
  desktop: (img, dark = 255) => img.avif({ quality: 56 + darkBoost(dark), effort: 7, chromaSubsampling: '4:2:0' }),
  mobile: (img, dark = 255) => img.webp({ quality: 56 + darkBoost(dark), effort: 6, smartSubsample: true }),
};
const lumaOf = (buf) => {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < buf.length; i += 3) {
    r += buf[i];
    g += buf[i + 1];
    b += buf[i + 2];
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / (buf.length / 3);
};
const image = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 3 } });

// --- the scare -------------------------------------------------------------------------------------
// The gap between the door edge and the jamb in one (ungraded) frame, as two straight lines.
// Both are measured above the head, where the gap is plain dark. The door edge is measured a
// second time below the face, where the dark of the gap still starts at the door edge (the
// figure stands against the jamb side). The jamb does not move and the camera is locked off,
// so its lean is a constant of the clip (JAMB_LEAN, measured on the clip: 1954 at y 260, 1930
// at y 1060).
const JAMB_LEAN = -0.03;
const EDGE_LEAN = -0.025; // the door edge's, used while the gap is too narrow to measure twice
function gapOf(frame) {
  const lum = (x, y) => {
    const p = (y * W + x) * 3;
    return (frame[p] * 3 + frame[p + 1] * 6 + frame[p + 2]) / 10;
  };
  const band = (y0, y1) => {
    const ls = [];
    const rs = [];
    for (let y = y0; y < y1; y += 4) {
      let best = [0, 0];
      let start = -1;
      for (let x = GAP_X0 - 30; x <= GAP_X1 + 40; x++) {
        const dark = lum(x, y) < 14;
        if (dark && start < 0) start = x;
        if ((!dark || x === GAP_X1 + 40) && start >= 0) {
          if (x - start > best[1] - best[0]) best = [start, x];
          start = -1;
        }
      }
      if (best[1] - best[0] >= 4) {
        ls.push(best[0]);
        rs.push(best[1]);
      }
    }
    if (ls.length < (y1 - y0) / 8) return null;
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    return { y: (y0 + y1) / 2, l: med(ls), r: med(rs) };
  };
  const top = band(240, 360);
  if (!top) return null;
  const low = band(700, 770);
  const lean = low ? (low.l - top.l) / (low.y - top.y) : EDGE_LEAN;
  const at = (y) => ({ l: top.l + lean * (y - top.y), r: top.r + JAMB_LEAN * (y - top.y) });
  const mid = at((HEAD.top + HEAD.bottom) / 2);
  return { at, width: mid.r - mid.l };
}

// The same graded frame with nobody in the gap: near black between door edge and jamb, down to
// the hand. The door edge and the fingers on it stay.
function emptyGap(graded, gap) {
  const o = Buffer.from(graded);
  if (!gap) return o;
  for (let y = 0; y < HAND_TOP + 24; y++) {
    const { l, r } = gap.at(y);
    const fy = y < HAND_TOP ? 1 : 1 - (y - HAND_TOP) / 24;
    for (let x = Math.floor(l) - 2; x <= Math.ceil(r) + 2; x++) {
      const fx = clamp(Math.min(x - (l - 1.5), r + 1.5 - x) / 3, 0, 1);
      const g = 1 - fx * fy * (1 - GAP_BLACK);
      const p = (y * W + x) * 3;
      o[p] = o[p] * g;
      o[p + 1] = o[p + 1] * g;
      o[p + 2] = o[p + 2] * g;
    }
  }
  return o;
}

// The rectangle that holds everything that changes over the beat (master pixels). The leaf
// swings, so this is the whole door, not only the gap. The clip also flickers faintly all over
// the picture, as generated video does, so a single changed block proves nothing: the change
// is measured in 32 px blocks (mean absolute difference against the first frame, the largest
// over the chosen frames), and a column of blocks counts when a fifth of it changed (a row: a
// tenth of those columns).
function changedRect(first, frames) {
  const B = 32;
  const bw = W / B;
  const bh = H / B;
  const most = new Float32Array(bw * bh);
  for (const img of frames) {
    const sum = new Float32Array(bw * bh);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        sum[(y >> 5) * bw + (x >> 5)] += Math.abs(img[i] - first[i]) + Math.abs(img[i + 1] - first[i + 1]) + Math.abs(img[i + 2] - first[i + 2]);
      }
    }
    for (let k = 0; k < sum.length; k++) most[k] = Math.max(most[k], sum[k] / (B * B * 3));
  }
  const hit = (bx, by) => most[by * bw + bx] >= 5;
  const cols = [];
  for (let bx = 0; bx < bw; bx++) {
    let n = 0;
    for (let by = 0; by < bh; by++) if (hit(bx, by)) n++;
    if (n >= bh / 5) cols.push(bx);
  }
  if (!cols.length) throw new Error('nothing changes in the scare frames');
  const rows = [];
  for (let by = 0; by < bh; by++) {
    let n = 0;
    for (const bx of cols) if (hit(bx, by)) n++;
    if (n >= cols.length / 10) rows.push(by);
  }
  const m = 64; // margin in master pixels: the feather, in a part of the picture that holds still
  return {
    x0: Math.max(0, cols[0] * B - m),
    y0: Math.max(0, rows[0] * B - m),
    x1: Math.min(W, (cols[cols.length - 1] + 1) * B + m),
    y1: Math.min(H, (rows[rows.length - 1] + 1) * B + m),
    cols: `${cols[0]} to ${cols[cols.length - 1]} (${cols.length})`,
  };
}

// Cut the patch out of a finished set frame, feathered into the finished held frame so it has
// no edge. An edge of the patch that is the edge of the picture needs no feather.
function cut(def, img, hold, rect) {
  const { w, h } = def;
  const { x, y, w: pw, h: ph } = rect;
  const out = Buffer.alloc(pw * ph * 3);
  const f = 24; // feather width in set pixels
  for (let j = 0; j < ph; j++) {
    for (let i = 0; i < pw; i++) {
      const dl = x === 0 ? f : i;
      const dr = x + pw >= w ? f : pw - 1 - i;
      const dt = y === 0 ? f : j;
      const db = y + ph >= h ? f : ph - 1 - j;
      const k = Math.min(1, Math.min(dl, dr, dt, db) / f);
      const a = k * k * (3 - 2 * k);
      const s = ((y + j) * w + (x + i)) * 3;
      const o = (j * pw + i) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(hold[s + c] * (1 - a) + img[s + c] * a);
    }
  }
  return image(out, pw, ph);
}

// --- main ----------------------------------------------------------------------------------------
await extract();
const tl = timeline();
const K3 = tl.keys[2];
const K4 = tl.keys[3];
if (darkAt(K4, K3) !== 0) throw new Error('the held frame would be darkened');
const { steps, cum } = await motion(tl);
console.log(`timeline: ${tl.frames.length} frames, keyframes at ${tl.keys.join(', ')}; motion ${steps.reduce((a, b) => a + b, 0).toFixed(0)}, largest source step ${Math.max(...steps).toFixed(1)}`);
for (const k of tl.keys.slice(1, 4)) console.log(`  join at ${k}: source steps ${steps.slice(k - 5, k + 5).map((s) => s.toFixed(2)).join(' ')}`);

if (args.windows) {
  // the phone window at each keyframe, finished, for looking at
  await mkdir(args.windows, { recursive: true });
  for (const [n, i] of tl.keys.entries()) {
    const left = windowLeft(cum, tl.keys, i);
    const px = await evenSharpness(await blend(tl.frames[i], FIT.mobile(left)), SETS.mobile.w, SETS.mobile.h);
    finish(px, SETS.mobile.w, SETS.mobile.h, SETS.mobile.seed, darkAt(i, K3));
    await image(px, SETS.mobile.w, SETS.mobile.h).jpeg({ quality: 90 }).toFile(join(args.windows, `k${n + 1}.jpg`));
    console.log(`K${n + 1}: window ${left} to ${left + WIN_W}`);
  }
  process.exit(0);
}

// the scare frames at master size: graded, and graded with the gap emptied
const first = await raw(SCARE, 1);
const scare = { graded: [], empty: [], gaps: [] };
for (const n of SCARE_PICK) {
  if (!n) {
    scare.graded.push(null);
    scare.empty.push(null);
    scare.gaps.push(null);
    continue;
  }
  const frame = await raw(SCARE, n);
  const g = await grade(frame, first, W, H);
  const gap = gapOf(frame);
  scare.graded.push(g);
  scare.gaps.push(gap);
  scare.empty.push(emptyGap(g, gap));
}
const changed = changedRect(first, scare.graded.filter(Boolean));
console.log(
  `scare: clip frames ${SCARE_PICK.filter(Boolean).join(', ')}; changed region in the master ${changed.x0},${changed.y0} to ${changed.x1},${changed.y1} (block columns ${changed.cols}); gap widths ${scare.gaps.map((g) => (g ? g.width.toFixed(0) : '-')).join(' ')}`,
);

const manifest = { version: 1, sets: {} };
for (const [set, def] of Object.entries(SETS)) {
  const { list, scare: scareIndex } = pick(cum, K4, def.frames);
  const dst = join(PUB, def.dir);
  await rm(args.scare ? join(dst, 's') : dst, { recursive: true, force: true });
  await mkdir(join(dst, 's'), { recursive: true });
  const left = (t) => (set === 'mobile' ? windowLeft(cum, tl.keys, t) : 0);
  const at = (k) => list.reduce((b, p, j) => (Math.abs(p - k) < Math.abs(list[b] - k) ? j : b), 0);

  // the walk
  let bytes = 0;
  let hold = null;
  let posterBuf = null;
  let differ = 0;
  const lowres = new Array(def.frames); // each shipped frame, before finishing, at a fifth of its size
  const sharpness = new Array(def.frames); // what the evening step measured on each frame
  // --scare: the walk frames on disk stay, only the held frame is made again (for the patches)
  const queue = list.map((t, i) => [t, i]).filter(([, i]) => !args.scare || i === scareIndex);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const [t, i] = job;
        const plainPx = await blend(tl.frames[t], FIT[set](left(t)));
        lowres[i] = await image(plainPx, def.w, def.h).resize(def.w / 5, def.h / 5).raw().toBuffer();
        sharpness[i] = await lapVar(plainPx, def.w, def.h);
        const px = await evenSharpness(plainPx, def.w, def.h);
        finish(px, def.w, def.h, def.seed + i, darkAt(t, K3));
        if (i === 0) posterBuf = px;
        if (i === scareIndex) hold = px;
        if (args.verify && set === 'desktop') {
          const ref = await sharp(join(args.verify, `${pad(i)}.png`)).removeAlpha().raw().toBuffer();
          if (!ref.equals(px)) differ++;
        }
        if (args.scare) continue;
        const buf = await ENCODE[set](image(px, def.w, def.h), lumaOf(px)).toBuffer();
        await writeFile(join(dst, `${pad(i)}.${def.ext}`), buf);
        bytes += buf.length;
      }
    }),
  );
  if (!args.scare) {
    const shipped = lowres.slice(1).map((f, i) => mad(f, lowres[i]));
    const sorted = [...shipped].sort((a, b) => a - b);
    console.log(
      `${set}: ${def.frames} frames; keyframes K1 to K5 at frames ${tl.keys.map(at).join(', ')}; step between shipped frames (mean abs difference at ${def.w / 5} x ${def.h / 5}): largest ${sorted[sorted.length - 1].toFixed(2)}, median ${sorted[sorted.length >> 1].toFixed(2)}, smallest ${sorted[0].toFixed(2)}`,
    );
    const sh = [...sharpness].sort((a, b) => a - b);
    console.log(
      `${set}: sharpness evened: ${sharpness.filter((v) => v > 300).length} frames softened, ${sharpness.filter((v) => v < 260).length} sharpened, ${sharpness.filter((v) => v >= 260 && v <= 300).length} left alone (measure: smallest ${sh[0].toFixed(0)}, median ${sh[sh.length >> 1].toFixed(0)}, largest ${sh[sh.length - 1].toFixed(0)})`,
    );
  }
  if (args.verify && set === 'desktop') {
    console.log(`desktop: ${args.scare ? 1 : def.frames} finished frame(s) compared with ${args.verify}: ${differ} differ`);
    if (differ) throw new Error('the desktop frames are not the reference frames');
  }
  let posterBytes = 0;
  if (!args.scare) {
    // the poster is the first frame as shipped, small
    const poster = await image(posterBuf, def.w, def.h).resize(...def.poster).webp({ quality: 42, effort: 6 }).toBuffer();
    await writeFile(join(PUB, `poster-${def.dir}.webp`), poster);
    posterBytes = poster.length;
  }

  // the scare, over the held frame
  const k4left = left(K4);
  const sx = def.w / (set === 'mobile' ? WIN_W : W); // master pixels to set pixels
  const tx = (x) => (x - k4left) * sx;
  const even = (v) => v - (v % 2);
  const rx0 = even(clamp(Math.floor(tx(changed.x0)), 0, def.w));
  const ry0 = even(clamp(Math.floor(changed.y0 * sx), 0, def.h));
  const rx1 = clamp(Math.ceil(tx(changed.x1)), 0, def.w);
  const ry1 = clamp(Math.ceil(changed.y1 * sx), 0, def.h);
  const rect = { x: rx0, y: ry0, w: Math.min(even(rx1 - rx0 + 1), def.w - rx0), h: Math.min(even(ry1 - ry0 + 1), def.h - ry0) };
  // a graded master frame to this set's size, finished with the scare frame's own grain
  const toSet = async (buf, n) => {
    const img = sharp(buf, { raw: { width: W, height: H, channels: 3 } });
    const px = await (set === 'mobile' ? img.extract({ left: k4left, top: 0, width: WIN_W, height: H }) : img).resize(def.w, def.h, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
    scareSharp.push(await lapVar(px, def.w, def.h));
    return finish(await evenSharpness(px, def.w, def.h), def.w, def.h, SCARE_SEED + n, 0);
  };
  const scareSharp = [];
  const holdLuma = lumaOf(hold);
  let sbytes = 0;
  let scount = 0;
  const quads = [];
  const norm = (pts) => pts.map(([x, y]) => [Math.round((tx(x) / def.w) * 1e4) / 1e4, Math.round(((y * sx) / def.h) * 1e4) / 1e4]);
  for (let j = 0; j < SCARE_PICK.length; j++) {
    const n = SCARE_PICK[j];
    if (!n) {
      quads.push(null);
      continue;
    }
    for (const [variant, src] of [['f', scare.graded[j]], ['g', scare.empty[j]]]) {
      const buf = await ENCODE[set](cut(def, await toSet(src, n), hold, rect), holdLuma).toBuffer();
      await writeFile(join(dst, 's', `${variant}-${pad(j, 2)}.${def.ext}`), buf);
      sbytes += buf.length;
      scount++;
    }
    // Where a supplied photograph is drawn (quad: top left, top right, bottom right, bottom
    // left) and the outline it is clipped to (jamb top, door edge top, door edge bottom, jamb
    // bottom). The jamb is the right side of the gap.
    const gap = scare.gaps[j];
    if (!gap || gap.width < 6) {
      quads.push(null);
      continue;
    }
    const t = gap.at(HEAD.top - 40);
    const b = gap.at(HEAD.bottom + 40);
    const qx = gap.at((HEAD.top + HEAD.bottom) / 2).r - HEAD.lead;
    quads.push({
      quad: norm([[qx, HEAD.top], [qx + HEAD.width, HEAD.top], [qx + HEAD.width, HEAD.bottom], [qx, HEAD.bottom]]),
      clip: norm([[t.r, HEAD.top - 40], [t.l, HEAD.top - 40], [b.l, HEAD.bottom + 40], [b.r, HEAD.bottom + 40]]),
    });
  }
  console.log(`${set}: sharpness measure of the held frame ${sharpness[scareIndex].toFixed(0)}, of the scare frames ${Math.min(...scareSharp).toFixed(0)} to ${Math.max(...scareSharp).toFixed(0)}`);
  manifest.sets[set] = {
    dir: def.dir,
    ext: def.ext,
    w: def.w,
    h: def.h,
    frames: def.frames,
    poster: `poster-${def.dir}.webp`,
    scare: { frame: scareIndex, fps: SCARE_FPS, count: SCARE_PICK.length, rect: [rect.x, rect.y, rect.w, rect.h], has: SCARE_PICK.map((n) => (n ? 1 : 0)), quads },
  };
  console.log(
    `${set}: walk ${args.scare ? 'kept' : `${def.frames} files ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MB, avg ${(bytes / def.frames / 1024).toFixed(1)} KB)`}; scare frame ${scareIndex}, patch ${rect.x},${rect.y} ${rect.w} x ${rect.h}, ${scount} files ${sbytes} bytes${args.scare ? '' : `; poster ${posterBytes} bytes`}${set === 'mobile' ? `; window at door 308: ${k4left} to ${k4left + WIN_W}` : ''}`,
  );
}
const text = `${JSON.stringify(manifest)}\n`;
await writeFile(join(PUB, 'manifest.json'), text);
console.log(`manifest ${text.length} bytes`);
