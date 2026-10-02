// Preloader: the CSS runs it and clears it. JS only adds skip and the once-per-session rule.
export function initLift() {
  const lift = document.querySelector<HTMLElement>('[data-lift]');
  if (!lift) return;
  try {
    sessionStorage.setItem('hotel:lift', '1');
  } catch {
    /* private mode: the lift simply plays again */
  }
  const skip = () => {
    lift.classList.add('is-skipped');
    window.removeEventListener('keydown', skip);
  };
  lift.addEventListener('click', skip);
  window.addEventListener('keydown', skip);
  window.setTimeout(skip, 1500);
}
