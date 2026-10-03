// Turns the rendered PNGs in corridor3d/out/ into the frames the site ships:
//   public/corridor/d/NNN.avif     desktop walk (landscape)
//   public/corridor/m/NNN.webp     mobile walk (portrait)
//   public/corridor/{d,m}/s/f-NN.* scare patches with the stand-in face
//   public/corridor/{d,m}/s/g-NN.* scare patches with an empty gap (for a supplied photo)
//   public/corridor/poster-{d,m}.webp  first frame, small, loads with the page
//   public/corridor/manifest.json  what the scrubber reads
//
//   node corridor3d/encode.mjs            encode what has been rendered
//   node corridor3d/encode.mjs --dummy    numbered placeholder frames (no GPU needed)
import sharp from 'sharp';
import { mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './server.mjs';
import { SETS, SCARE_FRAMES, SCARE_FPS, scareFrameIndex } from './src/layout.js';

const args = process.argv.slice(2);
const dummy = args.includes('--dummy');
const OUT = join(ROOT, 'corridor3d', dummy ? 'out-dummy' : 'out');
const PUB = join(ROOT, 'public', 'corridor');
const pad = (n, w = 3) => String(n).padStart(w, '0');
const exists = (p) => stat(p).then(() => true, () => false);

// Format per set. Desktop: AVIF (dark, grainy footage is where it wins: about a third smaller
// than WebP at the same quality). Mobile: WebP, which phones decode faster.
// Dark frames get a higher quality: at the base setting the encoders smooth the grain out of
// the shadows and leave flat, blocky steps there. `dark` is the mean luma (0..255) of the frame.
const darkBoost = (dark) => (dark < 22 ? 12 : dark < 40 ? 8 : dark < 60 ? 4 : 0);
const FORMAT = {
  desktop: { ext: 'avif', encode: (img, dark = 255) => img.avif({ quality: 56 + darkBoost(dark), effort: 7, chromaSubsampling: '4:2:0' }) },
  mobile: { ext: 'webp', encode: (img, dark = 255) => img.webp({ quality: 56 + darkBoost(dark), effort: 6, smartSubsample: true }) },
};
const meanLuma = async (file) => {
  const { channels } = await sharp(file).stats();
  return 0.299 * channels[0].mean + 0.587 * channels[1].mean + 0.114 * channels[2].mean;
};
const POSTER = { desktop: [640, 360], mobile: [360, 720] };

// --- placeholder frames, for building the scrubber without waiting for a render -------------
async function makeDummy() {
  for (const [set, def] of Object.entries(SETS)) {
    const walk = join(OUT, set, 'walk');
    const scare = join(OUT, set, 'scare');
    await mkdir(walk, { recursive: true });
    await mkdir(scare, { recursive: true });
    const frame = (label, extra = '') =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${def.w}" height="${def.h}">
          <rect width="100%" height="100%" fill="#3a2a1c"/>
          <rect x="${def.w * 0.3}" y="${def.h * 0.2}" width="${def.w * 0.4}" height="${def.h * 0.6}" fill="#6a5030"/>
          <text x="50%" y="52%" font-size="${def.h * 0.12}" fill="#e8d8b0" text-anchor="middle" font-family="monospace">${label}</text>${extra}
        </svg>`,
      );
    for (let i = 0; i < def.frames; i++) {
      const f = join(walk, `${pad(i)}.png`);
      if (!(await exists(f))) await sharp(frame(`${set[0]} ${i}`)).png().toFile(f);
    }
    const idx = scareFrameIndex(set);
    await sharp(frame(`${set[0]} ${idx}`)).png().toFile(join(scare, 'hold.png'));
    const quads = [];
    for (let j = 0; j < SCARE_FRAMES; j++) {
      const open = Math.sin((j / (SCARE_FRAMES - 1)) * Math.PI);
      const x = 0.78;
      const gap = 0.05 * open;
      quads.push({ quad: [[x - 0.02, 0.5], [x + 0.05, 0.5], [x + 0.05, 0.66], [x - 0.02, 0.66]], clip: [[x, 0.45], [x + gap, 0.45], [x + gap, 0.7], [x, 0.7]] });
      if (j === 0 || j === SCARE_FRAMES - 1) continue;
      for (const variant of ['face', 'gap']) {
        const extra = `<rect x="${def.w * x}" y="${def.h * 0.2}" width="${def.w * gap}" height="${def.h * 0.6}" fill="#050505"/>${
          variant === 'face' ? `<circle cx="${def.w * (x + gap / 2)}" cy="${def.h * 0.58}" r="${def.w * 0.012}" fill="#d8d0c8"/>` : ''
        }`;
        await sharp(frame(`${set[0]} ${idx}`, extra)).png().toFile(join(scare, `${variant}-${pad(j)}.png`));
      }
    }
    await writeFile(join(scare, 'meta.json'), JSON.stringify({ set, index: idx, frames: SCARE_FRAMES, quads }));
  }
}

// --- scare patches ---------------------------------------------------------------------------
// The scare frames are full renders from the held camera with the same noise seed, so they
// differ from the held frame only around the door. Find that region, feather its edge, and
// ship just the patch: it is drawn over the walk frame it was cut from.
async function patchRect(dir, w, h) {
  const hold = await sharp(join(dir, 'hold.png')).removeAlpha().raw().toBuffer();
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  const files = (await readdir(dir)).filter((f) => /^(face|gap)-\d+\.png$/.test(f));
  for (const f of files) {
    const img = await sharp(join(dir, f)).removeAlpha().raw().toBuffer();
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 3;
        const d = Math.abs(img[i] - hold[i]) + Math.abs(img[i + 1] - hold[i + 1]) + Math.abs(img[i + 2] - hold[i + 2]);
        if (d > 30) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  }
  if (x1 <= x0) return null;
  const m = 28; // margin for the feather
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(w, x1 + m);
  y1 = Math.min(h, y1 + m);
  // even numbers keep the chroma planes aligned
  x0 -= x0 % 2;
  y0 -= y0 % 2;
  return { x: x0, y: y0, w: x1 - x0 + ((x1 - x0) % 2), h: y1 - y0 + ((y1 - y0) % 2), hold };
}

// The patch is laid over the shipped walk frame, so its feathered edge must blend into that
// frame and not into the held render. The two are the same picture, but they need not carry
// exactly the same noise (they come from different runs), and a patch edge that changes the
// grain would show as a rectangle while the door moves.
async function withBase(rect, file) {
  if (!(await exists(file))) return rect;
  return { ...rect, base: await sharp(file).removeAlpha().raw().toBuffer() };
}

async function patch(dir, file, rect, w, h) {
  const img = await sharp(join(dir, file)).removeAlpha().raw().toBuffer();
  const { x, y } = rect;
  const hold = rect.base ?? rect.hold;
  const pw = Math.min(rect.w, w - x);
  const ph = Math.min(rect.h, h - y);
  const out = Buffer.alloc(pw * ph * 3);
  const f = 20; // feather width in pixels
  for (let j = 0; j < ph; j++) {
    for (let i = 0; i < pw; i++) {
      // the frame edge needs no feather: there is nothing beyond it to blend into
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
  return sharp(out, { raw: { width: pw, height: ph, channels: 3 } });
}

// --- main ----------------------------------------------------------------------------------------
if (dummy) await makeDummy();
const manifest = { version: 1, sets: {} };
const totals = {};
for (const [set, def] of Object.entries(SETS)) {
  const fmt = FORMAT[set];
  const src = join(OUT, set, 'walk');
  if (!(await exists(src))) {
    console.log(`${set}: nothing rendered, skipped`);
    continue;
  }
  const dst = join(PUB, def.dir);
  await rm(dst, { recursive: true, force: true });
  await mkdir(join(dst, 's'), { recursive: true });
  let bytes = 0;
  let count = 0;
  const files = (await readdir(src)).filter((f) => f.endsWith('.png')).sort();
  if (files.length !== def.frames) console.log(`${set}: ${files.length} of ${def.frames} frames rendered`);
  // encode in parallel, a few at a time
  const queue = [...files];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        const buf = await fmt.encode(sharp(join(src, f)), await meanLuma(join(src, f))).toBuffer();
        await writeFile(join(dst, f.replace('.png', `.${fmt.ext}`)), buf);
        bytes += buf.length;
        count++;
      }
    }),
  );
  // poster: the first frame, small
  const [pw, ph] = POSTER[set];
  const poster = await sharp(join(src, files[0])).resize(pw, ph).webp({ quality: 42, effort: 6 }).toBuffer();
  await writeFile(join(PUB, `poster-${def.dir}.webp`), poster);

  const entry = { dir: def.dir, ext: fmt.ext, w: def.w, h: def.h, frames: def.frames, poster: `poster-${def.dir}.webp`, scare: null };
  // scare
  const sdir = join(OUT, set, 'scare');
  let sbytes = 0;
  let scount = 0;
  if (await exists(join(sdir, 'meta.json'))) {
    const meta = JSON.parse(await readFile(join(sdir, 'meta.json'), 'utf8'));
    const found = await patchRect(sdir, def.w, def.h);
    const rect = found && (await withBase(found, join(src, `${pad(meta.index)}.png`)));
    if (rect) {
      const has = { face: [], gap: [] };
      const holdLuma = await meanLuma(join(src, `${pad(meta.index)}.png`)).catch(() => 255);
      for (const variant of ['face', 'gap']) {
        for (let j = 0; j < SCARE_FRAMES; j++) {
          const f = `${variant}-${pad(j)}.png`;
          if (!(await exists(join(sdir, f)))) {
            has[variant].push(0);
            continue;
          }
          const img = await patch(sdir, f, rect, def.w, def.h);
          const buf = await fmt.encode(img, holdLuma).toBuffer();
          await writeFile(join(dst, 's', `${variant[0]}-${pad(j, 2)}.${fmt.ext}`), buf);
          sbytes += buf.length;
          scount++;
          has[variant].push(1);
        }
      }
      const round = (p) => p.map(([a, b]) => [Math.round(a * 1e4) / 1e4, Math.round(b * 1e4) / 1e4]);
      entry.scare = {
        frame: meta.index,
        fps: SCARE_FPS,
        count: SCARE_FRAMES,
        rect: [rect.x, rect.y, Math.min(rect.w, def.w - rect.x), Math.min(rect.h, def.h - rect.y)],
        has: has.face,
        quads: meta.quads.map((q) => (q ? { quad: round(q.quad), clip: round(q.clip) } : null)),
      };
    }
  }
  manifest.sets[set] = entry;
  totals[set] = { frames: count, bytes, scareFiles: scount, scareBytes: sbytes, poster: poster.length };
  console.log(
    `${set}: ${count} frames ${(bytes / 1048576).toFixed(2)} MB (${bytes} bytes, avg ${(bytes / count / 1024).toFixed(1)} KB), scare ${scount} patches ${(sbytes / 1024).toFixed(0)} KB (${sbytes} bytes), poster ${poster.length} bytes`,
  );
}
await writeFile(join(PUB, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
await writeFile(join(ROOT, 'corridor3d', 'out', dummy ? 'totals-dummy.json' : 'totals.json'), JSON.stringify(totals, null, 1)).catch(() => {});
