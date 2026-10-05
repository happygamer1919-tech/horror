// The photo slot of the scare, at build time: a supplied photograph of a face
// (src/assets/scare/face.avif|webp|png, see the README there) is laid into the gap of door 308
// in the scare frames before they are encoded (scripts/corridor-video.mjs).
//
// This is the compositing the page used to do on a canvas while the door was open, moved into
// the build and kept step for step:
//   prepareFace  the photograph, 240 x 324: cover fit, nearly monochrome, tinted to the lamp, lit
//                on one side only, falling off above and below the head, with grain
//   drawFace     added ("lighter") into the head rectangle of a finished scare frame, clipped to
//                the gap between door edge and jamb, with the shadow of the door edge over the
//                half of the gap nearer the leaf
//   faceAlpha    how strongly, for frame j of the beat: it fades in and out with the door
// All buffers are raw RGB, 3 bytes a pixel.
const sharp = require('sharp');

const FACE_W = 240;
const FACE_H = 324;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Colour stops across the picture (x from 0 to 1), multiplied in. She looks out through the
// gap, and the jamb hides the right of the picture: the torch reaches one eye and the cheek
// under it, the contour beyond them falls into the dark, and so does everything towards the
// door edge.
const FALL = [
  [0, 14, 13, 12],
  [0.16, 128, 124, 120],
  [0.27, 150, 146, 140],
  [0.4, 84, 78, 72],
  [0.55, 18, 15, 13],
  [1, 0, 0, 0],
];
const TINT = [214, 170, 120]; // the corridor's tungsten
const fallAt = (u) => {
  let k = 0;
  while (k < FALL.length - 2 && u > FALL[k + 1][0]) k++;
  const a = FALL[k];
  const b = FALL[k + 1];
  const t = clamp((u - a[0]) / (b[0] - a[0]), 0, 1);
  return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
};

// file (or buffer) -> { data, width, height }
async function prepareFace(input) {
  const W = FACE_W;
  const H = FACE_H;
  // a transparent background counts as black: nothing is added there
  const src = await sharp(input).flatten({ background: '#000' }).resize(W, H, { fit: 'cover', position: 'centre' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const out = Buffer.alloc(W * H * 3);
  let seed = 9173;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3;
      let r = src[p] / 255;
      let g = src[p + 1] / 255;
      let b = src[p + 2] / 255;
      // grayscale(0.55) contrast(1.15) brightness(0.9), as the CSS filters define them
      const s = 0.45;
      const r2 = (0.2126 + 0.7874 * s) * r + (0.7152 - 0.7152 * s) * g + (0.0722 - 0.0722 * s) * b;
      const g2 = (0.2126 - 0.2126 * s) * r + (0.7152 + 0.2848 * s) * g + (0.0722 - 0.0722 * s) * b;
      const b2 = (0.2126 - 0.2126 * s) * r + (0.7152 - 0.7152 * s) * g + (0.0722 + 0.9278 * s) * b;
      r = clamp(((r2 - 0.5) * 1.15 + 0.5) * 0.9, 0, 1);
      g = clamp(((g2 - 0.5) * 1.15 + 0.5) * 0.9, 0, 1);
      b = clamp(((b2 - 0.5) * 1.15 + 0.5) * 0.9, 0, 1);
      // the lamp's colour, the fall of the light across the face, and towards the top and the bottom of the head
      const f = fallAt((x + 0.5) / W);
      const d = Math.hypot(x + 0.5 - W * 0.27, y + 0.5 - H * 0.4);
      const t = clamp((d - H * 0.06) / (H * 0.5 - H * 0.06), 0, 1);
      const v = [255 + (6 - 255) * t, 255 + (5 - 255) * t, 255 + (5 - 255) * t];
      r = r * (TINT[0] / 255) * (f[0] / 255) * (v[0] / 255) * 255;
      g = g * (TINT[1] / 255) * (f[1] / 255) * (v[1] / 255) * 255;
      b = b * (TINT[2] / 255) * (f[2] / 255) * (v[2] / 255) * 255;
      // grain, matched to the frames: fine, a little stronger in the dark
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = ((seed >>> 16) / 65535 - 0.5) * 14;
      out[p] = clamp(Math.round(r + n), 0, 255);
      out[p + 1] = clamp(Math.round(g + n * 0.97), 0, 255);
      out[p + 2] = clamp(Math.round(b + n * 0.92), 0, 255);
    }
  }
  return { data: out, width: W, height: H };
}

// Is the point inside the convex or concave polygon (even-odd)?
function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Add the prepared face into `frame` (w x h, in place).
//   q.quad  the head rectangle: top left, top right, bottom right, bottom left
//   q.clip  the gap: jamb top, door edge top, door edge bottom, jamb bottom
// both in 0..1 of the frame, as the build writes them. Returns the number of pixels touched.
function drawFace(frame, w, h, face, q, alpha) {
  if (!face || !q || alpha <= 0) return 0;
  const P = q.quad.map(([x, y]) => [x * w, y * h]);
  const C = q.clip.map(([x, y]) => [x * w, y * h]);
  const x0 = Math.min(...P.map((p) => p[0]));
  const x1 = Math.max(...P.map((p) => p[0]));
  const y0 = Math.min(...P.map((p) => p[1]));
  const y1 = Math.max(...P.map((p) => p[1]));
  const sample = (u, v, c) => {
    const fx = clamp(u * face.width - 0.5, 0, face.width - 1);
    const fy = clamp(v * face.height - 0.5, 0, face.height - 1);
    const ix = Math.min(face.width - 2, Math.floor(fx));
    const iy = Math.min(face.height - 2, Math.floor(fy));
    const tx = fx - ix;
    const ty = fy - iy;
    const at = (xx, yy) => face.data[(yy * face.width + xx) * 3 + c];
    return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
  };
  // the shadow of the door edge: from the middle of the door edge towards the jamb, over 55
  // percent of the gap's width, from nine tenths black to nothing
  const [j1, e1, e2, j2] = C;
  const em = [(e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2];
  const jm = [(j1[0] + j2[0]) / 2, (j1[1] + j2[1]) / 2];
  const dx = (jm[0] - em[0]) * 0.55;
  const dy = (jm[1] - em[1]) * 0.55;
  const dd = dx * dx + dy * dy || 1;
  let touched = 0;
  for (let y = Math.max(0, Math.floor(y0) - 4); y < Math.min(h, Math.ceil(y1) + 4); y++) {
    for (let x = Math.max(0, Math.floor(x0) - 4); x < Math.min(w, Math.ceil(x1) + 4); x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (!inside(C, cx, cy)) continue;
      const p = (y * w + x) * 3;
      const inQuad = cx >= x0 && cx < x1 && cy >= y0 && cy < y1;
      const s = clamp(((cx - em[0]) * dx + (cy - em[1]) * dy) / dd, 0, 1);
      const shade = 1 - 0.9 * (1 - s) * alpha;
      for (let c = 0; c < 3; c++) {
        let v = frame[p + c];
        if (inQuad) v = Math.min(255, v + sample((cx - x0) / (x1 - x0), (cy - y0) / (y1 - y0), c) * alpha);
        frame[p + c] = Math.round(v * shade);
      }
      touched++;
    }
  }
  return touched;
}

// Frame j of `count`: the face fades in with the door and is gone before it shuts.
const faceAlpha = (j, count) => {
  const t = j / (count - 1);
  return smooth(0.08, 0.3, t) * (1 - smooth(0.82, 0.95, t));
};

module.exports = { prepareFace, drawFace, faceAlpha, inside, FACE_W, FACE_H };
