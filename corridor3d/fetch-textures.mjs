// Downloads the CC0 source textures and models listed in assets.json into corridor3d/textures/
// (gitignored). Sources: Poly Haven (https://polyhaven.com, CC0). See CREDITS.md.
// Usage: node corridor3d/fetch-textures.mjs [--res=1k]   (1k is what the shipped frames were rendered with)
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'textures');
const UA = 'horror-corridor-render (github.com/happygamer1919-tech/horror)';
const res = (process.argv.find((a) => a.startsWith('--res=')) ?? '--res=1k').slice(6);
const { textures, models } = JSON.parse(await readFile(join(here, 'assets.json'), 'utf8'));

const exists = (p) => access(p).then(() => true, () => false);
async function get(url, file) {
  if (await exists(file)) return false;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
  return true;
}
const api = async (id) => {
  const r = await fetch(`https://api.polyhaven.com/files/${id}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} files/${id}`);
  return r.json();
};

for (const [id, maps] of Object.entries(textures)) {
  const files = await api(id);
  for (const map of maps) {
    const entry = files[map]?.[res]?.jpg ?? files[map]?.[res]?.png;
    if (!entry) throw new Error(`no ${map} at ${res} for ${id}`);
    const ext = entry.url.split('.').pop();
    const fresh = await get(entry.url, join(out, id, `${map}.${ext}`));
    console.log(fresh ? 'downloaded' : 'cached    ', id, map);
  }
}
for (const [id, mres] of Object.entries(models)) {
  const files = await api(id);
  const g = files.gltf?.[mres]?.gltf;
  if (!g) throw new Error(`no gltf at ${mres} for ${id}`);
  await get(g.url, join(out, 'models', id, `${id}.gltf`));
  for (const [rel, inc] of Object.entries(g.include ?? {})) await get(inc.url, join(out, 'models', id, rel));
  console.log('model     ', id);
}
