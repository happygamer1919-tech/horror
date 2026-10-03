// Whoever is behind door 308: a child's face in the gap, lank hair hanging over one side of it,
// and four fingers round the edge of the door just above it. This is the stand-in used until a real photo
// is supplied in src/assets/scare/ (see the README there): mostly darkness on purpose.
//
// The head lives in door coordinates (x along the wall, y up, z out into the corridor);
// the hand lives in leaf coordinates so it swings with the door.
import * as THREE from 'three';
import { DOOR, WALL_T } from './layout.js';
import { Bag, M, move, rotX, rotY, rotZ, scale, mulberry, fbm, smooth, clamp, lerp, smoothNormals } from './util.js';

const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-Math.pow((x - cx) / sx, 2) - Math.pow((y - cy) / sy, 2));

// Radius of the head in direction d (unit vector, +z is the face), and a skin tint.
function headSurface(d) {
  const jaw = smooth(0.1, -0.9, d.y);
  const a = 0.0665 * (1 - 0.3 * jaw);
  const b = 0.092;
  const c = 0.08 * (1 - 0.1 * jaw);
  const zc = d.z > 0 ? c * 0.94 : c * 1.08; // flatter face, fuller back of the skull
  let r = 1 / Math.sqrt((d.x * d.x) / (a * a) + (d.y * d.y) / (b * b) + (d.z * d.z) / (zc * zc));
  const front = smooth(0.05, 0.45, d.z);
  const fx = d.x * r;
  const fy = d.y * r;
  const ax = Math.abs(fx);
  let disp = 0;
  let dark = 0;
  let lips = 0;
  // eye sockets and the brow over them
  // a child's proportions: the eyes sit low on the head, under a big forehead
  const socket = g2(ax, fy, 0.031, 0.004, 0.017, 0.0125);
  disp -= 0.009 * socket;
  dark += 0.75 * g2(ax, fy, 0.031, 0.002, 0.021, 0.016);
  disp += 0.0034 * g2(ax, fy, 0.031, 0.022, 0.026, 0.007);
  disp += 0.0015 * g2(fx, fy, 0, 0.025, 0.012, 0.01);
  // nose: bridge, tip, wings
  disp += 0.0045 * Math.exp(-Math.pow(fx / 0.0075, 2)) * smooth(0.024, 0.004, fy) * smooth(-0.036, -0.02, fy);
  disp += 0.0098 * g2(fx, fy, 0, -0.024, 0.0095, 0.0095);
  disp += 0.004 * g2(ax, fy, 0.0105, -0.028, 0.005, 0.005);
  dark += 0.3 * g2(ax, fy, 0.007, -0.0325, 0.003, 0.0022);
  // cheeks, hollow under the eyes
  disp += 0.004 * g2(ax, fy, 0.039, -0.024, 0.018, 0.018);
  disp -= 0.0014 * g2(ax, fy, 0.028, -0.013, 0.012, 0.005);
  dark += 0.3 * g2(ax, fy, 0.028, -0.011, 0.014, 0.006);
  // mouth: two lips and the line between them, corners turned down
  const my = -0.0495 - 0.004 * Math.pow(ax / 0.02, 2);
  disp += 0.003 * g2(fx, fy, 0, my + 0.005, 0.017, 0.0036);
  disp += 0.0034 * g2(fx, fy, 0, my - 0.0055, 0.014, 0.0045);
  disp -= 0.0034 * g2(fx, fy, 0, my, 0.02, 0.0016);
  lips = clamp(g2(fx, fy, 0, my + 0.004, 0.017, 0.0045) + g2(fx, fy, 0, my - 0.005, 0.014, 0.005), 0, 1);
  dark += 0.25 * g2(fx, fy, 0, my, 0.018, 0.0012);
  disp -= 0.0018 * g2(fx, fy, 0, -0.038, 0.004, 0.005); // philtrum
  // chin
  disp += 0.003 * g2(fx, fy, 0, -0.076, 0.018, 0.012);
  disp -= 0.002 * g2(fx, fy, 0, -0.064, 0.02, 0.004);
  // temples
  disp -= 0.002 * g2(ax, fy, 0.058, 0.03, 0.012, 0.02);
  r += disp * front;
  dark = clamp(dark * front, 0, 1);
  // mottled, bloodless skin; darker in every hollow
  const n = 0.92 + 0.16 * fbm(d.x * 9 + 3, d.y * 9 + d.z * 7, 77, 3);
  const k = n * (1 - 0.62 * dark);
  const col = [k * (1 - 0.06 * lips * front), k * (0.97 - 0.13 * lips * front - 0.06 * dark), k * (0.95 - 0.09 * lips * front - 0.02 * dark)];
  return { r, col };
}

function head() {
  const b = new Bag();
  const geo = new THREE.SphereGeometry(1, 128, 96);
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

  // eyes: glassy, the iris nearly all pupil, the white gone grey and red at the rim
  for (const sx of [-1, 1]) {
    const eg = new THREE.SphereGeometry(0.0132, 40, 30);
    eg.rotateX(Math.PI / 2); // pole forwards
    const ep = eg.attributes.position;
    const ec = new Float32Array(ep.count * 3);
    for (let i = 0; i < ep.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(ep, i).normalize();
      const ang = Math.acos(clamp(v.z, -1, 1));
      let c;
      if (ang < 0.26) c = [0.004, 0.004, 0.004];
      else if (ang < 0.5) c = [0.06 + 0.03 * Math.sin(ang * 60), 0.05 + 0.02 * Math.sin(ang * 60), 0.04];
      else if (ang < 0.56) c = [0.03, 0.026, 0.022];
      else {
        // the white gone yellow-grey, bloodshot towards the lids
        const red = smooth(0.62, 1.3, ang);
        c = [0.4 - 0.04 * red, 0.36 - 0.17 * red, 0.31 - 0.18 * red];
      }
      ec.set(c, i * 3);
    }
    eg.setAttribute('color', new THREE.BufferAttribute(ec, 3));
    // looking up from under the brow, slightly inwards
    const place = M(rotX(-0.2), rotY(-sx * 0.05), move(sx * 0.031, 0.004, 0.0552));
    b.add('eye', eg, place);
    // lids: upper heavy, lower slack, a wide dead stare between them
    const up = new THREE.SphereGeometry(0.0141, 28, 10, 0, Math.PI * 2, 0, 1.22);
    b.add('skin', up, M(rotX(0.1), move(sx * 0.031, 0.004, 0.055)), [0.46, 0.38, 0.39]);
    const lo = new THREE.SphereGeometry(0.014, 28, 8, 0, Math.PI * 2, 2.12, Math.PI - 2.12);
    b.add('skin', lo, M(rotX(-0.1), move(sx * 0.031, 0.004, 0.055)), [0.42, 0.33, 0.36]);
  }

  // hair: a cap over the skull and wet strands hanging past the shoulders, some across the face
  const r = mulberry(4242);
  const cap = new THREE.SphereGeometry(1, 56, 40);
  const cp = cap.attributes.position;
  const keep = [];
  for (let i = 0; i < cp.count; i++) {
    d.fromBufferAttribute(cp, i).normalize();
    const s = headSurface(d);
    const lift = 0.0055 + 0.003 * fbm(d.x * 6, d.y * 6 + d.z * 5, 5, 2);
    cp.setXYZ(i, d.x * (s.r + lift), d.y * (s.r + lift), d.z * (s.r + lift));
  }
  // drop the triangles over the face
  const ci = cap.index.array;
  for (let i = 0; i < ci.length; i += 3) {
    const c = new THREE.Vector3();
    for (let k = 0; k < 3; k++) c.add(d.fromBufferAttribute(cp, ci[i + k]));
    c.multiplyScalar(1 / 3).normalize();
    // an uneven hairline, so the hair never frames the face like a hood
    const jag = 0.14 * (fbm(c.x * 7 + 2, c.y * 7, 31, 2) - 0.5);
    const hairline = c.y > 0.5 - 0.1 * Math.abs(c.x) + jag || c.z < 0.3 - 0.5 * Math.max(0, c.y) || Math.abs(c.x) > 0.56 + jag;
    if (hairline) keep.push(ci[i], ci[i + 1], ci[i + 2]);
  }
  cap.setIndex(keep);
  cap.computeVertexNormals();
  b.add('hair', cap);
  const strand = (ang, width, len, over) => {
    // starts on the crown, follows the skull down, then hangs
    const pts = [];
    const N = 26;
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const wav = r() * 6;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const el = lerp(1.25, -0.2, Math.min(1, t * 2.6)); // elevation along the skull
      const dd = new THREE.Vector3(dir.x * Math.cos(el), Math.sin(el), dir.z * Math.cos(el)).normalize();
      const s = headSurface(dd);
      const p = dd.multiplyScalar(s.r + 0.008 + over * 0.004);
      if (t * 2.6 > 1) {
        const fall = (t * 2.6 - 1) / 1.6;
        p.y -= fall * len;
        p.x += 0.006 * Math.sin(fall * 5 + wav) + dir.x * 0.012 * fall;
        p.z += 0.005 * Math.cos(fall * 4 + wav) + dir.z * 0.01 * fall - 0.01 * fall * over;
      }
      pts.push(p);
    }
    const side = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
    const pos2 = [];
    for (let i = 0; i < N; i++) {
      const w0 = width * (1 - 0.7 * Math.pow(i / N, 2)) * 0.5;
      const w1 = width * (1 - 0.7 * Math.pow((i + 1) / N, 2)) * 0.5;
      const a0 = pts[i].clone().addScaledVector(side, -w0);
      const b0 = pts[i].clone().addScaledVector(side, w0);
      const a1 = pts[i + 1].clone().addScaledVector(side, -w1);
      const b1 = pts[i + 1].clone().addScaledVector(side, w1);
      for (const v of [a0, b0, b1, a0, b1, a1]) pos2.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
    sg.computeVertexNormals();
    const k = 0.6 + 0.8 * r();
    b.add('hair', smoothNormals(sg, 0.1), null, [k, k, k]);
  };
  // all round the back and sides: thin, wet, clumped strands
  for (let i = 0; i < 150; i++) {
    const ang = lerp(0.9, 2 * Math.PI - 0.9, i / 149) + (r() - 0.5) * 0.06;
    strand(ang, 0.005 + 0.006 * r(), 0.24 + 0.12 * r(), r() * 1.5);
  }
  // across the face: a curtain over the figure's right side, a few loose strands over the
  // left, so that only one eye looks out between them
  for (let i = 0; i < 40; i++) strand(-0.42 - i * 0.014 + (r() - 0.5) * 0.03, 0.005 + 0.006 * r(), 0.2 + 0.12 * r(), 1 + 1.2 * r());
  for (let i = 0; i < 6; i++) strand(-0.12 - i * 0.05 + (r() - 0.5) * 0.03, 0.003 + 0.003 * r(), 0.2 + 0.1 * r(), 1.6 + r());
  for (let i = 0; i < 7; i++) strand(0.5 + i * 0.07 + (r() - 0.5) * 0.04, 0.0035 + 0.003 * r(), 0.16 + 0.1 * r(), 1.3 + r());

  return b;
}

// Neck and a pale nightdress, origin at the centre of the head.
function body() {
  const b = new Bag();
  b.add('skin', new THREE.CylinderGeometry(0.03, 0.034, 0.1, 20), move(0, -0.115, -0.012), [0.8, 0.76, 0.74]);
  const prof = [
    [0.03, -0.1],
    [0.045, -0.125],
    [0.06, -0.155],
    [0.125, -0.19],
    [0.14, -0.26],
    [0.13, -0.42],
    [0.15, -0.7],
    [0.19, -1.02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const gown = new THREE.LatheGeometry(prof, 36);
  const gp = gown.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const a = Math.atan2(gp.getZ(i), gp.getX(i));
    const y = gp.getY(i);
    const fold = 1 + 0.07 * Math.sin(a * 9 + y * 6) * smooth(-0.25, -0.6, y);
    gp.setX(i, gp.getX(i) * fold);
    gp.setZ(i, gp.getZ(i) * fold * 0.62);
  }
  gown.computeVertexNormals();
  b.add('gown', gown, null, [0.022, 0.021, 0.02]);
  return b;
}

// Four fingers hooked round the free edge of the leaf, in leaf coordinates: the edge is at
// x = edgeX (the leaf lies towards +x of it when dirX = +1), front face at z = 0, back at -t.
function hand(edgeX, dirX, y0) {
  const b = new Bag();
  const r = mulberry(55);
  const t = DOOR.t;
  const seg = (p0, p1, r0, r1, mat = 'skin', tint) => {
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 14, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    b.add(mat, g, m, tint);
  };
  const ball = (p, rad, tint) => b.add('skin', new THREE.SphereGeometry(rad, 14, 10), move(p.x, p.y, p.z), tint);
  const widths = [0.0058, 0.0063, 0.006, 0.005];
  const reach = [0.03, 0.036, 0.033, 0.024];
  for (let f = 0; f < 4; f++) {
    const w = widths[f];
    const y = y0 + (1.5 - f) * 0.0175 + (r() - 0.5) * 0.002;
    const tilt = (r() - 0.5) * 0.25 + (1.5 - f) * 0.05; // fingers fan a little
    const out = -dirX; // away from the leaf, into the gap
    // knuckle behind the door, then along the edge, round the corner, flat on the face
    const mcp = new THREE.Vector3(edgeX + out * (w + 0.004), y - 0.006, -t - 0.03);
    const pip = new THREE.Vector3(edgeX + out * (w + 0.0015), y, -t * 0.42);
    const dip = new THREE.Vector3(edgeX + out * (w * 0.4), y + 0.001, w * 1.05 + 0.002);
    const mid = new THREE.Vector3(edgeX + dirX * reach[f] * 0.5, y + Math.sin(tilt) * reach[f] * 0.5, w * 0.95);
    const tip = new THREE.Vector3(edgeX + dirX * reach[f], y + Math.sin(tilt) * reach[f], w * 0.8);
    const pale = [0.72, 0.71, 0.71];
    const knuckle = [0.64, 0.55, 0.56]; // pressed white-red where they grip
    seg(mcp, pip, w * 1.08, w, 'skin', pale);
    ball(pip, w * 1.12, knuckle);
    seg(pip, dip, w, w * 0.98, 'skin', pale);
    ball(dip, w * 1.1, knuckle);
    seg(dip, mid, w * 0.98, w * 0.92, 'skin', pale);
    ball(mid, w * 0.98, knuckle);
    seg(mid, tip, w * 0.92, w * 0.78, 'skin', pale);
    ball(tip, w * 0.8, pale);
    // nail: bitten short, dirt under it
    const nd = new THREE.Vector3().subVectors(tip, mid).normalize();
    const ng = new THREE.SphereGeometry(1, 12, 8);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), nd);
    const centre = new THREE.Vector3().lerpVectors(mid, tip, 0.72);
    centre.z += w * 0.62;
    const nm = new THREE.Matrix4().compose(centre, q, new THREE.Vector3(w * 0.72, w * 0.62, w * 0.22));
    b.add('nail', ng, nm, [0.72 + 0.1 * r(), 0.66, 0.58]);
    b.add('void', new THREE.SphereGeometry(1, 8, 6), new THREE.Matrix4().compose(centre.clone().addScaledVector(nd, w * 0.62), q, new THREE.Vector3(w * 0.12, w * 0.5, w * 0.16)));
  }
  // the back of the hand and the wrist, going back into the dark
  const palmC = new THREE.Vector3(edgeX - dirX * 0.016, y0 - 0.004, -t - 0.055);
  b.add('skin', new THREE.SphereGeometry(1, 16, 12), new THREE.Matrix4().compose(palmC, new THREE.Quaternion(), new THREE.Vector3(0.017, 0.036, 0.03)), [0.9, 0.86, 0.84]);
  seg(new THREE.Vector3(palmC.x, palmC.y - 0.01, palmC.z - 0.02), new THREE.Vector3(palmC.x - dirX * 0.1, palmC.y - 0.12, palmC.z - 0.2), 0.022, 0.026, 'gown', [0.035, 0.033, 0.032]);
  return b;
}

export function buildFigure(materials, { hingeSide = 1 } = {}) {
  const root = new THREE.Group();
  root.name = 'figure';
  const headGroup = head().build(materials, 'head');
  const bodyGroup = body().build(materials, 'body');
  root.add(headGroup, bodyGroup);
  const lw = DOOR.w - 0.007;
  // leaf coordinates: the free edge is on the side away from the hinge
  const edgeX = -hingeSide * (lw / 2);
  const handGroup = hand(edgeX, hingeSide, (globalThis.__fig ?? {}).hy ?? 1.31).build(materials, 'hand');

  // where the head ends up, in door coordinates
  const far = -hingeSide; // x direction of the far jamb
  const pose = { x: 0, y: 0, z: 0 };
  function set(variant, lean, angle) {
    const on = variant !== 'none';
    handGroup.visible = on;
    root.visible = variant === 'face';
    // comes round the door as it opens: from behind the leaf into the gap
    // The lamp shines through the gap past the jamb: only a strip next to the door edge is lit.
    // Leaning in carries one eye out of the jamb's shadow into that strip.
    const T = (globalThis.__fig ?? {});
    pose.x = far * lerp(T.x0 ?? 0.6, T.x1 ?? 0.585, lean);
    pose.z = -WALL_T - lerp(T.z0 ?? 0.13, T.z1 ?? 0.165, lean);
    pose.y = (T.y ?? 1.2) - 0.012 * lean;
    headGroup.position.set(pose.x, pose.y, pose.z);
    headGroup.scale.setScalar(T.k ?? 1.08);
    // face the walker, chin down, head on one side
    headGroup.rotation.set(0.16, far * -1.02, far * (0.12 + 0.1 * lean), 'YXZ');
    bodyGroup.position.set(pose.x - far * 0.03, pose.y, pose.z - 0.05);
    bodyGroup.rotation.set(0, far * -0.8, 0);
    bodyGroup.scale.set(1.08, 1.15, 1.08);
  }
  set('none', 0, 0);

  // The rectangle a photo is drawn into (door coordinates, facing the walker) and the two
  // edges of the gap between the jamb and the leaf, over the height of the head.
  function headQuad(leafGroup, frameGroup) {
    const k = headGroup.scale.x;
    const w = 0.2 * k;
    const h = 0.27 * k;
    const c = new THREE.Vector3(pose.x, pose.y, pose.z);
    const yaw = far * -1.02;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3(0, 1, 0);
    const corner = (sx, sy) => c.clone().addScaledVector(right, sx * w / 2).addScaledVector(up, sy * h / 2).applyMatrix4(frameGroup.matrixWorld);
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
