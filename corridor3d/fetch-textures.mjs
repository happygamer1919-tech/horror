// Downloads the CC0 source textures and models listed in assets.json into corridor3d/textures/
// (gitignored). Sources: Poly Haven (https://polyhaven.com, CC0) and ambientCG
// (https://ambientcg.com, CC0). See CREDITS.md.
// Usage: node corridor3d/fetch-textures.mjs [--res=1k]   (1k is what the shipped frames were rendered with,
// except the textures listed under "res" in assets.json, which are fetched at the size given there)
import { mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'textures');
const UA = 'horror-corridor-render (github.com/happygamer1919-tech/horror)';
const res = (process.argv.find((a) => a.startsWith('--res=')) ?? '--res=1k').slice(6);
const { textures, models, res: sizes = {}, ambientcg = {} } = JSON.parse(await readFile(join(here, 'assets.json'), 'utf8'));

const exists = (p) => access(p).then(() => true, () => false);
async function get(url, file, size = null) {
  // a texture asked for at another size than the one on disk is fetched again
  const mark = join(dirname(file), 'res.txt');
  const have = size ? await readFile(mark, 'utf8').catch(() => '1k') : null;
  if ((await exists(file)) && have === size) return false;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
  return true;
}
async function markRes(dir, size) {
  await writeFile(join(dir, 'res.txt'), size);
}
const api = async (id) => {
  const r = await fetch(`https://api.polyhaven.com/files/${id}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} files/${id}`);
  return r.json();
};

for (const [id, maps] of Object.entries(textures)) {
  const files = await api(id);
  const size = sizes[id] ?? res;
  for (const map of maps) {
    const entry = files[map]?.[size]?.jpg ?? files[map]?.[size]?.png;
    if (!entry) throw new Error(`no ${map} at ${size} for ${id}`);
    const ext = entry.url.split('.').pop();
    const fresh = await get(entry.url, join(out, id, `${map}.${ext}`), size);
    console.log(fresh ? 'downloaded' : 'cached    ', id, map, size);
  }
  await markRes(join(out, id), size);
}
for (const [id, mres] of Object.entries(models)) {
  const files = await api(id);
  const g = files.gltf?.[mres]?.gltf;
  if (!g) throw new Error(`no gltf at ${mres} for ${id}`);
  await get(g.url, join(out, 'models', id, `${id}.gltf`));
  for (const [rel, inc] of Object.entries(g.include ?? {})) await get(inc.url, join(out, 'models', id, rel));
  console.log('model     ', id);
}

// ambientCG ships a material as one zip: fetch it, keep the maps asked for (unzip is part of macOS
// and of every Linux image; no package needed), drop the archive.
const run = promisify(execFile);
for (const [id, { res: size, maps }] of Object.entries(ambientcg)) {
  const dir = join(out, id);
  const have = await readFile(join(dir, 'res.txt'), 'utf8').catch(() => null);
  const all = (await Promise.all(maps.map((m) => exists(join(dir, `${m}.jpg`))))).every(Boolean);
  if (all && have === size) {
    console.log('cached    ', id, size);
    continue;
  }
  await mkdir(dir, { recursive: true });
  const zip = join(dir, 'src.zip');
  const r = await fetch(`https://ambientcg.com/get?file=${id}_${size}.zip`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ambientcg ${id}`);
  await writeFile(zip, Buffer.from(await r.arrayBuffer()));
  for (const m of maps) {
    const { stdout } = await run('unzip', ['-p', zip, `${id}_${size}_${m}.jpg`], { encoding: 'buffer', maxBuffer: 1 << 28 });
    await writeFile(join(dir, `${m}.jpg`), stdout);
  }
  await rm(zip);
  await markRes(dir, size);
  console.log('downloaded', id, size);
}
