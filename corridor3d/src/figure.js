// Whoever is behind door 308: a thin girl standing in the dark room beyond the door edge. She
// holds the edge of the door with one hand, the fingers hooked round it onto the corridor face,
// and leans her head out past it: one eye and one cheek come into the strip of light that
// falls through the gap, the rest of her stays black. This is the stand-in used until a real
// photo is supplied in src/assets/scare/ (see the README there).
//
// The head lives in door coordinates (x along the wall, +x towards the walker; y up; z out into
// the corridor); the hand lives in leaf coordinates so it swings with the door.
import * as THREE from 'three';
import { PhysicalSpotLight } from 'three-gpu-pathtracer';
import { DOOR, WALL_T, HW, LAMPS, LAMP_Y, door as doorByNo, SCARE_DOOR, scareEye } from './layout.js';
import { Bag, M, move, mulberry, fbm, smooth, clamp, lerp, smoothNormals } from './util.js';

const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-Math.pow((x - cx) / sx, 2) - Math.pow((y - cy) / sy, 2));
const T = () => globalThis.__fig ?? {};

// Head proportions, metres. Eyes on the half height of the head, as in an adult; a long, thin
// face with the cheeks fallen in.
const HEAD = { a: 0.069, b: 0.104, c: 0.09 };
const EYE = { x: 0.0315, y: 0.004, r: 0.0121 };

// Radius of the head in direction d (unit vector, +z is the face), and a skin tint.
function headSurface(d, features = true) {
  const jaw = smooth(0.0, -0.95, d.y);
  const crown = smooth(0.2, 0.95, d.y);
  const a = HEAD.a * (1 - 0.17 * jaw) * (1 + 0.03 * crown);
  const b = HEAD.b;
  const front = smooth(0.05, 0.45, d.z);
  const c = (d.z > 0 ? HEAD.c * 0.93 : HEAD.c * 1.06) * (1 - 0.06 * jaw * front);
  let r = 1 / Math.sqrt((d.x * d.x) / (a * a) + (d.y * d.y) / (b * b) + (d.z * d.z) / (c * c));
  if (!features) return { r, col: [1, 1, 1] };
  const fx = d.x * r;
  const fy = d.y * r;
  const ax = Math.abs(fx);
  let disp = 0;
  let dark = 0;
  let red = 0;
  let lips = 0;
  // the brow: a ridge over each eye, a flat forehead above, the root of the nose between
  disp += 0.0058 * g2(ax, fy, 0.03, 0.025, 0.026, 0.008);
  disp -= 0.0034 * g2(fx, fy, 0, 0.012, 0.009, 0.009);
  // eye sockets: deep, the skin round them bruised dark
  const socket = g2(ax, fy, EYE.x, EYE.y, 0.018, 0.0145);
  disp -= 0.0145 * socket;
  dark += 0.7 * g2(ax, fy, EYE.x, EYE.y - 0.005, 0.022, 0.019);
  red += 0.5 * g2(ax, fy, EYE.x + 0.002, EYE.y - 0.013, 0.016, 0.006);
  // temples sunk in
  disp -= 0.0045 * g2(ax, fy, 0.062, 0.018, 0.012, 0.022);
  // nose: a thin bridge, a narrow tip that stands well out, the wings and two dark nostrils
  disp += 0.0085 * Math.exp(-Math.pow(fx / 0.0058, 2)) * smooth(0.014, -0.004, fy) * smooth(-0.04, -0.022, fy);
  disp += 0.019 * g2(fx, fy, 0, -0.031, 0.0085, 0.0105);
  disp += 0.0065 * g2(ax, fy, 0.0108, -0.037, 0.005, 0.0055);
  dark += 0.5 * g2(ax, fy, 0.0062, -0.0405, 0.0026, 0.0017);
  red += 0.35 * g2(fx, fy, 0, -0.033, 0.009, 0.007);
  // cheekbones high and sharp, the cheeks hollow under them
  disp += 0.0075 * g2(ax, fy, 0.046, -0.013, 0.014, 0.0105);
  disp -= 0.0068 * g2(ax, fy, 0.041, -0.046, 0.013, 0.017);
  dark += 0.35 * g2(ax, fy, 0.042, -0.047, 0.013, 0.016);
  // mouth: thin lips a little apart, corners down
  const my = -0.0595 - 0.0035 * Math.pow(ax / 0.02, 2);
  disp += 0.0038 * g2(fx, fy, 0, my + 0.0045, 0.0175, 0.0036);
  disp += 0.0042 * g2(fx, fy, 0, my - 0.0055, 0.015, 0.0048);
  disp -= 0.0072 * g2(fx, fy, 0, my, 0.018, 0.0022); // lips a little apart
  lips = clamp(g2(fx, fy, 0, my + 0.0038, 0.016, 0.004) + g2(fx, fy, 0, my - 0.0048, 0.0135, 0.0046), 0, 1);
  dark += 0.95 * g2(fx, fy, 0, my, 0.016, 0.0019);
  disp -= 0.0022 * g2(fx, fy, 0, -0.048, 0.0035, 0.005); // philtrum
  // a narrow chin, the jaw line under the hollow cheeks
  disp += 0.0032 * g2(fx, fy, 0, -0.088, 0.018, 0.011);
  disp -= 0.0022 * g2(fx, fy, 0, -0.075, 0.02, 0.0035);
  disp += 0.0026 * g2(ax, fy, 0.052, -0.07, 0.01, 0.02);
  r += disp * front;
  dark = clamp(dark * front, 0, 1);
  red = clamp(red * front, 0, 1);
  // bloodless skin, blotchy, the veins faintly through it at the temples, pores as a fine grain
  const n = (0.88 + 0.22 * fbm(d.x * 11 + 3, d.y * 11 + d.z * 7, 77, 4)) * (0.9 + 0.2 * fbm(d.x * 3.5 + 9, d.y * 3.5 - d.z * 2, 78, 3)) * (0.94 + 0.12 * fbm(d.x * 60, d.y * 60 + d.z * 40, 79, 2));
  const vein = 0.1 * g2(ax, fy, 0.058, 0.03, 0.01, 0.02) * front;
  const k = n * (1 - 0.62 * dark);
  const col = [
    k * (1 - 0.12 * lips * front - 0.05 * vein) * (1 + 0.05 * red),
    k * (0.93 - 0.18 * lips * front - 0.05 * dark - 0.12 * red),
    k * (0.92 - 0.06 * lips * front + 0.03 * vein - 0.1 * red),
  ];
  return { r, col };
}

// The eyeball: a dull grey-white gone red at the rim, a grey-green iris, a wide pupil.
function eyeball(rad) {
  const eg = new THREE.SphereGeometry(rad, 48, 36);
  eg.rotateX(Math.PI / 2); // pole forwards
  const ep = eg.attributes.position;
  const ec = new Float32Array(ep.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < ep.count; i++) {
    v.fromBufferAttribute(ep, i).normalize();
    const ang = Math.acos(clamp(v.z, -1, 1));
    const around = Math.atan2(v.y, v.x);
    let c;
    if (ang < 0.2) c = [0.008, 0.008, 0.008];
    else if (ang < 0.47) {
      const fib = 0.5 + 0.5 * Math.sin(around * 40 + ang * 30);
      const k = 0.07 + 0.05 * fib * smooth(0.2, 0.47, ang);
      c = [k * 0.9, k, k * 0.86];
    } else if (ang < 0.52) c = [0.03, 0.03, 0.028];
    else {
      const rim = smooth(0.7, 1.4, ang);
      const veins = rim * Math.pow(0.5 + 0.5 * Math.sin(around * 23 + ang * 9), 6);
      c = [0.62 - 0.08 * rim, 0.58 - 0.24 * rim - 0.2 * veins, 0.53 - 0.24 * rim - 0.2 * veins];
    }
    ec.set(c, i * 3);
  }
  eg.setAttribute('color', new THREE.BufferAttribute(ec, 3));
  return eg;
}

function head() {
  const b = new Bag();
  const geo = new THREE.SphereGeometry(1, 160, 120);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const s = headSurface(d);
    pos.setXYZ(i, d.x * s.r, d.y * s.r, d.z * s.r);
    col.set(s.col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  b.add('skin', geo);
  // the depth of the face seen from the front, on a 2 mm grid: the hair drapes over it
  const G = 0.002;
  const X0 = -0.09;
  const Y0 = -0.14;
  const NX = 90;
  const NY = 140;
  const zt = new Float32Array(NX * NY).fill(-1);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z <= 0) continue;
    const gx = Math.round((pos.getX(i) - X0) / G);
    const gy = Math.round((pos.getY(i) - Y0) / G);
    if (gx < 0 || gy < 0 || gx >= NX || gy >= NY) continue;
    zt[gy * NX + gx] = Math.max(zt[gy * NX + gx], z);
  }
  const front = (x, y) => {
    const gx = Math.round((x - X0) / G);
    const gy = Math.round((y - Y0) / G);
    let best = -1;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = gx + dx;
      const yy = gy + dy;
      if (xx >= 0 && yy >= 0 && xx < NX && yy < NY) best = Math.max(best, zt[yy * NX + xx]);
    }
    return best;
  };

  // the eyes: where the face would be without the sockets, a little behind it
  const eyes = [];
  for (const sx of [-1, 1]) {
    const dir = new THREE.Vector3(sx * EYE.x, EYE.y, HEAD.c * 0.93).normalize();
    const plain = headSurface(dir, false).r;
    const front = dir.clone().multiplyScalar(plain);
    const centre = new THREE.Vector3(sx * EYE.x, EYE.y, front.z - EYE.r - 0.0012);
    // staring a little up from under the brow, and in towards the walker
    const look = M(new THREE.Matrix4().makeRotationX(-0.12), new THREE.Matrix4().makeRotationY(-sx * 0.03), move(centre.x, centre.y, centre.z));
    b.add('eye', eyeball(EYE.r), look);
    eyes.push(centre);
    // lids: the upper one pulled back (a stare), the lower one slack and dark-rimmed
    const up = new THREE.SphereGeometry(EYE.r * 1.1, 36, 12, 0, Math.PI * 2, 0, 1.06);
    b.add('skin', up, M(new THREE.Matrix4().makeRotationX(0.32), move(centre.x, centre.y, centre.z)), [0.46, 0.39, 0.39]);
    const lo = new THREE.SphereGeometry(EYE.r * 1.08, 36, 10, 0, Math.PI * 2, 2.2, Math.PI - 2.2);
    b.add('skin', lo, M(new THREE.Matrix4().makeRotationX(-0.12), move(centre.x, centre.y, centre.z)), [0.4, 0.3, 0.32]);
  }
  return { bag: b, eyes, front };
}

// Long, black, wet hair, parted in the middle. It lies flat on the skull and falls straight
// down in front of the face like a curtain, draped over the brow, the nose and the chin and
// hanging on below them. It has come apart over one eye only: that eye, a strip of cheek and
// the bridge of the nose show between two wet locks; everything else is behind hair.
// `front(x, y)` is the depth of the face at (x, y), used to drape the strands over it.
function hair(front, opening) {
  let open = opening;
  const b = new Bag();
  const r = mulberry(4242);
  const onSkull = (dir, lift) => {
    const dd = dir.clone().normalize();
    return dd.multiplyScalar(headSurface(dd, false).r + lift);
  };
  const ribbon = (pts, width, tint, facing = null) => {
    const pos = [];
    const N = pts.length - 1;
    for (let i = 0; i < N; i++) {
      const tan = new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize();
      // a lock in front of the face lies flat to the face; elsewhere it lies flat to the skull
      const nrm = facing ? facing.clone() : pts[i].clone().setY(pts[i].y * 0.3).normalize();
      const sideV = new THREE.Vector3().crossVectors(tan, nrm).normalize();
      const w0 = width * (1 - 0.65 * Math.pow(i / N, 2)) * 0.5;
      const w1 = width * (1 - 0.65 * Math.pow((i + 1) / N, 2)) * 0.5;
      const a0 = pts[i].clone().addScaledVector(sideV, -w0);
      const b0 = pts[i].clone().addScaledVector(sideV, w0);
      const a1 = pts[i + 1].clone().addScaledVector(sideV, -w1);
      const b1 = pts[i + 1].clone().addScaledVector(sideV, w1);
      for (const v of [a0, b0, b1, a0, b1, a1]) pos.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.computeVertexNormals();
    b.add('hair', smoothNormals(sg, 0.3), null, tint);
  };
  // the scalp under it, dark
  const cap = new THREE.SphereGeometry(1, 72, 48);
  const cp = cap.attributes.position;
  const d = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++) {
    d.fromBufferAttribute(cp, i).normalize();
    const sr = headSurface(d, false);
    cp.setXYZ(i, d.x * (sr.r + 0.0024), d.y * (sr.r + 0.0024), d.z * (sr.r + 0.0024));
  }
  const ci = cap.index.array;
  const keep = [];
  for (let i = 0; i < ci.length; i += 3) {
    const c = new THREE.Vector3();
    for (let k = 0; k < 3; k++) c.add(d.fromBufferAttribute(cp, ci[i + k]));
    c.multiplyScalar(1 / 3).normalize();
    const face = c.z > 0.35 && c.y < 0.62 - 0.9 * c.x * c.x && Math.abs(c.x) < 0.66;
    if (!face && c.y > -0.35) keep.push(ci[i], ci[i + 1], ci[i + 2]);
  }
  cap.setIndex(keep);
  cap.computeVertexNormals();
  b.add('hair', cap, null, [0.4, 0.4, 0.4]);

  // The curtain. A strand starts on the parting, runs down the skull to the hairline at x0,
  // then falls: at every height it lies `gap` in front of the highest point of the face above
  // it (wet hair drapes and hangs, it does not follow the face back in under the nose).
  const HL = 0.064; // hairline height
  const curtain = (x0, gap, len, width, wav, tint) => {
    const pts = [];
    // on the skull: from the parting to the hairline above x0
    const R = new THREE.Vector3(Math.sign(x0 || 1) * 0.012, 0.95, 0.3);
    const E = new THREE.Vector3(x0 / HEAD.a, HL / HEAD.b, Math.sqrt(Math.max(0.05, 1 - (x0 / HEAD.a) ** 2 - (HL / HEAD.b) ** 2)));
    for (let i = 0; i <= 10; i++) pts.push(onSkull(new THREE.Vector3().lerpVectors(R, E, i / 10), 0.003 + 0.002 * Math.sin((i / 10) * Math.PI)));
    let zMax = pts[pts.length - 1].z;
    const top = pts[pts.length - 1];
    const N = 46;
    for (let i = 1; i <= N; i++) {
      const f = i / N;
      const y = top.y - f * len;
      // wet locks wander a little, and the two either side of the parting are pushed apart
      // round the eye, closing again below it
      let x = top.x + 0.0028 * Math.sin(f * 7 + wav) + 0.0016 * Math.sin(f * 19 + wav * 2);
      // a strand that would cross the eye is pushed to the edge of the opening there
      const inside = open - Math.abs(top.x - ex);
      if (inside > 0) x += Math.sign(top.x - ex || 1) * (inside + 0.002) * Math.exp(-Math.pow((y - EYE.y + 0.003) / 0.024, 2));
      x *= 1 + 0.18 * smooth(-0.09, -0.3, y); // fanning out over the shoulders
      zMax = Math.max(zMax, front(x, y) + gap);
      // below the chin it hangs, drifting back a little towards the chest
      const z = y < -0.1 ? zMax - 0.06 * smooth(-0.1, -0.36, y) : zMax;
      pts.push(new THREE.Vector3(x, y, z));
    }
    // each lock turned its own way, so they do not all catch the light at once
    const a = (r() - 0.5) * 1.6;
    ribbon(pts, width, tint, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
  };
  // the visible eye is at x = -EYE.x; the curtain has come apart over it
  const ex = -EYE.x;
  for (let i = 0; i < 340; i++) {
    const k = 0.5 + 0.9 * r();
    curtain(-0.084 + 0.168 * r(), 0.0025 + 0.012 * r() * r(), 0.38 + 0.12 * r(), 0.0011 + 0.0016 * r(), r() * 6, [k, k, k]);
  }
  // wet clumps: a few wider, glossier locks in front
  for (let i = 0; i < 26; i++) curtain(-0.07 + 0.14 * r(), 0.006 + 0.01 * r(), 0.4 + 0.1 * r(), 0.003 + 0.0025 * r(), r() * 6, [1.3, 1.3, 1.3]);
  // two or three single strands that stayed, across the cheek and the corner of the eye
  const keepOpen = open;
  open = 0;
  for (let i = 0; i < 3; i++) curtain(ex + (i - 1) * 0.009, 0.002 + 0.002 * i, 0.32, 0.0007, 1 + i * 2, [1, 1, 1]);
  open = keepOpen;
  // the back and sides: hanging from the skull past the shoulders
  for (const side of [-1, 1]) {
    for (let i = 0; i < 70; i++) {
      const u = r();
      const az = 1.2 + 1.8 * u;
      const el = 0.1 - 0.5 * u * r();
      const E = new THREE.Vector3(side * Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      const R = new THREE.Vector3(side * 0.012, 0.95, 0.1 - 0.6 * u);
      const pts = [];
      for (let j = 0; j <= 10; j++) pts.push(onSkull(new THREE.Vector3().lerpVectors(R, E, j / 10), 0.003));
      const t0 = pts[pts.length - 1];
      const out = new THREE.Vector3(t0.x, 0, t0.z).normalize();
      for (let j = 1; j <= 24; j++) {
        const f = j / 24;
        pts.push(t0.clone().add(new THREE.Vector3(0, -f * (0.38 + 0.1 * r()), 0)).addScaledVector(out, 0.012 * Math.sin(Math.min(1, f * 3) * 1.57)));
      }
      const k = 0.5 + 0.8 * r();
      ribbon(pts, 0.002 + 0.003 * r(), [k, k, k]);
    }
  }
  return b;
}

// Neck, collarbones and a dark nightdress, origin at the centre of the head.
function body() {
  const b = new Bag();
  b.add('skin', new THREE.CylinderGeometry(0.029, 0.034, 0.11, 24), move(0, -0.125, -0.016), [0.22, 0.21, 0.2]); // in the shadow of the jaw
  const prof = [
    [0.032, -0.15],
    [0.05, -0.17],
    [0.11, -0.19],
    [0.158, -0.215],
    [0.165, -0.27],
    [0.145, -0.42],
    [0.15, -0.7],
    [0.19, -1.05],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const gown = new THREE.LatheGeometry(prof, 40);
  const gp = gown.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const a = Math.atan2(gp.getZ(i), gp.getX(i));
    const y = gp.getY(i);
    const fold = 1 + 0.06 * Math.sin(a * 9 + y * 6) * smooth(-0.25, -0.6, y);
    gp.setX(i, gp.getX(i) * fold);
    gp.setZ(i, gp.getZ(i) * fold * 0.6);
  }
  gown.computeVertexNormals();
  b.add('gown', gown, null, [0.02, 0.019, 0.018]);
  return b;
}

// A tube along a curve with a radius per point and a flattened (finger-like) cross-section.
function sweep(pts, radius, { flat = 0.86, seg = 14, up = new THREE.Vector3(0, 1, 0), tint = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 40;
  const pos = [];
  const col = [];
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const nrm = new THREE.Vector3().crossVectors(side, tan).normalize();
    const rr = radius(t);
    const ring = [];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      ring.push(p.clone().addScaledVector(side, Math.cos(a) * rr).addScaledVector(nrm, Math.sin(a) * rr * flat));
    }
    rings.push(ring);
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < seg; j++) {
      const q = [rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j], rings[i + 1][j + 1], rings[i][j + 1]];
      const tq = [i, i + 1, i + 1, i, i + 1, i].map((k) => k / N);
      q.forEach((v, k) => {
        pos.push(v.x, v.y, v.z);
        const c = tint ? tint(tq[k]) : [1, 1, 1];
        col.push(...c);
      });
    }
  }
  // round cap at the end
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return { geo: smoothNormals(g, 0.6), end: curve.getPointAt(1), endTan: curve.getTangentAt(1), at: (t) => curve.getPointAt(t), tanAt: (t) => curve.getTangentAt(t) };
}

// A hand holding the free edge of the leaf from the room: the fingers come round the edge and
// lie on the corridor face of the door, bent at the joints, the nails towards the corridor; the
// thumb is pressed flat against the edge itself, in the gap. In leaf coordinates: the edge face
// is at x = edgeX (the leaf lies towards +x of it when dirX = +1), the corridor face at z = 0,
// the room face at z = -DOOR.t. Long thin fingers, no two alike, swollen knuckles, nails broken.
function hand(edgeX, dirX, y0) {
  const b = new Bag();
  const t = DOOR.t;
  const out = -dirX; // away from the leaf, into the gap
  const P = T().fingers ?? {};
  // index (top) to little: height, length of the three bones, radius, how far round the edge
  // it reaches, how hard it is bent
  const F = [
    { dy: 0.033, bones: [0.046, 0.03, 0.022], w: 0.0066, reach: 0.95, bend: 0.75, fan: 0.3 },
    { dy: 0.011, bones: [0.05, 0.034, 0.024], w: 0.0069, reach: 1.15, bend: 0.35, fan: 0.06 },
    { dy: -0.01, bones: [0.048, 0.031, 0.023], w: 0.0065, reach: 1.0, bend: 0.55, fan: -0.14 },
    { dy: -0.031, bones: [0.038, 0.023, 0.019], w: 0.0056, reach: 0.7, bend: 0.95, fan: -0.38 },
  ];
  const skinTint = (u, i) => {
    const crease = 0.24 * (Math.exp(-Math.pow((u - 0.47) / 0.018, 2)) + Math.exp(-Math.pow((u - 0.76) / 0.016, 2)));
    const knuckle = 0.1 * Math.exp(-Math.pow((u - 0.47) / 0.035, 2)) + 0.08 * Math.exp(-Math.pow((u - 0.76) / 0.03, 2));
    const k = 0.9 - crease + 0.03 * Math.sin(i * 3.1);
    // knuckles redder and rougher, the tips bloodless
    return [k * (1 + 0.6 * knuckle), k * (0.93 - 0.5 * knuckle), k * (0.9 - 0.4 * knuckle)];
  };
  F.forEach((f, i) => {
    const y = y0 + f.dy;
    const w = f.w * (P.w ?? 1);
    const [l1, l2, l3] = f.bones.map((v) => v * (P.len ?? 1));
    // the knuckle sits in the gap beside the edge, level with the middle of the leaf's thickness
    const k0 = new THREE.Vector3(edgeX + out * (w * 1.3 + 0.004), y + 0.002, -t * 0.55);
    // first bone: round the corner of the edge, towards the corridor
    const k1 = new THREE.Vector3(edgeX + out * (w * 0.7), y, w * 1.02 + 0.0005);
    // the rest lie along the corridor face, the tips pressing into it
    const reach = f.reach;
    // the fingers fan out from the hand: the index rises, the little finger drops
    const k2 = new THREE.Vector3(edgeX + dirX * l2 * reach * (1 - 0.25 * f.bend), y + f.fan * l2 * reach, w * (0.95 + 0.9 * f.bend));
    const k3 = new THREE.Vector3(k2.x + dirX * l3 * (1 - 0.5 * f.bend), k2.y + f.fan * l3 * 0.6, w * 0.6);
    const pts = [
      k0.clone().add(new THREE.Vector3(out * 0.004, 0, -l1 * 0.5)),
      k0,
      new THREE.Vector3().lerpVectors(k0, k1, 0.55).add(new THREE.Vector3(out * w * 0.6, 0, 0)),
      k1,
      new THREE.Vector3().lerpVectors(k1, k2, 0.5).add(new THREE.Vector3(0, 0, w * 0.25 * f.bend)),
      k2,
      new THREE.Vector3().lerpVectors(k2, k3, 0.5).add(new THREE.Vector3(0, 0, w * 0.2)),
      k3,
    ];
    const rad = (u) => {
      const base = lerp(w * 1.1, w * 0.66, Math.pow(u, 0.85));
      const j = (c, s2, a) => a * w * Math.exp(-Math.pow((u - c) / s2, 2));
      const tip = u > 0.94 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.94) / 0.06, 2))) : 1;
      return (base + j(0.2, 0.05, 0.18) + j(0.47, 0.03, 0.13) + j(0.76, 0.026, 0.09)) * (0.3 + 0.7 * tip);
    };
    const sw = sweep(pts, rad, { tint: (u) => skinTint(u, i), up: new THREE.Vector3(0, 1, 0), flat: 0.8 });
    b.add('skin', sw.geo, null, [0.2, 0.19, 0.185]); // two stops under the face: no brighter than the door edge it holds
    // the nail on the back of the last bone, facing the corridor: short, ridged, broken at the edge
    const nu = 0.885;
    const nc = sw.at(nu);
    const nt = sw.tanAt(nu);
    const side = new THREE.Vector3().crossVectors(nt, new THREE.Vector3(0, 0, 1)).normalize();
    const back = new THREE.Vector3().crossVectors(side, nt).normalize();
    const basis = new THREE.Matrix4().makeBasis(nt, back, side);
    const nail = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const centre = nc.clone().addScaledVector(back, rad(nu) * 0.7);
    b.add('nail', nail, M(new THREE.Matrix4().makeScale(w * 0.72, w * 0.2, w * 0.6), basis, move(centre.x, centre.y, centre.z)), [0.2 - 0.012 * i, 0.185 - 0.01 * i, 0.16 - 0.01 * i]);
  });
  // the thumb, flat against the edge face, its tip towards the corridor
  {
    const y = y0 - 0.04;
    const pts = [
      new THREE.Vector3(edgeX + out * 0.016, y - 0.03, -t - 0.03),
      new THREE.Vector3(edgeX + out * 0.011, y - 0.015, -t * 0.9),
      new THREE.Vector3(edgeX + out * 0.0085, y - 0.004, -t * 0.4),
      new THREE.Vector3(edgeX + out * 0.0078, y + 0.004, -0.004),
    ];
    const rad = (u) => lerp(0.0102, 0.0072, u) * (u > 0.92 ? 0.4 + 0.6 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.92) / 0.08, 2))) : 1) * (1 + 0.15 * Math.exp(-Math.pow((u - 0.55) / 0.05, 2)));
    const sw = sweep(pts, rad, { tint: (u) => skinTint(u * 0.9, 5), up: new THREE.Vector3(0, 0, 1), flat: 0.78 });
    b.add('skin', sw.geo, null, [0.22, 0.21, 0.205]);
  }
  // the back of the hand and the wrist, in the gap and going back into the dark room
  const back = new THREE.SphereGeometry(1, 28, 20);
  const bp = back.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const yy = bp.getY(i);
    const z = bp.getZ(i);
    const ridge = x < 0 ? 0.12 * Math.max(0, Math.cos(yy * 9)) * smooth(-0.2, 0.6, z) : 0;
    bp.setXYZ(i, x * (x > 0 ? 0.5 : 1 + ridge), yy, z);
  }
  back.computeVertexNormals();
  const hc = new THREE.Vector3(edgeX + out * 0.016, y0 - 0.002, -t - 0.035);
  b.add('skin', back, M(new THREE.Matrix4().makeScale(0.014, 0.043, 0.048), move(hc.x, hc.y, hc.z)), [0.4, 0.38, 0.37]);
  const wrist = sweep([new THREE.Vector3(hc.x + out * 0.003, hc.y - 0.004, hc.z - 0.03), new THREE.Vector3(hc.x + out * 0.02, hc.y - 0.06, hc.z - 0.1), new THREE.Vector3(hc.x + out * 0.05, hc.y - 0.22, hc.z - 0.2)], (u) => lerp(0.021, 0.028, u), { flat: 0.75, up: new THREE.Vector3(1, 0, 0) });
  b.add('skin', wrist.geo, null, [0.6, 0.57, 0.55]);
  return b;
}

export function buildFigure(materials, { hingeSide = 1 } = {}) {
  const root = new THREE.Group();
  root.name = 'figure';
  const H = head();
  const headGroup = new THREE.Group();
  headGroup.add(H.bag.build(materials, 'head'));
  headGroup.add(hair(H.front, T().slit ?? 0.024).build(materials, 'hair'));
  const bodyGroup = body().build(materials, 'body');
  root.add(headGroup, bodyGroup);
  const lw = DOOR.w - 0.007;
  // leaf coordinates: the free edge is on the side away from the hinge
  const edgeX = -hingeSide * (lw / 2);
  // at the height of her chin, below the face, not above it
  const handGroup = hand(edgeX, hingeSide, T().hy ?? 1.27).build(materials, 'hand');

  // The catchlight: the lamp in front of the door, seen in the wet eye. A path-traced eye this
  // small catches it on a pixel or two at most, so it is drawn in the overlay pass, where the
  // bulbs are, and occluded by everything in front of it.
  const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.86, 0.68) }));
  glint.userData.overlay = true;
  glint.visible = false;
  headGroup.add(glint);

  // A small, hidden light for the face: the strip of lamp light that comes through the gap,
  // shaped. It lights one cheek, the eye and the bridge of the nose from the lamp's side.
  const key = new PhysicalSpotLight(new THREE.Color(1.0, 0.82, 0.62), 0, 0, 0.16, 0.9, 2);
  key.radius = 0.015;
  key.name = 'face-key';
  const keyTarget = new THREE.Object3D();
  root.add(key, keyTarget);
  key.target = keyTarget;
  key.visible = false;
  const rim = new PhysicalSpotLight(new THREE.Color(0.62, 0.74, 1.0), 0, 0, 0.35, 1, 2);
  rim.radius = 0.05;
  rim.name = 'face-rim';
  const rimTarget = new THREE.Object3D();
  root.add(rim, rimTarget);
  rim.target = rimTarget;
  rim.visible = false;

  // where the head ends up, in door coordinates
  const far = -hingeSide; // x direction of the far jamb
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  // The walker and lamp 4 in door coordinates (door 308, right wall: x = sc - s, z = HW - worldX).
  const d = doorByNo(SCARE_DOOR);
  const sc = d.s + DOOR.w / 2;
  const toDoor = (worldX, y, s) => new THREE.Vector3(sc - s, y, HW - worldX);
  const eyeD = scareEye('desktop');
  const eyeM = scareEye('mobile');
  const cam = toDoor((eyeD.x + eyeM.x) / 2, (eyeD.y + eyeM.y) / 2, (eyeD.s + eyeM.s) / 2);
  const lamp4 = LAMPS[4];
  const lamp = toDoor(0, LAMP_Y - 0.03, lamp4.s);

  function set(variant, lean) {
    const on = variant !== 'none';
    handGroup.visible = on;
    root.visible = variant === 'face';
    key.visible = variant === 'face';
    rim.visible = variant !== 'none';
    glint.visible = variant === 'face';
    const P = T();
    // She stands beyond the door edge and leans out past it as the door opens.
    pose.x = far * lerp(P.x0 ?? 0.495, P.x1 ?? 0.53, lean);
    pose.z = -WALL_T - lerp(P.z0 ?? 0.3, P.z1 ?? 0.275, lean);
    pose.y = (P.y ?? 1.4) - 0.01 * lean;
    headGroup.position.set(pose.x, pose.y, pose.z);
    headGroup.scale.setScalar(P.k ?? 1.08);
    // face the walker: the yaw that points the face (+z) at the camera
    const toCam = new THREE.Vector3().subVectors(cam, headGroup.position);
    pose.yaw = Math.atan2(toCam.x, toCam.z) + (P.yawOff ?? 0.12);
    const pitch = -Math.atan2(toCam.y, Math.hypot(toCam.x, toCam.z)) + (P.pitchOff ?? 0.1); // chin down, looking up from under the brow
    headGroup.rotation.set(pitch, pose.yaw, far * ((P.roll ?? 0.16) + 0.06 * lean), 'YXZ');
    bodyGroup.position.set(pose.x - far * 0.02, pose.y, pose.z - 0.06);
    bodyGroup.rotation.set(0, pose.yaw - far * 0.35, 0);
    headGroup.updateMatrix();

    // The key: a narrow, warm light from high on the open side, raking across the face (in head
    // coordinates, then into door coordinates). It finds the cheekbone, the rim of the socket and
    // the wet eye; the rest of the face, under the hair and away from it, stays in the dark.
    const kp = P.key ?? {};
    headGroup.updateMatrix();
    key.position.set(kp.x ?? -0.42, kp.y ?? 0.3, kp.z ?? 0.36).applyMatrix4(headGroup.matrix);
    const eyeAt = H.eyes[P.glintEye ?? 0].clone().applyMatrix4(headGroup.matrix);
    keyTarget.position.copy(eyeAt).add(new THREE.Vector3(kp.ox ?? 0, kp.oy ?? -0.012, kp.oz ?? 0));
    key.intensity = kp.cd ?? 0.75; // deep shadow: the stand-in is a presence, not a portrait
    key.angle = kp.angle ?? 0.11;
    key.penumbra = kp.pen ?? 0.8;
    // the rim: from deeper in the room, behind her on the side away from the door
    const rp = P.rim ?? {};
    rim.position.set(pose.x + far * (rp.along ?? 1.25), pose.y + (rp.up ?? 0.25), pose.z - (rp.deep ?? 0.6));
    rimTarget.position.set(pose.x, pose.y + (rp.ty ?? -0.12), pose.z);
    rim.intensity = rp.cd ?? 0; // off: its cold glint on one wet strand read as a blue speck
    rim.angle = rp.angle ?? 0.22;

    // the catchlight: on the cornea of the eye nearer the gap, where the key is mirrored towards
    // the walker (half way between the two directions). Small, and no brighter than a wet eye.
    const inv = new THREE.Matrix4().copy(headGroup.matrix).invert();
    const eye = H.eyes[P.glintEye ?? 0]; // the eye on the open side of the gap (the other is behind the door edge)
    const camL = cam.clone().applyMatrix4(inv);
    const keyL = key.position.clone().applyMatrix4(inv);
    const half = new THREE.Vector3().subVectors(camL, eye).normalize().add(new THREE.Vector3().subVectors(keyL, eye).normalize()).normalize();
    glint.position.copy(eye).addScaledVector(half, EYE.r * 1.02);
    glint.scale.set(P.glintR ?? 0.0011, (P.glintR ?? 0.0011) * 0.75, P.glintR ?? 0.0011);
    const gl = P.glint ?? 3.2;
    glint.material.color.setRGB(gl, gl * 0.9, gl * 0.78);
  }
  set('none', 0);

  // The rectangle a photo is drawn into (door coordinates, facing the walker) and the two
  // edges of the gap between the jamb and the leaf, over the height of the head.
  function headQuad(leafGroup, frameGroup) {
    const k = headGroup.scale.x;
    const w = 0.21 * k;
    const h = 0.28 * k;
    const c = new THREE.Vector3(pose.x, pose.y, pose.z);
    const right = new THREE.Vector3(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw));
    const up = new THREE.Vector3(0, 1, 0);
    const corner = (sx, sy) => c.clone().addScaledVector(right, (sx * w) / 2).addScaledVector(up, (sy * h) / 2).applyMatrix4(frameGroup.matrixWorld);
    const quad = [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)].map((v) => v.toArray());
    const y0 = pose.y - 0.24;
    const y1 = pose.y + 0.2;
    const jamb = (y) => new THREE.Vector3(far * (DOOR.w / 2), y, -WALL_T).applyMatrix4(frameGroup.matrixWorld);
    const edge = (y) => new THREE.Vector3(edgeX, y, 0).applyMatrix4(leafGroup.matrixWorld);
    const clip = [jamb(y1), edge(y1), edge(y0), jamb(y0)].map((v) => v.toArray());
    return { quad, clip };
  }
  return { root, hand: handGroup, set, headQuad };
}
