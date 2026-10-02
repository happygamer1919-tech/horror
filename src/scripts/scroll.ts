// Lenis smooth scroll wired into GSAP's ticker, so ScrollTrigger and Lenis share one clock.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { still } from './env';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export function initScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (still) return;
  const lenis = new Lenis({ lerp: 0.12, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
