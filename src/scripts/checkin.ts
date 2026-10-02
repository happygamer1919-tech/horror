// Check-in card. There is no backend: submitting opens WhatsApp with a prefilled message.

export function buildWhatsAppUrl(phone: string, template: string, values: Record<string, string>) {
  const text = template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function initCheckin() {
  const form = document.querySelector<HTMLFormElement>('[data-checkin]');
  if (!form) return;

  const date = form.querySelector<HTMLInputElement>('[data-min-today]');
  if (date) {
    const d = new Date();
    date.min = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const get = (k: string) => String(data.get(k) ?? '').trim();
    const [y, m, d] = get('date').split('-');
    const level = form.querySelector<HTMLInputElement>('input[name="level"]:checked');
    const url = buildWhatsAppUrl(form.dataset.wa ?? '', form.dataset.template ?? '', {
      date: y && m && d ? `${d}.${m}.${y}` : get('date'),
      time: get('time'),
      team: get('team'),
      language: get('language'),
      level: level?.dataset.name ?? get('level'),
      name: get('name'),
      phone: get('phone'),
    });
    form.dataset.waUrl = url;
    const win = window.open(url, '_blank', 'noopener');
    // Some in-app browsers block new windows: fall back to the same tab.
    if (win === null) {
      window.setTimeout(() => {
        if (!document.hidden) window.location.href = url;
      }, 400);
    }
  });
}
