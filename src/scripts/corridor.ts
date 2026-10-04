// The corridor. A walk down the third floor by torchlight, made offline from generated video
// (see corridor-src/SOURCES.md and scripts/corridor-frames.mjs) and shipped as an image
// sequence: scroll progress picks the frame, a 2D canvas shows it. Two sets, landscape and
// portrait, chosen by the viewport and never by the user agent.
//
// What keeps it off the main thread:
//   - frames are fetched as blobs and decoded with createImageBitmap, off the main thread
//   - only a small window of decoded frames around the walker is kept; the rest stay compressed
//   - the canvas is drawn only when the frame to show changes, inside requestAnimationFrame
//   - the backing store is never larger than the part of the frame it shows
//   - nothing of the sequence is requested until the first input, or until the page has been
//     idle well after load (and then only every 8th frame). One small poster loads with the page.
//
// Once per browser session, on the first pass, door 308 opens a hand's width for 625 ms. The
// walk frame holds while the patches play, and the picture pushes in slowly towards the door (a
// CSS transform, done by the compositor), so the walk never looks frozen. Afterwards it is a
// closed door like the others, and the patches are let go.
import { ScrollTrigger } from './scroll';
import { still, once } from './env';
import { doorCreak } from './audio';

interface Quad {
  quad: number[][];
  clip: number[][];
}
interface ScareInfo {
  frame: number;
  fps: number;
  count: number;
  rect: [number, number, number, number];
  has: number[];
  quads: (Quad | null)[];
}
interface SetInfo {
  dir: string;
  ext: string;
  w: number;
  h: number;
  frames: number;
  poster: string;
  scare: ScareInfo | null;
}
type SetName = 'desktop' | 'mobile';
interface Manifest {
  sets: Partial<Record<SetName, SetInfo>>;
}
type Drawable = ImageBitmap | HTMLImageElement;
interface Pick {
  bmp: Drawable;
  idx: number;
  q: 'full' | 'near' | 'coarse' | 'poster';
}

const SCARE_KEY = 'hotel:scare';
const KEY = 8; // every 8th frame is fetched first and kept as a small stand-in
const STILL_AT = 0.1; // the frame shown to visitors who asked for reduced motion

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const pad = (n: number, w = 3) => String(n).padStart(w, '0');

// Frame order for progressive loading: every 8th, then every 4th, every 2nd, the rest.
function coarseOrder(n: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (i: number) => {
    if (i >= 0 && i < n && !seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  };
  for (const step of [KEY, KEY / 2, KEY / 4, 1]) {
    for (let i = 0; i < n; i += step) add(i);
    add(n - 1);
  }
  return out;
}

// One image sequence: what has been fetched, what is decoded, what to show for a frame.
class Sequence {
  private blobs: (Blob | undefined)[];
  private state: Uint8Array; // 0 not asked, 1 on its way, 2 here, 3 failed
  private full = new Map<number, ImageBitmap>();
  private small = new Map<number, ImageBitmap>();
  private decoding = new Set<number>();
  private order: number[];
  private cursor = 0;
  private active = 0;
  private running = false;
  private everything = false;
  private only: number[] | null = null;
  private centre = 0;
  private dir = 1;
  private dead = false;
  loaded = 0;

  constructor(
    readonly info: SetInfo,
    private base: string,
    private mobile: boolean,
    private onChange: () => void,
    private onBroken: () => void,
  ) {
    this.blobs = new Array(info.frames);
    this.state = new Uint8Array(info.frames);
    this.order = coarseOrder(info.frames);
  }

  url(i: number) {
    return `${this.base}${this.info.dir}/${pad(i)}.${this.info.ext}`;
  }
  // The decoded window. A phone frame is 900 x 1800 (6.5 MB decoded): at most 6 ahead, 2 behind
  // and 1 of slack either side are kept, 11 bitmaps, about 70 MB. Everything else stays compressed.
  private get ahead() {
    return this.mobile ? 6 : 10;
  }
  private get behind() {
    return this.mobile ? 2 : 5;
  }
  private get slack() {
    return this.mobile ? 1 : 3;
  }

  // Start fetching. `only`: just these frames (the still, or the idle head start).
  start(everything: boolean, only: number[] | null = null) {
    if (this.dead) return;
    this.only = only;
    if (everything) this.everything = true;
    this.running = true;
    this.pump();
  }

  private next(): number {
    if (this.only) {
      for (const i of this.only) if (this.state[i] === 0) return i;
      if (!this.everything) return -1;
    }
    // 1. the coarse pass: every 8th frame, so there is always something near to show
    while (this.cursor < this.order.length) {
      const i = this.order[this.cursor];
      if (this.state[i] !== 0) {
        this.cursor++;
        continue;
      }
      if (i % KEY !== 0 && i !== this.info.frames - 1) break;
      return i;
    }
    if (!this.everything) return -1;
    // 2. what the walker is about to need
    for (let d = 0; d <= this.ahead; d++) {
      for (const i of d === 0 ? [this.centre] : [this.centre + d * this.dir, this.centre - d * this.dir]) {
        if (this.wanted(i) && this.state[i] === 0) return i;
      }
    }
    // 3. the rest: every 4th, every 2nd, every frame
    while (this.cursor < this.order.length) {
      const i = this.order[this.cursor];
      if (this.state[i] === 0) return i;
      this.cursor++;
    }
    return -1;
  }

  private pump() {
    const limit = this.mobile ? 4 : 6;
    while (this.running && !this.dead && this.active < limit) {
      const i = this.next();
      if (i < 0) return;
      this.load(i);
    }
  }

  private load(i: number) {
    this.state[i] = 1;
    this.active++;
    fetch(this.url(i))
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((blob) => {
        if (this.dead) return;
        this.blobs[i] = blob;
        this.state[i] = 2;
        this.loaded++;
        if (i % KEY === 0 || i === this.info.frames - 1) this.decodeSmall(i);
        this.fill();
        this.onChange();
      })
      .catch(() => {
        this.state[i] = 3;
      })
      .finally(() => {
        this.active--;
        this.pump();
      });
  }

  private decodeSmall(i: number) {
    const blob = this.blobs[i];
    if (!blob || this.small.has(i)) return;
    createImageBitmap(blob, { resizeWidth: Math.round(this.info.w / 4), resizeHeight: Math.round(this.info.h / 4), resizeQuality: 'low' })
      .then((bmp) => {
        if (this.dead) return bmp.close();
        this.small.set(i, bmp);
        this.onChange();
      })
      .catch(() => {
        // no resize option, or the format cannot be decoded here: the full-size window still works
      });
  }

  // Tell the sequence where the walker is. Decodes around that frame, drops what fell behind.
  focus(i: number, dir: number) {
    this.centre = i;
    if (dir) this.dir = dir;
    this.fill();
    for (const [k, bmp] of this.full) {
      const d = (k - i) * this.dir;
      if (d > this.ahead + this.slack || d < -this.behind - this.slack) {
        bmp.close();
        this.full.delete(k);
      }
    }
    this.pump();
  }

  private wanted(k: number) {
    const d = (k - this.centre) * this.dir;
    return k >= 0 && k < this.info.frames && d <= this.ahead && d >= -this.behind;
  }

  private fill() {
    const limit = this.mobile ? 2 : 3;
    for (let d = 0; d <= this.ahead && this.decoding.size < limit; d++) {
      for (const k of d === 0 ? [this.centre] : [this.centre + d * this.dir, this.centre - d * this.dir]) {
        if (this.decoding.size >= limit) break;
        if (!this.wanted(k) || this.full.has(k) || this.decoding.has(k) || !this.blobs[k]) continue;
        this.decode(k);
      }
    }
  }

  private decode(k: number) {
    this.decoding.add(k);
    createImageBitmap(this.blobs[k] as Blob)
      .then((bmp) => {
        this.decoding.delete(k);
        if (this.dead || !this.wanted(k)) return bmp.close();
        this.full.set(k, bmp);
        this.fill();
        this.onChange();
      })
      .catch(() => {
        this.decoding.delete(k);
        this.state[k] = 3;
        this.onBroken();
      });
  }

  has(i: number) {
    return this.full.has(i);
  }

  // The best thing to show for frame i right now.
  pick(i: number): Pick | null {
    const exact = this.full.get(i);
    if (exact) return { bmp: exact, idx: i, q: 'full' };
    for (let d = 1; d <= 3; d++) {
      for (const k of [i - d * this.dir, i + d * this.dir]) {
        const b = this.full.get(k);
        if (b) return { bmp: b, idx: k, q: 'near' };
      }
    }
    let best: Pick | null = null;
    for (const [k, b] of this.small) {
      if (!best || Math.abs(k - i) < Math.abs(best.idx - i)) best = { bmp: b, idx: k, q: 'coarse' };
    }
    return best;
  }

  // Free the decoded window (the compressed frames stay).
  release() {
    for (const bmp of this.full.values()) bmp.close();
    this.full.clear();
  }

  destroy() {
    this.dead = true;
    this.release();
    for (const bmp of this.small.values()) bmp.close();
    this.small.clear();
  }
}

export function initCorridor() {
  const found = document.querySelector<HTMLCanvasElement>('[data-corridor]');
  const section = document.getElementById('corridor');
  if (!found || !section) return;
  const canvas: HTMLCanvasElement = found;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  let manifest: Manifest;
  try {
    manifest = JSON.parse(canvas.dataset.manifest ?? '');
  } catch {
    return;
  }
  const base = canvas.dataset.base ?? '';
  // A supplied photograph of the face (build time), or the test hook that stands in for it.
  const faceUrl = (window as unknown as { __corridorFace?: string }).__corridorFace ?? canvas.dataset.face ?? '';
  const caps = Array.from(section.querySelectorAll<HTMLElement>('[data-cap]'));

  const narrow = window.matchMedia('(orientation: portrait), (max-width: 760px)');
  let avifBroken = false;
  const choose = (): SetName => {
    const want: SetName = narrow.matches ? 'mobile' : 'desktop';
    if (want === 'desktop' && (avifBroken || !manifest.sets.desktop)) return 'mobile';
    if (want === 'mobile' && !manifest.sets.mobile) return 'desktop';
    return want;
  };

  let setName: SetName = choose();
  let info = manifest.sets[setName] as SetInfo;
  if (!info) return;

  // --- canvas geometry: set on resize, never read while drawing ---
  let cw = 0;
  let ch = 0;
  let cssW = 0;
  let cssH = 0;
  let crop = { x: 0, y: 0, w: 1, h: 1 }; // the part of the frame the canvas shows, in frame pixels
  const layout = () => {
    if (!cssW || !cssH) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // device pixels the canvas would need, capped at the frame's own resolution
    const s = Math.max((cssW * dpr) / info.w, (cssH * dpr) / info.h);
    const k = Math.min(1, 1 / s);
    cw = Math.max(1, Math.round(cssW * dpr * k));
    ch = Math.max(1, Math.round(cssH * dpr * k));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const sc = Math.max(cw / info.w, ch / info.h);
    crop = { w: cw / sc, h: ch / sc, x: (info.w - cw / sc) / 2, y: (info.h - ch / sc) / 2 };
    drawn.idx = -2;
  };

  // --- state ---
  let progress = 0;
  let prevTarget = -1;
  let shownTarget = -1; // the frame the walk is at (differs from the scroll target while catching up)
  let dir = 1;
  let inView = false;
  let raf = 0;
  let started = false;
  let capsAt = -1;
  let poster: HTMLImageElement | null = null;
  const drawn = { idx: -2, q: '', patch: -1 };
  let draws = 0;

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const broken = () => {
    // a frame that would not decode: an AVIF set on a browser without AVIF. Use the other set.
    if (info.ext !== 'avif' || avifBroken) return;
    avifBroken = true;
    switchSet();
  };
  let seq = new Sequence(info, base, setName === 'mobile', kick, broken);

  // --- the scare ---
  let scareDone = false;
  try {
    scareDone = Boolean(sessionStorage.getItem(SCARE_KEY));
  } catch {
    scareDone = false;
  }
  let scarePlays = 0;
  let scareState: 'idle' | 'arming' | 'playing' = 'idle';
  let scareStart = 0;
  let armedAt = 0;
  let catchUp = false;
  let patches: (ImageBitmap | null)[] = [];
  let patchState: 'none' | 'loading' | 'ready' | 'failed' = 'none';
  let face: HTMLCanvasElement | null = null;
  let faceDraws = 0;
  canvas.dataset.scare = 'idle';
  canvas.dataset.scarePlays = '0';
  canvas.dataset.faceMode = faceUrl ? 'photo' : 'stand-in';

  const loadPatches = () => {
    const sc = info.scare;
    if (!sc || patchState !== 'none') return;
    patchState = 'loading';
    const mine = seq;
    const variant = faceUrl ? 'g' : 'f';
    const jobs: Promise<ImageBitmap | null>[] = sc.has.map((has, j) =>
      has
        ? fetch(`${base}${info.dir}/s/${variant}-${pad(j, 2)}.${info.ext}`)
            .then((r) => {
              if (!r.ok) throw new Error(String(r.status));
              return r.blob();
            })
            .then((b) => createImageBitmap(b))
        : Promise.resolve(null),
    );
    if (faceUrl) jobs.push(prepareFace(faceUrl).then(() => null));
    Promise.all(jobs)
      .then((list) => {
        if (mine !== seq) return list.forEach((b) => b?.close());
        patches = list.slice(0, sc.count);
        patchState = 'ready';
        canvas.dataset.scareReady = '1';
        kick();
      })
      .catch(() => {
        patchState = 'failed';
      });
  };

  // The supplied photograph, prepared once: dark, tinted to the lamp, lit on one side only,
  // with grain. Drawn with "lighter", so everything that is black in it stays the dark of the gap.
  const prepareFace = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const W = 240;
        const H = 324;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        if (!g) return reject(new Error('no 2d context'));
        // cover fit
        const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * s;
        const dh = img.naturalHeight * s;
        if ('filter' in g) g.filter = 'grayscale(0.55) contrast(1.15) brightness(0.9)';
        g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        if ('filter' in g) g.filter = 'none';
        // the corridor's tungsten
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = 'rgb(214, 170, 120)';
        g.fillRect(0, 0, W, H);
        // She looks out through the gap, and the jamb hides the right of the picture: the torch
        // reaches one eye and the cheek under it, the contour beyond them falls into the dark,
        // and so does everything towards the door edge. No more than a third of the face is lit,
        // and that no brighter than the skin of the hand on the door.
        const fall = g.createLinearGradient(0, 0, W, 0);
        fall.addColorStop(0, 'rgb(14, 13, 12)');
        fall.addColorStop(0.16, 'rgb(128, 124, 120)');
        fall.addColorStop(0.27, 'rgb(150, 146, 140)');
        fall.addColorStop(0.4, 'rgb(84, 78, 72)');
        fall.addColorStop(0.55, 'rgb(18, 15, 13)');
        fall.addColorStop(1, 'rgb(0, 0, 0)');
        g.fillStyle = fall;
        g.fillRect(0, 0, W, H);
        // and falls off towards the top and the bottom of the head
        const vert = g.createRadialGradient(W * 0.27, H * 0.4, H * 0.06, W * 0.27, H * 0.4, H * 0.5);
        vert.addColorStop(0, 'rgb(255, 255, 255)');
        vert.addColorStop(1, 'rgb(6, 5, 5)');
        g.fillStyle = vert;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
        // grain, matched to the frames: fine, a little stronger in the dark
        const data = g.getImageData(0, 0, W, H);
        let seed = 9173;
        for (let i = 0; i < data.data.length; i += 4) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const n = ((seed >>> 16) / 65535 - 0.5) * 14;
          data.data[i] = clamp(data.data[i] + n, 0, 255);
          data.data[i + 1] = clamp(data.data[i + 1] + n * 0.97, 0, 255);
          data.data[i + 2] = clamp(data.data[i + 2] + n * 0.92, 0, 255);
        }
        g.putImageData(data, 0, 0);
        face = c;
        resolve();
      };
      img.onerror = () => reject(new Error('face'));
      img.src = url;
    });

  // frame coordinates (0..1) to canvas pixels
  const fx = (x: number) => ((x * info.w - crop.x) * cw) / crop.w;
  const fy = (y: number) => ((y * info.h - crop.y) * ch) / crop.h;

  // Draw the prepared photograph into the head quad, clipped to the gap between jamb and door.
  // Two affine triangles stand in for the perspective: at this size the difference cannot be seen.
  const drawFace = (q: Quad, alpha: number) => {
    if (!face || alpha <= 0) return;
    const P = q.quad.map(([x, y]) => [fx(x), fy(y)]);
    const W = face.width;
    const H = face.height;
    ctx.save();
    ctx.beginPath();
    q.clip.forEach(([x, y], i) => (i ? ctx.lineTo(fx(x), fy(y)) : ctx.moveTo(fx(x), fy(y))));
    ctx.closePath();
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => {
      // affine map taking the source triangle (ua, ub, uc) to (a, b, c)
      const d = (ub[0] - ua[0]) * (uc[1] - ua[1]) - (uc[0] - ua[0]) * (ub[1] - ua[1]);
      if (!d) return;
      const m11 = ((b[0] - a[0]) * (uc[1] - ua[1]) - (c[0] - a[0]) * (ub[1] - ua[1])) / d;
      const m12 = ((c[0] - a[0]) * (ub[0] - ua[0]) - (b[0] - a[0]) * (uc[0] - ua[0])) / d;
      const m21 = ((b[1] - a[1]) * (uc[1] - ua[1]) - (c[1] - a[1]) * (ub[1] - ua[1])) / d;
      const m22 = ((c[1] - a[1]) * (ub[0] - ua[0]) - (b[1] - a[1]) * (uc[0] - ua[0])) / d;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.clip();
      ctx.transform(m11, m21, m12, m22, a[0] - m11 * ua[0] - m12 * ua[1], a[1] - m21 * ua[0] - m22 * ua[1]);
      ctx.drawImage(face as HTMLCanvasElement, 0, 0);
      ctx.restore();
    };
    tri(P[0], P[1], P[2], [0, 0], [W, 0], [W, H]);
    tri(P[0], P[2], P[3], [0, 0], [W, H], [0, H]);
    // the shadow of the door edge: the half of the gap nearer the leaf gets almost no light
    const [j1, e1, e2, j2] = q.clip.map(([x, y]) => [fx(x), fy(y)]);
    const em = [(e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2];
    const jm = [(j1[0] + j2[0]) / 2, (j1[1] + j2[1]) / 2];
    const shade = ctx.createLinearGradient(em[0], em[1], em[0] + (jm[0] - em[0]) * 0.55, em[1] + (jm[1] - em[1]) * 0.55);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = shade;
    ctx.fillRect(Math.min(...P.map((p) => p[0])) - 4, Math.min(...P.map((p) => p[1])) - 4, Math.max(...P.map((p) => p[0])) - Math.min(...P.map((p) => p[0])) + 8, Math.max(...P.map((p) => p[1])) - Math.min(...P.map((p) => p[1])) + 8);
    ctx.restore();
    faceDraws++;
    canvas.dataset.faceDraws = String(faceDraws);
  };

  // The door beat: lean in towards the gap while it plays, settle back while the walk catches up.
  const pushIn = (sc: ScareInfo) => {
    const [x, y, w, h] = sc.rect;
    const ox = clamp(((x + w / 2 - crop.x) / crop.w) * 100, 0, 100);
    const oy = clamp(((y + h / 2 - crop.y) / crop.h) * 100, 0, 100);
    canvas.style.transformOrigin = `${ox.toFixed(1)}% ${oy.toFixed(1)}%`;
    canvas.style.transition = `transform ${Math.round((sc.count / sc.fps) * 1000)}ms cubic-bezier(0.25, 0.1, 0.35, 1)`;
    canvas.style.transform = 'scale(1.045)';
  };
  const pushOut = () => {
    if (!canvas.style.transform) return;
    canvas.style.transition = 'transform 900ms cubic-bezier(0.45, 0, 0.25, 1)';
    canvas.style.transform = '';
  };

  // --- drawing ---
  const paint = (p: Pick, patch: number) => {
    const bw = 'naturalWidth' in p.bmp ? p.bmp.naturalWidth : p.bmp.width;
    const bh = 'naturalHeight' in p.bmp ? p.bmp.naturalHeight : p.bmp.height;
    const kx = bw / info.w;
    const ky = bh / info.h;
    ctx.drawImage(p.bmp, crop.x * kx, crop.y * ky, crop.w * kx, crop.h * ky, 0, 0, cw, ch);
    const sc = info.scare;
    if (patch >= 0 && sc) {
      const bmp = patches[patch];
      if (bmp) {
        const [x, y, w, h] = sc.rect;
        const k = cw / crop.w;
        ctx.drawImage(bmp, (x - crop.x) * k, (y - crop.y) * k, w * k, h * k);
      }
      const q = sc.quads[patch];
      if (face && q && bmp) {
        // fades in with the door
        const t = patch / (sc.count - 1);
        drawFace(q, smooth(0.08, 0.3, t) * (1 - smooth(0.82, 0.95, t)));
      }
    }
    drawn.idx = p.idx;
    drawn.q = p.q;
    drawn.patch = patch;
    draws++;
    canvas.dataset.draws = String(draws);
    canvas.dataset.frame = String(p.idx);
    canvas.dataset.quality = p.q;
    canvas.dataset.patch = String(patch);
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
    if (!cw || (!inView && !still) || document.hidden) return;
    const last = info.frames - 1;
    const target = still ? Math.round(STILL_AT * last) : Math.round(progress * last);
    canvas.dataset.target = String(target);
    if (prevTarget >= 0 && target !== prevTarget) dir = target > prevTarget ? 1 : -1;

    // the scare: armed when the walker passes the door going forwards, for the first time this session
    const sc = info.scare;
    if (sc && !still && !scareDone && started) {
      if (patchState === 'none' && target > sc.frame - 40 && target < sc.frame + 6) loadPatches();
      if (scareState === 'idle' && patchState === 'ready' && prevTarget >= 0 && prevTarget < sc.frame && target >= sc.frame && target < last) {
        scareState = 'arming';
        armedAt = now;
      }
    }
    let show = target;
    let patch = -1;
    if (sc && scareState === 'arming') {
      show = sc.frame;
      if (seq.has(sc.frame)) {
        // sessionStorage decides: one play per session, whatever happens next
        if (once(SCARE_KEY)) {
          scareState = 'playing';
          scareStart = now;
          scarePlays++;
          canvas.dataset.scarePlays = String(scarePlays);
          canvas.dataset.scare = 'playing';
          doorCreak(sc.count / sc.fps);
          pushIn(sc);
        } else {
          scareState = 'idle';
        }
        scareDone = true;
      } else if (now - armedAt > 600) {
        scareState = 'idle'; // the frame never arrived: let it go, the next pass may still get it
      }
    }
    if (sc && scareState === 'playing') {
      const j = Math.floor(((now - scareStart) * sc.fps) / 1000);
      if (j >= sc.count) {
        scareState = 'idle';
        canvas.dataset.scare = 'done';
        pushOut();
        catchUp = true;
        shownTarget = sc.frame;
        // it never plays again on this page: the decoded patches (on a phone each is nearly a
        // whole frame) are freed
        patches.forEach((b) => b?.close());
        patches = [];
      } else {
        show = sc.frame;
        patch = sc.has[j] ? j : -1;
      }
    }
    if (catchUp && scareState === 'idle') {
      // walk on to where the scroll has got to, quickly but through every frame
      const step = clamp(target - shownTarget, -3, 3);
      shownTarget += step;
      show = shownTarget;
      if (shownTarget === target) catchUp = false;
    } else if (scareState === 'idle') {
      shownTarget = target;
    }

    if (started) seq.focus(show, show === target ? dir : 1);
    let p = seq.pick(show);
    if (scareState === 'playing' && (!p || p.idx !== show)) patch = -1;
    if (!p && poster) p = { bmp: poster, idx: -1, q: 'poster' };
    if (p && (p.idx !== drawn.idx || p.q !== drawn.q || patch !== drawn.patch)) paint(p, patch);

    if (!still && progress !== capsAt) {
      setCaps(progress);
      capsAt = progress;
    }
    prevTarget = target;
    canvas.dataset.loaded = String(seq.loaded);
    if (scareState !== 'idle' || catchUp) kick();
  }

  // --- loading: nothing but the poster until the visitor does something ---
  const loadPoster = () => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      poster = img;
      drawn.idx = -2;
      kick();
    };
    img.src = `${base}${info.poster}`;
  };
  const stillFrame = () => [Math.round(STILL_AT * (info.frames - 1))];
  const begin = () => {
    if (started) return;
    started = true;
    events.forEach((ev) => window.removeEventListener(ev, begin));
    if (still) seq.start(false, stillFrame());
    else seq.start(true);
    kick();
  };
  const events = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'pointermove', 'keydown'];
  events.forEach((ev) => window.addEventListener(ev, begin, { passive: true }));
  // No input at all: once the page has been idle for a while after load, take a head start
  // with the coarse pass only (or the single still frame).
  const headStart = () => {
    if (started) return;
    if (still) return begin();
    seq.start(false);
  };
  const afterLoad = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    window.setTimeout(() => (ric ? ric(headStart, { timeout: 3000 }) : headStart()), 4000);
  };
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });

  function switchSet() {
    const name = choose();
    const next = manifest.sets[name];
    if (!next || next === info) return;
    seq.destroy();
    patches.forEach((b) => b?.close());
    patches = [];
    patchState = 'none';
    delete canvas.dataset.scareReady;
    scareState = 'idle';
    catchUp = false;
    pushOut();
    setName = name;
    info = next;
    canvas.dataset.set = setName;
    seq = new Sequence(info, base, setName === 'mobile', kick, broken);
    poster = null;
    loadPoster();
    layout();
    if (started) {
      if (still) seq.start(false, stillFrame());
      else seq.start(true);
    }
    kick();
  }

  canvas.dataset.set = setName;
  loadPoster();
  new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    if (!r.width || !r.height) return;
    cssW = r.width;
    cssH = r.height;
    layout();
    kick();
  }).observe(canvas);
  narrow.addEventListener('change', switchSet);

  if (still) {
    // one frame, no pin, no walk, no scare
    canvas.dataset.scare = 'off';
    return;
  }

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
      else seq.release(); // the decoded window goes while the corridor is off screen
    },
    { rootMargin: '20% 0px' },
  ).observe(section);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });
}
