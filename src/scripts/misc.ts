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
