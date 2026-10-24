// Headless self-test of tools/aylmer-compare/index.html.
//   node tools/aylmer-compare/selftest.mjs
// Starts its own static server (8132) and headless Chrome (9342, throwaway
// profile), loads the page, checks: no console errors; every pair shows a
// reference and a game shot that both load and differ; feedback typed into a
// pair autosaves and survives a reload; the Copy for Claude export is valid
// Markdown carrying that feedback; the Audio tab renders an engine, a radio
// style and a CKOI track from code with real signal, and a live effect plays.
// Closes everything it started. Writes the sample export to the scratch path
// given as argv[2] (default: os tmpdir).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRV = 8132, CDP = 9342;
const outMd = process.argv[2] || path.join(os.tmpdir(), 'aylmer-compare-selftest.md');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = [];
const killAll = () => { for (const k of kids) { try { k.kill('SIGTERM'); } catch {} } };
process.on('exit', killAll);
kids.push(spawn('python3', ['-m', 'http.server', String(SRV), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aylmer-cmp-test-'));
kids.push(spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`,
  '--window-size=1470,920', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio', 'about:blank'], { stdio: 'ignore' }));
let v = null;
for (let i = 0; i < 40 && !v; i++) { await sleep(500); v = await fetch(`http://127.0.0.1:${CDP}/json/version`).then((r) => r.json()).catch(() => null); }
const tab = await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nid = 0; const pend = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('[log error] ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
};
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++nid; pend.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail); };
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  const url = `http://127.0.0.1:${SRV}/tools/aylmer-compare/index.html`;
  await send('Page.navigate', { url });
  await sleep(2500);
  // force every lazy image to load
  const imgs = await ev(`(async () => {
    for (const i of document.querySelectorAll('img')) i.loading = 'eager';
    const all = [...document.querySelectorAll('.pair[data-id]')];
    await Promise.all([...document.querySelectorAll('.pair img')].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
    return all.map((p) => { const im = p.querySelectorAll('img'); return { id: p.dataset.id, n: im.length, a: im[0]?.src, b: im[1]?.src,
      wa: im[0]?.naturalWidth || 0, wb: im[1]?.naturalWidth || 0 }; });
  })()`);
  const bad = imgs.filter((p) => p.n !== 2 || !p.wa || !p.wb || p.a === p.b);
  check('every pair shows two different, loaded images', bad.length === 0 && imgs.length > 0, `${imgs.length} pairs, ${bad.length} bad ${bad.map((b) => b.id).join(', ')}`);
  // views
  const views = await ev(`(() => { const p = document.querySelector('.pair[data-id]');
    p.querySelector('[data-v=wipe]').click(); const w = !!p.querySelector('.stack.wipe') && !!p.querySelector('.stage-ctl input[type=range]');
    p.querySelector('[data-v=overlay]').click(); const o = !!p.querySelector('.stack.overlay') && !!p.querySelector('.stage-ctl input[type=range]');
    p.querySelector('[data-v=sbs]').click(); const s = p.querySelectorAll('.sbs img').length === 2; return w && o && s; })()`);
  check('side by side, wipe and overlay views switch', views);
  // feedback on the first pair
  await ev(`(() => { const p = document.querySelector('.pair[data-id]');
    p.querySelector('.scores input[value="2"]').click();
    p.querySelector('.prio input[value="High"]').click();
    p.querySelector('.faults input[value="roof"]').click();
    p.querySelector('.faults input[value="colour"]').click();
    const t = p.querySelector('textarea.change'); t.value = 'SELFTEST roof should be darker grey shingle'; t.dispatchEvent(new Event('input'));
    const o = document.getElementById('overall'); o.value = 'SELFTEST overall feel note'; o.dispatchEvent(new Event('input'));
    return p.dataset.id; })()`);
  await send('Page.reload', {});
  await sleep(2500);
  const kept = await ev(`(() => { const p = document.querySelector('.pair[data-id]');
    return p.querySelector('textarea.change').value + '|' + p.querySelector('.scores input:checked')?.value + '|' + document.getElementById('overall').value; })()`);
  check('feedback survives a reload (localStorage)', kept === 'SELFTEST roof should be darker grey shingle|2|SELFTEST overall feel note', kept);
  const md = await ev(`window.__COMPARE.buildExport().md`);
  fs.writeFileSync(outMd, md);
  const lines = md.split('\n');
  check('export header line', /^# Aylmer Madness look feedback, \d{4}-\d\d-\d\d, game commit [0-9a-f]{7,}/.test(lines[0]), lines[0]);
  check('export carries slug, both paths, score, faults, priority, note',
    /### 1\. \S+ \(High, score 2\/5\)/.test(md) && /- Reference: references\/places\/\S+/.test(md) && /- Game shot: references\/places\/\S+game-shots-v2\/\S+\.png/.test(md)
    && /- Faults: colour \/ material, roof|- Faults: roof, colour \/ material/.test(md) && md.includes('SELFTEST roof') && md.includes('- Priority: High'));
  check('export has no long dashes', !/[\u2014\u2013]/.test(md));
  check('export lists only items with feedback', (md.match(/^### /gm) || []).length === 1);
  // copy button goes through without throwing (headless clipboard may refuse; fallback is the modal)
  await ev(`document.getElementById('btn-copy').click(); 'ok'`); await sleep(500);
  check('Copy for Claude opens the export view', await ev(`document.getElementById('modal').classList.contains('on') && document.getElementById('modal-text').textContent.startsWith('# Aylmer Madness look feedback')`));
  await ev(`document.getElementById('modal-close').click()`);
  // audio
  await ev(`document.getElementById('tab-audio').click(); 'ok'`);
  let n = 0; for (let i = 0; i < 30 && !n; i++) { await sleep(300); n = await ev(`document.querySelectorAll('.aitem').length`); }
  check('audio tab lists items', n > 30, n + ' items');
  const rms = async (id) => ev(`(async () => {
    const it = window.__AUDIO_ITEMS.find((x) => x.id === '${id}'); const blob = await it.render();
    const buf = new DataView(await blob.arrayBuffer()); let s = 0, k = 0; for (let o = 44; o < buf.byteLength; o += 2) { const x = buf.getInt16(o, true) / 32768; s += x * x; k++; }
    return { kb: Math.round(blob.size / 1024), rms: +Math.sqrt(s / k).toFixed(4) }; })()`);
  for (const id of ['engine-ranger-pull', 'radio-style-folk', 'radio-track-1999', 'engine-ranger-road']) {
    const r = await rms(id).catch((e) => ({ err: e.message }));
    check('renders with signal: ' + id, r.rms > 0.005, JSON.stringify(r));
  }
  // the render button path itself, end to end
  const btn = await ev(`(async () => { const el = document.querySelector('.aitem[data-id="engine-civic-cruise"]'); el.querySelector('[data-render]').click();
    for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 100)); const a = el.querySelector('[data-out] audio'); if (a) return el.querySelector('[data-msg]').textContent; }
    return 'no audio element: ' + el.querySelector('[data-msg]').textContent; })()`);
  check('Render button puts a playable sample on the page', btn.startsWith('Rendered'), btn);
  const live = await ev(`(async () => { const el = document.querySelector('.aitem[data-id="sfx-horn"]'); el.querySelector('[data-live]').click();
    await new Promise((r) => setTimeout(r, 400)); return el.querySelector('[data-msg]').textContent; })()`);
  check('live effect plays (horn)', live === 'Playing', live);
  const fileOk = await ev(`(async () => { const r = await fetch('../../docs/audio/ranger.wav', { method: 'HEAD' }); const g = await fetch('../../gemini-inbox/assets/src/freesound/cicadas.ogg', { method: 'HEAD' }); return r.ok + '|' + g.ok; })()`);
  check('static audio files resolve', fileOk === 'true|true', fileOk);
  await sleep(300);
  check('no console errors or exceptions', logs.length === 0, logs.join(' || '));
} catch (e) { check('harness', false, e.message); }
await send('Page.close').catch(() => {}); try { ws.close(); } catch {}
killAll(); await sleep(400);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed}/${checks.length} checks passed; export sample at ${outMd}`);
process.exit(failed ? 1 : 0);
