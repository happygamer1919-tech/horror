// Lighthouse, mobile emulation (the Lighthouse default), against the deployed site.
// Usage: node scripts/lighthouse.mjs [url]
// Exits 1 when Performance < 85 or Accessibility < 95.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'https://lastquestmd.com/ro/';
const out = `.lighthouse/${url.replace(/[^a-z0-9]+/gi, '-')}.json`;
mkdirSync('.lighthouse', { recursive: true });

execFileSync(
  'npx',
  ['lighthouse', url, '--quiet', '--output=json', `--output-path=${out}`, '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless=new'],
  { stdio: 'inherit' },
);

const r = JSON.parse(readFileSync(out, 'utf8'));
const score = (k) => Math.round(r.categories[k].score * 100);
const perf = score('performance');
const a11y = score('accessibility');
console.log(`${url}`);
console.log(`  performance ${perf}  accessibility ${a11y}  best-practices ${score('best-practices')}  seo ${score('seo')}`);
for (const k of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index']) {
  console.log(`  ${k}: ${r.audits[k].displayValue}`);
}
const failing = Object.values(r.audits).filter((a) => a.score !== null && a.score < 1 && r.categories.accessibility.auditRefs.some((x) => x.id === a.id));
for (const a of failing) console.log(`  a11y issue: ${a.id}: ${a.title}`);
if (perf < 85 || a11y < 95) process.exit(1);
