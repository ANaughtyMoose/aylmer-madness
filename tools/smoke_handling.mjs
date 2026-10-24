#!/usr/bin/env node
// A-02: knocks are cheap, crashes still matter, and the Ranger's handbrake
// swings it round instead of ploughing.
//
//   node tools/smoke_handling.mjs
//
// Headless like smoke_driving: cars.js and collide.js only, tarmac everywhere.
import { carById, Vehicle, knockDamage, DAMAGE } from '../src/game/cars.js';
import { collideCars, contact } from '../src/game/collide.js';

let pass = 0, fail = 0;
const out = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; out.push(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; out.push(`  FAIL ${name}${detail ? '   ' + detail : ''}`); }
}
const r2 = (v) => Math.round(v * 100) / 100;
const KMH = 1 / 3.6;

const road = {
  roadAt: () => true,
  waterAt: () => false,
  querySegments: () => [],
  bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 },
};
// One straight wall across the road at z = 6, the shape world.querySegments returns.
const wallWorld = {
  ...road,
  querySegments: () => [{ ax: -50, az: 6, bx: 50, bz: 6 }],
};

// ------------------------------------------------------------- knock costs
{
  const knock = (kmh) => { const v = new Vehicle(carById('ranger')); v.reset(0, 0, 0); v.hit(kmh * KMH, 0, -1); return v.damage; };
  const d04 = knock(0.4), d17 = knock(17), d37 = knock(37), d90 = knock(90);
  ok('0.4 km/h is not an impact', d04 === 0, `damage ${d04}`);
  ok('...nor is 2.9 km/h', knock(2.9) === 0);
  ok('17 km/h knock <= 6', d17 > 0 && d17 <= 6, `damage ${r2(d17)}`);
  ok('37 km/h knock <= 18', d37 <= 18, `damage ${r2(d37)}`);
  ok('90 km/h hit >= 45 (crashes still matter)', d90 >= 45, `damage ${r2(d90)}`);
  ok('the curve only goes up', [5, 10, 20, 40, 60, 80, 100].every((k, i, a) => !i || knockDamage(k * KMH) >= knockDamage(a[i - 1] * KMH)));
  // Jen's two knocks used to leave the truck at 46.
  const v = new Vehicle(carById('ranger')); v.reset(0, 0, 0);
  v.hit(17 * KMH, 0, -1); v.hit(37 * KMH, 0, -1);
  ok('17 then 37 km/h stays cosmetic', v.damage < DAMAGE.COSMETIC, `damage ${r2(v.damage)}`);
  const t = new Vehicle(carById('ranger')); t.reset(0, 0, 0);
  t.hit(0.4 * KMH, 0, -1);
  ok('a 0.4 km/h touch leaves no impact for the camera or the rumble', t.impact === 0 && t.lastHit === 0);
}

// ------------------------------------------------- the real wall pass at 90
{
  const v = new Vehicle(carById('ranger'));
  v.assist = false;
  v.reset(0, 0, 0);
  v.vz = 90 * KMH; v.syncFrame();
  const c = { steer: 0, throttle: 0, brake: 0, handbrake: false };
  for (let i = 0; i < 60 && v.damage === 0; i++) {
    v.update(1 / 60, c, wallWorld);     // update() runs the wall pass itself
  }
  ok('square into a wall at 90 km/h through the wall pass: >= 45', v.damage >= 45, `damage ${r2(v.damage)}`);
}

// ------------------------------------------- a 17 km/h car-to-car nudge
{
  const v = new Vehicle(carById('ranger'));
  v.reset(0, 0, 0); v.vz = 17 * KMH; v.syncFrame();
  const spec = carById('saturn');
  const car = { spec, x: 0, z: 4.4, yaw: Math.PI, speed: 0, spin: 0, vx: 0, vz: 0, yawSpin: 0,
    stunT: 0, honkT: 0, honk: 0, hitBy: 0, len: spec.len, wid: spec.wid, mass: spec.mass };
  const closing = collideCars(v, car);
  if (closing > 0) v.hit(closing, contact.nx, contact.nz);
  ok('rear-ending a stopped car at 17 km/h <= 6', v.damage <= 6, `closing ${r2(closing)} m/s, damage ${r2(v.damage)}`);
}

// ------------------------------------------------------ the Ranger swings
// Full lock and a 0.6 s pull on the lever from 50 km/h, then back on the
// throttle: the way a player does it on the keyboard.
function turn(id, lever, over = {}) {
  const v = new Vehicle(carById(id));
  Object.assign(v.spec = Object.create(v.spec), over);
  v.assist = true;
  v.reset(0, 0, 0);
  v.vz = 50 * KMH; v.syncFrame();
  let t = 0, yaw = 0, prev = v.yaw, span = 0, t180 = null;
  for (let i = 0; i < 60 * 5 && t180 == null; i++) {
    const hb = t < lever;
    v.update(1 / 60, { steer: 1, throttle: hb ? 0 : 1, brake: 0, handbrake: hb }, road);
    t += 1 / 60;
    yaw += v.yaw - prev; prev = v.yaw;
    span = Math.max(span, Math.hypot(v.x, v.z));
    if (Math.abs(yaw) >= Math.PI) t180 = t;
  }
  return { t180, span };
}
{
  const hb = turn('ranger', 0.6);
  const plain = turn('ranger', 0);
  const old = turn('ranger', 0.6, { hbGrip: 0.72, hbYaw: 1.06, hbSwing: 0 });
  ok('Ranger handbrake 180 from 50 km/h in <= 2.5 s', hb.t180 != null && hb.t180 <= 2.5, `t ${hb.t180 && r2(hb.t180)} s`);
  ok('...in a third less road than a plain full-lock turn', hb.span <= plain.span * 0.67,
    `${r2(hb.span)} m vs ${r2(plain.span)} m`);
  ok('...and tighter than the old ploughing Ranger', hb.span < old.span * 0.75,
    `${r2(hb.span)} m vs ${r2(old.span)} m`);
  const r = carById('ranger');
  ok('Ranger lever numbers', r.hbGrip === 0.45 && r.hbYaw === 1.5, `hbGrip ${r.hbGrip} hbYaw ${r.hbYaw}`);
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
