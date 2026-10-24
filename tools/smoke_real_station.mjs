// Énergie 104,1 from real recordings only (RADIO-2004-STATION.md, AUD-02):
//   node tools/smoke_real_station.mjs
// A2 no synth station carries the name; A3 to A6 serve.mjs discovery against a
// fixture in os.tmpdir() (one silent WAV generated here, nothing committed);
// A7 and A8 the recorded deck with and without a discovered row.
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';
import { STATIONS as SYNTH, stationsFromJSON } from '../src/game/radio.js';
import { STATIONS } from '../src/game/radio-library.js';
import { RecordedRadio } from '../src/game/recorded-radio.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? '  - ' + extra : '')); } };
const NAME = /Énergie|Energie|104[,.]1|CKTF/i;

// ---- A2
{
  let dial = SYNTH;
  try { dial = [...SYNTH, ...(stationsFromJSON(JSON.parse(readFileSync(join(ROOT, 'assets/text/radio.json'), 'utf8'))) || [])]; } catch { /* built-in only */ }
  const hits = dial.filter((s) => NAME.test(s.name || '') || NAME.test(s.slogan || ''));
  ok(hits.length === 0, `A2: no synth station named or sloganed Énergie 104,1 (${dial.length} checked)`);
  ok(STATIONS[0].id === 'energie1041' && STATIONS[0].realOnly && STATIONS[0].discover && STATIONS[0].recordingIds.length === 0, 'stage 1: energie1041 is the first slot, real recordings only, discovered');
}

// ---- fixture
function silentWav(seconds = 1, rate = 8000) {
  const n = seconds * rate, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
const tmp = mkdtempSync(join(tmpdir(), 'aylmer-station-'));
const verified = join(tmp, 'stations', 'energie1041', 'verified');
mkdirSync(verified, { recursive: true });
const FIXTURE = 'fixture-silence-zq7.wav', OUTSIDE = 'fixture-outside-zq7.wav', LINKED = 'fixture-link-zq7.wav';
writeFileSync(join(verified, FIXTURE), silentWav());
writeFileSync(join(tmp, 'stations', 'energie1041', OUTSIDE), silentWav());          // A4: not verified
writeFileSync(join(tmp, OUTSIDE), silentWav());
try { symlinkSync(join(tmp, OUTSIDE), join(verified, LINKED)); } catch { /* no symlinks: A5 part skipped */ }

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const srv = spawn(process.execPath, [join(ROOT, 'tools/serve.mjs'), String(port), '--audio-dir', tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
srv.stdout.on('data', (d) => { stdout += d; }); srv.stderr.on('data', (d) => { stdout += d; });
for (let i = 0; i < 100 && !/Aylmer Madness ->/.test(stdout); i++) await new Promise((r) => setTimeout(r, 50));
const raw = (p) => new Promise((res) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', headers: { host: `127.0.0.1:${port}` } }, (r) => {
    let body = ''; r.on('data', (d) => { body += d; }); r.on('end', () => res({ status: r.statusCode, body }));
  });
  req.on('error', () => res({ status: 0, body: '' })); req.end();
});
try {
  const lib = await raw('/__local_radio/library.json');
  const rows = JSON.parse(lib.body || '{}').recordings || [];
  const en = rows.filter((r) => r.recording && r.recording.stationId === 'energie1041');
  ok(lib.status === 200 && en.length === 1, `A3/A4/A5: exactly 1 Énergie row (${en.length}); outside-verified file and symlink not listed`);
  ok(!/\.(mp3|m4a|ogg|wav)/i.test(lib.body) && !lib.body.includes('fixture') && !lib.body.includes(tmp), 'A3: library.json carries no file name, extension or path');
  ok(en[0] && en[0].id === 'energie1041-d1' && en[0].recording.title === 'Énergie 104,1 · enregistrement d’époque' && en[0].recording.gainDb === 0, 'A3: generic title and 0 dB without a labels.json');
  const play = await raw('/__local_radio/energie1041-d1');
  ok(play.status === 200 && play.body.length > 1000, `A3: the verified file streams (${play.status})`);
  for (const p of ['/__local_radio/energie1041-d2', '/__local_radio/energie1041-d0', '/__local_radio/energie1041-d1/../x', '/__local_radio/..%2f..%2fetc%2fpasswd']) {
    const r = await raw(p);
    ok(r.status === 403 || r.status === 404, `A4/A5: ${p} refused (${r.status})`);
  }
  ok(/1 station file/.test(stdout), 'A6: the log counts the station file');
  ok(!stdout.includes('fixture') && !stdout.includes(tmp), 'A6: the log names no file and no path');
} finally { srv.kill(); }

// ---- A7, A8: the recorded deck
const param = () => ({ value: 0, setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
const node = () => ({ gain: param(), connect() {}, disconnect() {} });
const ctx = { currentTime: 0, state: 'running', createGain: node, createMediaElementSource: node };
const audio = { ok: true, enabled: true, ctx, radioBus: node(), running: true, start() {}, resume() {}, setVolume() {} };
const mem = new Map(), storage = { getItem: (k) => mem.get(k), setItem: (k, v) => mem.set(k, v) };
const media = () => ({ currentTime: 0, duration: 1700, paused: true, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, load() {}, removeAttribute() {} });
const recordingRow = { id: 'energie1041-d1', url: '/__local_radio/energie1041-d1', recording: { id: 'energie1041-d1', stationId: 'energie1041', title: 'Énergie 104,1 · enregistrement d’époque', date: null, language: 'fr', gainDb: 0 } };
{
  const r = new RecordedRadio(audio, { storage, mediaFactory: media, fadeMs: 0 });
  r.addSources([recordingRow, { id: 'chez106-1', url: 'test:chez' }]);
  ok(r.selectedStationId === 'energie1041' && r.available()[0].id === 'energie1041', 'A7: Énergie 104,1 is the fresh default and first on the dial');
  r.resume(); r.power(true); r.tune('energie1041');
  r.session.el.onloadedmetadata(); await Promise.resolve();
  let tracks = new Set();
  for (let i = 0; i < 600; i++) { r.update(1, 0.9, false, false); tracks.add(r.state().track); }
  ok(r.state().stationName === 'Énergie 104,1' && [...tracks].every((t) => t === recordingRow.recording.title), `A7: name and the generic label only, over 600 s (${[...tracks].length} distinct)`);
  ok(r.state().on && r.state().slogan === '', 'A7: plays, no slogan');
}
{
  mem.clear();
  const r = new RecordedRadio(audio, { storage, mediaFactory: media, fadeMs: 0 });
  r.addSources([{ id: 'chez106-1', url: 'test:chez' }, { id: 'oldies1310-1', url: 'test:oldies' }]);
  ok(!r.available().some((s) => s.id === 'energie1041') && r.selectedStationId === 'chez106', 'A8: without a verified file Énergie is absent and CHEZ is selected');
  let landed = 0;
  for (let i = 0; i < 100; i++) { r.nextStation(); if (r.selectedStationId === 'energie1041') landed++; }
  ok(landed === 0, 'A8: 100 presses never land on it');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
