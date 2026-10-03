// Small modelling toolkit: seeded randomness, noise, UV projection, profile extrusion and a
// "bag" that collects geometry per material and merges it into one mesh per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// --- seeded randomness -------------------------------------------------------------------
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash2 = (x, y, seed = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const fade = (t) => t * t * (3 - 2 * t);
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function fbm(x, y, seed = 0, oct = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise2(x * f, y * f, seed + i * 17);
    amp *= 0.5;
    f *= 2.03;
  }
  return v / (1 - Math.pow(0.5, oct));
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;

// --- UVs ------------------------------------------------------------------------------------
// Box projection in the geometry's current coordinates, in metres. `along` is the axis the
// wood grain (texture V) should follow; faces that contain that axis get it as V.
export function boxUV(geo, { along = 'y', offset = [0, 0] } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const ax = { x: 0, y: 1, z: 2 }[along];
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(pos, i + k);
    n.crossVectors(e1.subVectors(p[1], p[0]), e2.subVectors(p[2], p[0]));
    const an = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    const dom = an[0] >= an[1] && an[0] >= an[2] ? 0 : an[1] >= an[2] ? 1 : 2;
    const inPlane = [0, 1, 2].filter((a) => a !== dom);
    let vAxis = inPlane.includes(ax) ? ax : inPlane[1];
    let uAxis = inPlane.find((a) => a !== vAxis);
    for (let k = 0; k < 3; k++) {
      const c = [p[k].x, p[k].y, p[k].z];
      uv[(i + k) * 2] = c[uAxis] + offset[0];
      uv[(i + k) * 2 + 1] = c[vAxis] + offset[1];
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Planar UVs from two axes of the current coordinates (metres).
export function planarUV(geo, uAxis, vAxis, uSign = 1, vSign = 1) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = uSign * pos.getComponent(i, uAxis);
    uv[i * 2 + 1] = vSign * pos.getComponent(i, vAxis);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function scaleUV(geo, su, sv = su, swap = false) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (swap) uv.setXY(i, v * su, u * sv);
    else uv.setXY(i, u * su, v * sv);
  }
  return geo;
}

// --- primitives -----------------------------------------------------------------------------
export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
// Box given by min corner and size.
export const boxAt = (x, y, z, w, h, d) => box(w, h, d, x + w / 2, y + h / 2, z + d / 2);

// A subdivided rectangle in the XY plane from (x0,y0) to (x1,y1), facing +Z.
export function grid(x0, y0, x1, y1, cell = 0.1) {
  const nx = Math.max(1, Math.round((x1 - x0) / cell));
  const ny = Math.max(1, Math.round((y1 - y0) / cell));
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, nx, ny);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  return g;
}

// Extrude a 2D profile (array of [a, b] points, in metres) along a length. The profile lies
// in the XY plane, the length runs along +Z from 0. Flat shaded per profile segment unless
// `smoothShade`. UV: u = distance around the profile, v = z, so wood grain runs along the piece.
// `step` cuts the length into pieces of about that size, so wear can be painted along it.
export function extrude(profile, length, { closed = false, caps = false, smoothShade = false, step = 0 } = {}) {
  const pts = closed ? [...profile, profile[0]] : profile;
  const pos = [];
  const uv = [];
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, b0] = pts[i];
    const [a1, b1] = pts[i + 1];
    const seg = Math.hypot(a1 - a0, b1 - b0);
    // two triangles, wound so the normal points to the right of the walking direction of the profile
    const n = step > 0 ? Math.max(1, Math.round(length / step)) : 1;
    for (let k = 0; k < n; k++) {
      const z0 = (length * k) / n;
      const z1 = (length * (k + 1)) / n;
      pos.push(a0, b0, z0, a1, b1, z0, a1, b1, z1, a0, b0, z0, a1, b1, z1, a0, b0, z1);
      uv.push(dist, z0, dist + seg, z0, dist + seg, z1, dist, z0, dist + seg, z1, dist, z1);
    }
    dist += seg;
  }
  if (caps) {
    // fan caps, good enough for convex-ish profiles
    const [ca, cb] = profile.reduce((acc, p) => [acc[0] + p[0] / profile.length, acc[1] + p[1] / profile.length], [0, 0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [a0, b0] = pts[i];
      const [a1, b1] = pts[i + 1];
      pos.push(ca, cb, 0, a1, b1, 0, a0, b0, 0);
      uv.push(ca, cb, a1, b1, a0, b0);
      pos.push(ca, cb, length, a0, b0, length, a1, b1, length);
      uv.push(ca, cb, a0, b0, a1, b1);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (smoothShade) g = smoothNormals(g);
  return g;
}

// Average normals of coincident vertices (keeps the geometry non-indexed).
export function smoothNormals(g, crease = 0.5) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  const out = new Float32Array(nor.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const sum = new THREE.Vector3();
  for (const list of map.values()) {
    for (const i of list) {
      a.fromBufferAttribute(nor, i);
      sum.set(0, 0, 0);
      for (const j of list) {
        b.fromBufferAttribute(nor, j);
        if (a.dot(b) > crease) sum.add(b);
      }
      sum.normalize();
      out[i * 3] = sum.x;
      out[i * 3 + 1] = sum.y;
      out[i * 3 + 2] = sum.z;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

// Make any geometry mergeable: non-indexed, with position, normal, uv and colour.
export function norm(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  if (!g.attributes.color || g.attributes.color.itemSize !== 3) {
    const c = new Float32Array(n * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (color) {
    const c = g.attributes.color;
    for (let i = 0; i < n; i++) c.setXYZ(i, c.getX(i) * color[0], c.getY(i) * color[1], c.getZ(i) * color[2]);
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  return g;
}

// Paint vertex colours from a function of the (current) vertex position.
export function paint(geo, fn) {
  const g = norm(geo);
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const c = fn(v);
    if (typeof c === 'number') col.setXYZ(i, c, c, c);
    else col.setXYZ(i, c[0], c[1], c[2]);
  }
  return g;
}

export const M = (...ops) => {
  // compose transforms, applied in the order given: M(rotY(a), move(x,y,z))
  const m = new THREE.Matrix4();
  for (const op of ops) m.premultiply(op);
  return m;
};
export const move = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
export const rotX = (a) => new THREE.Matrix4().makeRotationX(a);
export const rotY = (a) => new THREE.Matrix4().makeRotationY(a);
export const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);
export const scale = (x, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z);

// --- the bag ----------------------------------------------------------------------------------
export class Bag {
  constructor() {
    this.items = new Map();
  }
  // Add a geometry (already UV-mapped in metres) under a material name, with an optional transform.
  add(mat, geo, matrix, color) {
    const g = norm(geo, color);
    if (matrix) g.applyMatrix4(matrix);
    if (!this.items.has(mat)) this.items.set(mat, []);
    this.items.get(mat).push(g);
    return g;
  }
  // Merge another bag in, transformed.
  addBag(other, matrix) {
    for (const [mat, list] of other.items) {
      for (const g of list) {
        const c = g.clone();
        if (matrix) c.applyMatrix4(matrix);
        if (!this.items.has(mat)) this.items.set(mat, []);
        this.items.get(mat).push(c);
      }
    }
  }
  build(materials, name = 'static') {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.items) {
      const m = materials[mat];
      if (!m) throw new Error(`unknown material ${mat}`);
      const merged = mergeGeometries(list, false);
      // UVs are in metres: bring them into texture space here.
      const size = m.userData.size ?? [1, 1];
      const swap = Boolean(m.userData.swapUV);
      scaleUV(merged, 1 / size[0], 1 / size[1], swap);
      const mesh = new THREE.Mesh(merged, m);
      mesh.name = `${name}:${mat}`;
      group.add(mesh);
    }
    return group;
  }
  get triangles() {
    let n = 0;
    for (const list of this.items.values()) for (const g of list) n += g.attributes.position.count / 3;
    return n;
  }
}
