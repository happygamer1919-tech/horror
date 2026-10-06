// The corridor. A walk down the third floor by torchlight, made offline from generated video
// (corridor-src/SOURCES.md, scripts/corridor-video.mjs) and shown as one clip of nine seconds,
// from door 301 to the last door, 313. Everywhere else the visitor scrolls as they like; this
// is the one place the page takes over: when the section reaches the top of the screen the
// page is held there, the clip plays over the whole screen, and the page is let go and glides
// on to the next section. Once per browser session. After that the corridor is a section like
// any other, one screen tall, showing the last door, with a button to play the walk again.
//
// How it works
//   - The catch. While the corridor has not been seen and the page is above it, a passive
//     scroll listener (and an IntersectionObserver, for a browser that is slow with scroll
//     events) watches for its top edge reaching the top of the screen on the way down. At that
//     moment the stage is made fixed over the whole screen, the page is held, the scroll
//     position is put exactly on the corridor's top, and the clip plays. A fling that would
//     have carried the page screens further ends there. Only a scroll the visitor is making
//     is caught (a finger, a wheel, a key): a link that glides past and a jump made by script
//     are let through, and so is anybody coming up from below.
//   - The hold. Nothing here calls preventDefault and no listener is anything but passive.
//     The page is held the old way that also holds on an iPhone: the body is taken out of the
//     flow at the place it was scrolled to (position fixed, top minus that place), so there
//     is nothing left to scroll. Letting go puts the scroll position back at once.
//   - The hold is short and bounded: it ends with the clip, with Skip, Escape, a second strong
//     swipe or a new burst of the wheel, when the tab is hidden, and in any case one second
//     after the clip should have ended (a clip that stalls or will not decode).
//   - The clip is a plain <video> with <source>s, streamed by the browser. It is made while
//     the visitor is still on the hero (after the first input, or when the page has been idle
//     for a while), and primed: played muted for one frame and put back on its first frame, so
//     that the decoder is warm and the data is there. The catch then only has to say play.
//   - The picture is a stack: the small poster that came with the page, the first frame at
//     full size, the clip, the last frame. The clip is shown only once the browser reports a
//     frame of it on screen, and the last frame comes up over its last frames, so the stage
//     never shows black or a frame that stands.
//   - Not ready on arrival (a slow line): the page is not held. If the clip gets ready within
//     a second and the corridor is still in front of the visitor it plays, otherwise the
//     corridor shows the last door and the Replay button.
//   - play() refused (an iPhone in Low Power Mode): the scroll is caught all the same, a
//     "Tap to enter" button comes up over the first frame, and the page is let go again as
//     soon as the fling has died. The tap plays the clip; scrolling on leaves it.
//   - Reduced motion: no clip, nothing held, three stills.
//
// On the first play, and only then, door 308 opens a hand's width for 625 ms: that play gets
// the variant of the clip that has the beat in it. Replay plays the one without.
import { still } from './env';
import { doorCreak } from './audio';

interface Cue {
  cap: number;
  in: number;
  out?: number;
}
interface Source {
  codec: string;
  src: string;
  type: string;
}
interface ClipInfo {
  duration: number;
  frames: number;
  cues: Cue[];
  sources: Source[];
  scare?: { at: number; end: number; rect: [number, number, number, number] };
}
type Variant = 'scare' | 'plain';
interface SetInfo {
  w: number;
  h: number;
  poster: string;
  first: string;
  last: string;
  stills: string[];
  clips: Record<Variant, ClipInfo>;
}
type SetName = 'desktop' | 'mobile';
interface Manifest {
  sets: Record<SetName, SetInfo>;
}
type FrameCallback = (now: number, meta: { mediaTime: number }) => void;
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: FrameCallback) => number };
interface Clip {
  variant: Variant;
  info: ClipInfo;
  video: FrameVideo;
  priming: boolean; // the muted play that warms it up is under way
  refused: boolean; // the browser would not play it without a tap
  failed: boolean; // no source of it can be played
}
type Phase = 'idle' | 'wait' | 'play' | 'tap';

const SEEN_KEY = 'hotel:corridor';
const SCARE_KEY = 'hotel:scare';
const IDLE_START_MS = 8000; // with no input at all, the clip is fetched this long after load
const AHEAD_MS = 24; // the catch looks this far ahead of the scroll: a frame and a half
const TOUCH_MS = 5000; // a fling may still be carrying the page this long after the finger left
const WHEEL_MS = 400; // and a turn of the wheel, or a key, this long
const KEY_MS = 700;
const READY_S = 4; // a clip counts as ready with this much of it loaded, where the browser does not say by itself
const WAIT_MS = 1000; // not ready on arrival: how long the clip has to get ready
const SOFT_MS = 350; // play() refused: the page is held this long, until the fling has died,
const SOFT_MAX_MS = 1500; // or until the wheel has been quiet, and never longer than this
const QUIET_MS = 180; // a wheel that has been silent this long has stopped
const LEAVE_PX = 24; // scrolling this far from the tap button leaves it
const SPARE_MS = 1000; // the hold ends this long after the clip should have, whatever happens
const START_MS = 4000; // a clip started by a tap has this long to show its first frame
const DWELL_MS = 600; // the walk for Replay is fetched once its button has been on screen this long
const DEAF_MS = 1000; // a wheel gesture that began this soon after the catch is the one that led here
const BURST_PX = 240; // a new wheel gesture this long within BURST_MS is meant
const BURST_MS = 400;
const SWIPE_PX = 90; // a finger that travels this far within SWIPE_MS is a strong swipe
const SWIPE_MS = 300;
const FADE_MS = 280; // one still to another
const VIDEO_FADE_MS = 120; // the first frame as a still to the first frame of the clip
const CUT_MS = 160; // the clip, cut short, to the last door
const SETTLE_S = 0.4; // the last door comes up over the clip's last frames, this long before the end

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function initCorridor() {
  const found = document.querySelector<HTMLElement>('[data-corridor]');
  const section = document.getElementById('corridor');
  const viewEl = found?.querySelector<HTMLElement>('[data-view]');
  if (!found || !section || !viewEl) return;
  const pin: HTMLElement = found;
  const view: HTMLElement = viewEl;
  const root = document.documentElement;
  let manifest: Manifest;
  try {
    manifest = JSON.parse(pin.dataset.manifest ?? '');
  } catch {
    return;
  }
  const base = pin.dataset.base ?? '';
  const caps = Array.from(section.querySelectorAll<HTMLElement>('[data-cap]'));
  const pic = (name: string) => view.querySelector<HTMLImageElement>(`[data-pic="${name}"]`);
  const firstPic = pic('first');
  const lastPic = pic('last');
  const skipBtn = pin.querySelector<HTMLButtonElement>('[data-corr-skip]');
  const tapBtn = pin.querySelector<HTMLButtonElement>('[data-corr-tap]');
  const replayBtn = pin.querySelector<HTMLButtonElement>('[data-corr-replay]');
  if (!firstPic || !lastPic || !skipBtn || !tapBtn || !replayBtn) return;
  const first: HTMLImageElement = firstPic;
  const last: HTMLImageElement = lastPic;
  const landing = document.getElementById(pin.dataset.next ?? '');

  // The poster is far below the first screen. Have it decoded before anybody gets there.
  const posterEl = view.querySelector<HTMLImageElement>('[data-poster]');
  const warm = () => void posterEl?.decode?.().catch(() => {});
  if (posterEl?.complete) warm();
  else posterEl?.addEventListener('load', warm, { once: true });

  const narrow = window.matchMedia('(orientation: portrait), (max-width: 760px)');
  let setName: SetName = narrow.matches ? 'mobile' : 'desktop';
  let info = manifest.sets[setName];
  if (!info) return;
  pin.dataset.set = setName;

  // Two hooks for the tests: which codec to offer (or 'none'), and how fast to play.
  const hook = window as unknown as { __corridorCodec?: string; __corridorRate?: number };
  const rate = () => (hook.__corridorRate && hook.__corridorRate > 0 ? hook.__corridorRate : 1);
  const set = (key: string, value: string | number) => {
    const v = String(value);
    if (pin.dataset[key] !== v) pin.dataset[key] = v;
  };

  if (still) {
    // three stills, nothing held, no walk, no scare, and no video is ever asked for
    set('mode', 'still');
    set('state', 'off');
    [pic('still-1'), pic('still-2'), last].forEach((el, k) => {
      if (!el) return;
      el.loading = 'lazy';
      el.src = base + (k < 2 ? info.stills[k] : info.last);
    });
    return;
  }

  // --- this session ---
  const told = (key: string) => {
    try {
      return Boolean(sessionStorage.getItem(key));
    } catch {
      return false;
    }
  };
  const tell = (key: string) => {
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* private mode: remembered for as long as the page lives */
    }
  };
  let seen = told(SEEN_KEY);

  // --- the picture: a stack, the newest layer on top ---
  let top = 10;
  let fadeToken = 0;
  let shownEl: HTMLElement | null = null;
  const videos = new Set<HTMLVideoElement>();
  const release = (v: HTMLVideoElement) => {
    videos.delete(v);
    v.pause();
    v.replaceChildren();
    v.removeAttribute('src');
    v.load();
    v.remove();
  };
  // Bring one layer up over whatever is showing, fading in; when it is fully there, everything
  // under it goes (and a clip under it gives its decoder back; a clip that has not come up
  // yet is not under anything and is left alone).
  // A still that has not arrived yet waits for its picture, and what is showing stays until
  // then: the stage is never empty.
  const show = (el: HTMLElement, ms: number) => {
    if (el === shownEl) return;
    shownEl = el;
    const token = ++fadeToken;
    const done = () => {
      if (token !== fadeToken) return;
      for (const p of [first, last]) if (p !== el) p.classList.remove('is-on');
      for (const v of [...videos]) if (v !== el && v.classList.contains('is-on')) release(v);
    };
    const up = () => {
      if (token !== fadeToken) return;
      el.style.zIndex = String(++top);
      el.classList.add('is-on');
      if (ms <= 0 || typeof el.animate !== 'function') return done();
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'linear' }).finished.then(done, () => {});
    };
    if (!(el instanceof HTMLImageElement)) return up();
    // loaded, and decoded too: a picture that is still being decoded paints as nothing
    const decoded = () => (typeof el.decode === 'function' ? el.decode().then(up, up) : up());
    if (el.complete && el.naturalWidth > 0) decoded();
    else el.addEventListener('load', decoded, { once: true });
  };
  let picsAsked = false;
  const loadPics = () => {
    if (picsAsked) return;
    picsAsked = true;
    if (!seen) first.src = base + info.first;
    last.src = base + info.last;
  };

  // --- captions ---
  const capOn = caps.map(() => false);
  const setCaps = (on: (i: number) => boolean) => {
    caps.forEach((el, i) => {
      const want = on(i);
      if (want !== capOn[i]) {
        capOn[i] = want;
        el.classList.toggle('is-on', want);
      }
    });
  };
  const cuesAt = (cues: Cue[], t: number) => (i: number) => cues.some((c) => c.cap === i && t >= c.in && (c.out === undefined || t < c.out));
  // the caption the last door rests on: the one the clip never takes away
  const restCap = () => info.clips.plain.cues.find((c) => c.out === undefined)?.cap ?? -1;

  // --- state ---
  let phase: Phase = 'idle';
  let run = 0; // every change of plan gets a new number; whatever was under way checks it and stops
  let clip: Clip | null = null; // made ready for the next play
  let playing: Clip | null = null;
  let firstRun = false; // the play under way is the one the scroll started
  let started = false; // the visitor has done something, or the page has been idle long enough
  let noVideo = false;
  let pushed = false;
  let clock = 0;
  let beats = 0;
  let played = 0;
  set('seen', seen ? 1 : 0);
  set('scareBeats', 0);
  set('played', 0);
  set('variant', '');
  set('mode', '');
  set('lock', 0);

  // --- geometry: set on resize, never read while scrolling ---
  let topY = 0; // where the page is when the corridor's top is at the top of the screen
  let screen = 1;
  let locked = false;
  let lockStart = 0;
  const measure = () => {
    const r = section.getBoundingClientRect();
    // (held, the page's scroll position is in the body's offset, and the corridor is at 0)
    topY = Math.round(r.top + (locked ? topY : window.scrollY));
    screen = window.innerHeight;
    if (locked) document.body.style.top = `${-topY}px`;
    set('top', topY);
  };

  // --- holding the page ---
  let watchdog = 0;
  const jump = (y: number) => {
    try {
      window.scrollTo({ top: y, behavior: 'instant' });
    } catch {
      window.scrollTo(0, y); // a browser from before 'instant'
    }
  };
  const lock = (ms: number, late: () => void) => {
    if (locked) return;
    locked = true;
    lockStart = performance.now();
    // where a scrollbar takes room, the room is kept; a browser that cannot keep it empty keeps the bar
    const bar = window.innerWidth - root.clientWidth;
    document.body.style.top = `${-topY}px`;
    root.classList.add('corr-lock');
    if (bar > 0) root.classList.add(window.CSS?.supports?.('scrollbar-gutter', 'stable') ? 'corr-lock--gutter' : 'corr-lock--bar');
    pin.classList.add('is-held');
    set('lock', 1);
    set('lockStart', Math.round(lockStart));
    performance.mark('corridor:lock-start');
    watchdog = window.setTimeout(late, ms);
  };
  const unlock = () => {
    if (!locked) return;
    locked = false;
    window.clearTimeout(watchdog);
    pin.classList.remove('is-held');
    root.classList.remove('corr-lock', 'corr-lock--gutter', 'corr-lock--bar');
    document.body.style.top = '';
    jump(topY);
    lastY = topY;
    above = false;
    const end = performance.now();
    set('lock', 0);
    set('lockEnd', Math.round(end));
    performance.mark('corridor:lock-end');
    try {
      performance.measure('corridor:lock', { start: lockStart, end });
    } catch {
      /* a browser without measure options: the two marks are there */
    }
  };
  // Is the corridor what the visitor is looking at? (most of the screen)
  const facing = () => locked || Math.abs(window.scrollY - topY) <= screen * 0.4;

  // --- the scare: lean in towards the gap while the door moves, settle back after ---
  const pushIn = (sc: NonNullable<ClipInfo['scare']>) => {
    const cw = view.clientWidth;
    const ch = view.clientHeight;
    if (!cw || !ch) return;
    // the part of the frame the stage shows (object-fit: cover, centred), in frame pixels
    const k = Math.max(cw / info.w, ch / info.h);
    const crop = { w: cw / k, h: ch / k, x: (info.w - cw / k) / 2, y: (info.h - ch / k) / 2 };
    const [x, y, w, h] = sc.rect;
    const ox = clamp(((x + w / 2 - crop.x) / crop.w) * 100, 0, 100);
    const oy = clamp(((y + h / 2 - crop.y) / crop.h) * 100, 0, 100);
    view.style.transformOrigin = `${ox.toFixed(1)}% ${oy.toFixed(1)}%`;
    view.style.transition = `transform ${Math.round((sc.end - sc.at) * 1000)}ms cubic-bezier(0.25, 0.1, 0.35, 1)`;
    view.style.transform = 'scale(1.045)';
    pushed = true;
  };
  const pushOut = () => {
    if (!pushed) return;
    pushed = false;
    view.style.transition = 'transform 900ms cubic-bezier(0.45, 0, 0.25, 1)';
    view.style.transform = '';
  };

  // --- the clip ---
  const ready = (c: Clip) => {
    const v = c.video;
    if (c.failed || v.readyState < 3) return false;
    if (v.readyState === 4) return true;
    // (a browser that is slow to say "enough": the next seconds of the clip are there, or all of it)
    const b = v.buffered;
    return b.length > 0 && b.end(b.length - 1) >= Math.min(c.info.duration - 0.3, READY_S);
  };
  const makeClip = (variant: Variant): Clip | null => {
    const ci = info.clips[variant];
    const v = document.createElement('video') as FrameVideo;
    // best first, as the build lists them; the browser takes the first it can play
    const sources = ci.sources.filter((s) => (hook.__corridorCodec === undefined || s.codec === hook.__corridorCodec) && v.canPlayType(s.type) !== '');
    if (!sources.length) {
      noVideo = true;
      set('codec', 'none');
      replayBtn.hidden = true;
      return null;
    }
    v.className = 'corr__video';
    v.dataset.variant = variant;
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('disableremoteplayback', '');
    v.setAttribute('aria-hidden', 'true');
    v.disablePictureInPicture = true;
    v.controls = false;
    v.preload = 'auto';
    v.tabIndex = -1;
    const c: Clip = { variant, info: ci, video: v, priming: false, refused: false, failed: false };
    for (const s of sources) {
      const el = document.createElement('source');
      el.src = base + s.src;
      el.type = s.type;
      v.appendChild(el);
    }
    // the last source failing means none of them played
    v.lastElementChild?.addEventListener('error', () => (c.failed = true));
    v.addEventListener('error', () => (c.failed = true));
    v.addEventListener('loadedmetadata', () => set('codec', sources.find((s) => v.currentSrc.endsWith(s.src))?.codec ?? ''));
    const say = () => {
      if (clip === c && ready(c)) set('ready', variant);
    };
    v.addEventListener('canplaythrough', say);
    v.addEventListener('progress', say);
    view.appendChild(v);
    videos.add(v);
    return c;
  };
  // Play it muted for a frame and put it back on its first: the decoder is warm, and an
  // iPhone, which fetches next to nothing until a video plays, has the data. A refusal says
  // now that this browser wants a tap.
  const prime = (c: Clip) => {
    const v = c.video;
    c.priming = true;
    const primed = () => {
      if (clip === c) set('primed', c.variant);
    };
    const back = () => {
      if (!c.priming) return;
      c.priming = false;
      v.pause();
      if (v.currentTime === 0) return primed();
      v.addEventListener('seeked', primed, { once: true });
      v.currentTime = 0;
    };
    v.play().then(
      () => {
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(back);
        else v.addEventListener('timeupdate', back, { once: true });
        window.setTimeout(back, 1500);
      },
      (e: unknown) => {
        c.priming = false;
        if ((e as Error)?.name !== 'NotAllowedError') return;
        c.refused = true;
        set('prime', 'refused');
      },
    );
  };
  const drop = () => {
    const c = clip;
    clip = null;
    set('ready', '');
    set('primed', '');
    if (c && c !== playing) release(c.video);
  };
  // The clip the next play needs, made before it is needed: the walk with the door for a
  // session that has not seen the corridor, as soon as the page is above it; the walk without
  // for Replay, once the visitor has stopped at the last door.
  const prepare = () => {
    if (!started || noVideo || clip || playing) return;
    if (seen ? !dwelling : !above) return;
    const c = makeClip(seen || told(SCARE_KEY) ? 'plain' : 'scare');
    if (!c) return;
    clip = c;
    set('clip', c.variant);
    prime(c);
  };

  // --- resting ---
  let dwelling = false; // the visitor has stopped at the corridor
  let dwellTimer = 0;
  const stay = () => {
    if (!facing()) return;
    dwelling = true;
    prepare();
  };
  const rest = () => {
    phase = 'idle';
    set('state', 'idle');
    skipBtn.hidden = true;
    tapBtn.hidden = true;
    replayBtn.hidden = !seen || noVideo;
    setCaps((i) => seen && i === restCap());
  };
  const glide = () => {
    if (!landing) return;
    landing.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // The end of a play, of a wait, of the tap button: the last door, the page let go.
  //   ended         the clip ran to its end         skip-*   the visitor left it
  //   watchdog      it did not end in time           error    it would not decode
  //   back          a strong swipe the other way     hidden   the tab was put away
  //   late          it was not ready in time         leave    the visitor scrolled on from the tap button
  //   refused       it would not play on a tap       away     it started with the corridor no longer in view
  //   turn          the phone was turned
  const finish = (reason: string) => {
    if (phase === 'idle') return;
    run++;
    window.cancelAnimationFrame(clock);
    window.clearTimeout(waitTimer);
    window.clearTimeout(softTimer);
    window.clearTimeout(startTimer);
    const c = playing ?? clip;
    const wasFirst = firstRun;
    const wasHeld = locked;
    const hadFocus = pin.contains(document.activeElement);
    playing = null;
    firstRun = false;
    pushOut();
    if (c) {
      c.video.pause();
      // a clip that never came up has nothing to hand over: it goes at once. One that is up
      // stops on its frame, and goes when the last door has covered it.
      if (clip === c) {
        clip = null;
        set('ready', '');
        set('primed', '');
      }
      if (!c.video.classList.contains('is-on')) release(c.video);
    }
    if (!seen) {
      seen = true;
      tell(SEEN_KEY);
      set('seen', 1);
    }
    if (reason === 'ended') {
      played++;
      set('played', played);
    }
    set('end', reason);
    loadPics();
    show(last, reason === 'ended' ? 0 : CUT_MS);
    rest();
    unlock();
    // On to the next section: when the clip the scroll started is over, and whenever the
    // visitor asked to leave. A walk played again by its button ends where it began.
    const on = reason.startsWith('skip') || (wasFirst && wasHeld && (reason === 'ended' || reason === 'watchdog' || reason === 'error'));
    if (on) glide();
    if (hadFocus) {
      // the button that had the focus is gone: the focus goes where the visitor is
      if (on && landing) {
        landing.setAttribute('tabindex', '-1');
        landing.setAttribute('data-corr-landing', '');
        landing.focus({ preventScroll: true });
      } else if (!replayBtn.hidden) replayBtn.focus({ preventScroll: true });
    }
    // the walk for Replay: only for a visitor who stays
    dwelling = false;
    window.clearTimeout(dwellTimer);
    dwellTimer = window.setTimeout(stay, DWELL_MS);
  };

  // --- playing ---
  let startTimer = 0;
  // hold: the page is taken now (a scroll brought the visitor here and the clip is ready).
  // Otherwise (a tap, the Replay button) it is taken when the first frame is up.
  const begin = (c: Clip, hold: boolean) => {
    const mine = ++run;
    const v = c.video;
    const sc = c.info.scare;
    playing = c;
    firstRun = !seen;
    phase = 'play';
    set('state', 'play');
    set('variant', c.variant);
    set('end', '');
    setCaps(() => false);
    tapBtn.hidden = true;
    replayBtn.hidden = true;
    skipBtn.hidden = false;
    // (the tests' faster playing does not shorten it: a decoder may not keep up with them)
    const spare = () => (c.info.duration * 1000) / Math.min(1, rate()) + SPARE_MS;
    if (hold) lock(spare(), () => finish('watchdog'));
    skipBtn.focus({ preventScroll: true });
    c.priming = false;
    v.defaultPlaybackRate = rate();
    v.playbackRate = rate();
    if (v.currentTime > 0.01 || v.ended) v.currentTime = 0;

    let shown = false;
    let creaked = false;
    let counted = false;
    const reveal = () => {
      if (mine !== run || shown) return;
      if (!locked) {
        if (!facing()) return finish('away');
        window.clearTimeout(startTimer);
        lock(spare(), () => finish('watchdog'));
      }
      shown = true;
      set('mode', 'video');
      performance.mark('corridor:first-frame');
      show(v, VIDEO_FADE_MS);
    };
    // The beat counts once the open door has been on screen.
    const present = (t: number) => {
      if (!sc || counted || !shown || t < sc.at + 4 / 24 || t >= sc.end) return;
      counted = true;
      tell(SCARE_KEY);
      beats++;
      set('scareBeats', beats);
    };
    v.addEventListener('error', () => {
      if (mine === run) finish('error');
    });
    v.addEventListener('ended', () => {
      if (mine === run) finish('ended');
    });
    if (v.requestVideoFrameCallback) {
      const onFrame: FrameCallback = (_now, meta) => {
        if (mine !== run) return;
        // (a frame from before the clip was put back on its start is not its first frame)
        if (!v.seeking && (shown || meta.mediaTime < 0.5)) reveal();
        present(meta.mediaTime);
        if (!v.ended) v.requestVideoFrameCallback?.(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
    }
    const tick = () => {
      if (mine !== run) return;
      const t = v.currentTime;
      if (t > 0 && !v.seeking && !v.requestVideoFrameCallback) {
        reveal();
        present(t);
      }
      if (shown) {
        setCaps(cuesAt(c.info.cues, t));
        // (a little longer than what is left of the clip, so the clip is still there under it)
        if (t >= c.info.duration - SETTLE_S) show(last, (SETTLE_S * 1000 + 80) / rate());
        if (sc) {
          if (!creaked && t >= sc.at && t < sc.end) {
            creaked = true;
            doorCreak(sc.end - sc.at);
            pushIn(sc);
          }
          if (creaked && t >= sc.end) pushOut();
        }
      }
      clock = requestAnimationFrame(tick);
    };
    clock = requestAnimationFrame(tick);
    if (!hold) startTimer = window.setTimeout(() => mine === run && !shown && finish('late'), START_MS);
    v.play().catch(() => {
      if (mine !== run || shown) return;
      // refused. With the page held this is the scroll's own play: ask for a tap. A tap that
      // is refused as well has no way left.
      if (hold) offer(c);
      else finish('refused');
    });
  };

  // play() refused: the first frame, a button over it, and the page let go again once the
  // fling that brought the visitor here has died.
  let softTimer = 0;
  const offer = (c: Clip) => {
    run++;
    window.cancelAnimationFrame(clock);
    playing = null;
    c.refused = true;
    phase = 'tap';
    set('state', 'tap');
    skipBtn.hidden = false;
    replayBtn.hidden = true;
    tapBtn.hidden = false;
    tapBtn.focus({ preventScroll: true });
    window.clearTimeout(watchdog);
    const settle = () => {
      const now = performance.now();
      const held = now - lockStart;
      if (held >= SOFT_MAX_MS || (held >= SOFT_MS && now - lastWheel >= QUIET_MS)) return unlock();
      softTimer = window.setTimeout(settle, 40);
    };
    softTimer = window.setTimeout(settle, 40);
  };

  // --- arriving ---
  let waitTimer = 0;
  const arrive = () => {
    if (phase !== 'idle' || seen) return;
    const now = performance.now();
    const take = () => {
      const c = clip;
      if (!c || c.failed) return false;
      if (c.refused) {
        lock(SOFT_MAX_MS, unlock);
        offer(c);
        return true;
      }
      if (!ready(c)) return false;
      begin(c, true);
      return true;
    };
    if (take()) return;
    // Not ready: the page is not held. It has a second to get ready, with the corridor still
    // in front of the visitor.
    phase = 'wait';
    set('state', 'wait');
    const again = () => {
      if (phase !== 'wait') return;
      if (facing() && take()) return;
      if (performance.now() - now >= WAIT_MS) return finish('late');
      waitTimer = window.setTimeout(again, 40);
    };
    waitTimer = window.setTimeout(again, 40);
  };

  // --- what the visitor is doing: read, never answered ---
  let touching = false;
  let lastTouch = -1e9;
  let lastWheel = -1e9;
  let lastKey = -1e9;
  let swipe: { y: number; t: number } | null = null;
  let wheel = { t: -1e9, sum: 0, counts: false };
  const driven = (now: number) => touching || now - lastTouch < TOUCH_MS || now - lastWheel < WHEEL_MS || now - lastKey < KEY_MS;
  // an in-page link is carrying the page (scroll.ts sets this while it travels)
  const gliding = () => root.style.scrollBehavior === 'smooth';
  const held = () => locked && phase === 'play';
  window.addEventListener(
    'touchstart',
    (e) => {
      lastTouch = performance.now();
      touching = true;
      // a finger put down after the page was taken: the start of a second gesture
      swipe = held() && e.touches.length === 1 ? { y: e.touches[0].clientY, t: lastTouch } : null;
    },
    { passive: true },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      const now = performance.now();
      lastTouch = now;
      if (!swipe || !held() || !e.touches.length) return;
      const y = e.touches[0].clientY;
      // slow: measure again from here
      if (now - swipe.t > SWIPE_MS) swipe = { y, t: now };
      else if (Math.abs(y - swipe.y) >= SWIPE_PX) {
        const up = y < swipe.y;
        swipe = null;
        finish(up ? 'skip-swipe' : 'back');
      }
    },
    { passive: true },
  );
  for (const ev of ['touchend', 'touchcancel']) {
    window.addEventListener(
      ev,
      (e) => {
        lastTouch = performance.now();
        touching = (e as TouchEvent).touches.length > 0;
        swipe = null;
      },
      { passive: true },
    );
  }
  window.addEventListener(
    'wheel',
    (e) => {
      const now = performance.now();
      const fresh = now - lastWheel >= QUIET_MS;
      lastWheel = now;
      if (!held()) return;
      // a gesture that began before the page was taken, or right after, is the one that
      // brought the visitor here, however long its tail runs
      if (fresh) wheel = { t: now, sum: 0, counts: now - lockStart >= DEAF_MS };
      if (!wheel.counts) return;
      if (now - wheel.t > BURST_MS) wheel = { t: now, sum: 0, counts: true };
      wheel.sum += e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? screen : 1);
      if (Math.abs(wheel.sum) >= BURST_PX) finish(wheel.sum > 0 ? 'skip-wheel' : 'back');
    },
    { passive: true },
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (phase === 'play' || phase === 'tap')) return finish('skip-key');
    if ((e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') && !e.shiftKey) lastKey = performance.now();
  });
  skipBtn.addEventListener('click', () => finish('skip-button'));
  tapBtn.addEventListener('click', () => {
    if (phase !== 'tap' || !clip) return;
    // (still held from the catch: let go first; the page is taken again with the first frame)
    window.clearTimeout(softTimer);
    unlock();
    begin(clip, false);
  });
  replayBtn.addEventListener('click', () => {
    if (phase !== 'idle') return;
    if (!clip) {
      const c = makeClip('plain');
      if (!c) return;
      clip = c;
      set('clip', c.variant);
    }
    begin(clip, false);
  });

  // --- reading the scroll position ---
  let lastY = window.scrollY;
  let lastT = 0;
  let above = false; // the page is above the corridor: the next way down may be caught
  const onScroll = () => {
    if (locked) return;
    const now = performance.now();
    const y = window.scrollY;
    const dt = now - lastT;
    const speed = dt > 0 && dt < 120 ? (y - lastY) / dt : 0;
    lastY = y;
    lastT = now;
    if (phase === 'tap') {
      if (Math.abs(y - topY) > LEAVE_PX) finish('leave');
      return;
    }
    // caught a little before it gets there, by as much as the page moves in a frame and a
    // half: the frame that shows the corridor at the top is the frame it is held in
    const can = !seen && phase === 'idle' && !document.hidden && driven(now) && !gliding();
    if (above && y + (can && speed > 0 ? speed * AHEAD_MS : 0) >= topY) {
      above = false;
      // (a page that is already more than a screen past was not seen to arrive)
      if (can && y - topY <= screen) arrive();
    } else if (!above && y < topY - 1) {
      above = true;
      prepare();
    }
  };

  // --- loading: nothing but the poster until the visitor does something ---
  const firstInput = () => {
    if (started) return;
    started = true;
    events.forEach((ev) => window.removeEventListener(ev, firstInput));
    loadPics();
    // the full first frame over the small poster
    if (!seen && phase === 'idle') show(first, FADE_MS);
    prepare();
  };
  const events = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'pointermove', 'keydown'];
  events.forEach((ev) => window.addEventListener(ev, firstInput, { passive: true }));
  // No input at all: once the page has been idle well after load, take the same head start.
  const afterLoad = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    window.setTimeout(() => (ric ? ric(firstInput, { timeout: 3000 }) : firstInput()), IDLE_START_MS);
  };
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });

  // --- start: wherever the page is (a reload restores the scroll position), at rest ---
  measure();
  above = window.scrollY < topY - 1;
  if (seen) {
    // the last door is what this session rests on: it is needed before any input
    loadPics();
    show(last, 0);
  }
  rest();

  new ResizeObserver(measure).observe(section);
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  // The same reading when the section crosses the screen, and how long the visitor stays.
  new IntersectionObserver(
    (e) => {
      onScroll();
      window.clearTimeout(dwellTimer);
      if (e[e.length - 1].intersectionRatio < 0.5) dwelling = false;
      else if (!dwelling) dwellTimer = window.setTimeout(stay, DWELL_MS);
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  ).observe(section);
  // A tab that is put away ends whatever was under way: the page is never left held.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finish('hidden');
  });
  window.addEventListener('pagehide', () => finish('hidden'));
  // Turning the phone changes the set: the stage rests, on the stills of the other set.
  narrow.addEventListener('change', () => {
    const name: SetName = narrow.matches ? 'mobile' : 'desktop';
    if (name === setName || !manifest.sets[name]) return;
    finish('turn');
    drop();
    for (const v of [...videos]) release(v);
    setName = name;
    info = manifest.sets[name];
    set('set', name);
    noVideo = false;
    if (picsAsked) {
      picsAsked = false;
      loadPics();
    }
    rest();
    prepare();
  });
}
