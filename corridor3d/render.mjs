// Render driver: opens the harness in Playwright Chromium (real GPU through ANGLE Metal when
// there is one) and steps the walk frame by frame. Deterministic: progress in, PNG out.
//
//   node corridor3d/render.mjs                 everything: both walks, then the scare frames
//   node corridor3d/render.mjs preview --set=desktop --frames=0,40,80 --scale=0.5 --samples=32
//   node corridor3d/render.mjs shots --file=corridor3d/shots.json --scale=0.6 --only=a-shoe
//   node corridor3d/render.mjs full --set=both --samples=48 [--from=0 --to=167] [--force]
//   node corridor3d/render.mjs scare --set=both --samples=64 [--force]
//   node corridor3d/render.mjs stills [--samples=320] [--only=1-start,5-scare] [--scale=1] [--publish=dir]
//                                              the six review keyframes of stills.json, to out/stills/
//   node corridor3d/render.mjs tex --mat=paperL4,carpet2,door313   a baked texture, to out/tex/
//   node corridor3d/render.mjs strat           debug: is the tracer's stratified sample table even?
// Any mode: --haze=0.01 puts a true haze volume in the tracer (off by default, see the README).
//
// Frames that already exist are skipped, so an interrupted run can simply be started again.
//
// Output goes to corridor3d/out/ (gitignored). `npm run corridor:encode` turns it into the
// shipped frames under public/corridor/.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { startServer, ROOT } from './server.mjs';
import { SETS, SCARE_FRAMES, scareFrameIndex } from './src/layout.js';

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) ?? 'all';
const flag = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : args.includes(`--${name}`) ? true : def;
};
const OUT = join(ROOT, 'corridor3d', 'out');
const exists = (p) => access(p).then(() => true, () => false);
const pad = (n) => String(n).padStart(3, '0');

// One GPU client at a time: a browser test run on the GPU while a frame is traced can hand back
// a stale or half-drawn canvas without any error. So before the browser starts and before every
// frame, wait until no Playwright test run is alive on this machine.
// (Only the runner itself counts: a shell whose command line merely mentions the words, such as
// the one that started this render after checking for it, must not make the render wait for ever.)
const busy = () =>
  new Promise((resolve) =>
    execFile('pgrep', ['-fl', 'playwright test'], (err, out) => {
      if (err) return resolve(false);
      const runners = out.split('\n').filter((l) => /^\d+ (\S*node|npm exec|\S*npx)\b/.test(l) && !l.includes('render.mjs'));
      resolve(runners.length > 0);
    }),
  );
async function quiet() {
  let waited = 0;
  while (await busy()) {
    if (waited % 60 === 0) console.log('a Playwright test run is using the GPU: waiting for it to finish');
    await new Promise((r) => setTimeout(r, 3000));
    waited += 3;
  }
  if (waited) await new Promise((r) => setTimeout(r, 2000));
  return waited;
}

const { server, port } = await startServer();
let browser;
let page;
async function boot() {
  await quiet();
  if (browser) await limit(browser.close(), 20000).catch(() => {});
  const gpuArgs = flag('software', false)
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: [...gpuArgs, '--disable-gpu-watchdog', '--disable-renderer-backgrounding'] });
  page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || (m.type() === 'warning' && !/deprecated/i.test(t))) console.log(`[page ${m.type()}]`, t.slice(0, 400));
  });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${port}/corridor3d/index.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  if (flag('fig', null)) await page.evaluate((f) => (window.__fig = f), JSON.parse(String(flag('fig'))));
  const init = { textureSize: Number(flag('tex', 2048)) };
  if (flag('haze', null) != null) init.haze = Number(flag('haze'));
  const info = await page.evaluate((o) => window.corridor.init(o), init);
  console.log(`renderer: ${info.gpu}`);
  console.log(`triangles (static): ${info.triangles}`);
  return info;
}

// The PNG last written. With another GPU client busy (a second render, a browser test run), the
// canvas can come back unchanged from the frame before: no error, just the old picture again.
// Two different frames are never byte-identical, so an identical one means "retry".
let lastPng = '';
const limit = (p, ms) => {
  let t;
  return Promise.race([p, new Promise((_, rej) => (t = setTimeout(() => rej(new Error(`no answer in ${ms / 1000} s`)), ms)))]).finally(() => clearTimeout(t));
};
async function shoot(opts, file) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await quiet();
      // a GPU that hangs instead of failing: give up on the attempt after three minutes (longer
      // for a still: about half a second a sample at full size)
      const res = await limit(page.evaluate((o) => window.corridor.frame(o), opts), Math.max(180000, (opts.samples ?? 32) * 2000 * (opts.scale ?? 1) ** 2 + 60000));
      const data = await limit(page.evaluate(() => window.corridor.png()), 150000);
      if (data === lastPng) throw new Error('the canvas did not change (stale frame)');
      lastPng = data;
      await writeFile(file, Buffer.from(data.split(',')[1], 'base64'));
      return res;
    } catch (e) {
      console.log(`frame failed (${e.message.split('\n')[0]}), restarting the browser`);
      await boot();
    }
  }
  throw new Error(`gave up on ${file}`);
}

// The scare frames must be rendered exactly like the walk frame they are laid over (same seed,
// same sample count): then they differ from it only where the door moved.
const WALK_SAMPLES = 64;
const STILL_SAMPLES = 320;
const SCARE_SAMPLES = WALK_SAMPLES;
const samples = Number(flag('samples', mode === 'stills' ? STILL_SAMPLES : mode === 'scare' ? SCARE_SAMPLES : mode === 'full' || mode === 'all' ? WALK_SAMPLES : 32));
const scale = Number(flag('scale', 1));
const which = flag('set', mode === 'all' ? 'both' : 'desktop');
const sets = which === 'both' ? ['desktop', 'mobile'] : [which];
await boot();
const started = Date.now();

if (mode === 'probe') {
  // debug: float means of a wall patch and a carpet patch of frame 0, in a traced half and after the denoiser
  await page.evaluate((o) => window.corridor.frame(o), { set: 'desktop', index: 0, scale: 0.3, samples: Number(flag('samples', 64)), ...JSON.parse(String(flag('opts', '{}'))) });
  for (const [what, rect] of [['wall', [0.72, 0.4, 0.84, 0.62]], ['carpet', [0.45, 0.05, 0.55, 0.2]]]) {
    for (const t of ['a', 'b', 'hdr']) console.log(what, t, JSON.stringify(await page.evaluate(([n, r]) => window.corridor.probe(n, r), [t, rect])));
  }
} else if (mode === 'strat') {
  await page.evaluate((o) => window.corridor.frame(o), { set: 'desktop', index: 0, scale: 0.1, samples: 2 });
  console.log(JSON.stringify(await page.evaluate(() => window.corridor.strat(200)), null, 1).slice(0, 3000));
} else if (mode === 'stills') {
  // The review keyframes: real frames of the walk, through the whole pipeline exactly as a
  // shipped frame goes, only with more samples. stills.json fixes them for every review round.
  const { readFile } = await import('node:fs/promises');
  const dir = flag('out', join(OUT, 'stills'));
  await mkdir(dir, { recursive: true });
  const list = JSON.parse(await readFile(join(ROOT, 'corridor3d', 'stills.json'), 'utf8')).stills;
  const only = flag('only', null) ? String(flag('only')).split(',') : null;
  const done = [];
  for (const st of list) {
    if (only && !only.includes(st.name)) continue;
    const set = st.set ?? 'desktop';
    const index = st.frame === 'scare' ? scareFrameIndex(set) : st.frame;
    const opts = { set, index, scale, samples, ...JSON.parse(String(flag('opts', '{}'))) };
    if (st.scare) opts.scare = st.scare;
    const file = join(dir, `${st.name}.png`);
    const t0 = Date.now();
    const res = await shoot(opts, file);
    console.log(`${st.name}.png  frame ${index}  s=${res.s.toFixed(2)}  focus ${res.focus.toFixed(2)} m  lamps=${res.lamps}  ${res.samples} spp  trace ${(res.trace / 1000).toFixed(1)}s  total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    done.push(st.name);
  }
  if (flag('publish', null)) {
    // PNG, JPEG (quality 92) and a 2 x 3 contact sheet, for the reviewers
    const { publish } = await import('./publish-stills.mjs');
    const names = await publish(dir, String(flag('publish')));
    console.log(`published ${names.length} stills and sheet.jpg to ${flag('publish')}`);
  }
} else if (mode === 'tex') {
  // look at a baked texture: --mat=paperL4,carpet2,door313 [--slot=map]
  const dir = flag('out', join(OUT, 'tex'));
  await mkdir(dir, { recursive: true });
  for (const mat of String(flag('mat')).split(',')) {
    const data = await page.evaluate(([m, slot]) => window.corridor.texture(m, slot), [mat, flag('slot', 'map')]);
    await writeFile(join(dir, `${mat}.png`), Buffer.from(data.split(',')[1], 'base64'));
    console.log(`${mat}.png`);
  }
} else if (mode === 'preview') {
  const dir = flag('out', join(OUT, 'preview'));
  await mkdir(dir, { recursive: true });
  for (const set of sets) {
    const n = SETS[set].frames;
    const list = flag('frames', null)
      ? String(flag('frames')).split(',').map(Number)
      : [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => Math.round(p * (n - 1)));
    const scare = flag('scare', null);
    const written = new Set();
    for (const index of list) {
      const opts = { set, index, scale, samples, ...JSON.parse(String(flag('opts', '{}'))) };
      if (flag('nodenoise', false)) opts.denoise = false;
      if (flag('cam', null)) {
        // --cam=x,y,s,tx,ty,ts[,fov] --at=<walker s for the lamp state> --name=<file>
        const c = String(flag('cam')).split(',').map(Number);
        opts.cam = { p: c.slice(0, 3), t: c.slice(3, 6), fov: c[6] };
        if (flag('at', null)) {
          opts.s = Number(flag('at'));
          delete opts.index;
        }
      }
      if (flag('s', null)) {
        opts.s = Number(flag('s'));
        delete opts.index;
      }
      let name = flag('name', null) ?? `${set}-${pad(index)}`;
      // the same frame twice in one run (a determinism check) gets a suffix the second time
      if (written.has(name)) name += '-again';
      written.add(name);
      if (scare) {
        const [j, variant] = String(scare).split(':');
        opts.index = scareFrameIndex(set);
        opts.scare = { j: Number(j), variant: variant ?? 'face' };
        name = flag('name', null) ?? `${set}-scare-${pad(Number(j))}-${opts.scare.variant}`;
      }
      const res = await shoot(opts, join(dir, `${name}.png`));
      console.log(`${name}.png  s=${res.s.toFixed(2)} lamps=${res.lamps} scene=${res.scene.toFixed(0)}ms trace=${res.trace.toFixed(0)}ms total=${res.total.toFixed(0)}ms`);
      if (scare || flag('cam', null)) break;
    }
  }
} else if (mode === 'shots') {
  // a JSON list of { name, set, index | s, cam: { p, t, fov }, scare: { j, variant }, scale, samples }
  const dir = flag('out', join(OUT, 'preview'));
  await mkdir(dir, { recursive: true });
  const { readFile } = await import('node:fs/promises');
  const list = JSON.parse(await readFile(flag('file'), 'utf8'));
  for (const shot of list) {
    if (flag('only', null) && !String(flag('only')).split(',').includes(shot.name)) continue;
    const opts = { set: 'desktop', scale, samples, ...shot };
    if (opts.scare && opts.index == null && opts.s == null) opts.index = scareFrameIndex(opts.set);
    const res = await shoot(opts, join(dir, `${shot.name}.png`));
    console.log(`${shot.name}.png  s=${res.s.toFixed(2)} lamps=${res.lamps} ${(res.total / 1000).toFixed(1)}s`);
  }
}
if (mode === 'full' || mode === 'all') {
  for (const set of sets) {
    const dir = join(OUT, set, 'walk');
    await mkdir(dir, { recursive: true });
    const n = SETS[set].frames;
    const from = Number(flag('from', 0));
    const to = Number(flag('to', n - 1));
    let sum = 0;
    let count = 0;
    for (let index = from; index <= to; index++) {
      const file = join(dir, `${pad(index)}.png`);
      if (!flag('force', false) && (await exists(file))) continue;
      const res = await shoot({ set, index, scale, samples }, file);
      sum += res.total;
      count++;
      console.log(`${set} ${pad(index)}/${n - 1}  s=${res.s.toFixed(2)}  ${(res.total / 1000).toFixed(1)}s  avg ${(sum / count / 1000).toFixed(1)}s  elapsed ${((Date.now() - started) / 60000).toFixed(1)}min`);
    }
  }
}
if (mode === 'scare' || mode === 'all') {
  const samples = Number(flag('samples', SCARE_SAMPLES));
  for (const set of sets) {
    const dir = join(OUT, set, 'scare');
    await mkdir(dir, { recursive: true });
    const index = scareFrameIndex(set);
    const quads = [];
    // the held walk frame, rendered here with the same seed and sample count as every scare
    // frame, so that the frames differ only where the door moved
    await shoot({ set, index, scale, samples }, join(dir, 'hold.png'));
    for (const variant of ['face', 'gap']) {
      for (let j = 1; j < SCARE_FRAMES - 1; j++) {
        const file = join(dir, `${variant}-${pad(j)}.png`);
        if (!flag('force', false) && (await exists(file))) continue;
        const res = await shoot({ set, index, scale, samples, scare: { j, variant } }, file);
        console.log(`${set} scare ${variant} ${j}  ${(res.total / 1000).toFixed(1)}s`);
      }
    }
    for (let j = 0; j < SCARE_FRAMES; j++) quads.push(await page.evaluate(([o, jj]) => window.corridor.scareQuad(o, jj), [{ set, index, scale }, j]));
    await writeFile(join(dir, 'meta.json'), JSON.stringify({ set, index, frames: SCARE_FRAMES, quads }, null, 1));
  }
}
console.log(`done in ${((Date.now() - started) / 60000).toFixed(1)} min`);
await browser.close();
server.close();
