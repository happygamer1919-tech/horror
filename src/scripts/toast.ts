// One small status line for the whole page (see WaFloat.astro). Reused by the check-in
// card, the Telegram links and the floating button. It leaves by itself after 4 seconds.
const SHOW_MS = 4000;
let timer = 0;

export function showToast(text: string) {
  const el = document.querySelector<HTMLElement>('[data-toast]');
  if (!el || !text) return;
  window.clearTimeout(timer);
  el.textContent = text;
  el.classList.add('is-on');
  timer = window.setTimeout(() => {
    el.classList.remove('is-on');
    el.textContent = '';
  }, SHOW_MS);
}

// The fixed texts are rendered into the element in the page language.
export function toastText(key: 'telegram' | 'fail'): string {
  return document.querySelector<HTMLElement>('[data-toast]')?.dataset[key] ?? '';
}
