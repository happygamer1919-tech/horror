// The shell of the corridor: floor, carpet runner, walls with door openings, ceiling, and the
// joinery that runs along it (skirting, dado rail, cornice). The walls and the runner are cut
// into panels, each with its own baked texture (surfaces.js); the joinery carries its wear in
// vertex colours: rubbed pale along the nose of the rail, dust on every ledge.
import * as THREE from 'three';
import { HW, CH, WALL_T, START, END, DOOR, DOORS, DADO, SKIRT, RUNNER, LAMPS } from './layout.js';
import { grid, extrude, paint, planarUV, fbm, noise2, smooth, clamp, mulberry, M, move, rotX, rotY } from './util.js';
import { wallPanels, panelUV, CARPET_PANELS, carpetPanel, carpetUV } from './surfaces.js';

// Right-handed frame of a side wall: local x runs along the wall, y up, z out into the corridor.
// On the left wall local +x is the walking direction; on the right wall it points back.
export function wallFrame(side, s) {
  return side < 0 ? M(rotY(Math.PI / 2), move(-HW, 0, -s)) : M(rotY(-Math.PI / 2), move(HW, 0, -s));
}
// The end wall faces the walker: local x is world x.
export const endFrame = () => move(0, 0, -END);
// Local x on a side wall for a distance s along the corridor, given the frame origin s0.
export const alongWall = (side, s0, s) => (side < 0 ? s - s0 : s0 - s);

// Walls are not flat: a few millimetres of wander.
export const wallBulge = (side, s, y) => 0.006 * (fbm(s * 0.9 + side * 31, y * 1.3, 5, 3) - 0.5);

// Segments of a side wall between the door openings: [s0, s1].
export function wallRuns(side) {
  const doors = DOORS.filter((d) => d.side === side).sort((a, b) => a.s - b.s);
  const runs = [];
  let s = START;
  for (const d of doors) {
    runs.push([s, d.s]);
    s = d.s + DOOR.w;
  }
  runs.push([s, END]);
  return runs;
}

// Top of the carpet runner: never a plane. It has crept and stretched, so it lies in long shallow
// waves, with a ruck near door 306 and another where the trolley turns.
export function carpetHeight(x, s) {
  const edge = smooth(RUNNER, RUNNER - 0.06, Math.abs(x));
  const ruck = 0.012 * Math.exp(-Math.pow((s - 12.1 - x * 0.25) / 0.09, 2)) * smooth(-0.6, 0.1, x) + 0.008 * Math.exp(-Math.pow((s - 4.6 + x * 0.4) / 0.07, 2)) * smooth(0.55, -0.1, x);
  const wave = 0.005 * (fbm(x * 1.3, s * 0.9, 83, 2) - 0.4) + 0.0035 * (fbm(x * 3, s * 1.5, 81, 3) - 0.3);
  // one edge has lifted where a trolley wheel caught it, in the first pool of light
  const lifted = 0.016 * Math.exp(-Math.pow((s - 2.7) / 0.2, 2)) * smooth(0.36, 0.6, x);
  return 0.012 + edge * (wave + ruck) + lifted;
}
// The edge of the runner is not a ruled line either.
export const carpetEdge = (sx, s) => 0.006 * (fbm(s * 0.6 + sx * 7, 1.5, 85, 3) - 0.5) + 0.0025 * (noise2(s * 9, sx, 87) - 0.5);

// Wear on a length of joinery, as a vertex colour. `out` is how far the point stands out from
// the wall as a fraction of the profile's depth, `ledge` whether it faces up.
function trimWear(s, y, out, ledge, seed) {
  let k = 0.72 + 0.4 * fbm(s * 0.8, y * 3, seed, 3);
  const c = [k, k, k];
  // the nose is rubbed through to pale wood wherever sleeves and trolleys have gone along it
  const rub = smooth(0.7, 1, out) * smooth(0.42, 0.62, fbm(s * 2.4, 2.5, seed + 3, 3));
  c[0] *= 1 + 1.5 * rub;
  c[1] *= 1 + 1.3 * rub;
  c[2] *= 1 + 1.1 * rub;
  // dust lies on whatever faces up: grey, and it kills the colour of the wood
  const dust = ledge * (0.5 + 0.5 * fbm(s * 1.7, 4.5, seed + 5, 2));
  c[0] *= 1 + 0.9 * dust;
  c[1] *= 1 + 1.15 * dust;
  c[2] *= 1 + 1.5 * dust;
  return c;
}

const PROFILE = {
  // [out from the wall, up], wound from the wall at the bottom, out, up, and back to the wall
  skirting: [
    [0, 0],
    [0.018, 0],
    [0.018, 0.085],
    [0.014, 0.1],
    [0.009, 0.108],
    [0.009, SKIRT - 0.008],
    [0.004, SKIRT],
    [0, SKIRT],
  ],
  dado: [
    [0, 0],
    [0.012, 0.002],
    [0.016, 0.012],
    [0.03, 0.02],
    [0.033, 0.03],
    [0.03, 0.04],
    [0.016, 0.047],
    [0.012, 0.058],
    [0, 0.06],
  ],
};
// Cornice: a plaster cove. [out from the wall, down from the ceiling], listed from the wall upwards.
const CORNICE = (() => {
  const p = [
    [0, -0.11],
    [0.012, -0.11],
    [0.012, -0.096],
  ];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    p.push([0.012 + 0.07 * (1 - Math.cos(a)), -0.096 + 0.07 * Math.sin(a)]);
  }
  p.push([0.082, -0.012], [0.096, -0.012], [0.096, 0]);
  return p;
})();

export function buildShell(bag) {
  // --- floor: boards along the corridor ---
  {
    const g = grid(-HW - WALL_T, START, HW + WALL_T, END, 0.07);
    planarUV(g, 0, 1);
    const p = paint(g, (v) => {
      const edge = smooth(HW - 0.02, HW - 0.3, Math.abs(v.x));
      // dust and old polish lie against the skirting; slow patches of wear, nothing at the scale of the mesh
      const k = (0.5 + 0.5 * edge) * (0.82 + 0.36 * fbm(v.x * 0.9, v.y * 0.45, 71, 2));
      return [k, k * 0.985, k * 0.96];
    });
    bag.add('floor', p, rotX(-Math.PI / 2));
  }
  // --- carpet runner: panel by panel, each with its own baked albedo ---
  for (let k = 0; k < CARPET_PANELS; k++) {
    const p = carpetPanel(k);
    const g = grid(-RUNNER, p.s0, RUNNER, p.s1, 0.06);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const s = pos.getY(i);
      const [u, v] = carpetUV(p, x, s);
      uv.setXY(i, u, v);
      const sx = Math.sign(x);
      pos.setXYZ(i, x + carpetEdge(sx, s) * Math.pow(Math.abs(x) / RUNNER, 3), s, carpetHeight(x, s));
    }
    g.computeVertexNormals();
    bag.add(`carpet${k}`, g, rotX(-Math.PI / 2));
    // the bound edge: the slab's side, down to the boards
    for (const sx of [-1, 1]) {
      const n = Math.round((p.s1 - p.s0) / 0.06);
      const vp = [];
      const vu = [];
      for (let i = 0; i < n; i++) {
        const sa = p.s0 + ((p.s1 - p.s0) * i) / n;
        const sb = p.s0 + ((p.s1 - p.s0) * (i + 1)) / n;
        const xa = sx * RUNNER + carpetEdge(sx, sa);
        const xb = sx * RUNNER + carpetEdge(sx, sb);
        const ua = carpetUV(p, sx * RUNNER, sa);
        const ub = carpetUV(p, sx * RUNNER, sb);
        const quad = [
          [xa, sa, carpetHeight(sx * RUNNER, sa), ua],
          [xb, sb, carpetHeight(sx * RUNNER, sb), ub],
          [xb + sx * 0.007, sb, 0.0005, ub],
          [xa + sx * 0.007, sa, 0.0005, ua],
        ];
        for (const j of sx > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
          vp.push(quad[j][0], quad[j][1], quad[j][2]);
          vu.push(quad[j][3][0], quad[j][3][1]);
        }
      }
      const e = new THREE.BufferGeometry();
      e.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
      e.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
      e.computeVertexNormals();
      bag.add(`carpet${k}`, e, rotX(-Math.PI / 2), [0.28, 0.28, 0.28]);
    }
  }
  // --- ceiling ---
  {
    const g = grid(-HW - WALL_T, -END, HW + WALL_T, -START, 0.14);
    planarUV(g, 0, 1);
    const p = paint(g, (v) => {
      const s = -v.y;
      let k = 0.8 + 0.3 * fbm(v.x * 1.1, s * 0.6, 101, 4);
      k *= 0.86 + 0.28 * fbm(v.x * 5, s * 5, 103, 3);
      k *= 1 - 0.3 * smooth(HW - 0.35, HW, Math.abs(v.x));
      // where the roof let the water in: the same places the walls are stained
      k *= 1 - 0.45 * smooth(0.55, 0.75, fbm(v.x * 0.9 + 4, s * 0.5, 105, 3));
      for (const l of LAMPS) {
        const d = Math.hypot(v.x, s - l.s);
        k *= 1 - 0.38 * Math.exp(-(d * d) / 0.07); // soot over each lamp
      }
      return [k, k * 0.985, k * 0.93];
    });
    bag.add('ceiling', p, M(rotX(Math.PI / 2), move(0, CH, 0)));
  }
  // --- side walls ---
  const panels = wallPanels();
  for (const side of [-1, 1]) {
    const frame = wallFrame(side, 0);
    const sOf = (lx) => (side < 0 ? lx : -lx);
    const mine = panels.filter((p) => p.side === side);
    // a piece of wall from s0 to s1, cut where it crosses a panel joint
    const addWall = (s0, s1, y0, y1, kind, cell) => {
      for (const p of mine) {
        const a = Math.max(s0, p.a0);
        const b = Math.min(s1, p.a1);
        if (b - a < 1e-5) continue;
        const xa = alongWall(side, 0, a);
        const xb = alongWall(side, 0, b);
        const g = grid(Math.min(xa, xb), y0, Math.max(xa, xb), y1, cell);
        const pos = g.attributes.position;
        const uv = g.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const s = sOf(pos.getX(i));
          const y = pos.getY(i);
          const [u, v] = panelUV(p, s, y);
          uv.setXY(i, u, v);
          if (kind === 'paper') pos.setZ(i, wallBulge(side, s, y));
        }
        g.computeVertexNormals();
        bag.add(`${kind}${p.id}`, g, frame);
      }
    };
    for (const [s0, s1] of wallRuns(side)) {
      addWall(s0, s1, DADO, CH, 'paper', 0.11);
      addWall(s0, s1, 0, DADO, 'wood', 0.2);
      // joinery along this run
      const len = s1 - s0;
      const place = (y) => (side < 0 ? M(move(-HW, y, -s1)) : M(rotY(Math.PI), move(HW, y, -s0)));
      const sAt = (z) => (side < 0 ? s1 - z : s0 + z);
      bag.add('trim', paint(extrude(PROFILE.skirting, len, { step: 0.12 }), (v) => trimWear(sAt(v.z) + side * 40, v.y, v.x / 0.018, smooth(SKIRT - 0.03, SKIRT, v.y) * smooth(0.012, 0.002, v.x), 61)), place(0));
      // the rail went up in lengths: a hair's gap at each joint, no two lengths at quite the same
      // height, and a long one sags
      {
        const rr = mulberry(Math.round(s0 * 97) + (side > 0 ? 5000 : 0));
        let z = 0;
        while (z < len - 0.01) {
          let piece = 1.5 + 1.4 * rr();
          if (len - z - piece < 0.7) piece = len - z;
          const dy = (rr() - 0.5) * 0.004;
          const tilt = (rr() - 0.5) * 0.0022;
          const z0 = z;
          const g = extrude(PROFILE.dado, piece - 0.0025, { step: 0.08, caps: true });
          const pos = g.attributes.position;
          for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + dy + tilt * pos.getZ(i) - 0.0025 * Math.sin((Math.PI * pos.getZ(i)) / piece));
          g.translate(0, 0, z0);
          bag.add('trim', paint(g, (v) => trimWear(sAt(v.z) + side * 40, v.y, v.x / 0.033, smooth(0.04, 0.058, v.y), 71)), place(DADO - 0.03));
          z += piece;
        }
      }
    }
    for (const d of DOORS.filter((x) => x.side === side)) addWall(d.s, d.s + DOOR.w, DOOR.h, CH, 'paper', 0.11);
    // cornice, the whole length
    const place = side < 0 ? M(move(-HW, CH, -END)) : M(rotY(Math.PI), move(HW, CH, -START));
    bag.add('ceiling', paint(extrude(CORNICE, END - START, { step: 0.3 }), (v) => {
      const k = 0.55 + 0.4 * fbm(v.z * 0.7, 2, 63, 3);
      return [k, k * 0.98, k * 0.92];
    }), place);
  }
  // --- end wall and the wall behind the walker ---
  {
    const frame = endFrame();
    const half = DOOR.w / 2;
    const p = panels.find((q) => q.side === 0);
    const piece = (x0, x1, y0, y1, kind, cell) => {
      const g = grid(x0, y0, x1, y1, cell);
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const [u, v] = panelUV(p, pos.getX(i), pos.getY(i));
        uv.setXY(i, u, v);
      }
      bag.add(`${kind}${p.id}`, g, frame);
    };
    piece(-HW, -half, DADO, CH, 'paper', 0.11);
    piece(half, HW, DADO, CH, 'paper', 0.11);
    piece(-half, half, DOOR.h, CH, 'paper', 0.11);
    for (const [x0, x1] of [
      [-HW, -half],
      [half, HW],
    ]) {
      piece(x0, x1, 0, DADO, 'wood', 0.2);
      const len = x1 - x0;
      // joinery across the end wall: extrusions run along local x
      const place = (y) => M(rotY(-Math.PI / 2), move(x1, y, 0), frame);
      bag.add('trim', paint(extrude(PROFILE.skirting, len, { step: 0.12 }), (v) => trimWear(v.z + x0 + 90, v.y, v.x / 0.018, smooth(SKIRT - 0.03, SKIRT, v.y) * smooth(0.012, 0.002, v.x), 61)), place(0));
      bag.add('trim', paint(extrude(PROFILE.dado, len, { step: 0.08 }), (v) => trimWear(v.z + x0 + 90, v.y, v.x / 0.033, smooth(0.04, 0.058, v.y), 71)), place(DADO - 0.03));
    }
    bag.add('ceiling', paint(extrude(CORNICE, 2 * HW), () => [0.6, 0.59, 0.55]), M(rotY(-Math.PI / 2), move(HW, CH, 0), frame));
    // behind the walker: a plain dark wall, never seen, it only closes the box
    const back = grid(-HW - WALL_T, 0, HW + WALL_T, CH, 0.5);
    planarUV(back, 0, 1);
    bag.add('void', paint(back, () => [14, 13, 11]), M(rotY(Math.PI), move(0, 0, -START)));
  }
}
