// Street chatter pacing: the town says something every 20-25 s, never the same
// line twice inside ten minutes of play, and nothing out of season for a
// summer that runs from the Saint-Jean to Labour Day 2004. (Review 5 Oct 2026:
// one bread-truck line played six times in four minutes.)
//
//   node tools/smoke_chatter.mjs
import fs from 'node:fs';
import { Peds, AMBIENT, applyAmbient, ambientLine, CHAT_GAP, CHAT_JITTER, CHAT_MEMORY } from '../src/game/peds.js';
import { heckle } from '../src/game/heckle.js';
import { PLACES } from '../src/game/places.js';
import { DEFAULT_SETTINGS } from '../src/game/store.js';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  - ' + extra : '')); }
};

const json = JSON.parse(fs.readFileSync(new URL('../assets/text/ambient.json', import.meta.url), 'utf8'));
const n = applyAmbient(json);

console.log('the numbers');
ok(CHAT_GAP >= 20 && CHAT_GAP + CHAT_JITTER <= 26, `a line every ${CHAT_GAP}-${CHAT_GAP + CHAT_JITTER} s`);
ok(CHAT_MEMORY >= 600, `the street remembers ${CHAT_MEMORY} s`);
ok(n >= 100, `${n} lines loaded`);

console.log('in season: 22 June to Labour Day 2004');
{
  // Words that put a line in the wrong season. Washer fluid and ice cream are
  // fine; snow, the rentrée and burning brush are not.
  const OFF = /neige|hiver|déneig|pelleter|verglas|sloche|tempête de neige|halloween|noël|la rentrée|feuilles mortes|automne|ramasser les feuilles|brûler ses branches|tourbe|cabane à sucre|tire d'érable|poisson d'avril/i;
  const bad = AMBIENT.filter((r) => OFF.test(r.line));
  ok(bad.length === 0, 'no overheard line belongs to another season', bad.map((r) => r.line).join(' / '));
}

console.log('skip() falls through instead of repeating');
{
  const all = new Set();
  const r1 = ambientLine('residential', 'morning', 0, (r) => r.where === 'residential');
  ok(!!r1 && r1.where !== 'residential', 'a zone with everything said borrows from elsewhere');
  ok(ambientLine('beach', 'day', 0, () => true) === null, 'and everything said is silence, not a repeat');
  for (let i = 0; i < 40; i++) all.add(ambientLine('beach', 'day', i).line);
  ok(all.size > 3, 'without a skip the index still walks the pool');
}

// Forty minutes of driving past one pedestrian, moving through the zones every
// few minutes, at the real limiter (heckle.js) and the real chatter().
function drive(minutes, phase) {
  const fakeR = { upload: () => ({}) };
  const peds = new Peds(fakeR, null, 0x1234);
  const G = { settings: { ...DEFAULT_SETTINGS }, veh: { x: 0, z: 0, speedKmh: 50 }, envKey: phase };
  heckle.bind(G);
  const p = peds.list[0];
  p.live = true;
  const route = ['home', 'principale', 'beach', 'marina', 'mall', 'arena'].map((k) => PLACES[k]).filter(Boolean);
  const said = [];
  const dt = 1 / 10;
  for (let t = 0; t < minutes * 60; t += dt) {
    const at = route[Math.floor(t / 240) % route.length];
    G.veh.x = at.x; G.veh.z = at.z;
    p.x = at.x + 5; p.z = at.z;
    peds.time += dt;
    heckle.update(dt, G);
    const rec = peds.chatter(dt, G);
    if (rec) said.push({ t: peds.time, line: rec.line });
  }
  return said;
}

for (const phase of ['morning', 'day', 'dusk', 'night']) {
  console.log(`forty minutes, ${phase}`);
  const said = drive(40, phase);
  let minGap = Infinity, repeat = null;
  const last = new Map();
  for (let i = 0; i < said.length; i++) {
    if (i) minGap = Math.min(minGap, said[i].t - said[i - 1].t);
    const prev = last.get(said[i].line);
    if (prev !== undefined && said[i].t - prev < CHAT_MEMORY) repeat = `${said[i].line} at ${prev.toFixed(0)} s and ${said[i].t.toFixed(0)} s`;
    last.set(said[i].line, said[i].t);
  }
  ok(said.length >= 60 && said.length <= 2400 / CHAT_GAP + 1, `${said.length} lines in 40 min (was about 300 at 8 s)`);
  ok(minGap >= CHAT_GAP - 0.01, `closest two lines ${minGap.toFixed(1)} s apart`);
  ok(!repeat, 'no line twice inside ten minutes', repeat || '');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
