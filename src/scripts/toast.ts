// One small status line for the whole page (see WaFloat.astro). Reused by the check-in
// card, the Telegram links and the floating button. It leaves by itself after 4 seconds.
const SHOW_MS = 4000;
let timer = 0;

export function showToast(text: string) {
  const el = document.querySelector<HTMLElement>('[data-toast]');
  if (!el || !text) return;
  window.clearTimeout(timer);
  el.textContent = text;
  el.classList.remove('is-low');
  el.classList.add('is-on');
  // It sits under the header. When the booking button or a pressed "ask" link is up there
  // (a tall card on a phone), it goes to the bottom of the screen instead. One read, on a click.
  const t = el.getBoundingClientRect();
  const covers = ['[data-book]', '[data-ask-wa]', '[data-ask-tg]'].some((sel) => {
    const b = document.querySelector(sel)?.getBoundingClientRect();
    return !!b && b.width > 0 && t.top - 12 < b.bottom && b.top < t.bottom + 12 && t.left < b.right && b.left < t.right;
  });
  if (covers) el.classList.add('is-low');
  timer = window.setTimeout(() => {
    el.classList.remove('is-on');
    el.textContent = '';
  }, SHOW_MS);
}

// The fixed texts are rendered into the element in the page language.
export function toastText(key: 'telegram' | 'fail'): string {
  return document.querySelector<HTMLElement>('[data-toast]')?.dataset[key] ?? '';
}
