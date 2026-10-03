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
  disp += 0.0042 * g2(ax, fy, 0.03, 0.023, 0.024, 0.0075);
  disp -= 0.0022 * g2(fx, fy, 0, 0.012, 0.008, 0.008);
  // eye sockets: deep, the skin round them bruised dark
  const socket = g2(ax, fy, EYE.x, EYE.y, 0.0175, 0.0135);
  disp -= 0.0105 * socket;
  dark += 0.62 * g2(ax, fy, EYE.x, EYE.y - 0.004, 0.022, 0.018);
  red += 0.5 * g2(ax, fy, EYE.x + 0.002, EYE.y - 0.012, 0.016, 0.006);
  // temples sunk in
  disp -= 0.0035 * g2(ax, fy, 0.062, 0.018, 0.012, 0.022);
  // nose: a thin bridge, a narrow tip, the wings and two dark nostrils
  disp += 0.0052 * Math.exp(-Math.pow(fx / 0.0062, 2)) * smooth(0.012, -0.004, fy) * smooth(-0.038, -0.024, fy);
  disp += 0.0118 * g2(fx, fy, 0, -0.03, 0.0085, 0.009);
  disp += 0.0045 * g2(ax, fy, 0.0098, -0.035, 0.0048, 0.0052);
  dark += 0.35 * g2(ax, fy, 0.0062, -0.0392, 0.0024, 0.0016);
  red += 0.4 * g2(fx, fy, 0, -0.033, 0.009, 0.007);
  // cheekbones high and sharp, the cheeks hollow under them
  disp += 0.0058 * g2(ax, fy, 0.046, -0.014, 0.014, 0.01);
  disp -= 0.0048 * g2(ax, fy, 0.041, -0.044, 0.013, 0.017);
  dark += 0.32 * g2(ax, fy, 0.042, -0.046, 0.013, 0.016);
  // mouth: thin lips a little apart, corners down
  const my = -0.0585 - 0.0035 * Math.pow(ax / 0.02, 2);
  disp += 0.0032 * g2(fx, fy, 0, my + 0.0045, 0.0175, 0.0036);
  disp += 0.0036 * g2(fx, fy, 0, my - 0.0055, 0.015, 0.0048);
  disp -= 0.0042 * g2(fx, fy, 0, my, 0.019, 0.0015);
  lips = clamp(g2(fx, fy, 0, my + 0.0038, 0.016, 0.004) + g2(fx, fy, 0, my - 0.0048, 0.0135, 0.0046), 0, 1);
  dark += 0.7 * g2(fx, fy, 0, my, 0.017, 0.0011);
  disp -= 0.0017 * g2(fx, fy, 0, -0.047, 0.0035, 0.005); // philtrum
  // a narrow chin, the jaw line under the hollow cheeks
  disp += 0.0022 * g2(fx, fy, 0, -0.087, 0.018, 0.011);
  disp -= 0.0018 * g2(fx, fy, 0, -0.074, 0.02, 0.0035);
  disp += 0.0022 * g2(ax, fy, 0.052, -0.07, 0.01, 0.02);
  r += disp * front;
  dark = clamp(dark * front, 0, 1);
  red = clamp(red * front, 0, 1);
  // bloodless skin, mottled, with the veins faintly through it at the temples
  const n = 0.9 + 0.18 * fbm(d.x * 11 + 3, d.y * 11 + d.z * 7, 77, 4);
  const vein = 0.08 * g2(ax, fy, 0.058, 0.03, 0.01, 0.02) * front;
  // the light falls off away from the open eye: brow, jaw and the far cheek sink into the dark
  const pool = 0.42 + 0.58 * Math.exp(-Math.pow((fx + 0.022) / 0.062, 2) - Math.pow((fy - 0.004) / 0.072, 2));
  const k = n * (1 - 0.6 * dark) * lerp(1, pool, front);
  const col = [
    k * (1 - 0.1 * lips * front - 0.04 * vein) * (1 + 0.04 * red),
    k * (0.94 - 0.16 * lips * front - 0.05 * dark - 0.12 * red),
    k * (0.92 - 0.06 * lips * front + 0.02 * vein - 0.1 * red),
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
    const up = new THREE.SphereGeometry(EYE.r * 1.1, 36, 12, 0, Math.PI * 2, 0, 0.98);
    b.add('skin', up, M(new THREE.Matrix4().makeRotationX(0.32), move(centre.x, centre.y, centre.z)), [0.5, 0.42, 0.42]);
    const lo = new THREE.SphereGeometry(EYE.r * 1.08, 36, 10, 0, Math.PI * 2, 2.2, Math.PI - 2.2);
    b.add('skin', lo, M(new THREE.Matrix4().makeRotationX(-0.12), move(centre.x, centre.y, centre.z)), [0.44, 0.33, 0.35]);
  }
  return { bag: b, eyes };
}

// Long, straight, wet hair: parted in the middle, flat on the skull, hanging in clumps past the
// shoulders on both sides of the face and framing it. Each strand starts on the parting, runs
// down over the skull to the side of the head and then hangs.
function hair() {
  const b = new Bag();
  const r = mulberry(4242);
  const onSkull = (dir, lift) => {
    const dd = dir.clone().normalize();
    return dd.multiplyScalar(headSurface(dd, false).r + lift);
  };
  // root: a point on the parting (phi 0 = front hairline, 1 = crown); side +1 or -1;
  // exit: where it leaves the skull (azimuth from the front, elevation)
  const strand = (phi, side, exitAz, exitEl, len, width, over, wav, drift) => {
    const R = new THREE.Vector3(side * 0.015, Math.sin(lerp(0.78, 2.05, phi)), Math.cos(lerp(0.78, 2.05, phi)));
    const E = new THREE.Vector3(side * Math.sin(exitAz) * Math.cos(exitEl), Math.sin(exitEl), Math.cos(exitAz) * Math.cos(exitEl));
    const pts = [];
    const N1 = 16;
    const N2 = 30;
    const lift = 0.0026 + over * 0.0021;
    for (let i = 0; i <= N1; i++) {
      const t = i / N1;
      // along the skull, bulging out a little where the hair is thick over the ears
      const d = new THREE.Vector3().lerpVectors(R, E, t);
      pts.push(onSkull(d, lift + 0.004 * Math.sin(t * Math.PI) * (0.5 + 0.5 * over)));
    }
    const top = pts[pts.length - 1].clone();
    const out = new THREE.Vector3(top.x, 0, top.z).normalize();
    for (let i = 1; i <= N2; i++) {
      const f = i / N2;
      const p = top.clone();
      p.y -= f * len;
      // wet hair hangs nearly straight, a little away from the jaw, gathering forward over the shoulders
      p.addScaledVector(out, 0.012 * Math.sin(Math.min(1, f * 3) * Math.PI * 0.5) + drift * f);
      p.x += 0.0025 * Math.sin(f * 6 + wav);
      p.z += 0.0025 * Math.cos(f * 5 + wav) + 0.03 * f * f * Math.max(0, Math.cos(exitAz));
      pts.push(p);
    }
    const pos = [];
    const N = pts.length - 1;
    for (let i = 0; i < N; i++) {
      const tan = new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize();
      const nrm = pts[i].clone().setY(pts[i].y * 0.3).normalize();
      const sideV = new THREE.Vector3().crossVectors(tan, nrm).normalize();
      const w0 = width * (1 - 0.6 * Math.pow(i / N, 2)) * 0.5;
      const w1 = width * (1 - 0.6 * Math.pow((i + 1) / N, 2)) * 0.5;
      const a0 = pts[i].clone().addScaledVector(sideV, -w0);
      const b0 = pts[i].clone().addScaledVector(sideV, w0);
      const a1 = pts[i + 1].clone().addScaledVector(sideV, -w1);
      const b1 = pts[i + 1].clone().addScaledVector(sideV, w1);
      for (const v of [a0, b0, b1, a0, b1, a1]) pos.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.computeVertexNormals();
    const k = 0.6 + 0.8 * r();
    b.add('hair', smoothNormals(sg, 0.3), null, [k, k, k]);
  };
  // the scalp under it, dark; bare over the face and a high forehead
  const cap = new THREE.SphereGeometry(1, 72, 48);
  const cp = cap.attributes.position;
  const d = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++) {
    d.fromBufferAttribute(cp, i).normalize();
    const s = headSurface(d, false);
    cp.setXYZ(i, d.x * (s.r + 0.0022), d.y * (s.r + 0.0022), d.z * (s.r + 0.0022));
  }
  const ci = cap.index.array;
  const keep = [];
  for (let i = 0; i < ci.length; i += 3) {
    const c = new THREE.Vector3();
    for (let k = 0; k < 3; k++) c.add(d.fromBufferAttribute(cp, ci[i + k]));
    c.multiplyScalar(1 / 3).normalize();
    const jag = 0.05 * (fbm(c.x * 11 + 2, c.y * 11, 31, 2) - 0.5);
    const face = c.z > 0.3 + jag && c.y < 0.74 - 0.9 * c.x * c.x + jag && Math.abs(c.x) < 0.7;
    if (!face && c.y > -0.3) keep.push(ci[i], ci[i + 1], ci[i + 2]);
  }
  cap.setIndex(keep);
  cap.computeVertexNormals();
  b.add('hair', cap, null, [0.45, 0.45, 0.45]);
  // in wet clumps: strands of a clump share their path
  const clump = (phi, side, exitAz, n, len, over) => {
    const wav = r() * 6;
    const drift = (r() - 0.3) * 0.01;
    const el = -0.05 - 0.25 * smooth(1.2, 2.6, exitAz) + 0.1 * (r() - 0.5);
    for (let i = 0; i < n; i++) {
      strand(clamp(phi + (r() - 0.5) * 0.06, 0, 1), side, exitAz + (r() - 0.5) * 0.06, el + (r() - 0.5) * 0.04, len * (0.88 + 0.22 * r()), 0.0015 + 0.0017 * r(), over + r() * 0.9, wav + (r() - 0.5) * 0.5, drift + (r() - 0.5) * 0.004);
    }
  };
  for (const side of [-1, 1]) {
    // front of the parting: down the temples, beside the face
    for (let i = 0; i < 9; i++) clump(i * 0.03, side, 1.02 + i * 0.06 + (r() - 0.5) * 0.05, 9, 0.38 + 0.1 * r(), 1.4 + r());
    // the rest of the head, out to the back
    for (let i = 0; i < 24; i++) {
      const u = i / 23;
      clump(0.25 + 0.75 * u, side, 1.5 + 1.6 * u + (r() - 0.5) * 0.08, 9, 0.36 + 0.12 * r(), r() * 1.2);
    }
  }
  // two or three loose strands across the cheek on the open side
  for (let i = 0; i < 3; i++) strand(0.02 + 0.02 * i, -1, 0.82 + 0.05 * i, 0.12, 0.3, 0.0013, 2.6, r() * 6, 0.003);
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

// A hand gripping the free edge of the leaf from the gap side, in leaf coordinates: the edge
// face is at x = edgeX (the leaf lies towards +x of it when dirX = +1), the front face at z = 0,
// the back at -t. The palm lies on the edge, the back of the hand faces out of the gap, the
// knuckles sit on the front corner and the fingers lie across the corridor face of the door,
// a little curled. Long, thin fingers, swollen joints, nails broken short.
function hand(edgeX, dirX, y0) {
  const b = new Bag();
  const t = DOOR.t;
  const out = -dirX; // away from the leaf, into the gap
  const P = T().fingers ?? {};
  // index (top) to little: height, length past the knuckle, radius at the knuckle, fan (rad)
  const F = [
    { dy: 0.025, len: 0.083, w: 0.0084, fan: 0.16 },
    { dy: 0.0075, len: 0.096, w: 0.0088, fan: 0.03 },
    { dy: -0.0095, len: 0.088, w: 0.0083, fan: -0.11 },
    { dy: -0.026, len: 0.066, w: 0.007, fan: -0.3 },
  ];
  F.forEach((f, i) => {
    const y = y0 + f.dy;
    const w = f.w * (P.w ?? 1);
    const L = f.len * (P.len ?? 1);
    const fy = Math.sin(f.fan);
    const curl = 0.002 + 0.0015 * i; // the shorter fingers press harder
    const pts = [
      new THREE.Vector3(edgeX + out * (w * 1.6), y - 0.002, -0.034),
      new THREE.Vector3(edgeX + out * (w * 1.35), y, -0.006),
      new THREE.Vector3(edgeX + out * (w * 0.55), y + fy * 0.006, w * 1.05),
      new THREE.Vector3(edgeX + dirX * L * 0.3, y + fy * L * 0.3, w * 0.95 + curl * 0.6),
      new THREE.Vector3(edgeX + dirX * L * 0.6, y + fy * L * 0.6, w * 0.9 + curl * 2.2),
      new THREE.Vector3(edgeX + dirX * L * 0.84, y + fy * L * 0.84, w * 0.72 + curl),
      new THREE.Vector3(edgeX + dirX * L, y + fy * L, w * 0.5),
    ];
    // joints along the finger: knuckle (u 0.22), middle (0.55), last (0.78)
    const rad = (u) => {
      const base = lerp(w * 1.06, w * 0.6, Math.pow(u, 0.9));
      const j = (c, s, a) => a * w * Math.exp(-Math.pow((u - c) / s, 2));
      const tip = u > 0.95 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.95) / 0.05, 2))) : 1;
      return (base + j(0.22, 0.05, 0.2) + j(0.55, 0.04, 0.13) + j(0.78, 0.035, 0.09)) * (0.3 + 0.7 * tip);
    };
    const tint = (u) => {
      const crease = 0.2 * (Math.exp(-Math.pow((u - 0.55) / 0.02, 2)) + Math.exp(-Math.pow((u - 0.78) / 0.018, 2)));
      const knuckle = 0.12 * Math.exp(-Math.pow((u - 0.22) / 0.04, 2)); // white where the skin is stretched over it
      const k = 0.93 - crease + knuckle + 0.03 * Math.sin(i * 3.1);
      return [k, k * (0.94 - 0.06 * crease), k * (0.92 - 0.04 * crease)];
    };
    const sw = sweep(pts, rad, { tint, up: new THREE.Vector3(0, 1, 0), flat: 0.82 });
    b.add('skin', sw.geo, null, [0.95, 0.9, 0.88]);
    // the nail: on the back of the last joint, facing the corridor
    const nu = 0.89;
    const nc = sw.at(nu);
    const nt = sw.tanAt(nu);
    const side = new THREE.Vector3().crossVectors(nt, new THREE.Vector3(0, 0, 1)).normalize();
    const back = new THREE.Vector3().crossVectors(side, nt).normalize();
    const basis = new THREE.Matrix4().makeBasis(nt, back, side);
    const nail = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const centre = nc.clone().addScaledVector(back, rad(nu) * 0.74);
    b.add('nail', nail, M(new THREE.Matrix4().makeScale(w * 0.78, w * 0.18, w * 0.6), basis, move(centre.x, centre.y, centre.z)), [0.95, 0.88, 0.8]);
  });
  // the back of the hand, in the gap, its tendons faintly raised; the wrist going back and down
  const back = new THREE.SphereGeometry(1, 28, 20);
  const bp = back.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const yy = bp.getY(i);
    const z = bp.getZ(i);
    // flatter on the palm side (+x, against the edge), the tendons as ridges on the back (-x)
    const ridge = x < 0 ? 0.12 * Math.max(0, Math.cos(yy * 9)) * smooth(-0.2, 0.6, z) : 0;
    bp.setXYZ(i, x * (x > 0 ? 0.5 : 1 + ridge), yy, z);
  }
  back.computeVertexNormals();
  const hc = new THREE.Vector3(edgeX + out * 0.012, y0 - 0.002, -0.046);
  b.add('skin', back, M(new THREE.Matrix4().makeScale(0.013, 0.044, 0.05), move(hc.x, hc.y, hc.z)), [0.86, 0.82, 0.8]);
  for (let i = 0; i < 4; i++) b.add('skin', new THREE.SphereGeometry(1, 14, 10), M(new THREE.Matrix4().makeScale(0.007, 0.007, 0.007), move(edgeX + out * 0.017, y0 + F[i].dy, -0.008)), [0.95, 0.9, 0.88]);
  const wrist = sweep([new THREE.Vector3(hc.x + out * 0.003, hc.y - 0.004, hc.z - 0.035), new THREE.Vector3(hc.x + out * 0.02, hc.y - 0.06, hc.z - 0.11), new THREE.Vector3(hc.x + out * 0.05, hc.y - 0.22, hc.z - 0.2)], (u) => lerp(0.022, 0.03, u), { flat: 0.75, up: new THREE.Vector3(1, 0, 0) });
  b.add('skin', wrist.geo, null, [0.7, 0.66, 0.64]);
  return b;
}

export function buildFigure(materials, { hingeSide = 1 } = {}) {
  const root = new THREE.Group();
  root.name = 'figure';
  const H = head();
  const headGroup = new THREE.Group();
  headGroup.add(H.bag.build(materials, 'head'));
  headGroup.add(hair().build(materials, 'hair'));
  const bodyGroup = body().build(materials, 'body');
  root.add(headGroup, bodyGroup);
  const lw = DOOR.w - 0.007;
  // leaf coordinates: the free edge is on the side away from the hinge
  const edgeX = -hingeSide * (lw / 2);
  const handGroup = hand(edgeX, hingeSide, T().hy ?? 1.6).build(materials, 'hand');

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

    // the light: from the lamp's side of the gap, at the open eye and the cheek under it
    const kp = P.key ?? {};
    headGroup.updateMatrix();
    const from = new THREE.Vector3().lerpVectors(lamp, cam, kp.mix ?? 0.35);
    const dir = new THREE.Vector3().subVectors(headGroup.position, from).normalize();
    key.position.copy(headGroup.position).addScaledVector(dir, -(kp.dist ?? 0.55));
    key.position.y += kp.up ?? 0.05;
    const eyeAt = H.eyes[P.glintEye ?? 0].clone().applyMatrix4(headGroup.matrix);
    keyTarget.position.copy(eyeAt).add(new THREE.Vector3(kp.ox ?? 0, kp.oy ?? -0.01, kp.oz ?? 0));
    key.intensity = kp.cd ?? 0;
    key.angle = kp.angle ?? 0.075;
    key.penumbra = kp.pen ?? 1;
    // the rim: from deeper in the room, behind her on the side away from the door
    const rp = P.rim ?? {};
    rim.position.set(pose.x + far * (rp.along ?? 1.25), pose.y + (rp.up ?? 0.25), pose.z - (rp.deep ?? 0.6));
    rimTarget.position.set(pose.x, pose.y + (rp.ty ?? 0.0), pose.z);
    rim.intensity = rp.cd ?? 3.5;
    rim.angle = rp.angle ?? 0.22;

    // the catchlight: on the cornea of the eye nearer the gap, where the lamp is mirrored
    // towards the walker (half way between the two directions)
    const inv = new THREE.Matrix4().copy(headGroup.matrix).invert();
    const eye = H.eyes[P.glintEye ?? 0]; // the eye on the open side of the gap (the other is behind the door edge)
    const camL = cam.clone().applyMatrix4(inv);
    const lampL = lamp.clone().applyMatrix4(inv);
    const half = new THREE.Vector3().subVectors(camL, eye).normalize().add(new THREE.Vector3().subVectors(lampL, eye).normalize()).normalize();
    glint.position.copy(eye).addScaledVector(half, EYE.r * 1.02);
    glint.scale.setScalar(P.glintR ?? 0.0019);
    const gl = P.glint ?? 9;
    glint.material.color.setRGB(gl, gl * 0.86, gl * 0.7);
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
