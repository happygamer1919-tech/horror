// Layout and timeline of the corridor. Pure data and maths, no three.js: the browser harness
// and the node render driver both import this file, so the frames and the manifest agree.
//
// Axes: s runs along the corridor (the walk direction), x is right, y is up. In three.js
// world space z = -s.

export const HW = 0.95; // half width of the corridor
export const CH = 2.62; // ceiling height
export const WALL_T = 0.14; // wall thickness at the door reveals
export const START = -1.6; // wall behind the walker
export const END = 28.8; // end wall, where door 313 is

export const DOOR = { w: 0.86, h: 2.03, t: 0.042 };
export const DADO = 0.93; // top of the wainscot
export const SKIRT = 0.13;
export const RUNNER = 0.6; // half width of the carpet runner

// Side doors. `s` is the near jamb. Odd numbers on the left, even on the right.
export const DOORS = [];
for (let i = 0; i < 6; i++) {
  DOORS.push({ no: 301 + i * 2, side: -1, s: 2.3 + 4.2 * i });
  DOORS.push({ no: 302 + i * 2, side: 1, s: 4.4 + 4.2 * i });
}
export const door = (no) => DOORS.find((d) => d.no === no);
export const LAST_ROOM = 313;

// What is special about a door. Everything else is a plain closed door.
export const SPECIAL = {
  304: 'hanger', // do-not-disturb card on the handle
  305: 'scratched', // opens outwards, hangs open, clawed on the inside
  306: 'blood', // old dried marks at handle height
  308: 'scare', // opens a crack, once
  311: 'light', // light under the door, somebody standing behind it
  312: 'boarded', // boards nailed across, under the last lamp
};

// Ceiling lamps. The last one hangs over door 313 and never fails.
export const LAMPS = [];
for (let k = 0; k < 7; k++) LAMPS.push({ k, s: 3.0 + 3.45 * k });
export const LAST_LAMP = 7;
LAMPS.push({ k: LAST_LAMP, s: 27.45, last: true });
export const SWING_LAMP = 2;
export const LAMP_DROP = 0.42; // ceiling to bulb centre
export const LAMP_Y = CH - LAMP_DROP;

// No two lamps are the same lamp. level: how bright it is before anything fails (wattage, age,
// dust); warm: how far the filament has gone orange (0 is a healthy bulb); drop: extra flex in
// metres; dust: how much of the glass is dulled. Lamp 3 burnt out long ago and nobody changed it,
// and its shade is gone: a bare dead bulb. So the corridor is pools of light with black between
// them from the first frame, and the far end is only ever lit by the last lamp.
// The corridor is walked by torchlight. The ceiling lamps are dead, or a filament barely glowing:
// an ember that lights nothing but itself (`ember`: how bright the filament is seen, 0..1).
// drop: extra flex in metres; dust: how much of the glass is dulled; bare: the shade is gone.
// The embers are what the depth of the corridor is felt by: orange points receding in the dark.
export const LAMP_KIND = [
  { ember: 0, drop: 0.13, dust: 0.9, bare: true }, // dead, its shade long gone: a bulb on a flex
  { ember: 0.7, drop: 0.035, dust: 0.7, tilt: 0.09, lean: -0.14 },
  { ember: 0, drop: 0.16, dust: 0.3 }, // the swinging one: a dead shade that still sways
  { ember: 0, drop: -0.02, dust: 1, bare: true },
  { ember: 1.0, drop: 0.02, dust: 0.6 },
  { ember: 0.55, drop: -0.03, dust: 0.5 },
  { ember: 0.85, drop: 0.045, dust: 0.9 },
  { ember: 0.6, drop: 0.01, dust: 0.55 },
];
// Camera position (s) at which each ember goes out: the far ones first, the wave coming towards
// the walker, all of it inside the third quarter of the walk ("The lights were fine a minute ago.").
export const FAIL_AT = { 7: 13.0, 6: 13.5, 5: 14.0, 4: 14.6, 1: 15.1 };
export const FADE_LEN = 0.7; // metres of walking an ember takes to die

export const SHOE_AT = { s: 5.9, x: 0.76 }; // the child's shoe, on the bare boards against the right wall, past door 302
export const WALK_FROM = 0.35;
export const WALK_TO = 27.7; // an arm's length and a half from door 313
export const EYE = 1.4; // a little stooped, as someone creeping with a torch

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const bump = (c, w, v) => {
  const t = clamp(1 - Math.abs(v - c) / w, 0, 1);
  return t * t * (3 - 2 * t);
};
// The same, with its own width on either side of the peak.
const bump2 = (c, before, after, v) => bump(c, v < c ? before : after, v);

// Walk progress 0..1 to distance. Constant pace, slowing to a stop in front of the last door.
const KNEE = 0.8;
const pace = (p) => (p < KNEE ? p : KNEE + (p - KNEE) - (0.75 * (p - KNEE) * (p - KNEE)) / (2 * (1 - KNEE)));
export const camS = (p) => WALK_FROM + (WALK_TO - WALK_FROM) * (pace(clamp(p, 0, 1)) / pace(1));

// How bright the filament of lamp k is seen (0..1) for a walker at distance s.
export function lampLevel(k, s) {
  const base = LAMP_KIND[k].ember;
  if (!base) return 0;
  const t = clamp((s - FAIL_AT[k]) / FADE_LEN, 0, 1);
  // not a clean fade: a dip, a short recovery, then out. Slow enough that nothing strobes.
  const level = t <= 0 ? 1 : t >= 1 ? 0 : (1 - t) * (1 - t) * (0.6 + 0.4 * Math.cos(t * 4.4)) * (1 - smooth(0.75, 1, t));
  return Math.max(0, level) * base;
}

// The dead shade that still sways a little: angle in radians across the corridor and along it.
// Driven by the walk, so it stands still when the visitor stops scrolling.
export function swing(s) {
  return { across: 0.07 * Math.sin(s * 1.9 + 0.6), along: 0.025 * Math.sin(s * 0.95 + 1.7) };
}

// ---- the torch ------------------------------------------------------------------------------------
// The one light of the walk is in the walker's hand. Everything below says where it points; the
// camera follows it the way a head follows a hand, a little late and never all the way.
const slow = (s, a, b, c) => Math.sin(s * a + b) * 0.6 + Math.sin(s * a * 2.3 + c) * 0.4; // smooth, seeded by its phases

// What the beam goes to, in order: [centre s, metres before, metres after, point (x, y, s) on a surface].
const AIMS = [
  [0.35, 1.0, 2.2, [-0.95, 1.62, 2.72]], // the number on door 301
  [4.3, 1.8, 1.2, [0.95, 0.6, 5.16]], // (round 2: the lower panel of door 302; the shoe lies beyond it at the edge of the spill) // the foot of the right wall: the child's shoe lies in the spill
  [7.7, 1.2, 1.3, [-0.95, 1.78, 9.2]], // paper come away at a seam, under the dead swinging shade
  [10.5, 1.5, 0.75, [-0.52, 1.02, 11.4]], // the clawed inside of door 305, at the height of a child's hands
  [12.5, 1.0, 1.3, [0.95, 1.0, 13.35]], // the dried hand on door 306
  [16.75, 2.1, 0.9, [0.95, 1.32, 17.3]], // door 308, below its number: the edge that will open is at the rim of the hot spot
  [21.4, 1.5, 1.5, [-0.95, 0.12, 23.75]], // the line of light under 311
  [24.4, 1.2, 1.0, [0.95, 1.25, 25.9]], // the boards across 312
];
// The point the beam is on for a walker at s.
export function torchAim(s) {
  // between the things worth finding the beam is on one wall or the other a few steps ahead,
  // crossing the dark between them quickly
  const side = Math.tanh(2.2 * Math.sin(s * 0.5 + 2.2));
  const p = [0.95 * side, 1.1 + 0.3 * Math.sin(s * 0.83 + 0.5), s + 2.5];
  let rest = 1;
  const w = AIMS.map(([c, b, a]) => bump2(c, b, a, s));
  const sum = w.reduce((x, y) => x + y, 0);
  const k = sum > 1 ? 1 / sum : 1;
  const out = [0, 0, 0];
  AIMS.forEach(([, , , q], i) => {
    for (let j = 0; j < 3; j++) out[j] += w[i] * k * q[j];
    rest -= w[i] * k;
  });
  for (let j = 0; j < 3; j++) out[j] += rest * p[j];
  // the last door: the beam comes to its threshold and climbs the leaf, past the kicked bottom
  // rail and the handle, to the number. The number is the last thing lit.
  const end = smooth(25.5, 26.5, s);
  const t = smooth(26.2, 27.62, s);
  const q = [-0.3 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.2 * t), 0.05 + 1.61 * t, END - 0.09];
  for (let j = 0; j < 3; j++) out[j] = out[j] * (1 - end) + q[j] * end;
  // the hand is never still
  out[0] += 0.05 * slow(s, 1.7, 0.3, 2.1) * (1 - 0.6 * end);
  out[1] += 0.045 * slow(s, 2.1, 1.9, 0.4) * (1 - 0.6 * end);
  return out;
}
// The torch falters once, when the last ember has gone: a slow dip and a slow recovery (about
// two metres of walking), never a flicker.
export const torchLevel = (s) => 1 - 0.82 * bump(15.55, 0.95, s) * (0.8 + 0.2 * Math.cos((s - 15.55) * 5));
// Where the hand holds it, relative to the camera: right, down, forward (metres). Off the lens
// axis, so things cast shadows that are seen, and a surface the walker is close to is raked.
export const TORCH_HAND = [0.27, -0.3, -0.1];

// Where the walker is (x across the corridor) at s: never down the middle for long, close to
// the wall or the door the torch is on.
function walkerX(s) {
  let x = 0.035 * Math.sin((s * 2 * Math.PI) / 5.2 + 0.4) + 0.012 * Math.sin(s * 0.53 + 2.0);
  x += 0.34 * (1 - smooth(0.6, 3.4, s)); // starts on the right, looking across at 301
  x += 0.2 * bump(4.4, 1.6, s); // keeps to the right, looking down along the foot of the wall
  x += 0.36 * bump2(11.1, 1.5, 1.6, s); // goes round the open door 305
  x += 0.3 * bump2(16.6, 2.6, 1.4, s); // close along door 308
  x -= 0.2 * bump(22.0, 1.6, s);
  x += 0.22 * bump(24.6, 1.2, s);
  x += -0.3 * smooth(25.6, 27.2, s); // stops left of the last door: its frame and the wall beside it are in the spill
  return x;
}
const camAt = (s) => [walkerX(s), EYE + 0.011 * Math.sin((s * 2 * Math.PI) / 2.6) - 0.05 * bump(10.6, 1.2, s), s];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// How far the thing in the beam is from the walker, smoothed over a step.
function beamDistance(s) {
  let d = 0;
  for (const o of [-0.35, 0, 0.35]) d += dist3(torchAim(s + o), camAt(s + o)) / 3;
  return clamp(d, 0.7, 4.5);
}
// Exposure in stops: set for the hot spot, as a camera would. The hot spot of a torch on a wall
// two metres off is the reference; nearer things are stopped down, not all the way (they burn
// a little), further things opened up, not all the way (they sink).
export const exposureStops = (s) => 1.2 * Math.log2(beamDistance(s) / 2);

// The lens: wide open, focused on what the beam is on.
export const FSTOP = { desktop: 2.5, mobile: 2.5 };
export function focusDistance(s) {
  let f = clamp(dist3(torchAim(s - 0.1), camAt(s)), 0.6, 6);
  // two places where the thing looked at is not the point the beam is centred on (measured on
  // the frames: the distance at which it is sharpest): the handle of the open door 305, and the
  // edge of door 308 that will open
  f += (1.0 - f) * bump(10.44, 0.7, s);
  // (1.15 m: the casing the door closes against is as sharp as it gets, and whoever stands behind
  // the door is half a metre further back, soft. In focus, the stand-in read as a drawing.)
  f += (1.15 - f) * bump2(16.7, 0.9, 0.6, s);
  return f;
}

// Camera pose. The head follows the beam, a little late and not all the way: the hot spot is
// never dead centre. More of the way on the narrow phone frame, so the beam stays in it.
export function cameraPose(s, set) {
  const mobile = set === 'mobile';
  const [x, y] = camAt(s);
  const a = torchAim(s - 0.14);
  const yawT = Math.atan2(-(a[0] - x), a[2] - s);
  const pitchT = Math.atan2(a[1] - y, Math.hypot(a[0] - x, a[2] - s));
  // (at door 302 the head turns nearly all the way: the door and the wall foot fill the frame)
  const yaw = (mobile ? 0.95 : 0.74 + 0.18 * bump(4.3, 1.6, s)) * yawT + 0.012 * Math.sin(s * 0.71 + 0.3);
  // (at the last door the head stays lower than the beam: the number sits high in the frame)
  const pitch = (mobile ? 0.92 : 0.88) * (1 - 0.5 * smooth(26.2, 27.6, s)) * pitchT + 0.006 * Math.sin(s * 0.9 + 1.1);
  // hand held: the horizon is never level
  const roll = 0.03 + 0.012 * Math.sin((s * 2 * Math.PI) / 5.2 + 1.2) + 0.008 * Math.sin(s * 1.13 + 0.4);
  return { x, y, s, yaw, pitch, roll };
}

// Render sets. fov is vertical, in degrees.
export const SETS = {
  desktop: { w: 1600, h: 900, fov: 28, frames: 168, dir: 'd' }, // 47 degrees across: about a 42 mm lens
  mobile: { w: 900, h: 1800, fov: 72, frames: 112, dir: 'm' },
};
export const frameS = (set, i) => camS(i / (SETS[set].frames - 1));

// The scare. It plays in real time over a held walk frame: SCARE_AT is the camera distance
// that triggers it, each set snaps that to its nearest frame.
export const SCARE_DOOR = 308;
export const SCARE_AT = { desktop: 16.7, mobile: 16.8 };
export const SCARE_FPS = 24;
export const SCARE_FRAMES = 15; // 625 ms
export function scareFrameIndex(set) {
  const n = SETS[set].frames;
  let best = 0;
  for (let i = 1; i < n; i++) if (Math.abs(frameS(set, i) - SCARE_AT[set]) < Math.abs(frameS(set, best) - SCARE_AT[set])) best = i;
  return best;
}
// Door angle (radians) at scare frame j: opens fast, holds with a slow push, slams.
export function scareOpen(j) {
  const t = j / (SCARE_FRAMES - 1);
  const a = smooth(0, 0.2, t) * (0.86 + 0.14 * smooth(0.2, 0.7, t)) * (1 - smooth(0.84, 1, t));
  return a * ((globalThis.__fig ?? {}).open ?? 0.3);
}
// How far the head leans into the gap, 0..1.
export const scareLean = (j) => smooth(0.12, 0.55, j / (SCARE_FRAMES - 1));
// Where the walker's eye is while the door opens (local coordinates of door 308 are worked out
// from this in figure.js, to aim the face and put the catchlight in the eye).
export const scareEye = (set) => cameraPose(frameS(set, scareFrameIndex(set)), set);

export { clamp, smooth, bump, bump2 };
