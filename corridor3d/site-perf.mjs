// Measures the corridor on the built site while it is scrolled through: long tasks on the
// main thread and the spacing of animation frames, at phone size with the CPU slowed 4x,
// and at desktop size. Run `npm run build` first.
//   node corridor3d/site-perf.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './server.mjs';

const PORT = 4343;
const server = spawn('node', [join(ROOT, 'scripts', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
try {
  for (const s of [
    { name: 'phone 390x844, CPU 4x slower', w: 390, h: 844, dpr: 2, mobile: true, cpu: 4 },
    { name: 'desktop 1440x900', w: 1440, h: 900, dpr: 1, mobile: false, cpu: 1 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, isMobile: s.mobile, hasTouch: s.mobile });
    await ctx.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await page.goto(`http://localhost:${PORT}/horror/ro/`, { waitUntil: 'load' });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: s.cpu });
    const res = await page.evaluate(async () => {
      const long = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] });
      const el = document.getElementById('corridor');
      const top = window.scrollY + el.getBoundingClientRect().top;
      const end = top + el.offsetHeight - window.innerHeight;
      window.scrollTo(0, top - 200);
      await new Promise((r) => setTimeout(r, 1500));
      const canvas = document.querySelector('[data-corridor]');
      const d0 = Number(canvas.dataset.draws || 0);
      // a steady walk: the whole corridor in 12 seconds, driven every animation frame
      const gaps = [];
      const coarse = { full: 0, near: 0, coarse: 0, poster: 0 };
      let last = performance.now();
      const t0 = last;
      await new Promise((done) => {
        const tick = (now) => {
          gaps.push(now - last);
          last = now;
          const t = Math.min(1, (now - t0) / 12000);
          window.scrollTo(0, top + (end - top) * t);
          coarse[canvas.dataset.quality] = (coarse[canvas.dataset.quality] || 0) + 1;
          if (t < 1) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      gaps.sort((a, b) => a - b);
      const q = (p) => Math.round(gaps[Math.floor(gaps.length * p)] * 10) / 10;
      return { frames: gaps.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: Math.round(gaps[gaps.length - 1]), longTasks: long.length, longest: Math.max(0, ...long), draws: Number(canvas.dataset.draws) - d0, shown: coarse, set: canvas.dataset.set, backing: `${canvas.width}x${canvas.height}` };
    });
    console.log(s.name);
    console.log(`  set ${res.set}, canvas backing store ${res.backing}`);
    console.log(`  animation frames ${res.frames}: gap p50 ${res.p50} ms, p95 ${res.p95} ms, p99 ${res.p99} ms, max ${res.max} ms`);
    console.log(`  long tasks (over 50 ms): ${res.longTasks}, longest ${res.longest} ms`);
    console.log(`  canvas draws ${res.draws}; frame quality when sampled: ${JSON.stringify(res.shown)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
