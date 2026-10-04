// Opt-in ambience, generated with WebAudio. No audio files. Off until the visitor clicks.
// A low two-oscillator drone with slow beating, plus filtered noise as room tone.
export function initAudio() {
  const btn = document.querySelector<HTMLButtonElement>('[data-sound]');
  if (!btn) return;
  const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    btn.hidden = true;
    return;
  }

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let on = false;

  const build = () => {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const drone = ctx.createGain();
    drone.gain.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    drone.connect(lp).connect(master);
    for (const [freq, type] of [
      [55, 'sine'],
      [55.6, 'sine'],
      [82.4, 'triangle'],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = type === 'triangle' ? 0.12 : 0.45;
      o.connect(g).connect(drone);
      o.start();
    }

    // Brown-ish noise: the sound of an empty building.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.22;
    noise.connect(bp).connect(ng).connect(master);
    noise.start();

    // Very slow swell, 14 second period.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg).connect(drone.gain);
    lfo.start();
  };

  const label = () => {
    const { label: l, on: a, off: b } = btn.dataset;
    btn.setAttribute('aria-label', `${l}: ${on ? a : b}`);
    btn.setAttribute('aria-pressed', String(on));
  };

  btn.addEventListener('click', async () => {
    try {
      if (!ctx) build();
      if (!ctx || !master) return;
      on = !on;
      if (on) await ctx.resume();
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(on ? 0.16 : 0, now, on ? 1.2 : 0.3);
      label();
    } catch {
      on = false;
      label();
    }
  });

  // Never keep playing in a background tab.
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(document.hidden || !on ? 0 : 0.16, ctx.currentTime, 0.4);
  });
}

// Appended for the corridor: a dry creak and the latch as door 308 opens and shuts. Silent
// unless the visitor has turned the sound on (the button above is pressed).
export function doorCreak(seconds = 0.62) {
  const btn = document.querySelector<HTMLButtonElement>('[data-sound]');
  if (!btn || btn.getAttribute('aria-pressed') !== 'true') return;
  const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    // the visitor turned the sound on with a click, so the page may play; nudge it awake anyway
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 0.22;
    out.connect(ctx.destination);

    // creak: a slow pulse train (the hinge sticking and slipping) through the door's resonance
    const pulse = ctx.createOscillator();
    pulse.type = 'sawtooth';
    pulse.frequency.setValueAtTime(34, t0);
    pulse.frequency.linearRampToValueAtTime(62, t0 + 0.14);
    pulse.frequency.linearRampToValueAtTime(41, t0 + 0.24);
    const res = ctx.createBiquadFilter();
    res.type = 'bandpass';
    res.frequency.setValueAtTime(1150, t0);
    res.frequency.linearRampToValueAtTime(1620, t0 + 0.2);
    res.Q.value = 9;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0, t0);
    cg.gain.linearRampToValueAtTime(0.9, t0 + 0.03);
    cg.gain.linearRampToValueAtTime(0.5, t0 + 0.18);
    cg.gain.linearRampToValueAtTime(0, t0 + 0.27);
    pulse.connect(res).connect(cg).connect(out);
    pulse.start(t0);
    pulse.stop(t0 + 0.3);

    // the door shutting: a low thud and the click of the latch
    const t1 = t0 + Math.max(0.3, seconds - 0.07);
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 20261002;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    const thud = ctx.createBufferSource();
    thud.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(1.6, t1);
    tg.gain.exponentialRampToValueAtTime(0.001, t1 + 0.11);
    thud.connect(lp).connect(tg).connect(out);
    thud.start(t1);
    const click = ctx.createBufferSource();
    click.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.5, t1 + 0.012);
    kg.gain.exponentialRampToValueAtTime(0.001, t1 + 0.03);
    click.connect(hp).connect(kg).connect(out);
    click.start(t1 + 0.012);

    window.setTimeout(() => ctx.close().catch(() => {}), (seconds + 0.6) * 1000);
  } catch {
    // no sound is not an error
  }
}

// Faint electrical buzz for the loose letter of the sign (neon.ts calls this a few times a
// second). Silent unless the visitor has switched the sound on with the header button.
let buzzCtx: AudioContext | null = null;
let buzzGain: GainNode | null = null;
export function signBuzz(level: number, arc: boolean) {
  const on = !document.hidden && document.querySelector('[data-sound]')?.getAttribute('aria-pressed') === 'true';
  if (!buzzCtx) {
    if (!on) return;
    try {
      buzzCtx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      buzzGain = buzzCtx.createGain();
      buzzGain.gain.value = 0;
      const bp = buzzCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 0.8;
      const osc = buzzCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 100; // mains hum, second harmonic
      osc.connect(bp).connect(buzzGain).connect(buzzCtx.destination);
      osc.start();
    } catch {
      return;
    }
  }
  if (!buzzCtx || !buzzGain) return;
  if (on && buzzCtx.state === 'suspended') void buzzCtx.resume().catch(() => {});
  buzzGain.gain.setTargetAtTime(on ? 0.004 + 0.012 * level + (arc ? 0.035 : 0) : 0, buzzCtx.currentTime, 0.03);
}
