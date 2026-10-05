// The photo slot of the scare, at build level. A photograph in src/assets/scare/ is laid into
// the scare frames by scripts/corridor-video.mjs before they are encoded (the page itself no
// longer composites anything). This runs the compositing functions the build uses on the
// fixture photograph: no browser, no encode.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { prepareFace, drawFace, faceAlpha, inside, FACE_W, FACE_H } = require('../scripts/corridor-face.cjs') as {
  prepareFace: (file: string) => Promise<{ data: Buffer; width: number; height: number }>;
  drawFace: (frame: Buffer, w: number, h: number, face: { data: Buffer; width: number; height: number }, q: { quad: number[][]; clip: number[][] }, alpha: number) => number;
  faceAlpha: (j: number, count: number) => number;
  inside: (poly: number[][], x: number, y: number) => boolean;
  FACE_W: number;
  FACE_H: number;
};
const fixture = fileURLToPath(new URL('./fixtures/face.png', import.meta.url));

test('a supplied face photo is prepared and laid into the door gap, and nowhere else', async ({}, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'no browser is involved: once is enough');
  const face = await prepareFace(fixture);
  expect([face.width, face.height]).toEqual([FACE_W, FACE_H]);
  const band = (x0: number, x1: number) => {
    let s = 0;
    let n = 0;
    for (let y = 0; y < face.height; y++) {
      for (let x = Math.floor(x0 * face.width); x < Math.floor(x1 * face.width); x++) {
        const p = (y * face.width + x) * 3;
        s += face.data[p] + face.data[p + 1] + face.data[p + 2];
        n += 3;
      }
    }
    return s / n;
  };
  // lit on one side only: the band with the eye and the cheek, the rest falls into the dark
  expect(band(0.16, 0.4), 'the lit band').toBeGreaterThan(12);
  expect(band(0.55, 1), 'the side the jamb hides').toBeLessThan(band(0.16, 0.4) / 4);
  expect(band(0, 0.08), 'the side the door edge hides').toBeLessThan(band(0.16, 0.4) / 4);
  // and no brighter than the hand on the door: nothing of it is a highlight
  expect(face.data.reduce((m, v) => Math.max(m, v), 0)).toBeLessThan(200);

  // a dark frame, the head rectangle and the gap as the build writes them (0..1 of the frame)
  const w = 400;
  const h = 300;
  const q = {
    quad: [[0.4, 0.2], [0.6, 0.2], [0.6, 0.8], [0.4, 0.8]],
    clip: [[0.52, 0.1], [0.45, 0.1], [0.44, 0.9], [0.51, 0.9]], // jamb top, door edge top, door edge bottom, jamb bottom
  };
  const clip = q.clip.map(([x, y]) => [x * w, y * h]);
  const frame = Buffer.alloc(w * h * 3, 10);
  const touched = drawFace(frame, w, h, face, q, 1);
  expect(touched, 'pixels of the gap').toBeGreaterThan(1000);
  let outside = 0;
  let lit = 0;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 3;
      const changed = frame[p] !== 10 || frame[p + 1] !== 10 || frame[p + 2] !== 10;
      if (!inside(clip, x + 0.5, y + 0.5)) {
        if (changed) outside++;
        continue;
      }
      if (y >= 0.2 * h && y < 0.8 * h) {
        sum += frame[p];
        n++;
        if (frame[p] > 14) lit++;
      }
    }
  }
  expect(outside, 'nothing is drawn outside the gap').toBe(0);
  expect(sum / n, 'the photo lights the gap').toBeGreaterThan(12);
  expect(lit / n, 'but only part of it: the door edge keeps its shadow').toBeGreaterThan(0.15);
  expect(lit / n).toBeLessThan(0.85);

  // not drawn at all while the door is shut
  const shut = Buffer.alloc(w * h * 3, 10);
  expect(drawFace(shut, w, h, face, q, 0)).toBe(0);
  expect(shut.equals(Buffer.alloc(w * h * 3, 10))).toBe(true);
  // it fades in with the door and is gone before it shuts
  expect(faceAlpha(0, 15)).toBe(0);
  expect(faceAlpha(14, 15)).toBe(0);
  expect(faceAlpha(7, 15)).toBe(1);
  expect(faceAlpha(2, 15)).toBeGreaterThan(0);
  expect(faceAlpha(2, 15)).toBeLessThan(1);
});

test('the slot is empty in the repository: the videos carry the generated face', async ({}, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'no browser is involved: once is enough');
  const dir = fileURLToPath(new URL('../src/assets/scare/', import.meta.url));
  expect(readdirSync(dir).filter((f) => /^face\./.test(f)), 'no face file is committed').toEqual([]);
  const manifest = require('../public/corridor/manifest.json') as { sets: Record<string, { face: boolean }> };
  for (const [name, s] of Object.entries(manifest.sets)) expect(s.face, `${name}: built without a photograph`).toBe(false);
  expect(existsSync(fixture)).toBe(true);
});
