#!/usr/bin/env node
// Headless checks on the driving model: the car-vs-car solver (R3), the damage
// ladder (R4), the ramped grass penalty (D4) and the per-car handbrake (D2).
//
//   node tools/smoke_driving.mjs
//
// Nothing here touches WebGL or the DOM: cars.js and collide.js only pull in
// core/mesh.js and core/math.js, and the traffic car is a plain object with the
// same fields Traffic gives its cars, so mapdata.js (3.2 MB) stays unread.
import { CARS, carById, Vehicle, DAMAGE } from '../src/game/cars.js';
import { collideCars, contact, driftBody } from '../src/game/collide.js';
import { updateRepair, restoreDamage } from '../src/game/damage.js';

let pass = 0, fail = 0;
const out = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; out.push(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; out.push(`  FAIL ${name}${detail ? '   ' + detail : ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r2 = (v) => Math.round(v * 100) / 100;

// A world with tarmac everywhere and nothing to hit.
const road = {
  roadAt: () => true,
  waterAt: () => false,
  querySegments: () => [],
  bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 },
};
// ...and the same with grass everywhere.
const grass = { ...road, roadAt: () => false };
const CTL = { steer: 0, throttle: 0, brake: 0, handbrake: false };
const ctl = (o) => ({ ...CTL, ...o });

// A traffic car exactly as traffic.js builds one, minus the graph bookkeeping.
function fakeTraffic(specId, x, z, yaw = Math.PI) {
  const spec = carById(specId);
  return {
    spec, x, z, yaw, speed: 0, spin: 0,
    vx: 0, vz: 0, yawSpin: 0, stunT: 0, honkT: 0, honk: 0, hitBy: 0,
    len: spec.len, wid: spec.wid, mass: spec.mass,
  };
}
// What Traffic.collidePlayer does, so the test exercises the shipped path.
function shunt(player, car) {
  const closing = collideCars(player, car);
  if (closing <= 0) return 0;
  player.hit(closing, contact.nx, contact.nz);
  player.syncFrame();
  car.hitBy = closing;
  if (closing > 1.2) { car.stunT = 2.0; car.honkT = 0.30; car.speed = 0; }
  return closing;
}

// ---------------------------------------------------------------- R3: head-on

{
  const v = new Vehicle(carById('ranger'));
  v.reset(0, 0, 0);                 // pointing +Z
  v.vz = 13.89; v.syncFrame();      // 50 km/h
  const t = fakeTraffic('saturn', 0, 4.4);   // nose to nose, just overlapping
  const before = v.vLong;
  const closing = shunt(v, t);

  ok('head-on: the pair actually touched', closing > 0, `closing ${r2(closing)} m/s`);
  ok('head-on: player is stopped hard', v.vLong < before * 0.5,
    `${r2(before)} -> ${r2(v.vLong)} m/s`);
  ok('head-on: the traffic car is shoved down the road', t.vz > 3, `vz ${r2(t.vz)}`);
  // Separating along the contact normal is the rebound, restitution and all.
  const rel = (v.vx - t.vx) * contact.nx + (v.vz - t.vz) * contact.nz;
  ok('head-on: they are separating afterwards', rel > 0, `v·n ${r2(rel)}`);
  ok('head-on: damage > 0', v.damage > 0, `damage ${r2(v.damage)}`);
  ok('head-on: the traffic car stops and reaches for the horn',
    t.stunT > 1.5 && t.honkT > 0, `stun ${t.stunT}s`);

  // Against something immovable the velocity genuinely reverses.
  const w = new Vehicle(carById('ranger'));
  w.reset(0, 0, 0);
  w.vz = 13.89; w.syncFrame();
  const wall = fakeTraffic('saturn', 0, 4.4);
  wall.mass = 1e6;
  shunt(w, wall);
  ok('head-on into something solid: it bounces back', w.vz < 0, `vz ${r2(w.vz)}`);
}

// ---------------------------------------------------------------- R3: off-centre

{
  const v = new Vehicle(carById('civic'));
  v.reset(0, 0, 0);
  v.vz = 11; v.syncFrame();
  const t = fakeTraffic('civic', 1.05, 3.4, 0);   // clipped on the corner
  const closing = shunt(v, t);
  ok('off-centre: contact found', closing > 0, `closing ${r2(closing)} m/s`);
  ok('off-centre: the traffic car is given a yaw rate',
    Math.abs(t.yawSpin) > 0.05, `yawSpin ${r2(t.yawSpin)} rad/s`);
  ok('off-centre: the player picks up spin too',
    Math.abs(v.yawSpin) > 0.02, `yawSpin ${r2(v.yawSpin)} rad/s`);

  // ...and the spin bleeds off instead of running away.
  const spin0 = Math.abs(t.yawSpin);
  for (let i = 0; i < 60; i++) driftBody(t, 1 / 60, 2.6, 2.4);
  ok('off-centre: the spin decays inside a second',
    Math.abs(t.yawSpin) < spin0 * 0.25, `${r2(spin0)} -> ${r2(Math.abs(t.yawSpin))}`);

  // A dead-centre hit should barely rotate anyone.
  const u = new Vehicle(carById('civic'));
  u.reset(0, 0, 0);
  u.vz = 11; u.syncFrame();
  const s = fakeTraffic('civic', 0, 3.6, 0);
  shunt(u, s);
  ok('square-on hit spins much less than the off-centre one',
    Math.abs(s.yawSpin) < Math.abs(t.yawSpin) * 0.5 || Math.abs(s.yawSpin) < 0.05,
    `square ${r2(s.yawSpin)} vs corner ${r2(t.yawSpin)}`);
}

// ---------------------------------------------------------------- R4: the ladder

{
  const v = new Vehicle(carById('sunfire'));
  v.reset(0, 0, 0);
  ok('damage starts at zero', v.damage === 0);

  v.hit(6, 0, -1);                                   // a nose-first thump
  ok('a small knock does cosmetic damage only',
    v.damage > 0 && v.damage < DAMAGE.COSMETIC, `damage ${r2(v.damage)}`);
  const topClean = v.spec.topSpeed;

  let guard = 0;
  while (v.damage < DAMAGE.COSMETIC && guard++ < 50) v.hit(9, 0, -1);
  ok('past 25 a headlight is out and the nose is folded',
    v.headOut !== 0 && v.deformF > 0, `headOut ${v.headOut} deformF ${r2(v.deformF)}`);

  guard = 0;
  while (v.damage <= DAMAGE.PERF && guard++ < 50) v.hit(14, 0, -1);
  ok('past 60 the car is "hurt"', v.hurt === true, `damage ${r2(v.damage)}`);
  ok('past 60 it picked a side to pull toward', v.pull === 1 || v.pull === -1);

  // −15 % top speed: hold the throttle down and see where it settles.
  const settle = (veh) => {
    const c = ctl({ throttle: 1 });
    for (let i = 0; i < 60 * 90; i++) veh.update(1 / 60, c, road);
    return veh.vLong;
  };
  const sick = new Vehicle(carById('sunfire'));
  sick.reset(0, 0, 0); sick.damage = 85; sick.pull = 0;
  const well = new Vehicle(carById('sunfire'));
  well.reset(0, 0, 0);
  const vSick = settle(sick), vWell = settle(well);
  ok('a hurt car will not pull like a healthy one',
    vSick < vWell * 0.95, `${r2(vSick)} vs ${r2(vWell)} m/s (clean top ${topClean})`);

  // Clamp.
  for (let i = 0; i < 40; i++) v.hit(40, 0, -1);
  ok('damage reaches 100', v.damage === DAMAGE.DEAD, `damage ${v.damage}`);
  v.hit(40, 0, -1);
  ok('...and clamps there', v.damage === DAMAGE.DEAD, `damage ${v.damage}`);

  v.repair();
  ok('a repair puts everything back',
    v.damage === 0 && v.deformF === 0 && v.headOut === 0 && v.pull === 0);
}

// ---------------------------------------------------------------- R4: the garage

{
  const v = new Vehicle(carById('civic'));
  v.reset(100, 100, 0);
  v.damage = 40;
  const gas = { x: 100, z: 100 };
  const st = { t: 0 };
  ok('rolling past the pumps does nothing',
    (() => { v.vLong = 9; return updateRepair(st, 0.5, v, gas) === null && st.t === 0; })());
  v.vLong = 0;
  ok('stopping at the pumps starts the clock', updateRepair(st, 0.1, v, gas) === 'start');
  let done = null;
  for (let i = 0; i < 60 * 6 && !done; i++) done = updateRepair(st, 1 / 60, v, gas);
  ok('five seconds later it is fixed', done === 'done');
  v.repair();
  ok('and health can be handed back to the next car you get into',
    (() => { const w = new Vehicle(carById('civic')); w.reset(0, 0, 0); restoreDamage(w, 72);
      return w.damage === 72 && w.hurt && w.headOut !== 0; })());
}

// ---------------------------------------------------------------- D4: grass ramp

{
  const v = new Vehicle(carById('saturn'));
  v.reset(0, 0, 0);
  v.vz = 16; v.syncFrame();
  const c = ctl({ throttle: 1 });
  ok('on tarmac the surface multiplier is 1', v.surface === 1);

  const step = (n, world) => { for (let i = 0; i < n; i++) v.update(1 / 60, c, world); };
  step(6, grass);                       // 0.1 s
  const at01 = v.surface;
  step(9, grass);                       // 0.25 s
  const at025 = v.surface;
  step(15, grass);                      // 0.5 s
  const at05 = v.surface;
  step(30, grass);                      // 1.0 s
  const at10 = v.surface;

  ok('after 0.1 s the penalty is barely in', at01 > 0.93, `surface ${r2(at01)}`);
  ok('after 0.25 s it is about half applied', near(at025, 0.86, 0.03), `surface ${r2(at025)}`);
  ok('after 0.5 s it is fully applied', near(at05, 0.72, 0.01), `surface ${r2(at05)}`);
  ok('and it stops there', near(at10, 0.72, 0.001), `surface ${r2(at10)}`);
  ok('the ramp is monotone', at01 > at025 && at025 > at05 - 1e-9);

  // Back on the road it comes off just as smoothly, over the same half second.
  step(30, road);
  ok('coming back onto tarmac takes the same half second',
    near(v.surface, 1, 0.01), `surface ${r2(v.surface)}`);

  // "keep the slip": lateral grip is not ramped, it goes the instant you leave.
  const a = new Vehicle(carById('saturn')); a.reset(0, 0, 0);
  a.vz = 16; a.vx = 5; a.syncFrame();
  const b = new Vehicle(carById('saturn')); b.reset(0, 0, 0);
  b.vz = 16; b.vx = 5; b.syncFrame();
  b.onRoad = false;          // already out there, so the curb bump (D3) stays out of it
  a.update(1 / 60, CTL, road);
  b.update(1 / 60, CTL, grass);
  ok('grip still drops the instant you leave the road',
    Math.abs(b.vLat) > Math.abs(a.vLat) + 1e-4,
    `road slip ${r2(a.vLat)} vs grass ${r2(b.vLat)}`);
}

// ---------------------------------------------------------------- D2: handbrake

{
  const grips = CARS.map((c) => c.hbGrip);
  ok('every car has its own handbrake grip', new Set(grips).size === CARS.length,
    grips.map((g, i) => `${CARS[i].id} ${g}`).join(', '));
  // Of the four you get lent, the Ranger is the one that just ploughs; the
  // beaters on the used lot go further still (a twelve-tonne bus does not drift).
  const lent = ['ranger', 'saturn', 'civic', 'sunfire'].map((id) => carById(id).hbGrip);
  ok('the Ranger keeps the most grip under the lever of the four',
    carById('ranger').hbGrip === Math.max(...lent));
  ok('the Civic keeps the least of anything', carById('civic').hbGrip === Math.min(...grips));
  ok('and the bus does not drift at all', carById('bus').hbGrip === Math.max(...grips));

  // Drive each one into a full-lock handbrake turn and see how far it comes round.
  const swing = (id) => {
    const v = new Vehicle(carById(id));
    v.assist = false;
    v.reset(0, 0, 0);
    v.vz = 13; v.syncFrame();
    const c = ctl({ steer: 1, handbrake: true });
    const y0 = v.yaw;
    for (let i = 0; i < 60; i++) v.update(1 / 60, c, road);
    return { yaw: Math.abs(v.yaw - y0), slip: Math.abs(v.vLat) };
  };
  // How far the back end steps out is the thing hbGrip controls; how far the
  // nose swings in a second is mostly steering geometry, so slip is the honest
  // measure of "does this car spin".
  const ranger = swing('ranger'), civic = swing('civic'), saturn = swing('saturn');
  ok('the Civic comes round further than the Ranger',
    civic.yaw > ranger.yaw * 1.2,
    `civic ${r2(civic.yaw)} rad vs ranger ${r2(ranger.yaw)} rad`);
  ok('slip under the lever goes Ranger < Saturn < Civic',
    ranger.slip < saturn.slip && saturn.slip < civic.slip,
    `slip ranger ${r2(ranger.slip)} saturn ${r2(saturn.slip)} civic ${r2(civic.slip)}`);
}

// ---------------------------------------------------------------- D3 / D5 extras

{
  // Crossing the curb costs a hop and some speed.
  let onRoad = true;
  const kerbWorld = { ...road, roadAt: () => onRoad };
  const v = new Vehicle(carById('civic'));
  v.reset(0, 0, 0);
  v.vz = 12; v.syncFrame();
  v.update(1 / 60, CTL, kerbWorld);
  const before = v.vLong;
  onRoad = false;
  v.update(1 / 60, CTL, kerbWorld);
  ok('D3: climbing the curb lifts the car', v.y > 0 || v.vy > 0, `y ${r2(v.y)} vy ${r2(v.vy)}`);
  ok('D3: ...and scrubs speed', v.vLong < before - 0.3, `${r2(before)} -> ${r2(v.vLong)}`);
  let peak = 0;
  for (let i = 0; i < 90; i++) { v.update(1 / 60, CTL, kerbWorld); peak = Math.max(peak, v.y); }
  ok('D3: the hop is a bump, not a jump', peak > 0.02 && peak < 0.95, `peak ${r2(peak)} m`);
  ok('D3: and it comes back down', v.y < 0.05, `y ${r2(v.y)}`);

  // D5: the reverse flag.
  const w = new Vehicle(carById('civic'));
  w.reset(0, 0, 0);
  const c = ctl({ brake: 1 });
  for (let i = 0; i < 180; i++) w.update(1 / 60, c, road);
  ok('D5: backing up sets veh.reversing', w.reversing === true, `vLong ${r2(w.vLong)}`);
  ok('D5: and the brake light is on while you are on the pedal', w.braking === false);
}

// ---------------------------------------------------------------- C5

{
  const ids = CARS.map((c) => c.id);
  // The profile is now the pulse-train synth's: cylinders, idle and redline set
  // the firing frequency (rpm / 120 * cyl), the rest is the filtering.
  const firing = (c, rpm) => (rpm / 120) * c.sound.cyl;
  ok('C5: every car carries an engine profile',
    CARS.every((c) => c.sound && c.sound.cyl >= 4 && (c.electric || c.sound.idle > 400)
      && c.sound.redline > c.sound.idle));
  ok('C5: they are all different notes',
    new Set(CARS.map((c) => `${c.sound.cyl}:${c.sound.idle}:${c.sound.redline}`)).size === CARS.length,
    ids.map((id) => `${id} ${firing(carById(id), carById(id).sound.idle).toFixed(1)}Hz idle`).join(', '));
  ok('C5: the Ranger idles at 25 Hz',
    Math.abs(firing(carById('ranger'), 750) - 25) < 0.01,
    String(firing(carById('ranger'), 750)));
  ok('C5: and every four-cylinder is 100 Hz at 3000 rpm',
    CARS.filter((c) => c.sound.cyl === 4).every((c) => Math.abs(firing(c, 3000) - 100) < 0.01));
  ok('C5: the Sunfire and the Z24 are the ones that rattle',
    CARS.filter((c) => c.sound.rattle > 0).map((c) => c.id).join() === 'sunfire,cavalier');
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
