#!/usr/bin/env node
// Headless checks on the racing and the police:
//
//   node tools/smoke_race.mjs
//
// The pursuit controller is checked against the REAL road bake — buildWorld()
// runs here with a stubbed renderer, the same trick smoke_world.mjs uses — so
// "does the AI stay on the asphalt through a 90° corner" is answered by
// world.roadAt() and not by a straight line in a spreadsheet.
//
// Everything else (the wanted meter, race position, the four missions' stages,
// cleanup putting the borrowed cars back) is plain objects and the shipped code.
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

// ---------------------------------------------------------------- the game
const { buildWorld } = await import('../src/game/world.js');
const MATS = (await import('../src/game/materials_stub.js')).default;
const { Nav } = await import('../src/game/nav.js');
const { PLACES, resolvePlaces } = await import('../src/game/places.js');
const { CARS, carById, Vehicle } = await import('../src/game/cars.js');
const { Traffic } = await import('../src/game/traffic.js');
const { Signals } = await import('../src/game/signals.js');
const { Rival, Track, SKILL, updateRivals, ordinalFr, fmtGap, BAND_AHEAD, STUCK_T, RESET_AHEAD } =
  await import('../src/game/race.js');
const { Cops, CRUISER, HEAT, LOSE_T, LOSE_D, BUST_T, TICKET, MAX_UNITS } =
  await import('../src/game/cops.js');
const { RACE_MISSIONS, CIRCUIT, CIRCUIT_START, GATE_R } =
  await import('../src/game/racejobs.js');
const { MISSIONS } = await import('../src/game/missions.js');
const { Wallet } = await import('../src/game/money.js');
const {
  stageTarget, stageEnter, stageExit, stageStep, stageSettle, missionCleanup,
} = await import('../src/game/missionkit.js');

const renderer = new StubRenderer();
const world = buildWorld(renderer, MATS);
resolvePlaces(world);
const nav = new Nav();
const phys = {
  roadAt: (x, z) => world.roadAt(x, z),
  querySegments: (x, z, r) => world.querySegments(x, z, r),
  waterAt: (x, z) => world.waterAt(x, z),
  queryPoles: (x, z, r) => world.queryPoles(x, z, r),
  snapPole: (p, ux, uz) => world.snapPole(p, ux, uz),
  bounds: world.bounds,
};
// A world with tarmac everywhere and nothing to hit, for the geometry tests.
const flat = {
  roadAt: () => true, waterAt: () => false, querySegments: () => [],
  queryPoles: () => [], snapPole: () => {}, bounds: world.bounds,
};

// ================================================================ 1. pursuit

group('pure pursuit: a straight line');
{
  const rv = new Rival(carById('sunfire'), { skill: SKILL.dave });
  // 400 m due east, and the car starts 3 m off it and 20° out.
  rv.setPath([[0, 0], [400, 0]]);
  rv.place(0, 3, Math.PI / 2 + 0.35);
  rv.active = true;
  let worst = 0, settled = 0, steps = 0;
  for (let i = 0; i < 60 * 40 && rv.veh.x < 380; i++) {
    rv.update(1 / 60, flat, null);
    steps++;
    const off = Math.abs(rv.veh.z);
    if (rv.veh.x > 40) { worst = Math.max(worst, off); settled++; }
  }
  ok(rv.veh.x > 380, 'it drives the length of the straight', `${r1(rv.veh.x)} m in ${r1(steps / 60)} s`);
  ok(worst < 6, 'and holds the line inside 6 m', `worst ${r1(worst)} m over ${settled} steps`);
  ok(rv.veh.speedKmh > 55, 'at a racing speed', `${r1(rv.veh.speedKmh)} km/h`);
  ok(rv.resets === 0, 'without ever needing a reset');
}

group('pure pursuit: a real 90° corner');
{
  // Rue Denise-Friend runs east-west; Rue Washington is the street that crosses
  // it and turns north. (Avenue Frank-Robinson stops 170 m short of
  // Denise-Friend on the real map, so this is the corner that exists.)
  const corner = { x: -518, z: -471 };
  const from = { x: -600, z: -468 };      // Denise-Friend, ~80 m west of it
  const to = { x: -496, z: -222 };        // Washington, ~250 m north
  const path = nav.route(from.x, from.z, to.x, to.z);
  ok(!!path && path.length > 3, 'the corner routes on the real graph', `${path ? path.length : 0} points`);

  const rv = new Rival(carById('civic'), { skill: SKILL.sayyad });
  rv.setPath(path);
  rv.place(path[0][0], path[0][1], Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]));
  rv.active = true;
  let on = 0, off = 0, worstOff = 0, minD = Infinity, turned = false, top = 0;
  for (let i = 0; i < 60 * 90 && !rv.finished; i++) {
    rv.update(1 / 60, phys, null);
    if (phys.roadAt(rv.veh.x, rv.veh.z)) on++; else off++;
    worstOff = Math.max(worstOff, rv.offLine());
    top = Math.max(top, rv.veh.speedKmh);
    minD = Math.min(minD, Math.hypot(rv.veh.x - corner.x, rv.veh.z - corner.z));
    // Washington runs from the corner back up toward Symmes, i.e. +Z.
    if (rv.veh.z > corner.z + 200) turned = true;
  }
  ok(rv.finished, 'it gets round and finishes the route',
    `${r1(rv.along())} / ${r1(rv.pathLength)} m`);
  ok(minD < 25, 'it actually went through the junction', `closest ${r1(minD)} m`);
  ok(turned, 'and came out the other side, up Washington');
  ok(on / (on + off) > 0.99, 'it never leaves the asphalt',
    `${Math.round(1000 * on / (on + off)) / 10}% of steps on road`);
  // Pure pursuit aims 12-20 m up the road, so a right-angle costs a few metres
  // of apex on the way out. It is still inside the asphalt, which is the point.
  ok(worstOff < 9, 'and never more than 9 m off the racing line', `worst ${r1(worstOff)} m`);
  ok(top > 45, 'it was not crawling round', `top ${r1(top)} km/h`);
  ok(rv.resets === 0, 'and never had to be picked up');
}

group('recovery');
{
  const rv = new Rival(carById('saturn'), { skill: SKILL.margaret });
  rv.setPath([[0, 0], [300, 0]]);
  rv.place(0, 0, Math.PI / 2);
  rv.active = true;
  // Wedged: the car takes the pedals and goes nowhere, the way it would with a
  // hydro pole through the front wing.
  rv.veh.update = () => { rv.veh.vLong = 0; };
  let firstAt = 0;
  for (let i = 0; i < 60 * 4; i++) {
    rv.update(1 / 60, flat, null);
    if (rv.resets === 1 && !firstAt) firstAt = i / 60;
  }
  ok(rv.resets >= 1, 'three seconds stuck and it puts itself back on the road',
    `${rv.resets} reset(s), first at ${r1(firstAt)} s`);
  ok(firstAt > STUCK_T - 0.2 && firstAt < STUCK_T + 0.3, `and not before ${STUCK_T} s`);
  ok(rv.veh.x > 0 && rv.veh.x < RESET_AHEAD * 2, 'the reset is a short hop up the road, not to the finish',
    `${r1(rv.veh.x)} m along a ${r1(rv.pathLength)} m route`);
}

// ================================================================ 2. the track

group('race position with two rivals');
{
  const cps = CIRCUIT.map((c) => ({ ...c, r: GATE_R }));
  const track = new Track(cps, 3, null, CIRCUIT_START);
  ok(track.n === 4 && track.laps === 3, 'the circuit is 4 gates x 3 laps');
  ok(track.lapLen > 900 && track.lapLen < 2200, 'a lap is about a kilometre and a half',
    `${Math.round(track.lapLen)} m`);
  ok(track.total === track.lapLen * 3, 'and the race is three of them');
  ok(track.gateDist(4) > track.gateDist(3), 'gate distance keeps climbing across the lap boundary');

  // Me at gate 2 of lap 1, one rival a gate ahead, one a gate behind.
  const me = { done: 2 }, a = { done: 3 }, b = { done: 1 };
  const at = (g) => track.gate(g);
  const pMe = track.progress(me.done, at(2).x, at(2).z);      // sitting on gate 2
  const pA = track.progress(a.done, at(3).x, at(3).z);
  const pB = track.progress(b.done, at(1).x, at(1).z);
  ok(pA > pMe && pMe > pB, 'progress orders them correctly',
    `${Math.round(pB)} < ${Math.round(pMe)} < ${Math.round(pA)}`);
  const pos = 1 + [pA, pB].filter((p) => p > pMe).length;
  ok(pos === 2, 'so you are 2e of three', ordinalFr(pos));
  ok(ordinalFr(1) === '1er' && ordinalFr(2) === '2e' && ordinalFr(3) === '3e', 'the ordinals are French');
  ok(fmtGap(85) === '85 m' && fmtGap(1500) === '1.5 km', 'the gap reads in metres then kilometres');

  // The gate test is a ring, and it only counts once.
  const r = { done: 0 };
  ok(track.check(r, cps[0].x + 5, cps[0].z, GATE_R) === false && r.done === 1, 'a gate passes once');
  ok(track.check(r, cps[0].x + 5, cps[0].z, GATE_R) === false && r.done === 1,
    'and sitting in it does not count twice');
  r.done = track.n * track.laps - 1;
  ok(track.check(r, cps[track.n - 1].x, cps[track.n - 1].z, GATE_R) === true,
    'the last gate of the last lap finishes the race');
  ok(track.progress(track.n * track.laps, 0, 0) === track.total, 'a finisher is at the full distance');
}

group('the rubber band is gentle');
{
  for (const key of ['dave', 'sayyad', 'margaret']) {
    const s = SKILL[key];
    ok(s.band.ahead > 0.8 && s.band.ahead < 1, `${key}: eases off, not gives up`, `x${s.band.ahead}`);
    ok(s.band.behind > 1 && s.band.behind < 1.15, `${key}: catches up, not teleports`, `x${s.band.behind}`);
  }
  ok(BAND_AHEAD >= 120, 'and only past 120 m of lead', `${BAND_AHEAD} m`);
}

// ================================================================ 3. the cops

function copG(x = 0, z = 0) {
  const veh = new Vehicle(carById('ranger'));
  veh.reset(x, z, 0);
  const hud = {
    toasts: [], prompts: [], stars: -1,
    toast(t) { this.toasts.push(t); }, prompt(t) { this.prompts.push(t); },
    setStars(n) { this.stars = n; },
  };
  const wallet = new Wallet(null);
  wallet.set(300);
  const traffic = new Traffic(6);
  traffic.signals = null;
  return {
    veh, hud, wallet, nav, phys, traffic, signals: new Signals(),
    audio: { blip() {}, chime() {}, crash() {}, honk() {}, siren(on) { this.on = on; } },
    rivals: [], parked: {}, mission: null, cops: new Cops(),
    failed: null,
    failMission(why) { this.failed = why; this.mission = null; },
    ranRed: false, stats: null,
  };
}

group('the wanted meter fills');
{
  const G = copG(PLACES.tims.x, PLACES.tims.z);
  const C = G.cops;
  ok(C.stars === 0 && C.heat === 0, 'you start clean');

  // Crawling through a red is not running one.
  G.ranRed = true;
  G.veh.vLong = 3;                       // ~11 km/h
  C.update(1 / 60, G);
  ok(C.heat === 0, 'creeping through a red costs nothing', `${C.heat}`);

  // Running one at 60 km/h is a star, and a cruiser.
  G.ranRed = true;
  G.veh.vLong = 16.7;
  C.update(1 / 60, G);
  ok(Math.abs(C.heat - HEAT.red) < 1e-9, 'running a red at 60 km/h is +1.00', `${C.heat}`);
  ok(C.stars === 1, 'which is one star');
  ok(C.units.length === 1, 'and one cruiser on the road');
  const d0 = Math.hypot(C.units[0].x - G.veh.x, C.units[0].z - G.veh.z);
  ok(d0 > 90 && d0 < 220, 'it joins in about 150 m back', `${Math.round(d0)} m`);
  ok(G.audio.on === true, 'siren on');
  ok(G.hud.stars === 1, 'and the HUD says one star');

  // A 40 km/h shunt into traffic is another.
  G.traffic.crash = 11;
  C.update(1 / 60, G);
  ok(Math.abs(C.heat - (HEAT.red + HEAT.crash)) < 1e-9, 'a 40 km/h shunt is +0.90', `${r1(C.heat)}`);
  ok(C.stars === 1, 'still one star (1.9)');
  G.traffic.crash = 0;

  // Near-misses, if the props agent is exposing them.
  G.stats = { nearMiss: 0 };
  C.update(1 / 60, G);
  G.stats.nearMiss = 4;
  C.update(1 / 60, G);
  ok(C.stars === 2, 'four near-misses inside the window tips it to two stars', `${r1(C.heat)}`);
  ok(C.units.length === Math.min(2, MAX_UNITS), 'two cruisers');

  // Speeding past one.
  G.veh.vLong = 28;                      // ~100 km/h
  const u = C.units[0];
  u.veh.reset(G.veh.x + 20, G.veh.z, 0);
  const before = C.heat;
  C.update(0.5, G);
  ok(C.heat > before, 'sitting at 100 km/h next to a cruiser adds heat',
    `+${r1((C.heat - before) / 0.5)} / s`);
}

group('three stars puts a roadblock in the road');
{
  const sig = new Signals().list[0];
  const G = copG(sig.x - 200, sig.z);
  // Point the car at the lights and stand 200 m off.
  G.veh.reset(sig.x - 200, sig.z, Math.atan2(200, 0));
  G.veh.yaw = Math.atan2(sig.x - G.veh.x, sig.z - G.veh.z);
  G.cops.heat = 3;
  G.veh.vLong = 20;
  G.cops.update(1 / 60, G);
  ok(G.cops.stars === 3, 'three stars');
  ok(G.cops.blocks.length === 2, 'two cruisers parked across the road', `${G.cops.blocks.length}`);
  const d = Math.hypot(G.cops.blocks[0].x - sig.x, G.cops.blocks[0].z - sig.z);
  ok(d > 8 && d < 60, 'just short of the lights', `${Math.round(d)} m from the signal`);
  ok(Math.abs(G.cops.blocks[0].x - G.cops.blocks[1].x) +
     Math.abs(G.cops.blocks[0].z - G.cops.blocks[1].z) > 3.5, 'side by side, blocking both lanes');
  ok(G.cops.blocks[0].mass === CRUISER.mass, 'and they are real colliders');
}

group('lose them and it decays');
{
  const G = copG(0, 0);
  const C = G.cops;
  C.heat = 2.4;
  C.update(1 / 60, G);
  ok(C.units.length === 2, 'two on you');
  // Round the back of the beyond: nothing within 300 m.
  C.units[0].veh.reset(4000, 4000, 0);
  C.units[1].veh.reset(4000, 4010, 0);
  C.units[0].routeT = 1e6; C.units[1].routeT = 1e6;    // stop them re-planning
  for (const u of C.units) u.setPath([[4000, 4000], [4000, 4001]]);
  let t = 0;
  const start = C.heat;
  while (t < LOSE_T - 1) { C.update(1 / 60, G); t += 1 / 60; }
  ok(Math.abs(C.heat - start) < 1e-6, `nothing happens for the first ${LOSE_T} s`, `${r1(C.heat)}`);
  while (t < LOSE_T + 4) { C.update(1 / 60, G); t += 1 / 60; }
  ok(C.heat < start - 0.5, 'then it bleeds off', `${r1(start)} -> ${r1(C.heat)}`);
  ok(Math.abs((start - C.heat) / 4 - HEAT.decay) < 0.02, `at ${HEAT.decay} / s`);
  while (C.heat > 0 && t < 60) { C.update(1 / 60, G); t += 1 / 60; }
  ok(C.stars === 0 && C.units.length === 0, 'and they give up and go home', `after ${r1(t)} s`);
  ok(G.hud.toasts.some((s) => /semés/.test(s)), 'with a word about it');
  ok(LOSE_D === 300, 'the "out of sight" radius is 300 m');
}

group('boxed in: the ticket');
{
  const G = copG(PLACES.tims.x, PLACES.tims.z);
  const C = G.cops;
  C.heat = 1.2;
  C.update(1 / 60, G);
  ok(C.units.length === 1, 'one cruiser');
  C.units[0].routeT = 1e6;
  const money = G.wallet.value;
  let t = 0;
  while (t < BUST_T + 0.5 && !C.busted) {
    // Right on top of you, and you are not moving.
    C.units[0].veh.reset(G.veh.x + 6, G.veh.z, 0);
    C.units[0].setPath([[G.veh.x + 6, G.veh.z], [G.veh.x + 7, G.veh.z]]);
    G.veh.vLong = 0; G.veh.vx = 0; G.veh.vz = 0;
    C.update(1 / 60, G);
    t += 1 / 60;
  }
  ok(C.busted, `stopped and boxed in for ${BUST_T} s is a bust`, `after ${r1(t)} s`);
  ok(G.wallet.value === money - TICKET, `it costs ${TICKET} $`, `${money} -> ${G.wallet.value}`);
  ok(G.hud.toasts.some((s) => /Ticket: 150/.test(s)), 'and the toast says so');
  ok(C.stars === 0 && C.units.length === 0, 'and it is over');
}

group('cops are off during a race');
{
  const G = copG(PLACES.tims.x, PLACES.tims.z);
  G.mission = { def: { race: true } };
  G.ranRed = true;
  G.veh.vLong = 20;
  G.cops.update(1 / 60, G);
  ok(G.cops.heat === 0 && G.cops.units.length === 0, 'a red light during a race is free');
  ok(G.ranRed === false, 'and the flag is cleared, not banked for later');
}

// ================================================================ 4. missions

group('the four races are wired up');
{
  const ids = RACE_MISSIONS.map((m) => m.id);
  ok(ids.length === 4, 'four of them: ' + ids.join(', '));
  for (const m of RACE_MISSIONS) {
    ok(MISSIONS.includes(m), `${m.id} is registered in MISSIONS`);
    ok(!!PLACES[m.giver], `${m.id}: giver "${m.giver}" is a real place`);
    ok(m.race === true, `${m.id}: flagged as a race, so the cops stay home`);
    ok(typeof m.cleanup === 'function', `${m.id}: has a cleanup`);
    for (const seats of [2, 3]) {
      const car = CARS.find((c) => c.seats === seats) || CARS[0];
      const stages = m.build({ carId: car.id, carName: car.name, seats, money: 80 });
      ok(stages.length === 2, `${m.id} / ${seats + 1} seats: grid + race`);
      const [grid, run] = stages;
      ok(grid.kind === 'grid' && grid.hold === true, `${m.id}: you have to roll up and press E`);
      ok(typeof grid.text === 'string' && grid.text.length > 0, `${m.id}: the grid has objective text`);
      ok(run.kind === 'race' && run.anywhere === true && typeof run.onTick === 'function',
        `${m.id}: the race stage owns its own ending`);
      ok(typeof run.prompt === 'function', `${m.id}: it writes the HUD line`);
      const target = stageTarget({}, {}, run);
      ok(target && Number.isFinite(target.x) && Number.isFinite(target.z),
        `${m.id}: the first checkpoint resolves`, target ? `${Math.round(target.x)}, ${Math.round(target.z)}` : '');
    }
  }
  const blitz = RACE_MISSIONS.find((m) => m.id === 'blitz');
  const bstages = blitz.build({ carName: 'x', seats: 3 });
  ok(bstages[1].time === 60, 'the blitz starts on a 60 second clock');
  const circuit = RACE_MISSIONS.find((m) => m.id === 'circuit');
  ok(circuit.build({ carName: 'x', seats: 3 })[1].money === 40, 'the circuit pays 40 $');
  ok(RACE_MISSIONS.find((m) => m.id === 'racedave').build({ carName: 'x', seats: 3 })[1].money === 25,
    'Dave pays 25 $');
}

// ---- a runner, cut down from main.js's, so the races actually get played ----

function makeG(carId = 'ranger') {
  const veh = new Vehicle(carById(carId));
  const h = PLACES.home;
  veh.reset(h.x, h.z, h.a || 0);
  const wallet = new Wallet(null);
  wallet.set(80);
  const traffic = new Traffic(4);
  return {
    veh, wallet, nav, phys, traffic, rivals: [], raceParked: {},
    parked: { sunfire: { x: PLACES.dave.x + 3, z: PLACES.dave.z, yaw: 0 },
              civic: { x: PLACES.steph.x + 3, z: PLACES.steph.z, yaw: 0 },
              saturn: { x: PLACES.home.x + 3, z: PLACES.home.z, yaw: 0 } },
    mission: null, boat: null, focus: null, wantStart: false, routeKey: '',
    hud: { toasts: [], prompts: [], toast(t) { this.toasts.push(t); }, prompt(t) { this.prompts.push(t); } },
    audio: { blip() {}, chime() {}, crash() {}, honk() {}, siren() {} },
    props: null, cops: new Cops(),
  };
}

function play(G, def, pilot, maxSteps = 60 * 600) {
  const dt = 1 / 60;
  const m = {
    def, stages: def.build({ carName: G.veh.spec.name, seats: G.veh.spec.seats, money: 80 }),
    idx: 0, elapsed: 0, timeLeft: null, target: null,
  };
  G.mission = m;
  const enter = () => {
    const st = m.stages[m.idx];
    m.timeLeft = st.time != null ? st.time : null;
    m.target = stageTarget(G, m, st);
    stageEnter(G, m, st);
  };
  enter();
  const log = [];
  for (let i = 0; i < maxSteps; i++) {
    const st = m.stages[m.idx];
    pilot(G, m, st, i * dt);
    updateRivals(G, dt);
    if (m.timeLeft != null) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) { missionCleanup(G, m, true); return { done: false, failed: st.failWhy, log, m, t: i * dt }; }
    }
    const res = stageStep(G, m, st, dt);
    G.wantStart = false;
    if (!res) continue;
    if (res.fail) { missionCleanup(G, m, true); return { done: false, failed: res.fail, log, m, t: i * dt }; }
    stageSettle(G, m, st);
    stageExit(G, m, st);
    log.push(st.kind);
    m.idx++;
    if (m.idx >= m.stages.length) { missionCleanup(G, m, false); return { done: true, failed: null, log, m, t: i * dt }; }
    enter();
  }
  return { done: false, failed: 'ran out of steps at stage ' + m.idx, log, m };
}

group('playthrough: Dave, and you never leave the driveway');
{
  const G = makeG('ranger');
  const def = RACE_MISSIONS.find((d) => d.id === 'racedave');
  G.veh.reset(PLACES.dave.x, PLACES.dave.z, PLACES.dave.a || 0);
  ok(!!G.parked.sunfire, 'Dave’s Sunfire starts parked at his house');
  const res = play(G, def, (g, m, st) => {
    if (st.kind === 'grid') { g.veh.reset(PLACES.dave.x, PLACES.dave.z, PLACES.dave.a || 0); g.wantStart = true; }
    // ...and then you just sit there.
  }, 60 * 500);
  ok(!res.done, 'sitting on the line does not win a race');
  ok(/Dave/.test(res.failed || ''), 'and Dave has something to say about it', res.failed);
  ok(res.t > 60, 'it took him a while to get there', `${Math.round(res.t)} s`);
  ok(!!G.parked.sunfire, 'his car is back in his driveway afterwards');
  ok(G.rivals.length === 0, 'and the rival is off the road');
}

group('playthrough: Dave, driven properly');
{
  const G = makeG('civic');
  const def = RACE_MISSIONS.find((d) => d.id === 'racedave');
  G.veh.reset(PLACES.dave.x, PLACES.dave.z, PLACES.dave.a || 0);
  // The bot cheats: it teleports along the same route the rival drives, a
  // little quicker. What is under test is the position logic and the finish,
  // not whether a robot can drive a Civic.
  const route = nav.route(PLACES.dave.x, PLACES.dave.z, PLACES.mall.x, PLACES.mall.z);
  let s = 0;
  const seen = { first: 0, second: 0 };
  const res = play(G, def, (g, m, st, t) => {
    if (st.kind === 'grid') { g.veh.reset(PLACES.dave.x, PLACES.dave.z, PLACES.dave.a || 0); g.wantStart = true; return; }
    if (!m.race || !m.race.going) return;
    s += 21 / 60;                                  // 75 km/h along the line
    let acc = 0, k = 0;
    for (; k + 1 < route.length; k++) {
      const d = Math.hypot(route[k + 1][0] - route[k][0], route[k + 1][1] - route[k][1]);
      if (acc + d > s) break;
      acc += d;
    }
    const a = route[Math.min(k, route.length - 1)], b = route[Math.min(k + 1, route.length - 1)];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u = Math.min(1, (s - acc) / seg);
    g.veh.reset(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[0] - a[0], b[1] - a[1]));
    if (m.race.pos === 1) seen.first++; else seen.second++;
    void t;
  }, 60 * 500);
  ok(res.done, 'the race can be won', res.failed || '');
  ok(seen.first > 60, 'and the HUD had you in front for most of it',
    `1er for ${Math.round(seen.first / 60)} s, 2e for ${Math.round(seen.second / 60)} s`);
  ok(G.wallet.value === 80 + 25, 'it pays 25 $', `${G.wallet.value} $`);
  ok(!!G.parked.sunfire && G.rivals.length === 0, 'and cleanup put the Sunfire back');
}

group('playthrough: abandoning a race gives the car back');
{
  const G = makeG('ranger');
  const def = RACE_MISSIONS.find((d) => d.id === 'circuit');
  const m = { def, stages: def.build({ carName: 'x', seats: 2 }), idx: 0, target: null, timeLeft: null };
  G.mission = m;
  m.target = stageTarget(G, m, m.stages[0]);
  stageEnter(G, m, m.stages[0]);
  ok(G.rivals.length === 2, 'Margaret and Dave are on the grid', G.rivals.map((r) => r.name).join(' + '));
  ok(!G.parked.saturn && !G.parked.sunfire, 'their cars are off the street while they race');
  missionCleanup(G, m, true);                       // Backspace
  ok(!!G.parked.saturn && !!G.parked.sunfire, 'abandoning puts both cars back');
  ok(G.rivals.length === 0, 'and takes the rivals away');
}

group('playthrough: the blitz clock');
{
  const G = makeG('civic');
  const def = RACE_MISSIONS.find((d) => d.id === 'blitz');
  // Sit still: 60 seconds and it is over.
  const res = play(G, def, (g, m, st) => {
    if (st.kind === 'grid') { g.veh.reset(PLACES.principale.x, PLACES.principale.z, 0); g.wantStart = true; }
  }, 60 * 200);
  ok(!res.done && /chrono/i.test(res.failed || ''), 'the clock runs out on you', res.failed);
  ok(res.t > 60 && res.t < 70, 'after about a minute (the countdown is free)', `${r1(res.t)} s`);

  // And a checkpoint is worth 15 seconds.
  const G2 = makeG('civic');
  const m = { def, stages: def.build({ carName: 'x', seats: 3 }), idx: 1, target: null, timeLeft: 60 };
  G2.mission = m;
  m.target = stageTarget(G2, m, m.stages[1]);
  stageEnter(G2, m, m.stages[1]);
  const run = m.stages[1];
  for (let i = 0; i < 60 * 4; i++) run.onTick(G2, m, run, 1 / 60);   // burn the countdown
  const t0 = m.timeLeft;
  G2.veh.reset(PLACES.church.x, PLACES.church.z, 0);
  run.onTick(G2, m, run, 1 / 60);
  ok(m.timeLeft > t0 + 14, 'a checkpoint is +15 s', `${r1(t0)} -> ${r1(m.timeLeft)}`);
  ok(m.race.me.done === 1, 'and it counts');
  ok(m.target.x === PLACES.dep.x, 'the marker moves on to the next one');
}

// ================================================================ done
console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
