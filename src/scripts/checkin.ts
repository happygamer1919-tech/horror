// Check-in card and gift voucher. There is no backend: submitting opens WhatsApp with a
// prefilled message. The booking is a request, the desk confirms it by phone.

// Fills {tokens}. A line whose only token is empty (an optional field) is dropped.
export function fillTemplate(template: string, values: Record<string, string>) {
  return template
    .split('\n')
    .filter((line) => {
      const tokens = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      return tokens.length === 0 || tokens.some((k) => (values[k] ?? '') !== '');
    })
    .map((line) => line.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? ''))
    .join('\n');
}

export function buildWhatsAppUrl(phone: string, template: string, values: Record<string, string>) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(fillTemplate(template, values))}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

function openWhatsApp(form: HTMLFormElement, url: string) {
  form.dataset.waUrl = url;
  const win = window.open(url, '_blank', 'noopener');
  // Some in-app browsers block new windows: fall back to the same tab.
  if (win === null) {
    window.setTimeout(() => {
      if (!document.hidden) window.location.href = url;
    }, 400);
  }
}

export function initCheckin() {
  const form = document.querySelector<HTMLFormElement>('[data-checkin]');
  if (!form) return;

  const date = form.querySelector<HTMLInputElement>('[data-min-today]');
  if (date) {
    const d = new Date();
    date.min = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Live total for the selected team size.
  const prices: Record<string, number> = JSON.parse(form.dataset.prices ?? '{}');
  const currency = form.dataset.currency ?? '';
  const team = form.querySelector<HTMLInputElement>('input[name="team"]');
  const out = form.querySelector<HTMLOutputElement>('[data-total]');
  const totalText = () => {
    const price = prices[String(Number(team?.value))];
    return price ? `${price} ${currency}` : '';
  };
  const showTotal = () => {
    if (out) out.textContent = totalText() || '...';
  };
  team?.addEventListener('input', showTotal);
  showTotal();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const get = (k: string) => String(data.get(k) ?? '').trim();
    const [y, m, d] = get('date').split('-');
    const level = form.querySelector<HTMLInputElement>('input[name="level"]:checked');
    openWhatsApp(
      form,
      buildWhatsAppUrl(form.dataset.wa ?? '', form.dataset.template ?? '', {
        date: y && m && d ? `${d}.${m}.${y}` : get('date'),
        time: get('time'),
        team: get('team'),
        total: totalText(),
        language: get('language'),
        level: level?.dataset.name ?? '',
        name: get('name'),
        phone: get('phone'),
        comment: get('comment').replace(/\s+/g, ' '),
      }),
    );
  });
}

export function initVoucher() {
  const form = document.querySelector<HTMLFormElement>('[data-voucher]');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    openWhatsApp(
      form,
      buildWhatsAppUrl(form.dataset.wa ?? '', form.dataset.template ?? '', {
        team: String(data.get('team') ?? ''),
        recipient: String(data.get('recipient') ?? '').trim(),
      }),
    );
  });
}
