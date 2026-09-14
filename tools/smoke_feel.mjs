#!/usr/bin/env node
// Headless checks on the `feel` block: the per-vehicle drivetrain, torque
// curve, rack and tyre terms that make one car drive differently from another
// rather than just faster.
//
//   node tools/smoke_feel.mjs
//
// Section 1 is the whole contract. « I like how the Ranger handles now » is not
// a preference you can hold in your head across a refactor, so it is pinned
// here: the Ranger declares no `feel` block, every new term therefore resolves
// to an exact multiplicative 1 or additive 0, and its 5 s full-throttle run has
// to come back bit-identical to the table smoke_terrain.mjs already guards. If
// that section ever goes red the feel work has leaked into the reference car,
// and the answer is to put it back behind its `if (feel)` — not to rebaseline
// anything.
//
// Nothing here touches WebGL or the DOM. famouscars.js (where the Firebird
// lives) wants a localStorage, because garage.js reads one at import, so it
// gets the same fake smoke_upgrades.mjs uses; cars.js is otherwise import-clean.
class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
}
globalThis.localStorage = new FakeStorage();

const { CARS, carById, Vehicle, pl } = await import('../src/game/cars.js');
await import('../src/game/famouscars.js');   // registers the Firebird into CARS
await import('../src/game/buses.js');        // ...and the school bus, and the bikes' kit
// The police Crown Victoria is not in CARS and never will be — you do not get to
// drive it — so it comes in by name. Its `feel` block lives in cops.js next to
// its gearbox, because the key `cruiser` in the FEEL table is already spoken
// for by the Schwinn in bikes.js.
const { CRUISER } = await import('../src/game/cops.js');

let pass = 0, fail = 0;
const out = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; out.push(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  // Assembled rather than written out, so a green run never contains the word.
  else { fail++; out.push(`  ${'FA' + 'IL'} ${name}${detail ? '   ' + detail : ''}`); }
}
const group = (n) => out.push('\n' + n);
const f2 = (v) => v.toFixed(2);
const f3 = (v) => v.toFixed(3);

// The flat stub worlds, exactly as smoke_driving.mjs builds them: tarmac
// everywhere and nothing to hit, and the same with grass. No `groundAt`, so the
// height field stays out of every number in this file.
const bounds = { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 };
const road = { roadAt: () => true, waterAt: () => false, querySegments: () => [], bounds };
const grass = { ...road, roadAt: () => false };
const CTL = { steer: 0, throttle: 0, brake: 0, handbrake: false };
const ctl = (o) => ({ ...CTL, ...o });
const DT = 1 / 60;

// The smoke_terrain.mjs REF harness, one car, one world, 300 frames.
function ref(spec, world, steer) {
  const v = new Vehicle(spec);
  v.reset(0, 0, 0);
  v.onRoad = world.roadAt();
  const c = ctl({ throttle: 1, steer });
  for (let i = 0; i < 300; i++) v.update(DT, c, world);
  return [v.x, v.z, v.yaw, v.vLong, v.vLat, v.surface, v.y, v.pitch, v.roll];
}
const drift = (a, b) => { let w = 0; for (let i = 0; i < a.length; i++) w = Math.max(w, Math.abs(a[i] - b[i])); return w; };

// ------------------------------------------------- 1. the Ranger, to the bit

group('1. the Ranger is the reference and has not moved');

{
  // Straight off tools/smoke_terrain.mjs's REF table (the `ranger` rows). Same
  // harness, same worlds, same 300 frames, same nine state variables.
  const REF = {
    road: [0, 39.086020339, 0, 15.10366738, 0, 1, 0, -0.034946719, 0],
    grass: [-8.906805509, 16.796348942, -1.011796229, 7.236878419, 0.372345805, 0.81, 0, -0.017148101, -0.048907851],
  };
  let worst = 0, worstKey = '';
  for (const [name, world] of [['road', road], ['grass', grass]]) {
    const got = ref(carById('ranger'), world, name === 'grass' ? 0.35 : 0);
    for (let i = 0; i < got.length; i++) {
      const d = Math.abs(got[i] - REF[name][i]);
      if (d > worst) { worst = d; worstKey = `${name}[${i}]`; }
    }
  }
  ok('the Ranger’s 5 s run on road and grass is bit-identical to the reference table',
    worst < 1e-9, `worst drift ${worst.toExponential(2)} (${worstKey || 'none'})`);
  ok('...because it declares no feel block at all', carById('ranger').feel === undefined);
}

// --------------------------------------- 2. every term resolves to 1, or to 0

group('2. an absent term is an exact 1 or an exact 0');

{
  // The strongest form of the claim there is. Take the Ranger — which has no
  // block — and give it one in which EVERY term is written out at the default
  // the comment over FEEL says it takes when absent. If the defaults really are
  // the old literals and really do enter the arithmetic in the same order, the
  // two cars are not merely close: they are the same nine numbers.
  const neutral = Object.create(carById('ranger'));
  neutral.feel = {
    layout: 'rwd',          // a tag; it must change no number at all
    powerYaw: 0, liftTuck: 0, torqueSteer: 0, wallow: 0, shiftCut: 0,
    steerRate: 12, rackSpeed: 14, bite: 9.5, counterSteer: 0.045, abs: true,
    // `torque` and `wheelspin` absent: there is no "neutral curve" to write,
    // the absence IS the flat 1.
  };
  let worst = 0;
  for (const [name, world] of [['road', road], ['grass', grass]]) {
    const steer = name === 'grass' ? 0.35 : 0;
    worst = Math.max(worst, drift(ref(neutral, world, steer), ref(carById('ranger'), world, steer)));
  }
  ok('a block written entirely at the documented defaults changes nothing, to the bit',
    worst === 0, `worst drift ${worst.toExponential(2)}`);

  // And the three cars that DO declare one still solve their thrust curve
  // against their own drag, so the torque multiplier is 1 where it has to be.
  const tops = [];
  let bad = 0;
  for (const id of ['civic', 'firebird', 'sienna']) {
    const v = new Vehicle(carById(id));
    v.reset(0, 0, 0);
    for (let i = 0; i < 300 * 60; i++) v.update(DT, ctl({ throttle: 1 }), road);
    const want = carById(id).topSpeed * 3.6;
    tops.push(`${id} ${v.speedKmh.toFixed(1)}/${want.toFixed(0)}`);
    if (Math.abs(v.speedKmh - want) >= want * 0.01) bad++;
  }
  ok('...and a torque curve that is 1 at the top leaves every terminal speed alone',
    bad === 0, tops.join(' · '));
}

// ------------------------------------------------- 3. which end drives it

group('3. front-wheel drive and rear-wheel drive answer the throttle differently');

{
  // One frame, from an identical settled state. It has to be one frame: over a
  // second the extra SPEED full throttle buys changes the rack, the lock and
  // the geometric yaw by more than the drivetrain term does, and the question
  // here is what the right foot does to the nose, not what it does to the
  // speedometer.
  const probe = (id, thr) => {
    const v = new Vehicle(carById(id));
    v.reset(0, 0, 0);
    v.vz = 20; v.syncFrame();
    for (let i = 0; i < 60; i++) v.update(DT, ctl({ steer: 0.5 }), road);
    v.update(DT, ctl({ steer: 0.5, throttle: thr }), road);
    return v.yawRate;
  };
  const dz = (id) => probe(id, 1) - probe(id, 0);
  const civic = dz('civic'), firebird = dz('firebird'), sienna = dz('sienna'), ranger = dz('ranger');
  ok('opening the throttle mid-corner moves the Civic and the Firebird opposite ways',
    civic * firebird < 0,
    `civic ${civic.toExponential(2)} (fwd, washes wide) · firebird ${firebird.toExponential(2)} (rwd, tail out)`);
  ok('...and the other front-driver agrees with the Civic',
    sienna * civic > 0, `sienna ${sienna.toExponential(2)}`);
  ok('...while the Ranger, which has no drivetrain term, only answers with speed',
    Math.abs(ranger) < Math.abs(civic) / 10 && Math.abs(ranger) < Math.abs(firebird) / 10,
    `ranger ${ranger.toExponential(2)}`);
}

// ------------------------------------------------- 4. lift-off tuck

group('4. shutting the throttle turns a front-driver in');

{
  const tuck = (id) => {
    const v = new Vehicle(carById(id));
    v.reset(0, 0, 0);
    v.vz = 22; v.syncFrame();
    for (let i = 0; i < 90; i++) v.update(DT, ctl({ steer: 0.6, throttle: 1 }), road);
    const held = v.yawRate;
    let peak = held;
    for (let i = 0; i < 12; i++) {
      v.update(DT, ctl({ steer: 0.6 }), road);
      if (Math.abs(v.yawRate) > Math.abs(peak)) peak = v.yawRate;
    }
    return Math.abs(peak) / Math.abs(held) - 1;
  };
  const civic = tuck('civic'), ranger = tuck('ranger'), sienna = tuck('sienna'), firebird = tuck('firebird');
  ok('the Civic gets a yaw pulse the moment you lift, mid-corner',
    civic > 0.25, `+${(civic * 100).toFixed(1)} % yaw rate in the first 0.2 s`);
  ok('...the Sienna leans into a much smaller one',
    sienna > 0.05 && sienna < civic / 2, `+${(sienna * 100).toFixed(1)} %`);
  ok('...and the Ranger and the Firebird do not tuck at all',
    ranger === 0 && firebird === 0,
    `ranger ${(ranger * 100).toFixed(1)} % · firebird ${(firebird * 100).toFixed(1)} %`);
}

// ------------------------------------------------- 5. wheelspin

group('5. you cannot just stand on it');

// The measurement here used to be 0-20 m/s and it was wrong, in a way that only
// showed up once somebody drove the car. To make full throttle lose over 72
// km/h the tyres have to still be spinning at 72 km/h, which meant WSPIN_V at
// 24 m/s — and a Trans Am that is lit up to highway speed takes 11.90 s to 100
// km/h against 6.7 s for the same car with no `feel` block at all. That is not
// a car that is hard to launch, it is a broken one.
//
// So the constant is 14 m/s now (a street tyre on dry asphalt has hooked up by
// 50 km/h) and the question this section asks is the one the model can honestly
// answer: over the LAUNCH — 0 to 8 m/s, the first thirty km/h — is the floor
// still the wrong place for your right foot? It is: 2.62 s flat out against
// 2.40 s at three quarters. Past that the tyres are hooked up and full throttle
// is simply right, which is also true of the real car.
{
  const zeroTo = (id, thr, v = 8) => {
    const veh = new Vehicle(carById(id));
    veh.reset(0, 0, 0);
    const c = ctl({ throttle: thr });
    for (let i = 0; i < 60 * 120; i++) { veh.update(DT, c, road); if (veh.vLong >= v) return (i + 1) / 60; }
    return Infinity;
  };
  const full = zeroTo('firebird', 1), part = zeroTo('firebird', 0.75);
  ok('the Firebird launches SLOWER with the pedal on the floor than at three quarters',
    full > part, `${f2(full)} s flat out · ${f2(part)} s at 75 %`);
  // ...and there is a right answer in between, which is the whole lesson.
  let best = 1, bestT = full;
  for (const thr of [0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9]) {
    const t = zeroTo('firebird', thr);
    if (t < bestT) { bestT = t; best = thr; }
  }
  ok('...and the quickest way out of a light is somewhere short of the floor',
    best < 1, `best ${f2(bestT)} s at ${(best * 100).toFixed(0)} % throttle`);
  // ...and the car is still a Trans Am at the end of it. This is the number the
  // old WSPIN_V ruined: 11.90 s, slower than a Dodge Caravan.
  const hundred = (() => {
    const veh = new Vehicle(carById('firebird'));
    veh.reset(0, 0, 0);
    const c = ctl({ throttle: 1 });
    for (let i = 0; i < 60 * 120; i++) { veh.update(DT, c, road); if (veh.speedKmh >= 100) return (i + 1) / 60; }
    return Infinity;
  })();
  ok('...and a 5.7 TPI still does 0-100 km/h in the sevens or eights, not the elevens',
    hundred > 7 && hundred < 8.6, `${f2(hundred)} s`);
  // The Civic only chirps; it is 940 kg and it hooks up almost at once.
  const cf = zeroTo('civic', 1), cp = zeroTo('civic', 0.6);
  ok('the Civic scrabbles rather than smokes: flat out is still much the quickest',
    cf < cp, `${f2(cf)} s flat out · ${f2(cp)} s at 60 %`);
}

// ------------------------------------------------- 6. the rack

group('6. how quick the wheel is');

{
  // From rest: at a standstill the lock is a constant, so the only thing
  // between the input and the wheel is `steerRate`.
  const lockT = (id) => {
    const spec = carById(id);
    const v = new Vehicle(spec);
    v.reset(0, 0, 0);
    for (let i = 0; i < 600; i++) {
      v.update(DT, ctl({ steer: 1 }), road);
      if (Math.abs(v.steer) >= 0.95 * spec.steerMax) return (i + 1) / 60;
    }
    return Infinity;
  };
  const civic = lockT('civic'), sienna = lockT('sienna'), ranger = lockT('ranger');
  ok('the Civic is at full lock long before the Sienna is',
    civic < sienna * 0.6, `civic ${f3(civic)} s · sienna ${f3(sienna)} s`);
  ok('...and the Ranger, with no term, still takes exactly what the old global gave it',
    Math.abs(ranger - 14 / 60) < 1e-12, `ranger ${f3(ranger)} s`);
}

// ------------------------------------------------- 7. no ABS

group('7. no ABS: stand on the brakes and the steering goes light');

{
  // The arcade direction-change brake ignores how hard you press (see DIR_* in
  // cars.js), so the two runs below decelerate IDENTICALLY and the only thing
  // the pedal can change is the steering. That makes this a clean single-
  // variable measurement rather than a race between two effects.
  const turned = (spec, brake) => {
    const v = new Vehicle(spec);
    v.reset(0, 0, 0);
    v.vz = 20; v.syncFrame();
    for (let i = 0; i < 30; i++) v.update(DT, ctl({}), road);
    const y0 = v.yaw;
    for (let i = 0; i < 90; i++) v.update(DT, ctl({ steer: 0.6, brake }), road);
    return Math.abs(v.yaw - y0);
  };
  const civic = carById('civic');
  const withAbs = Object.create(civic);
  withAbs.feel = { ...civic.feel, abs: true };
  const hard = turned(civic, 1), soft = turned(civic, 0.6);
  const hardA = turned(withAbs, 1), softA = turned(withAbs, 0.6);
  ok('the Civic turns less with the pedal on the floor than at 60 %',
    hard < soft, `${f3(hard)} rad flat · ${f3(soft)} rad at 60 % (${((1 - hard / soft) * 100).toFixed(0)} % less)`);
  ok('...and it is the ABS term doing it: give the same car ABS and the pedal stops mattering',
    Math.abs(hardA - softA) < 1e-12, `${f3(hardA)} rad either way`);
  ok('...and the Ranger, which says nothing about ABS, is in the second camp',
    Math.abs(turned(carById('ranger'), 1) - turned(carById('ranger'), 0.6)) < 1e-12);
}

// ------------------------------------------------- 8. the gearbox in the physics

group('8. the beat between gears');

{
  // `shiftCut` is thrust × 0 for a moment after each up-shift, so a car holding
  // full throttle on a flat road still goes momentarily backwards on the
  // accelerometer. Nothing without the term ever can.
  const cuts = (id) => {
    const v = new Vehicle(carById(id));
    v.reset(0, 0, 0);
    let last = 0, n = 0;
    for (let i = 0; i < 40 * 60; i++) {
      v.update(DT, ctl({ throttle: 1 }), road);
      if (v.vLong < last - 1e-9 && v.vLong < carById(id).topSpeed * 0.9) n++;
      last = v.vLong;
    }
    return n;
  };
  const civic = cuts('civic'), firebird = cuts('firebird'), ranger = cuts('ranger');
  ok('the Firebird drops thrust between gears and you can count the frames',
    firebird > 0, `${firebird} frames of nothing in a 40 s pull`);
  ok('...the Civic’s box is quicker about it', civic > 0 && civic < firebird,
    `${civic} frames`);
  ok('...and the Ranger, with no shiftCut, never stops pulling',
    ranger === 0, `${ranger} frames`);
}

// ------------------------------------------------- 9. the whole roster
//
// Sections 1-8 prove that the terms do what the table says they do, one term at
// a time, on the two or three cars that show it most clearly. This one drives
// EVERY vehicle in town through the same four probes and prints the answers, so
// the roster can be read down a column: which end drives it, how long it takes
// to a hundred, how quickly the wheel moves, how much the nose tucks when you
// lift, and which way the throttle swings it. A car that is meant to be a boat
// and comes out sharper than the Civic shows up here and nowhere else.

group('9. every vehicle in town, measured');

{
  // Who is exempt, and why. The Ranger is the reference car and section 1 is
  // about keeping it that way. The golf cart has one reduction gear, turf tyres
  // and no rack worth the name. The bicycles have no engine at all — `twoWheel`
  // rather than a list of ids, so the day somebody adds a third bike it is
  // exempt for the right reason and not because nobody updated this line.
  const exempt = (s) => s.id === 'ranger' || s.id === 'cart' || s.twoWheel === true;
  const ROSTER = [...CARS.filter((s) => !exempt(s)), CRUISER];

  const zeroTo100 = (s) => {
    const v = new Vehicle(s);
    v.reset(0, 0, 0);
    const c = ctl({ throttle: 1 });
    for (let i = 0; i < 60 * 120; i++) { v.update(DT, c, road); if (v.speedKmh >= 100) return (i + 1) / 60; }
    return null;                      // a bus does not get there, and should not
  };
  const lock95 = (s) => {
    const v = new Vehicle(s);
    v.reset(0, 0, 0);
    for (let i = 0; i < 1200; i++) {
      v.update(DT, ctl({ steer: 1 }), road);
      if (Math.abs(v.steer) >= 0.95 * s.steerMax) return (i + 1) / 60;
    }
    return Infinity;
  };
  const tuckPct = (s) => {
    const v = new Vehicle(s);
    v.reset(0, 0, 0);
    v.vz = 20; v.syncFrame();
    for (let i = 0; i < 90; i++) v.update(DT, ctl({ steer: 0.6, throttle: 1 }), road);
    const held = v.yawRate;
    let peak = held;
    for (let i = 0; i < 12; i++) {
      v.update(DT, ctl({ steer: 0.6 }), road);
      if (Math.abs(v.yawRate) > Math.abs(peak)) peak = v.yawRate;
    }
    return (Math.abs(peak) / Math.abs(held) - 1) * 100;
  };
  // What the throttle does to the nose, as a CHANGE IN YAW RATE rather than a
  // signed yaw: at this steering angle the yaw rate itself is negative (the car
  // is turning right), so comparing the raw numbers would put the sign on the
  // corner and not on the drivetrain. More yaw on the throttle is positive here,
  // which is a rear axle pushing the tail round; less is negative, which is a
  // front axle asked to steer and pull at once and doing neither.
  const powerOn = (s) => {
    const probe = (thr) => {
      const v = new Vehicle(s);
      v.reset(0, 0, 0);
      v.vz = 20; v.syncFrame();
      for (let i = 0; i < 60; i++) v.update(DT, ctl({ steer: 0.5 }), road);
      v.update(DT, ctl({ steer: 0.5, throttle: thr }), road);
      return v.yawRate;
    };
    return Math.abs(probe(1)) - Math.abs(probe(0));
  };

  const rows = ROSTER.map((s) => ({
    s, f: s.feel, t100: zeroTo100(s), lock: lock95(s), tuck: tuckPct(s), yaw: powerOn(s),
  }));

  const pad = (v, n) => String(v).padStart(n);
  out.push('');
  out.push('       id          layout    0-100 km/h   95 % lock   lift-off tuck   power-on yaw');
  for (const r of rows) {
    out.push('       ' + r.s.id.padEnd(12) + (r.f && r.f.layout ? r.f.layout : '—').padEnd(9)
      + pad(r.t100 == null ? '—' : f2(r.t100) + ' s', 11)
      + pad(f3(r.lock) + ' s', 12) + pad((r.tuck > 0.05 ? '+' : '') + r.tuck.toFixed(1) + ' %', 16)
      + pad((r.yaw > 0 ? '+' : '') + r.yaw.toExponential(2), 15));
  }
  out.push('');

  ok('every vehicle that is not the Ranger, the cart or a bicycle declares a feel block',
    rows.every((r) => r.f), rows.filter((r) => !r.f).map((r) => r.s.id).join() || 'none missing');
  ok('...and every one of them says which wheels it drives',
    rows.every((r) => ['fwd', 'rwd', 'awd'].includes(r.f && r.f.layout)),
    rows.filter((r) => !(r.f && r.f.layout)).map((r) => r.s.id).join() || 'all three words in use');

  // The sign test, on the cars that claim a throttle/yaw coupling at all. The
  // two buses deliberately claim none — twelve tonnes does not rotate because
  // you pressed something — so they are not in this set, and the next line is
  // the one that keeps that a decision rather than an omission.
  {
    const claim = rows.filter((r) => r.f.powerYaw);
    const wrong = claim.filter((r) => (r.f.layout === 'fwd' ? r.yaw >= 0 : r.yaw <= 0));
    ok('front-drivers wash wide on the throttle and rear- and four-wheel-drive come round',
      wrong.length === 0,
      wrong.length ? wrong.map((r) => `${r.s.id} ${r.f.layout} ${r.yaw.toExponential(2)}`).join(' · ')
        : claim.map((r) => `${r.s.id} ${r.yaw > 0 ? '+' : '−'}`).join(' '));
    ok('...and the only things with no throttle/yaw term at all are the two buses',
      rows.filter((r) => !r.f.powerYaw).map((r) => r.s.id).sort().join() === 'bus,schoolbus',
      rows.filter((r) => !r.f.powerYaw).map((r) => r.s.id).join());
  }

  // The rack. Two turns of nothing in a bus, one and a half in the Sienna, and
  // the Civic is at full lock before either of them has started.
  {
    const by = (id) => rows.find((r) => r.s.id === id).lock;
    const others = rows.filter((r) => !/bus$/.test(r.s.id) && r.s.id !== 'sienna');
    ok('nothing in town gets to full lock as slowly as the two buses',
      by('bus') > by('schoolbus') && by('schoolbus') > Math.max(...others.map((r) => r.lock)),
      `bus ${f3(by('bus'))} s · schoolbus ${f3(by('schoolbus'))} s`);
    ok('...and no car turns its wheel slower than the Sienna',
      others.every((r) => r.lock <= by('sienna')),
      `sienna ${f3(by('sienna'))} s; next slowest ${others.filter((r) => r.lock === by('sienna')).map((r) => r.s.id).join() || '—'} ties it`);
  }

  // The turbo. This is the one torque curve in the table whose whole character
  // is the hole in it: below a third of the redline the Leone is not an engine,
  // and by seven tenths it is all in. `pl` is cars.js's own reader, so this is
  // the curve the physics sees and not a second copy of it.
  {
    const t = carById('leone').feel.torque;
    const at = (x) => Math.min(1, pl(t, x));
    ok('the Leone has less than seven tenths of an engine at a third of the redline',
      at(0.3) < 0.7, `×${f2(at(0.3))} at 0.30 · ×${f2(at(0.42))} at 0.42`);
    ok('...and all of it by seven tenths', at(0.7) === 1,
      `×${f2(at(0.58))} at 0.58 · ×${f2(at(0.7))} at 0.70`);
  }
}

// ------------------------------------------------- the report

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
