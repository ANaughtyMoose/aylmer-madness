#!/usr/bin/env node
// B-05: forgiving doughnuts at Sayyad's, and a canoe crossing that is never
// silent for long.
//
//   node tools/smoke_doughnut.mjs
//
// Headless like smoke_handling: cars.js on tarmac everywhere, the real Sayyad
// stage from sidejobs.js driven through a fake G, and the paddle narration.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARS, carById, Vehicle } from '../src/game/cars.js';
import { DoughnutMeter, DONUT, doughnutAssist } from '../src/game/stunts.js';
import { sayyad, canot, PADDLE_LINES, PADDLE_QUIET, paddleBeat, paddleCompass, donutArcFollow, escapeSpot, ESCAPE_M } from '../src/game/sidejobs.js';
import { Nav } from '../src/game/nav.js';
import { PLACES } from '../src/game/places.js';
import { buildChalkRing, buildDonutArc, DONUT_ARC, DONUT_RING, donutArcId } from '../src/game/props.js';
import { HINT_AFTER } from '../src/game/missionkit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? '   ' + detail : ''}`); }
}
const r1 = (v) => Math.round(v * 10) / 10;
const DT = 1 / 60;
const TAU = Math.PI * 2;

const road = {
  roadAt: () => true, waterAt: () => false, querySegments: () => [],
  bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 },
};

// A fake G with just what the Sayyad stage touches. Props are kept in a map.
function fakeG(veh) {
  const props = new Map();
  const toasts = [];
  return {
    toasts,
    props: {
      meshes: null,
      add(p) { const q = { visible: true, ...p }; props.set(p.id, q); return q; },
      get: (i) => props.get(i) || null,
      removePrefix(pre) { for (const k of [...props.keys()]) if (k.startsWith(pre)) props.delete(k); },
      all: () => [...props.values()],
    },
    phys: null,
    hud: { setObjective() {}, prompt() {}, toast(t) { toasts.push(t); }, setTimer() {} },
    audio: { blip() {}, chime() {} },
    input: { throttle: 0, steer: 0, handbrake: false },
    veh,
  };
}

// ------------------------------------------------- 1. from rest, the real stage
// Full throttle, full lock, the lever held, from a standstill on the spot:
// the scripted input the plan names. The vehicle update and then the stage's
// own onTick, the order main.js runs them in (tick: v.update, then updateMission).
const stage = sayyad.build({ carName: 'Ranger' }).find((s) => s.kind === 'doughnuts');
function fromRest(id, steer = 1, secs = 45) {
  const p = PLACES.sayyad;
  const v = new Vehicle(carById(id));
  v.reset(p.x, p.z, 0.3);
  const G = fakeG(v);
  G.input = { throttle: 1, steer, handbrake: true };
  const m = {};
  stage.onEnter(G, m, stage);
  let t = 0, at3 = null, maxK = 0, maxD = 0;
  for (; t < secs; t += DT) {
    v.update(DT, { throttle: 1, steer, brake: 0, handbrake: true }, road);
    stage.onTick(G, m, stage, DT);
    maxK = Math.max(maxK, v.speedKmh);
    maxD = Math.max(maxD, Math.hypot(v.x - p.x, v.z - p.z));
    if (at3 == null && m.donut.meter.count >= 3) at3 = t;
  }
  return { at3, maxK, maxD, count: m.donut.meter.count, G, m, v, done: stage.condition(G, m, stage) };
}

console.log('-- from rest: full throttle, full lock, lever held');
{
  const r = fromRest('ranger');
  ok('the Ranger gets past the meter\'s 8 km/h from rest', r.maxK > DONUT.minKmh, `top ${r1(r.maxK)} km/h (was under 1.7)`);
  ok('three doughnuts in 45 s or less', r.at3 != null && r.at3 <= 45, `third at ${r.at3 == null ? 'never' : r1(r.at3) + ' s'}`);
  ok('...and the stage is done once the grace runs out', r.done, `count ${r.count}`);
  ok('it stays inside the doughnut zone', r.maxD < DONUT.radius, `furthest ${r1(r.maxD)} m of ${DONUT.radius}`);
  ok('the assist was what got it going', r.m.donut.assisted > 1, `${r1(r.m.donut.assisted)} s assisted`);
  const l = fromRest('ranger', -1);
  ok('the other way round too', l.at3 != null && l.at3 <= 45, `third at ${l.at3 == null ? 'never' : r1(l.at3) + ' s'}`);
  // Every car the player can be in at Sayyad's (a bicycle has no lever). The
  // STO bus is the one exception: twelve tonnes on hbGrip 0.88 draws an 80 m
  // circle, which is a lap of the block, not a doughnut.
  const slow = [];
  for (const c of CARS) {
    if (c.twoWheel || c.id === 'bus') continue;
    const x = fromRest(c.id);
    if (!(x.at3 != null && x.at3 <= 45)) slow.push(`${c.id}:${x.at3 == null ? 'never' : r1(x.at3)}`);
  }
  ok('every four-wheeled car but the bus does three from rest in 45 s', slow.length === 0, slow.join(' '));

  // Without the assist the same input still stalls: the bug this fixes.
  const v = new Vehicle(carById('ranger')); v.reset(0, 0, 0);
  let k = 0;
  for (let t = 0; t < 10; t += DT) { v.update(DT, { throttle: 1, steer: 1, brake: 0, handbrake: true }, road); k = Math.max(k, v.speedKmh); }
  ok('(without the assist the lever still stops the truck, as A-10 found)', k < DONUT.minKmh, `top ${r1(k)} km/h`);
}

// ------------------------------------------------- 2. the assist stays in its lane
console.log('-- the assist only acts on W + lock + lever');
{
  const mk = (over = {}) => { const v = new Vehicle(carById('ranger')); v.reset(0, 0, 0); Object.assign(v, over); return v; };
  const full = { throttle: 1, steer: 1, handbrake: true };
  ok('pushes with all three held', doughnutAssist(mk(), full, DT));
  ok('not without the lever', !doughnutAssist(mk(), { ...full, handbrake: false }, DT));
  ok('not without the gas', !doughnutAssist(mk(), { ...full, throttle: 0 }, DT));
  ok('not with the wheel straight', !doughnutAssist(mk(), { ...full, steer: 0.1 }, DT));
  ok('not in reverse', !doughnutAssist(mk({ dir: -1 }), full, DT));
  ok('not in the air', !doughnutAssist(mk({ inAir: true }), full, DT));
  const fast = mk(); fast.vz = (DONUT.assist.topKmh + 1) / 3.6;
  ok('not past its top speed', !doughnutAssist(fast, full, DT));
  const bike = mk(); bike.spec = { ...bike.spec, twoWheel: true };
  ok('not on two wheels', !doughnutAssist(bike, full, DT));
  // Outside the zone the stage leaves the truck alone.
  const p = PLACES.sayyad;
  const v = new Vehicle(carById('ranger')); v.reset(p.x + DONUT.radius + 30, p.z, 0);
  const G = fakeG(v); G.input = full;
  const m = {}; stage.onEnter(G, m, stage);
  for (let i = 0; i < 120; i++) { v.update(DT, { ...full, brake: 0 }, road); stage.onTick(G, m, stage, DT); }
  ok('outside the zone there is no assist', m.donut.assisted === 0 && v.speedKmh < DONUT.minKmh, `${r1(v.speedKmh)} km/h`);
}

// ------------------------------------------------- 3. breaks and halves
// A synthetic car, the shape smoke.mjs uses: spin at 3 rad/s while sliding.
function spinner() {
  const meter = new DoughnutMeter();
  const car = { x: 0, z: 0, yaw: 0, vLat: 5, yawRate: -3, speedKmh: 22 };
  const spin = (secs, w = 3) => { for (let t = 0; t < secs - 1e-9; t += DT) { car.yaw += w * DT; car.vLat = 5; car.speedKmh = 22; meter.update(DT, car, { handbrake: true, cx: 0, cz: 0 }); } };
  const stop = (secs) => { for (let t = 0; t < secs - 1e-9; t += DT) { car.vLat = 0; car.yawRate = 0; car.speedKmh = 0; meter.update(DT, car, { handbrake: false, cx: 0, cz: 0 }); } car.yawRate = -3; };
  return { meter, spin, stop };
}
console.log('-- a break under 1.2 s keeps the lap; half-turns count');
{
  const a = spinner();
  a.spin((0.4 * TAU) / 3);                     // 40 % of a doughnut, not yet a half
  const p0 = a.meter.state().progress;
  a.stop(1.0);
  const p1 = a.meter.state().progress;
  ok('a 1 s break keeps the part-lap', p0 > 0.35 && Math.abs(p1 - p0) < 1e-9, `${r1(p0 * 100)} % -> ${r1(p1 * 100)} %`);
  a.spin((0.62 * TAU) / 3);                    // the rest of it, and a bit
  ok('...and the lap goes on from there', a.meter.count === 1, `count ${a.meter.count}`);
  ok('DONUT.pause is 1.2 s', DONUT.pause >= 1.2);

  const b = spinner();
  b.spin((0.55 * TAU) / 3);                    // past half way
  ok('a half-turn moves the meter', b.meter.state().halves === 1 && b.meter.state().progress >= 0.5, `halves ${b.meter.state().halves}, ${r1(b.meter.state().progress * 100)} %`);
  b.stop(2.5);                                 // a long break: the part past the half goes
  const pb = b.meter.state().progress;
  ok('a long break keeps the banked half', Math.abs(pb - 0.5) < 1e-9, `${r1(pb * 100)} %`);
  b.spin((0.5 * TAU) / 3 + 0.05);
  ok('...so one more half is a doughnut', b.meter.count === 1, `count ${b.meter.count}`);

  const c = spinner();
  c.spin((0.55 * TAU) / 3);
  c.spin((0.3 * TAU) / 3, -3);                 // change your mind: the other way
  ok('swapping direction keeps the banked half', c.meter.state().halves === 1, `halves ${c.meter.state().halves}`);

  // Six halves done as three separate slides, each broken for 2 s: three doughnuts.
  const d = spinner();
  for (let i = 0; i < 6; i++) { d.spin(Math.PI / 3 + 0.02); d.stop(2); }
  ok('six broken half-turns are three doughnuts', d.meter.count === 3, `count ${d.meter.count}`);
}

// ------------------------------------------------- 4. the ring and the arc
console.log('-- the chalk ring and the progress arc');
{
  const ring = buildChalkRing(); ring.finish && ring.finish();
  ok('the chalk ring is built, every face up', ring.v.length > 0 && upFacing(ring), `${ring.i.length / 3} tris`);
  let grows = true, up = true;
  for (let k = 1; k <= DONUT_ARC.steps; k++) {
    const a = buildDonutArc(k), b = k > 1 ? buildDonutArc(k - 1) : null;
    if (b && !(a.i.length > b.i.length)) grows = false;
    if (!upFacing(a)) up = false;
  }
  ok('the arc grows one step at a time, every face up', grows && up, `${DONUT_ARC.steps} steps`);
  ok('arc mesh ids clamp to 1..steps', donutArcId(0) === 'donutarc1' && donutArcId(99) === 'donutarc' + DONUT_ARC.steps);

  const p = PLACES.sayyad;
  const v = new Vehicle(carById('ranger')); v.reset(p.x, p.z, 0.7);
  const G = fakeG(v);
  const m = {}; stage.onEnter(G, m, stage);
  const chalk = G.props.get('job:chalk'), arc = G.props.get('job:donutarc');
  ok('the chalk ring is on the spot the meter counts from', chalk && chalk.x === p.x && chalk.z === p.z && chalk.mesh === 'chalkring',
    chalk ? `ring r ${DONUT_RING.r} m inside a ${DONUT.radius} m zone` : 'missing');
  ok('the arc waits for the first slide', arc && arc.visible === false);
  // A quarter of a doughnut to the left (yaw growing): the arc's far end is the nose.
  m.donut.meter = { count: 0, state: () => ({ progress: 0.25, dir: 1, halves: 0 }) };
  donutArcFollow(G, m, arc);
  const end = arc.yaw + Math.round(0.25 * DONUT_ARC.steps) * (TAU / DONUT_ARC.steps);
  ok('the arc shows, and its leading end is the nose', arc.visible && Math.abs(end - v.yaw) < 1e-9 && arc.x === v.x, `end ${r1(end)} vs yaw ${r1(v.yaw)}`);
  m.donut.meter = { count: 0, state: () => ({ progress: 0.25, dir: -1, halves: 0 }) };
  donutArcFollow(G, m, arc);
  ok('...the other way round, its start end is the nose', Math.abs(arc.yaw - v.yaw) < 1e-9);
  m.donut.meter = { count: 3, state: () => ({ progress: 0.25, dir: 1, halves: 6 }) };
  donutArcFollow(G, m, arc);
  ok('it goes away once the three are done', arc.visible === false);
  stage.onExit(G, m, stage);
  ok('leaving the stage takes the ring and the arc away', !G.props.get('job:chalk') && !G.props.get('job:donutarc'));
}

// ------------------------------------------------- 5. the getaway has a marker
console.log('-- the getaway: a marker and a GPS line out');
{
  const esc = sayyad.build({ carName: 'Ranger' }).find((s) => s.kind === 'escape');
  const nav = new Nav();
  const G = { nav };
  const a = escapeSpot(G), p = PLACES.sayyad;
  const straight = Math.hypot(a.x - p.x, a.z - p.z);
  const r = nav.route(p.x, p.z, a.x, a.z);
  let L = 0; for (let i = 1; i < r.length; i++) L += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
  ok('the marker is past the 300 m line', straight > ESCAPE_M, `${Math.round(straight)} m straight`);
  ok('...and close by road: under 25 s at 60 km/h', L < (60 / 3.6) * 25, `${Math.round(L)} m of road`);
  ok('the stage shows it, with a GPS line, and still passes anywhere', esc.at === escapeSpot && !esc.noTarget && !esc.noRoute && esc.anywhere);
}

// ------------------------------------------------- 6. the canoe crossing
console.log('-- the canoe: no dead air');
{
  const amb = JSON.parse(readFileSync(join(root, 'assets/text/ambient.json'), 'utf8')).ambient;
  const narr = new Set(amb.filter((a) => a.where === 'marina' || a.where === 'beach').map((a) => a.line));
  const missing = PADDLE_LINES.filter((l) => !narr.has(l));
  ok('every crossing line is an existing narrator line, word for word', missing.length === 0, missing.join(' | '));
  ok('no line twice', new Set(PADDLE_LINES).size === PADDLE_LINES.length);

  // The crossing as the bot paddled it on 13 Oct (386 s, leak lines at 0.3, 0.6
  // and 0.85 of the way to swamped): the longest silence between toasts.
  const G = fakeG(null);
  const m = {};
  const leakAt = [116, 232, 330];
  let last = 0, worst = 0, t = 0;
  for (; t < 386; t += DT) {
    const before = G.toasts.length;
    for (const at of leakAt) if (t >= at && t - DT < at) { m.paddleSaid = 0; G.toasts.push('leak'); }
    paddleBeat(G, m, DT);
    if (G.toasts.length > before) { worst = Math.max(worst, t - last); last = t; }
  }
  ok(`a line at least every ${PADDLE_QUIET} s while the pool lasts`, PADDLE_QUIET <= 45);
  const silentEnd = t - last;
  ok('toasts alone keep the 386 s crossing under 60 s of silence', Math.max(worst, silentEnd) <= 60, `worst ${r1(Math.max(worst, silentEnd))} s`);

  // The compass stays on the prompt after the hint time while the canoe moves.
  const paddle = canot.build({ carName: 'Ranger' }).find((s) => s.kind === 'paddle');
  const boat = { x: -1786, z: -38, yaw: 0, vLong: 2.5, water: 0.2 };
  const BG = fakeG(null); BG.boat = boat;
  const pm = { stageTime: HINT_AFTER + 20, hintTime: HINT_AFTER + 20 };
  const shown = paddle.prompt(BG, pm, paddle);
  ok('the compass is the prompt after the hint time', shown === paddleCompass(boat) && /île: \d+ m/.test(shown), shown);
  boat.vLong = 0;
  ok('...and the hint only shows while the canoe sits still', /^Psst: /.test(paddle.prompt(BG, pm, paddle) || ''));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

function upFacing(b) {
  // MeshBuilder vertices: 9 floats (pos, normal, colour); the normal's y is index 4.
  const S = b.v.length / (b.vertCount || (b.v.length / 9));
  for (let i = 0; i < b.v.length; i += S) if (b.v[i + 4] < 0.99) return false;
  return true;
}
