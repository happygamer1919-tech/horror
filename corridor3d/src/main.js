// Harness entry. The node driver (render.mjs) calls window.corridor.* through Playwright.
import * as THREE from 'three';
import { Pipeline, LENS, lensZoom, lensForward } from './pipeline.js';
import { buildScene } from './scene.js';
import { SETS, cameraPose, frameS, exposureStops, scareOpen, scareLean, HW } from './layout.js';

const canvas = document.getElementById('c');
let pipe;
let world;
let camera;
let built = false;

const BASE_EXPOSURE = 0.62;

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
  async init({ textureSize = 2048 } = {}) {
    pipe = new Pipeline(canvas);
    pipe.pt.textureSize.set(textureSize, textureSize);
    world = await buildScene({ textureSize });
    camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.08, 80);
    world.scene.add(camera);
    return { gpu: pipe.gpu, triangles: Math.round(world.triangles) };
  },

  // Render one frame to the canvas. opts: { set, index | s, scale, samples, scare: { j, variant }, seed, post, denoise }
  async frame(opts) {
    const { set = 'desktop', samples = 32, scare = null } = opts;
    const { at, ds, w, h } = prepare(opts);
    const state = world.apply(at, scare ? { angle: scareOpen(scare.j), lean: scareLean(scare.j), variant: scare.variant } : null);
    setPose(at, set);
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
    }
    camera.updateMatrixWorld(true);
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
      lamps: world.fogLamps(state.lamps),
      shutter: shutterLen > 0 && !free ? (u) => setPose(at + (u - 0.5) * shutterLen, set) : null,
      halfWidth: HW,
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
    return { ...res, scene: tScene, s: at, w, h, lamps: state.lamps.length };
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
