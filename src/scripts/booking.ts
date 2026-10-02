// The booking dialog: the EasyWeek widget in an iframe, under a bar that shows the copied
// summary line. The iframe gets its address only when the dialog opens, never at page load.
import { copyText } from './clipboard';

// After this long without a load event the "open in a new tab" fallback is put forward.
const SLOW_MS = 10000;

let dialog: HTMLDialogElement | null = null;
let trigger: HTMLElement | null = null;
let line = '';
let slowTimer = 0;
let stateTimer = 0;

const part = <T extends HTMLElement>(name: string) => dialog?.querySelector<T>(`[data-booking-${name}]`) ?? null;

function showCopyState(ok: boolean) {
  if (!dialog) return;
  const state = part('state');
  dialog.classList.toggle('is-manual', !ok);
  if (state) state.textContent = (ok ? dialog.dataset.copied : dialog.dataset.notCopied) ?? '';
  if (!ok) {
    // Could not copy: hand the line over selected, so one long press or Ctrl+C is enough.
    const el = part('line');
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }
}

function lockScroll(on: boolean) {
  const html = document.documentElement;
  if (on) {
    const bar = window.innerWidth - html.clientWidth;
    html.style.overflow = 'hidden';
    if (bar > 0) document.body.style.paddingRight = `${bar}px`;
  } else {
    html.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}

function onClose() {
  if (!dialog) return;
  window.clearTimeout(slowTimer);
  window.clearTimeout(stateTimer);
  // Drop the widget, so it stops loading and starts clean next time.
  part<HTMLIFrameElement>('frame')?.removeAttribute('src');
  dialog.classList.remove('is-slow', 'is-loaded', 'is-manual');
  lockScroll(false);
  trigger?.focus({ preventScroll: true });
  trigger = null;
}

export function initBooking() {
  dialog = document.querySelector<HTMLDialogElement>('[data-booking]');
  if (!dialog) return;
  const frame = part<HTMLIFrameElement>('frame');

  dialog.addEventListener('close', onClose);
  part('close')?.addEventListener('click', () => dialog?.close());
  // A click on the backdrop (the dialog element itself, outside its box) closes it too.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog?.close();
  });
  part('copy')?.addEventListener('click', () => {
    const state = part('state');
    if (state) state.textContent = '';
    copyText(line).then((ok) => {
      // Empty first, then filled a moment later, so a screen reader announces it again.
      window.clearTimeout(stateTimer);
      stateTimer = window.setTimeout(() => showCopyState(ok), 60);
    });
  });
  frame?.addEventListener('load', () => {
    if (!frame.getAttribute('src')) return;
    window.clearTimeout(slowTimer);
    dialog?.classList.remove('is-slow');
    dialog?.classList.add('is-loaded');
  });
}

// Called from the check-in card's submit handler, so the clipboard write still counts as
// part of the click. Returns false when the dialog cannot be used: the caller opens a tab.
export function openBooking(summary: string, from: HTMLElement | null): boolean {
  if (!dialog || typeof dialog.showModal !== 'function') return false;
  const url = dialog.dataset.url ?? '';
  const frame = part<HTMLIFrameElement>('frame');
  if (!url || !frame) return false;

  line = summary;
  trigger = from;
  const el = part('line');
  if (el) el.textContent = summary;
  const state = part('state');
  if (state) state.textContent = '';

  const copied = copyText(summary);
  lockScroll(true);
  dialog.showModal();
  copied.then(showCopyState);

  frame.src = url;
  window.clearTimeout(slowTimer);
  slowTimer = window.setTimeout(() => {
    if (!dialog?.classList.contains('is-loaded')) dialog?.classList.add('is-slow');
  }, SLOW_MS);
  return true;
}
