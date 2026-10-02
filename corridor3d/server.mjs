// Static server for the authoring harness. Serves the repository root so the harness can
// import three.js straight from node_modules through an import map. Offline tool, never deployed.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.exr': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

export function startServer(port = 0) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const file = join(ROOT, normalize(decodeURIComponent(url.pathname)));
      if (!file.startsWith(ROOT)) return res.writeHead(403).end();
      try {
        const s = await stat(file);
        if (s.isDirectory()) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await readFile(file));
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}
