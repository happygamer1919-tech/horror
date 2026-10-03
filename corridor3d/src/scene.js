// Assembles the corridor and exposes the few things that move: lamp levels, the swinging lamp,
// the scare door and whoever is behind it.
import * as THREE from 'three';
import { HW, CH, WALL_T, END, DOOR, DOORS, SPECIAL, LAST_ROOM, SWING_LAMP, SCARE_DOOR, lampLevel, swing, door as doorByNo } from './layout.js';
import { Bag, M, move, rotY, mulberry, grid, planarUV, paint, boxAt, boxUV } from './util.js';
import { loadTextures } from './textures.js';
import { makeMaterials } from './materials.js';
import { buildShell, wallFrame, endFrame } from './shell.js';
import { buildSurround, buildLeaf, leafMatrix, REC } from './doors.js';
import { buildLamps, setLamp } from './lamps.js';
import { buildProps } from './props.js';
import { buildFigure } from './figure.js';

// A dark room behind a door that opens: floor, walls, and the room side of the corridor wall.
function room(bag, side, s0) {
  const x0 = HW + WALL_T;
  const depth = 3.4;
  const a = s0 - 1.5;
  const b = s0 + DOOR.w + 1.5; // centred on the door, so the mirrored copy keeps its opening
  const dark = () => [1, 1, 1];
  const add = (g, m) => bag.add('void', paint(g, dark), m);
  // built for the right side, mirrored by a half turn for the left
  const flip = side > 0 ? new THREE.Matrix4() : M(rotY(Math.PI), move(0, 0, -(a + b)));
  const P = (m) => M(m, flip);
  bag.add('floor', planarUV(grid(x0, a, x0 + depth, b, 0.4), 0, 1), P(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), [0.25, 0.25, 0.25]);
  add(grid(x0, -b, x0 + depth, -a, 0.6), P(M(new THREE.Matrix4().makeRotationX(Math.PI / 2), move(0, CH, 0))));
  add(grid(-b, 0, -a, CH, 0.6), P(M(rotY(-Math.PI / 2), move(x0 + depth, 0, 0)))); // back wall
  add(grid(x0, 0, x0 + depth, CH, 0.6), P(move(0, 0, -b))); // far side wall
  add(grid(x0, 0, x0 + depth, CH, 0.6), P(M(rotY(Math.PI), move(2 * x0 + depth, 0, -a)))); // near side wall
  // room side of the corridor wall, around the opening
  const front = (u0, u1, y0, y1) => add(grid(u0, y0, u1, y1, 0.5), P(M(rotY(Math.PI / 2), move(x0, 0, 0))));
  front(a, s0, 0, CH);
  front(s0 + DOOR.w, b, 0, CH);
  front(s0, s0 + DOOR.w, DOOR.h + 0.02, CH);
}

export async function buildScene({ textureSize = 2048 } = {}) {
  const T = await loadTextures({ size: textureSize, small: Math.min(1024, textureSize) });
  const materials = makeMaterials(T);
  for (const m of Object.values(materials)) if (!['wallpaperPeel', 'paperBack'].includes(m.name)) m.side = THREE.DoubleSide;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const bag = new Bag();
  buildShell(bag);

  const dyn = { scare: null };
  const doorMeta = {};
  const r = mulberry(2024);
  for (const d of DOORS) {
    const kind = SPECIAL[d.no];
    const frame = wallFrame(d.side, d.s + DOOR.w / 2);
    const outward = kind === 'scratched';
    buildSurround(bag, frame, { seed: d.no, sill: kind !== 'light', outward });
    // door x: +1 is the near (walker) side on the right wall, the far side on the left wall
    const near = d.side;
    let hingeSide = r() < 0.5 ? near : -near;
    let angle = (r() - 0.5) * 0.006;
    if (kind === 'scare') hingeSide = near;
    if (kind === 'scratched') {
      hingeSide = -near;
      angle = 0.96;
    }
    const leaf = buildLeaf({
      no: d.no,
      handleSide: -hingeSide,
      inside: kind === 'scratched' ? 'claw' : 'plain',
      seed: d.no,
      plateTilt: (r() - 0.5) * (d.no === 309 ? 0.5 : 0.05),
      gap: kind === 'light' ? 0.02 : 0.004,
    });
    // no two leaves the same: walnut to mahogany, some darker with old varnish
    const tk = 0.78 + 0.34 * r();
    const red = r();
    const tint = [tk, tk * (0.84 + 0.12 * red), tk * (0.78 + 0.18 * red)];
    doorMeta[d.no] = { frame, hingeSide, handleSide: -hingeSide, angle, outward, dynamic: kind === 'scare' };
    if (kind === 'scare') {
      // its own group so it can swing
      const frameGroup = new THREE.Group();
      frameGroup.applyMatrix4(frame);
      const pivot = new THREE.Group();
      const lw = DOOR.w - 0.007;
      pivot.position.set(hingeSide * (DOOR.w / 2 - 0.0035), 0, -REC - DOOR.t);
      const leafGroup = leaf.build(materials, 'scareLeaf');
      leafGroup.position.set(-hingeSide * (lw / 2), 0, DOOR.t);
      pivot.add(leafGroup);
      frameGroup.add(pivot);
      scene.add(frameGroup);
      dyn.scare = { pivot, hingeSide, frameGroup, leafGroup, frame, door: d };
    } else {
      const lb = new Bag();
      lb.addBag(leaf, M(leafMatrix({ hingeSide, angle, outward }), frame));
      for (const [mat, list] of lb.items) for (const g of list) bag.add(mat, g, null, mat === 'door' ? tint : null);
    }
    if (kind === 'scratched' || kind === 'scare' || kind === 'light') room(bag, d.side, d.s);
  }
  // the last door, on the end wall
  {
    const frame = endFrame();
    buildSurround(bag, frame, { seed: LAST_ROOM });
    const leaf = buildLeaf({ no: LAST_ROOM, handleSide: -1, seed: LAST_ROOM, plateTilt: 0.012 });
    bag.addBag(leaf, M(leafMatrix({ hingeSide: 1, angle: 0.004 }), frame));
    doorMeta[LAST_ROOM] = { frame, hingeSide: 1, handleSide: -1, angle: 0.004, outward: false, dynamic: false };
  }

  const props = await buildProps(bag, materials, T, doorMeta);
  scene.add(bag.build(materials, 'static'));
  for (const o of props.objects) scene.add(o);

  const fixtures = buildLamps(materials);
  for (const f of fixtures) scene.add(f.pivot);

  const figure = buildFigure(materials, { hingeSide: dyn.scare.hingeSide });
  dyn.scare.frameGroup.add(figure.root);
  dyn.scare.leafGroup.add(figure.hand);

  let last = { across: null, along: null, angle: null, variant: null };
  // Apply the state for a walker at distance s. scare: { angle, lean, variant: 'face' | 'gap' } or null.
  // Returns whether any geometry moved (the path tracer then needs a rebuilt BVH).
  function apply(s, scare = null) {
    const lamps = [];
    for (const f of fixtures) {
      const level = lampLevel(f.k, s);
      if (setLamp(f, level)) lamps.push(f);
    }
    for (const l of props.lights) l.update?.(s);
    const sw = swing(s);
    const f = fixtures[SWING_LAMP];
    f.pivot.rotation.set(sw.along, 0, sw.across);
    const angle = scare ? scare.angle : 0;
    const variant = scare && angle > 0.001 ? scare.variant : 'none';
    if (dyn.scare) {
      dyn.scare.pivot.rotation.y = -dyn.scare.hingeSide * angle;
      figure.set(variant, scare ? scare.lean : 0, angle);
    }
    const moved = last.across !== sw.across || last.along !== sw.along || last.angle !== angle || last.variant !== variant;
    last = { across: sw.across, along: sw.along, angle, variant };
    scene.updateMatrixWorld(true);
    return { moved, lamps };
  }

  // Lamp list for the dust pass.
  function fogLamps(active) {
    const down = new THREE.Vector3();
    const q = new THREE.Quaternion();
    return active.map((f) => {
      const pos = new THREE.Vector3();
      f.light.getWorldPosition(pos);
      f.pivot.getWorldQuaternion(q);
      down.set(0, -1, 0).applyQuaternion(q);
      const c = f.light.color;
      const i = f.light.intensity;
      return { pos, dir: down.clone(), color: new THREE.Vector3(c.r * i, c.g * i, c.b * i), cone: [Math.cos(f.light.angle), Math.cos(f.light.angle * (1 - f.light.penumbra))] };
    });
  }

  return { scene, materials, fixtures, apply, fogLamps, dyn, figure, props, triangles: bag.triangles };
}

export { doorByNo };
