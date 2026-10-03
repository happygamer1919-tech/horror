// Hands the review stills to the reviewers: copies the PNGs of out/stills/, writes a JPEG
// (quality 92) of each and a 2 x 3 contact sheet. No GPU needed.
//   node corridor3d/publish-stills.mjs <target dir> [--from=corridor3d/out/stills]
import { mkdir, copyFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));

export async function publish(from, to) {
  const names = JSON.parse(await readFile(join(here, 'stills.json'), 'utf8')).stills.map((st) => st.name);
  await mkdir(to, { recursive: true });
  for (const n of names) {
    const src = join(from, `${n}.png`);
    await access(src); // every still must be there: a sheet with a hole in it is not a review set
    await copyFile(src, join(to, `${n}.png`));
    await sharp(src).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(join(to, `${n}.jpg`));
  }
  const cw = 800;
  const ch = 450;
  const cells = await Promise.all(names.map((n) => sharp(join(from, `${n}.png`)).resize(cw, ch, { fit: 'fill' }).toBuffer()));
  await sharp({ create: { width: 3 * cw, height: 2 * ch, channels: 3, background: '#000' } })
    .composite(cells.map((input, k) => ({ input, left: (k % 3) * cw, top: Math.floor(k / 3) * ch })))
    .jpeg({ quality: 92 })
    .toFile(join(to, 'sheet.jpg'));
  return names;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const to = process.argv[2];
  if (!to || to.startsWith('--')) {
    console.error('usage: node corridor3d/publish-stills.mjs <target dir> [--from=dir]');
    process.exit(1);
  }
  const from = (process.argv.find((a) => a.startsWith('--from=')) ?? `--from=${join(here, 'out', 'stills')}`).slice(7);
  const names = await publish(from, to);
  console.log(`published ${names.length} stills (png, jpg) and sheet.jpg to ${to}`);
}
