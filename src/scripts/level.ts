// Contact level: one value for the whole page. It changes the page tint (html[data-level]),
// the descriptive copy in the key section, and the matching field on the check-in card.
export function initLevel() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-level-input]'));
  if (!inputs.length) return;
  const apply = (value: string) => {
    document.documentElement.dataset.level = value;
    for (const i of inputs) i.checked = i.value === value;
    document.dispatchEvent(new CustomEvent('hotel:level', { detail: value }));
  };
  for (const i of inputs) {
    i.addEventListener('change', () => {
      if (i.checked) apply(i.value);
    });
  }
}
