// The floating "ask a question" control and every Telegram link on the page.
import { copyText } from './clipboard';
import { showToast, toastText } from './toast';

// Telegram cannot prefill a message for a phone link. So a click copies the message, says
// so, and lets the link open Telegram in a new tab by itself.
function initTelegram() {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-tg]');
    if (!link) return;
    const message = link.dataset.message ?? '';
    if (!message) return;
    copyText(message).then((ok) => showToast(toastText(ok ? 'telegram' : 'fail')));
  });
}

function initMenu() {
  const root = document.querySelector<HTMLElement>('[data-float]');
  const toggle = root?.querySelector<HTMLButtonElement>('[data-float-toggle]');
  const menu = root?.querySelector<HTMLElement>('[data-float-menu]');
  if (!root || !toggle || !menu) return;

  const set = (open: boolean) => {
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  const isOpen = () => root.classList.contains('is-open');

  toggle.addEventListener('click', () => set(!isOpen()));
  // A choice closes the menu; the link itself does the rest.
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    const inside = root.contains(document.activeElement);
    set(false);
    if (inside) toggle.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !root.contains(e.target as Node)) set(false);
  });
  root.addEventListener('focusout', (e) => {
    const next = (e as FocusEvent).relatedTarget as Node | null;
    if (isOpen() && next && !root.contains(next)) set(false);
  });
  // misc.ts hides the control on phones while the card is on screen.
  root.addEventListener('float:close', () => set(false));
}

export function initFloat() {
  initTelegram();
  initMenu();
}
