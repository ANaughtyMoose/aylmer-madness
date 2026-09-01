// Hangout agent smoke test:  node tools/smoke_hangout.mjs
//
// 129 Frank-Robinson after dark. Four things have to be true or the porch is
// not a place:
//
//   * it is a SOIR — nothing happens at 11 in the morning
//   * the people are the real people, and the historical keys (steph/marc/dave)
//     never reach a screen
//   * what they say depends on what you have actually done: the couch, the
//     races, the car you turned up in, how broke you are
//   * the mini-game is driving, and it can be driven to a finish
//
// No browser and no DOM. The last section boots a fake G and actually plays an
// evening: pull in, open the menu, hear five people out, run the bins, get paid.
import { readFileSync, existsSync } from 'node:fs';
import { MAP } from '../src/game/mapdata.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { MISSIONS } from '../src/game/missions.js';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// A store, so the Hangout's own localStorage key behaves like it does in Chrome.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const {
  Hangout, FALLBACK, FRIENDS, SLALOM, EVENING, PORCH_R, PORCH_KMH, LOOKS,
  loadHangoutContent, hangoutFacts, matches, pickLine, weight, couchUp,
  nightIndex, rosterFor, courseGates, slalomTarget, porchJobs, JOB_OWNER,
  buildPerson, buildBin, buildBoombox, loadHangout, saveHangout,
} = await import('../src/game/hangout.js');

// The real snapped places, so the course really is on Avenue Frank-Robinson.
const nearestRoad = (x, z) => {
  let bd = Infinity, best = { x, z, yaw: 0, name: '' };
  for (const r of MAP.roads) {
    if (r.cls === 'service') continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const px = ax + ex * t, pz = az + ez * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name || '', dist: d }; }
    }
  }
  return best;
};
resolvePlaces({ nearestRoad });

// ---------------------------------------------------------------- 1. content

group('the written content');
{
  const path = 'assets/text/hangout.json';
  ok(existsSync(path), 'assets/text/hangout.json is there');
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const all = [...j.catch, ...j.greet, ...j.leave, ...j.job,
    ...j.slalom.pitch, ...j.slalom.win, ...j.slalom.lose, ...j.slalom.bin];
  ok(j.catch.length >= 45, `${j.catch.length} catch-up lines`);
  for (const key of FRIENDS) {
    const n = j.catch.filter((l) => l.who === key).length;
    ok(n >= 8, `${j.names[key]} has ${n} things to say`);
  }
  ok(all.every((l) => FRIENDS.includes(l.who)), 'every line belongs to one of the five');

  // GOAL: the placeholder ids are internal and stay internal.
  const text = JSON.stringify(j);
  for (const bad of ['steph', 'marc', 'dave']) {
    ok(!new RegExp('\\b' + bad + '\\b', 'i').test(text), `no « ${bad} » anywhere in the porch text`);
  }
  ok(/Mike/.test(text) && /Zahra/.test(text), 'Mike and Zahra are named');

  // Every `need` has to be a token this file understands, or the line is dead
  // weight that will never be said.
  const KNOWN = /^!?(couch|done:[a-z]+|car:[a-z]+|radio:(on|off)|here:[a-z]+|(races|jobs|money|damage|nights|best)(>=|<=|>|<|=)-?\d+(\.\d+)?)$/;
  let bad = null;
  for (const l of j.catch) {
    for (const tok of String(l.need || '').trim().split(/\s+/).filter(Boolean)) {
      if (!KNOWN.test(tok)) bad = `${l.who}: ${tok}`;
    }
  }
  ok(bad === null, 'every condition is a token the matcher knows', bad || '');

  // ...and every done:<id> is a real job.
  const ids = new Set(MISSIONS.map((m) => m.id));
  let ghost = null;
  for (const l of j.catch) {
    for (const tok of String(l.need || '').split(/\s+/)) {
      const m = /^!?done:(.+)$/.exec(tok);
      if (m && !ids.has(m[1])) ghost = tok;
    }
  }
  ok(ghost === null, 'every job a friend mentions actually exists', ghost || '');
  ok(j.catch.some((l) => l.gift), 'somebody offers you money when you are broke');
}

group('the loader merges the other agents\' files');
{
  // A fetch that reads assets/text off disk — the same files the browser gets.
  const fakeFetch = async (url) => {
    const p = url.replace(/\?.*$/, '');
    if (!existsSync(p)) return { ok: false };
    return { ok: true, json: async () => JSON.parse(readFileSync(p, 'utf8')) };
  };
  const c = await loadHangoutContent(fakeFetch);
  ok(c.catch.length > FALLBACK.catch.length, `${c.catch.length} catch-up lines once the JSON is in`);
  const roast = c.catch.filter((l) => l.who === 'zahra' && l.need === 'here:sayyad');
  ok(roast.length === 8, `Zahra's ${roast.length} lines about her brother only work with him standing there`);
  ok(/Civic|silencieux|Tim Hortons/.test(roast.map((l) => l.line).join(' ')),
    'and they are the ones that were written for her', roast[0] && roast[0].line);
  ok((c.small.start.sayyad || []).length === 12 && (c.small.end.margaret || []).length === 12,
    'dialogue.json is loaded for the ride-along moments');
  ok((c.small.start.zahra || []).length === 12, 'zahra.json too');
  ok(c.ambient.length >= 4, `${c.ambient.length} lines drift over from the next yard`);
  ok(!c.small.start['Ton père'] && !c.small.start.pere, 'your father is not on this lawn');

  // A completely missing assets/ dir is a fallback, not a crash.
  const dead = await loadHangoutContent(async () => ({ ok: false }));
  ok(dead.catch.length === FALLBACK.catch.length, 'no files at all still leaves the porch talking');
  const thrown = await loadHangoutContent(async () => { throw new Error('offline'); });
  ok(thrown.catch.length === FALLBACK.catch.length, '...and a fetch that throws does too');
}

// ---------------------------------------------------------------- 2. matching

group('what they say depends on what you did');
{
  const G = {
    done: new Set(['divan', 'racedave']),
    veh: { spec: { id: 'civic' }, damage: 30 },
    wallet: { value: 12 },
    radio: { state: () => ({ on: true }) },
    playtime: 1800,
  };
  const f = hangoutFacts(G, { nights: 5, best: 31.2 }, ['mike', 'sayyad']);
  ok(f.couch === true, 'the couch is up because you put it there');
  ok(f.car === 'civic' && f.races === 1 && f.money === 12, 'the facts read off G');
  ok(matches('', f), 'an empty need is always true');
  ok(matches('couch done:racedave car:civic', f), 'three true things is true');
  ok(!matches('couch !done:racedave', f), '...and one false thing is false');
  ok(matches('money<40 damage>=25', f), 'numbers compare');
  ok(!matches('money>=40', f), '...both ways');
  ok(matches('here:sayyad', f) && !matches('here:zahra', f), 'here: knows who turned up');
  ok(matches('radio:on', f) && !matches('radio:off', f), 'Sayyad can hear what you are playing');
  ok(!matches('bananes>=2', f), 'a token nobody understands silences the line, it does not throw');

  ok(weight({ need: 'couch done:x car:y' }) === 3 && weight({ need: '' }) === 0,
    'weight counts conditions');

  const pool = [
    { who: 'mike', need: '', line: 'plain' },
    { who: 'mike', need: 'couch', line: 'couch' },
    { who: 'mike', need: 'couch done:racedave', line: 'couch+race' },
    { who: 'adam', need: '', line: 'ouais' },
  ];
  const said = new Set();
  const first = () => 0;                     // deterministic tie-break for the audit
  const a = pickLine(pool, 'mike', f, said, first);
  ok(a.line === 'couch+race', 'the most specific true line comes out first', a.line);
  said.add(a.line);
  ok(pickLine(pool, 'mike', f, said, first).line === 'couch', '...then the next most specific');
  said.add('couch'); said.add('plain');
  ok(pickLine(pool, 'mike', f, said, first) !== null, 'nobody ever goes mute once they run out');
  ok(pickLine(pool, 'zahra', f, said, first) === null, 'somebody with nothing to say says nothing');

  // The couch, which another agent owns.
  ok(couchUp({ done: new Set(['divan']) }) === true, 'fallback: you finished the couch job');
  ok(couchUp({ done: new Set() }) === false, '...and you did not');
  ok(couchUp({ done: new Set(), landmarks: { couchInTree: true } }) === true,
    'landmarks.js can say yes over our head');
  ok(couchUp({ done: new Set(['divan']), landmarks: { couchInTree: false } }) === false,
    '...and it can say no, which is the whole point of the flag');
  ok(couchUp({ done: new Set(), landmarks: { couchInTree: () => true } }) === true,
    'the flag may also be a function');
  ok(couchUp({ done: new Set(), couchInTree: true }) === true, 'or a plain field on G');
}

// ---------------------------------------------------------------- 3. roster

group('who is there varies by night');
{
  const seen = new Set();
  let zahraNights = 0, sizes = [];
  for (let n = 0; n < 60; n++) {
    const r = rosterFor(n);
    seen.add(r.slice().sort().join(','));
    sizes.push(r.length);
    ok(r[0] === 'mike', `night ${n}: it is Mike's house`, r.join(','));
    ok(new Set(r).size === r.length, `night ${n}: nobody is there twice`);
    ok(r.every((k) => FRIENDS.includes(k)), `night ${n}: everybody is one of the five`);
    if (r.includes('zahra')) { zahraNights++; ok(r.includes('sayyad'), `night ${n}: Zahra came with her brother`); }
  }
  ok(seen.size >= 6, `${seen.size} different evenings in sixty nights`);
  ok(zahraNights > 0 && zahraNights < 45, `Zahra is there ${zahraNights} nights out of 60 — worth coming back for`);
  ok(Math.min(...sizes) >= 2 && Math.max(...sizes) <= 5, 'two to five people, never a crowd of one');
  ok(rosterFor(7).join() === rosterFor(7).join(), 'a given night is the same evening twice');

  ok(nightIndex({ playtime: 0 }) === 0 && nightIndex({ playtime: 1250 }) === 2,
    'the night counter is the day/night cycle you are on');
}

// ---------------------------------------------------------------- 4. course

group('the slalom is on a real street');
{
  const p = PLACES.mike;
  const gates = courseGates(p);
  ok(gates.length === SLALOM.gates, `${gates.length} gates`);
  let worst = 0;
  for (const g of gates) {
    const r = nearestRoad(g.x, g.z);
    worst = Math.max(worst, r.dist);
    ok(r.name === 'Avenue Frank-Robinson', `gate ${g.i} is on Frank-Robinson`, r.name);
    ok(r.dist < 4, `gate ${g.i} is ${r.dist.toFixed(1)} m off the centreline`);
    const mouth = Math.hypot(g.bins[0].x - g.bins[1].x, g.bins[0].z - g.bins[1].z);
    ok(Math.abs(mouth - SLALOM.mouth * 2) < 0.01, `gate ${g.i} is ${mouth.toFixed(1)} m wide — a Ranger and a bit`);
  }
  ok(worst < 4, `no gate is more than ${worst.toFixed(1)} m off the road`);
  // ...and it weaves: consecutive gates are on opposite sides.
  const lat = gates.map((g) => {
    const dx = g.x - p.x, dz = g.z - p.z;
    return dx * Math.cos(p.a) + dz * -Math.sin(p.a);
  });
  ok(lat.every((v, i) => (i === 0 ? true : Math.sign(v) !== Math.sign(lat[i - 1]))),
    'the gates alternate sides, which is what makes it a slalom', lat.map((v) => v.toFixed(1)).join(' '));
  const last = gates[gates.length - 1];
  const out = Math.hypot(last.x - p.x, last.z - p.z);
  ok(out > 100 && out < 130, `${Math.round(out)} m out, so ${Math.round(out * 2)} m round trip`);

  ok(slalomTarget(null) === SLALOM.target, 'with no record they ask for the house time');
  ok(slalomTarget(31) === 30.6, 'once you have a time they ask for a bit better');
  ok(slalomTarget(10) === SLALOM.floor, 'and they never ask for less than 26 s');
}

group('the jobs come off the porch');
{
  const G = { done: new Set() };
  const jobs = porchJobs(G, ['mike', 'sayyad', 'margaret']);
  ok(jobs.length === 2, 'two jobs on offer, not a wall of them');
  ok(jobs.every((j) => ['mike', 'sayyad', 'margaret'].includes(j.who)),
    'offered by somebody who is actually sitting there');
  ok(jobs.every((j) => MISSIONS.includes(j.def)), 'and they are real MISSIONS entries');
  ok(new Set(jobs.map((j) => j.who)).size === jobs.length, 'one job each, so two people get to talk');

  const ids = new Set(MISSIONS.map((m) => m.id));
  for (const who of Object.keys(JOB_OWNER)) {
    for (const id of JOB_OWNER[who]) ok(ids.has(id), `${who}'s ${id} is a real job`);
  }
  const allDone = { done: new Set(MISSIONS.map((m) => m.id)) };
  ok(porchJobs(allDone, FRIENDS).length === 0, 'nothing left to offer once you have done everything');
  ok(porchJobs({ done: new Set(['racecivic']) }, ['sayyad']).length === 1
    && porchJobs({ done: new Set(['racecivic']) }, ['sayyad'])[0].def.id !== 'racecivic',
    'they do not offer you a job you already did');
}

group('the meshes build');
{
  for (const key of FRIENDS) {
    const b = buildPerson(LOOKS[key], key === 'mike');
    ok(b.v.length > 200 && b.i.length > 100, `${key} is a person-shaped pile of boxes`);
  }
  ok(buildBin().v.length > 100, 'a recycling bin');
  ok(buildBoombox().v.length > 100, 'and a ghetto blaster for the steps');
  ok(LOOKS.sayyad.palms, 'Sayyad gets his palm trees');
  ok(LOOKS.zahra.scale < 1, 'Zahra is thirteen');
}

// ---------------------------------------------------------------- 5. an evening

// Everything the Hangout touches on G, and nothing else. If this list grows,
// the hook block in main.js has grown, which is the thing we are not allowed
// to do.
function fakeG(over = {}) {
  const keys = { pressed: new Set() };
  const props = new Map();
  const hud = {
    obj: null, sub: null, prompt_: null, timer: null, toasts: [],
    setObjective(t, s) { this.obj = t; this.sub = s; },
    prompt(t) { this.prompt_ = t; },
    setTimer(t) { this.timer = t; },
    toast(t) { this.toasts.push(t); },
  };
  return Object.assign({
    envKey: 'night',
    done: new Set(),
    playtime: 600,
    time: 0,
    wantStart: false,
    hud,
    input: {
      hit: (...c) => c.some((k) => keys.pressed.has(k)),
      consume: (...c) => c.forEach((k) => keys.pressed.delete(k)),
      press: (k) => keys.pressed.add(k),
      clear: () => keys.pressed.clear(),
    },
    audio: { blip() {}, chime() {}, crash() {} },
    wallet: { value: 80, add(v) { this.value += v; return this.value; } },
    veh: { x: PLACES.mike.x, z: PLACES.mike.z, speedKmh: 0, damage: 0, spec: { id: 'ranger' } },
    props: {
      renderer: null,
      add(p) { props.set(p.id, p); return p; },
      get(id) { return props.get(id) || null; },
      has(id) { return props.has(id); },
      remove(id) { return props.delete(id); },
      removePrefix(pre) { let n = 0; for (const k of [...props.keys()]) if (k.startsWith(pre)) { props.delete(k); n++; } return n; },
      size: () => props.size,
    },
    started: null,
    startMission(def) { this.started = def; },
  }, over);
}

// The real text, so the evening below is the evening a player gets.
const REAL = await loadHangoutContent(async (url) => {
  const p = url.replace(/\?.*$/, '');
  return existsSync(p) ? { ok: true, json: async () => JSON.parse(readFileSync(p, 'utf8')) } : { ok: false };
});

group('a morning at Mike\'s is a morning at Mike\'s');
{
  const h = new Hangout();
  const G = fakeG({ envKey: 'day' });
  for (let i = 0; i < 30; i++) h.update(1 / 60, G);
  ok(h.state === 'off', 'nobody is on the lawn at eleven in the morning');
  ok(G.props.size() === 0, 'and there is nothing to draw');
  ok(/brunante/.test(G.hud.prompt_ || ''), 'the prompt tells you when to come back', G.hud.prompt_);
  ok(G.hud.toasts.length === 1, 'and says it once, not sixty times a second');
  G.input.press('KeyE');
  h.update(1 / 60, G);
  ok(h.state === 'off', 'E does nothing at that hour');
}

group('an evening at Mike\'s');
{
  mem.clear();
  const h = new Hangout();
  h.content = REAL;
  const G = fakeG();
  // Roll up and stop.
  h.update(1 / 60, G);
  ok(h.state === 'idle', 'the lawn fills up when you get there after dark');
  ok(h.roster.includes('mike'), `tonight it is ${h.roster.join(', ')}`);
  ok(G.props.size() >= h.roster.length + 3, `${G.props.size()} props: the people, the light, the boombox, the bins`);
  ok(/perron/.test(G.hud.obj || ''), 'the objective line names the place', G.hud.obj);
  ok(/^E {2}—/.test(G.hud.prompt_ || ''), 'and E is the key', G.hud.prompt_);

  // ...but not at speed.
  G.veh.speedKmh = 40;
  h.update(1 / 60, G);
  ok(/Arrête-toi/.test(G.hud.prompt_), 'you cannot talk to anybody at 40 km/h', G.hud.prompt_);
  G.veh.speedKmh = 0;

  G.input.press('KeyE');
  h.update(1 / 60, G);
  G.input.clear();
  ok(h.state === 'menu', 'E opens the evening');
  ok(G.wantStart === false, 'and swallows the press so nothing else sees it');
  ok(h.store.nights === 1, 'the night is counted');
  ok(h.menu.length >= 3, `${h.menu.length} things to do: ${h.menu.map((m) => m.kind).join(', ')}`);
  ok(h.menu[0].kind === 'talk' && h.menu[h.menu.length - 1].kind === 'leave',
    'jaser first, repartir last');
  ok(h.menu.some((m) => m.kind === 'job'), 'somebody has work for you');
  ok(h.menu.some((m) => m.kind === 'slalom'), 'and somebody has the bins out');

  // Q walks the ring.
  const first = h.pick;
  G.input.press('KeyQ'); h.update(1 / 60, G); G.input.clear();
  ok(h.pick !== first, 'Q cycles the choices');
  h.pick = 0;

  // Jaser, five times: five different people saying five different things.
  const heard = [];
  const spy = h.said;
  for (let i = 0; i < 6; i++) {
    const before = spy.size;
    G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
    if (spy.size > before) heard.push([...spy][spy.size - 1]);
  }
  ok(heard.length >= 5, `${heard.length} lines out of the porch`);
  ok(new Set(heard).size === heard.length, 'no line is said twice in one evening');
  ok(h.menu[0].label === 'Jaser encore', 'and the menu knows you already started');
}

group('...and they notice what you did');
{
  const pool = REAL.catch;
  const roster = ['mike', 'sayyad', 'margaret', 'adam', 'zahra'];
  // Everything the porch can be told about you, in one player.
  const heroG = fakeG({
    done: new Set(['divan', 'racedave', 'racecivic', 'circuit', 'blitz', 'canot', 'chelsea', 'golfcart']),
    veh: { spec: { id: 'sunfire' }, damage: 44, x: 0, z: 0, speedKmh: 0 },
    wallet: { value: 320 },
    radio: { state: () => ({ on: true }) },
  });
  const nobody = hangoutFacts(fakeG(), { nights: 0 }, roster);
  const hero = hangoutFacts(heroG, { nights: 6, best: 29.4 }, roster);

  // Everything one person could say tonight, drawn until the pool runs dry.
  const everything = (facts, who) => {
    const said = new Set(); const out = [];
    for (let i = 0; i < 30; i++) {
      const l = pickLine(pool, who, facts, said);
      if (!l || said.has(l.line)) break;
      said.add(l.line); out.push(l.line);
    }
    return out;
  };

  let changed = 0;
  for (const who of roster) {
    const a = everything(nobody, who), b = everything(hero, who);
    ok(a.length && b.length, `${who} has something for both players`);
    if (b.length > a.length) changed++;
  }
  ok(changed === 5, `all five have MORE to say to a player who has done things (${changed}/5)`);

  // The couch is the one five people have an opinion about.
  const couchLines = pool.filter((l) => /(^|[ !])couch/.test(l.need || ''));
  ok(new Set(couchLines.map((l) => l.who)).size >= 4,
    `${couchLines.length} lines about the couch, from ${new Set(couchLines.map((l) => l.who)).size} people`);
  const withCouch = hangoutFacts(fakeG({ done: new Set(['divan']) }), {}, roster);
  const without = hangoutFacts(fakeG({ done: new Set() }), {}, roster);
  let noticed = 0;
  for (const who of roster) {
    if (everything(withCouch, who).some((l) => !everything(without, who).includes(l))) noticed++;
  }
  ok(noticed >= 4, `${noticed} of them change what they say once the couch is in the tree`);

  // The car you turned up in.
  const busFacts = hangoutFacts(fakeG({
    veh: { spec: { id: 'bus' }, damage: 0, x: 0, z: 0, speedKmh: 0 },
  }), {}, ['mike']);
  ok(everything(busFacts, 'mike').some((l) => /BUS/.test(l)),
    'Mike reacts to the school bus in his driveway');
  ok(!everything(nobody, 'mike').some((l) => /BUS/.test(l)),
    '...and not when you came in the Ranger');
  ok(everything(hangoutFacts(fakeG({
    veh: { spec: { id: 'sunfire' }, damage: 0, x: 0, z: 0, speedKmh: 0 },
  }), {}, ['adam']), 'adam').some((l) => l === "C'est mon char, ça."),
    'Adam notices you are driving his Sunfire');

  // Margaret and the ten dollars.
  const broke = hangoutFacts(fakeG({ wallet: { value: 8 } }), {}, ['margaret']);
  const gift = pool.find((l) => l.gift && matches(l.need, broke));
  ok(gift && gift.gift === 10, 'Margaret notices you are broke and does something about it', gift && gift.line);
  ok(!pool.some((l) => l.gift && matches(l.need, hangoutFacts(fakeG(), {}, ['margaret']))),
    '...and not when you have money');

  // Zahra, with her brother standing right there.
  const withBro = everything(hangoutFacts(heroG, { nights: 6 }, ['zahra', 'sayyad']), 'zahra');
  const alone = everything(hangoutFacts(heroG, { nights: 6 }, ['zahra']), 'zahra');
  const roasts = withBro.filter((l) => !alone.includes(l));
  ok(roasts.length === 8, `${roasts.length} lines Zahra only says with Sayyad on the lawn`);
  ok(roasts.some((l) => /Civic|silencieux|Tim Hortons|recul/.test(l)), 'and they are the roast', roasts[0]);
}

group('the bins, out to Smiley and back');
{
  mem.clear();
  const h = new Hangout();
  const G = fakeG();
  h.update(1 / 60, G);
  G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
  h.pick = h.menu.findIndex((m) => m.kind === 'slalom');
  G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
  ok(h.state === 'slalom', 'the bins go into the street');
  ok(h.bins.length === SLALOM.gates * 2, `${h.bins.length} bins out there`);
  ok(!G.props.has('hang:kerbbin0'), 'and the two at the kerb are the ones they dragged out');
  ok(h.run.target === SLALOM.target, 'the first time, the target is the house time');

  // Drive it. Twelve metres a second is 43 km/h, which is what a residential
  // street at nine at night can just about stand.
  const gates = h.run.gates;
  const p = PLACES.mike;
  const dt = 1 / 60, speed = 12;
  G.veh.speedKmh = speed * 3.6;
  const driveTo = (tx, tz, stopAt = 0.5) => {
    for (let i = 0; i < 60 * 40; i++) {
      const dx = tx - G.veh.x, dz = tz - G.veh.z;
      const d = Math.hypot(dx, dz);
      if (d < stopAt) return true;
      const step = Math.min(speed * dt, d);
      G.veh.x += (dx / d) * step; G.veh.z += (dz / d) * step;
      h.update(dt, G);
      if (h.state !== 'slalom') return true;
    }
    return false;
  };
  for (const g of gates) ok(driveTo(g.x, g.z, 1.0), `through gate ${g.i + 1}`);
  ok(h.run.gate === gates.length, `all ${gates.length} gates cleared`);
  ok(/reviens/i.test(G.hud.obj || ''), 'then they send you back to the driveway', G.hud.obj);
  const before = G.wallet.value;
  driveTo(p.x, p.z, 1.0);
  G.veh.speedKmh = 0;
  h.update(dt, G);
  ok(h.state === 'menu', 'the run ends back on the porch');
  ok(h.store.best > 0, `best time ${h.store.best} s, and it is remembered`);
  ok(h.store.best < SLALOM.target, 'driven flat out it beats the house time');
  ok(G.wallet.value === before + SLALOM.bet, `the ten dollars is paid (${before} -> ${G.wallet.value})`);
  ok(G.hud.timer === null, 'the clock is put away');
  ok(!G.props.has('hang:bin0_0'), 'and the bins come back in');
  ok(h.menu.find((m) => m.kind === 'slalom').label.includes('à battre'),
    'next time they match your own time', h.menu.find((m) => m.kind === 'slalom').label);
  ok(loadHangout().best === h.store.best, 'the record survives the session');
}

group('a bin you hit is three seconds and a yell');
{
  mem.clear();
  const h = new Hangout();
  const G = fakeG();
  h.update(1 / 60, G);
  G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
  h.pick = h.menu.findIndex((m) => m.kind === 'slalom');
  G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
  const bin = h.bins[0];
  G.veh.speedKmh = 30;
  G.veh.x = bin.x; G.veh.z = bin.z;
  h.update(1 / 60, G);
  ok(h.run.hit === 1 && h.run.penalty === SLALOM.penalty, 'one bin, three seconds');
  const prop = G.props.get(bin.id);
  ok(prop && prop.roll > 1, 'and it is lying on its side now');
  h.update(1 / 60, G);
  ok(h.run.hit === 1, 'a bin already down cannot be hit again');
}

group('taking a job off the porch');
{
  mem.clear();
  const h = new Hangout();
  const G = fakeG();
  h.update(1 / 60, G);
  G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
  h.pick = h.menu.findIndex((m) => m.kind === 'job');
  const def = h.menu[h.pick].job.def;
  G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
  ok(G.started === def, `${def.title} was handed straight to the mission runner`);
  ok(h.state !== 'menu', 'and the evening steps out of the way');
  ok(G.hud.prompt_ === null, 'the prompt is handed back');

  // A build with no startMission (an older main.js) must not throw.
  const G2 = fakeG(); delete G2.startMission;
  const h2 = new Hangout();
  h2.update(1 / 60, G2);
  G2.input.press('KeyE'); h2.update(1 / 60, G2); G2.input.clear();
  h2.pick = h2.menu.findIndex((m) => m.kind === 'job');
  let threw = false;
  try { G2.input.press('KeyE'); h2.update(1 / 60, G2); } catch { threw = true; }
  ok(!threw, 'a main.js without the hook degrades instead of exploding');
}

group('driving away ends the evening');
{
  mem.clear();
  const h = new Hangout();
  const G = fakeG();
  h.update(1 / 60, G);
  G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
  ok(h.state === 'menu', 'in');
  G.veh.x += 60;
  h.update(1 / 60, G);
  ok(h.state !== 'menu', 'out');
  ok(G.hud.prompt_ === null, 'and nothing of ours is left on the HUD');
  // A long way away on a different night: the lawn empties and refills.
  G.veh.x += 400;
  h.update(1 / 60, G);
  ok(G.props.size() === 0, 'the props come down when you leave the street');
  G.veh.x = PLACES.mike.x; G.veh.z = PLACES.mike.z;
  G.playtime = 3600;
  h.update(1 / 60, G);
  ok(G.props.size() > 0 && h.night === 6, 'and a different evening is on when you come back');
}

group('a job running owns the screen');
{
  const h = new Hangout();
  const G = fakeG();
  h.update(1 / 60, G);
  G.input.press('KeyE'); h.update(1 / 60, G); G.input.clear();
  G.mission = { def: { id: 'dep' } };
  G.hud.prompt_ = 'la job parle';
  h.update(1 / 60, G);
  ok(h.state !== 'menu', 'the porch closes when a job starts');
  ok(G.hud.prompt_ === null, 'and hands the prompt back to the mission runner');
}

console.log('\n' + (fail ? `FAILED  ${fail} of ${pass + fail}` : `ok  ${pass} assertions`));
if (fail) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
