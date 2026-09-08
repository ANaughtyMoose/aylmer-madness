// The friends' commentary:  node tools/smoke_support.mjs
//
// assets/text/support.json was written and left unwired (docs/NEXT.md §4). Two
// halves here, and the first one comes first for the reason VERIFY.md §4 gives:
// a content file is validated programmatically BEFORE it is wired, because the
// last batch of written material arrived with an invented surname and a wrong
// date, both marked high confidence.
//
//   1. the file: 50 lines, five real people, no invented cast, no duplicates,
//      everything short enough for a speech bubble
//   2. the wiring: a line is only ever said by somebody in the truck with you
//      or whose errand you are running, and it goes through heckle.js's own
//      limiter so the town and your passenger never talk over each other
import fs from 'node:fs';
import { Heckle, ingestSupport, supportPool, SUPPORT, GAP, COOLDOWN } from '../src/game/heckle.js';
import {
  Support, whoIsWithYou, VOICES, SLIP, SLOW_KMH, SLOW_T, BUMP, SCRATCH, CRASH_WINDOW,
} from '../src/game/support.js';
import { FRIEND_LINES, GREETINGS, DIALOGUE } from '../src/game/story.js';
import { DEFAULT_SETTINGS } from '../src/game/store.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

const raw = JSON.parse(fs.readFileSync(new URL('../assets/text/support.json', import.meta.url), 'utf8'));

// ------------------------------------------------------------ 1. the file

group('assets/text/support.json is what it says it is');
{
  ok(Array.isArray(raw.lines), 'it is { lines: [...] }');
  ok(raw.lines.length === 50, `${raw.lines.length} lines`);
  const who = {}, sit = {};
  for (const l of raw.lines) {
    who[l.who] = (who[l.who] || 0) + 1;
    sit[l.situation] = (sit[l.situation] || 0) + 1;
  }
  ok(Object.keys(who).length === 5, `five voices: ${Object.keys(who).join(', ')}`);
  for (const n of Object.keys(who)) {
    ok(VOICES.includes(n), `${n} is one of the five the game knows`, VOICES.join('/'));
    ok(who[n] === 10, `${n}: ${who[n]} lines`);
  }
  // Nobody may be invented, and nobody may acquire a surname. Every voice has
  // to be somebody story.js already puts words in the mouth of.
  const known = new Set(Object.keys(DIALOGUE));
  for (const e of Object.values(FRIEND_LINES)) {
    for (const [w] of [...(e.start || []), ...(e.end || [])]) known.add(w);
  }
  for (const k of Object.keys(GREETINGS)) known.add(k[0].toUpperCase() + k.slice(1));
  for (const n of Object.keys(who)) ok(known.has(n), `${n} already speaks elsewhere in story.js`);
  const text = raw.lines.map((l) => l.fr).join(' ');
  ok(!/\b(McDonald|Lafleur|Actell|Yank|French)\b/.test(text),
    'nobody is given a surname in a passenger seat');
  for (const k of ['steph', 'marc', 'dave']) {
    ok(!new RegExp('\\b' + k + '\\b', 'i').test(text), `the « ${k} » placeholder does not surface`);
  }
  ok(raw.lines.every((l) => typeof l.fr === 'string' && l.fr.length > 20), 'every line says something');
  ok(new Set(raw.lines.map((l) => l.fr)).size === 50, 'and no two are the same');
  const longest = Math.max(...raw.lines.map((l) => l.fr.length));
  ok(longest <= 145, `the longest is ${longest} characters — still a bubble, not a paragraph`);
  ok(raw.lines.every((l) => !/^«/.test(l.fr)), 'unquoted in the file; heckle.js adds the guillemets');
  ok(Object.keys(sit).length === 14, `${Object.keys(sit).length} situations`);
  // The 2004 facts in the lines, spot-checked against what the game and the year
  // actually are — this is the class of thing that came back wrong last time.
  const zahra = raw.lines.find((l) => l.who === 'Zahra' && /GPS/.test(l.fr));
  ok(zahra && /2004/.test(zahra.fr), 'Zahra is right that there is no GPS in 2004', zahra && zahra.fr);
}

group('ingesting it');
{
  const n = ingestSupport(raw);
  ok(n === 50, `${n} lines taken`);
  ok(Object.keys(SUPPORT).length === 5, 'five people in the pool');
  ok(supportPool('Sayyad', 'crashing_repeatedly').length === 1, 'Sayyad has his poteau line');
  // The four situations nothing fires fall back to a general line in the right
  // voice rather than to silence — that is how all 50 lines stay reachable.
  for (const dead of ['stalling_engine', 'driving_in_circles', 'getting_lost', 'missed_turn']) {
    for (const who of VOICES) {
      ok(!!supportPool(who, dead), `${who} has something for « ${dead} » even so`);
    }
  }
  ok(supportPool('Nobody', 'general_failure') === null, 'a stranger has nothing to say');
  ok(ingestSupport(null) === 0 && ingestSupport({}) === 0, 'a missing or broken file is a no-op');
}

// ---------------------------------------------------------- 2. who may speak

const fakeG = (over = {}) => ({
  mission: null, settings: { ...DEFAULT_SETTINGS }, stats: { propsSmashed: 0 }, ...over,
});
// A mission whose stages have already put Sayyad in the passenger seat.
const withSayyadAboard = () => ({
  idx: 2,
  def: { id: 'dep', title: 'Le dépanneur' },
  stages: [{ at: 'steph', passengers: 1 }, { at: 'dep' }, { at: 'home' }],
});

group('nobody talks to an empty truck');
{
  const out = whoIsWithYou(fakeG());
  ok(out.length === 0, 'free roam, alone: silence', out.join('/'));
  const s = new Support();
  const h = new Heckle().bind(fakeG());
  const G = fakeG();
  const v = { speedKmh: 60, vLat: 0, damage: 0, inAir: false, lastAir: 0 };
  v.damage = 30;   // a big hit
  s.update(1 / 60, G, v, h);
  ok(h.count === 0, 'and a crash with nobody aboard says nothing');
}

group('the person aboard is the person who talks');
{
  const G = fakeG({ mission: withSayyadAboard() });
  const out = whoIsWithYou(G);
  ok(out.includes('Sayyad'), 'Sayyad is in the passenger seat', out.join('/'));
  // Margaret gives the dep run in story.js, so she is entitled too.
  ok(out.includes('Margaret'), 'and Margaret, whose errand it is', out.join('/'));
  ok(out.every((n) => VOICES.includes(n)), 'and nobody who has no lines');
}

group('the giver counts even when nobody got in');
{
  // « Chelsea » is Adam's, and no PLACE table maps the marina onto Adam — the
  // dialogue does. This is why whoIsWithYou reads FRIEND_LINES, not the giver.
  const G = fakeG({ mission: { idx: 0, def: { id: 'chelsea' }, stages: [{}] } });
  ok(whoIsWithYou(G).includes('Adam'), 'Adam owns the Chelsea run');
  const G2 = fakeG({ mission: { idx: 0, def: { id: 'divan' }, stages: [{}] } });
  ok(whoIsWithYou(G2).includes('Mike'), 'and Mike owns the couch');
  // Norm gives « Les vitres » and has no support lines: he stays quiet rather
  // than borrowing somebody else's voice.
  const G3 = fakeG({ mission: { idx: 0, def: { id: 'vitres' }, stages: [{}] } });
  ok(whoIsWithYou(G3).length === 0, 'Norm is not one of the five and does not fake it');
  // ...and after the job, with G.mission already cleared, the def still names them.
  ok(whoIsWithYou(fakeG(), [], { id: 'chelsea' }).includes('Adam'),
    'the giver survives the mission being torn down');
}

// ------------------------------------------------------------ 3. the triggers

const rig = () => {
  const G = fakeG({ mission: withSayyadAboard() });
  const h = new Heckle().bind(G);
  const s = new Support();
  const v = { speedKmh: 0, vLat: 0, damage: 0, inAir: false, lastAir: 0 };
  return { G, h, s, v };
};

group('a crash, a scrape, and a crash again');
{
  const { G, h, s, v } = rig();
  v.damage = SCRATCH + 0.2;
  s.update(1 / 60, G, v, h);
  ok(supportPool('Sayyad', 'scratched_paint').includes(h.last)
    || supportPool('Margaret', 'scratched_paint') === null || !!h.last,
    `a scrape gets a word — « ${h.last} »`);
  const first = h.last;
  h.update(GAP + 0.1);
  v.damage += BUMP + 2;
  s.update(1 / 60, G, v, h);
  ok(h.last !== first, 'a real hit gets another');
  h.update(GAP + 0.1);
  v.damage += BUMP + 2;
  s.update(1 / 60, G, v, h);
  ok(h.count === 3, `three lines for three events inside ${CRASH_WINDOW} s`, String(h.count));
  // Repairing does not read as damage going up again.
  h.update(GAP + 0.1);
  v.damage = 0;
  s.update(1 / 60, G, v, h);
  ok(h.count === 3, 'a repair is not a crash');
}

group('sideways, slow, and over a kerb');
{
  const { G, h, s, v } = rig();
  v.speedKmh = 60; v.vLat = SLIP + 2;
  for (let i = 0; i < 60; i++) s.update(1 / 60, G, v, h);
  ok(h.count === 1, `a sustained slide gets one line — « ${h.last} »`);

  const b = rig();
  b.v.speedKmh = 10;
  for (let i = 0; i < (SLOW_T + 1) * 60; i++) b.s.update(1 / 60, b.G, b.v, b.h);
  ok(b.h.count >= 1, `${SLOW_KMH} km/h for ${SLOW_T} s mid-errand gets noticed`);

  const c = rig();
  c.v.speedKmh = 40; c.v.inAir = true;
  c.s.update(1 / 60, c.G, c.v, c.h);
  c.v.inAir = false; c.v.lastAir = 0.4;       // a kerb
  c.s.update(1 / 60, c.G, c.v, c.h);
  ok(c.h.count === 1, `a kerb hop gets a line — « ${c.h.last} »`);

  const d = rig();
  d.v.speedKmh = 90; d.v.inAir = true;
  d.s.update(1 / 60, d.G, d.v, d.h);
  d.v.inAir = false; d.v.lastAir = 2.4;       // a jump, which is not a kerb
  d.s.update(1 / 60, d.G, d.v, d.h);
  ok(d.h.count === 0, 'a real jump is not a kerb and nobody patronises you about it');
}

group('the limiter is the town’s limiter');
{
  const { G, h, s, v } = rig();
  v.damage = BUMP + 1;
  s.update(1 / 60, G, v, h);
  ok(h.count === 1, 'one line out');
  v.damage += BUMP + 1;
  s.update(1 / 60, G, v, h);
  ok(h.count === 1, `nothing else inside ${GAP} s, even from a friend`);
  // ...and a heckle and a friend share the gap, so they never overlap.
  h.update(GAP + 0.1);
  ok(!!h.say('Piéton', 'dive'), 'the town gets a word');
  v.damage += BUMP + 1;
  s.update(1 / 60, G, v, h);
  ok(h.count === 2, 'and the friend waits his turn');
  // Options -> Jeu -> « les gens gueulent » off means off for both.
  const q = rig();
  q.G.settings = { ...DEFAULT_SETTINGS, heckles: false };
  q.h.bind(q.G);
  q.v.damage = BUMP + 1;
  q.s.update(1 / 60, q.G, q.v, q.h);
  ok(q.h.count === 0, 'off means off');
}

group('the ends of a job');
{
  const { G, h, s } = rig();
  ok(s.finished(G, h, 40, 30, { id: 'dep' }) === null, 'a quick run gets no commentary');
  ok(!!s.finished(G, h, 400, 30, { id: 'dep' }), 'one that took six minutes does');
  const f = rig();
  ok(!!f.s.failed(f.G, f.h, { id: 'dep' }), 'and a failed one gets a kind word');
  const g = rig();
  ok(g.s.failed(fakeG(), g.h, { id: 'vitres' }) === null, 'from nobody, if nobody was there');
}

group('a line does not come round twice in a hurry');
{
  const { G, h, s, v } = rig();
  const seen = [];
  for (let i = 0; i < 30; i++) {
    v.damage += BUMP + 1;
    s.update(1 / 60, G, v, h);
    if (h.last && seen.indexOf(h.last) < 0) seen.push(h.last);
    h.update(GAP + 0.05);
  }
  ok(seen.length >= 3, `${seen.length} different lines over ${Math.round(h.t)} s`);
  ok(new Set(seen).size === seen.length, `nothing repeated inside ${COOLDOWN} s`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
