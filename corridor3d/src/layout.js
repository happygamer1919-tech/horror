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
export const LAMP_KIND = [
  { level: 1.0, warm: 0.0, drop: 0.13, dust: 0.3 },
  { level: 0.38, warm: 0.7, drop: 0.035, dust: 0.85, tilt: 0.09, lean: -0.14 }, // dim, orange, and hanging crooked
  { level: 0.8, warm: 0.3, drop: 0.16, dust: 0.3 },
  { level: 0, warm: 1, drop: -0.02, dust: 1, dead: true, bare: true },
  { level: 1.0, warm: 0.35, drop: 0.02, dust: 0.6 },
  { level: 0.7, warm: 0.2, drop: -0.03, dust: 0.5 },
  { level: 0.45, warm: 0.45, drop: 0.045, dust: 0.9 },
  { level: 0.6, warm: 0.22, drop: 0.01, dust: 0.55, aim: [-0.55, -0.9] },
];

// Camera position (s) at which each lamp dies. Far lamps first; the wave reaches the walker
// just after the scare door (lamp 4 hangs in front of it and is still alight while the door
// opens, and while the walker turns back to the corridor), then runs on behind him.
export const FAIL_AT = { 6: 2.4, 5: 5.2, 4: 17.5, 3: 17.8, 2: 18.1, 1: 18.4, 0: 18.75 };
export const FADE_LEN = 0.55; // metres of walking a lamp takes to die

export const SHOE_AT = { s: 6.7, x: 0.08 }; // the child's shoe: the nearest stretch of runner the first frame shows, lit by the first lamp
export const WALK_FROM = 0.35;
export const WALK_TO = 25.75;
export const EYE = 1.55;

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

// Lamp intensity 0..1 for a walker at distance s.
export function lampLevel(k, s) {
  const base = LAMP_KIND[k].level;
  if (k === LAST_LAMP) return base;
  if (LAMP_KIND[k].dead) return 0;
  const f = FAIL_AT[k];
  const t = clamp((s - f) / FADE_LEN, 0, 1);
  // not a clean fade: a dip, a short recovery, then out. Monotone enough that nothing strobes.
  const level = t <= 0 ? 1 : t >= 1 ? 0 : (1 - t) * (1 - t) * (0.55 + 0.45 * Math.cos(t * 5.2)) * (1 - smooth(0.75, 1, t));
  // lamp 4 is already tired when the walker reaches it
  const tired = k === 4 ? 1 - 0.08 * smooth(11.5, 15.8, s) : 1;
  return Math.max(0, level) * tired * base;
}

// The swinging lamp: angle in radians around the corridor axis (it swings across the corridor)
// and along it. Driven by the walk, so it stands still when the visitor stops scrolling.
export function swing(s) {
  const env = smooth(0.6, 3.5, s) * (1 - smooth(11, 15, s));
  return {
    across: 0.2 * env * Math.sin(s * 1.9 + 0.6),
    along: 0.07 * env * Math.sin(s * 1.9 * 0.5 + 1.7),
  };
}

// Exposure in stops relative to the lit corridor: the eye opens up when the lamps are gone.
export const exposureStops = (s) => 0.3 * smooth(5, 8, s) + 0.85 * smooth(11.5, 14.5, s) + 1.7 * smooth(17.3, 19.5, s) - 2.45 * smooth(20.6, 25.7, s);

// The lens: where it is focused (metres from the camera) for a walker at s. A corridor shot at
// night is taken nearly wide open, so what is close to the camera, the walls at the edge of the
// frame, is soft, and the focus follows what the walker looks at.
export const FSTOP = { desktop: 2.2, mobile: 2.4 };
export function focusDistance(s) {
  let f = 5.2 + 0.8 * Math.sin(s * 0.37);
  f += (2.3 - f) * bump(4.4, 1.3, s); // the shoe
  f += (1.75 - f) * bump(9.45, 1.3, s); // the clawed door
  f += (1.45 - f) * bump2(16.75, 1.6, 1.0, s); // door 308: the far jamb, where the gap opens
  f += (3.05 - f) * smooth(23.4, 25.6, s); // the last door
  return f;
}

// Camera pose. Slow sway and bob (long periods: frames are 15 to 25 cm apart, a real 0.7 m
// stride would alias into a shake), and small glances at the things worth seeing.
export function cameraPose(s, set) {
  const mobile = set === 'mobile';
  const bob = 0.011 * Math.sin((s * 2 * Math.PI) / 2.6);
  const sway = 0.035 * Math.sin((s * 2 * Math.PI) / 5.2 + 0.4) + 0.012 * Math.sin(s * 0.53 + 2.0);
  // hand held: the horizon is never quite level
  const roll = 0.02 + 0.006 * Math.sin((s * 2 * Math.PI) / 5.2 + 1.2) + 0.004 * Math.sin(s * 1.13 + 0.4) + 0.012 * smooth(23.6, 25.7, s);
  let yaw = 0.012 * Math.sin(s * 0.71 + 0.3) + 0.008 * Math.sin(s * 1.37);
  // (the head a little up at the start and under the swinging lamp: a lamp sits inside the frame, not on its top edge)
  let pitch = -0.045 + 0.006 * Math.sin(s * 0.9 + 1.1) + 0.04 * (1 - smooth(0.8, 3, s)) + 0.045 * bump(7.6, 1.4, s);
  // Nobody walks down the middle, and nobody holds a camera square to a corridor. The walk
  // starts close to the left wall (its near end soft at the edge of the frame), the head turned a
  // little to the right, so neither the vanishing point nor a lamp sits in the middle of the frame.
  const start = 1 - smooth(1.2, 6, s);
  let x = sway - 0.3 * start;
  yaw -= 0.075 * start;
  // under the swinging lamp the walker is already drifting right, to pass the open door, and
  // looks across at it: the right wall close at the edge of the frame
  x += 0.24 * bump(7.6, 2.2, s);
  yaw += 0.075 * bump(7.6, 2.0, s);
  // the shoe on the runner (props.js: s = SHOE_AT), low on the right, in the first pool of light
  yaw -= 0.05 * bump(4.4, 1.5, s);
  pitch -= (mobile ? 0.26 : 0.2) * bump(4.5, 1.7, s); // the tall frame has room to look down further
  // the scratched door hanging open on the left: the head turns to it and drops to the height a
  // child's hands reach, close enough to read the gouges, then the walker goes round it
  const claw = bump(9.45, 1.5, s);
  yaw += (mobile ? 0.3 : 0.34) * claw;
  pitch -= (mobile ? 0.16 : 0.2) * claw;
  x += 0.4 * bump(10.7, 2.7, s) - 0.06 * claw;
  // drift towards the right wall and turn the head to door 308 before it moves. On the wide
  // frame the door stays at the side and the corridor stays the subject; the tall phone frame is
  // narrow, so it turns further and the gap is near the middle. After the door has shut the head
  // comes back to the corridor quickly, before the lamp over it dies: never a dark wall filling
  // the picture.
  const L = globalThis.__look308 ?? {};
  x += (L.x ?? 0.22) * bump2(L.xc ?? 16.6, L.xw ?? 2.6, L.xa ?? 1.4, s);
  const look = bump2(L.c ?? 16.75, L.w ?? 2.4, L.wa ?? 1.0, s);
  yaw -= (mobile ? (L.ym ?? 0.74) : (L.yd ?? 0.39)) * look;
  pitch -= (mobile ? (L.pm ?? 0.06) : (L.pd ?? 0.03)) * look;
  // the line of light under 311, low on the left
  yaw += 0.05 * bump(21.6, 1.5, s);
  pitch -= 0.03 * bump(21.6, 1.5, s);
  // the boards on the right
  yaw -= 0.06 * bump(23.9, 1.4, s);
  // settle on the last door: standing a little right of it, the shoulders not square to it
  const end = smooth(23.6, 25.7, s);
  // (well to the right of it, by the boarded door, the head turned left to it: the right wall
  // close and soft at the edge of the frame, the door off centre and lit from one side)
  yaw = yaw * (1 - end) + 0.13 * end;
  x = x * (1 - 0.8 * end) + 0.34 * end;
  pitch += 0.02 * end;
  return { x, y: EYE + bob, s, yaw, pitch, roll };
}

// Render sets. fov is vertical, in degrees.
export const SETS = {
  desktop: { w: 1600, h: 900, fov: 33, frames: 168, dir: 'd' }, // 55 degrees across: about a 35 mm lens
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
