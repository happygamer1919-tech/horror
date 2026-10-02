// The dying letter of the HOTEL sign.
// Safety rule: never more than 3 flashes per second. Every state change is at least
// MIN_GAP ms after the previous one, which caps the sign at 1.25 flashes per second.
import { still } from './env';

const MIN_GAP = 400;

// Smooth 1D value noise, used for the faint brightness wobble (not a flash).
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (t: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
};

export const neonState = { level: 1 };

export function initNeon() {
  const el = document.querySelector<SVGGElement>('[data-dying]');
  if (!el || still) return;

  let on = true;
  let nextChange = performance.now() + 1800;
  let burst = 0;
  let visible = true;

  const hero = document.getElementById('lobby');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver((e) => {
      visible = e[0].isIntersecting;
      if (visible) kick();
    }).observe(hero);
  }

  let raf = 0;
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  function frame(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (now >= nextChange) {
      on = !on;
      if (on) {
        // Stay lit for a while, or relight briefly as part of a short stutter.
        if (burst > 0) {
          burst--;
          nextChange = now + MIN_GAP + Math.random() * 250;
        } else {
          nextChange = now + 1600 + Math.random() * 5200;
          if (Math.random() < 0.35) burst = 1;
        }
      } else {
        nextChange = now + MIN_GAP + Math.random() * (burst > 0 ? 200 : 900);
      }
    }
    const wobble = 0.9 + 0.1 * noise(now / 180);
    const level = on ? wobble : 0.06;
    neonState.level = level;
    el!.style.opacity = level.toFixed(3);
    kick();
  }
  kick();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });
}
