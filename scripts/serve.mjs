// Minimal static server for tests and screenshots: serves dist/ under the /horror base path,
// the same way GitHub Pages does (including 404.html). No dependencies.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const BASE = '/horror';
const port = Number(process.env.PORT ?? 4321);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path === BASE) {
    res.writeHead(301, { Location: `${BASE}/` }).end();
    return;
  }
  const send404 = async () => {
    const body = await readFile(join(root, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'Content-Type': types['.html'] }).end(body);
  };
  if (!path.startsWith(`${BASE}/`)) return send404();
  path = normalize(path.slice(BASE.length));
  let file = join(root, path);
  if (!file.startsWith(root)) return send404();
  try {
    const s = await stat(file);
    if (s.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${url.pathname}/` }).end();
        return;
      }
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    const type = types[extname(file)] ?? 'application/octet-stream';
    // Byte ranges, as GitHub Pages answers them: Safari asks for a video in ranges and will
    // not play one from a server that ignores them.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const from = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
      const to = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      if (from > to || from >= body.length) {
        res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }).end();
        return;
      }
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${from}-${to}/${body.length}`, 'Content-Length': to - from + 1 }).end(body.subarray(from, to + 1));
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': body.length }).end(body);
  } catch {
    await send404();
  }
}).listen(port, () => console.log(`http://localhost:${port}${BASE}/`));
