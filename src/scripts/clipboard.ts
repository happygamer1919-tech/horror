// Copy text from inside a click handler. Resolves true when the text reached the clipboard.
// The async API first; a hidden textarea and execCommand where it is missing or refused.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refused or the document lost focus: try the old way.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  // Inside an open modal dialog the rest of the page is inert, so the helper lives in the dialog.
  const host = document.querySelector<HTMLElement>('dialog[open]') ?? document.body;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px';
  host.appendChild(area);
  const active = document.activeElement as HTMLElement | null;
  let ok = false;
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  active?.focus?.({ preventScroll: true });
  return ok;
}
