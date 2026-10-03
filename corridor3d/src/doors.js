// Doors: the lining in the wall reveal, stops, architraves, threshold, and the leaf with two
// bevelled recessed panels, a lever handle on a backplate, a keyhole, a peephole and a brass
// number plate. Built in door coordinates: x along the wall, y up, z out into the corridor,
// origin on the floor in the middle of the opening.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DOOR, WALL_T } from './layout.js';
import { Bag, box, boxAt, boxUV, extrude, planarUV, M, move, rotX, rotY, rotZ, mulberry } from './util.js';
import { plateCell } from './textures.js';
import { doorUV } from './surfaces.js';

export const REC = 0.09; // how far the leaf face sits back from the corridor wall
const ARCH = [
  // [across from the outer edge, out from the wall]
  [0, 0],
  [0, 0.011],
  [0.006, 0.018],
  [0.036, 0.018],
  [0.044, 0.0125],
  [0.058, 0.0125],
  [0.07, 0.006],
  [0.07, 0],
];
const ARCH_W = 0.07;
const mirror = (p) => p.map(([a, b]) => [ARCH_W - a, b]).reverse();

function quad(p, uv) {
  const g = new THREE.BufferGeometry();
  const idx = [0, 1, 2, 0, 2, 3];
  const pos = [];
  const uvs = [];
  for (const i of idx) {
    pos.push(...p[i]);
    uvs.push(...uv[i]);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
// Axis-aligned rectangle at depth z, facing +z. `uv` maps a point of the leaf to its skin.
function face(x0, y0, x1, y1, z, uv) {
  return quad(
    [
      [x0, y0, z],
      [x1, y0, z],
      [x1, y1, z],
      [x0, y1, z],
    ],
    [uv(x0, y0), uv(x1, y0), uv(x1, y1), uv(x0, y1)],
  );
}

// The fixed parts around an opening. `sill` false leaves the threshold out.
export function buildSurround(bag, frame, { seed = 1, sill = true, outward = false } = {}) {
  const r = mulberry(seed);
  const w = DOOR.w;
  const h = DOOR.h;
  const j = () => (r() - 0.5) * 0.003;
  const tint = () => {
    const k = 0.85 + 0.25 * r();
    return [k, k, k];
  };
  // lining boards in the reveal
  for (const sx of [-1, 1]) {
    const g = boxUV(boxAt(sx > 0 ? w / 2 : -w / 2 - 0.022, 0, -WALL_T, 0.022, h + 0.022, WALL_T), { along: 'y' });
    bag.add('trim', g, frame, tint());
  }
  bag.add('trim', boxUV(boxAt(-w / 2, h, -WALL_T, w, 0.022, WALL_T), { along: 'x' }), frame, tint());
  // stops the leaf closes against
  const sz = outward ? -0.012 - DOOR.t - 0.014 : -REC + 0.002;
  for (const sx of [-1, 1]) bag.add('trim', boxUV(boxAt(sx > 0 ? w / 2 - 0.013 : -w / 2, 0, sz, 0.013, h, 0.014), { along: 'y' }), frame, tint());
  bag.add('trim', boxUV(boxAt(-w / 2, h - 0.013, sz, w, 0.013, 0.014), { along: 'x' }), frame, tint());
  // architrave: two legs and a head, butt jointed, none of them quite square
  const legL = extrude(ARCH, h + 0.004, { caps: true });
  bag.add('trim', legL, M(rotX(Math.PI / 2), move(-w / 2 - ARCH_W - 0.005 + j(), h + 0.005, 0), frame), tint());
  const legR = extrude(mirror(ARCH), h + 0.004, { caps: true });
  bag.add('trim', legR, M(rotX(Math.PI / 2), move(w / 2 + 0.005 + j(), h + 0.005, 0), frame), tint());
  const head = extrude(mirror(ARCH), w + 2 * ARCH_W + 0.01, { caps: true });
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
  bag.add('trim', head, M(basis, move(-w / 2 - ARCH_W - 0.005, h + 0.005, 0), rotZ(j() * 0.6), frame), tint());
  if (sill) {
    // threshold: a worn board and a tarnished brass strip, set back from the wall face (its pale
    // end stuck out at the foot of every frame)
    bag.add('trim', boxUV(boxAt(-w / 2, 0, -WALL_T, w, 0.01, WALL_T - 0.006), { along: 'x' }), frame, [0.32, 0.3, 0.28]);
    bag.add('brassDull', boxAt(-w / 2 + 0.004, 0.01, -0.03, w - 0.008, 0.0025, 0.016), frame, [0.4, 0.36, 0.3]);
  }
}

// Depth of the leaf face (z, in leaf coordinates) at a point: the frame is at 0, the panel
// fields sit back behind a bevel and carry a raised centre. Decals follow this.
export function leafDepth(x, y) {
  const lw = DOOR.w - 0.007;
  const px0 = -lw / 2 + 0.108;
  const px1 = lw / 2 - 0.108;
  const y1 = DOOR.h - 0.004;
  const ramp = (d, w, depth) => depth * Math.min(1, Math.max(0, d / w));
  for (const [a, c] of [
    [0.21, 0.88],
    [1.035, y1 - 0.112],
  ]) {
    if (x <= px0 || x >= px1 || y <= a || y >= c) continue;
    const d = Math.min(x - px0, px1 - x, y - a, c - y); // distance in from the panel edge
    if (d < 0.03) return -ramp(d, 0.03, 0.017);
    if (d < 0.03 + 0.05) return -0.017;
    return -0.017 + ramp(d - 0.08, 0.012, 0.006);
  }
  return 0;
}

// A lever handle on its backplate, origin at the spindle. `dir` is the way the lever points (+1/-1 in x).
function handle(bag, dir, droop, mat = 'brass') {
  const plate = new RoundedBoxGeometry(0.046, 0.2, 0.0065, 4, 0.0031);
  bag.add(mat, plate, move(0, -0.03, 0.0028));
  // two slotted screws, and a rose round the spindle
  for (const y of [0.055, -0.118]) {
    bag.add(mat, new THREE.CylinderGeometry(0.0042, 0.0046, 0.0022, 14), M(rotX(Math.PI / 2), move(0, y, 0.0068)), [0.7, 0.66, 0.6]);
    bag.add('void', box(0.0066, 0.0011, 0.001), M(rotZ(y * 30), move(0, y, 0.0078)));
  }
  bag.add(mat, new THREE.TorusGeometry(0.0145, 0.0028, 10, 28), move(0, 0, 0.0062));
  const boss = new THREE.CylinderGeometry(0.0115, 0.0135, 0.016, 20);
  bag.add(mat, boss, M(rotX(Math.PI / 2), move(0, 0, 0.013)));
  const path = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 0, 0.012),
      new THREE.Vector3(0, 0, 0.044),
      new THREE.Vector3(dir * 0.012, 0, 0.054),
      new THREE.Vector3(dir * 0.06, -0.001, 0.055),
      new THREE.Vector3(dir * 0.118, -0.003, 0.052),
    ],
    false,
    'catmullrom',
    0.35,
  );
  const lever = new THREE.TubeGeometry(path, 28, 0.0082, 12, false);
  const tip = new THREE.SphereGeometry(0.0082, 12, 8);
  const lb = new Bag();
  lb.add(mat, lever);
  lb.add(mat, tip, move(dir * 0.118, -0.003, 0.052));
  bag.addBag(lb, rotZ(-dir * droop));
  // keyhole: a dark slot in a small rose
  bag.add(mat, new THREE.CylinderGeometry(0.014, 0.014, 0.003, 20), M(rotX(Math.PI / 2), move(0, -0.095, 0.0065)));
  bag.add('void', new THREE.CylinderGeometry(0.0042, 0.0042, 0.002, 12), M(rotX(Math.PI / 2), move(0, -0.092, 0.0085)));
  bag.add('void', box(0.0034, 0.011, 0.002), move(0, -0.099, 0.0085));
}

// The leaf, in its own coordinates: x from -lw/2 to lw/2, y up from the floor, front face at z = 0.
// handleSide: which x side carries the handle. inside: 'plain' or 'claw'.
// skin: the material of the corridor face (a baked skin, see surfaces.js).
export function buildLeaf({ no, handleSide = -1, inside = 'plain', seed = 1, plate = true, plateTilt = 0, gap = 0.006, skin = 'doorA' }) {
  const b = new Bag();
  const r = mulberry(seed * 7919);
  const lw = DOOR.w - 0.007;
  const x0 = -lw / 2;
  const x1 = lw / 2;
  const y0 = 0.01 + gap;
  const y1 = DOOR.h - 0.004;
  const t = DOOR.t;
  const stile = 0.108;
  const px0 = x0 + stile;
  const px1 = x1 - stile;
  const ys = [y0, 0.21, 0.88, 1.035, y1 - 0.112, y1];
  const uv = (x, y) => doorUV(x, y, handleSide);
  // stiles
  b.add(skin, face(x0, y0, px0, y1, 0, uv));
  b.add(skin, face(px1, y0, x1, y1, 0, uv));
  // rails
  for (const [a, c] of [
    [ys[0], ys[1]],
    [ys[2], ys[3]],
    [ys[4], ys[5]],
  ])
    b.add(skin, face(px0, a, px1, c, 0, uv));
  // panels: a bevel down to a field set back 11 mm, with a raised centre
  const bev = 0.03;
  const dz = -0.017;
  for (const [a, c] of [
    [ys[1], ys[2]],
    [ys[3], ys[4]],
  ]) {
    const ring = [
      [px0, a, px1, a, px1 - bev, a + bev, px0 + bev, a + bev],
      [px1, a, px1, c, px1 - bev, c - bev, px1 - bev, a + bev],
      [px1, c, px0, c, px0 + bev, c - bev, px1 - bev, c - bev],
      [px0, c, px0, a, px0 + bev, a + bev, px0 + bev, c - bev],
    ];
    for (const q of ring) {
      b.add(
        skin,
        quad(
          [
            [q[0], q[1], 0],
            [q[2], q[3], 0],
            [q[4], q[5], dz],
            [q[6], q[7], dz],
          ],
          [uv(q[0], q[1]), uv(q[2], q[3]), uv(q[4], q[5]), uv(q[6], q[7])],
        ),
      );
    }
    // field
    const fx0 = px0 + bev;
    const fx1 = px1 - bev;
    const fy0 = a + bev;
    const fy1 = c - bev;
    const inset = 0.05;
    const rz = dz + 0.006;
    b.add(skin, face(fx0, fy0, fx1, fy0 + inset, dz, uv));
    b.add(skin, face(fx0, fy1 - inset, fx1, fy1, dz, uv));
    b.add(skin, face(fx0, fy0 + inset, fx0 + inset, fy1 - inset, dz, uv));
    b.add(skin, face(fx1 - inset, fy0 + inset, fx1, fy1 - inset, dz, uv));
    const e = 0.012;
    const rr = [
      [fx0 + inset, fy0 + inset, fx1 - inset, fy0 + inset, fx1 - inset - e, fy0 + inset + e, fx0 + inset + e, fy0 + inset + e],
      [fx1 - inset, fy0 + inset, fx1 - inset, fy1 - inset, fx1 - inset - e, fy1 - inset - e, fx1 - inset - e, fy0 + inset + e],
      [fx1 - inset, fy1 - inset, fx0 + inset, fy1 - inset, fx0 + inset + e, fy1 - inset - e, fx1 - inset - e, fy1 - inset - e],
      [fx0 + inset, fy1 - inset, fx0 + inset, fy0 + inset, fx0 + inset + e, fy0 + inset + e, fx0 + inset + e, fy1 - inset - e],
    ];
    for (const q of rr) {
      b.add(
        skin,
        quad(
          [
            [q[0], q[1], dz],
            [q[2], q[3], dz],
            [q[4], q[5], rz],
            [q[6], q[7], rz],
          ],
          [uv(q[0], q[1]), uv(q[2], q[3]), uv(q[4], q[5]), uv(q[6], q[7])],
        ),
      );
    }
    b.add(skin, face(fx0 + inset + e, fy0 + inset + e, fx1 - inset - e, fy1 - inset - e, rz, uv));
  }
  // edges
  const edge = (g) => b.add('trim', g, null, [0.5, 0.48, 0.46]);
  // the body sits behind the deepest panel; thin strips close the perimeter up to the face
  const deep = 0.0185;
  edge(boxUV(boxAt(x0, y0, -t, lw, y1 - y0, t - deep), { along: 'y', offset: [r() * 3, r() * 3] }));
  for (const x of [x0, x1 - 0.002]) edge(boxUV(boxAt(x, y0, -deep, 0.002, y1 - y0, deep - 0.0002), { along: 'y' }));
  for (const y of [y0, y1 - 0.002]) edge(boxUV(boxAt(x0, y, -deep, lw, 0.002, deep - 0.0002), { along: 'x' }));
  // back face
  if (inside === 'claw') {
    const g = quad(
      [
        [x1, y0, -t],
        [x0, y0, -t],
        [x0, y1, -t],
        [x1, y1, -t],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    );
    b.add('claw', g, move(0, 0, -0.0006));
  }
  // furniture
  const hx = handleSide * (lw / 2 - 0.058);
  const hb = new Bag();
  handle(hb, -handleSide, 0.07 + r() * 0.12); // old springs: every lever sags a little, some a lot
  b.addBag(hb, move(hx, 1.0, 0));
  const hb2 = new Bag();
  handle(hb2, handleSide, 0.05, 'brassDull');
  b.addBag(hb2, M(rotY(Math.PI), move(hx, 1.0, -t)));
  // peephole
  b.add('brass', new THREE.TorusGeometry(0.0095, 0.003, 8, 20), move(0, 1.47, dz + 0.006));
  b.add('void', new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 16), M(rotX(Math.PI / 2), move(0, 1.47, dz + 0.0065)));
  // number plate, screwed to the upper panel, rarely level
  if (plate) {
    const c = plateCell(no);
    const pw = 0.15;
    const ph = 0.075;
    const pg = quad(
      [
        [-pw / 2, -ph / 2, 0.0031],
        [pw / 2, -ph / 2, 0.0031],
        [pw / 2, ph / 2, 0.0031],
        [-pw / 2, ph / 2, 0.0031],
      ],
      [
        [c.u0, c.v0],
        [c.u1, c.v0],
        [c.u1, c.v1],
        [c.u0, c.v1],
      ],
    );
    const pb = new Bag();
    pb.add('plate', pg);
    pb.add('brassDull', box(pw, ph, 0.003, 0, 0, 0.0015));
    for (const sx of [-1, 1]) pb.add('iron', new THREE.SphereGeometry(0.003, 8, 6), move(sx * (pw / 2 - 0.009), 0, 0.003));
    b.addBag(pb, M(rotZ(plateTilt), move(0, 1.66, dz + 0.005)));
  }
  return b;
}

// Place a leaf in door coordinates. hingeSide: -1 or +1 (door x). angle: positive opens.
// outward doors hang on the corridor face and swing into the corridor.
export function leafMatrix({ hingeSide, angle = 0, outward = false }) {
  const lw = DOOR.w - 0.007;
  const t = DOOR.t;
  if (outward) {
    // pivot on the front face
    return M(move(-hingeSide * (lw / 2), 0, 0), rotY(hingeSide * angle), move(hingeSide * (DOOR.w / 2 - 0.0035), 0, -0.012));
  }
  return M(move(-hingeSide * (lw / 2), 0, t), rotY(-hingeSide * angle), move(hingeSide * (DOOR.w / 2 - 0.0035), 0, -REC - t));
}
