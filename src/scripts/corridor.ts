// The corridor. A walk down the third floor by torchlight, made offline from generated video
// (corridor-src/SOURCES.md, scripts/corridor-video.mjs) and shown as video, in three chapters:
//   1  door 301 to door 304        2  on to the scratched door 305
//   3  to door 308 and on to the last door, 313
// One gesture (a swipe, a turn of the wheel, a key) starts one chapter. It plays by itself, at
// the speed it was shot, and stops on its caption.
//
// How it works
//   - The stage is CSS sticky inside a tall section, so the page scrolls natively and the
//     picture stands still while it does. Scroll snap, in CSS alone (Corridor.astro), gives the
//     section four places to rest: the start, and the end of each chapter. Nothing here calls
//     preventDefault, and the only touch and wheel listeners are passive ones that note that
//     the visitor did something (the first input, and when the last one was).
//   - This script reads only the scroll position. Leaving a stop by more than a few pixels is
//     the gesture: forwards it starts the next chapter, backwards it brings back the pose of
//     the stop before (a crossfade; nothing plays in reverse). Passing a second stop while a
//     chapter plays cuts that chapter to its end pose and starts the next. When the page comes
//     to rest somewhere other than the stop of the chapter it started, the page is put there
//     (a mouse wheel moves the page 100 px and the browser then snaps back: the chapter has
//     begun all the same, and the page follows it). The stage is pinned, so this is not seen.
//   - A fast pass (a hard fling, a link that glides across the section) starts nothing: the
//     stage shows the end poses it passes and the page keeps going.
//   - The picture is a stack: four poses (stills of the start and of the end of each chapter)
//     and, over them, the video of the chapter that is playing. A chapter begins on the pose
//     the one before it ends on, and as it comes to a stop its end pose fades in over its last
//     frames: at rest the stage always shows a still, which is sharper than any video frame and
//     holds no decoder.
//   - Nothing but one small poster loads with the page. The first input fetches the poses and
//     chapter 1; each chapter fetches the next one while it plays. A video is fetched whole
//     before it is played, so it never stalls half way.
//   - Without video (no codec, autoplay refused, a file that will not load) the chapters are
//     crossfades between the poses, with the same captions. The section works either way.
//   - Reduced motion: no pin, no video, three stills.
//
// Once per browser session, on the first forward pass through chapter 3, door 308 opens a
// hand's width for 625 ms: that pass plays the variant of chapter 3 that has the beat in it.
// It counts once its frames were on screen; a visitor who skipped past keeps it for later.
import { still, once } from './env';
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
interface FileInfo {
  duration: number;
  frames: number;
  cues: Cue[];
  sources: Source[];
  scare?: { at: number; end: number; rect: [number, number, number, number] };
}
type FileId = 'c1' | 'c2' | 'c3' | 'c3s';
interface SetInfo {
  w: number;
  h: number;
  poster: string;
  poses: string[];
  files: Record<FileId, FileInfo>;
}
type SetName = 'desktop' | 'mobile';
interface Manifest {
  sets: Record<SetName, SetInfo>;
}
interface Clip {
  id: FileId;
  info: FileInfo;
  state: 'idle' | 'loading' | 'ready' | 'failed';
  url: string;
  direct: string;
  ready: Promise<boolean>;
}
type FrameCallback = (now: number, meta: { mediaTime: number }) => void;
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: FrameCallback) => number };

const SCARE_KEY = 'hotel:scare';
// The section's shape, in screens (Corridor.astro: --corr-lead, --corr-step, one screen to leave with).
const LEAD = 0.2;
const STEP = 1.25;
const SCREENS = LEAD + 3 * STEP + 1;
const LAST = 3;
const INTENT_PX = 16; // leaving a stop by more than this is a gesture
const FAST_PX_MS = 3.2; // faster than this is a pass, not a visit: nothing starts
const FADE_MS = 280; // to a pose
const VIDEO_FADE_MS = 160; // a pose to the first frame of its video (the same picture)
const SETTLE_S = 0.4; // a chapter's end pose comes up over its last frames, this long before the end
const INPUT_QUIET_MS = 300; // the page is taken to its stop only this long after the last wheel, touch or key
const READY_WAIT_MS = 1500; // how long a chapter waits for its file before it goes on without it
const FRAME_WAIT_MS = 4000; // and for its first frame, once it plays
// A chapter without video: a slow crossfade to its end pose, the captions in the same order.
const WALK_MS = [0, 1700, 1700, 3400];
const WALK_FADE_MS = 900;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function initCorridor() {
  const found = document.querySelector<HTMLElement>('[data-corridor]');
  const section = document.getElementById('corridor');
  const viewEl = found?.querySelector<HTMLElement>('[data-view]');
  if (!found || !section || !viewEl) return;
  const pin: HTMLElement = found;
  const view: HTMLElement = viewEl;
  let manifest: Manifest;
  try {
    manifest = JSON.parse(pin.dataset.manifest ?? '');
  } catch {
    return;
  }
  const base = pin.dataset.base ?? '';
  const caps = Array.from(section.querySelectorAll<HTMLElement>('[data-cap]'));
  const poses = [0, 1, 2, 3].map((k) => view.querySelector<HTMLImageElement>(`[data-pose="${k}"]`)).filter((el): el is HTMLImageElement => Boolean(el));
  if (poses.length !== 4) return;

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

  // Two hooks for the tests: which codec to use (or 'none'), and how fast to play.
  const hook = window as unknown as { __corridorCodec?: string; __corridorRate?: number };
  const rate = () => (hook.__corridorRate && hook.__corridorRate > 0 ? hook.__corridorRate : 1);
  const set = (key: string, value: string | number) => {
    const v = String(value);
    if (pin.dataset[key] !== v) pin.dataset[key] = v;
  };

  // --- the poses ---
  // The small poster that came with the page stays where it is, under everything, for good: it
  // is the floor of the stack. The four poses are layers over it and get their source here.
  let posesAsked = false;
  const loadPoses = () => {
    if (posesAsked) return;
    posesAsked = true;
    info.poses.forEach((src, k) => {
      poses[k].src = base + src;
    });
  };

  if (still) {
    // three stills, no pin, no walk, no scare, and no video is ever asked for
    set('mode', 'still');
    set('state', 'off');
    poses.forEach((el, k) => {
      if (k > 0) {
        el.loading = 'lazy';
        el.src = base + info.poses[k];
      }
    });
    return;
  }

  // --- the picture: a stack, the newest layer on top ---
  let top = 10;
  let fadeToken = 0;
  const videos = new Set<HTMLVideoElement>();
  const release = (v: HTMLVideoElement) => {
    videos.delete(v);
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.remove();
  };
  // Bring one layer up over whatever is showing, fading in; when it is fully there, everything
  // under it goes (and a video under it gives its decoder back; a video that has not come up
  // yet is not under anything and is left alone).
  // A pose that has not arrived yet waits for its picture, and what is showing stays until then:
  // the stage is never empty.
  const show = (el: HTMLElement, ms: number) => {
    const token = ++fadeToken;
    const done = () => {
      if (token !== fadeToken) return;
      for (const p of poses) if (p !== el) p.classList.remove('is-on');
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
  const fileOf = (chapter: number, scare: boolean): FileId => (chapter === 1 ? 'c1' : chapter === 2 ? 'c2' : scare ? 'c3s' : 'c3');
  // the caption a stop rests on: the one its chapter never takes away
  const restCap = (stop: number) => (stop < 1 ? -1 : (info.files[fileOf(stop, false)].cues.find((c) => c.out === undefined)?.cap ?? -1));
  const cuesAt = (cues: Cue[], t: number) => (i: number) => cues.some((c) => c.cap === i && t >= c.in && (c.out === undefined || t < c.out));

  // --- the files ---
  let codec: string | null = null; // decided at the first input
  let codecAsked: Promise<void> | null = null;
  const clips = new Map<FileId, Clip>();
  const loaded: string[] = [];
  const chooseCodec = () => {
    if (codecAsked) return codecAsked;
    codecAsked = (async () => {
      const probe = document.createElement('video');
      const sources = info.files.c1.sources;
      const can = sources.filter((s) => probe.canPlayType(s.type) !== '');
      if (hook.__corridorCodec !== undefined) {
        codec = can.find((s) => s.codec === hook.__corridorCodec)?.codec ?? null;
        return;
      }
      // The sources are listed best first (AV1, then H.264), and the first that can be played
      // is taken, as a <source> list would. One exception: where the better codec would be
      // decoded in software and the next one in hardware, a phone takes the hardware one.
      let pick = can[0] ?? null;
      const mc = navigator.mediaCapabilities;
      if (pick && can.length > 1 && mc?.decodingInfo) {
        try {
          const r = await mc.decodingInfo({ type: 'file', video: { contentType: pick.type, width: info.w, height: info.h, bitrate: 1_500_000, framerate: 36 } });
          if (!r.supported || !r.smooth || (setName === 'mobile' && !r.powerEfficient)) pick = can[1];
        } catch {
          // an old browser that knows the API but not the codec string: keep the list order
        }
      }
      codec = pick?.codec ?? null;
    })().then(() => set('codec', codec ?? 'none'));
    return codecAsked;
  };
  const clipOf = (id: FileId): Clip | null => {
    const have = clips.get(id);
    if (have) return have;
    const source = info.files[id].sources.find((s) => s.codec === codec);
    if (!source) return null;
    const clip: Clip = { id, info: info.files[id], state: 'loading', url: '', direct: base + source.src, ready: Promise.resolve(false) };
    clip.ready = fetch(clip.direct)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((blob) => {
        clip.url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
        clip.state = 'ready';
        loaded.push(id);
        set('loaded', loaded.join(' '));
        return true;
      })
      .catch(() => {
        clip.state = 'failed';
        return false;
      });
    clips.set(id, clip);
    return clip;
  };
  const scareDone = () => {
    try {
      return Boolean(sessionStorage.getItem(SCARE_KEY));
    } catch {
      return false;
    }
  };
  // Fetch what the chapter after `stop` will need. Of chapter 3 only the variant this session
  // still needs.
  const preload = (stop: number) => {
    if (!started || stop >= LAST) return;
    void chooseCodec().then(() => {
      if (codec) clipOf(fileOf(stop + 1, !scareDone()));
    });
  };

  // --- state ---
  let chapter = 0; // the stop the visitor is at, or is on the way to: 0 to 3
  let anchor = 0; // the stop last passed or rested on
  let state: 'rest' | 'play' = 'rest';
  let run = 0; // every change of plan gets a new number; whatever was under way checks it and stops
  let pending = 0; // a chapter that was reached but has not started: the page was moving too fast
  let notBefore = 0; // and the earliest it may start (after a cut to the pose it starts on)
  let playing: HTMLVideoElement | null = null;
  let started = false;
  let visible = false;
  let beats = 0;
  let played = 0;
  let pushed = false;
  let clock = 0;
  set('scareBeats', 0);
  set('played', 0);
  set('variant', '');
  set('mode', '');
  set('loaded', '');

  // --- geometry: set on resize, never read while scrolling ---
  let stop0 = 0;
  let step = 1;
  let screen = 1;
  const measure = () => {
    const r = section.getBoundingClientRect();
    screen = r.height / SCREENS;
    step = STEP * screen;
    stop0 = r.top + window.scrollY + LEAD * screen;
    set('stops', [0, 1, 2, 3].map((k) => Math.round(stop0 + k * step)).join(' '));
  };

  // --- the scare: lean in towards the gap while the door moves, settle back after ---
  const pushIn = (sc: NonNullable<FileInfo['scare']>) => {
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

  // --- playing a chapter ---
  const stopPlayback = () => {
    run++;
    pending = 0;
    window.cancelAnimationFrame(clock);
    // a video that never came up has nothing to hand over: it goes at once. One that is up
    // stops on its frame, and goes when the next layer has covered it.
    if (playing && !playing.classList.contains('is-on')) release(playing);
    else if (playing) playing.pause();
    playing = null;
    pushOut();
  };
  const rest = (stop: number) => {
    state = 'rest';
    set('state', 'rest');
    set('pose', stop);
    setCaps((i) => i === restCap(stop));
    preload(stop);
  };

  // No video: a slow crossfade to the end pose, the captions in their order.
  const walk = (k: number, id: FileId, mine: number, why: string) => {
    set('mode', 'poster');
    set('why', why); // for whoever looks into it: why this chapter had no video
    const cues = info.files[id].cues;
    const duration = info.files[id].duration;
    const t0 = performance.now();
    const total = WALK_MS[k] / rate();
    const fade = WALK_FADE_MS / rate();
    let faded = false;
    const tick = (now: number) => {
      if (mine !== run) return;
      const u = (now - t0) / total;
      setCaps(cuesAt(cues, Math.min(1, u) * duration));
      if (!faded && u >= 1 - fade / total) {
        faded = true;
        show(poses[k], fade);
      }
      if (u >= 1) return rest(k);
      clock = requestAnimationFrame(tick);
    };
    clock = requestAnimationFrame(tick);
  };

  const makeVideo = (src: string, id: FileId) => {
    const v = document.createElement('video');
    v.className = 'corr__video';
    v.dataset.file = id;
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
    v.src = src;
    v.defaultPlaybackRate = rate();
    v.playbackRate = rate();
    view.appendChild(v);
    videos.add(v);
    return v;
  };

  const begin = (k: number) => {
    stopPlayback();
    const mine = run;
    const scare = k === LAST && !scareDone();
    const id = fileOf(k, scare);
    state = 'play';
    set('state', 'play');
    if (k === LAST) set('variant', scare ? 'scare' : 'plain');
    setCaps(() => false);
    preload(k);

    void chooseCodec().then(async () => {
      if (mine !== run) return;
      const clip = codec ? clipOf(id) : null;
      if (!clip) return walk(k, id, mine, 'no codec');
      const ok = await Promise.race([clip.ready, new Promise<boolean>((r) => window.setTimeout(() => r(false), READY_WAIT_MS))]);
      if (mine !== run) return;
      if (!ok) return walk(k, id, mine, clip.state === 'failed' ? 'file failed' : 'file late');

      const video = makeVideo(clip.url, id) as FrameVideo;
      const sc = clip.info.scare;
      let shown = false;
      let triedDirect = false;
      let creaked = false;
      let counted = false;
      let settling = false;
      let over = false;
      // The end: the pose is up (or coming up), the chapter is at rest.
      const finish = () => {
        if (mine !== run || over) return;
        over = true;
        window.cancelAnimationFrame(clock);
        playing = null;
        pushOut();
        played++;
        set('played', played);
        rest(k);
      };
      const settle = (ms: number) => {
        if (settling) return;
        settling = true;
        show(poses[k], ms);
        window.setTimeout(finish, ms + 30);
      };
      const fail = (why: string) => {
        if (mine !== run || shown) return;
        release(video);
        playing = null;
        walk(k, id, mine, why);
      };
      const reveal = () => {
        if (mine !== run || shown) return;
        shown = true;
        window.clearTimeout(watchdog);
        set('mode', 'video');
        show(video, VIDEO_FADE_MS);
      };
      // The beat counts once the open door has been on screen: from then on this session gets
      // the variant without it.
      const present = (t: number) => {
        if (!sc || counted || !shown || t < sc.at + 4 / 24 || t >= sc.end) return;
        counted = true;
        once(SCARE_KEY);
        beats++;
        set('scareBeats', beats);
      };
      const watchdog = window.setTimeout(() => fail('no frame'), FRAME_WAIT_MS);
      video.addEventListener('error', () => {
        if (mine !== run || shown) return;
        // a browser that will not play from memory gets the file's own address, once
        if (!triedDirect) {
          triedDirect = true;
          video.src = clip.direct;
          video.playbackRate = rate();
          video.play().catch(() => fail('play refused'));
          return;
        }
        fail('media error');
      });
      video.addEventListener('ended', () => {
        if (mine !== run) return;
        if (!shown) return fail('no frame');
        settle(VIDEO_FADE_MS);
      });
      if (video.requestVideoFrameCallback) {
        const onFrame: FrameCallback = (_now, meta) => {
          if (mine !== run) return;
          reveal();
          present(meta.mediaTime);
          if (!video.ended) video.requestVideoFrameCallback?.(onFrame);
        };
        video.requestVideoFrameCallback(onFrame);
      }
      const tick = () => {
        if (mine !== run) return;
        const t = video.currentTime;
        if (t > 0 && !video.requestVideoFrameCallback) {
          reveal();
          present(t);
        }
        if (shown) setCaps(cuesAt(clip.info.cues, t));
        // (a little longer than what is left of the video, so the video is still there under it)
        if (shown && t >= clip.info.duration - SETTLE_S) settle((SETTLE_S * 1000 + 80) / rate());
        if (sc && shown) {
          if (!creaked && t >= sc.at && t < sc.end) {
            creaked = true;
            doorCreak(sc.end - sc.at);
            pushIn(sc);
          }
          if (creaked && t >= sc.end) pushOut();
        }
        clock = requestAnimationFrame(tick);
      };
      playing = video;
      video.play().then(
        () => {
          if (mine === run) clock = requestAnimationFrame(tick);
        },
        (e: unknown) => fail(`play refused: ${(e as Error)?.name ?? ''}`),
      );
    });
  };

  // --- from one stop to another ---
  const go = (to: number, speed: number, now: number) => {
    const from = chapter;
    chapter = to;
    set('chapter', to);
    if (to > from) {
      // Forwards. Chapters that were passed over show their end pose; the one the visitor is
      // heading for plays, unless the page is flying.
      const interrupted = state === 'play';
      stopPlayback();
      if (interrupted || to - from > 1) show(poses[to - 1], FADE_MS);
      state = 'play';
      set('state', 'play');
      setCaps(() => false);
      if (speed <= FAST_PX_MS && !interrupted) return begin(to);
      // Too fast to start, or a cut to the end pose that has to land before the next chapter
      // moves off it: the chapter waits. It starts with the next slow reading of the scroll
      // position, or when the page comes to rest, or here if nothing more is heard.
      pending = to;
      notBefore = interrupted ? now + FADE_MS : 0;
      const mine = run;
      window.setTimeout(
        () => {
          if (mine === run && pending === to && performance.now() - lastT > 100 && onStage(window.scrollY)) begin(to);
        },
        interrupted ? FADE_MS + 20 : 400,
      );
    } else {
      // Backwards: the pose of the stop before, nothing plays.
      stopPlayback();
      show(poses[to], FADE_MS);
      rest(to);
    }
  };

  // --- reading the scroll position ---
  let lastY = window.scrollY;
  let lastT = 0;
  let speed = 0;
  let raf = 0;
  let corrections = 0;
  let correctTimer = 0;
  const sample = (now: number) => {
    raf = 0;
    const y = window.scrollY;
    // the first reading after a pause is taken as one frame's movement
    const dt = lastT && now - lastT < 250 ? Math.max(1, now - lastT) : 1000 / 60;
    speed = Math.abs(y - lastY) / dt;
    lastY = y;
    lastT = now;
    const rel = y - stop0;
    let to = chapter;
    if (rel > anchor * step + INTENT_PX) {
      to = clamp(Math.ceil((rel - INTENT_PX) / step), 0, LAST);
      anchor = clamp(Math.floor((rel - INTENT_PX) / step), 0, LAST);
    } else if (rel < anchor * step - INTENT_PX) {
      to = clamp(Math.floor((rel + INTENT_PX) / step), 0, LAST);
      anchor = clamp(Math.ceil((rel + INTENT_PX) / step), 0, LAST);
    }
    // arrived on the stop of its chapter: from here on that stop is the one to leave
    if (to === chapter && Math.abs(rel - chapter * step) <= INTENT_PX) anchor = chapter;
    if (to !== chapter) go(to, speed, now);
    else if (pending === chapter && pending > 0 && speed <= FAST_PX_MS && now >= notBefore && onStage(y)) begin(chapter);
  };
  // Is the stage still what the visitor is looking at? (Past the last stop it scrolls away.)
  const onStage = (y: number) => y <= stop0 + LAST * step + screen * 0.25;
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(sample);
  };

  // The page has come to rest.
  const onSettle = () => {
    // a jump ends before the next frame: read where it went first
    window.cancelAnimationFrame(raf);
    sample(performance.now());
    const y = window.scrollY;
    lastY = y;
    lastT = 0;
    speed = 0;
    const rel = y - stop0;
    if (pending === chapter && pending > 0) {
      // a pass that ended here plays the chapter it ended on; one that left has only its pose
      if (onStage(y) && visible) begin(chapter);
      else {
        stopPlayback();
        show(poses[chapter], 0);
        rest(chapter);
      }
    }
    // Between the first stop and the last the page rests on the stop of its chapter. If the
    // browser left it elsewhere (it snapped back, or it does not snap), take it there.
    const want = chapter * step;
    const between = rel > -INTENT_PX && rel < LAST * step + INTENT_PX;
    const free = (chapter === 0 && rel <= 0) || (chapter === LAST && rel >= want);
    if (between && !free && Math.abs(rel - want) > 2) {
      // not while the visitor is still turning the wheel or has a finger down: once they pause
      const quiet = performance.now() - lastInput;
      if (quiet < INPUT_QUIET_MS) {
        window.clearTimeout(correctTimer);
        correctTimer = window.setTimeout(() => {
          if (performance.now() - lastT > 100 || !lastT) onSettle();
        }, INPUT_QUIET_MS - quiet + 20);
        return;
      }
      if (corrections < 3) {
        corrections++;
        // at once: the stage is pinned, so nothing is seen to move, and a jump cannot get in
        // the way of the next gesture as a glide would
        try {
          window.scrollTo({ top: Math.round(stop0 + want), behavior: 'instant' });
        } catch {
          window.scrollTo(0, Math.round(stop0 + want)); // a browser from before 'instant'
        }
        return;
      }
      // the page will not go there: believe the page
      const here = clamp(Math.round(rel / step), 0, LAST);
      if (here !== chapter) {
        stopPlayback();
        chapter = here;
        set('chapter', here);
        show(poses[here], FADE_MS);
        rest(here);
      }
    }
    corrections = 0;
    anchor = chapter;
  };
  let settleTimer = 0;
  let touching = false;
  const hasScrollEnd = 'onscrollend' in window;
  const settleSoon = () => {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (touching) return settleSoon();
      onSettle();
    }, 160);
  };

  // --- loading: nothing but the poster until the visitor does something ---
  const firstInput = () => {
    if (started) return;
    started = true;
    events.forEach((ev) => window.removeEventListener(ev, firstInput));
    loadPoses();
    // the full first pose over the small poster, if the visitor is still at the start
    if (chapter === 0 && state === 'rest') show(poses[0], FADE_MS);
    preload(chapter);
  };
  const events = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'pointermove', 'keydown'];
  events.forEach((ev) => window.addEventListener(ev, firstInput, { passive: true }));
  // No input at all: once the page has been idle well after load, take the same head start.
  const afterLoad = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    window.setTimeout(() => (ric ? ric(firstInput, { timeout: 3000 }) : firstInput()), 8000);
  };
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });

  // --- start: wherever the page is (a reload restores the scroll position), at rest ---
  measure();
  chapter = clamp(Math.round((window.scrollY - stop0) / step), 0, LAST);
  anchor = chapter;
  set('chapter', chapter);
  if (chapter > 0) {
    // the pose is needed before any input: the page was reloaded inside the corridor
    loadPoses();
    show(poses[chapter], 0);
  }
  // any real input says the visitor is still at it: the page is not moved under their hand
  let lastInput = 0;
  const noteInput = () => {
    lastInput = performance.now();
  };
  for (const ev of ['wheel', 'touchstart', 'touchmove', 'keydown']) window.addEventListener(ev, noteInput, { passive: true });
  rest(chapter);

  new ResizeObserver(measure).observe(section);
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  if (hasScrollEnd) window.addEventListener('scrollend', onSettle, { passive: true });
  else {
    // no scrollend: a pause in the scroll events, once the finger is off the glass
    window.addEventListener('scroll', settleSoon, { passive: true });
    window.addEventListener('touchstart', () => (touching = true), { passive: true });
    for (const ev of ['touchend', 'touchcancel']) {
      window.addEventListener(
        ev,
        () => {
          touching = false;
          settleSoon();
        },
        { passive: true },
      );
    }
  }
  new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
    if (visible) return;
    // Off screen: whatever was playing is over, and the stage waits on a still.
    if (state === 'play' || playing || videos.size) {
      stopPlayback();
      show(poses[chapter], 0);
      rest(chapter);
    }
  }).observe(section);
  document.addEventListener('visibilitychange', () => {
    if (!playing) return;
    if (document.hidden) playing.pause();
    else playing.play().catch(() => {});
  });
  // Turning the phone changes the set: the walk starts over from the pose of this stop.
  narrow.addEventListener('change', () => {
    const name: SetName = narrow.matches ? 'mobile' : 'desktop';
    if (name === setName || !manifest.sets[name]) return;
    stopPlayback();
    for (const v of [...videos]) release(v);
    for (const c of clips.values()) if (c.url) URL.revokeObjectURL(c.url);
    clips.clear();
    codecAsked = null;
    codec = null;
    setName = name;
    info = manifest.sets[name];
    set('set', name);
    posesAsked = false;
    if (started) {
      loadPoses();
      preload(chapter);
    }
    show(poses[chapter], 0);
    rest(chapter);
  });
}
