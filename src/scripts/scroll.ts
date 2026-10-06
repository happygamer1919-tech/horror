// Scrolling.
//
// The browser's own scroll, on every device. Nothing here listens to touch or wheel and nothing
// calls preventDefault: the one place the page is held, the corridor while its clip plays,
// does it without either (corridor.ts). (The site used Lenis on mouse and trackpad until the
// corridor became video. Lenis registers wheel and touch listeners with `passive: false`,
// which makes the browser ask the page's JavaScript before it may move the page; measured in
// docs/perf-notes.md.)
// ScrollTrigger follows native scroll events on its own.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { still } from './env';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

// The primary input is a finger: no hover, or a coarse pointer.
export const touchFirst = window.matchMedia('(hover: none), (pointer: coarse)').matches;

export function initScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (still) return;
  initNativeAnchors();
}

// In-page links ("Check in", "Back to top") glide instead of jumping.
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
