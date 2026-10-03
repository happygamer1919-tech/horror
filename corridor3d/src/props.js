// Everything that is not shell, door or lamp: decals (dried blood, water, grime, gouges),
// peeling wallpaper, the boarded door, the child's shoe, the housekeeping trolley, pictures,
// switches, the exit sign, the fire extinguisher, the light under door 310.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HW, CH, WALL_T, DOOR, DOORS, DADO, SPECIAL, END, LAST_ROOM, LAMPS, SHOE_AT, door as doorByNo } from './layout.js';
import { Bag, M, move, rotX, rotY, rotZ, scale, box, boxAt, boxUV, grid, planarUV, paint, extrude, smoothNormals, mulberry, fbm, noise2, smooth, clamp, lerp } from './util.js';
import { wallFrame, endFrame, wallBulge, carpetHeight, alongWall } from './shell.js';
import { leafDepth, leafMatrix, REC } from './doors.js';
import { cell, DECAL, SIGN } from './textures.js';

// --- decals ---------------------------------------------------------------------------------
// A small grid carrying one atlas cell, in the coordinates of `matrix`: centre (cx, cy), size
// (w, h), turned by rot. zFn gives the surface it lies on; it floats `lift` above it.
function decal(bag, name, matrix, cx, cy, w, h, { rot = 0, zFn = null, lift = 0.003, n = 10, tint = [1, 1, 1], flip = false, soft = false } = {}) {
  const c = cell(DECAL[name]);
  const g = new THREE.PlaneGeometry(w, h, n, n);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const x = cx + lx * cs - ly * sn;
    const y = cy + lx * sn + ly * cs;
    pos.setXYZ(i, x, y, (zFn ? zFn(x, y) : 0) + lift);
    const u = flip ? 1 - uv.getX(i) : uv.getX(i);
    uv.setXY(i, lerp(c.u0, c.u1, u), lerp(c.v0, c.v1, uv.getY(i)));
  }
  g.computeVertexNormals();
  bag.add(soft ? 'decalSoft' : 'decal', g, matrix, tint);
}

// --- peeling wallpaper -------------------------------------------------------------------------
// A length of paper that has let go at the top and folded over. Built in wall coordinates:
// attached along y = y0 from x0 to x0 + w, it used to reach up to y0 + len. The printed side
// ends up facing the wall, the paper back faces the corridor.
function peel(bag, frame, side, sOfX, x0, y0, w, len, { seed = 1, curl = 2.9, turn = 0, plasterTint = [1, 1, 1] } = {}) {
  const r = mulberry(seed);
  const NU = 22;
  const NT = 34;
  const P = [];
  // It has come away on the slant: one side barely lifted, the other flopped right over, so the
  // flap is a ragged triangle and not a tidy roll. The torn top edge is jagged.
  const lean = r() < 0.5 ? 1 : -1;
  const lift = (u) => (lean > 0 ? u : 1 - u);
  // a torn top edge: ragged at every scale, with a notch or two
  const tear = (u) => 0.74 + 0.26 * fbm(u * 7 + seed, seed * 0.37, seed + 5, 4) + 0.05 * Math.sin(u * 61 + seed) + 0.03 * (noise2(u * 140, seed, seed + 2) - 0.5) - 0.18 * Math.exp(-Math.pow((u - 0.3 - 0.4 * ((seed * 0.37) % 1)) / 0.05, 2));
  const lenAt = (u) => len * (0.35 + 0.65 * Math.pow(lift(u), 0.7)) * tear(u);
  for (let iu = 0; iu <= NU; iu++) {
    const u = iu / NU;
    const L = lenAt(u);
    const yAttach = y0 + 0.04 * Math.sin(u * 3.1 + seed) - 0.12 * (1 - lift(u));
    let y = yAttach;
    let z = 0.0015;
    const row = [];
    const k = curl * (0.25 + 0.85 * Math.pow(lift(u), 1.3)); // total turn, radians
    for (let it = 0; it <= NT; it++) {
      const t = it / NT;
      // tangent angle from "up the wall": turns over outwards and then hangs
      const a = k * (1 - Math.pow(1 - t, 1.6));
      // creases and the cockle of old paper that has been wet
      const crinkle = 0.007 * (fbm(u * 7 + seed, t * 5, seed + 11, 3) - 0.5) * t + 0.0025 * Math.sin(u * 23 + t * 9 + seed) * t;
      row.push([x0 + u * w + 0.015 * Math.sin(t * 2.2 + u * 2) * t, y, z + crinkle]);
      const ds = L / NT;
      y += Math.cos(a) * ds;
      z = Math.max(t > 0.06 ? 0.005 : 0.0015, z + Math.sin(a) * ds * (0.5 + 0.3 * lift(u)));
    }
    P.push(row);
  }
  const build = (flipWinding) => {
    const pos = [];
    const uv = [];
    const col = [];
    const push = (iu, it) => {
      const p = P[iu][it];
      pos.push(p[0], p[1], p[2]);
      // the print continues the wall's pattern: UV from where the paper used to be
      const u = iu / NU;
      const sx = x0 + u * w;
      const sy = y0 + (it / NT) * lenAt(u);
      uv.push(sx, sy);
      // grimy towards the torn edge, paste-stained near where it still holds
      const t = it / NT;
      const k = (0.62 + 0.3 * fbm(sx * 5, sy * 5, seed, 3)) * (1 - 0.4 * smooth(0.6, 1, t)) * (1 - 0.2 * smooth(0.15, 0, t));
      col.push(k, k * 0.9, k * 0.72);
    };
    for (let iu = 0; iu < NU; iu++) {
      for (let it = 0; it < NT; it++) {
        const q = flipWinding ? [[iu, it], [iu, it + 1], [iu + 1, it + 1], [iu, it], [iu + 1, it + 1], [iu + 1, it]] : [[iu, it], [iu + 1, it + 1], [iu, it + 1], [iu, it], [iu + 1, it], [iu + 1, it + 1]];
        for (const [a, b] of q) push(a, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const sm = smoothNormals(g, 0.2);
    // Paper has a thickness: the print and the back are two layers 1.4 mm apart. Coincident
    // layers would fight in the tracer (its ray offset is about a millimetre down here).
    const sp = sm.attributes.position;
    const sn = sm.attributes.normal;
    for (let i = 0; i < sp.count; i++) sp.setXYZ(i, sp.getX(i) + sn.getX(i) * 0.0007, sp.getY(i) + sn.getY(i) * 0.0007, sp.getZ(i) + sn.getZ(i) * 0.0007);
    return sm;
  };
  const place = M(rotZ(turn), frame);
  bag.add('wallpaperPeel', build(false), place);
  bag.add('paperBack', build(true), place);
  // what it left behind: grey plaster, brown paste, scraps of the paper's back
  const pw = w * 1.3;
  const ph = len * 1.08;
  decal(bag, 'paste', place, x0 + w / 2, y0 + len * 0.5, pw, ph, { zFn: (x, y) => wallBulge(side, side < 0 ? x : -x, y), lift: 0.003, tint: plasterTint, n: 8 });
}

// --- the child's shoe ----------------------------------------------------------------------------
// A small T-bar shoe, about size 26. Heel at x = 0, toe at x = L, y up.
function shoe() {
  const b = new Bag();
  const L = 0.158;
  const pts = [
    [0, 0],
    [0.03, 0.0125],
    [0.1, 0.0205],
    [0.28, 0.0205],
    [0.45, 0.021],
    [0.62, 0.027],
    [0.75, 0.0298],
    [0.86, 0.0275],
    [0.94, 0.021],
    [0.985, 0.0105],
    [1, 0],
  ];
  const halfW = (u) => {
    const v = clamp(u, 0, 1);
    for (let i = 1; i < pts.length; i++) {
      if (v <= pts[i][0]) {
        const t = (v - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
        let k = t * t * (3 - 2 * t);
        if (i === 1) k = Math.sqrt(1 - (1 - t) * (1 - t)); // round heel
        if (i === pts.length - 1) k = 1 - Math.sqrt(1 - t * t); // round toe
        return lerp(pts[i - 1][1], pts[i][1], k);
      }
    }
    return 0;
  };
  const centre = (u) => 0.0045 * smooth(0.4, 1, u);
  const soleT = (u) => 0.006 + 0.008 * (1 - smooth(0.26, 0.34, u)); // a low heel
  const height = (u) => {
    if (u > 0.84) return 0.025 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.84) / 0.16, 2)));
    return lerp(0.043, 0.025, smooth(0.2, 0.84, u)) + 0.004 * Math.exp(-Math.pow((u - 0.52) / 0.12, 2));
  };
  // how much of the top is cut away at each station (radians either side of straight up)
  const open = (u) => {
    if (u < 0.05 || u > 0.6) return 0;
    return 1.02 * Math.pow(Math.sin(((u - 0.05) / 0.55) * Math.PI), 0.55);
  };
  const NU = 56;
  const NV = 28;
  // sole: top, bottom and edge
  {
    const pos = [];
    const add = (...v) => pos.push(...v);
    for (let i = 0; i < NU; i++) {
      const u0 = i / NU;
      const u1 = (i + 1) / NU;
      const w0 = halfW(u0) * 1.06;
      const w1 = halfW(u1) * 1.06;
      const c0 = centre(u0);
      const c1 = centre(u1);
      const t0 = soleT(u0);
      const t1 = soleT(u1);
      const x0 = u0 * L;
      const x1 = u1 * L;
      // top
      add(x0, t0, c0 - w0, x0, t0, c0 + w0, x1, t1, c1 + w1, x0, t0, c0 - w0, x1, t1, c1 + w1, x1, t1, c1 - w1);
      // bottom
      add(x0, 0, c0 - w0, x1, 0, c1 + w1, x0, 0, c0 + w0, x0, 0, c0 - w0, x1, 0, c1 - w1, x1, 0, c1 + w1);
      // edges
      for (const sg of [-1, 1]) {
        add(x0, 0, c0 + sg * w0, x1, 0, c1 + sg * w1, x1, t1, c1 + sg * w1, x0, 0, c0 + sg * w0, x1, t1, c1 + sg * w1, x0, t0, c0 + sg * w0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add('sole', g);
  }
  // upper
  {
    const V = [];
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const row = [];
      const w = halfW(u);
      const h = height(u);
      for (let j = 0; j <= NV; j++) {
        const phi = (j / NV) * Math.PI;
        const z = centre(u) + w * Math.cos(phi) * (0.86 + 0.14 * Math.pow(Math.abs(Math.cos(phi)), 0.5));
        const y = soleT(u) + h * Math.pow(Math.sin(phi), 0.62);
        row.push([u * L, y, z]);
      }
      V.push(row);
    }
    const pos = [];
    const col = [];
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const u = (i + 0.5) / NU;
        const phi = ((j + 0.5) / NV) * Math.PI;
        if (Math.abs(phi - Math.PI / 2) < open(u)) continue;
        const q = [V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j], V[i + 1][j + 1], V[i][j + 1]];
        for (const p of q) {
          pos.push(...p);
          // scuffed at the toe and along the welt, dirt in the creases
          const uu = p[0] / L;
          const scuff = smooth(0.8, 1, uu) * 0.35 + smooth(0.018, 0.006, p[1] - soleT(uu)) * 0.3;
          const k = (0.9 + 0.2 * fbm(p[0] * 60, p[2] * 60 + p[1] * 40, 9, 3)) * (1 + 5 * scuff);
          col.push(k, k * 0.97, k * 0.94);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    b.add('leather', smoothNormals(g, 0.3));
    // the strap over the instep and the bar down to the toe: a T-bar
    const band = (uA, uB, phiA, phiB, n, off, along) => {
      const p = [];
      const N = 16;
      const at = (t, e) => {
        const u = along ? lerp(uA, uB, t) + e * 0 : lerp(uA, uB, e);
        const phi = along ? lerp(phiA, phiB, e) : lerp(phiA, phiB, t);
        const w = halfW(u);
        const h = height(u);
        const z = centre(u) + (w + off) * Math.cos(phi) * (0.86 + 0.14 * Math.pow(Math.abs(Math.cos(phi)), 0.5));
        const y = soleT(u) + (h + off) * Math.pow(Math.sin(phi), 0.62);
        return [u * L, y, z];
      };
      for (let i = 0; i < N; i++) {
        const t0 = i / N;
        const t1 = (i + 1) / N;
        const q = [at(t0, 0), at(t1, 0), at(t1, 1), at(t0, 0), at(t1, 1), at(t0, 1)];
        for (const v of q) p.push(...v);
      }
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g2.computeVertexNormals();
      b.add('leather', smoothNormals(g2, 0.3), null, [0.92, 0.9, 0.86]);
    };
    band(0.34, 0.43, 0.32, Math.PI - 0.32, 16, 0.0018, false); // the strap across the instep
    // buckle
    const w = halfW(0.4);
    b.add('steel', new THREE.TorusGeometry(0.0062, 0.0014, 8, 16), M(rotY(Math.PI / 2), rotX(0.5), move(0.385 * L, soleT(0.385) + 0.022, centre(0.385) - w * 0.95)));
    // insole, dark with wear
    const ins = [];
    for (let i = 2; i < NU - 6; i++) {
      const u0 = i / NU;
      const u1 = (i + 1) / NU;
      const y0 = soleT(u0) + 0.002;
      const y1 = soleT(u1) + 0.002;
      const w0 = halfW(u0) * 0.9;
      const w1 = halfW(u1) * 0.9;
      ins.push(u0 * L, y0, centre(u0) - w0, u0 * L, y0, centre(u0) + w0, u1 * L, y1, centre(u1) + w1, u0 * L, y0, centre(u0) - w0, u1 * L, y1, centre(u1) + w1, u1 * L, y1, centre(u1) - w1);
    }
    const gi = new THREE.BufferGeometry();
    gi.setAttribute('position', new THREE.Float32BufferAttribute(ins, 3));
    gi.computeVertexNormals();
    b.add('cream', gi, null, [0.85, 0.74, 0.58]); // the lining, pale and grubby
  }
  return b;
}

// --- housekeeping trolley ----------------------------------------------------------------------
function trolley() {
  const b = new Bag();
  const Lx = 1.02;
  const Dz = 0.46;
  const H = 0.98;
  const tube = (x, z, h, y0 = 0.1) => b.add('steel', new THREE.CylinderGeometry(0.011, 0.011, h, 12), move(x, y0 + h / 2, z));
  for (const x of [0, Lx]) for (const z of [0, Dz]) tube(x, z, H - 0.1);
  // shelves with a lip
  for (const y of [0.16, 0.52, 0.9]) {
    b.add('cream', box(Lx, 0.016, Dz, Lx / 2, y, Dz / 2), null, [0.75, 0.75, 0.75]);
    for (const z of [0, Dz]) b.add('steel', box(Lx, 0.03, 0.006, Lx / 2, y + 0.02, z));
  }
  // push handle
  b.add('steel', new THREE.CylinderGeometry(0.011, 0.011, Dz, 12), M(rotX(Math.PI / 2), move(-0.02, H + 0.02, Dz / 2)));
  // wheels
  for (const x of [0.06, Lx - 0.06]) for (const z of [0.05, Dz - 0.05]) {
    b.add('rubber', new THREE.CylinderGeometry(0.045, 0.045, 0.026, 18), M(rotX(Math.PI / 2), move(x, 0.045, z)));
    b.add('steel', box(0.02, 0.07, 0.035, x, 0.11, z));
  }
  // folded linen: stacks of soft slabs
  const r = mulberry(31);
  const stack = (x, y, z, n, w, d) => {
    for (let i = 0; i < n; i++) {
      const g = new RoundedBoxGeometry(w * (0.94 + 0.08 * r()), 0.03, d * (0.94 + 0.08 * r()), 3, 0.012);
      const k = 0.8 + 0.25 * r();
      b.add('cloth', g, M(rotY((r() - 0.5) * 0.12), move(x + (r() - 0.5) * 0.01, y + 0.015 + i * 0.029, z)), [k, k, k * 0.94]);
    }
  };
  stack(0.2, 0.908, Dz / 2, 5, 0.3, 0.34);
  stack(0.56, 0.908, Dz / 2, 3, 0.3, 0.34);
  stack(0.3, 0.528, Dz / 2, 6, 0.42, 0.36);
  stack(0.74, 0.528, Dz / 2, 4, 0.28, 0.36);
  // bottles
  for (let i = 0; i < 5; i++) {
    const h = 0.16 + 0.1 * r();
    b.add('cream', new THREE.CylinderGeometry(0.03, 0.034, h, 14), move(0.82 + (i % 2) * 0.09, 0.908 + h / 2, 0.1 + i * 0.065), [0.4 + 0.5 * r(), 0.5 + 0.4 * r(), 0.5 + 0.4 * r()]);
  }
  // the dirty linen sack on the end: a sagging bag on a hoop
  {
    const prof = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      prof.push(new THREE.Vector2(0.17 * (0.25 + 0.95 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) * (1 + 0.18 * Math.sin(t * 3.1))) , 0.16 + 0.66 * t));
    }
    const g = new THREE.LatheGeometry(prof, 20);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + 0.1 * noise2(pos.getX(i) * 14, pos.getY(i) * 9 + pos.getZ(i) * 12, 4);
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k * 1.15);
    }
    g.computeVertexNormals();
    b.add('cloth', g, move(Lx + 0.2, 0, Dz / 2), [0.6, 0.58, 0.5]);
    b.add('steel', new THREE.TorusGeometry(0.19, 0.008, 8, 24), M(rotX(Math.PI / 2), move(Lx + 0.2, 0.83, Dz / 2)));
  }
  return b;
}

// --- a framed picture ------------------------------------------------------------------------------
function picture(w, h, sign) {
  const b = new Bag();
  const fw = 0.032;
  const d = 0.022;
  for (const sy of [-1, 1]) b.add('trim', boxUV(box(w + 2 * fw, fw, d, 0, sy * (h / 2 + fw / 2), d / 2), { along: 'x' }), null, [0.45, 0.42, 0.4]);
  for (const sx of [-1, 1]) b.add('trim', boxUV(box(fw, h, d, sx * (w / 2 + fw / 2), 0, d / 2), { along: 'y' }), null, [0.45, 0.42, 0.4]);
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(sign.u0, sign.u1, uv.getX(i)), lerp(sign.v0, sign.v1, uv.getY(i)));
  b.add('signs', g, move(0, 0, 0.006));
  b.add('glass', new THREE.PlaneGeometry(w, h), move(0, 0, 0.014));
  return b;
}

export async function buildProps(bag, materials, T, doorMeta) {
  const objects = [];
  const lights = [];
  const R = mulberry(909);

  const leafPlace = (no) => {
    const m = doorMeta[no];
    return M(leafMatrix(m), m.frame);
  };
  const onLeaf = (x, y) => leafDepth(x, y);
  // (the grime round every handle and along every bottom rail is baked into the leaf skins, and
  // the water on the end wall into its panel: surfaces.js)

  // ---- old dried blood at handle height: door 306 and the wall beside it ----
  // A hand pressed flat on the door beside the handle and dragged down; three fingers drawn
  // down the panel below; a wipe off the edge onto the architrave and the wall.
  {
    const d = doorByNo(306);
    const m = doorMeta[306];
    const hx = m.handleSide * (DOOR.w / 2 - 0.06);
    decal(bag, 'blood1', leafPlace(306), hx - m.handleSide * 0.2, 1.06, 0.42, 0.54, { zFn: onLeaf, lift: 0.0045, n: 28, flip: m.handleSide > 0, rot: m.handleSide * 0.08 });
    decal(bag, 'blood3', leafPlace(306), hx - m.handleSide * 0.27, 0.58, 0.36, 0.5, { zFn: onLeaf, lift: 0.004, n: 24 });
    const frame = wallFrame(d.side, d.s + DOOR.w / 2);
    const jx = m.handleSide * (DOOR.w / 2 + 0.085 + 0.2);
    const sAt = (x) => d.s + DOOR.w / 2 + (d.side < 0 ? x : -x);
    decal(bag, 'blood2', frame, jx, 1.18, 0.46, 0.3, { zFn: (x, y) => wallBulge(d.side, sAt(x), y), lift: 0.003, rot: m.handleSide > 0 ? 0 : Math.PI, n: 8 });
  }

  // ---- gouges round the frame of the clawed door, and on the wall by the scare door ----
  {
    const d = doorByNo(305);
    const frame = wallFrame(d.side, d.s + DOOR.w / 2);
    const m = doorMeta[305];
    const freeSide = -m.hingeSide;
    decal(bag, 'gouge1', frame, freeSide * (DOOR.w / 2 + 0.035), 1.0, 0.085, 0.6, { lift: 0.0195, n: 2 });
    decal(bag, 'gouge2', frame, freeSide * (DOOR.w / 2 + 0.3), 1.22, 0.4, 0.5, { zFn: (x, y) => wallBulge(d.side, d.s + DOOR.w / 2 + x, y), lift: 0.003, rot: 0.2, n: 6 });
    const d8 = doorByNo(308);
    const f8 = wallFrame(d8.side, d8.s + DOOR.w / 2);
    decal(bag, 'gouge2', f8, DOOR.w / 2 + 0.3, 1.28, 0.34, 0.44, { zFn: (x, y) => wallBulge(d8.side, d8.s + DOOR.w / 2 - x, y), lift: 0.003, rot: -0.15, n: 6 });
  }

  // ---- butt hinges on the door that opens outwards: three knuckles on the corridor side ----
  {
    const d = doorByNo(305);
    const m = doorMeta[305];
    const frame = wallFrame(d.side, d.s + DOOR.w / 2);
    for (const y of [0.22, 1.0, 1.82]) {
      const knuckle = new THREE.CylinderGeometry(0.0065, 0.0065, 0.09, 12);
      bag.add('brassDull', knuckle, M(move(m.hingeSide * (DOOR.w / 2 - 0.002), y, -0.004), frame));
      bag.add('brassDull', box(0.03, 0.09, 0.002, m.hingeSide * (DOOR.w / 2 + 0.014), y, 0.001), frame);
    }
  }

  // ---- water: stains on the ceiling, runs down the wall under them ----
  const ceil = M(rotX(Math.PI / 2), move(0, CH, 0)); // local (x, y) -> world (x, CH, y); s = -y
  const stains = [
    ['water1', -0.35, 6.1, 1.5, 1.2, 0.3],
    ['water2', 0.42, 13.2, 1.1, 1.3, 1.9],
    ['water3', -0.2, 19.2, 1.3, 1.0, 4.0],
    ['water2', 0.5, 2.6, 0.7, 0.6, 2.4],
    ['water1', 0.1, 23.6, 1.6, 1.4, 5.1],
    ['water3', -0.55, 10.6, 0.7, 0.8, 0.9],
    ['water1', 0.3, 26.9, 0.9, 0.9, 3.3],
  ];
  for (const [name, x, s, w, h, rot] of stains) decal(bag, name, ceil, x, -s, w, h, { rot, lift: 0.003, n: 2 });
  // grime where hands and shoulders go: by the switches and along the wainscot rail
  // ---- stains on the carpet ----
  const floorM = rotX(-Math.PI / 2); // local (x, y, z) -> world (x, z, -y); y is s
  // (the runner's own stains are in its bake; these two are where something dark soaked in)
  const cstains = [
    ['stain2', 0.24, 16.4, 0.5, 0.7, 1.2],
    // something dark has soaked out under door 313 and dried into the runner
    ['stain2', 0.04, END - 0.42, 0.95, 0.62, 0.25],
  ];
  for (const [name, x, s, w, h, rot] of cstains) decal(bag, name, floorM, x, s, w, h, { rot, zFn: carpetHeight, lift: 0.003, n: 14, soft: true });

  // ---- peeling wallpaper: narrow strips coming away at the seams, under the cornice ----
  {
    const left = wallFrame(-1, 0);
    const right = wallFrame(1, 0);
    const SEAM = 0.53;
    // a strip that starts at the seam nearest to s, on its `dir` side (+1 or -1 in wall x)
    const strip = (side, s, dir, y0, w, len, seed, curl) => {
      const lx = alongWall(side, 0, s);
      const seam = Math.round(lx / SEAM) * SEAM;
      const x0 = dir > 0 ? seam : seam - w;
      peel(bag, side < 0 ? left : right, side, null, x0, y0, w, len, { seed, curl });
    };
    // A few, and small: a hand's width of paper that has let go along a seam and leans out of
    // the wall, not a flag. Each sits where the light of a lamp reaches it.
    strip(-1, 8.5, 1, 1.86, 0.05, 0.2, 3, 1.3);
    strip(1, 2.2, 1, 2.0, 0.04, 0.16, 12, 1.2);
    strip(1, 15.9, 1, 1.78, 0.055, 0.24, 8, 1.4);
    strip(-1, 26.4, 1, 1.9, 0.045, 0.2, 14, 1.1);
  }

  // ---- boards nailed across door 312 ----
  {
    const d = doorByNo(312);
    const frame = wallFrame(d.side, d.s + DOOR.w / 2);
    const r = mulberry(311);
    const planks = [
      [0.02, 0.52, 1.24, 0.13, 0.07],
      [-0.03, 0.97, 1.3, 0.15, -0.05],
      [0.03, 1.38, 1.2, 0.12, 0.2],
      [0.0, 1.76, 1.27, 0.14, -0.09],
      [0.05, 1.12, 1.5, 0.11, 1.02],
    ];
    planks.forEach(([x, y, len, w, rot], i) => {
      const t = 0.021;
      const g = boxUV(new THREE.BoxGeometry(len, w, t, 8, 1, 1), { along: 'x', offset: [r() * 2, r() * 2] });
      // boards are never straight: a slight bow and twist
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const u = pos.getX(k) / len;
        pos.setZ(k, pos.getZ(k) + 0.006 * (1 - 4 * u * u) * (i % 2 ? 1 : -0.5));
        pos.setY(k, pos.getY(k) * (1 + 0.05 * Math.sin(u * 7 + i)));
      }
      g.computeVertexNormals();
      const z = 0.019 + t / 2 + (i === 4 ? t + 0.004 : 0) + r() * 0.003;
      const place = M(rotZ(rot), move(x, y, z), frame);
      const k = 0.75 + 0.35 * r();
      bag.add('boards', g, place, [k, k, k]);
      // nails: two at each end, heads proud, one bent over
      for (const end of [-1, 1]) {
        for (const off of [-0.3, 0.3]) {
          const nx = end * (len / 2 - 0.045 - r() * 0.03);
          const ny = off * w + (r() - 0.5) * 0.01;
          const bent = r() < 0.2;
          const head = new THREE.CylinderGeometry(0.0048, 0.0048, 0.0022, 10);
          bag.add('iron', head, M(rotX(Math.PI / 2), move(nx, ny, t / 2 + 0.002 + (bent ? 0.004 : 0)), rotZ(rot), move(x, y, z), frame));
          if (bent) bag.add('iron', new THREE.CylinderGeometry(0.0016, 0.0016, 0.014, 6), M(rotZ(r() * 3), move(nx, ny, t / 2 + 0.003), rotZ(rot), move(x, y, z), frame));
        }
      }
    });
  }

  // ---- the child's shoe, on the runner, fallen over ----
  {
    const sh = shoe();
    const { s: ss, x } = SHOE_AT;
    const k = 1.22; // about a size 31
    // It stands where it was stepped out of, in the first pool of light: upright, the toe turned
    // towards the right wall, side on to the walker: the sole, the strap and the dark mouth of it.
    bag.addBag(sh, M(move(-0.08, 0, 0), scale(k), rotX(0.1), rotY(0.3), move(x, carpetHeight(x, ss) - 0.0005, -ss)));
  }

  // ---- trolley, parked against the left wall in the dark part ----
  {
    const t = trolley();
    // trolley x runs along the wall; put its long side on the wall, walker's end first
    bag.addBag(t, M(rotY(Math.PI / 2), rotY(0.035), move(-HW + 0.045, 0, -20.45)));
  }

  // ---- pictures, a notice, switches ----
  {
    const hang = (side, s, y, w, h, sign, tilt) => {
      const frame = wallFrame(side, s);
      bag.addBag(picture(w, h, sign), M(rotX(-0.035), rotZ(tilt), move(0, y, 0.004), frame));
    };
    hang(-1, 4.85, 1.56, 0.46, 0.34, SIGN.print1, 0.012);
    hang(1, 7.0, 1.55, 0.3, 0.42, SIGN.print2, -0.045);
    hang(-1, 13.1, 1.57, 0.46, 0.3, SIGN.print3, 0.02);
    hang(1, 10.9, 1.5, 0.4, 0.26, SIGN.evac, 0.0);
    const sw = (side, s) => {
      const frame = wallFrame(side, s);
      const g = new RoundedBoxGeometry(0.082, 0.082, 0.012, 2, 0.004);
      bag.add('cream', g, M(move(0, 1.32, 0.006), frame), [0.9, 0.85, 0.75]);
      bag.add('cream', box(0.022, 0.034, 0.008, 0, 1.32, 0.016), M(rotX(0.14), frame), [0.75, 0.7, 0.6]);
      decal(bag, 'grime1', frame, 0.01, 1.3, 0.34, 0.4, { zFn: (x, y) => wallBulge(side, s + (side < 0 ? x : -x), y), lift: 0.003, n: 6 });
    };
    sw(-1, 1.55);
    sw(1, 3.7);
    sw(-1, 18.35);
    sw(1, 26.75);
  }

  // ---- do-not-disturb card on the handle of 304 ----
  {
    const m = doorMeta[304];
    const hx = m.handleSide * (DOOR.w / 2 - 0.06) - m.handleSide * 0.04;
    const g = new THREE.PlaneGeometry(0.085, 0.2, 2, 6);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, 0.002 * Math.sin(pos.getY(i) * 20));
      uv.setXY(i, lerp(SIGN.card.u0, SIGN.card.u1, uv.getX(i)), lerp(SIGN.card.v0, SIGN.card.v1, uv.getY(i)));
    }
    g.computeVertexNormals();
    bag.add('signs', g, M(rotZ(0.06), move(hx, 0.9, 0.02), leafPlace(304)));
  }

  // ---- exit sign, hung from the ceiling; the way out is behind the walker ----
  {
    const s = 21.9; // far enough down the corridor to sit near its vanishing point, clear of the page heading
    const w = 0.36;
    const h = 0.17;
    const dpt = 0.055;
    const y = 2.24;
    const b = new Bag();
    b.add('iron', box(w + 0.012, h + 0.012, dpt, 0, 0, 0));
    for (const sgn of [-1, 1]) {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(SIGN.exit.u0, SIGN.exit.u1, uv.getX(i)), lerp(SIGN.exit.v0, SIGN.exit.v1, uv.getY(i)));
      b.add('exitGlow', g, M(rotY(sgn > 0 ? 0 : Math.PI), move(0, 0, sgn * (dpt / 2 + 0.001))));
    }
    for (const sx of [-1, 1]) b.add('steel', new THREE.CylinderGeometry(0.004, 0.004, CH - y - h / 2, 8), move(sx * 0.13, h / 2 + (CH - y - h / 2) / 2, 0));
    bag.addBag(b, M(rotY(0.03), move(0.28, y, -s)));
    // what the sign throws on the walls: nothing in a lit corridor, the only colour in a dark one
    for (const sgn of [-1, 1]) {
      const glow = new THREE.PointLight(new THREE.Color(0.4, 1.0, 0.55), 0.075, 0, 2);
      glow.position.set(0.28, y - 0.02, -s + sgn * 0.14);
      objects.push(glow);
    }

  }

  // ---- light under door 311, and the feet of whoever is standing behind it ----
  {
    const d = doorByNo(311);
    const frame = wallFrame(d.side, d.s + DOOR.w / 2);
    const lamp = new THREE.PointLight(new THREE.Color(1.0, 0.86, 0.66), 26, 0, 2);
    // low and close behind the door, so it rakes out under it and across the corridor floor
    const p = new THREE.Vector3(0.05, 0.06, -WALL_T - 0.62).applyMatrix4(frame);
    lamp.position.copy(p);
    objects.push(lamp);
    for (const sx of [-1, 1]) bag.add('void', box(0.09, 0.07, 0.24, sx * 0.085 - 0.1, 0.035, -WALL_T - 0.2), frame);
  }

  // ---- fire extinguisher (Poly Haven model), on the floor by the right wall ----
  try {
    const gltf = await new GLTFLoader().loadAsync('/corridor3d/textures/models/korean_fire_extinguisher_01/korean_fire_extinguisher_01.gltf');
    const model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      const keep = /body/.test(src.name);
      const m = new THREE.MeshPhysicalMaterial({
        map: keep ? src.map : null,
        // (colour map only: the tracer's texture array is full)
        color: keep ? new THREE.Color(0.8, 0.8, 0.8) : /glass/.test(src.name) ? new THREE.Color(0.05, 0.05, 0.05) : new THREE.Color(0.6, 0.57, 0.5),
        roughness: keep ? 0.38 : 0.4,
        metalness: keep ? 0.35 : 0,
        side: THREE.DoubleSide,
      });
      m.name = `ext-${src.name}`;
      o.material = m;
    });
    // The scan stands on a moulded plastic base (the first 13 cm). Cut it away and stand the
    // cylinder on the boards, the way one stands in a corridor nobody inspects.
    const BASE_H = 0.135;
    model.traverse((o) => {
      if (!o.isMesh || !/body/.test(o.material.name)) return;
      const geo = o.geometry;
      const pos = geo.attributes.position;
      const idx = geo.index.array;
      const keep = [];
      for (let i = 0; i < idx.length; i += 3) {
        const top = Math.max(pos.getY(idx[i]), pos.getY(idx[i + 1]), pos.getY(idx[i + 2]));
        if (top > BASE_H) keep.push(idx[i], idx[i + 1], idx[i + 2]);
      }
      geo.setIndex(keep);
    });
    model.position.set(HW - 0.14, -BASE_H + 0.002, -15.95);
    model.rotation.y = -Math.PI / 2 + 0.25;
    objects.push(model);
  } catch (e) {
    console.warn('extinguisher model missing, skipped:', e.message);
  }

  return { objects, lights };
}
