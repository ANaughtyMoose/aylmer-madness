// Brakes: rain, the brake skill, the Freins upgrade and an analogue trigger all
// have to change how far a car takes to stop. Review A1/A2/A4, 29 Sep 2026.
//
// Before the fix the S-key stop braked at Math.max(brake, 8 m/s²) whatever
// multiplied `brake`, so a wet Ranger stopped in exactly the dry 45.5 m, a bus
// with both brake levels stopped in the stock 38.9 m, and a gamepad trigger at
// 7 % braked as hard as one at 100 %. Stock dry numbers must not move.
import { CARS, carById, Vehicle, DIR_BRAKE } from '../src/game/cars.js';
import '../src/game/speeds.js';
import { tuned, brakeDist, accelTime } from '../src/game/upgrades.js';
import { Weather } from '../src/game/weather.js';
import * as skills from '../src/game/skills.js';
import { Rival, SKILL, updateRivals } from '../src/game/race.js';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => {
  if (c) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const group = (n) => console.log('\n' + n);
const f1 = (x) => x.toFixed(1);
const road = { roadAt: () => true, waterAt: () => false, querySegments: () => [], queryPoles: () => [], snapPole: () => {},
  bounds: { minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 } };
const W = new Weather(); W.wet = 1;
const SKILLED = { stats: { skBrake: 1 } };

// ------------------------------------------------------------------------
group('1. stopping from 100 km/h: dry, wet, upgraded, skilled');
// The dry figures are the stock numbers the game shipped with; they must not move.
const STOCK = { ranger: 45.5, civic: 38.4, bus: 38.9, benz: 45.7 };
for (const id of Object.keys(STOCK)) {
  const c = carById(id);
  const dry = brakeDist(c), wet = brakeDist(W.specFor(c));
  const f1d = brakeDist(tuned(c, { freins: 1 })), f2d = brakeDist(tuned(c, { freins: 2 }));
  const sk = brakeDist(skills.specFor(c, SKILLED));
  const wetUp = brakeDist(W.specFor(tuned(c, { freins: 2 })));
  ok(Math.abs(dry - STOCK[id]) < 0.1, `${id}: stock dry stop unchanged`, `${f1(dry)} m (was ${STOCK[id]})`);
  ok(wet > dry * 1.15 && wet < dry * 1.4, `${id}: rain lengthens it, arcade not sim`, `${f1(dry)} -> ${f1(wet)} m (+${((wet / dry - 1) * 100).toFixed(0)} %)`);
  ok(f1d < dry - 1 && f2d < f1d - 1, `${id}: each Freins level shortens it`, `${f1(dry)} / ${f1(f1d)} / ${f1(f2d)} m`);
  ok(sk < dry - 1, `${id}: the brake skill shortens it`, `${f1(sk)} m`);
  ok(wetUp < wet - 1, `${id}: upgraded brakes help in the rain too`, `${f1(wetUp)} m`);
}

group('2. every vehicle: rain always costs, every part always pays');
{
  const bad = [];
  for (const c of CARS) {
    const d = [0, 1, 2].map((l) => brakeDist(tuned(c, { freins: l })));
    const wet = brakeDist(W.specFor(c));
    if (!(wet > d[0] && d[1] < d[0] && d[2] < d[1])) bad.push(`${c.id} ${d.map(f1).join('/')} wet ${f1(wet)}`);
    if (!(c.dirBrake >= DIR_BRAKE && c.dirBrake >= c.brake)) bad.push(`${c.id} dirBrake ${c.dirBrake}`);
  }
  ok(bad.length === 0, `all ${CARS.length} vehicles`, bad.join(' · '));
}

// ------------------------------------------------------------------------
group('3. the gamepad trigger is a pedal, the key is still a key');
const stop80 = (spec, pedal) => {
  const v = new Vehicle(spec); v.reset(0, 0, 0);
  while (v.speedKmh < 80) v.update(1 / 60, { steer: 0, throttle: 1, brake: 0, handbrake: false }, road);
  const z0 = v.z; let t = 0;
  while (v.speedKmh > 1 && t < 60) { v.update(1 / 60, { steer: 0, throttle: 0, brake: pedal, handbrake: false }, road); t += 1 / 60; }
  return v.z - z0;
};
const KEY80 = { ranger: 29.2, civic: 24.6 };
for (const id of Object.keys(KEY80)) {
  const c = carById(id);
  const full = stop80(c, 1), mid = stop80(c, 0.3), light = stop80(c, 0.07);
  ok(Math.abs(full - KEY80[id]) < 0.1, `${id}: a full key/trigger stops exactly as before`, `${f1(full)} m`);
  ok(light > mid && mid > full * 2, `${id}: a lighter trigger stops longer`, `7 % ${f1(light)} · 30 % ${f1(mid)} · 100 % ${f1(full)} m`);
}
{
  // Rolling backwards, W is the direction-change brake: graded by the gas pedal.
  const back = (pedal) => {
    const v = new Vehicle(carById('ranger')); v.reset(0, 0, 0);
    v.vz = -6; v.dir = -1; v.syncFrame && v.syncFrame();
    const z0 = v.z; let t = 0;
    while (v.vLong < -0.3 && t < 30) { v.update(1 / 60, { steer: 0, throttle: pedal, brake: 0, handbrake: false }, road); t += 1 / 60; }
    return Math.abs(v.z - z0);
  };
  ok(back(0.3) > back(1) * 2, 'W while rolling back is graded the same way', `30 % ${f1(back(0.3))} · 100 % ${f1(back(1))} m`);
}

group('4. the one-press stop-then-reverse survives');
for (const id of ['ranger', 'civic', 'bus', 'benz']) {
  const v = new Vehicle(carById(id)); v.reset(0, 0, 0);
  while (v.speedKmh < 50) v.update(1 / 60, { steer: 0, throttle: 1, brake: 0, handbrake: false }, road);
  let clunks = 0, stoppedAt = -1, t = 0;
  for (let i = 0; i < 60 * 8; i++) {
    v.update(1 / 60, { steer: 0, throttle: 0, brake: 1, handbrake: false }, road);
    t += 1 / 60;
    if (v.gearClunk) clunks++;
    if (stoppedAt < 0 && Math.abs(v.vLong) < 0.3) stoppedAt = t;
  }
  ok(clunks === 1 && v.vLong < -2, `${id}: one S press stops, clunks once, and reverses`,
    `stopped ${f1(stoppedAt)} s, ${clunks} clunk, ${f1(v.vLong * 3.6)} km/h`);
}

// ------------------------------------------------------------------------
group('5. an engine upgrade reports the top speed the limiter allows');
{
  const bad = [];
  for (const c of CARS) {
    const t = tuned(c, { moteur: 3 });
    if (t.speedCap && t.topSpeed > t.speedCap + 1e-9) bad.push(`${c.id} ${f1(t.topSpeed * 3.6)} > ${f1(t.speedCap * 3.6)}`);
  }
  ok(bad.length === 0, 'no tuned sheet advertises past its limiter', bad.join(' · '));
  const r = carById('ranger'), r3 = tuned(r, { moteur: 3 });
  ok(Math.abs(r3.topSpeed * 3.6 - 130) < 1e-9, 'Moteur 3 Ranger: 130 km/h, as the limiter holds it', `${f1(r3.topSpeed * 3.6)} km/h`);
  const a0 = accelTime(r), a3 = accelTime(r3);
  ok(a3 < a0 - 1, '...and the engine still buys acceleration', `0-100 ${f1(a0)} -> ${f1(a3)} s`);
  const civic3 = tuned(carById('civic'), { moteur: 3 });
  ok(civic3.topSpeed > carById('civic').topSpeed, 'an uncapped car still gains top speed', `${f1(civic3.topSpeed * 3.6)} km/h`);
}

// ------------------------------------------------------------------------
group('6. rain is everybody\'s rain: race rivals drive the wet sheet');
{
  const rv = new Rival(carById('civic'), { skill: SKILL.dave });
  rv.setPath([[0, 0], [400, 0]]); rv.place(0, 0, Math.PI / 2); rv.active = true;
  const player = new Vehicle(tuned(carById('civic'), { freins: 2 })); player.reset(1000, 1000, 0);
  const G = { rivals: [rv], veh: player, phys: road, weather: W };
  for (let i = 0; i < 60; i++) updateRivals(G, 1 / 60);
  ok(rv.veh.spec !== rv.spec && rv.veh.spec.grip < rv.spec.grip && rv.veh.spec.dirBrake < rv.spec.dirBrake,
    'a wet road costs the rival grip and brakes', `grip ${rv.spec.grip} -> ${rv.veh.spec.grip.toFixed(3)}`);
  ok(rv.spec === carById('civic'), '...and its own sheet stays the dry stock one');
  const a = W.specFor(rv.spec), b = W.specFor(player.spec);
  ok(a !== b && W.specFor(rv.spec) === a && W.specFor(player.spec) === b,
    'two sheets with one id each keep their own cached wet clone');
  const Dry = new Weather();
  for (let i = 0; i < 2; i++) updateRivals({ ...G, weather: Dry }, 1 / 60);
  ok(rv.veh.spec === rv.spec, 'on a dry road the rival drives its own sheet, untouched');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
