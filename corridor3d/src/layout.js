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

// Camera position (s) at which each lamp dies. Far lamps first; the wave reaches the walker
// just after the scare door (lamp 4 hangs in front of it), then runs on behind him.
export const FAIL_AT = { 6: 2.4, 5: 5.2, 4: 16.0, 3: 16.5, 2: 16.9, 1: 17.3, 0: 17.7 };
export const FADE_LEN = 0.55; // metres of walking a lamp takes to die

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

// Walk progress 0..1 to distance. Constant pace, slowing to a stop in front of the last door.
const KNEE = 0.8;
const pace = (p) => (p < KNEE ? p : KNEE + (p - KNEE) - (0.75 * (p - KNEE) * (p - KNEE)) / (2 * (1 - KNEE)));
export const camS = (p) => WALK_FROM + (WALK_TO - WALK_FROM) * (pace(clamp(p, 0, 1)) / pace(1));

// Lamp intensity 0..1 for a walker at distance s.
export function lampLevel(k, s) {
  if (k === LAST_LAMP) return 1;
  const f = FAIL_AT[k];
  const t = clamp((s - f) / FADE_LEN, 0, 1);
  // not a clean fade: a dip, a short recovery, then out. Monotone enough that nothing strobes.
  const level = t <= 0 ? 1 : t >= 1 ? 0 : (1 - t) * (1 - t) * (0.55 + 0.45 * Math.cos(t * 5.2)) * (1 - smooth(0.75, 1, t));
  // lamp 4 is already tired when the walker reaches it
  const tired = k === 4 ? 1 - 0.22 * smooth(11.5, 14, s) : 1;
  return Math.max(0, level) * tired;
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
export const exposureStops = (s) => 0.25 * smooth(5, 8, s) + 3.0 * smooth(16.0, 18.4, s) - 2.45 * smooth(20.2, 25.7, s);

// Camera pose. Slow sway and bob (long periods: frames are 15 to 25 cm apart, a real 0.7 m
// stride would alias into a shake), and small glances at the things worth seeing.
export function cameraPose(s, set) {
  const mobile = set === 'mobile';
  const bob = 0.011 * Math.sin((s * 2 * Math.PI) / 2.6);
  const sway = 0.035 * Math.sin((s * 2 * Math.PI) / 5.2 + 0.4) + 0.012 * Math.sin(s * 0.53 + 2.0);
  const roll = 0.0075 * Math.sin((s * 2 * Math.PI) / 5.2 + 1.2);
  let yaw = 0.012 * Math.sin(s * 0.71 + 0.3) + 0.008 * Math.sin(s * 1.37);
  let pitch = -0.045 + 0.006 * Math.sin(s * 0.9 + 1.1);
  let x = sway;
  // the shoe, low on the right
  yaw -= 0.04 * bump(5.2, 2.0, s);
  pitch -= 0.17 * bump(5.2, 2.3, s);
  // the scratched door hanging open on the left: look at it, then walk round it
  yaw += 0.1 * bump(9.0, 1.6, s);
  x += 0.4 * bump(10.7, 2.7, s);
  // drift left and look right towards door 308 before it moves
  x -= 0.2 * bump(15.2, 2.6, s);
  yaw -= (mobile ? 0.19 : 0.1) * bump(15.35, 1.9, s);
  // the line of light under 311, low on the left
  yaw += 0.05 * bump(21.6, 1.5, s);
  pitch -= 0.03 * bump(21.6, 1.5, s);
  // the boards on the right
  yaw -= 0.06 * bump(23.9, 1.4, s);
  // settle on the last door
  const end = smooth(23.6, 25.7, s);
  yaw *= 1 - end;
  x *= 1 - 0.8 * end;
  pitch += 0.03 * end;
  return { x, y: EYE + bob, s, yaw, pitch, roll };
}

// Render sets. fov is vertical, in degrees.
export const SETS = {
  desktop: { w: 1600, h: 900, fov: 43.5, frames: 168, dir: 'd' },
  mobile: { w: 720, h: 1440, fov: 80, frames: 112, dir: 'm' },
};
export const frameS = (set, i) => camS(i / (SETS[set].frames - 1));

// The scare. It plays in real time over a held walk frame: SCARE_AT is the camera distance
// that triggers it, each set snaps that to its nearest frame.
export const SCARE_DOOR = 308;
export const SCARE_AT = { desktop: 15.3, mobile: 15.2 };
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
  return a * 0.235;
}
// How far the head leans into the gap, 0..1.
export const scareLean = (j) => smooth(0.12, 0.55, j / (SCARE_FRAMES - 1));

export { clamp, smooth, bump };
