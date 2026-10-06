// Layer evidence: which composited layers the page has on a phone, how big they are, why
// Chrome made them, and how often each is repainted during a short scroll.
// Usage (site served on PW_PORT, see docs/perf-notes.md):
//   PW_PORT=4334 node tests/perf/layers.mjs [scrollY ...]
// Prints one table per scroll position (default: hero, corridor, a text section).
import { chromium } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 4323);
const DPR = 3;
const positions = process.argv.slice(2).map(Number);

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: DPR,
  isMobile: true,
  hasTouch: true,
});
await context.addInitScript(() => sessionStorage.setItem('hotel:lift', '1'));
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
await page.goto(`http://localhost:${PORT}/horror/ro/`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

let layers = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => {
  if (e.layers) layers = e.layers;
});
await cdp.send('DOM.enable');
await cdp.send('LayerTree.enable');

const describe = async (backendNodeId) => {
  if (!backendNodeId) return '(no node)';
  try {
    const { node } = await cdp.send('DOM.describeNode', { backendNodeId });
    const attrs = node.attributes ?? [];
    const get = (k) => {
      const i = attrs.indexOf(k);
      return i >= 0 ? attrs[i + 1] : '';
    };
    const cls = get('class');
    const id = get('id');
    return `${node.localName || node.nodeName}${id ? `#${id}` : ''}${cls ? `.${cls.split(/\s+/).slice(0, 2).join('.')}` : ''}`;
  } catch {
    return '(gone)';
  }
};

const sections = await page.evaluate(() => {
  const y = (sel) => {
    const el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : 0;
  };
  return { hero: 0, corridor: y('#corridor'), file: y('#file') + 200, checkin: y('#checkin') };
});
const stops = positions.length ? positions.map((y) => [`y=${y}`, y]) : Object.entries(sections);

for (const [name, y] of stops) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(900);
  const before = new Map(layers.map((l) => [l.layerId, l.paintCount]));
  // A short touch scroll, there and back, to see what repaints.
  for (const d of [-300, 300]) {
    await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 500, yDistance: d, speed: 900, gestureSourceType: 'touch', preventFling: true });
  }
  await page.waitForTimeout(600);
  const rows = [];
  for (const l of layers) {
    if (!l.drawsContent) continue;
    let reasons = [];
    try {
      reasons = (await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId })).compositingReasonIds ?? [];
    } catch {
      /* layer went away */
    }
    const mb = (l.width * DPR * l.height * DPR * 4) / 1048576;
    rows.push({
      node: await describe(l.backendNodeId),
      css: `${Math.round(l.width)}x${Math.round(l.height)}`,
      'full raster MB': Number(mb.toFixed(1)),
      'screens': Number(((l.width * l.height) / (390 * 844)).toFixed(1)),
      repaints: l.paintCount - (before.get(l.layerId) ?? 0),
      why: reasons.join(', '),
    });
  }
  rows.sort((a, b) => b['full raster MB'] - a['full raster MB']);
  console.log(`\n== ${name} (scrollY ${y}): ${rows.length} painted layers, ${rows.reduce((s, r) => s + r['full raster MB'], 0).toFixed(0)} MB if fully rastered`);
  console.table(rows.slice(0, 14));
}
await browser.close();
