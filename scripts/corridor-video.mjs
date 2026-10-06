// Builds the corridor clip the site ships from the masters in corridor-src/ (see
// corridor-src/SOURCES.md for where those came from):
//   public/corridor/{d,m}/walk-door.{av1,h264}.mp4   the walk from door 301 to the last door, 313, with the
//                                                    door beat at 308: what a visitor sees the first time
//   public/corridor/{d,m}/walk.{av1,h264}.mp4        the same walk without the beat: what Replay plays
//   public/corridor/{d,m}/first.webp                 the first frame, as a still: what the stage shows before the clip
//   public/corridor/{d,m}/last.webp                  the last frame, the last door: what it shows after
//   public/corridor/{d,m}/still-1.webp, still-2.webp doors 304 and 305, for visitors who asked for reduced motion
//   public/corridor/poster-{d,m}.webp                the first frame, small: the only file that loads with the page
//   public/corridor/manifest.json                    what src/scripts/corridor.ts reads
// d is the landscape set (1600 x 900), m the phone set (a 4:5 window cut from the same frames,
// 896 x 1120; see FRAMINGS).
//
//   npm run corridor:video                          build everything
//   node scripts/corridor-video.mjs --set=mobile    one set only (the manifest keeps the other)
//   node scripts/corridor-video.mjs --frames        only render the finished frames into the cache
//   node scripts/corridor-video.mjs --crf-h264=24 --crf-av1=34   fixed quality instead of the search for the byte budget
//   node scripts/corridor-video.mjs --out=DIR       write there instead of public/corridor (for trials)
//   node scripts/corridor-video.mjs --fps=24        trial: the same cut with 24 pictures a second instead of 60
//   node scripts/corridor-video.mjs --framing=a     trial: another phone window (FRAMINGS)
//   node scripts/corridor-video.mjs --stills=DIR --at=0,60,123   trial: only these timeline frames of the phone
//                                                   set, finished, as WebP files (for scripts/corridor-shots.mjs)
//
// Needs ffmpeg with libx264 and libsvtav1 on the PATH (or FFMPEG=/path/to/ffmpeg). Frames are
// extracted once into corridor-src/.cache/ (gitignored, about 2 GB), and the finished frames
// are kept there too (about 4 GB), so a change to the cut or the encoder settings does not
// render again.
//
// The picture. Every frame is made exactly as the frames of the image sequence and of the
// chapter videos before this were made (the reviewed look): the four clips in order with the
// last three frames of each dissolving into the first frame of the next, the phone window, the
// sharpness evened out (corridor-even.cjs), the finishing pass (corridor-finish.cjs) with the
// extra darkening of the first two clips by timeline index, and for the scare the grade
// (corridor-grade.cjs), feathered into the held frame at door 308.
//
// The cut. The masters are 25 seconds of walking; the clip is 9. Frames are picked, never
// blended or interpolated, and each picked frame is shown for a whole number of sixtieths of a
// second, so a 60 Hz screen shows every one of them for the same time as its neighbours:
//   - the walk in clips 1 to 3: every frame, one sixtieth each. That is 2.5 times the speed it
//     was generated at, and nothing is dropped.
//   - the last clip was generated at half the pace of the others: every second frame, one
//     sixtieth each, which is the same 2.5 times in steps on the floor.
//   - at each numbered door the masters stand almost still for a second or more (the video
//     model eases into and out of every keyframe). Those frames are the slow part of the cut:
//     they are stretched or thinned to the time HOLD gives each door, and the easing the model
//     made around them is kept frame for frame.
//   - the scare beat is the same 15 frames at 24 frames a second: the held frame, 13 graded
//     frames of the scare clip, the held frame. It plays at the speed it was generated at.
// CUT below is where all of it is written down; the build prints the resulting times.
//
// Film grain. The finishing pass can add fine grain with a new pattern on every frame, and the
// reviewed frames had it. None of it is baked into the video or the stills (GRAIN below is 0),
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

// Time. One tick is 1/120 s: a picture of the walk lasts a multiple of 2 ticks (sixtieths of a
// second), a frame of the scare beat 5 (a twenty-fourth).
const TICKS = 120;
const FPS = args.fps ? Number(args.fps) : 60; // pictures a second in the walk, at most
const GRID = TICKS / FPS; // ticks from one picture of the walk to the next
const BEAT_TICKS = 5;
if (!Number.isFinite(GRID) || GRID < 2) throw new Error(`--fps=${args.fps}: 60 at most`);

// The cut (see the top of this file). Times are in sixtieths of a second per timeline frame.
//   still   a step of the timeline that moves the picture less than this (the motion measure
//           further down) belongs to a keyframe's stand-still
//   hold    how long the stand-still at each keyframe lasts in the cut, seconds: door 301 (the
//           clip starts on it, and the stage has shown it as a still before), 304, 305, 308
//           (the beat, when there is one, comes on top of this), 313 (the clip ends on it and
//           the still of it stays)
//   walk    what a moving frame of clips 1 to 3 gets, and of the last clip, which was generated
//           at half the pace
const CUT = { still: 1.5, hold: [0.3, 0.7, 0.7, 0.5, 0.7], walk: 1, last: 0.5 };
const LENGTH = [8, 10]; // what either variant of the clip may last, seconds

// How much of the reviewed film grain is baked into the frames (1 is all of it).
const GRAIN = args.grain !== undefined ? Number(args.grain) : 0;

// The phone window: a strip of the master, full height, that pans with the walk. `at` is where
// its centre is (x in master pixels) at timeline frames; between them it follows a monotone
// curve, so it never turns round between two points and never moves while the walk stands
// still. Three were tried (docs/screenshots/22-framing-*.jpg); `b` is the one that ships: 4:5,
// the widest that still shows the door plates at a size a phone can read.
// What each point is there for:
//   0, 14      door 301 and its plate, the edge of the light on the wall, the corridor beyond
//   106, 125   door 304 with its plate, and the far end with the green sign on the left
//   228, 255   door 305: plate, scratches, handle; the dark corridor to the right
//   348, 380   door 308: plate, handle, the gap the hand comes through, the lit wall beyond
//   450, 520   down the middle of the corridor, the far end in the centre
//   574, 611   door 313 with plate and handle, the exit doors and the sign to the right
const FRAMINGS = {
  a: { win: 1080, w: 720, h: 960, look: [900, 1200], poster: [360, 480], at: [[0, 1250], [14, 1250], [106, 1360], [125, 1360], [228, 1480], [255, 1480], [348, 1690], [380, 1690], [450, 1300], [520, 1330], [574, 1530], [611, 1530]] },
  b: { win: 1152, w: 896, h: 1120, look: [900, 1125], poster: [360, 450], at: [[0, 1290], [14, 1290], [106, 1370], [125, 1370], [228, 1490], [255, 1490], [348, 1690], [380, 1690], [450, 1300], [520, 1330], [574, 1560], [611, 1560]] },
  c: { win: 1440, w: 720, h: 720, look: [900, 900], poster: [360, 360], at: [[0, 1290], [14, 1290], [106, 1420], [125, 1420], [228, 1600], [255, 1600], [348, 1640], [380, 1640], [450, 1300], [520, 1330], [574, 1560], [611, 1560]] },
};
const FRAMING = FRAMINGS[args.framing ?? 'b'];
if (!FRAMING) throw new Error(`--framing=${args.framing}: one of ${Object.keys(FRAMINGS).join(', ')}`);
const WIN_W = FRAMING.win;

// seed: the finishing pass's grain seed for frame `index` of the old image sequence, which had
// `old` frames picked at equal steps of motion. budget: what one visitor may download, bytes:
// one variant of the clip, the poster and the two stills the stage rests on.
// look: the size the sharpness is evened out at and the stills are made at. The stage rests on
// a still, so on a phone the stills are larger than the video (900 px wide against 720).
// best: the quality that is good enough, per codec (the encoders' own scales, lower is better):
// a set whose budget allows better than this stops here instead of filling the budget.
// pose: WebP quality of the stills, before the lift dark pictures get (darkBoost below).
// codecs: best first for this set, as the page lists them in <source>. A phone takes H.264,
// which every phone decodes in hardware; AV1 is there for a browser without it. A desktop takes
// AV1 where it can, at two thirds of the bytes.
// level: the H.264 level the set's size and 60 pictures a second need.
const SETS = {
  desktop: { dir: 'd', w: 1600, h: 900, look: [1600, 900], poster: [640, 360], seed: 1000, old: 168, budget: 8_000_000, ref: 5, level: '4.2', best: { h264: 23, av1: 32 }, pose: 68, codecs: ['av1', 'h264'] },
  mobile: { dir: 'm', w: FRAMING.w, h: FRAMING.h, look: FRAMING.look, poster: FRAMING.poster, seed: 3000, old: 112, budget: 3_000_000, ref: 6, level: '4.0', best: { h264: 23, av1: 32 }, pose: 56, codecs: ['h264', 'av1'] },
};
const NEW_SEED = 20000; // plus the timeline index, for frames the old sequence did not have
const SCARE_SEED = 5000; // plus the clip frame number

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

// Captions: which one is up when, in seconds of the walk without the beat (a time after door
// 308 is moved back by the beat in the variant that has it). One at a time, in order, each up
// for CUE_MIN seconds or more, which leaves a second and a half fully shown between its fades
// (Corridor.astro: 0.2 s each way). The first is up as the walk leaves door 301, the second
// comes with door 304 and the third with the scratched door; it is gone before door 308 stands
// still. The fourth comes up on the way to the last door, and stays.
const CUES = [
  { cap: 0, in: 0.15, out: 2.05 },
  { cap: 1, in: 2.35, out: 4.25 },
  { cap: 2, in: 4.55, out: 6.45 },
  { cap: 3, in: 7.05 },
];
const CUE_MIN = 1.9;

const pad = (n, w = 3) => String(n).padStart(w, '0');
const exists = (p) => stat(p).then(() => true, () => false);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
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
// It says where the walk stands still (the cut), and it is what the old sequence was sampled
// by. The small frames are kept in one cache file.
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

// A monotone cubic through the points (Fritsch and Carlson): it passes through every one of
// them, never overshoots, has no corner, and between two points at the same height it does
// not move at all.
function curve(points) {
  const x = points.map((p) => p[0]);
  const y = points.map((p) => p[1]);
  const n = x.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m.push(0);
    else {
      const a = 2 * (x[i + 1] - x[i]) + (x[i] - x[i - 1]);
      const b = x[i + 1] - x[i] + 2 * (x[i] - x[i - 1]);
      m.push((a + b) / (a / d[i - 1] + b / d[i]));
    }
  }
  m.push(d[n - 2]);
  return (t) => {
    let i = 0;
    while (i < n - 2 && t > x[i + 1]) i++;
    const h = x[i + 1] - x[i];
    const u = clamp((t - x[i]) / h, 0, 1);
    return (2 * u ** 3 - 3 * u ** 2 + 1) * y[i] + (u ** 3 - 2 * u ** 2 + u) * h * m[i] + (-2 * u ** 3 + 3 * u ** 2) * y[i + 1] + (u ** 3 - u ** 2) * h * m[i + 1];
  };
}
// The phone window's left edge for a timeline index.
const windowCentre = curve(FRAMING.at);
const windowLeft = (i) => clamp(Math.round(windowCentre(i) - WIN_W / 2), 0, W - WIN_W);

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
  const key = JSON.stringify({ tl: tl.frames, w: def.w, h: def.h, look: def.look, stills: STILL_AT(tl), grain: GRAIN, window: set === 'mobile' ? [WIN_W, FRAMING.at] : null, pick: SCARE_PICK, face: face ? (await stat(face)).size + ':' + (await stat(face)).mtimeMs : null });
  const old = oldPicks(cum, K4, def.old);
  const seedOf = (t) => {
    const i = old.indexOf(t);
    return i >= 0 ? def.seed + i : def.seed + NEW_SEED + t;
  };
  const left = (t) => (set === 'mobile' ? windowLeft(t) : 0);
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
        // a still: the same frame, finished at the look size
        const k = STILL_AT(tl).indexOf(t);
        if (k >= 0) await writeFile(file(`still${k}`), finish(await evenSharpness(plain, lw, lh), lw, lh, seedOf(t), darkAt(t, K3), GRAIN));
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

// The stills (timeline indices): the first frame, doors 304 and 305, the last frame.
function STILL_AT(tl) {
  return [0, tl.keys[1], tl.keys[2], tl.keys[4]];
}
const STILL_NAMES = ['first', 'still-1', 'still-2', 'last'];

// --- the cut ---------------------------------------------------------------------------------------
// The clip is a list of frames, each with the time it is shown for, in ticks.
// Every timeline frame is first given the time it would get if all of them were shown: a
// moving frame CUT.walk sixtieths (CUT.last in the last clip), and the frames of the
// stand-still around a keyframe share that keyframe's CUT.hold. Then one frame is picked for
// every picture of the clip, FPS a second: the one whose time has come. Where the times are
// whole sixtieths every frame is picked once; in the last clip, every second one.
// The walk is cut in two at door 308, so that the held frame there is picked whatever the
// times around it are: the beat goes in between the two halves.
function cut(tl, steps) {
  const [K1, K2, K3, K4, K5] = tl.keys;
  const n = tl.frames.length;
  const on = Array.from({ length: n }, (_, i) => (i > K4 ? CUT.last : CUT.walk));
  // the stand-still around each keyframe: as far as the picture moves less than CUT.still a step
  const zones = [K1, K2, K3, K4, K5].map((k, j) => {
    let a = k;
    let b = k;
    while (a > 0 && steps[a - 1] < CUT.still) a--;
    while (b < n - 1 && steps[b] < CUT.still) b++;
    for (let i = a; i <= b; i++) on[i] = (CUT.hold[j] * 60) / (b - a + 1);
    return [a, b];
  });
  // frames a to b, and the pictures they make: `late` is how far into its first picture the
  // stretch starts, in sixtieths
  const part = (a, b, lastOne) => {
    const start = [0];
    for (let i = a; i <= b; i++) start.push(start[start.length - 1] + on[i]);
    const pictures = Math.max(1, Math.round((start[start.length - 1] * 2) / GRID));
    const out = [];
    let i = 0;
    for (let p = 0; p < pictures; p++) {
      const at = (p * GRID) / 2;
      while (i < b - a && start[i + 1] <= at + 1e-9) i++;
      const t = p === pictures - 1 ? lastOne : a + i;
      if (out.length && out[out.length - 1].t === t) out[out.length - 1].ticks += GRID;
      else out.push({ t, name: `t${pad(t, 4)}`, ticks: GRID });
    }
    return out;
  };
  const to308 = part(0, K4, K4);
  const on313 = part(K4 + 1, K5, K5);
  const beat = SCARE_PICK.map((_, j) => ({ name: `s${pad(j, 2)}`, ticks: BEAT_TICKS }));
  return {
    zones,
    // when a timeline frame comes up, in seconds of the walk without the beat
    time: (t) => {
      let ticks = 0;
      for (const f of [...to308, ...on313]) {
        if (f.t >= t) break;
        ticks += f.ticks;
      }
      return ticks / TICKS;
    },
    clips: [
      { id: 'walk-door', variant: 'scare', scare: { at: to308.length, count: beat.length }, frames: [...to308, ...beat, ...on313] },
      { id: 'walk', variant: 'plain', frames: [...to308, ...on313] },
    ],
  };
}
const ticksOf = (frames) => frames.reduce((s, f) => s + f.ticks, 0);
const seconds = (ticks) => round(ticks / TICKS, 4);

// --- encoding ------------------------------------------------------------------------------------
// The frames are piped to ffmpeg as raw RGB, and their times are set there from the tick list,
// so the file carries the exact time of every frame. The time of frame N is written as one
// flat sum: the first frame's duration times N, plus, wherever the duration changes, the
// change times the number of frames since.
function ptsExpr(frames) {
  let expr = `${frames[0].ticks}*N`;
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].ticks - frames[i - 1].ticks;
    if (d) expr += `${d > 0 ? '+' : '-'}${Math.abs(d)}*max(N-${i}\\,0)`;
  }
  return expr;
}

// How the files say their colours are to be read: BT.709 primaries and matrix, video range,
// and the sRGB transfer curve, which is what the frames are in (they are made from PNGs). With
// the usual BT.709 curve written there instead, Safari and Chrome with a hardware decoder show
// the video two to four levels lighter than the stills next to it (measured on the built page:
// a still against the first frame of the video that starts on it), and the clip would start
// and end with a small jump in brightness. ffmpeg takes these from the filter, not from
// output options.
const COLOUR = 'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=iec61966-2-1';

const CODECS = {
  // H.264 High, 8 bit 4:2:0: what every iPhone and every Android phone decodes in hardware
  // (the phone set is level 4.0; the landscape set needs 4.2 for its size at 60 pictures a
  // second). One keyframe, the first frame (the clip only ever starts from there), reference
  // frames within the level's limit.
  h264: (def, crf) => ({
    pix: 'yuv420p',
    args: ['-c:v', 'libx264', '-preset', 'veryslow', '-profile:v', 'high', '-level:v', def.level, '-crf', String(crf), '-g', '9999', '-keyint_min', '9999', '-sc_threshold', '0', '-x264-params', `ref=${def.ref}:aq-mode=3:aq-strength=0.8:psy-rd=0.6,0:deblock=0,0`],
  }),
  // AV1 Main, 10 bit 4:2:0 (the walk is mostly dark gradients, which band at 8 bit).
  av1: (def, crf) => ({
    pix: 'yuv420p10le',
    args: ['-c:v', 'libsvtav1', '-preset', '2', '-crf', String(crf), '-g', '9999', '-svtav1-params', 'tune=1:scd=0'],
  }),
};

async function encodeOne(def, cache, ch, codec, crf, outFile) {
  const { pix, args: codecArgs } = CODECS[codec](def, crf);
  // (the filter chain goes in a file: the time expression is too long for a command line)
  const script = `${outFile}.filter`;
  await writeFile(script, `settb=1/${TICKS},setpts='${ptsExpr(ch.frames)}',scale=in_range=full:out_range=limited:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=${pix},${COLOUR}`);
  const ff = spawn(
    FFMPEG,
    ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${def.w}x${def.h}`, '-framerate', String(FPS), '-i', 'pipe:0', '-/filter:v', script, '-fps_mode', 'passthrough', '-enc_time_base', `1/${TICKS}`, ...codecArgs, '-an', '-movflags', '+faststart', '-map_metadata', '-1', '-fflags', '+bitexact', outFile],
    { stdio: ['pipe', 'ignore', 'pipe'], env: { ...process.env, SVT_LOG: '1' } },
  );
  let err = '';
  ff.stderr.on('data', (d) => (err += d));
  ff.stdin.on('error', () => {}); // ffmpeg gave up: its own message, below, says why
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
  await Promise.all([done, feed]);
  await rm(script);
  return (await stat(outFile)).size;
}

// Both variants of a set in one codec at one quality. Returns their sizes.
async function encodeAll(def, cache, list, codec, crf, dir, tag = '') {
  const sizes = {};
  await Promise.all(list.map(async (ch) => (sizes[ch.id] = await encodeOne(def, cache, ch, codec, crf, join(dir, `${ch.id}.${codec}${tag}.mp4`)))));
  return sizes;
}
// What one visitor downloads: one variant. The one with the beat is the longer of the two.
const visitor = (s) => Math.max(...Object.values(s));

// The best quality whose visitor total fits: sizes fall by about half for every 5 steps of
// x264's quality scale and every 11 of SVT-AV1's, so a few encodes find it. The search is made
// with the longer variant alone; the other is encoded once, at the quality found.
async function fit(def, cache, list, codec, room, dir) {
  const fixed = args[`crf-${codec}`];
  if (fixed !== undefined) return { crf: Number(fixed), sizes: await encodeAll(def, cache, list, codec, Number(fixed), dir) };
  const step = codec === 'h264' ? 0.5 : 1;
  const floor = def.best[codec];
  const long = list.filter((ch) => ch.scare);
  const tried = new Map();
  const at = async (crf) => {
    if (!tried.has(crf)) {
      const sizes = await encodeAll(def, cache, long, codec, crf, dir, '.try');
      tried.set(crf, sizes);
      console.log(`  ${codec} crf ${crf}: ${visitor(sizes)} bytes for one visitor (room ${room})`);
    }
    return tried.get(crf);
  };
  let crf = Math.max(floor, codec === 'h264' ? 26 : 38);
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
const made = cut(tl, steps);
const list = made.clips;

// what the cut came to: lengths, the frames kept, and when each door stands still
const beatSeconds = (SCARE_PICK.length * BEAT_TICKS) / TICKS;
const beatAt = made.time(K4 + 1);
const DOORS = [301, 304, 305, 308, 313];
for (const ch of list) {
  const length = ticksOf(ch.frames) / TICKS;
  const walked = ch.frames.filter((f) => f.t !== undefined);
  console.log(`${ch.id}: ${seconds(ticksOf(ch.frames))} s, ${ch.frames.length} frames (${walked.length} of the ${tl.frames.length} of the walk${ch.scare ? `, ${ch.scare.count} of the beat` : ''}), ${FPS} pictures a second at most`);
  if (length < LENGTH[0] || length > LENGTH[1]) throw new Error(`${ch.id} lasts ${length.toFixed(2)} s: it has to be ${LENGTH[0]} to ${LENGTH[1]}`);
}
{
  // how far the picture moves from one picture of the walk to the next (the motion measure,
  // summed over the timeline frames in between): what the eye reads as smooth or as stepping
  const walked = list[1].frames;
  const moves = walked.slice(1).map((f, i) => steps.slice(walked[i].t, f.t).reduce((a, b) => a + b, 0));
  const sorted = [...moves].sort((a, b) => a - b);
  console.log(`from one picture to the next the walk moves ${(moves.reduce((a, b) => a + b, 0) / moves.length).toFixed(1)} on average, ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)} at the 95th percentile, ${sorted[sorted.length - 1].toFixed(1)} at most`);
}
console.log(`stand-stills: ${made.zones.map(([a, b], j) => `door ${DOORS[j]} frames ${a} to ${b}, ${made.time(a).toFixed(2)} to ${(j === 4 ? made.time(b) + GRID / TICKS : made.time(b + 1)).toFixed(2)} s`).join('; ')}; the beat at ${beatAt.toFixed(2)} s`);
// the captions: one at a time, long enough, and none of them over the beat
const cuesOf = (ch) => {
  const at = (v) => round(ch.scare && v >= beatAt ? v + beatSeconds : v);
  return CUES.map((c) => ({ cap: c.cap, in: at(c.in), ...(c.out !== undefined ? { out: at(c.out) } : {}) }));
};
for (const ch of list) {
  const length = ticksOf(ch.frames) / TICKS;
  const cues = cuesOf(ch);
  cues.forEach((c, i) => {
    const out = c.out ?? length;
    if (out - c.in < CUE_MIN) throw new Error(`${ch.id}: caption ${c.cap + 1} is up for ${(out - c.in).toFixed(2)} s`);
    if (i && c.in < cues[i - 1].out) throw new Error(`${ch.id}: caption ${c.cap + 1} comes before caption ${c.cap} has gone`);
    if (ch.scare && c.in < beatAt + beatSeconds && out > beatAt) throw new Error(`${ch.id}: caption ${c.cap + 1} is up while door 308 opens`);
  });
}

// trial: some frames of the phone set, finished, as pictures
if (args.stills) {
  const def = SETS.mobile;
  const [lw, lh] = def.look;
  const dir = String(args.stills);
  await mkdir(dir, { recursive: true });
  for (const t of String(args.at ?? tl.keys.join(',')).split(',').map(Number)) {
    const plain = await blend(tl.frames[t], FIT.mobile(windowLeft(t)));
    const px = finish(await evenSharpness(plain, lw, lh), lw, lh, def.seed + NEW_SEED + t, darkAt(t, K3), GRAIN);
    await image(px, lw, lh).webp({ quality: 80 }).toFile(join(dir, `t${pad(t, 4)}.webp`));
  }
  await writeFile(join(dir, 'frames.json'), JSON.stringify({ win: WIN_W, w: lw, h: lh, time: Object.fromEntries(String(args.at ?? tl.keys.join(',')).split(',').map((t) => [t, round(made.time(Number(t)), 2)])) }));
  console.log(`stills in ${dir}`);
  process.exit(0);
}

const manifestFile = join(PUB, 'manifest.json');
let manifest = { version: 3, sets: {} };
if (args.set && (await exists(manifestFile))) {
  const have = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (have.version === 3) manifest = have;
}
manifest.grain = GRAIN;

for (const [set, def] of Object.entries(SETS)) {
  if (args.set && args.set !== set) continue;
  const cache = await render(set, def, tl, cum, K3, K4);
  if (args.frames) continue;
  const dst = join(PUB, def.dir);
  await rm(dst, { recursive: true, force: true });
  await mkdir(dst, { recursive: true });

  // the stills, and the small poster
  const stills = [];
  let restBytes = 0; // what the stage rests on: the poster, the first frame and the last
  for (const [k, name] of STILL_NAMES.entries()) {
    const px = await readFile(cache.file(`still${k}`));
    const buf = await image(px, ...def.look).webp({ quality: def.pose + darkBoost(lumaOf(px)), effort: 6, smartSubsample: true }).toBuffer();
    await writeFile(join(dst, `${name}.webp`), buf);
    stills.push({ name, src: `${def.dir}/${name}.webp`, bytes: buf.length });
    if (name === 'first' || name === 'last') restBytes += buf.length;
    if (name === 'first') {
      const small = await image(px, ...def.look).resize(...def.poster).webp({ quality: 42, effort: 6 }).toBuffer();
      await writeFile(join(PUB, `poster-${def.dir}.webp`), small);
      restBytes += small.length;
      manifest.sets[set] = { poster: `poster-${def.dir}.webp`, posterBytes: small.length };
    }
  }

  const room = def.budget - restBytes;
  const codecs = def.codecs.filter((c) => !args.codec || args.codec === c);
  const result = {};
  for (const codec of codecs) {
    console.log(`${set}: ${codec}, ${room} bytes of video for one visitor`);
    result[codec] = await fit(def, cache, list, codec, room, dst);
  }

  const clips = {};
  for (const ch of list) {
    const ticks = ticksOf(ch.frames);
    clips[ch.variant] = {
      frames: ch.frames.length,
      duration: seconds(ticks),
      cues: cuesOf(ch),
      sources: codecs.map((codec) => ({ codec, src: `${def.dir}/${ch.id}.${codec}.mp4`, type: typeOf(join(dst, `${ch.id}.${codec}.mp4`), codec), bytes: result[codec].sizes[ch.id] })),
    };
    // the beat: from the first held frame to the end of the last one, and the door rectangle
    if (ch.scare) clips[ch.variant].scare = { at: round(beatAt), end: round(beatAt + beatSeconds), rect: [cache.rect.x, cache.rect.y, cache.rect.w, cache.rect.h] };
  }
  const src = (name) => stills.find((p) => p.name === name).src;
  manifest.sets[set] = {
    ...manifest.sets[set],
    w: def.w,
    h: def.h,
    fps: FPS,
    stillSize: def.look,
    first: src('first'),
    last: src('last'),
    stills: [src('still-1'), src('still-2')],
    stillBytes: Object.fromEntries(stills.map((p) => [p.name, p.bytes])),
    ...(set === 'mobile' ? { window: WIN_W } : {}),
    face: cache.face,
    quality: Object.fromEntries(codecs.map((c) => [c, result[c].crf])),
    clips,
  };

  for (const codec of codecs) {
    const s = result[codec].sizes;
    console.log(`${set} ${codec} (quality ${result[codec].crf}): ${list.map((ch) => `${ch.id} ${ch.frames.length} frames ${seconds(ticksOf(ch.frames))} s ${s[ch.id]} bytes`).join('; ')}`);
    console.log(`${set} ${codec}: one visitor downloads ${visitor(s) + restBytes} bytes (${((visitor(s) + restBytes) / 1048576).toFixed(2)} MB): video ${visitor(s)}, poster and two stills ${restBytes}; budget ${def.budget}`);
    if (visitor(s) + restBytes > def.budget) throw new Error(`${set} ${codec} is over its budget`);
  }
}
if (!args.frames) {
  const text = `${JSON.stringify(manifest)}\n`;
  await mkdir(PUB, { recursive: true });
  await writeFile(manifestFile, text);
  console.log(`manifest ${text.length} bytes`);
}
