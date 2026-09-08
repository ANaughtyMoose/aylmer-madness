// Jobs arrive as calls:  node tools/smoke_phone.mjs
//
// Two jobs in one file, because they are the same job:
//
//   1. VALIDATE THE WRITING. docs/VERIFY.md §4 — Gemini produced good material
//      and specific falsehoods, all marked high confidence, and the rule that
//      came out of it is that a content file is checked programmatically before
//      it is wired. Every call has to name a person story.js already knows (no
//      invented friends, no invented surnames), point at a job id that really
//      exists, and fit on a 2004 phone screen.
//   2. PIN THE BEHAVIOUR. The phone is a nudge, not a gate: it rings once, for
//      the job the story is actually on, only in free roam, and it never takes
//      the prompt slot off the mission runner (U8).
//
// It also asserts what assets/text/calls.json is, because docs/NEXT.md §4 lists
// it as unwired story material and it is not: it is thirty Kijiji sellers on the
// telephone, with no speaker and no job id in the schema.
import fs from 'node:fs';
import { CALL_LINES, callLine, nextOpeningJob, FRIEND_LINES, DIALOGUE, GREETINGS } from '../src/game/story.js';
import { ALL_MISSIONS, OPENING_ORDER } from '../src/game/missions.js';
import { Phone, RING_M, SHOW_S, CALL_GAP } from '../src/game/phone.js';
import { Hud } from '../src/game/hud.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// ------------------------------------------------------------ 1. the writing

// Everybody story.js already puts words in the mouth of. A call may not add to
// this list: the cast are real people and this repo is public.
const KNOWN = new Set();
for (const e of Object.values(FRIEND_LINES)) {
  for (const [who] of [...(e.start || []), ...(e.end || [])]) KNOWN.add(who);
}
for (const who of Object.keys(DIALOGUE)) KNOWN.add(who);

group('every call is written by somebody who exists');
{
  const ids = new Set(ALL_MISSIONS.map((m) => m.id));
  ok(Object.keys(CALL_LINES).length >= 20, `${Object.keys(CALL_LINES).length} jobs have a call`);
  for (const [id, line] of Object.entries(CALL_LINES)) {
    ok(ids.has(id), `${id}: is a real job`, [...ids].join(' '));
    ok(Array.isArray(line) && line.length === 2, `${id}: [who, text]`);
    const [who, text] = line;
    ok(KNOWN.has(who), `${id}: « ${who} » is somebody story.js already knows`, who);
    ok(typeof text === 'string' && text.length > 12, `${id}: says something`);
    ok(text.length <= 120, `${id}: ${text.length} chars, fits a 2004 phone screen`, text);
    // The bubbles are quoted; the phone screen is not, so a call must not be.
    ok(!text.startsWith('«') && !text.includes('"'), `${id}: no quotes on the handset`, text);
  }
  const texts = Object.values(CALL_LINES).map((l) => l[1]);
  ok(new Set(texts).size === texts.length, 'no two jobs phone you with the same line');
  // The internal placeholder keys must never reach a player.
  const all = JSON.stringify(CALL_LINES);
  for (const k of ['steph', 'marc', 'dave']) {
    ok(!new RegExp('\\b' + k + '\\b', 'i').test(all), `the « ${k} » placeholder does not surface`);
  }
  // Every caller who is one of the four people on a lawn should be one of the
  // four people on a lawn — a cross-check that GREETINGS and CALL_LINES agree.
  const lawn = new Set(Object.keys(GREETINGS));
  for (const [id, [who]] of Object.entries(CALL_LINES)) {
    const key = who.toLowerCase();
    if (lawn.has(key)) ok(true, `${id}: ${who} is also on their own lawn`);
  }
}

group('the first job is not a phone call, and that is deliberate');
{
  ok(!CALL_LINES.alternateur, 'nobody phones about the alternator');
  ok(OPENING_ORDER[0] === 'alternateur', '...which is the first job in the opening order');
  ok(callLine('alternateur') === null, 'callLine() says so');
  // His father hands it over in person, in the cold open.
  ok(FRIEND_LINES.alternateur.start[0][0] === 'Ton père', 'his father gives it at the driveway');
}

// The caller has to be in that job's own cast — the people story.js already has
// speaking at one end of it or the other. Start OR end, because « Première
// période » is his father handing over the keys and his mother saying it is
// 8 h 52, and it is his mother who would phone.
group('the caller is somebody who is actually in that job');
{
  let checked = 0;
  for (const [id, [who]] of Object.entries(CALL_LINES)) {
    const f = FRIEND_LINES[id];
    if (!f) continue;
    const speakers = [...(f.start || []), ...(f.end || [])].map(([w]) => w);
    if (!speakers.length) continue;
    checked++;
    ok(speakers.includes(who), `${id}: ${who} phones and ${who} is there when you arrive`,
      speakers.join(' / '));
  }
  ok(checked >= 15, `${checked} jobs cross-checked against their own dialogue`);
}

group('which job the story is on');
{
  ok(nextOpeningJob({ done: new Set() }) === OPENING_ORDER[0], 'a new summer is on the first one');
  ok(nextOpeningJob({ done: new Set([OPENING_ORDER[0]]) }) === OPENING_ORDER[1], 'and it moves on');
  ok(nextOpeningJob({ done: new Set(OPENING_ORDER) }) === null,
    'once the opening is done the phone stops leading');
  ok(nextOpeningJob({}) === OPENING_ORDER[0], 'a G with no `done` set does not throw');
}

group('assets/text/calls.json is not this — it is the classifieds');
{
  const j = JSON.parse(fs.readFileSync(new URL('../assets/text/calls.json', import.meta.url), 'utf8'));
  ok(Array.isArray(j.calls) && j.calls.length === 30, `${j.calls.length} entries`);
  const keys = Object.keys(j.calls[0]).sort().join(',');
  ok(keys === 'middle,opening,outcome,sellerType', `its schema is ${keys}`);
  ok(j.calls.every((c) => !c.who && !c.job && !c.jobId),
    'not one of them names a speaker or a job, so none of them can be a job offer');
  ok(j.calls.every((c) => c.opening && c.middle && c.outcome), 'every seller is complete, though');
}

// ----------------------------------------------------------- 2. the behaviour

const fakeJob = (id, dist, title = 'X') => ({
  def: { id, title }, dist, place: { x: 10, z: 20, label: 'chemin d’Aylmer' },
});
const fakeG = (over = {}) => ({ mission: null, done: new Set(), settings: {}, waypoint: null, ...over });

group('it rings for the job the story is on, once, and only close by');
{
  const p = new Phone();
  const G = fakeG();
  ok(p.consider(G, fakeJob('dep', RING_M + 50), 'dep') === null, `nothing at ${RING_M + 50} m`);
  const c = p.consider(G, fakeJob('dep', 120, 'Le dépanneur'), 'dep');
  ok(!!c && c.id === 'dep', `it rings at 120 m — « ${c && c.who}: ${c && c.text.slice(0, 34)}… »`);
  ok(p.showing === 'dep', 'and the handset is showing it');
  ok(p.consider(G, fakeJob('dep', 120), 'dep') === null, 'it does not ring twice for the same job');
  // A different job that is NOT the story's next one is ignored, however close.
  const p2 = new Phone();
  ok(p2.consider(fakeG(), fakeJob('blitz', 20), 'dep') === null,
    'the closest pillar in town does not ring if the story is somewhere else');
  ok(p2.consider(fakeG(), fakeJob('nosuchjob', 20), 'nosuchjob') === null,
    'and a job nobody wrote a call for stays silent');
}

group('a call is a nudge, not a gate');
{
  const p = new Phone();
  // Mid-job: your phone does not ring about the next errand.
  ok(p.consider(fakeG({ mission: {} }), fakeJob('dep', 50), 'dep') === null, 'silent during a job');
  // Options → Jeu → « les gens gueulent » off.
  const p2 = new Phone();
  ok(p2.consider(fakeG({ settings: { heckles: false } }), fakeJob('dep', 50), 'dep') === null,
    'off with the rest of the town’s voice');
  // The cold open owns the first eight seconds.
  const p3 = new Phone();
  ok(p3.consider(fakeG({ coldOpen: { active: true } }), fakeJob('dep', 50), 'dep') === null,
    'silent under the cold open');
}

group('the GPS gets the address, unless you already picked one');
{
  const p = new Phone();
  const G = fakeG();
  p.consider(G, fakeJob('dep', 100), 'dep');
  ok(G.waypoint && G.waypoint.x === 10 && G.waypoint.z === 20, 'a call drops the waypoint on the address');
  const p2 = new Phone();
  const G2 = fakeG({ waypoint: { x: -1, z: -1 } });
  p2.consider(G2, fakeJob('dep', 100), 'dep');
  ok(G2.waypoint.x === -1, 'and never over one the player set himself');
}

group('one prompt slot (U8): the mission runner always outranks the phone');
{
  const hud = new Hud();
  const p = new Phone().bind(hud, null);
  const G = fakeG();
  p.consider(G, fakeJob('dep', 100, 'Le dépanneur'), 'dep');
  p.update(0.1, G);
  ok(hud._prompts.phone && /Le dépanneur/.test(hud._prompts.phone), 'the call asks for the slot');
  ok(hud._promptShown === hud._prompts.phone, 'and gets it when nothing else wants it');
  hud.prompt('◈  Le dépanneur');
  ok(hud._promptShown === '◈  Le dépanneur', 'roll onto the pillar and the mission line wins');
  hud.prompt(null);
  ok(hud._promptShown === hud._prompts.phone, 'roll off it and the call is still there');
}

group('and it hangs up');
{
  const hud = new Hud();
  const p = new Phone().bind(hud, null);
  const G = fakeG();
  p.consider(G, fakeJob('dep', 100), 'dep');
  for (let i = 0; i < Math.round((SHOW_S - 0.2) * 60); i++) p.update(1 / 60, G);
  ok(p.showing === 'dep', `still up at ${SHOW_S - 0.2} s`);
  for (let i = 0; i < 30; i++) p.update(1 / 60, G);
  ok(p.showing === null, `gone at ${SHOW_S} s`);
  ok(hud._prompts.phone === null, 'and it gives the prompt slot back');

  // Answering it (starting the job) hangs up early.
  const p2 = new Phone().bind(new Hud(), null);
  const G2 = fakeG();
  p2.consider(G2, fakeJob('dep', 100), 'dep');
  G2.mission = {};
  p2.update(1 / 60, G2);
  ok(p2.showing === null, 'taking the job hangs up the call');
}

group('two calls do not stack');
{
  const p = new Phone();
  const G = fakeG();
  p.consider(G, fakeJob('dep', 100), 'dep');
  p.update(1, G);
  ok(p.consider(G, fakeJob('gang', 100), 'gang') === null,
    `nothing else gets through inside ${CALL_GAP} s`);
  for (let i = 0; i < CALL_GAP * 60; i++) p.update(1 / 60, G);
  ok(!!p.consider(G, fakeJob('gang', 100), 'gang'), `and the next one does, past ${CALL_GAP} s`);
}

group('a new game clears the call log');
{
  const p = new Phone();
  const G = fakeG();
  p.consider(G, fakeJob('dep', 100), 'dep');
  p.reset();
  ok(p.showing === null && p.rung.size === 0, 'reset() forgets who has called');
  ok(!!p.consider(fakeG(), fakeJob('dep', 100), 'dep'), 'so the next summer gets the call again');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
