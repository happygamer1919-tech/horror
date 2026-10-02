import { still } from './env';

export function initReveal() {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (still || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
  );
  items.forEach((el) => io.observe(el));
}
