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
