// One object for tests, screenshots and the curious: window.__hero.
// The hero modules hang their state and a few "force this now" switches on it.
export interface HeroHooks {
  torch?: { x: number; y: number; r: number; touched: boolean };
  e?: {
    readonly mode: string;
    readonly level: number;
    readonly slow: number;
    readonly segs: number[];
    force: (what: 'arc' | 'dying' | 'run') => void;
    hold: (pose: 'normal' | 'arc' | 'ember' | null) => void;
  };
  figure?: { readonly state: string; readonly lit: boolean; set: (s: 'far' | 'near' | 'gone') => void };
  storm?: { readonly count: number; readonly active: boolean; strike: () => void; hold: (on: boolean) => void };
  rain?: { readonly running: boolean; readonly drops: number };
}

const w = window as unknown as { __hero?: HeroHooks };
export const hooks: HeroHooks = (w.__hero ??= {});
