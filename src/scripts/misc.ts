// Small behaviours that do not deserve their own module.

// Today's date in the registry: the newest line in the book is the visitor's.
export function initToday() {
  const cells = document.querySelectorAll<HTMLElement>('[data-today]');
  if (!cells.length) return;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const text = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  cells.forEach((c) => (c.textContent = text));
}

// The tab title changes while the tab is in the background.
export function initTitle() {
  const { title, hiddenTitle } = document.body.dataset;
  if (!title || !hiddenTitle) return;
  document.addEventListener('visibilitychange', () => {
    document.title = document.hidden ? hiddenTitle : title;
  });
}

// Mobile "Book" bar: away over the hero and while the check-in card is on screen.
export function initSticky() {
  const bar = document.querySelector<HTMLElement>('[data-sticky]');
  const hero = document.getElementById('lobby');
  const card = document.getElementById('checkin');
  if (!bar || !hero || !card || !('IntersectionObserver' in window)) return;
  // On phones the floating "ask a question" control steps aside while the card is on
  // screen: the card has its own WhatsApp and Telegram links, and nothing covers a field.
  const float = document.querySelector<HTMLElement>('[data-wa-float]');
  const state = { hero: true, card: false };
  const update = () => {
    bar.classList.toggle('is-away', state.hero || state.card);
    if (!float) return;
    if (state.card && !float.classList.contains('is-away')) float.dispatchEvent(new Event('float:close'));
    float.classList.toggle('is-away', state.card);
  };
  update();
  new IntersectionObserver((e) => {
    state.hero = e[0].isIntersecting;
    update();
  }, { threshold: 0.25 }).observe(hero);
  new IntersectionObserver((e) => {
    state.card = e[0].isIntersecting;
    update();
  }, { threshold: 0.12 }).observe(card);
}

// "Do not disturb" hanger in the footer: click to turn it over.
export function initHanger() {
  const btn = document.querySelector<HTMLButtonElement>('[data-hanger]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
  });
}
