export const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const touch = window.matchMedia('(hover: none)').matches;

export const once = (key: string): boolean => {
  // true the first time per browser session, false afterwards.
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
};
