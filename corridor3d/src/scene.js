// Assembles the corridor and exposes the few things that move: lamp levels, the swinging lamp,
// the scare door and whoever is behind it.
import * as THREE from 'three';
import { FogVolumeMaterial } from 'three-gpu-pathtracer';
import { HW, CH, WALL_T, START, END, DOOR, DOORS, SPECIAL, LAST_ROOM, SWING_LAMP, SCARE_DOOR, lampLevel, swing, door as doorByNo } from './layout.js';
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

// The air as a true volume in the tracer: a homogeneous haze it scatters light in. density is
// per metre. OFF by default (0): with the volume in the scene the lit walls of the finished
// frame come out far too dark at any density (cause not found in round 1), and paths that
// scatter beside a bulb leave fireflies (README, "The haze"). `--haze=0.01` turns it on.
export const HAZE = { density: 0, color: [0.9, 0.86, 0.8] };

// Which skin each door wears: the ones the walker stops at have their own.
const OWN_SKIN = { 301: 'door301', 306: 'door306', 308: 'door308', 313: 'door313' };
const SHARED = ['doorA', 'doorB', 'doorC'];

export async function buildScene({ textureSize = 2048, haze = HAZE.density } = {}) {
  const T = await loadTextures({ size: textureSize, small: Math.min(1024, textureSize) });
  const materials = makeMaterials(T);
  for (const m of Object.values(materials)) if (!['wallpaperPeel', 'paperBack'].includes(m.name)) m.side = THREE.DoubleSide;
  const skinOf = (no) => OWN_SKIN[no] ?? SHARED[((no * 7) >> 1) % SHARED.length];

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
      angle = 1.22; // hangs wide (70 degrees): its inside faces the walker and the lamp
    }
    const leaf = buildLeaf({
      no: d.no,
      handleSide: -hingeSide,
      inside: kind === 'scratched' ? 'claw' : 'plain',
      seed: d.no,
      plateTilt: (r() - 0.5) * (d.no === 309 ? 0.5 : 0.05),
      gap: kind === 'light' ? 0.02 : 0.004,
      skin: skinOf(d.no),
    });
    // no two leaves the same: walnut to mahogany, some darker with old varnish
    const tk = 0.74 + 0.36 * r();
    const red = r();
    const tint = [tk, tk * (0.9 + 0.1 * red), tk * (0.84 + 0.16 * red)];
    doorMeta[d.no] = { frame, hingeSide, handleSide: -hingeSide, angle, outward, dynamic: kind === 'scare' };
    if (kind === 'scare') {
      // its own group so it can swing
      const frameGroup = new THREE.Group();
      frameGroup.applyMatrix4(frame);
      const pivot = new THREE.Group();
      const lw = DOOR.w - 0.007;
      pivot.position.set(hingeSide * (DOOR.w / 2 - 0.0035), 0, -REC - DOOR.t);
      // door 308 is the darkest leaf in the corridor: at the scare it is a dark mass beside a lit wall
      for (const [mat, list] of leaf.items) {
        if (!mat.startsWith('door')) continue;
        for (const g of list) {
          const c = g.attributes.color;
          for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * 0.27, c.getY(i) * 0.26, c.getZ(i) * 0.25);
        }
      }
      const leafGroup = leaf.build(materials, 'scareLeaf');
      leafGroup.position.set(-hingeSide * (lw / 2), 0, DOOR.t);
      pivot.add(leafGroup);
      frameGroup.add(pivot);
      scene.add(frameGroup);
      dyn.scare = { pivot, hingeSide, frameGroup, leafGroup, frame, door: d };
    } else {
      const lb = new Bag();
      lb.addBag(leaf, M(leafMatrix({ hingeSide, angle, outward }), frame));
      for (const [mat, list] of lb.items) for (const g of list) bag.add(mat, g, null, mat.startsWith('door') ? tint : null);
    }
    if (kind === 'scratched' || kind === 'scare' || kind === 'light') room(bag, d.side, d.s);
  }
  // the last door, on the end wall
  {
    const frame = endFrame();
    buildSurround(bag, frame, { seed: LAST_ROOM });
    const leaf = buildLeaf({ no: LAST_ROOM, handleSide: -1, seed: LAST_ROOM, plateTilt: 0.075, skin: skinOf(LAST_ROOM) }); // a screw gone: the plate hangs crooked
    bag.addBag(leaf, M(leafMatrix({ hingeSide: 1, angle: 0.004 }), frame));
    doorMeta[LAST_ROOM] = { frame, hingeSide: 1, handleSide: -1, angle: 0.004, outward: false, dynamic: false };
  }

  const props = await buildProps(bag, materials, T, doorMeta);
  scene.add(bag.build(materials, 'static'));
  for (const o of props.objects) scene.add(o);

  const fixtures = buildLamps(materials);
  for (const f of fixtures) scene.add(f.pivot);

  // The haze: a closed box that holds the camera, a little LARGER than the corridor, its faces
  // inside the walls, under the floor and above the ceiling. A face just inside the room is
  // crossed by every ray a millimetre before it reaches a surface, and where the carpet's waves
  // came within the tracer's ray offset of that face they rendered black.
  if (haze > 0) {
    const e = -0.06;
    const box = new THREE.BoxGeometry(2 * (HW - e), CH - 2 * e, END - START - 2 * e);
    const air = new FogVolumeMaterial({ color: new THREE.Color(...HAZE.color) });
    air.density = haze;
    const fog = new THREE.Mesh(box, air);
    fog.position.set(0, CH / 2, -(START + END) / 2);
    fog.name = 'haze';
    fog.userData.volume = true;
    fog.visible = false;
    scene.add(fog);
  }

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
