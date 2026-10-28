// Live-link radio (Tom 27 Oct): off loopback, fetchLocalLibrary reads the R2
// library.json and keeps only rows that point back into that bucket; on
// loopback it still reads serve.mjs; with no remote set it asks nobody.
import { fetchLocalLibrary } from '../src/game/radio-local.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const asked = [];
const at = (host) => { globalThis.location = { hostname: host }; };
globalThis.fetch = async (url) => {
  asked.push(url);
  return { ok: true, json: async () => ({ recordings: [
    { id: 'chez106-1', url: 'https://pub-x.r2.dev/chez106-1.mp3' },
    { id: 'energie1041-d1', url: 'energie1041-d1.mp3', recording: { stationId: 'energie1041', title: 't' } },
    { id: 'evil', url: 'https://elsewhere.example/evil.mp3' },
    { id: 7, url: 'x' },
  ] }) };
};

at('anaughtymoose.github.io');
ok((await fetchLocalLibrary({ remote: '' })).length === 0 && asked.length === 0, 'no remote set: the web build asks nobody');
const rows = await fetchLocalLibrary({ remote: 'https://pub-x.r2.dev/library.json' });
ok(asked[0] === 'https://pub-x.r2.dev/library.json', 'web build reads the bucket library');
ok(rows.length === 2, 'rows outside the bucket or malformed are dropped');
ok(rows[1].url === 'https://pub-x.r2.dev/energie1041-d1.mp3', 'relative urls resolve against the bucket');
ok(rows[1].recording && rows[1].recording.stationId === 'energie1041', 'discovered rows keep their recording');

asked.length = 0; at('localhost');
const loc = await fetchLocalLibrary({ remote: 'https://pub-x.r2.dev/library.json' });
ok(asked[0] === '/__local_radio/library.json', 'loopback still reads serve.mjs');
ok(loc.length === 3, 'loopback keeps its own rows as served');

globalThis.fetch = async () => { throw new Error('offline'); };
at('anaughtymoose.github.io');
ok((await fetchLocalLibrary({ remote: 'https://pub-x.r2.dev/library.json' })).length === 0, 'offline: quiet, synth dial');

const RR = readFileSync(new URL('../src/game/recorded-radio.js', import.meta.url), 'utf8');
ok(/crossOrigin = 'anonymous'/.test(RR), 'radio element asks in CORS mode (else Web Audio plays silence)');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
