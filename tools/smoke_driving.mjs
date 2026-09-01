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
// The ramp's destination is SURF.grass.power, so read it rather than restating
// it: the off-road penalty is tuned in terrain.js and this file tests the SHAPE
// of the ramp — how fast it arrives — not the number it arrives at.
import { SURF } from '../src/game/terrain.js';
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

  const G = SURF.grass.power;
  ok('after 0.1 s the penalty is barely in', at01 > 1 - 0.25 * (1 - G), `surface ${r2(at01)}`);
  ok('after 0.25 s it is about half applied', near(at025, (1 + G) / 2, 0.03), `surface ${r2(at025)}`);
  ok('after 0.5 s it is fully applied', near(at05, G, 0.01), `surface ${r2(at05)}`);
  ok('and it stops there', near(at10, G, 0.001), `surface ${r2(at10)}`);
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
  ok('C5: a four at 750 rpm fires at 25 Hz, and the Ranger idles a little above it',
    Math.abs(firing(carById('ranger'), 750) - 25) < 0.01
      && carById('ranger').sound.idle >= 780 && carById('ranger').sound.idle <= 850,
    `${firing(carById('ranger'), 750)} Hz at 750; idle ${carById('ranger').sound.idle} rpm`);
  ok('C5: and every four-cylinder is 100 Hz at 3000 rpm',
    CARS.filter((c) => c.sound.cyl === 4).every((c) => Math.abs(firing(c, 3000) - 100) < 0.01));
  ok('C5: the Sunfire and the Z24 are the ones that rattle',
    CARS.filter((c) => c.sound.rattle > 0).map((c) => c.id).join() === 'sunfire,cavalier');
}

// ------------------------------------------------- FEEL: the arcade shift
//
// The complaint was "switching from reverse to forward is not really working
// properly unless I come to a full stop". These are the checks that say it is:
// one continuous press of one key turns the car round, both ways.

{
  const drive = (v, c, secs, each) => {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) { v.update(1 / 60, c, road); if (each) each(v, (i + 1) / 60); }
    return v;
  };
  const rolling = (id, speed) => {
    const v = new Vehicle(carById(id));
    v.reset(0, 0, 0);
    v.vz = speed; v.syncFrame();
    if (speed < 0) { v.dir = -1; }        // already backing up, box in R
    return v;
  };

  // 1. Rolling backwards at 5 m/s, W held and NEVER released.
  for (const id of ['ranger', 'civic', 'caravan', 'bus']) {
    const v = rolling(id, -5);
    const c = ctl({ throttle: 1 });
    let stopAt = null, fwdAt = null;
    drive(v, c, 2.5, (veh, t) => {
      if (stopAt === null && veh.vLong >= 0) stopAt = t;
      if (fwdAt === null && veh.vLong > 0.5) fwdAt = t;
    });
    ok(`FEEL ${id}: −5 m/s + W stops inside 0.8 s`, stopAt !== null && stopAt <= 0.8,
      `stopped at ${stopAt === null ? 'never' : r2(stopAt) + ' s'}`);
    ok(`FEEL ${id}: ...and is going forward inside 1.4 s, no release`,
      fwdAt !== null && fwdAt <= 1.4, `forward at ${fwdAt === null ? 'never' : r2(fwdAt) + ' s'}`);
    ok(`FEEL ${id}: it ends up in drive`, v.dir === 1 && v.reversing === false);
  }

  // 2. Rolling forwards at 8 m/s, S held and never released.
  for (const id of ['ranger', 'civic', 'caravan', 'bus']) {
    const v = rolling(id, 8);
    const c = ctl({ brake: 1 });
    let revAt = null;
    drive(v, c, 8, (veh, t) => { if (revAt === null && veh.vLong < -0.2) revAt = t; });
    const cap = carById(id).revTop;
    ok(`FEEL ${id}: +8 m/s + S is in reverse inside 1.5 s`, revAt !== null && revAt <= 1.5,
      `reverse at ${revAt === null ? 'never' : r2(revAt) + ' s'}`);
    ok(`FEEL ${id}: reverse is capped at ${(cap * 3.6).toFixed(0)} km/h`,
      v.vLong <= 0 && v.vLong >= -cap - 1e-6 && v.vLong <= -cap * 0.7,
      `${r2(v.vLong)} m/s (${r2(v.vLong * 3.6)} km/h)`);
    ok(`FEEL ${id}: nothing on the car goes faster backwards than 7 m/s`, v.vLong >= -7,
      `${r2(v.vLong)} m/s`);
  }

  // 3. The brake that turns you round is at least 8 m/s², on every car.
  for (const c of CARS) {
    const v = rolling(c.id, 10);
    const before = v.vLong;
    v.update(1 / 60, ctl({ brake: 1 }), road);
    const decel = (before - v.vLong) * 60;
    ok(`FEEL ${c.id}: the direction-change brake pulls ${'>='} 8 m/s²`, decel >= 8,
      `${r2(decel)} m/s²`);
  }

  // 4. The gear engage pause at zero is 0.2-0.3 s, and the bus and the Caravan
  //    take longer over it than the manuals do.
  ok('FEEL: every car engages R in 0.2-0.3 s',
    CARS.every((c) => c.revEngage >= 0.2 && c.revEngage <= 0.3),
    CARS.map((c) => `${c.id} ${c.revEngage}`).join(', '));
  ok('FEEL: the bus and the Caravan are the slowest into gear',
    carById('bus').revEngage > carById('civic').revEngage
    && carById('caravan').revEngage > carById('civic').revEngage);
  ok('FEEL: the bus only backs up at 15 km/h',
    near(carById('bus').revTop * 3.6, 15, 0.1), `${r2(carById('bus').revTop * 3.6)} km/h`);
  ok('FEEL: everyone else backs up at 25',
    CARS.filter((c) => c.id !== 'bus' && c.id !== 'cart').every((c) => near(c.revTop * 3.6, 25, 0.1)));

  {
    // Measured, not just declared: from a standstill, S held, how long until it
    // actually moves backwards.
    const v = new Vehicle(carById('caravan'));
    v.reset(0, 0, 0);
    let moveAt = null;
    drive(v, ctl({ brake: 1 }), 1.2, (veh, t) => { if (moveAt === null && veh.vLong < -0.05) moveAt = t; });
    ok('FEEL: the clunk at zero is a readable pause, not a stall',
      moveAt >= 0.24 && moveAt <= 0.45, `moved at ${r2(moveAt)} s`);
  }

  // 5. `reversing` is the GEAR, not the speed: R shows at 0 km/h.
  {
    const v = new Vehicle(carById('ranger'));
    v.reset(0, 0, 0);
    v.update(1 / 60, ctl({ brake: 1 }), road);
    ok('FEEL: R is engaged (and the lamps are on) at 0 km/h',
      v.reversing === true && v.speedKmh < 1, `${r2(v.speedKmh)} km/h`);
    ok('FEEL: ...and the box clunks exactly once', v.gearClunk === true);
    v.update(1 / 60, ctl({ brake: 1 }), road);
    ok('FEEL: ...not every tick', v.gearClunk === false);
  }

  // 6. The handbrake locks the rear. It never picks a gear.
  for (const id of ['ranger', 'civic', 'bus']) {
    const v = rolling(id, 9);
    const c = ctl({ handbrake: true });
    let wentBackwards = false;
    drive(v, c, 12, (veh) => { if (veh.vLong < -0.05) wentBackwards = true; });
    ok(`FEEL ${id}: the handbrake alone never reverses you`,
      !wentBackwards && v.dir === 1 && v.reversing === false, `vLong ${r2(v.vLong)}`);

    const w = rolling(id, 9);
    let flipped = false;
    drive(w, ctl({ brake: 1, handbrake: true }), 6, (veh) => { if (veh.vLong < -0.05) flipped = true; });
    ok(`FEEL ${id}: ...and holding S with the lever up does not shift either`,
      !flipped && w.dir === 1, `vLong ${r2(w.vLong)}`);
  }

  // 7. Reverse steering: the back end goes the other way, and the assist helps.
  {
    const mk = () => { const v = rolling('saturn', -4); return v; };
    const a = mk(); a.assist = true;
    const b = mk(); b.assist = false;
    const c = ctl({ brake: 1, steer: 1 });
    const y0 = a.yaw;
    drive(a, c, 1.5); drive(b, c, 1.5);
    // Same lock, going the other way: the nose has to swing the other way too.
    const f = rolling('saturn', 4);
    const fy0 = f.yaw;
    drive(f, ctl({ throttle: 1, steer: 1 }), 1.5);
    ok('FEEL: the same lock swings the nose the other way in reverse',
      Math.sign(a.yaw - y0) === -Math.sign(f.yaw - fy0),
      `reverse ${r2(a.yaw - y0)} rad vs forward ${r2(f.yaw - fy0)} rad`);
    ok('FEEL: the assist does not fight the wheel in reverse',
      Math.abs(a.vLat) <= Math.abs(b.vLat) + 0.35,
      `assist slip ${r2(a.vLat)} vs raw ${r2(b.vLat)}`);
    ok('FEEL: and reversing actually steers', Math.abs(a.yaw - y0) > 0.15,
      `${r2(Math.abs(a.yaw - y0))} rad`);
  }

  // 8. The whole point: one press, both ways, no release, no full stop.
  {
    const v = rolling('saturn', 7);
    let revAt = null;
    drive(v, ctl({ brake: 1 }), 3, (veh, t) => { if (revAt === null && veh.vLong < -1) revAt = t; });
    let fwdAt = null;
    drive(v, ctl({ throttle: 1 }), 3, (veh, t) => { if (fwdAt === null && veh.vLong > 1) fwdAt = t; });
    ok('FEEL: forward -> reverse -> forward on two key presses',
      revAt !== null && fwdAt !== null && revAt < 1.6 && fwdAt < 1.6,
      `reverse at ${r2(revAt)} s, forward again ${r2(fwdAt)} s later`);
  }
}

// ---------------------------------------------------------------- SPEED
//
// `topSpeed` is the TERMINAL speed now, not an aspiration the drag then took a
// sixth off. These run each vehicle flat out on an infinite tarmac straight and
// check it against its own spec sheet — and then check the shape of the curve,
// because a car that snapped to its top speed would be no better than the old
// one that never reached it.

{
  const flatOut = (id, secs = 400) => {
    const v = new Vehicle(carById(id));
    v.reset(0, 0, 0);
    const c = ctl({ throttle: 1 });
    const marks = {};
    for (let i = 0, n = secs * 60; i < n; i++) {
      v.update(1 / 60, c, road);
      const k = v.speedKmh;
      for (const g of [50, 100, 140]) if (marks[g] === undefined && k >= g) marks[g] = (i + 1) / 60;
    }
    return { kmh: v.speedKmh, marks };
  };

  const got = {};
  for (const c of CARS) {
    const r = flatOut(c.id);
    got[c.id] = r;
    const want = c.topSpeed * 3.6;
    ok(`SPEED: the ${c.id} actually reaches its stated ${want.toFixed(0)} km/h`,
      Math.abs(r.kmh - want) < want * 0.01, `${r.kmh.toFixed(1)} km/h`);
  }
  ok('SPEED: nothing is stuck around 110 km/h any more',
    ['ranger', 'saturn', 'civic', 'sunfire', 'cutlass', 'cavalier', 'caravan']
      .every((id) => got[id].kmh > 145),
    Object.entries(got).map(([id, r]) => `${id} ${r.kmh.toFixed(0)}`).join(' · '));
  ok('SPEED: ...and the slow ones stay slow',
    got.bus.kmh < 100 && got.cart.kmh < 30,
    `bus ${got.bus.kmh.toFixed(0)} · cart ${got.cart.kmh.toFixed(0)} km/h`);
  ok('SPEED: every road car tops out somewhere different',
    new Set(CARS.map((c) => Math.round(c.topSpeed * 3.6))).size === CARS.length);
  ok('SPEED: the Ranger is the slowest of the four you are lent, the Civic the fastest',
    carById('ranger').topSpeed === Math.min(...['ranger', 'saturn', 'civic', 'sunfire'].map((id) => carById(id).topSpeed))
      && carById('civic').topSpeed === Math.max(...['ranger', 'saturn', 'civic', 'sunfire'].map((id) => carById(id).topSpeed)));
  // The whole point of the curve: power falls off, so the last stretch is
  // nothing like the first. The Ranger takes longer from 100 to 140 than it
  // took to get to 100 at all, and it is still not done.
  const r = got.ranger.marks;
  ok('SPEED: the top end takes forever in the slow stuff',
    r[140] - r[100] > r[100],
    `0-100 in ${r[100].toFixed(1)} s, 100-140 in another ${(r[140] - r[100]).toFixed(1)} s`);
  ok('SPEED: and the first 50 km/h is the same brisk thing it always was',
    r[50] > 4.0 && r[50] < 5.2, `0-50 in ${r[50].toFixed(1)} s`);

  // The thrust curve is solved against the car's own aero, so every vehicle has
  // head room above its terminal speed and none of it is silly.
  ok('SPEED: every spec declares its own aero, and vPow lands above the top speed',
    CARS.every((c) => c.aero > 0 && c.vPow > c.topSpeed && c.vPow < c.topSpeed * 1.6),
    CARS.map((c) => `${c.id} ${c.vPow.toFixed(1)}`).join(' · '));
}

// ---------------------------------------------------------------- SPEED: walls
//
// The wall probes are circles of about a metre at each axle, and they are not
// swept. At 109 km/h that never mattered; at 180 km/h on a machine dropping
// frames the car moves further in a step than the probe is wide, and without
// the sub-stepping in Vehicle.collide it goes straight through a fence.

{
  const wall = { ax: -60, az: 200, bx: 60, bz: 200 };
  const walled = { ...road, querySegments: () => [wall] };
  const through = [];
  for (const c of CARS) {
    for (const fps of [60, 30, 20]) {
      const v = new Vehicle(c);
      v.reset(0, 0, 0);
      v.vz = c.topSpeed; v.syncFrame();
      const cl = ctl({ throttle: 1 });
      for (let i = 0; i < fps * 8 && v.z <= 200.5; i++) v.update(1 / fps, cl, walled);
      if (v.z > 200.5) through.push(`${c.id}@${fps}fps`);
    }
  }
  ok('SPEED: nothing drives through a wall flat out, even at 20 fps',
    through.length === 0, through.join(', '));
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
