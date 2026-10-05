// Experiments: each variant switches one suspected cause off without touching the source.
// Run one with  PERF_VARIANT=<name> PW_PORT=4334 npm run test:perf
// "base" is the site as built. Everything else is measurement only and never asserted.

export interface Variant {
  name: string;
  about: string;
  // Extra CSS added after load.
  css?: string;
  // Runs before any page script.
  init?: string;
}

// Returns no context for the matching canvas, so the module that owns it bails out.
const noContext = (attr: string, kinds: string[]) => `
(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    if (this.hasAttribute('${attr}') && ${JSON.stringify(kinds)}.includes(kind)) return null;
    return orig.call(this, kind, ...rest);
  };
})();`;

// Freezes inline style writes on an element (the JS keeps running, the style stays put).
const freezeStyle = (selector: string) => `
document.addEventListener('DOMContentLoaded', () => {
  for (const el of document.querySelectorAll('${selector}')) {
    Object.defineProperty(el, 'style', { value: document.createElement('div').style });
  }
});`;

// The corridor's own hook (src/scripts/corridor.ts): no codec, so no video is fetched or played.
const NO_CORRIDOR_VIDEO = `window.__corridorCodec = 'none';`;

const variants: Variant[] = [
  { name: 'base', about: 'The site as built.' },
  { name: 'no-torch', about: 'Flashlight overlay removed.', css: '.torch{display:none!important}' },
  {
    name: 'torch-static',
    about: 'Flashlight overlay present, but the beam does not move and darkness does not change.',
    css: '.torch{opacity:.7!important}',
    init: freezeStyle('.torch__beam'),
  },
  {
    name: 'torch-small',
    about:
      'Flashlight beam as a 200vw x 200vh layer (4 screens) instead of 300vmax square (19.5 screens), same picture: the gradient stops are the same lengths, given in vmax instead of percent.',
    css: `.torch__beam{--torch-px:16.5vmax;width:200vw!important;height:200vh!important;margin:-100vh 0 0 -100vw!important;
      background:radial-gradient(circle at center,rgba(4,3,3,0) 0,rgba(4,3,3,.1) calc(var(--torch-px)*.45),rgba(4,3,3,.62) var(--torch-px),rgba(4,3,3,.9) calc(var(--torch-px)*1.7),rgb(4,3,3) calc(var(--torch-px)*2.6))!important}
      @media (hover:none){.torch__beam{--torch-px:21vmax}}`,
  },
  {
    name: 'torch-dark-local',
    about: 'The --torch-dark variable is written on the .torch element instead of <html>, so a section change restyles one element, not the document.',
    init: `document.addEventListener('DOMContentLoaded', () => {
      const torch = document.querySelector('.torch');
      const root = document.documentElement;
      const orig = root.style.setProperty.bind(root.style);
      root.style.setProperty = (name, value, priority) => (name === '--torch-dark' && torch ? torch.style.setProperty(name, value, priority) : orig(name, value, priority));
    });`,
  },
  { name: 'no-grain', about: 'Film grain layer removed.', css: '.grain{display:none!important}' },
  { name: 'grain-static', about: 'Film grain present, not animated.', css: '.grain{animation:none!important}' },
  { name: 'no-tint-dim', about: 'Tint and idle dim layers removed.', css: '.tint,.dim{display:none!important}' },
  {
    name: 'no-overlays',
    about: 'All four fixed full-screen layers removed (torch, grain, tint, dim).',
    css: '.torch,.grain,.tint,.dim{display:none!important}',
  },
  { name: 'no-fog-blend', about: 'Hero fog canvas without mix-blend-mode.', css: '.hero__fog{mix-blend-mode:normal!important}' },
  { name: 'no-fog-gl', about: 'WebGL fog never starts (CSS halo stays).', init: noContext('data-fog', ['webgl', 'experimental-webgl', 'webgl2']) },
  { name: 'no-corridor', about: 'Corridor plays no video: its chapters are crossfades between stills.', init: NO_CORRIDOR_VIDEO },
  { name: 'no-cctv', about: 'CCTV feeds never draw.', init: noContext('data-feed', ['2d']) },
  {
    name: 'no-reveal',
    about: 'Scroll reveals shown at once, no transitions.',
    css: 'html.motion [data-reveal]{opacity:1!important;transform:none!important;transition:none!important}',
  },
  { name: 'no-neon', about: 'The dying letter keeps a fixed opacity and has no drop-shadow filter.', css: '[data-dying]{opacity:1!important} .hero *{filter:none!important}', init: freezeStyle('[data-dying]') },
  {
    name: 'floor',
    about: 'Everything above switched off at once: the cost of the plain document.',
    css: '.torch,.grain,.tint,.dim{display:none!important} .hero__fog{display:none!important} [data-dying]{opacity:1!important} .hero *{filter:none!important} html.motion [data-reveal]{opacity:1!important;transform:none!important;transition:none!important}',
    init: noContext('data-fog', ['webgl', 'experimental-webgl', 'webgl2']) + NO_CORRIDOR_VIDEO + noContext('data-feed', ['2d']),
  },
];

export const getVariant = (name: string): Variant => {
  const v = variants.find((x) => x.name === name);
  if (!v) throw new Error(`unknown PERF_VARIANT "${name}". Known: ${variants.map((x) => x.name).join(', ')}`);
  return v;
};
export const variantNames = variants.map((v) => v.name);
