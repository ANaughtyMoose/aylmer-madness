#!/usr/bin/env node
// Headless checks on the three modes and the eight courses:
//
//   node tools/smoke_modes.mjs
//
// The interesting half is the pace car. Every Blitz and Checkpoint course is
// driven end to end by a real Rival (game/race.js) in the player's own Ranger,
// on the REAL road bake — buildWorld() runs here with a stubbed renderer, the
// same trick smoke_world.mjs and smoke_race.mjs use — and the clock a course
// ships with is checked against the lap that car actually turned. A course
// nobody can finish, or a timer with no slack, fails the build.
//
// The pace car is deliberately not a great driver: it is race.js's pure-pursuit
// controller with SKILL.pace, so it lifts for every bend and never once takes a
// shortcut. Whatever margin it leaves is the floor, not the ceiling.
import { strict as assert } from 'node:assert';

// ---------------------------------------------------------------- stubs
const ctx2d = {
  clearRect() {}, fillRect() {}, fillText() {}, drawImage() {}, beginPath() {},
  moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, closePath() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
  measureText() { return { width: 40 }; },
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
  putImageData() {},
};
globalThis.document = {
  createElement() { return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } }; },
  getElementById() { return null; },
};
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

class StubRenderer {
  constructor() { this.uploads = 0; this.draws = 0; this.time = 0; }
  upload(b) { this.uploads++; if (b.finish) b.finish(); return { vao: null, count: b.i.length, min: b.min && b.min.slice(), max: b.max && b.max.slice() }; }
  texture() { return { stub: true }; }
  visible() { return true; }
  draw() { this.draws++; }
}

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const group = (n) => console.log('\n' + n);
const r1 = (v) => Math.round(v * 10) / 10;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- the game
const { buildWorld } = await import('../src/game/world.js');
const MATS = (await import('../src/game/materials_stub.js')).default;
const { Nav } = await import('../src/game/nav.js');
const { PLACES, resolvePlaces } = await import('../src/game/places.js');
const { carById } = await import('../src/game/cars.js');
const { Rival, Track, SKILL } = await import('../src/game/race.js');
const { GATE_R } = await import('../src/game/racejobs.js');
const { MISSIONS } = await import('../src/game/missions.js');
const {
  MODES, BLITZ, CHECKPOINT, COURSES, BLITZ_R, CHECK_R,
  courseMission, missionFor, loadModeBests, saveModeBest, fmtTime,
  installModes, startCruise,
} = await import('../src/game/modes.js');
const { installJumps } = await import('../src/game/jumps.js');
const { loadRacingText, TEXT, taunt, policeLine, line: textLine } =
  await import('../src/game/racingtext.js');
const { courseName } = await import('../src/game/modes.js');
await loadRacingText();
const {
  stageTarget, stageEnter, stageStep, missionCleanup,
} = await import('../src/game/missionkit.js');

installJumps();                       // the ramps are part of the world a course runs on
const world = buildWorld(new StubRenderer(), MATS);
resolvePlaces(world);
const nav = new Nav();
const phys = {
  roadAt: (x, z) => world.roadAt(x, z),
  querySegments: (x, z, r) => world.querySegments(x, z, r),
  waterAt: (x, z) => world.waterAt(x, z),
  queryPoles: (x, z, r) => world.queryPoles(x, z, r),
  snapPole: (p, ux, uz) => world.snapPole(p, ux, uz),
  groundAt: world.groundAt,
  bounds: world.bounds,
};

const at = (c) => (typeof c === 'string' ? PLACES[c] : c);

// ================================================================ 1. the data

group('the three modes');
{
  ok(MODES.length === 3, 'there are exactly three', MODES.map((m) => m.fr).join(' / '));
  ok(MODES.some((m) => m.id === 'cruise') && MODES.some((m) => m.id === 'blitz')
    && MODES.some((m) => m.id === 'checkpoint'), 'Cruise, Blitz and Checkpoint');
  ok(MODES.every((m) => m.blurb && m.blurb.length > 30), 'each one says what it is');
  ok(BLITZ_R === GATE_R, 'the blitz gate is racejobs GATE_R', `${BLITZ_R} m`);
  ok(CHECK_R > BLITZ_R, 'a checkpoint gate is wider than a blitz gate', `${CHECK_R} m`);
}

group('the courses');
{
  ok(BLITZ.length >= 3, `${BLITZ.length} blitz courses`);
  ok(CHECKPOINT.length >= 3, `${CHECKPOINT.length} checkpoint courses`);
  ok(new Set(COURSES.map((c) => c.id)).size === COURSES.length, 'every id is unique');
  ok(COURSES.every((c) => !MISSIONS.some((m) => m.id === c.id)),
    'no course id collides with a story job');
  ok(BLITZ.every((c) => c.clock > 0 && c.bonus > 0), 'every blitz has a clock and a bonus');
  ok(CHECKPOINT.every((c) => (c.rivals || []).length > 0), 'every checkpoint race has rivals');
  ok(BLITZ.every((c) => !(c.rivals || []).length), 'no blitz has rivals — it is you and the clock');
  ok(COURSES.every((c) => c.cps.length >= 4), 'every course has at least four gates');
  ok(COURSES.every((c) => c.money > 0 && c.blurb && c.where), 'every course pays and says where it starts');
  // Nobody's historical internal id may ever reach the screen.
  const text = JSON.stringify(COURSES.map((c) => [c.name, c.blurb, c.where]));
  ok(!/\b(steph|marc|dave)\b/i.test(text), 'no internal ids in any player-facing string');
}

group('a course is an ordinary mission');
{
  const def = missionFor(COURSES[0]);
  const stages = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 80 });
  ok(stages.length === 2, 'two stages: the grid and the run');
  ok(stages[0].hold === true, 'the grid stage waits for E');
  ok(stages[1].anywhere === true, 'the run stage is scored in onTick, not by a radius');
  ok(def.cleanup != null, 'and it cleans up after itself');
  ok(missionFor(COURSES[0]) === def, 'the definition is built once and cached');
}

group('checkpoint mode hides the GPS line');
{
  for (const c of CHECKPOINT) {
    const st = missionFor(c).build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 0 })[1];
    if (!st.noRoute) { ok(false, `${c.id} still draws the blue line`); break; }
  }
  ok(CHECKPOINT.every((c) => missionFor(c).build({ carId: 'ranger', carName: 'R', seats: 2, money: 0 })[1].noRoute),
    'no blue line on any checkpoint course');
  ok(BLITZ.every((c) => !missionFor(c).build({ carId: 'ranger', carName: 'R', seats: 2, money: 0 })[1].noRoute),
    '...and the blue line is still on for every blitz');
}

group('finishing a course does not inflate the job count');
{
  const G = { done: new Set(['school']), hud: null, rivals: [], raceParked: {}, parked: {} };
  const def = missionFor(BLITZ[0]);
  G.done.add(def.id);                       // what main.js does on completion
  def.cleanup(G, { elapsed: 91.5 });
  ok(!G.done.has(def.id), 'the mode takes its id back out of G.done');
  ok(G.done.has('school'), '...and leaves the real jobs alone');
  ok(loadModeBests()[def.id] === 91.5, 'the time is kept in the modes table instead',
    fmtTime(loadModeBests()[def.id]));
  saveModeBest(def.id, 120);
  ok(loadModeBests()[def.id] === 91.5, 'a slower run does not overwrite the record');
}

// ================================================================ 2. routing

group('every gate is reachable on the real road graph');
{
  for (const c of COURSES) {
    const s = at(c.start);
    let prev = { x: s.x, z: s.z };
    let bad = null;
    for (const cp of c.cps) {
      const p = at(cp);
      if (!p) { bad = 'unknown place'; break; }
      const r = nav.route(prev.x, prev.z, p.x, p.z);
      if (!r || r.length < 2) { bad = `${p.label || 'gate'}`; break; }
      prev = p;
    }
    ok(!bad, `${c.id}: ${c.cps.length} gates route`, bad ? `stuck at ${bad}` : '');
  }
}

// ================================================================ 3. the pace car

// The whole course as one polyline, start -> gate -> gate, the way racejobs.js
// builds it for the rivals.
function coursePath(c) {
  const s = at(c.start);
  const path = [[s.x, s.z]];
  const legs = [];
  let fx = s.x, fz = s.z;
  for (const cp of c.cps) {
    const p = at(cp);
    const leg = nav.route(fx, fz, p.x, p.z);
    let len = 0;
    if (leg && leg.length > 1) {
      for (let k = 1; k < leg.length; k++) {
        len += Math.hypot(leg[k][0] - leg[k - 1][0], leg[k][1] - leg[k - 1][1]);
        path.push(leg[k]);
      }
    } else {
      len = Math.hypot(p.x - fx, p.z - fz);
      path.push([p.x, p.z]);
    }
    legs.push(len);
    fx = p.x; fz = p.z;
  }
  return { path, legs, length: legs.reduce((a, b) => a + b, 0) };
}

// Drive it. Returns the seconds it took, or null if the car never got round.
function paceLap(c, opts = {}) {
  const { path, legs, length } = coursePath(c);
  const s = at(c.start);
  const gr = c.kind === 'blitz' ? BLITZ_R : CHECK_R;
  const cps = c.cps.map((cp) => { const p = at(cp); return { x: p.x, z: p.z, r: gr }; });
  const track = new Track(cps, 1, legs, { x: s.x, z: s.z });
  const rv = new Rival(carById(opts.carId || 'ranger'), { skill: SKILL[opts.skill || 'pace'] });
  rv.place(s.x, s.z, s.a != null ? s.a : 0);
  rv.setPath(path);
  rv.active = true;
  rv.done = 0;
  const me = { done: 0 };
  const STEP = 1 / 60;
  const cap = opts.cap || 60 * 15;              // fifteen minutes is a lock-up
  let t = 0;
  for (let i = 0; i < 60 * cap; i++) {
    rv.update(STEP, phys, null);
    t += STEP;
    if (track.check(me, rv.x, rv.z, gr)) {
      return { t, length, resets: rv.resets, damage: rv.veh.damage, path: path.length };
    }
  }
  return { t: null, length, resets: rv.resets, damage: rv.veh.damage, done: me.done, path: path.length };
}

group('the pace car finishes every blitz inside its clock');
for (const c of BLITZ) {
  const r = paceLap({ ...c, kind: 'blitz' });
  const budget = c.clock + c.bonus * c.cps.length;
  if (r.t == null) {
    ok(false, `${c.id}: NEVER FINISHED`, `${r.done}/${c.cps.length} gates in ${mmss(15 * 60)}`);
    continue;
  }
  const slack = budget - r.t;
  ok(r.t < budget,
    `${c.id}: ${mmss(r.t)} against ${mmss(budget)}`,
    `${(r.length / 1000).toFixed(2)} km · ${r1(r.length / r.t * 3.6)} km/h · ${r1(slack)} s slack · ${r.resets} resets`);
  // A timer with no slack is a bug; so is one you could sleep through.
  ok(slack > 12, `${c.id}: the clock is beatable but not free`, `${r1(slack)} s`);
  ok(slack < budget * 0.62, `${c.id}: the clock still means something`,
    `${r1(100 * slack / budget)} % spare`);
}

group('the pace car gets round every checkpoint course');
for (const c of CHECKPOINT) {
  const r = paceLap({ ...c, kind: 'checkpoint' });
  if (r.t == null) {
    ok(false, `${c.id}: NEVER FINISHED`, `${r.done}/${c.cps.length} gates`);
    continue;
  }
  ok(r.t > 0, `${c.id}: ${mmss(r.t)}`,
    `${(r.length / 1000).toFixed(2)} km · ${r1(r.length / r.t * 3.6)} km/h · ${r.resets} resets`);
  ok(r.t < 9 * 60, `${c.id}: and it is not an afternoon`, mmss(r.t));
}

group('the rivals are slower than the pace car, but not by much');
{
  // The point of a rival is that losing has to be possible and winning has to be
  // work. Adam's Sunfire on the Deschênes loop is the honest test of that.
  const c = { ...CHECKPOINT[2], kind: 'checkpoint' };
  const mine = paceLap(c);
  const his = paceLap(c, { carId: 'sunfire', skill: 'dave' });
  ok(his.t != null && mine.t != null, 'both cars got round');
  if (his.t && mine.t) {
    ok(his.t > mine.t * 0.85 && his.t < mine.t * 1.9,
      'a rival lap is in the same postcode as a good lap',
      `Adam ${mmss(his.t)} vs pace ${mmss(mine.t)}`);
  }
}

// ================================================================ 4. the runner

group('a blitz clock actually runs, and a checkpoint gate actually counts');
{
  const c = BLITZ[0];
  const def = missionFor(c);
  const G = {
    veh: { x: at(c.start).x, z: at(c.start).z, speedKmh: 40, yaw: 0, vLong: 11 },
    hud: { toast() {}, prompt() {} }, audio: null, rivals: [], parked: {}, raceParked: {},
    nav, done: new Set(),
  };
  const stages = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 80 });
  const st = stages[1];
  const m = { def, stages, idx: 1, timeLeft: st.time, elapsed: 0 };
  m.target = stageTarget(G, m, st);
  stageEnter(G, m, st);
  ok(m.race != null, 'the run stage built its Track');
  ok(m.timeLeft === c.clock, 'and the clock starts where the course says', `${m.timeLeft} s`);
  // Count in, then a gate.
  for (let i = 0; i < 60 * 4; i++) st.onTick(G, m, st, 1 / 60);
  ok(m.race.going === true, 'the countdown ran out and the race is on');
  const g = m.race.track.gate(0);
  G.veh.x = g.x; G.veh.z = g.z;
  const before = m.timeLeft;
  st.onTick(G, m, st, 1 / 60);
  ok(m.race.me.done === 1, 'driving into the ring counts the gate');
  ok(m.timeLeft > before, 'and a blitz gate puts time back on the clock',
    `+${r1(m.timeLeft - before)} s`);
  missionCleanup(G, m, false);
  ok(G.rivals.length === 0, 'cleanup takes the rivals off the road');
}

group('checkpoint mode borrows the friends’ cars and gives them back');
{
  const c = CHECKPOINT[0];
  const def = missionFor(c);
  const parked = { saturn: { x: 1, z: 2, yaw: 0 }, sunfire: { x: 3, z: 4, yaw: 0 } };
  const G = {
    veh: { x: 0, z: 0, speedKmh: 0, yaw: 0, vLong: 0 },
    hud: { toast() {}, prompt() {} }, rivals: [], parked, raceParked: {}, nav, done: new Set(),
  };
  const stages = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 0 });
  stageEnter(G, { }, stages[0]);
  ok(G.rivals.length === 2, 'two rivals on the grid', G.rivals.map((r) => r.name).join(', '));
  ok(!parked.saturn && !parked.sunfire, 'their cars came off the street');
  ok(G.rivals.every((r) => r.veh.x !== 0), 'and are sitting on the start line');
  def.cleanup(G, { elapsed: 60 });
  ok(!!parked.saturn && !!parked.sunfire, '...and go straight back when it ends');
  ok(G.rivals.length === 0, 'the grid is empty again');
}

group('the picker will not throw a story job away by accident');
{
  let started = null, failed = null;
  const G = {
    veh: { x: 0, z: 0, reset(x, z, a) { this.x = x; this.z = z; this.a = a; } },
    hud: { toast() {}, prompt() {} }, done: new Set(), rivals: [], parked: {}, raceParked: {},
    failMission: (why) => { failed = why; G.mission = null; },
    mission: { def: { id: 'school', title: 'Première période' } },   // a real job, mid-run
  };
  const api = installModes(G, { startMission: (d) => { started = d.id; } });
  api.start('bz_vieux');
  ok(started === null, 'a course is refused while a story job is running', String(started));
  ok(failed === null, '...and the job is not abandoned behind your back');
  // The mode course itself is fair game — that is what Backspace does anyway.
  G.mission = { def: { id: 'bz_hull', mode: 'blitz' } };
  startCruise(G);
  ok(failed !== null, 'picking Cruise does abandon a course you are in', failed);
  ok(G.modeNow === 'cruise', 'and puts you back in Cruise');
  G.mission = null;
  api.start('bz_vieux');
  ok(started === 'bz_vieux', 'with nothing running, the course starts', String(started));
  ok(G.veh.x === -877 && G.veh.z === -102, 'and the truck is on the start line',
    `${G.veh.x}, ${G.veh.z}`);
  ok(G.modeNow === 'blitz', 'in Blitz mode', G.modeNow);
}

// ================================================================ 5. the copy

group('the written copy is wired through');
{
  ok(TEXT.loaded, 'assets/text loaded',
    `${TEXT.courses.length} course names, ${TEXT.taunts.length} taunts, ${TEXT.police.length} police lines`);
  const named = COURSES.filter((c) => c.text != null);
  ok(named.length >= 5, `${named.length} of ${COURSES.length} courses carry a name from racing.json`);
  ok(named.every((c) => courseName(c) === TEXT.courses[c.text].name),
    'and every one shows the written name', named.map(courseName).join(' · '));
  ok(COURSES.filter((c) => c.text == null).every((c) => courseName(c) === c.name),
    'the rest keep their local name — a name off a list that describes a different '
    + 'road is worse than none');
  for (const w of ['pre', 'ahead', 'beaten']) {
    ok(!!textLine(taunt(w)), `there is a '${w}' taunt`, textLine(taunt(w)).slice(0, 52));
  }
  for (const w of ['spotted', 'pursuit', 'lost', 'caught', 'warning']) {
    ok(!!textLine(policeLine(w)), `there is a '${w}' police line`, textLine(policeLine(w)).slice(0, 52));
  }
  ok(TEXT.taunts.every((t) => t.en) && TEXT.police.every((t) => t.en),
    'every written line keeps its English gloss');
  // Drain a whole tag: a shuffle bag hands out all of them before repeating.
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const t = taunt('beaten'); if (t) seen.add(t.line); }
  ok(seen.size >= 8, 'the taunt bag drains instead of repeating four lines', `${seen.size} distinct`);
}

group('a checkpoint race puts a written taunt on the grid');
{
  const c = CHECKPOINT[0];
  const def = courseMission(c, 'checkpoint');
  const grid = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 0 })[0];
  ok(/CHECKPOINT/.test(grid.toast), 'the grid toast is there');
  ok(grid.toast.includes('«'), 'and somebody says something in it',
    grid.toast.split('\n').pop().slice(0, 60));
  ok(grid.toast.includes(c.rivals[0].name), 'attributed to whoever showed up');
}

// ================================================================ done
console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
