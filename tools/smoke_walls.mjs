// Nothing goes through a wall, or through a bus:  node tools/smoke_walls.mjs
//
// Thomas's first playtest: "sometimes you can drive through walls or a bus."
// Two separate bugs with the same shape — a collider made of two circles with a
// hole between them, and a sampling loop that could step over a wall.
//
// What is being protected:
//
//   1. Vehicle.collide's bites. They are a SAMPLING of the frame's path, and a
//      cap of five of them meant anything moving more than 3.45 m in a step laid
//      them further apart than the probe is wide. The cap is gone and a swept
//      segment test of the path itself backs it up, so the guarantee no longer
//      depends on how long the step was.
//
//   2. Vehicle.collide's probe circles. Two of them — one per axle — leave the
//      middle of the body empty: 84 cm on the Ranger, four metres on the bus.
//      Slide either one sideways into a fence post and it goes straight through
//      the gap. Measured, before the fix: the bus crossed a four-metre wall
//      broadside at 60 km/h at a clean 60 fps.
//
//   3. collide.js's car-vs-car circles, which had exactly the same hole and a
//      much bigger one — 6.5 m of the middle of a 12 m bus with no collider in
//      it. A car parked across the middle of a bus registered no contact at all.
//
//   4. That the frame loop in main.js and the bite sizing still agree. The loop
//      sub-steps `dt` so no integrator ever sees more than STEP; if that cap
//      ever changes, the step cars.js is asked to cover changes with it.
//
// Nothing here touches WebGL or the DOM. main.js is read as text (the same trick
// tools/smoke_shell.mjs uses) because it cannot be imported: docs/VERIFY.md,
// "green tests, broken game".

import { readFileSync } from 'node:fs';
import { Vehicle, carById, CARS } from '../src/game/cars.js';
import { findContact, collideCars, nearby, contact, SPACING } from '../src/game/collide.js';
import { CITY_BUS, SCHOOL_BUS } from '../src/game/buses.js';

let pass = 0, fail = 0;
const out = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; out.push(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; out.push(`  FAIL ${name}${detail ? '   ' + detail : ''}`); }
};
const group = (n) => out.push('\n' + n);
const r2 = (v) => Math.round(v * 100) / 100;

// A world with tarmac everywhere and one wall in it.
const road = {
  roadAt: () => true,
  waterAt: () => false,
  querySegments: () => [],
  bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 },
};
const walled = (ax, az, bx, bz) =>
  ({ ...road, querySegments: () => [{ ax, az, bx, bz }] });

// ------------------------------------------------------------ 1. tunnelling
//
// One integrated step, by hand, exactly as Vehicle.update does it: move by
// v * dt and then call collide with the same dt. The car starts fully clear of
// the wall — its nose plus the probe radius short of it — so the whole step is
// the thing under test and nothing is resolving a pre-existing overlap.
function oneStep(spec, kmh, dt, wall, yawDeg = 0) {
  const v = new Vehicle(spec);
  const yaw = (yawDeg * Math.PI) / 180;
  v.reset(0, -(spec.len * 0.28 + spec.wid * 0.52 + 0.15), yaw);
  const sp = kmh / 3.6;
  v.vx = Math.sin(yaw) * sp; v.vz = Math.cos(yaw) * sp;
  v.syncFrame();
  v.x += v.vx * dt; v.z += v.vz * dt;
  v.collide(wall, dt);
  return v;
}

// A 1.6 m fence panel at z = 0, which is the smallest collider the world builds
// (world.js lays the Galeries dock fence down in 2 m pieces).
const FENCE = walled(-0.8, 0, 0.8, 0);
const WALL = walled(-60, 0, 60, 0);

group('a car does not end a step on the far side of a fence');
{
  // 60 Hz is the display; 32 is the worst step the frame loop in main.js can
  // ever hand cars.js (dt clamped to 0.25 over at most 8 sub-steps); 20 and 8
  // are past what the loop allows and are here because the guarantee should not
  // depend on that clamp staying where it is.
  const through = [];
  for (const kmh of [60, 120, 180, 300]) {
    for (const fps of [60, 32, 20, 8]) {
      const v = oneStep(carById('ranger'), kmh, 1 / fps, FENCE);
      if (v.z >= 0) through.push(`${kmh}km/h@${fps}fps z=${r2(v.z)}`);
    }
  }
  ok('the Ranger is stopped by a 1.6 m fence at every speed and step',
    through.length === 0, through.join(', '));
}
{
  const v60 = oneStep(carById('ranger'), 60, 1 / 60, FENCE);
  ok('...at 60 km/h', v60.z < 0, `z = ${r2(v60.z)}`);
  const v180 = oneStep(carById('ranger'), 180, 1 / 60, FENCE);
  ok('...at 180 km/h', v180.z < 0, `z = ${r2(v180.z)}`);
  // The one that was actually broken before the cap came off: 10.4 m in a step.
  const v300 = oneStep(carById('ranger'), 300, 1 / 8, FENCE);
  ok('...and at 300 km/h in a 125 ms step, which used to go clean through',
    v300.z < 0, `z = ${r2(v300.z)}`);
}
{
  const through = [];
  for (const c of CARS) {
    for (const fps of [60, 32, 20]) {
      const v = oneStep(c, Math.max(120, c.topSpeed * 3.6), 1 / fps, FENCE);
      if (v.z >= 0) through.push(`${c.id}@${fps}fps`);
    }
  }
  ok('and so is every other car in the game, the 12 m bus included',
    through.length === 0, through.join(', '));
}

group('a wall taken at a shallow angle still stops the car');
{
  // Sliding down a wall: the heading is nearly parallel to it and only a little
  // of the speed is into it. This is the case a swept test of the path alone
  // would report as "no crossing" for the axle probes while the flank is buried
  // in the bricks, so it is the bites that have to catch it.
  const through = [];
  for (const yaw of [15, 30, 45, 60, 75, 85]) {
    for (const kmh of [60, 180]) {
      const v = oneStep(carById('ranger'), kmh, 1 / 60, WALL, yaw);
      if (v.z >= 0) through.push(`${yaw}deg@${kmh}km/h z=${r2(v.z)}`);
    }
  }
  ok('every angle from 15 to 85 degrees ends on the near side',
    through.length === 0, through.join(', '));
}

group('the middle of a car is a collider too');
{
  // Spun 90 degrees and sliding sideways into a fence post, which is where the
  // two axle probes are not. Before the middle probes: the Ranger went through
  // a 0.8 m post and the bus through a four-metre wall, at 60 km/h at 60 fps.
  const slide = (id, half) => {
    const spec = carById(id);
    const v = new Vehicle(spec);
    v.reset(0, 0, Math.PI / 2);            // facing +x, drifting toward +z
    v.vz = 60 / 3.6;
    v.syncFrame();
    const w = walled(-half, 6, half, 6);
    for (let i = 0; i < 180; i++) {
      v.x += v.vx / 60; v.z += v.vz / 60;
      v.collide(w, 1 / 60);
      if (v.z > 8) return false;
    }
    return true;
  };
  const held = [];
  for (const id of ['ranger', 'civic', 'bus', 'cart', 'sienna']) {
    for (const half of [0.4, 0.8, 2, 60]) {
      if (!slide(id, half)) held.push(`${id} through a ${r2(half * 2)} m wall`);
    }
  }
  ok('a broadside slide is stopped by a wall of any length, in any vehicle',
    held.length === 0, held.join(', '));
}

// ---------------------------------------------------------- 2. the bus
group('a bus is 12 m of collider, not two circles 9 m apart');
{
  const body = (spec, x, z, yaw) => ({
    x, z, yaw, vx: 0, vz: 0, yawSpin: 0,
    len: spec.len, wid: spec.wid, mass: spec.mass,
  });
  const player = carById('ranger');
  for (const spec of [CITY_BUS, SCHOOL_BUS]) {
    const bus = body(spec, 0, 0, 0);
    // Dead centre of the bus, across it. Nothing about this is subtle: the car
    // is sitting in the middle of the vehicle.
    const mid = body(player, 0, 0, Math.PI / 2);
    ok(`${spec.id}: a car at the bus's midpoint is a contact`,
      findContact(mid, bus), `pen ${r2(contact.pen)}`);
    ok(`${spec.id}: ...and collideCars resolves it`,
      collideCars(body(player, 0, 0, Math.PI / 2), body(spec, 0, 0, 0)) >= 0
        && findContact(body(player, 0, 0, Math.PI / 2), body(spec, 0, 0, 0)));
    // ...and every metre of it, nose to tail, with no hole anywhere.
    const holes = [];
    for (let z = -spec.len / 2 + 0.5; z <= spec.len / 2 - 0.5; z += 0.25) {
      if (!findContact(body(player, 0, z, Math.PI / 2), bus)) holes.push(r2(z));
    }
    ok(`${spec.id}: no gap anywhere along its ${spec.len} m`,
      holes.length === 0, holes.length ? `no contact at z = ${holes.join(', ')}` : '');
    // The cheap reject in front of it must not be the thing that lets you
    // through either.
    ok(`${spec.id}: nearby() agrees at the midpoint`, nearby(mid, bus, 0.6));
  }
}

group('...and a car is still a car');
{
  const body = (spec, x, z, yaw) => ({
    x, z, yaw, vx: 0, vz: 0, yawSpin: 0,
    len: spec.len, wid: spec.wid, mass: spec.mass,
  });
  const civic = carById('civic');
  // Two cars nose to nose, just touching and just not.
  const A = body(civic, 0, 0, 0);
  ok('cars a whole length apart do not touch',
    !findContact(A, body(civic, 0, civic.len + 0.6, Math.PI)));
  ok('cars overlapping nose to nose do',
    findContact(A, body(civic, 0, civic.len - 0.8, Math.PI)));
  // Alongside: a lane's width apart is clear, half a car's width is a scrape.
  ok('a car in the next lane is clear',
    !findContact(A, body(civic, 3.4, 0, 0)));
  ok('a car half a width over is a contact',
    findContact(A, body(civic, civic.wid - 0.3, 0, 0)));
  // The whole length of another car, which is the hole this fix closed.
  const holes = [];
  for (let z = -civic.len / 2 + 0.4; z <= civic.len / 2 - 0.4; z += 0.2) {
    if (!findContact(body(civic, 0, z, Math.PI / 2), A)) holes.push(r2(z));
  }
  ok('and no gap along the middle of a Civic either',
    holes.length === 0, holes.join(', '));
}

// --------------------------------------------------- 3. the loop and the bites
group('the frame loop and the bite sizing agree');
{
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const cap = src.match(/if \(dt > ([\d.]+)\) dt = [\d.]+;/);
  const subs = src.match(/Math\.min\((\d+), Math\.max\(1, Math\.ceil\(dt \/ STEP\)\)\)/);
  ok('main.js still clamps dt and sub-steps it', !!cap && !!subs,
    cap && subs ? `dt <= ${cap[1]} over at most ${subs[1]} steps` : 'pattern moved');
  if (cap && subs) {
    const worst = Number(cap[1]) / Number(subs[1]);
    ok('the longest step cars.js can be handed is a 32 Hz one',
      worst <= 1 / 30, `${r2(worst * 1000)} ms`);
    // Every car, at its own top speed, over that step: the bite loop alone has
    // to cover it, without the swept guard having to save anything.
    const worstMove = Math.max(...CARS.map((c) => c.topSpeed)) * worst;
    const smallest = Math.min(...CARS.map((c) => c.wid * 0.52));
    ok('...and the fastest car covers it in bites narrower than a probe',
      worstMove / Math.ceil(worstMove / (smallest * 0.75)) < smallest,
      `${r2(worstMove)} m in bites of ${r2(worstMove / Math.ceil(worstMove / (smallest * 0.75)))} m, probe r ${r2(smallest)}`);
  }
}

group('the collider spacing is what it claims to be');
{
  const bad = [];
  for (const spec of [...CARS, CITY_BUS, SCHOOL_BUS]) {
    const r = spec.wid * 0.5;
    const end = Math.max(0.05, spec.len * 0.5 - r);
    const n = Math.max(2, Math.ceil((end * 2) / (r * SPACING)) + 1);
    const gap = (end * 2) / (n - 1);
    if (gap >= r * 2) bad.push(`${spec.id} ${r2(gap)} m apart, radius ${r2(r)}`);
  }
  ok('every body\'s circles overlap their neighbours', bad.length === 0, bad.join(' · '));
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
