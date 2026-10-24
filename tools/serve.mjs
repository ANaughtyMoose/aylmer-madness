#!/usr/bin/env node
// node tools/serve.mjs [port] [--audio-dir /absolute/private/directory] [--opening-dir /absolute/private/directory]
// Opt-in radio files are served only over loopback, never copied into assets.
import { createServer } from 'node:http';
import { createReadStream, statSync, realpathSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECORDINGS, STATIONS } from '../src/game/radio-library.js';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.argv[2]) || 8123;
const arg = process.argv.indexOf('--audio-dir');
const AUDIO = arg >= 0 && process.argv[arg + 1] ? realpathSync(process.argv[arg + 1]) : null;
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.gif':'image/gif', '.ico':'image/x-icon', '.wasm':'application/wasm', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.wav':'audio/wav', '.woff2':'font/woff2', '.xml':'application/xml', '.gltf':'model/gltf+json' };
// The opening's private portraits (src/game/intro/opening.js): real people's
// likenesses, so never in the repo. Default: the gitignored references folder.
const oarg = process.argv.indexOf('--opening-dir');
const OPENING = (() => { try { return realpathSync(oarg >= 0 && process.argv[oarg + 1] ? process.argv[oarg + 1] : join(ROOT, 'references/story/intro/opening')); } catch { return null; } })();
const OPENING_FILE = /^[a-z0-9_-]+\.(png|jpe?g|webp)$/;
const openingFiles = () => { try { return OPENING ? readdirSync(OPENING).filter((f) => OPENING_FILE.test(f)) : []; } catch { return []; } };
const local = AUDIO ? RECORDINGS.filter(r => { try { return statSync(join(AUDIO,r.filename)).isFile(); } catch { return false; } }) : [];
// RADIO-2004-STATION stage 2: a station marked `discover` (energie1041) has no
// file names in the repo. Tom drops files he has listened to into
// <audio-dir>/stations/<id>/verified/; they get ids <id>-d1, -d2... in sha256
// order of the name (stable, reveals nothing). Names and paths stay in this
// process: library.json and the log carry ids and counts only.
const STATION_FILE = /^[^.].*\.(mp3|m4a|ogg|wav)$/i;
const discovered = new Map();   // id -> { file, base, recording }
const unreadable = [];
if (AUDIO) for (const st of STATIONS.filter(s => s.discover)) {
  const dir = join(AUDIO, 'stations', st.id, 'verified');
  let base, names;
  try { base = realpathSync(dir); names = readdirSync(base).filter(n => STATION_FILE.test(n)); }
  catch (e) { if (e && e.code !== 'ENOENT') unreadable.push(st.id); continue; }
  let labels = {};
  try { const j = JSON.parse(readFileSync(join(base, 'labels.json'), 'utf8')); if (j && typeof j === 'object') labels = j; } catch { /* optional, Tom's own */ }
  const files = [];
  for (const name of names) {
    try {
      const real = realpathSync(join(base, name));
      if (!real.startsWith(base + sep) || !statSync(real).isFile()) continue;
      files.push({ name, real, key: createHash('sha256').update(name).digest('hex') });
    } catch { /* gone or unreadable: skipped */ }
  }
  files.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  files.forEach((f, i) => {
    const id = `${st.id}-d${i + 1}`, l = labels[f.name] && typeof labels[f.name] === 'object' ? labels[f.name] : {};
    const gainDb = Number.isFinite(Number(l.gainDb)) ? Math.max(-30, Math.min(12, Number(l.gainDb))) : 0;
    discovered.set(id, { file: f.real, base, recording: {
      stationId: st.id,
      title: typeof l.title === 'string' && l.title.trim() ? l.title.trim().slice(0, 120) : `${st.name} · enregistrement d’époque`,
      date: typeof l.date === 'string' && /^\d{4}(-\d{2}){0,2}$/.test(l.date) ? l.date : null,
      language: 'fr', gainDb, verification: 'Écouté et vérifié par Tom', source: 'bibliothèque privée',
    } });
  });
}
createServer((req,res) => {
  // Reject cross-origin embedding and DNS rebinding, including private media.
  if (![ `localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}` ].includes(req.headers.host)) { res.writeHead(403).end(); return; }
  if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { res.writeHead(403).end(); return; }
  let path;
  try { path = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  if (path === '/__local_radio/library.json') {
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','cross-origin-resource-policy':'same-origin'});
    // `opening` rides on this route because every serve.mjs already answers it with a 200:
    // an older server just leaves the field out, and nobody's console sees a 404.
    res.end(JSON.stringify({recordings:[...local.map(r=>({id:r.id,url:`/__local_radio/${r.id}`})),...[...discovered].map(([id,d])=>({id,url:`/__local_radio/${id}`,recording:{id,...d.recording}}))],opening:openingFiles()})); return;
  }
  let file;
  if (path.startsWith('/__local_opening/')) {
    const name = path.slice('/__local_opening/'.length);
    if (!OPENING || !OPENING_FILE.test(name) || !openingFiles().includes(name)) { res.writeHead(404).end(); return; }
    file = join(OPENING, name);
  } else if (path.startsWith('/__local_radio/')) {
    const id = path.slice('/__local_radio/'.length), found = discovered.get(id);
    const row = found ? null : local.find(r=>`/__local_radio/${r.id}`===path);
    if (!row && !found) { res.writeHead(404).end(); return; }
    file = found ? found.file : join(AUDIO,row.filename);
  } else {
    if (path.endsWith('/')) path+='index.html';
    file = resolve(ROOT,'.'+path);
    if (!file.startsWith(ROOT+sep) || path.split('/').some(p=>p.startsWith('.'))) { res.writeHead(403).end(); return; }
  }
  let st;
  try {
    const actual=realpathSync(file), base=path.startsWith('/__local_radio/')?(discovered.get(path.slice('/__local_radio/'.length))?.base||AUDIO):path.startsWith('/__local_opening/')?OPENING:ROOT;
    if (!actual.startsWith(base+sep)) { res.writeHead(403).end(); return; }
    st=statSync(actual); if(!st.isFile()) throw Error(); file=actual;
  } catch {res.writeHead(404).end();return;}
  let start=0,end=st.size-1,status=200;
  if(req.headers.range) {
    const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!m || (!m[1]&&!m[2])) {res.writeHead(416,{'content-range':`bytes */${st.size}`}).end();return;}
    if(!m[1]) start=Math.max(0,st.size-Number(m[2]));
    else {start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
    if(start>end||start>=st.size) {res.writeHead(416,{'content-range':`bytes */${st.size}`}).end();return;}
    status=206;
  }
  const headers={'content-type':TYPES[extname(file).toLowerCase()]||'application/octet-stream','content-length':end-start+1,'accept-ranges':'bytes','cache-control':'no-store','cross-origin-resource-policy':'same-origin'};
  if(status===206)headers['content-range']=`bytes ${start}-${end}/${st.size}`;
  res.writeHead(status,headers);
  if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
}).listen(PORT,'127.0.0.1',()=>{ console.log(`Aylmer Madness -> http://localhost:${PORT} (${local.length} private radio files, ${discovered.size} station file${discovered.size === 1 ? '' : 's'})`); for (const id of unreadable) console.log(`station folder unreadable: ${id}`); });
