#!/usr/bin/env node
// The static server, for machines without python3 on the PATH.
//
//   node tools/serve.mjs [port]      (npm run serve)
//
// serve.sh is the same thing wrapped around `python3 -m http.server`, which is
// fine on a Mac and is not there on a Windows box, where the interpreter is
// `python` or `py -3` and never `python3`. Node is already required to run the
// smoke tests, so this has no dependency the repo did not already have.
//
// The MIME table is the whole point. ES modules are refused outright by every
// browser unless they arrive as text/javascript, and python's http.server gets
// that right by accident while a naive server does not.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.argv[2]) || 8123;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.gltf': 'model/gltf+json',
};

createServer((req, res) => {
  // Strip the query, decode, and refuse anything that climbs out of the repo.
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }

  let st;
  try { st = statSync(file); } catch { res.writeHead(404).end('not found'); return; }
  if (st.isDirectory()) { res.writeHead(404).end('not found'); return; }

  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': st.size,
    // The game is edited while it is open. Nothing here is worth a stale cache.
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Aylmer Madness -> http://localhost:${PORT}`));
