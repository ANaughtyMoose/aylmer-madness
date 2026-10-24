// « La boîte du Dr Morin »: Margaret's lines for the whole drive and the
// tooth in the corner (Tom, 6 Oct 2026).   node tools/smoke_dental.mjs
//
// Pure checks, no browser: the line table obeys the bubble limits and the
// copyright rule's shape, the director answers the driving (hit, curb, air,
// speed, the clock, the clinic, a clean stretch) and keeps its cadence, the
// tooth walks pristine -> shattered with the damage, and the stage wiring
// opens and closes the HUD without a document.
import { existsSync, statSync } from 'node:fs';
import { LIFE_MISSIONS, MARGARET_RIDE, RIDE_EVERY, margaretCue } from '../src/game/lifejobs.js';
import { ToothHud, toothState, TOOTH_LABELS, TOOTH_STATES } from '../src/game/toothhud.js';
import { heckle } from '../src/game/heckle.js';

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('  FAIL ' + name + (extra ? '  - ' + extra : '')); } };

// ---------------------------------------------------------------- the lines
const all = [...MARGARET_RIDE.cadence, ...Object.values(MARGARET_RIDE.react).flat(), MARGARET_RIDE.staff[1]];
ok(all.length >= 14 && all.length <= 24, 'about 14-24 lines', String(all.length));
const bare = (t) => t.replace(/[«»]/g, '').trim();
const long = all.filter((t) => bare(t).length > 70 || bare(t).split(/\s+/).length > 12);
ok(!long.length, 'every line fits a bubble: 12 words / 70 chars', long.join(' | '));
ok(!all.some((t) => /[\u2014\u2013]/.test(t)), 'no em or en dashes');
ok(!all.some((t) => /\bteeth\b|\bdents\b/i.test(t)), 'crowns, never teeth');
ok(all.some((t) => /crowns?/i.test(t)), 'the word crowns is in the drive');
ok(MARGARET_RIDE.cadence.length >= 8, 'a cadence long enough for the whole drive');
// Titles only: each line may name a song, and a line names at most two.
const TITLES = /Ironic|isn’t it ironic|You Oughta Know|Hand in My Pocket|Head Over Feet|You Learn|All I Really Want|Thank U|Hands Clean|Uninvited|Right Through You|Not the Doctor|Perfect|Wake Up|So Pure|Out Is Through/gi;
const titled = all.filter((t) => (t.match(TITLES) || []).length > 0);
ok(titled.length >= 10, 'Alanis titles worked into at least ten lines', String(titled.length));
ok(all.every((t) => (t.match(TITLES) || []).length <= 2), 'no line strings titles together');
ok(MARGARET_RIDE.staff[0] !== 'Margaret' && /\b(le|est|en)\b/.test(MARGARET_RIDE.staff[1]), 'the clinic staff speak French');

// ---------------------------------------------------------------- the tooth
ok(TOOTH_STATES === 6 && TOOTH_LABELS.length === 6, 'six tooth states with labels');
ok(toothState(0) === 0 && toothState(0.5) === 1 && toothState(3) === 2 && toothState(6) === 3 && toothState(8) === 4 && toothState(10.5) === 5,
  'damage walks pristine, hairline, chip, fracture, popping, shattered');
let bytes = 0;
for (let i = 0; i < 6; i++) {
  const f = new URL(`../assets/ui/tooth/state${i}.webp`, import.meta.url);
  ok(existsSync(f), `assets/ui/tooth/state${i}.webp exists`);
  if (existsSync(f)) bytes += statSync(f).size;
}
ok(bytes > 0 && bytes < 300 * 1024, 'tooth art under 300 KB', `${Math.round(bytes / 1024)} KB`);
const th = new ToothHud();
ok(th.set(2) === true && th.state === 2 && th.set(2) === false, 'ToothHud tracks state with no document');
th.wince(0.8); th.close({ shatter: true });
ok(th.state === 5 && th.winces === 2, 'a break shows the shattered tooth with a last flinch');

// ---------------------------------------------------------------- the director
const snap = (o = {}) => ({ dmg: 0, tol: 10, curb: 0, inAir: false, kmh: 45, timeLeft: 150, toClinic: 2000, dt: 0.1, ...o });
const run = (m, secs, o) => { const said = []; for (let t = 0; t < secs; t += 0.1) { const c = margaretCue(m, snap(o)); if (c.say) said.push(c.say); } return said; };
{
  const m = {};
  const said = run(m, 4 + RIDE_EVERY * 3 + 0.5, { kmh: 10 });
  ok(said.length === 4 && said.every(([w], i) => w === 'Margaret' && said[i][1] === MARGARET_RIDE.cadence[i]),
    'cadence: one line every RIDE_EVERY seconds, in order', said.map((s) => s[1]).join(' | '));
}
{
  const m = {};
  run(m, 1, {});
  const c = margaretCue(m, snap({ dmg: 1.5 }));
  ok(c.say && c.say[2] === true && c.wince > 0, 'a hit: she cuts in, and the tooth winces');
  ok(c.say && (MARGARET_RIDE.react.hit.includes(c.say[1]) || MARGARET_RIDE.react.crack.includes(c.say[1])), 'a hit gets a hit line');
  const c2 = margaretCue(m, snap({ dmg: 3 }));
  ok(c2.say && c2.say[1] === MARGARET_RIDE.react.crack[0], 'the chip gets « did something just crack »');
  const c3 = margaretCue(m, snap({ dmg: 8 }));
  ok(c3.say && c3.say[1] === MARGARET_RIDE.react.pop[0] && c3.state === 4, 'the crown popping off gets its line');
}
{
  const m = {};
  run(m, 1, {});
  const c = margaretCue(m, snap({ curb: 0.6 }));
  ok(c.say && c.say[1] === MARGARET_RIDE.react.curb[0], 'a curb gets the curb line');
}
{
  const m = {}; run(m, 1, {});
  const said = run(m, 1, { inAir: true });
  ok(said.some(([, t]) => t === MARGARET_RIDE.react.air[0]), 'air gets the air line');
}
{
  const m = {}; run(m, 1, {});
  const said = run(m, 3, { kmh: 95 });
  ok(said.some(([, t]) => t === MARGARET_RIDE.react.speed[0]), 'speeding gets the speed line');
}
{
  const m = {}; run(m, 1, {});
  ok(run(m, 0.5, { timeLeft: 40 }).some(([, t]) => t === MARGARET_RIDE.react.late[0]), 'under 45 s: out is through');
  run(m, 5, { timeLeft: 30 });
  ok(run(m, 0.5, { timeLeft: 12 }).some(([, t]) => t === MARGARET_RIDE.react.later[0]), 'under 15 s: run the light, no, maybe');
}
{
  const m = {}; run(m, 1, {});
  ok(run(m, 0.5, { toClinic: 120 }).some(([, t]) => t === MARGARET_RIDE.react.near[0]), 'clinic in sight: so pure, so slow');
  run(m, 5, { toClinic: 100 });
  ok(run(m, 0.5, { toClinic: 40 }).some(([w]) => w === MARGARET_RIDE.staff[0]), 'at the door: the assistant, in French');
}
{
  const m = {};
  ok(run(m, 40, { kmh: 40 }).some(([, t]) => t === MARGARET_RIDE.react.clean[0]), 'a clean stretch: put my son back on');
  const before = run(m, 40, { kmh: 40 }).filter(([, t]) => t === MARGARET_RIDE.react.clean[0]).length;
  ok(before === 0, 'one-shot reactions are said once a drive');
}

// ---------------------------------------------------------------- the stage wiring
{
  const def = LIFE_MISSIONS.find((d) => d.id === 'margaretdental');
  const [, go] = def.build();
  const G = { veh: { x: 0, z: 0, damage: 0, curb: 0, inAir: false, speedKmh: 40 } };
  const m = { timeLeft: 190 };
  go.onEnter(G, m);
  ok(G.toothHud instanceof ToothHud, 'the stage opens the tooth');
  heckle.reset();
  for (let i = 0; i < 60; i++) go.onTick(G, m, go, 0.1);
  ok(heckle.storyBusy(), 'Margaret starts talking a few seconds in');
  G.veh.damage = 4;
  go.onTick(G, m, go, 0.1);
  ok(G.toothHud.state === 2 && G.toothHud.winces === 1, 'damage shows on the tooth with a wince');
  G.veh.damage = 12;
  const r = go.onTick(G, m, go, 0.1);
  ok(r && r.fail && G.toothHud.state === 5, 'a break fails the job and shatters the tooth');
  def.cleanup(G, m);
  ok(G.toothHud == null, 'cleanup takes the tooth off the screen');
  go.onEnter(G, m); go.onExit(G, m);
  ok(G.toothHud == null, 'a delivery takes it off too');
}

console.log(`\n${fail ? 'FAIL' : 'PASS'}: dental ride ${pass}/${pass + fail}`);
if (fail) process.exit(1);
