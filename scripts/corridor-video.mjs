// Builds the corridor videos the site ships from the masters in corridor-src/ (see
// corridor-src/SOURCES.md for where those came from):
//   public/corridor/{d,m}/c1.{av1,h264}.mp4    chapter 1: door 301 to door 304
//   public/corridor/{d,m}/c2.{av1,h264}.mp4    chapter 2: to the scratched door 305
//   public/corridor/{d,m}/c3.{av1,h264}.mp4    chapter 3: to door 308 and on to the last door, 313
//   public/corridor/{d,m}/c3s.{av1,h264}.mp4   chapter 3 with the scare beat at door 308
//   public/corridor/{d,m}/p0..p3.webp          the pose at each stop: the start, and the end of each chapter
//                                              (stills; on the phone set 900 x 1800, the size the image sequence had)
//   public/corridor/poster-{d,m}.webp          the first frame, small: the only file that loads with the page
//   public/corridor/manifest.json              what src/scripts/corridor.ts reads
// d is the landscape set (1600 x 900), m the phone set (720 x 1440, a portrait window cut from
// the same frames that follows the subject).
//
//   npm run corridor:video                          build everything
//   node scripts/corridor-video.mjs --set=mobile    one set only (the manifest keeps the other)
//   node scripts/corridor-video.mjs --frames        only render the finished frames into the cache
//   node scripts/corridor-video.mjs --crf-h264=24 --crf-av1=34   fixed quality instead of the search for the byte budget
//   node scripts/corridor-video.mjs --out=DIR       write there instead of public/corridor (for trials)
//
// Needs ffmpeg with libx264 and libsvtav1 on the PATH (or FFMPEG=/path/to/ffmpeg). Frames are
// extracted once into corridor-src/.cache/ (gitignored, about 2 GB), and the finished frames
// are kept there too (about 5 GB), so a change to the encoder settings does not render again.
//
// The picture. Every frame is made exactly as the frames of the image sequence this replaces
// were made (the reviewed look): the four clips in order with the last three frames of each
// dissolving into the first frame of the next, the phone window that follows the subject, the
// sharpness evened out (corridor-even.cjs), the finishing pass (corridor-finish.cjs) with the
// extra darkening of the first two clips by timeline index, and for the scare the grade
// (corridor-grade.cjs), feathered into the held frame at door 308. A frame that was part of the
// old sequence keeps the grain seed it had there.
//
// What is different is only the sampling. The old sequence was 168 (phone: 112) frames picked
// at equal steps of motion, to be scrubbed. This is video: every frame of the timeline, shown
// for as long as the camera exposed it, so the walk eases in and out of each door as it was
// generated.
//   - clips 1 to 3 play at 24 frames a second, as generated
//   - the last clip was generated at about half the pace of the others (10 seconds; its motion
//     per frame is half that of clip 3). It plays at 1.5 times its speed: every frame is kept
//     and shown for 1/36 s instead of 1/24 s. No frame is dropped, repeated or blended.
//   - the scare beat is the same 15 frames at 24 frames a second: the held frame, 13 graded
//     frames of the scare clip, the held frame
//
// Film grain. The finishing pass can add fine grain with a new pattern on every frame, and the
// reviewed frames had it. None of it is baked into the videos or the poses (GRAIN below is 0),
// for a measured reason: no encoder at these sizes keeps it. The frames of the image sequence
// this replaces had already lost all of it to their AVIF and WebP compression (they carry less
// fine detail than the same frames rendered without grain), and the video encoders drop it
// too, while paying for it with 0.5 to 1.2 dB of the picture (H.264) at the same file size.
// The grain a visitor sees is the page's own grain layer, which lies over everything. The
// darkening, the black lift, the grade and the sharpness evening are untouched.
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir, rm, stat, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { finish } = require('./corridor-finish.cjs');
const { evenSharpness } = require('./corridor-even.cjs');
const { grade } = require('./corridor-grade.cjs');
const { prepareFace, drawFace, faceAlpha } = require('./corridor-face.cjs');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'corridor-src');
const CACHE = join(SRC, '.cache');
const FFMPEG = process.env.FFMPEG ?? (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE ?? FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const PUB = args.out ? String(args.out) : join(ROOT, 'public', 'corridor');

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

// Time. One tick is 1/72 s: a frame at 24 a second lasts 3 ticks, a frame at 36 a second 2.
const TICKS = 72;
const WALK_TICKS = 3;
const LAST_TICKS = args.seg4 === '1x' ? 3 : 2; // the last clip, 1.5 times its generated speed
const SEG4_DROP = args.seg4 === 'drop'; // trial only: drop every third frame of the last clip instead
const FPS = TICKS / WALK_TICKS;

// How much of the reviewed film grain is baked into the frames (1 is all of it).
const GRAIN = args.grain !== undefined ? Number(args.grain) : 0;

// seed: the finishing pass's grain seed for frame `index` of the old image sequence, which had
// `old` frames picked at equal steps of motion. budget: what one visitor may download, bytes.
// look: the size the sharpness is evened out at. The phone frames were shipped at 900 x 1800
// (the 720 x 1440 window, enlarged), and the evening step decides by a measure taken at that
// size, so it is still run there; the frame is then brought back to the window's own 720 x 1440
// for the video, which is all the detail there is.
// best: the quality that is good enough, per codec (the encoders' own scales, lower is better):
// a set whose budget allows better than this stops here instead of filling the budget.
// pose: WebP quality of the stills, before the lift dark pictures get (darkBoost below). The
// stills are what the stage rests on, so they are made at the `look` size: on a phone they are
// the 900 x 1800 pictures the image sequence had, not the video's 720 x 1440.
const SETS = {
  desktop: { dir: 'd', w: 1600, h: 900, look: [1600, 900], poster: [640, 360], seed: 1000, old: 168, budget: 8_000_000, ref: 5, best: { h264: 23, av1: 32 }, pose: 68 },
  mobile: { dir: 'm', w: 720, h: 1440, look: [900, 1800], poster: [360, 720], seed: 3000, old: 112, budget: 3_000_000, ref: 6, best: { h264: 23, av1: 32 }, pose: 56 },
};
const NEW_SEED = 20000; // plus the timeline index, for frames the old sequence did not have
const SCARE_SEED = 5000; // plus the clip frame number
// The phone window: 720 x 1440 of the master. Where its centre is at each
// keyframe (x in master pixels); in between it moves with the walk, eased.
//   K1 the lit wall and door 301        K2 door 304, its plate, the shoes, the wall running away
//   K3 door 305, plate and scratches    K4 door 308: plate, handle, the hand and the gap to its right
//   K5 door 313 with plate and handle, the exit doors and the green sign at the right edge
const WIN_W = 720;
const WINDOW = [830, 1520, 1100, 1770, 1300];

// The scare beat: 15 frames at 24 fps. The first and the last are the held walk frame itself
// (the door shut); the 13 between come from these frames of the clip: fingers come round the
// door edge and the door opens in three, the face is there for eight, the door shuts in two.
const SCARE_PICK = [0, 38, 44, 50, 54, 58, 62, 66, 70, 74, 78, 84, 92, 100, 0];
// Where the gap opens (the grade's window, master pixels): between the handle edge of the leaf
// and the jamb to the right of it.
const GAP_X0 = 1790;
const GAP_X1 = 1968;
// With a supplied photograph the gap is first taken to near black from the top of the frame
// down to just above the hand on the door edge.
const HAND_TOP = 812;
const GAP_BLACK = 0.07;
// Where the photograph goes: the head, in master pixels (hairline to chin of the generated
// face). The quad hangs on the jamb, which does not move: `lead` is how far left of the jamb
// the picture starts, so that its left eye sits where the generated one does.
const HEAD = { top: 410, bottom: 640, width: 175, lead: 71 };
const FACE_DIR = join(ROOT, 'src', 'assets', 'scare');

// Captions: which one is up when, in seconds of its chapter (negative: before the chapter's
// end). Chapters 1 and 2 arrive on their caption. Chapter 3 shows the third on the way to door
// 308 and takes it away before the door fills the frame; the fourth comes up as the walk
// arrives at the last door, and stays.
const CUES = {
  1: [{ cap: 0, in: -2.4 }],
  2: [{ cap: 1, in: -2.4 }],
  3: [
    { cap: 2, in: 0.7, out: 2.8 }, // door 308 fills the phone's frame from 3.5 s
    { cap: 3, in: -2.6 },
  ],
};

// Best first: the page takes the first one the browser can play. (--codec=h264: trials with one.)
const CODEC_LIST = ['av1', 'h264'].filter((c) => !args.codec || args.codec === c);

const pad = (n, w = 3) => String(n).padStart(w, '0');
const exists = (p) => stat(p).then(() => true, () => false);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const round = (v, d = 3) => Number(v.toFixed(d));

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
// is done there. `fit` turns a source file into raw pixels.
const blend = async (e, fit) => {
  const a = await fit(png(...e.a));
  if (!e.b || !e.w) return a;
  const b = await fit(png(...e.b));
  for (let j = 0; j < a.length; j++) a[j] = Math.round(a[j] * (1 - e.w) + b[j] * e.w);
  return a;
};
const FIT = {
  small: (file) => sharp(file).resize(LW, LH, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer(),
  desktop: () => (file) => sharp(file).resize(...SETS.desktop.look, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer(),
  mobile: (left) => (file) => sharp(file).extract({ left, top: 0, width: WIN_W, height: H }).resize(...SETS.mobile.look, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer(),
};
const mad = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

// Motion along the timeline: mean absolute difference between consecutive frames at 320 x 180.
// It moves the phone window (and it is what the old sequence was sampled by). The small frames
// are kept in one cache file.
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

// The frames the old image sequence was made of: `count` picks at equal steps of accumulated
// motion, the pick nearest the keyframe at door 308 moved onto it. Only used to give those
// frames the grain seed they had.
function oldPicks(cum, k4, count) {
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
  return list;
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

const image = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 3 } });
// Stills of dark pictures get a higher quality: at the base setting the encoder smooths the
// shadows into flat, blocky steps. `dark` is the mean luma (0..255) of the picture.
const darkBoost = (dark) => (dark < 22 ? 12 : dark < 40 ? 8 : dark < 60 ? 4 : 0);
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
// the hand. The door edge and the fingers on it stay. Only used when a photograph is supplied.
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
  };
}

// A scare frame as the old sequence showed it: the held frame, with the finished scare frame
// laid over it inside the rectangle and feathered into it, so it has no edge. An edge of the
// rectangle that is the edge of the picture needs no feather.
function over(def, img, hold, rect) {
  const { w, h } = def;
  const { x, y, w: pw, h: ph } = rect;
  const out = Buffer.from(hold);
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
      for (let c = 0; c < 3; c++) out[s + c] = Math.round(hold[s + c] * (1 - a) + img[s + c] * a);
    }
  }
  return out;
}

// --- the finished frames, in the cache -------------------------------------------------------------
// One raw RGB file per frame: t0000.rgb for timeline frames, s00.rgb for the scare beat.
const faceFile = () => ['avif', 'webp', 'png'].map((e) => join(FACE_DIR, `face.${e}`)).find((f) => existsSync(f)) ?? null;

async function render(set, def, tl, cum, K3, K4) {
  const face = faceFile();
  const dir = join(CACHE, 'video', `${set}-${def.w}x${def.h}-g${GRAIN}`);
  const [lw, lh] = def.look;
  // sharpness evened out at the size the frames were reviewed at, then to the set's size
  const even = async (px) => {
    const out = await evenSharpness(px, lw, lh);
    return lw === def.w && lh === def.h ? out : image(out, lw, lh).resize(def.w, def.h, { kernel: 'lanczos3' }).raw().toBuffer();
  };
  const key = JSON.stringify({ tl: tl.frames, w: def.w, h: def.h, look: def.look, poses: POSE_AT(tl), grain: GRAIN, window: WINDOW, pick: SCARE_PICK, face: face ? (await stat(face)).size + ':' + (await stat(face)).mtimeMs : null });
  const old = oldPicks(cum, K4, def.old);
  const seedOf = (t) => {
    const i = old.indexOf(t);
    return i >= 0 ? def.seed + i : def.seed + NEW_SEED + t;
  };
  const left = (t) => (set === 'mobile' ? windowLeft(cum, tl.keys, t) : 0);
  const file = (name) => join(dir, `${name}.rgb`);
  const size = def.w * def.h * 3;
  const info = { dir, file, seedOf, left, face: Boolean(face) };
  if ((await exists(join(dir, 'key.json'))) && (await readFile(join(dir, 'key.json'), 'utf8')) === key) {
    info.rect = JSON.parse(await readFile(join(dir, 'scare.json'), 'utf8'));
    return info;
  }
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  console.log(`${set}: rendering ${tl.frames.length} frames at ${def.w} x ${def.h}, grain ${GRAIN}`);
  const started = Date.now();
  const queue = tl.frames.map((e, t) => [e, t]);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const [e, t] = job;
        const plain = await blend(e, FIT[set](left(t)));
        const px = await even(plain);
        finish(px, def.w, def.h, seedOf(t), darkAt(t, K3), GRAIN);
        if (px.length !== size) throw new Error(`frame ${t}: ${px.length} bytes`);
        await writeFile(file(`t${pad(t, 4)}`), px);
        // a pose: the same frame, finished at the look size
        const k = POSE_AT(tl).indexOf(t);
        if (k >= 0) await writeFile(file(`pose${k}`), finish(await evenSharpness(plain, lw, lh), lw, lh, seedOf(t), darkAt(t, K3), GRAIN));
      }
    }),
  );

  // the scare, over the held frame
  const first = await raw(SCARE, 1);
  const graded = [];
  for (const n of SCARE_PICK) {
    if (!n) {
      graded.push(null);
      continue;
    }
    const frame = await raw(SCARE, n);
    const g = await grade(frame, first, W, H);
    // with a photograph: the generated face is taken out of the gap, the photograph goes in below
    const gap = face ? gapOf(frame) : null;
    graded.push({ px: face ? emptyGap(g, gap) : g, gap });
  }
  const changed = changedRect(first, graded.filter(Boolean).map((g) => g.px));
  const k4left = left(K4);
  const sx = def.w / (set === 'mobile' ? WIN_W : W); // master pixels to set pixels
  const tx = (x) => (x - k4left) * sx;
  const even2 = (v) => v - (v % 2);
  const rx0 = even2(clamp(Math.floor(tx(changed.x0)), 0, def.w));
  const ry0 = even2(clamp(Math.floor(changed.y0 * sx), 0, def.h));
  const rx1 = clamp(Math.ceil(tx(changed.x1)), 0, def.w);
  const ry1 = clamp(Math.ceil(changed.y1 * sx), 0, def.h);
  const rect = { x: rx0, y: ry0, w: Math.min(even2(rx1 - rx0 + 1), def.w - rx0), h: Math.min(even2(ry1 - ry0 + 1), def.h - ry0) };
  const hold = await readFile(file(`t${pad(K4, 4)}`));
  const photo = face ? await prepareFace(face) : null;
  const norm = (pts) => pts.map(([x, y]) => [tx(x) / def.w, (y * sx) / def.h]);
  let drawn = 0;
  for (let j = 0; j < SCARE_PICK.length; j++) {
    const n = SCARE_PICK[j];
    if (!n) {
      await writeFile(file(`s${pad(j, 2)}`), hold);
      continue;
    }
    // a graded master frame to this set's size, finished with the scare frame's own grain
    const img = image(graded[j].px, W, H);
    const fit = await (set === 'mobile' ? img.extract({ left: k4left, top: 0, width: WIN_W, height: H }) : img).resize(lw, lh, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
    const px = finish(await even(fit), def.w, def.h, SCARE_SEED + n, 0, GRAIN);
    const gap = graded[j].gap;
    if (photo && gap && gap.width >= 6) {
      // Where the photograph is drawn (quad: top left, top right, bottom right, bottom left)
      // and the outline it is clipped to (jamb top, door edge top, door edge bottom, jamb
      // bottom). The jamb is the right side of the gap.
      const t = gap.at(HEAD.top - 40);
      const b = gap.at(HEAD.bottom + 40);
      const qx = gap.at((HEAD.top + HEAD.bottom) / 2).r - HEAD.lead;
      const q = {
        quad: norm([[qx, HEAD.top], [qx + HEAD.width, HEAD.top], [qx + HEAD.width, HEAD.bottom], [qx, HEAD.bottom]]),
        clip: norm([[t.r, HEAD.top - 40], [t.l, HEAD.top - 40], [b.l, HEAD.bottom + 40], [b.r, HEAD.bottom + 40]]),
      };
      drawn += drawFace(px, def.w, def.h, photo, q, faceAlpha(j, SCARE_PICK.length)) ? 1 : 0;
    }
    await writeFile(file(`s${pad(j, 2)}`), over(def, px, hold, rect));
  }
  await writeFile(join(dir, 'scare.json'), JSON.stringify(rect));
  await writeFile(join(dir, 'key.json'), key);
  info.rect = rect;
  console.log(`${set}: rendered in ${((Date.now() - started) / 1000).toFixed(0)} s; scare rectangle ${rect.x},${rect.y} ${rect.w} x ${rect.h}${face ? `; photograph ${face} drawn into ${drawn} frames` : '; no photograph in the slot, the generated face is used'}${set === 'mobile' ? `; window at door 308: ${k4left} to ${k4left + WIN_W}` : ''}`);
  return info;
}

// The poses: the first frame, and the last frame of each chapter (timeline indices).
function POSE_AT(tl) {
  return [0, tl.keys[1], tl.keys[2], tl.keys[4]];
}

// --- chapters ------------------------------------------------------------------------------------
// A chapter is a list of frames, each with the time it is shown for, in ticks. Every chapter
// starts on the frame the one before it ends on, so a chapter handing over to the next shows
// no change.
function chapters(tl) {
  const [, K2, K3, K4, K5] = tl.keys;
  const walk = (a, b, ticks) => Array.from({ length: b - a + 1 }, (_, i) => ({ name: `t${pad(a + i, 4)}`, ticks }));
  let last = walk(K4 + 1, K5, LAST_TICKS);
  if (SEG4_DROP) last = last.filter((_, i) => i % 3 !== 1 || i === last.length - 1).map((f) => ({ ...f, ticks: WALK_TICKS }));
  const beat = SCARE_PICK.map((_, j) => ({ name: `s${pad(j, 2)}`, ticks: WALK_TICKS }));
  const to308 = walk(K3, K4, WALK_TICKS);
  return [
    { id: 'c1', chapter: 1, frames: walk(0, K2, WALK_TICKS) },
    { id: 'c2', chapter: 2, frames: walk(K2, K3, WALK_TICKS) },
    { id: 'c3', chapter: 3, frames: [...to308, ...last] },
    { id: 'c3s', chapter: 3, scare: { at: to308.length, count: beat.length }, frames: [...to308, ...beat, ...last] },
  ];
}
const ticksOf = (frames) => frames.reduce((s, f) => s + f.ticks, 0);
const seconds = (ticks) => round(ticks / TICKS, 4);

// --- encoding ------------------------------------------------------------------------------------
// The frames are piped to ffmpeg as raw RGB, and their times are set there from the tick list
// (runs of frames with the same duration), so the file carries the exact time of every frame.
function ptsExpr(frames) {
  const runs = [];
  for (const f of frames) {
    const r = runs[runs.length - 1];
    if (r && r.ticks === f.ticks) r.count++;
    else runs.push({ ticks: f.ticks, count: 1 });
  }
  let n0 = 0;
  let t0 = 0;
  const parts = runs.map((r) => {
    const p = { n0, t0, ticks: r.ticks, end: n0 + r.count };
    n0 += r.count;
    t0 += r.count * r.ticks;
    return p;
  });
  let expr = '';
  parts.forEach((p, i) => {
    const e = `${p.t0}+${p.ticks}*(N-${p.n0})`;
    expr += i === parts.length - 1 ? e : `if(lt(N\\,${p.end})\\,${e}\\,`;
  });
  return expr + ')'.repeat(parts.length - 1);
}

// How the files say their colours are to be read: BT.709 primaries and matrix, video range,
// and the sRGB transfer curve, which is what the frames are in (they are made from PNGs). With
// the usual BT.709 curve written there instead, Safari and Chrome with a hardware decoder show
// the video two to four levels lighter than the stills next to it (measured on the built page:
// a pose against the first frame of its chapter), and every chapter would start and end with
// a small jump in brightness. ffmpeg takes these from the filter, not from output options.
const COLOUR = 'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=iec61966-2-1';

const CODECS = {
  // H.264 High, level 4.0, 8 bit 4:2:0: what every iPhone and every Android phone decodes in
  // hardware. One keyframe (nothing ever seeks), reference frames within the level's limit.
  h264: (def, crf) => ({
    pix: 'yuv420p',
    args: ['-c:v', 'libx264', '-preset', 'veryslow', '-profile:v', 'high', '-level:v', '4.0', '-crf', String(crf), '-g', '9999', '-keyint_min', '9999', '-sc_threshold', '0', '-x264-params', `ref=${def.ref}:aq-mode=3:aq-strength=0.8:psy-rd=0.6,0:deblock=0,0`],
  }),
  // AV1 Main, 10 bit 4:2:0 (the walk is mostly dark gradients, which band at 8 bit).
  av1: (def, crf) => ({
    pix: 'yuv420p10le',
    args: ['-c:v', 'libsvtav1', '-preset', '2', '-crf', String(crf), '-g', '9999', '-svtav1-params', 'tune=1:scd=0'],
  }),
};

function encodeOne(def, cache, ch, codec, crf, outFile) {
  const { pix, args: codecArgs } = CODECS[codec](def, crf);
  const vf = `settb=1/${TICKS},setpts='${ptsExpr(ch.frames)}',scale=in_range=full:out_range=limited:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=${pix},${COLOUR}`;
  const ff = spawn(
    FFMPEG,
    ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${def.w}x${def.h}`, '-framerate', String(FPS), '-i', 'pipe:0', '-vf', vf, '-fps_mode', 'passthrough', '-enc_time_base', `1/${TICKS}`, ...codecArgs, '-an', '-movflags', '+faststart', '-map_metadata', '-1', '-fflags', '+bitexact', outFile],
    { stdio: ['pipe', 'ignore', 'pipe'], env: { ...process.env, SVT_LOG: '1' } },
  );
  let err = '';
  ff.stderr.on('data', (d) => (err += d));
  const done = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${codec} ${ch.id}: exit ${code}\n${err}`))));
  });
  const feed = (async () => {
    for (const f of ch.frames) {
      const buf = await readFile(cache.file(f.name));
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
  })();
  return Promise.all([done, feed]).then(async () => (await stat(outFile)).size);
}

// All four files of a set in one codec at one quality. Returns their sizes.
async function encodeAll(def, cache, list, codec, crf, dir, tag = '') {
  const sizes = {};
  const queue = [...list];
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      for (let ch = queue.shift(); ch; ch = queue.shift()) sizes[ch.id] = await encodeOne(def, cache, ch, codec, crf, join(dir, `${ch.id}.${codec}${tag}.mp4`));
    }),
  );
  return sizes;
}
// What one visitor downloads: chapters 1 and 2, and the larger variant of chapter 3.
const visitor = (s) => s.c1 + s.c2 + Math.max(s.c3, s.c3s);

// The best quality whose visitor total fits: sizes fall by about half for every 5 steps of
// x264's quality scale and every 11 of SVT-AV1's, so a few encodes find it.
async function fit(def, cache, list, codec, room, dir) {
  const fixed = args[`crf-${codec}`];
  if (fixed !== undefined) return { crf: Number(fixed), sizes: await encodeAll(def, cache, list, codec, Number(fixed), dir) };
  const step = codec === 'h264' ? 0.5 : 1;
  const floor = def.best[codec];
  const tried = new Map();
  const at = async (crf) => {
    if (!tried.has(crf)) {
      const sizes = await encodeAll(def, cache, list, codec, crf, dir, '.try');
      tried.set(crf, sizes);
      console.log(`  ${codec} crf ${crf}: ${visitor(sizes)} bytes for one visitor (room ${room})`);
    }
    return tried.get(crf);
  };
  let crf = Math.max(floor, codec === 'h264' ? 29 : 44);
  for (let i = 0; i < 8; i++) {
    const total = visitor(await at(crf));
    // estimate the quality that fills the room, then settle within one step
    const next = clamp(Math.round((crf + (codec === 'h264' ? 5 : 11) * Math.log2(total / (room * 0.99))) / step) * step, floor, 60);
    if (next === crf || tried.has(next)) break;
    crf = next;
  }
  // the lowest quality number tried, or one step either side of it, that fits
  let best = [...tried.entries()].filter(([, s]) => visitor(s) <= room).sort((a, b) => a[0] - b[0])[0];
  while (!best) {
    crf = Math.max(...tried.keys()) + step;
    if (visitor(await at(crf)) <= room) best = [crf, tried.get(crf)];
  }
  while (best[0] - step >= floor && !tried.has(best[0] - step)) {
    const s = await at(best[0] - step);
    if (visitor(s) > room) break;
    best = [best[0] - step, s];
  }
  // the chosen quality again under the final names, the trials go
  const sizes = await encodeAll(def, cache, list, codec, best[0], dir);
  for (const f of await readdir(dir)) if (f.includes('.try.')) await rm(join(dir, f));
  return { crf: best[0], sizes };
}

// The `type` a <source> would carry: read from the file, not assumed.
function typeOf(file, codec) {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=profile,level,pix_fmt,codec_tag_string', '-of', 'json', file]).toString();
  const s = JSON.parse(out).streams[0];
  if (codec === 'h264') {
    const profile = { 'Constrained Baseline': '42e0', Baseline: '4200', Main: '4d00', High: '6400' }[s.profile];
    if (!profile) throw new Error(`${file}: H.264 profile ${s.profile}`);
    return `video/mp4; codecs="avc1.${profile}${Number(s.level).toString(16).padStart(2, '0')}"`;
  }
  // av01.P.LLT.DD: profile 0 (Main), level index as ffprobe reports it, Main tier, bit depth
  const depth = s.pix_fmt.includes('10') ? '10' : '08';
  return `video/mp4; codecs="av01.0.${String(s.level).padStart(2, '0')}M.${depth}"`;
}

// --- main ----------------------------------------------------------------------------------------
await extract();
const tl = timeline();
const [, , K3, K4] = tl.keys;
if (darkAt(K4, K3) !== 0) throw new Error('the held frame would be darkened');
const { steps, cum } = await motion(tl);
const perFrame = tl.keys.slice(1).map((k, s) => steps.slice(tl.keys[s], k).reduce((a, b) => a + b, 0) / (k - tl.keys[s]));
console.log(`timeline: ${tl.frames.length} frames, keyframes at ${tl.keys.join(', ')}; motion per frame in clips 1 to 4: ${perFrame.map((v) => v.toFixed(2)).join(', ')}`);
const list = chapters(tl);

const manifestFile = join(PUB, 'manifest.json');
let manifest = { version: 2, sets: {} };
if (args.set && (await exists(manifestFile))) {
  const have = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (have.version === 2) manifest = have;
}
manifest.grain = GRAIN;

for (const [set, def] of Object.entries(SETS)) {
  if (args.set && args.set !== set) continue;
  const cache = await render(set, def, tl, cum, K3, K4);
  if (args.frames) continue;
  const dst = join(PUB, def.dir);
  await rm(dst, { recursive: true, force: true });
  await mkdir(dst, { recursive: true });

  // the poses: the first frame and the last frame of each chapter, as stills; and the small poster
  const poses = [];
  let poseBytes = 0;
  for (const k of POSE_AT(tl).keys()) {
    const px = await readFile(cache.file(`pose${k}`));
    const buf = await image(px, ...def.look).webp({ quality: def.pose + darkBoost(lumaOf(px)), effort: 6, smartSubsample: true }).toBuffer();
    await writeFile(join(dst, `p${k}.webp`), buf);
    poses.push({ src: `${def.dir}/p${k}.webp`, bytes: buf.length });
    poseBytes += buf.length;
    if (k === 0) {
      const small = await image(px, ...def.look).resize(...def.poster).webp({ quality: 42, effort: 6 }).toBuffer();
      await writeFile(join(PUB, `poster-${def.dir}.webp`), small);
      poseBytes += small.length;
      manifest.sets[set] = { poster: `poster-${def.dir}.webp`, posterBytes: small.length };
    }
  }

  const room = def.budget - poseBytes;
  const result = {};
  for (const codec of CODEC_LIST) {
    console.log(`${set}: ${codec}, ${room} bytes of video for one visitor`);
    result[codec] = await fit(def, cache, list, codec, room, dst);
  }

  const cuesOf = (ch) => {
    const dur = ticksOf(ch.frames) / TICKS;
    // times in chapter 3 are those of the walk: the scare beat pushes everything after it back
    const beat = ch.scare ? (ch.scare.count * WALK_TICKS) / TICKS : 0;
    const beatAt = ch.scare ? (ch.scare.at * WALK_TICKS) / TICKS : Infinity;
    const at = (v) => (v < 0 ? dur + v : v >= beatAt ? v + beat : v);
    return CUES[ch.chapter].map((c) => ({ cap: c.cap, in: round(at(c.in)), ...(c.out !== undefined ? { out: round(at(c.out)) } : {}) }));
  };
  const files = {};
  for (const ch of list) {
    const ticks = ticksOf(ch.frames);
    files[ch.id] = {
      chapter: ch.chapter,
      frames: ch.frames.length,
      duration: seconds(ticks),
      cues: cuesOf(ch),
      sources: CODEC_LIST.map((codec) => ({ codec, src: `${def.dir}/${ch.id}.${codec}.mp4`, type: typeOf(join(dst, `${ch.id}.${codec}.mp4`), codec), bytes: result[codec].sizes[ch.id] })),
    };
    if (ch.scare) {
      // the beat: from the first held frame to the end of the last one, and the door rectangle
      const t0 = (ch.scare.at * WALK_TICKS) / TICKS;
      files[ch.id].scare = { at: round(t0), end: round(t0 + (ch.scare.count * WALK_TICKS) / TICKS), rect: [cache.rect.x, cache.rect.y, cache.rect.w, cache.rect.h] };
    }
  }
  manifest.sets[set] = { ...manifest.sets[set], w: def.w, h: def.h, fps: FPS, poseSize: def.look, poses: poses.map((p) => p.src), poseBytes: poses.map((p) => p.bytes), face: cache.face, quality: Object.fromEntries(CODEC_LIST.map((c) => [c, result[c].crf])), files };

  for (const codec of CODEC_LIST) {
    const s = result[codec].sizes;
    console.log(`${set} ${codec} (quality ${result[codec].crf}): ${list.map((ch) => `${ch.id} ${ch.frames.length} frames ${seconds(ticksOf(ch.frames))} s ${s[ch.id]} bytes`).join('; ')}`);
    console.log(`${set} ${codec}: one visitor downloads ${visitor(s) + poseBytes} bytes (${((visitor(s) + poseBytes) / 1048576).toFixed(2)} MB): video ${visitor(s)}, poses and poster ${poseBytes}; budget ${def.budget}`);
    if (visitor(s) + poseBytes > def.budget) throw new Error(`${set} ${codec} is over its budget`);
  }
}
if (!args.frames) {
  const text = `${JSON.stringify(manifest)}\n`;
  await mkdir(PUB, { recursive: true });
  await writeFile(manifestFile, text);
  console.log(`manifest ${text.length} bytes`);
}
