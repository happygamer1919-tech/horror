// Ceiling pendants: rose, flex, lampholder, a ribbed opal glass shade and the bulb.
// The bulb itself is a small disc light for the path tracer (soft penumbra, no fireflies);
// the glass you can see glowing is drawn in the overlay pass.
import * as THREE from 'three';
import { PhysicalSpotLight } from 'three-gpu-pathtracer';
import { CH, LAMPS, LAMP_DROP, SWING_LAMP } from './layout.js';
import { Bag, M, move, rotX, mulberry } from './util.js';

export const LAMP_COLOR = new THREE.Color(1.0, 0.8, 0.58); // tungsten, seen with a tungsten-ish white balance
export const LAMP_CD = 46; // candela at full level
const SHADE_GLOW = 5;

function pendant(r) {
  const b = new Bag();
  const drop = LAMP_DROP;
  // ceiling rose
  b.add('bakelite', new THREE.CylinderGeometry(0.047, 0.052, 0.022, 28), move(0, -0.011, 0));
  b.add('bakelite', new THREE.CylinderGeometry(0.02, 0.044, 0.03, 24), move(0, -0.036, 0));
  // twisted flex
  const pts = [];
  const top = -0.05;
  const bottom = -(drop - 0.105);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3(0.0035 * Math.sin(t * 9), top + (bottom - top) * t, 0.0035 * Math.cos(t * 9)));
  }
  b.add('cable', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0042, 8, false));
  // lampholder with its shade ring
  b.add('bakelite', new THREE.CylinderGeometry(0.019, 0.021, 0.062, 20), move(0, -(drop - 0.075), 0));
  b.add('brassDull', new THREE.CylinderGeometry(0.03, 0.03, 0.008, 24), move(0, -(drop - 0.05), 0));
  // shade: a shallow opal glass coolie, ribbed, chipped rim
  const prof = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const rad = 0.03 + 0.165 * Math.pow(t, 0.82);
    const y = -(drop - 0.055) - 0.115 * Math.pow(t, 1.25);
    prof.push(new THREE.Vector2(rad, y));
  }
  const shade = new THREE.LatheGeometry(prof, 128);
  const pos = shade.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const rad = Math.hypot(x, z);
    const k = 1 + 0.012 * Math.cos(a * 24) * Math.min(1, rad / 0.08);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  shade.computeVertexNormals();
  const turn = new THREE.Matrix4().makeRotationY(r() * 6);
  b.add('shade', shade, turn);
  // the rolled glass rim
  const rimY = -(drop - 0.055) - 0.115;
  b.add('shade', new THREE.TorusGeometry(0.195, 0.0035, 10, 128), M(rotX(Math.PI / 2), move(0, rimY, 0)));
  return b;
}

// Returns { fixtures: [{ k, group, light, shadeMat, bulb, pivot }] } and adds nothing to the static bag:
// each lamp keeps its own shade material so it can die on its own.
export function buildLamps(materials) {
  const r = mulberry(77);
  const fixtures = [];
  for (const l of LAMPS) {
    const pivot = new THREE.Group();
    pivot.position.set((r() - 0.5) * 0.04, CH, -l.s);
    pivot.name = `lamp${l.k}`;
    const shadeMat = materials.shade.clone();
    shadeMat.name = `shade${l.k}`;
    const body = pendant(r).build({ ...materials, shade: shadeMat }, `lamp${l.k}`);
    pivot.add(body);
    // not one of them hangs quite plumb
    if (l.k !== SWING_LAMP) pivot.rotation.set((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.03);

    const light = new PhysicalSpotLight(LAMP_COLOR, LAMP_CD, 0, 1.34, 0.6, 2);
    light.radius = 0.032;
    light.position.set(0, -(LAMP_DROP + 0.035), 0);
    light.target.position.set(0, -3, 0);
    pivot.add(light, light.target);

    // overlay only: the bulb
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bulb.scale.set(1, 1.25, 1);
    bulb.position.set(0, -LAMP_DROP, 0);
    bulb.userData.overlay = true;
    pivot.add(bulb);
    fixtures.push({ k: l.k, s: l.s, pivot, light, shadeMat, bulb, last: Boolean(l.last) });
  }
  return fixtures;
}

// Apply a lamp level 0..1 to a fixture. Returns true if it is alight at all.
export function setLamp(f, level) {
  const on = level > 0.004;
  f.light.visible = on;
  // a dying filament goes orange as well as dim
  const warm = 0.35 + 0.65 * level;
  f.light.intensity = LAMP_CD * level * (f.last ? 0.62 : 1); // the last one is a tired old bulb: the end of the walk is no brighter than its start
  f.light.color.setRGB(LAMP_COLOR.r, LAMP_COLOR.g * (0.75 + 0.25 * warm), LAMP_COLOR.b * (0.5 + 0.5 * warm));
  f.shadeMat.emissiveIntensity = SHADE_GLOW * level;
  f.shadeMat.emissive.setRGB(1.0, 0.7 * (0.75 + 0.25 * warm), 0.38 * (0.5 + 0.5 * warm));
  const b = 60 * level;
  f.bulb.material.color.setRGB(b * 1.0, b * 0.84 * (0.75 + 0.25 * warm), b * 0.6 * (0.5 + 0.5 * warm));
  f.bulb.visible = on;
  return on;
}
