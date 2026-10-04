// The path of the light on touch screens before the first touch: on from the first paint,
// wandering slowly over the hero, never still.
//
// Two closed loops are added together. Loop A is a tall ellipse around the upper half of
// the screen: it starts over the lit room, passes under the sign, comes down the right side
// of the facade, crosses the copy and climbs back. Loop B is a small ellipse walked the other
// way round. Their periods are unrelated (37 s and 13 s), so the combined path repeats only
// after 8 minutes.
//
// Never still: loop B is always slower than loop A in at least one axis, on every screen
// shape (both are sized in percent of the viewport), so the two can never cancel:
//   (B.rx * wB / (A.rx * wA))^2 + (B.ry * wB / (A.ry * wA))^2 = 0.47, which is below 1.
//
// One source for both sides: Base.astro prints these loops as CSS keyframes, so the
// compositor moves the light without any script, and torch.ts reads the same numbers to
// know where the light is (for the rain, the lit room, the curtain and window.__hero).
// No DOM here: the file is also imported at build time.

interface Loop {
  name: string;
  seconds: number;
  steps: number;
  // Centre and radii in percent of the viewport width (x) and height (y).
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  // Start angle in degrees (0 = right, 90 = down) and direction (1 = clockwise on screen).
  start: number;
  turn: 1 | -1;
}

const A: Loop = { name: 'torch-drift-a', seconds: 37, steps: 32, cx: 50, cy: 40, rx: 30, ry: 21, start: -135, turn: 1 };
const B: Loop = { name: 'torch-drift-b', seconds: 13, steps: 16, cx: 0, cy: 0, rx: 6, ry: 2.8, start: 90, turn: -1 };

const round = (n: number) => Math.round(n * 100) / 100;

// The loop as a closed polygon: steps + 1 points, the last one equal to the first. The
// keyframes and the script both interpolate linearly between the same rounded points, so
// the script's position is the position on the screen.
const points = (l: Loop): [number, number][] =>
  Array.from({ length: l.steps + 1 }, (_, i) => {
    const a = ((l.start + (l.turn * 360 * (i % l.steps)) / l.steps) * Math.PI) / 180;
    return [round(l.cx + l.rx * Math.cos(a)), round(l.cy + l.ry * Math.sin(a))];
  });

const PA = points(A);
const PB = points(B);

const at = (l: Loop, pts: [number, number][], ms: number): [number, number] => {
  const turns = ms / 1000 / l.seconds;
  const p = (turns - Math.floor(turns)) * l.steps;
  const i = Math.min(l.steps - 1, Math.floor(p));
  const f = p - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
};

// Where the light is, as a fraction of the viewport (0 to 1), `msA` and `msB` milliseconds
// into loop A and loop B.
export function driftAt(msA: number, msB: number): { x: number; y: number } {
  const a = at(A, PA, msA);
  const b = at(B, PB, msB);
  return { x: (a[0] + b[0]) / 100, y: (a[1] + b[1]) / 100 };
}

const keyframes = (l: Loop, pts: [number, number][]) =>
  `@keyframes ${l.name}{${pts.map(([x, y], i) => `${Number(((i / l.steps) * 100).toFixed(4))}%{transform:translate3d(${x}%,${y}%,0)}`).join('')}}`;

// The CSS for Base.astro. Percentages are of the wrapper, which is the size of the viewport
// (.torch__drift, global.css). Touch screens only; html.torch-js (script has the light) and
// reduced motion switch it off in global.css.
export const driftCss =
  keyframes(A, PA) +
  keyframes(B, PB) +
  `@media (hover:none){.torch__drift{animation:${A.name} ${A.seconds}s linear infinite}.torch__drift .torch__drift{animation:${B.name} ${B.seconds}s linear infinite}}`;

export const DRIFT_NAMES = { a: A.name, b: B.name };
