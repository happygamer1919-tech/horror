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

// One shared clock for the hero's drawing loops (letter, rain, fog): about 30 ticks a
// second, all on the same frames. Three loops each skipping frames on their own would
// take turns and keep the page producing 60 frames a second for no visible gain.
type Tick = (now: number) => void;
const subs = new Set<Tick>();
let raf = 0;
let lastTick = 0;
const loop = (now: number) => {
  raf = 0;
  if (!subs.size) return;
  if (now - lastTick >= 30) {
    lastTick = now;
    for (const fn of Array.from(subs)) fn(now);
  }
  if (subs.size) raf = requestAnimationFrame(loop);
};
export const ticker = {
  add(fn: Tick) {
    subs.add(fn);
    if (!raf) raf = requestAnimationFrame(loop);
  },
  remove(fn: Tick) {
    subs.delete(fn);
  },
};
