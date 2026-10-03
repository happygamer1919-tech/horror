// Measures what the reviewers measure on a still: the share of pixels at luma 0 to 3 and at
// pure black, the luma percentiles, and (with --col=x) the luma down one pixel column.
//   node corridor3d/still-stats.mjs a.png b.png ... [--col=1300]
import sharp from 'sharp';
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const col = (process.argv.find((a) => a.startsWith('--col=')) ?? '').slice(6);
for (const f of files) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const hist = new Uint32Array(256);
  let dark = 0;
  let zero = 0;
  for (let i = 0; i < data.length; i += 3) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    hist[Math.round(l)]++;
    if (l <= 3) dark++;
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) zero++;
  }
  const pct = (q) => {
    let c = 0;
    for (let v = 0; v < 256; v++) {
      c += hist[v];
      if (c >= q * n) return v;
    }
    return 255;
  };
  console.log(`${f.split('/').pop()}  luma 0-3: ${((100 * dark) / n).toFixed(1)} %  pure 0: ${((100 * zero) / n).toFixed(2)} %  p5 ${pct(0.05)} p25 ${pct(0.25)} p50 ${pct(0.5)} p75 ${pct(0.75)} p95 ${pct(0.95)} p99.5 ${pct(0.995)}`);
  if (col) {
    const x = Math.min(info.width - 1, Number(col));
    const out = [];
    for (let y = 0; y < info.height; y += Math.round(info.height / 30)) {
      const i = (y * info.width + x) * 3;
      out.push(`${y}:${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    console.log(`  column ${x}: ${out.join(' ')}`);
  }
}
