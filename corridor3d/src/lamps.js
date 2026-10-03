// Ceiling pendants: rose, flex, lampholder, an opal glass shade and the bulb. No two are the
// same lamp (layout.js LAMP_KIND): different bulbs, different lengths of flex, none plumb, the
// glass yellowed and dusty to a different degree, and one is a bare dead bulb with its shade gone.
// The bulb itself is a small disc light for the path tracer (soft penumbra, no fireflies);
// the glass you can see glowing is drawn in the overlay pass.
import * as THREE from 'three';
import { PhysicalSpotLight } from 'three-gpu-pathtracer';
import { CH, LAMPS, LAMP_DROP, LAMP_KIND, SWING_LAMP } from './layout.js';
import { Bag, M, move, rotX, mulberry } from './util.js';

export const LAMP_COLOR = new THREE.Color(1.0, 0.8, 0.58); // tungsten, seen with a tungsten-ish white balance
export const LAMP_CD = 46; // candela at full level
const SHADE_GLOW = 6.5;

function pendant(r, kind) {
  const b = new Bag();
  const drop = LAMP_DROP + kind.drop;
  // ceiling rose
  b.add('bakelite', new THREE.CylinderGeometry(0.047, 0.052, 0.022, 28), move(0, -0.011, 0));
  b.add('bakelite', new THREE.CylinderGeometry(0.02, 0.044, 0.03, 24), move(0, -0.036, 0));
  // twisted flex, never quite straight
  const pts = [];
  const top = -0.05;
  const bottom = -(drop - 0.105);
  const kink = (r() - 0.5) * 0.012;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3(0.0035 * Math.sin(t * 9) + kink * Math.sin(t * Math.PI), top + (bottom - top) * t, 0.0035 * Math.cos(t * 9)));
  }
  b.add('cable', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0042, 8, false));
  // lampholder with its shade ring
  b.add('bakelite', new THREE.CylinderGeometry(0.019, 0.021, 0.062, 20), move(0, -(drop - 0.075), 0));
  b.add('brassDull', new THREE.CylinderGeometry(0.03, 0.03, 0.008, 24), move(0, -(drop - 0.05), 0));
  if (kind.bare) {
    // the shade went long ago: a dead bulb, grey with dust, in a bare holder
    const bulb = new THREE.SphereGeometry(0.03, 20, 14);
    bulb.scale(1, 1.25, 1);
    b.add('bulbDead', bulb, move(0, -drop, 0));
    b.add('brassDull', new THREE.CylinderGeometry(0.0135, 0.0135, 0.022, 16), move(0, -(drop - 0.036), 0));
    return b;
  }
  // shade: a shallow opal glass coolie, ribbed
  const prof = [];
  const flare = 0.82 + 0.1 * (r() - 0.5);
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const rad = 0.03 + 0.165 * Math.pow(t, flare);
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

// Returns [{ k, pivot, light, shadeMat, bulb, kind }] and adds nothing to the static bag:
// each lamp keeps its own shade material so it can die on its own.
export function buildLamps(materials) {
  const r = mulberry(77);
  const fixtures = [];
  for (const l of LAMPS) {
    const kind = LAMP_KIND[l.k];
    const drop = LAMP_DROP + kind.drop;
    const pivot = new THREE.Group();
    pivot.position.set((r() - 0.5) * 0.05, CH, -l.s + (r() - 0.5) * 0.06);
    pivot.name = `lamp${l.k}`;
    const shadeMat = materials.shade.clone();
    shadeMat.name = `shade${l.k}`;
    // forty years of cigarettes and dust on the glass: each a different shade of yellow-brown
    const d = kind.dust;
    shadeMat.color.setRGB(0.62 - 0.22 * d, 0.55 - 0.22 * d, 0.42 - 0.2 * d);
    shadeMat.roughness = 0.45 + 0.4 * d;
    const body = pendant(r, kind).build({ ...materials, shade: shadeMat }, `lamp${l.k}`);
    pivot.add(body);
    // not one of them hangs quite plumb
    if (l.k !== SWING_LAMP) pivot.rotation.set((r() - 0.5) * 0.07, 0, (r() - 0.5) * 0.07);

    const light = new PhysicalSpotLight(LAMP_COLOR, LAMP_CD, 0, 1.36, 0.32, 2);
    light.radius = 0.032;
    light.position.set(0, -(drop + 0.035), 0);
    light.target.position.set(0, -3, 0);
    pivot.add(light, light.target);

    // overlay only: the bulb
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bulb.scale.set(1, 1.25, 1);
    bulb.position.set(0, -drop, 0);
    bulb.userData.overlay = true;
    pivot.add(bulb);
    fixtures.push({ k: l.k, s: l.s, pivot, light, shadeMat, bulb, kind, last: Boolean(l.last) });
  }
  return fixtures;
}

// Apply a lamp level 0..1 to a fixture. Returns true if it is alight at all.
export function setLamp(f, level) {
  const on = level > 0.004 && !f.kind.dead;
  f.light.visible = on;
  // a dying filament goes orange as well as dim, and an old bulb is orange to begin with
  const warm = (0.35 + 0.65 * Math.min(1, level / Math.max(0.05, f.kind.level))) * (1 - 0.5 * f.kind.warm);
  f.light.intensity = LAMP_CD * level;
  f.light.color.setRGB(LAMP_COLOR.r, LAMP_COLOR.g * (0.75 + 0.25 * warm), LAMP_COLOR.b * (0.5 + 0.5 * warm));
  // dusty glass lets less through
  f.shadeMat.emissiveIntensity = on ? SHADE_GLOW * level * (1 - 0.45 * f.kind.dust) : 0;
  f.shadeMat.emissive.setRGB(1.0, 0.66 * (0.75 + 0.25 * warm), 0.34 * (0.5 + 0.5 * warm));
  const b = 60 * level;
  f.bulb.material.color.setRGB(b * 1.0, b * 0.84 * (0.75 + 0.25 * warm), b * 0.6 * (0.5 + 0.5 * warm));
  f.bulb.visible = on;
  return on;
}
