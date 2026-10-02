// The one WebGL scene: fog lit by the neon sign, drawn with OGL.
// It renders at a small fixed internal size (fog is soft, so nobody can tell) which keeps
// it cheap on phones. If WebGL is missing, the CSS halo in Hero.astro stays in place.
import { Renderer, Program, Mesh, Triangle } from 'ogl';
import { still } from './env';
import { neonState } from './neon';
import { ticker } from './hero-hooks';

const VERT = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec2 uSign;
uniform float uSpread;
uniform float uGlow;
uniform vec3 uColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(11.3, 7.1);
    a *= 0.5;
  }
  return v;
}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 s = vec2(uSign.x * uAspect, uSign.y);
  vec2 d = (p - s) / uSpread;
  d.y *= 1.7;
  float halo = exp(-dot(d, d) * 1.6);
  float wide = exp(-length(d) * 1.1);
  float fog = fbm(p * 2.4 + vec2(uTime * 0.035, -uTime * 0.02));
  fog = fog * 0.75 + 0.25 * fbm(p * 5.2 - vec2(uTime * 0.05, 0.0));
  float light = clamp((halo * 0.5 + wide * 0.34) * (0.3 + 1.0 * fog) * uGlow, 0.0, 1.0);
  // Premultiplied alpha: the fog is laid over the page as light, without a blend mode.
  gl_FragColor = vec4(uColor * light, light);
}`;

export function initFog() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-fog]');
  const hero = document.getElementById('lobby');
  const facade = document.querySelector<HTMLElement>('[data-facade]');
  if (!canvas || !hero || !facade || still) return;

  // Ask for a hardware context first. On software renderers (no GPU) the shader would be
  // compiled and run on the CPU and block the page, so there the CSS halo is the right answer.
  const probe = canvas.getContext('webgl', {
    failIfMajorPerformanceCaveat: true,
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!probe) return;

  let renderer: InstanceType<typeof Renderer>;
  try {
    renderer = new Renderer({ canvas, dpr: 1, alpha: true, premultipliedAlpha: true, antialias: false, depth: false, webgl: 1, powerPreference: 'low-power' });
  } catch {
    return;
  }
  const gl = renderer.gl;
  if (!gl) return;

  const uniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uSign: { value: [0.5, 0.8] },
    uSpread: { value: 0.3 },
    uGlow: { value: 1 },
    uColor: { value: [1, 0.17, 0.15] },
  };
  const program = new Program(gl, { vertex: VERT, fragment: FRAG, uniforms });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

  const measure = () => {
    const h = hero.getBoundingClientRect();
    const f = facade.getBoundingClientRect();
    if (!h.width || !h.height) return;
    // Small buffer, stretched by CSS.
    const w = 200;
    renderer.setSize(w, Math.max(120, Math.round((w * h.height) / h.width)));
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    uniforms.uAspect.value = h.width / h.height;

    // Where the sign sits. The facade SVG is 600 x 900, "xMidYMin slice", sign centre at (300, 92).
    const scale = Math.max(f.width / 600, f.height / 900);
    const sx = f.left - h.left + f.width / 2;
    const sy = f.top - h.top + 92 * scale;
    uniforms.uSign.value = [sx / h.width, 1 - sy / h.height];
    uniforms.uSpread.value = (300 * scale) / h.height;
  };
  measure();
  window.addEventListener('resize', measure, { passive: true });

  const readColor = () => {
    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--neon-rgb').split(',').map((n) => Number(n) / 255);
    if (rgb.length === 3 && rgb.every((n) => Number.isFinite(n))) uniforms.uColor.value = rgb;
  };
  readColor();
  document.addEventListener('hotel:level', readColor);

  let visible = true;
  let glow = 1;
  // 30 fps is plenty for drifting fog. It shares the hero clock with the letter and the rain.
  const kick = () => ticker.add(frame);
  function frame(now: number) {
    if (!visible || document.hidden) return ticker.remove(frame);
    uniforms.uTime.value = now / 1000;
    // The fog answers the failing letter, but only a little: one letter of five. It reads
    // the low-passed level, never the raw flicker (see the safety note in neon.ts).
    glow += (0.82 + 0.18 * neonState.level - glow) * 0.3;
    uniforms.uGlow.value = glow;
    renderer.render({ scene: mesh });
  }
  new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
    if (visible) kick();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });

  kick();
  hero.classList.add('has-gl');
}
