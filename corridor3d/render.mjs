// Render driver: opens the harness in Playwright Chromium (real GPU through ANGLE Metal when
// there is one) and steps the walk frame by frame. Deterministic: progress in, PNG out.
//
//   node corridor3d/render.mjs                 everything: both walks, then the scare frames
//   node corridor3d/render.mjs preview --set=desktop --frames=0,40,80 --scale=0.5 --samples=32
//   node corridor3d/render.mjs shots --file=corridor3d/shots.json --scale=0.6 --only=a-shoe
//   node corridor3d/render.mjs full --set=both --samples=48 [--from=0 --to=167] [--force]
//   node corridor3d/render.mjs scare --set=both --samples=64 [--force]
//
// Frames that already exist are skipped, so an interrupted run can simply be started again.
//
// Output goes to corridor3d/out/ (gitignored). `npm run corridor:encode` turns it into the
// shipped frames under public/corridor/.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, access } from 'node:fs/promises';
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

const { server, port } = await startServer();
let browser;
let page;
async function boot() {
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
  const info = await page.evaluate((o) => window.corridor.init(o), { textureSize: Number(flag('tex', 2048)) });
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
      // a GPU that hangs instead of failing: give up on the attempt after three minutes
      const res = await limit(page.evaluate((o) => window.corridor.frame(o), opts), 180000);
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
const WALK_SAMPLES = 48;
const SCARE_SAMPLES = WALK_SAMPLES;
const samples = Number(flag('samples', mode === 'scare' ? SCARE_SAMPLES : mode === 'full' || mode === 'all' ? WALK_SAMPLES : 32));
const scale = Number(flag('scale', 1));
const which = flag('set', mode === 'all' ? 'both' : 'desktop');
const sets = which === 'both' ? ['desktop', 'mobile'] : [which];
await boot();
const started = Date.now();

if (mode === 'preview') {
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
      const opts = { set, index, scale, samples };
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
