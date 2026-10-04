// Check-in card. There is no backend. The card keeps what the booking widget does not ask
// for (team size, level, game language), shows the live total, and turns them into one
// summary line. "Book a time slot" copies that line and opens the widget; the guest pastes
// it into the widget's comment field. WhatsApp and Telegram carry the same line.
// The booking button is off until the team size is a whole number inside the allowed range
// and a level is chosen; a short prompt next to it says so.
import { copyText } from './clipboard';
import { openBooking } from './booking';

export interface SummaryLabels {
  team: string;
  level: string;
  language: string;
  total: string;
}
export type SummaryValues = Partial<Record<keyof SummaryLabels, string>>;

const ORDER: (keyof SummaryLabels)[] = ['team', 'level', 'language', 'total'];

// "Team: 4 - Level: No electroshock - Language: English - Total: 1200 MDL".
// A part without a value is left out.
export function summaryLine(labels: SummaryLabels, values: SummaryValues): string {
  return ORDER.filter((k) => values[k])
    .map((k) => `${labels[k]}: ${values[k]}`)
    .join(' - ');
}

export function buildWhatsAppUrl(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function initCheckin() {
  const form = document.querySelector<HTMLFormElement>('[data-checkin]');
  if (!form) return;

  const labels: SummaryLabels = JSON.parse(form.dataset.labels ?? '{}');
  const prices: Record<string, number> = JSON.parse(form.dataset.prices ?? '{}');
  const currency = form.dataset.currency ?? '';
  const team = form.querySelector<HTMLInputElement>('input[name="team"]');
  const language = form.querySelector<HTMLSelectElement>('select[name="language"]');
  const out = form.querySelector<HTMLOutputElement>('[data-total]');
  const wa = form.querySelector<HTMLAnchorElement>('[data-ask-wa]');
  const tg = form.querySelector<HTMLAnchorElement>('[data-ask-tg]');
  const book = form.querySelector<HTMLButtonElement>('[data-book]');
  const prompt = form.querySelector<HTMLElement>('[data-book-prompt]');
  const hasLevels = form.querySelector('input[name="level"]') !== null;

  // A whole number inside min..max of the field. The field starts empty: the guest chooses.
  const teamOk = () => {
    const raw = team?.value.trim() ?? '';
    const n = Number(raw);
    return raw !== '' && Number.isInteger(n) && n >= Number(team?.min) && n <= Number(team?.max);
  };
  // No default level: the team chooses. Without the selector there is nothing to choose.
  const levelOk = () => !hasLevels || form.querySelector('input[name="level"]:checked') !== null;

  const totalText = () => {
    const price = prices[String(Number(team?.value))];
    return price ? `${price} ${currency}` : '';
  };
  const values = (): SummaryValues => {
    const total = totalText();
    const level = form.querySelector<HTMLInputElement>('input[name="level"]:checked');
    return {
      // A team size outside the price list is not a team size.
      team: total ? String(Number(team?.value)) : '',
      level: level?.dataset.name ?? '',
      language: language?.value ?? '',
      total,
    };
  };

  // The total and both "ask a question" links follow the card as it is filled in. They do
  // not wait for a valid card: a guest may ask before choosing a level.
  const sync = () => {
    // No valid team size, no price: the neutral text the page was rendered with.
    if (out) out.textContent = totalText() || (out.dataset.empty ?? '...');
    const message = [form.dataset.hello ?? '', summaryLine(labels, values())].filter(Boolean).join('\n');
    if (wa) wa.href = buildWhatsAppUrl(form.dataset.wa ?? '', message);
    if (tg) tg.dataset.message = message;
    if (book) {
      const ready = teamOk() && levelOk();
      book.disabled = !ready;
      if (prompt) {
        // Hidden, not removed: the line stays, so the card does not jump. The description
        // is dropped with it, or a screen reader would still read the hidden prompt.
        prompt.classList.toggle('is-off', ready);
        if (ready) book.removeAttribute('aria-describedby');
        else book.setAttribute('aria-describedby', prompt.id);
      }
    }
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  // The level can also be picked in the key section, see level.ts.
  document.addEventListener('hotel:level', sync);
  // A page restored from the back/forward cache comes back with its fields as they were.
  window.addEventListener('pageshow', sync);
  sync();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const line = summaryLine(labels, values());
    form.dataset.summary = line;
    const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
    if (openBooking(line, submitter ?? form.querySelector<HTMLElement>('[type="submit"]'))) return;
    // No dialog support: copy the line and open the widget in a new tab.
    const url = form.dataset.slots ?? '';
    copyText(line);
    if (url) window.open(url, '_blank', 'noopener');
  });
}
