// Harness entry. The node driver (render.mjs) calls window.corridor.* through Playwright.
import * as THREE from 'three';
import { PhysicalCamera, PhysicalSpotLight } from 'three-gpu-pathtracer';
import { Pipeline, LENS, lensZoom, lensForward } from './pipeline.js';
import { buildScene } from './scene.js';
import { SETS, cameraPose, frameS, exposureStops, scareOpen, scareLean, HW, FSTOP, focusDistance, torchAim, torchLevel, TORCH_HAND } from './layout.js';

const canvas = document.getElementById('c');
let pipe;
let world;
let camera;
let built = false;
let volume = false; // a true haze volume is in the tracer (init({ haze }))

// Exposed for the hot spot of the torch on a wall two metres off (layout.js exposureStops follows
// the distance of what the beam is on); what the beam does not reach is left to go black.
const BASE_EXPOSURE = 2.1;

// The torch: an old one, a tungsten bulb in a dented reflector. Three lights from one point in
// the walker's hand: the hot spot (about 15 degrees across, soft edged), the spill round it (about
// 38 degrees, three stops under), and a faint ring where the reflector's edge throws a second
// image of the filament. The hot spot sits a little off the centre of the spill, as it does when
// the bulb is not seated straight.
// (And a fourth, very wide and very faint: what leaks past the rim of the reflector. It is what
// the walker's own surroundings are seen by, just.)
const TORCH = { cd: 62, color: [1.0, 0.8, 0.56], hot: [0.17, 0.92], spill: [0.42, 1.0, 0.21], ring: [0.235, 0.34, 0.03], leak: [1.05, 1.0, 0.012] };
let torch;
function buildTorch() {
  const mk = (angle, pen) => {
    const l = new PhysicalSpotLight(new THREE.Color(...TORCH.color), TORCH.cd, 0, angle, pen, 2);
    l.radius = 0.014;
    l.position.set(...TORCH_HAND);
    const t = new THREE.Object3D();
    l.target = t;
    camera.add(l, t);
    return l;
  };
  torch = { hot: mk(TORCH.hot[0], TORCH.hot[1]), spill: mk(TORCH.spill[0], TORCH.spill[1]), ring: mk(TORCH.ring[0], TORCH.ring[1]), leak: mk(TORCH.leak[0], TORCH.leak[1]) };
}
// Point it at the thing it is on for a walker at s, at the level it burns at there.
function aimTorch(s, scaleBy = 1) {
  const a = torchAim(s);
  camera.updateMatrixWorld(true);
  const local = camera.worldToLocal(new THREE.Vector3(a[0], a[1], -a[2]));
  const d = local.length();
  torch.hot.target.position.copy(local);
  torch.spill.target.position.copy(local).add(new THREE.Vector3(0.03 * d, -0.022 * d, 0));
  torch.ring.target.position.copy(torch.spill.target.position);
  torch.leak.target.position.copy(torch.spill.target.position);
  const lvl = torchLevel(s) * scaleBy;
  // a failing battery goes orange before it goes dark
  const warm = 0.45 + 0.55 * lvl;
  for (const l of Object.values(torch)) l.color.setRGB(TORCH.color[0], TORCH.color[1] * (0.8 + 0.2 * warm), TORCH.color[2] * (0.55 + 0.45 * warm));
  torch.hot.intensity = TORCH.cd * lvl;
  torch.spill.intensity = TORCH.cd * TORCH.spill[2] * lvl;
  torch.ring.intensity = TORCH.cd * TORCH.ring[2] * lvl;
  torch.leak.intensity = TORCH.cd * TORCH.leak[2] * lvl;
  camera.updateMatrixWorld(true);
  // for the dust pass: the beam itself, faintly, in the air
  const pos = new THREE.Vector3();
  torch.hot.getWorldPosition(pos);
  const to = new THREE.Vector3();
  torch.spill.target.getWorldPosition(to);
  const dir = to.sub(pos).normalize();
  const col = (k) => new THREE.Vector3(torch.hot.color.r, torch.hot.color.g, torch.hot.color.b).multiplyScalar(TORCH.cd * lvl * k);
  return [
    { pos, dir, color: col(1), cone: [Math.cos(TORCH.hot[0]), Math.cos(TORCH.hot[0] * (1 - TORCH.hot[1]))] },
    { pos, dir, color: col(TORCH.spill[2]), cone: [Math.cos(TORCH.spill[0]), Math.cos(TORCH.spill[0] * (1 - TORCH.spill[1]))] },
  ];
}

function setPose(s, set) {
  const p = cameraPose(s, set);
  camera.position.set(p.x, p.y, -p.s);
  camera.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
}

function prepare({ set, index, s, scale = 1 }) {
  const def = SETS[set];
  const w = Math.round(def.w * scale);
  const h = Math.round(def.h * scale);
  pipe.setSize(w, h);
  camera.fov = def.fov;
  camera.aspect = w / h;
  camera.near = 0.08;
  camera.far = 80;
  camera.updateProjectionMatrix();
  const at = s ?? frameS(set, index);
  const next = index != null && index + 1 < def.frames ? frameS(set, index + 1) : at + 0.15;
  return { def, w, h, at, ds: Math.abs(next - at) };
}

window.corridor = {
  async init({ textureSize = 2048, haze } = {}) {
    pipe = new Pipeline(canvas);
    pipe.pt.textureSize.set(textureSize, textureSize);
    world = await buildScene({ textureSize, haze });
    volume = (haze ?? 0) > 0;
    camera = new PhysicalCamera(45, 16 / 9, 0.08, 80);
    world.scene.add(camera);
    buildTorch();
    return { gpu: pipe.gpu, triangles: Math.round(world.triangles) };
  },

  // Render one frame to the canvas. opts: { set, index | s, scale, samples, scare: { j, variant }, seed, post, denoise }
  async frame(opts) {
    const { set = 'desktop', samples = 32, scare = null } = opts;
    const { at, ds, w, h } = prepare(opts);
    const state = world.apply(at, scare ? { angle: scareOpen(scare.j), lean: scareLean(scare.j), variant: scare.variant } : null);
    setPose(at, set);
    // the lens: nearly wide open, focused on what the walker is looking at
    camera.fStop = opts.fStop ?? FSTOP[set];
    camera.focusDistance = opts.focus ?? focusDistance(at);
    let beam = aimTorch(at, opts.torch ?? 1);
    // debug view: cam = { p: [x, y, s], t: [x, y, s], fov }
    const free = opts.cam;
    if (free) {
      camera.position.set(free.p[0], free.p[1], -free.p[2]);
      camera.up.set(0, 1, 0);
      camera.lookAt(free.t[0], free.t[1], -free.t[2]);
      if (free.fov) {
        camera.fov = free.fov;
        camera.updateProjectionMatrix();
      }
      camera.focusDistance = opts.focus ?? Math.hypot(free.p[0] - free.t[0], free.p[1] - free.t[1], free.p[2] - free.t[2]);
    }
    camera.updateMatrixWorld(true);
    if (free) beam = aimTorch(at, opts.torch ?? 1);
    const t0 = performance.now();
    if (state.moved || !built) {
      pipe.setScene(world.scene, camera);
      built = true;
    } else {
      pipe.refresh({ materials: true, lights: true });
    }
    await pipe.compiled();
    const tScene = performance.now() - t0;
    const shutterLen = (opts.shutter ?? 0.12) * ds; // a short exposure: a scrubbed frame is looked at standing still
    const seed = opts.seed ?? (set === 'desktop' ? 1000 : 5000) + (opts.index ?? Math.round(at * 100));
    const res = pipe.render({
      camera,
      samples,
      seed,
      exposure: BASE_EXPOSURE * Math.pow(2, exposureStops(at)) * (opts.exposureScale ?? 1),
      grainGain: 1 + 0.22 * Math.max(0, exposureStops(at)),
      // the traced image of a scare frame must match the held frame outside the door (same seed),
      // but film grain is never the same twice: its seed is the frame's own
      grainSeed: seed + (scare ? 37 * (scare.j + 1) + (scare.variant === 'gap' ? 500 : 0) : 0),
      bounces: opts.bounces,
      lamps: beam,
      shutter: shutterLen > 0 && !free ? (u) => setPose(at + (u - 0.5) * shutterLen, set) : null,
      halfWidth: HW,
      volume,
      scatter: opts.scatter,
      extinction: opts.extinction,
      fogAmbient: opts.fogAmbient,
      fogCore: opts.fogCore,
      denoise: opts.denoise,
      iterations: opts.iterations,
      sigmaL: opts.sigmaL,
      post: opts.post,
      debug: opts.debug,
    });
    return { ...res, scene: tScene, s: at, w, h, lamps: state.lamps.length, focus: camera.focusDistance, layers: pipe.layers };
  },

  probe(name, rect) {
    return pipe.probe(name, rect);
  },

  // Debug: how evenly the tracer's stratified sample table covers [0, 1) over n samples.
  strat(n = 200) {
    const t = pipe.pt._pathTracer.material.stratifiedTexture;
    const w = t.image.width;
    const h = t.image.height;
    const st = Array.from({ length: w * h * 4 }, () => ({ min: 1, max: 0, sum: 0 }));
    for (let i = 0; i < n; i++) {
      t.next();
      const d = t.image.data;
      for (let k = 0; k < st.length; k++) {
        st[k].min = Math.min(st[k].min, d[k]);
        st[k].max = Math.max(st[k].max, d[k]);
        st[k].sum += d[k];
      }
    }
    const bad = [];
    st.forEach((x, k) => {
      if (x.max - x.min < 0.8 || Math.abs(x.sum / n - 0.5) > 0.1) bad.push({ texel: k >> 2, col: (k >> 2) % w, row: Math.floor((k >> 2) / w), comp: k & 3, min: x.min, max: x.max, mean: x.sum / n });
    });
    return { w, h, len: t.image.data.length, bad: bad.slice(0, 40), nbad: bad.length };
  },

  // Debug: the meshes whose name matches, with their vertex count and bounds.
  meshes(match) {
    const out = [];
    world.scene.traverse((o) => {
      if (!o.isMesh || !o.name.includes(match)) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      out.push({ name: o.name, verts: o.geometry.attributes.position.count, min: b.min.toArray(), max: b.max.toArray() });
    });
    return out;
  },

  // Debug: one of the authored textures as a PNG data URL.
  texture(mat, slot = 'map') {
    const img = world.materials[mat][slot].image;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  },

  png() {
    return canvas.toDataURL('image/png');
  },

  // Project world points into frame coordinates (0..1, origin top left), through the lens model.
  project(opts, points) {
    const { at, w, h } = prepare(opts);
    setPose(at, opts.set);
    camera.updateMatrixWorld(true);
    const aspect = w / h;
    const zoom = lensZoom(aspect, LENS.k1 + Math.abs(LENS.ca));
    const v = new THREE.Vector3();
    return points.map((p) => {
      v.set(p[0], p[1], p[2]).project(camera);
      const [x, y] = lensForward([(v.x + 1) / 2, (v.y + 1) / 2], aspect, LENS.k1, zoom);
      return [x, 1 - y];
    });
  },

  // The quad a supplied face photo is drawn into, and the visible door gap, for scare frame j.
  scareQuad(opts, j) {
    world.apply(prepare(opts).at, { angle: scareOpen(j), lean: scareLean(j), variant: 'gap' });
    world.scene.updateMatrixWorld(true);
    const q = world.figure.headQuad(world.dyn.scare.leafGroup, world.dyn.scare.frameGroup);
    return { quad: this.project(opts, q.quad), clip: this.project(opts, q.clip) };
  },
};
window.ready = true;
