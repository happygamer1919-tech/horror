// Level: one value for the whole page. Picking it at the desk (key section) preselects it
// on the check-in card, and the other way round. Nothing else changes: the site shows the
// names of the levels and never describes or hints at what a level contains.
export function initLevel() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-level-input]'));
  if (!inputs.length) return;
  const apply = (value: string) => {
    for (const i of inputs) i.checked = i.value === value;
    document.dispatchEvent(new CustomEvent('hotel:level', { detail: value }));
  };
  for (const i of inputs) {
    i.addEventListener('change', () => {
      if (i.checked) apply(i.value);
    });
  }
}
