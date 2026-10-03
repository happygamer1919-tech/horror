// Scrolling.
//
// Pointer devices (mouse, trackpad): Lenis smooth scroll wired into GSAP's ticker, so
// ScrollTrigger and Lenis share one clock.
//
// Touch devices: the browser's own scroll, untouched. Lenis listens to touchstart, touchmove
// and touchend with `passive: false`, which makes the browser ask the page's JavaScript before
// it may move the page under a finger. Measured in docs/perf-notes.md: with Lenis every scroll
// frame on a phone depended on the main thread, without it none does. Lenis never smoothed
// touch scrolling here anyway (syncTouch was off), so nothing visible is lost.
// ScrollTrigger follows native scroll events on its own, and the corridor pin is CSS sticky.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { still } from './env';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

// The primary input is a finger: no hover, or a coarse pointer.
export const nativeScroll = window.matchMedia('(hover: none), (pointer: coarse)').matches;

export function initScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (still) return;
  if (nativeScroll) {
    initNativeAnchors();
    return;
  }
  // Loaded on demand, so phones never download or parse it.
  import('lenis')
    .then(({ default: Lenis }) => {
      const lenis = new Lenis({ lerp: 0.12, anchors: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    })
    .catch(() => {
      // Without the library the page scrolls natively, which is a complete experience.
    });
}

// In-page links ("Check in", "Back to top") glide instead of jumping, as they did with Lenis.
// The browser does the work: the link is followed normally (hash, focus order, :target and
// scroll-padding all stay native) and only the scroll behaviour is smooth while it travels.
function initNativeAnchors() {
  const root = document.documentElement;
  let timer = 0;
  const release = () => {
    window.clearTimeout(timer);
    root.style.removeProperty('scroll-behavior');
    window.removeEventListener('scrollend', release);
  };
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank') return;
      const url = new URL(link.href, window.location.href);
      if (url.host !== window.location.host || url.pathname !== window.location.pathname || !url.hash) return;
      release();
      root.style.setProperty('scroll-behavior', 'smooth');
      window.addEventListener('scrollend', release, { once: true });
      // Browsers without scrollend, or a link to where the page already is.
      timer = window.setTimeout(release, 2500);
    },
    { capture: true },
  );
}
