// The shell of the corridor: floor, carpet runner, walls with door openings, ceiling, and the
// joinery that runs along it (skirting, dado rail, cornice). Dirt is painted into vertex colours
// so nothing tiles: darker towards the floor and the cornice, soot over the lamps, wear down
// the middle of the carpet.
import * as THREE from 'three';
import { HW, CH, WALL_T, START, END, DOOR, DOORS, DADO, SKIRT, RUNNER, LAMPS } from './layout.js';
import { grid, extrude, paint, planarUV, fbm, noise2, smooth, clamp, M, move, rotX, rotY, boxAt, boxUV } from './util.js';

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

// Dirt on the wallpaper, as a colour multiplier.
function wallDirt(side, s, y) {
  let k = 0.82 + 0.3 * fbm(s * 0.4 + side * 13, y * 0.7, 11, 4);
  k *= 1 - 0.3 * smooth(2.1, CH, y); // soot under the cornice
  k *= 1 - 0.16 * smooth(DADO + 0.3, DADO, y); // above the rail
  // old water runs from the ceiling
  const run = smooth(0.62, 0.85, fbm(s * 4.5 + side * 7, 0.5, 23, 3));
  k *= 1 - 0.3 * run * smooth(0.9, CH, y) * (0.4 + 0.6 * noise2(s * 30, y * 2, 3));
  // hand-height grime beside every door
  for (const d of DOORS) {
    if (d.side !== side) continue;
    for (const edge of [d.s - 0.12, d.s + DOOR.w + 0.12]) {
      const dx = (s - edge) / 0.22;
      const dy = (y - 1.15) / 0.45;
      k *= 1 - 0.22 * Math.exp(-(dx * dx + dy * dy));
    }
  }
  const warm = 0.9 + 0.1 * noise2(s * 0.8, y * 0.8, 41);
  return [k, k * (0.95 + 0.03 * warm), k * (0.84 + 0.1 * warm)];
}

function wainscotDirt(side, s, y) {
  let k = 0.8 + 0.35 * fbm(s * 0.7 + side * 3, y * 2, 51, 3);
  k *= 0.72 + 0.28 * smooth(0.12, 0.5, y); // kicked and mopped at the bottom
  return [k, k, k * 0.96];
}

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

// Top of the carpet runner: a slab with a little unevenness and one long ruck near door 306.
export function carpetHeight(x, s) {
  const edge = smooth(RUNNER, RUNNER - 0.06, Math.abs(x));
  const ruck = 0.012 * Math.exp(-Math.pow((s - 12.1 - x * 0.25) / 0.09, 2)) * smooth(-0.6, 0.1, x);
  return 0.011 + edge * (0.0035 * (fbm(x * 3, s * 1.5, 81, 3) - 0.3) + ruck);
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
    const g = grid(-HW - WALL_T, START, HW + WALL_T, END, 0.16);
    planarUV(g, 0, 1);
    const p = paint(g, (v) => {
      const edge = smooth(HW - 0.02, HW - 0.3, Math.abs(v.x));
      const k = (0.55 + 0.45 * edge) * (0.8 + 0.4 * fbm(v.x * 2, v.y * 0.8, 71, 3));
      return [k, k, k];
    });
    bag.add('floor', p, rotX(-Math.PI / 2));
  }
  // --- carpet runner: a slab with a little ripple, worn down the middle ---
  {
    const y0 = START + 0.3;
    const y1 = END - 0.12;
    const g = grid(-RUNNER, y0, RUNNER, y1, 0.075);
    planarUV(g, 0, 1);
    // the texture spans the runner from edge to edge
    for (let i = 0; i < g.attributes.uv.count; i++) g.attributes.uv.setX(i, g.attributes.uv.getX(i) + RUNNER);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const s = pos.getY(i);
      pos.setZ(i, carpetHeight(x, s));
    }
    g.computeVertexNormals();
    const p = paint(g, (v) => {
      const x = v.x;
      const s = v.y;
      const wear = Math.exp(-Math.pow(x / 0.26, 2)) * (0.5 + 0.5 * fbm(x * 2, s * 0.6, 91, 3));
      const stain = smooth(0.6, 0.82, fbm(x * 1.6 + 9, s * 0.9, 97, 4));
      const grit = smooth(RUNNER - 0.25, RUNNER, Math.abs(x)); // dirt collects along the edges
      const k = (0.72 + 0.5 * fbm(x * 0.9, s * 0.35, 93, 4)) * (1 - 0.55 * stain) * (1 - 0.3 * grit);
      // worn pile goes pale and grey: lift and desaturate
      const w = 0.6 * wear;
      return [k * (1 + 0.2 * w), k * (1 + 1.5 * w), k * (1 + 1.4 * w)];
    });
    bag.add('carpet', p, rotX(-Math.PI / 2));
    // the bound edges of the slab
    for (const sx of [-1, 1]) {
      const e = boxUV(boxAt(sx > 0 ? RUNNER - 0.004 : -RUNNER, 0, -y1, 0.004, 0.0105, y1 - y0), { along: 'z' });
      bag.add('rubber', e, null, [3, 1.2, 1.2]);
    }
  }
  // --- ceiling ---
  {
    const g = grid(-HW - WALL_T, -END, HW + WALL_T, -START, 0.14);
    planarUV(g, 0, 1);
    const p = paint(g, (v) => {
      const s = -v.y;
      let k = 0.86 + 0.26 * fbm(v.x * 1.1, s * 0.6, 101, 4);
      k *= 1 - 0.22 * smooth(HW - 0.35, HW, Math.abs(v.x));
      for (const l of LAMPS) {
        const d = Math.hypot(v.x, s - l.s);
        k *= 1 - 0.38 * Math.exp(-(d * d) / 0.07); // soot over each lamp
      }
      return [k, k * 0.985, k * 0.93];
    });
    bag.add('ceiling', p, M(rotX(Math.PI / 2), move(0, CH, 0)));
  }
  // --- side walls ---
  for (const side of [-1, 1]) {
    const frame = wallFrame(side, 0);
    const sOf = (lx) => (side < 0 ? lx : -lx);
    const addWall = (s0, s1, y0, y1, mat, dirt, cell) => {
      const a = alongWall(side, 0, s0);
      const b = alongWall(side, 0, s1);
      const g = grid(Math.min(a, b), y0, Math.max(a, b), y1, cell);
      planarUV(g, 0, 1);
      const pos = g.attributes.position;
      if (mat === 'wallpaper') for (let i = 0; i < pos.count; i++) pos.setZ(i, wallBulge(side, sOf(pos.getX(i)), pos.getY(i)));
      g.computeVertexNormals();
      bag.add(mat, paint(g, (v) => dirt(side, sOf(v.x), v.y)), frame);
    };
    for (const [s0, s1] of wallRuns(side)) {
      addWall(s0, s1, DADO, CH, 'wallpaper', wallDirt, 0.11);
      addWall(s0, s1, 0, DADO, 'wainscot', wainscotDirt, 0.2);
      // joinery along this run
      const len = s1 - s0;
      const place = (y) => (side < 0 ? M(move(-HW, y, -s1)) : M(rotY(Math.PI), move(HW, y, -s0)));
      const dirtK = (v) => {
        const k = 0.8 + 0.3 * fbm(v.z * 0.8, v.y * 3, 61, 2);
        return [k, k, k];
      };
      bag.add('trim', paint(extrude(PROFILE.skirting, len), dirtK), place(0));
      bag.add('trim', paint(extrude(PROFILE.dado, len), dirtK), place(DADO - 0.03));
    }
    for (const d of DOORS.filter((x) => x.side === side)) addWall(d.s, d.s + DOOR.w, DOOR.h, CH, 'wallpaper', wallDirt, 0.11);
    // cornice, the whole length
    const place = side < 0 ? M(move(-HW, CH, -END)) : M(rotY(Math.PI), move(HW, CH, -START));
    bag.add('ceiling', paint(extrude(CORNICE, END - START), (v) => {
      const k = 0.7 + 0.3 * fbm(v.z * 0.7, 2, 63, 3);
      return [k, k * 0.98, k * 0.92];
    }), place);
  }
  // --- end wall and the wall behind the walker ---
  {
    const frame = endFrame();
    const half = DOOR.w / 2;
    const pieces = [
      [-HW, -half, DADO, CH],
      [half, HW, DADO, CH],
      [-half, half, DOOR.h, CH],
    ];
    for (const [x0, x1, y0, y1] of pieces) {
      const g = grid(x0, y0, x1, y1, 0.11);
      planarUV(g, 0, 1);
      bag.add('wallpaper', paint(g, (v) => wallDirt(0, v.x + 40, v.y)), frame);
    }
    for (const [x0, x1] of [
      [-HW, -half],
      [half, HW],
    ]) {
      const g = grid(x0, 0, x1, DADO, 0.2);
      planarUV(g, 0, 1);
      bag.add('wainscot', paint(g, (v) => wainscotDirt(0, v.x + 40, v.y)), frame);
      const len = x1 - x0;
      // joinery across the end wall: extrusions run along local x
      const place = (y) => M(rotY(-Math.PI / 2), move(x1, y, 0), frame);
      bag.add('trim', extrude(PROFILE.skirting, len), place(0));
      bag.add('trim', extrude(PROFILE.dado, len), place(DADO - 0.03));
    }
    bag.add('ceiling', extrude(CORNICE, 2 * HW), M(rotY(-Math.PI / 2), move(HW, CH, 0), frame));
    // behind the walker: a plain dark wall, never seen, it only closes the box
    const back = grid(-HW - WALL_T, 0, HW + WALL_T, CH, 0.5);
    planarUV(back, 0, 1);
    bag.add('wallpaper', paint(back, () => [0.5, 0.48, 0.42]), M(rotY(Math.PI), move(0, 0, -START)));
  }
}
