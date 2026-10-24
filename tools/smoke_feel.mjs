#!/usr/bin/env node
// Headless checks on the `feel` block: the per-vehicle drivetrain, torque
// curve, rack and tyre terms that make one car drive differently from another
// rather than just faster.
//
//   node tools/smoke_feel.mjs
//
// Section 1 is the whole contract. « I like how the Ranger handles now » is not
// a preference you can hold in your head across a refactor, so it is pinned
// here: the bare Ranger sheet declares no `feel` block, every new term
// therefore resolves to an exact multiplicative 1 or additive 0, and its 5 s
// full-throttle run has to come back bit-identical to the table
// smoke_terrain.mjs already guards. If that section ever goes red the feel work
// has leaked into the no-feel path, and the answer is to put it back behind its
// `if (feel)` — not to rebaseline anything.
//
// S3-RANGER (20 Oct 2026): the truck as it ships now has a row of its own (red
// team feel.md, finding 8), so « the reference » is the bare sheet, BARE below:
// the Ranger with `feel` taken off. Every check that used the Ranger as the
// car-with-no-terms uses BARE, to the same bit; section 10 is the shipped row.
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
const { timingCheck } = await import('./timing-gate.mjs');   // the 0.05 ms per-frame cost is a quiet-window check

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
// The pre-FEEL reference: the Ranger's own sheet with no feel block.
const BARE = Object.assign(Object.create(carById('ranger')), { feel: undefined });
const sheet = (id) => (id === 'bare' ? BARE : carById(id));

// ------------------------------------------------- 1. the Ranger, to the bit

group('1. the bare Ranger sheet is the reference and has not moved');

{
  // Straight off tools/smoke_terrain.mjs's REF table (the `ranger` rows). Same
  // harness, same worlds, same 300 frames, same nine state variables.
  const REF = {
    road: [0, 39.086020339, 0, 15.10366738, 0, 1, 0, -0.034946719, 0],
    grass: [-8.906805509, 16.796348942, -1.011796229, 7.236878419, 0.372345805, 0.81, 0, -0.017148101, -0.048907851],
  };
  let worst = 0, worstKey = '';
  for (const [name, world] of [['road', road], ['grass', grass]]) {
    const got = ref(BARE, world, name === 'grass' ? 0.35 : 0);
    for (let i = 0; i < got.length; i++) {
      const d = Math.abs(got[i] - REF[name][i]);
      if (d > worst) { worst = d; worstKey = `${name}[${i}]`; }
    }
  }
  ok('the bare Ranger’s 5 s run on road and grass is bit-identical to the reference table',
    worst < 1e-9, `worst drift ${worst.toExponential(2)} (${worstKey || 'none'})`);
  ok('...because it declares no feel block at all', BARE.feel === undefined && !new Vehicle(BARE).box);
}

// --------------------------------------- 2. every term resolves to 1, or to 0

group('2. an absent term is an exact 1 or an exact 0');

{
  // The strongest form of the claim there is. Take the Ranger — which has no
  // block — and give it one in which EVERY term is written out at the default
  // the comment over FEEL says it takes when absent. If the defaults really are
  // the old literals and really do enter the arithmetic in the same order, the
  // two cars are not merely close: they are the same nine numbers.
  const neutral = Object.create(BARE);
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
    worst = Math.max(worst, drift(ref(neutral, world, steer), ref(BARE, world, steer)));
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
    const v = new Vehicle(sheet(id));
    v.reset(0, 0, 0);
    v.vz = 20; v.syncFrame();
    for (let i = 0; i < 60; i++) v.update(DT, ctl({ steer: 0.5 }), road);
    v.update(DT, ctl({ steer: 0.5, throttle: thr }), road);
    return v.yawRate;
  };
  const dz = (id) => probe(id, 1) - probe(id, 0);
  const civic = dz('civic'), firebird = dz('firebird'), sienna = dz('sienna'), ranger = dz('bare');
  ok('opening the throttle mid-corner moves the Civic and the Firebird opposite ways',
    civic * firebird < 0,
    `civic ${civic.toExponential(2)} (fwd, washes wide) · firebird ${firebird.toExponential(2)} (rwd, tail out)`);
  ok('...and the other front-driver agrees with the Civic',
    sienna * civic > 0, `sienna ${sienna.toExponential(2)}`);
  ok('...while the bare Ranger, which has no drivetrain term, only answers with speed',
    Math.abs(ranger) < Math.abs(civic) / 10 && Math.abs(ranger) < Math.abs(firebird) / 10,
    `ranger ${ranger.toExponential(2)}`);
}

// ------------------------------------------------- 4. lift-off tuck

group('4. shutting the throttle turns a front-driver in');

{
  const tuck = (id) => {
    const v = new Vehicle(sheet(id));
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
  const civic = tuck('civic'), ranger = tuck('bare'), sienna = tuck('sienna'), firebird = tuck('firebird');
  ok('the Civic gets a yaw pulse the moment you lift, mid-corner',
    civic > 0.25, `+${(civic * 100).toFixed(1)} % yaw rate in the first 0.2 s`);
  ok('...the Sienna leans into a much smaller one',
    sienna > 0.05 && sienna < civic / 2, `+${(sienna * 100).toFixed(1)} %`);
  ok('...and the bare Ranger and the Firebird do not tuck at all',
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
    const spec = sheet(id);
    const v = new Vehicle(spec);
    v.reset(0, 0, 0);
    for (let i = 0; i < 600; i++) {
      v.update(DT, ctl({ steer: 1 }), road);
      if (Math.abs(v.steer) >= 0.95 * spec.steerMax) return (i + 1) / 60;
    }
    return Infinity;
  };
  const civic = lockT('civic'), sienna = lockT('sienna'), ranger = lockT('bare');
  ok('the Civic is at full lock long before the Sienna is',
    civic < sienna * 0.6, `civic ${f3(civic)} s · sienna ${f3(sienna)} s`);
  ok('...and the bare Ranger, with no term, still takes exactly what the old global gave it',
    Math.abs(ranger - 14 / 60) < 1e-12, `ranger ${f3(ranger)} s`);
}

// ------------------------------------------------- 7. no ABS

group('7. no ABS: stand on the brakes and the steering goes light');

{
  // The S-key stop is graded by the pedal (review A2, 29 Sep 2026), so a
  // softer pedal also means a faster car and a different yaw. The clean single-
  // variable measurement is therefore the SAME pedal on two cars that differ
  // only in the ABS term: they decelerate identically, and the only thing that
  // can differ is the steering.
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
  const hard = turned(civic, 1), hardA = turned(withAbs, 1);
  ok('the Civic turns less on a floored pedal than the same Civic with ABS',
    hard < hardA, `${f3(hard)} rad without · ${f3(hardA)} rad with (${((1 - hard / hardA) * 100).toFixed(0)} % less)`);
  const lightP = 0.25;   // under NOABS_FROM: nothing locks
  ok('...and it is the ABS term doing it: under the lock-up threshold the two are the same car',
    Math.abs(turned(civic, lightP) - turned(withAbs, lightP)) < 1e-12);
  // The Ranger says nothing about ABS: it steers exactly like a neutral block
  // with abs: true (group 2), and more than one that says abs: false.
  const ranger = BARE;
  const rangerAbs = Object.create(ranger), rangerLock = Object.create(ranger);
  rangerAbs.feel = { layout: 'rwd', powerYaw: 0, liftTuck: 0, torqueSteer: 0, wallow: 0, shiftCut: 0,
    steerRate: 12, rackSpeed: 14, bite: 9.5, counterSteer: 0.045, abs: true };
  rangerLock.feel = { ...rangerAbs.feel, abs: false };
  ok('...and the bare Ranger, which says nothing about ABS, is in the second camp',
    Math.abs(turned(ranger, 1) - turned(rangerAbs, 1)) < 1e-12 && turned(rangerLock, 1) < turned(ranger, 1));
}

// ------------------------------------------------- 8. the gearbox in the physics

group('8. the beat between gears');

{
  // `shiftCut` is thrust × 0 for a moment after each up-shift, so a car holding
  // full throttle on a flat road still goes momentarily backwards on the
  // accelerometer. Nothing without the term ever can.
  const cuts = (id) => {
    const v = new Vehicle(sheet(id));
    v.reset(0, 0, 0);
    let last = 0, n = 0;
    for (let i = 0; i < 40 * 60; i++) {
      v.update(DT, ctl({ throttle: 1 }), road);
      if (v.vLong < last - 1e-9 && v.vLong < sheet(id).topSpeed * 0.9) n++;
      last = v.vLong;
    }
    return n;
  };
  const civic = cuts('civic'), firebird = cuts('firebird'), ranger = cuts('bare');
  ok('the Firebird drops thrust between gears and you can count the frames',
    firebird > 0, `${firebird} frames of nothing in a 40 s pull`);
  ok('...the Civic’s box is quicker about it', civic > 0 && civic < firebird,
    `${civic} frames`);
  ok('...and the bare Ranger, with no shiftCut, never stops pulling',
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
  // Who is exempt, and why. The Ranger used to be, as the reference car; since
  // S3-RANGER it drives with a row of its own and is measured with the rest
  // (its bare sheet is what section 1 keeps). The golf cart has one reduction gear, turf tyres
  // and no rack worth the name. The bicycles have no engine at all — `twoWheel`
  // rather than a list of ids, so the day somebody adds a third bike it is
  // exempt for the right reason and not because nobody updated this line.
  const exempt = (s) => s.id === 'cart' || s.twoWheel === true;
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

  ok('every vehicle that is not the cart or a bicycle declares a feel block',
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

// ------------------------------------------------- 10. the Ranger as it ships

group('10. S3-RANGER: the truck has a row, and it is a keyboard truck');

{
  const R = carById('ranger');
  ok('the Ranger declares a rear-drive feel block', !!R.feel && R.feel.layout === 'rwd');
  const v0 = new Vehicle(R);
  ok('...and its physics gearbox is the five-speed the engine note shifts through',
    !!v0.box && v0.box.d.gears === R.drive.gears && v0.box.d.final === R.drive.final && R.drive.gears.length === 5, R.drive.gears.join('/'));
  // A full-throttle pull: the time to 100 and the terminal speed, against the bare sheet.
  const pull = (spec) => {
    const v = new Vehicle(spec); v.reset(0, 0, 0);
    let t100 = null;
    for (let i = 0; i < 90 * 60; i++) {
      v.update(DT, ctl({ throttle: 1 }), road);
      if (t100 == null && v.speedKmh >= 100) t100 = (i + 1) / 60;
    }
    return { t100, top: v.speedKmh };
  };
  const ship = pull(R), bare = pull(BARE);
  ok('never sluggish: 0-100 km/h within 0.4 s of the bare sheet',
    ship.t100 - bare.t100 < 0.4, `${f2(ship.t100)} s against ${f2(bare.t100)} s`);
  ok('...and the torque curve leaves the terminal speed where the sheet says',
    Math.abs(ship.top - R.topSpeed * 3.6) < R.topSpeed * 3.6 * 0.01, `${ship.top.toFixed(1)} km/h`);
  // The keyboard tap: half a second of D at 80 km/h through core/input.js's
  // ramp (4.2/s on, 7.5/s off), then let go.
  const tap = (spec) => {
    const v = new Vehicle(spec); v.reset(0, 0, 0); v.vz = 80 / 3.6; v.syncFrame();
    let s = 0, settle = null; const y0 = v.yaw;
    for (let i = 0; i < 180; i++) {
      const held = i < 30;
      s = held ? Math.min(1, s + 4.2 * DT) : Math.max(0, s - 7.5 * DT);
      v.update(DT, ctl({ steer: s, throttle: 0.6 }), road);
      if (!held && settle == null && Math.abs(v.yawRate) < 0.02) settle = (i + 1) / 60 - 0.5;
    }
    return { deg: Math.abs(v.yaw - y0) * 180 / Math.PI, settle };
  };
  const tS = tap(R), tB = tap(BARE);
  ok('a half-second tap at 80 km/h turns the truck less than the bare sheet (no twitch)',
    tS.deg < tB.deg * 0.92, `${tS.deg.toFixed(1)} deg against ${tB.deg.toFixed(1)} deg`);
  ok('...and it is straight again sooner after you let go (steerReturn)',
    tS.settle != null && tB.settle != null && tS.settle < tB.settle * 0.7,
    `${f2(tS.settle)} s against ${f2(tB.settle)} s`);
  // The wheel unwinds faster than it winds: measured on the wheel itself.
  {
    const v = new Vehicle(R); v.reset(0, 0, 0);
    let on = null, off = null;
    for (let i = 0; i < 120 && on == null; i++) { v.update(DT, ctl({ steer: 1 }), road); if (v.steer >= 0.9 * R.steerMax) on = (i + 1) / 60; }
    for (let i = 0; i < 120 && off == null; i++) { v.update(DT, ctl({}), road); if (v.steer <= 0.1 * R.steerMax) off = (i + 1) / 60; }
    ok('...because the wheel comes back faster than it goes in', on != null && off != null && off < on * 0.7,
      `in ${f3(on)} s · back ${f3(off)} s`);
  }
  // A lean you can see, and a shift you can count.
  {
    const v = new Vehicle(R); v.reset(0, 0, 0); v.vz = 60 / 3.6; v.syncFrame();
    let roll = 0;
    for (let i = 0; i < 120; i++) { v.update(DT, ctl({ steer: 0.6, throttle: 0.5 }), road); roll = Math.max(roll, Math.abs(v.roll)); }
    ok('the truck leans in a 60 km/h corner (at least 5 degrees of body roll)',
      roll >= 5 * Math.PI / 180, `${(roll * 180 / Math.PI).toFixed(1)} deg`);
  }
}

// ------------------------------------------------- 11. what the tyres say

group('11. S3-RANGER: the lever slide smokes and squeals, an ordinary bend does not');

{
  const { doughnutAssist } = await import('../src/game/stunts.js');
  const R = carById('ranger');
  // The Sayyad doughnut, driven the way smoke_doughnut drives it.
  const v = new Vehicle(R); v.reset(0, 0, 0);
  let slip = 0, skid = 0, sq = 0, n = 0;
  for (let i = 0; i < 360; i++) {
    const c = ctl({ steer: 1, throttle: 1, handbrake: true });
    v.update(DT, c, road); doughnutAssist(v, c, DT);
    if (i >= 180) { slip += Math.abs(v.vLat); skid += v.skid; sq += v.squeal; n++; }
  }
  slip /= n; skid /= n; sq /= n;
  ok('the doughnut is the B-05 slide (about 2.2 m/s sideways)', slip > 1.8 && slip < 2.6, `${f2(slip)} m/s`);
  ok('...and its squeal is over the smoke line (reactive.js 0.30) where `skid` was not',
    sq >= 0.30 && skid < 0.30, `squeal ${f3(sq)} · skid ${f3(skid)}`);
  // Half lock at 50 km/h, part throttle: a corner, not a slide.
  const b = new Vehicle(R); b.reset(0, 0, 0); b.vz = 50 / 3.6; b.syncFrame();
  let bq = 0;
  for (let i = 0; i < 120; i++) { b.update(DT, ctl({ steer: 0.5, throttle: 0.5 }), road); bq = Math.max(bq, b.squeal); }
  ok('an ordinary bend at 50 km/h stays silent', bq < 0.05, `peak squeal ${f3(bq)}`);
  // ...and it is presentation only: the bare sheet's numbers are section 1's.
  ok('squeal is 0 in the air', (() => { const a = new Vehicle(R); a.reset(0, 0, 0, 0); a.y = 3; a.inAir = true; a.vz = 10; a.syncFrame(); a.update(DT, ctl({ handbrake: true }), road); return a.squeal === 0; })());
}

// ------------------------------------------------- 12. the kerb at speed

group('12. S3-RANGER: a sidewalk at 70 km/h is a hop, not a launch');

{
  const hop = (kmh) => {
    let on = true;
    const w = { ...road, roadAt: () => on };
    const v = new Vehicle(carById('ranger')); v.reset(0, 0, 0); v.vz = kmh / 3.6; v.syncFrame();
    v.update(DT, ctl({ throttle: 0.5 }), w);
    on = false;
    let peak = 0, air = 0, kerb = false;
    for (let i = 0; i < 180; i++) {
      v.update(DT, ctl({ throttle: 0.5 }), w);
      peak = Math.max(peak, v.y - v.gh);
      if (v.landed > 0 || (air > 0 && !v.air)) { kerb = v.kerbAir; break; }
      if (v.air) air += DT;
    }
    return { peak, air, kerb };
  };
  const h43 = hop(43), h70 = hop(70);
  ok('the 43 km/h hop is the one D3 tuned (about 0.34 m)', Math.abs(h43.peak - 0.34) < 0.06, `${f2(h43.peak)} m`);
  ok('...and at 70 km/h it is under 0.65 m and under the 0.75 s that makes a jump',
    h70.peak < 0.65 && h70.air < 0.75, `${f2(h70.peak)} m, ${f2(h70.air)} s`);
  ok('...and the landing knows it was a kerb hop (main.js skips the airtime toast)', h70.kerb === true);
}

// ------------------------------------------------- dry tank

group('a dry tank: the feel gearbox gets no pedal');

{
  // fuel.js hands the Vehicle a clone of its sheet with accel 0 and dry: true.
  // Flooring W on « Panne sèche » must not rev the box (driving review A5).
  const run = (thr) => {
    const base = carById('civic');
    const v = new Vehicle(base);
    v.reset(0, 0, 0);
    v.vz = 15; v.syncFrame();
    v.spec = Object.assign(Object.create(base), { accel: 0, dry: true });
    for (let i = 0; i < 90; i++) v.update(DT, ctl({ throttle: thr }), road);
    return v.box ? [v.box.rpm, v.box.gear, v.vLong] : null;
  };
  const on = run(1), off = run(0);
  ok('the Civic has a feel gearbox to test', !!on);
  ok('W or no W, a dry tank coasts the same: same rpm, gear and speed',
    !!on && drift(on, off) < 1e-9, on && off ? `W ${on.map(f2).join('/')} · none ${off.map(f2).join('/')}` : '');
}

// ------------------------------------------------- B-09: trauma shake and hitstop

group('B-09 feel.js: trauma shake and a capped hitstop on an event ladder');

{
  // Pure module checks (src/game/feel.js), no browser:
  //   offsets bounded (0.35 m, 2.5 degrees) under a fuzz of every event at
  //   random frame rates and a scale above 1; from full trauma the shake is
  //   under 5% of its peak within 1.5 s; every hitstop holds 40 to 100 ms and
  //   never two start within 0.5 s; slow-mo and hitstop never overlap with
  //   main.js's A-06 slow-mo model wired as the contract says (docs/qa/rf/B-09.md);
  //   the ladder, kindForImpact, the telemetry sink; the per-frame cost under
  //   its 0.05 ms cap; and the module is pure.
  const { readFileSync } = await import('node:fs');
  const { createFeel, LADDER, kindForImpact, simplex2, MAX_OFFSET_M, MAX_ANGLE_DEG, HITSTOP_GAP } = await import('../src/game/feel.js');
  const ROOT = new URL('..', import.meta.url);
  const check = (name, c, info = {}) => ok(name, c, JSON.stringify(info));
  const DEG = Math.PI / 180;
  // A small seeded PRNG, so a failure reproduces.
  let rs = 12345;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  const KINDS = Object.keys(LADDER);

  // 0. noise stays in -1..1
  {
    let lo = 0, hi = 0;
    for (let i = 0; i < 200000; i++) { const v = simplex2(i * 0.0137 - 900, (i % 97) * 3.1); if (v < lo) lo = v; if (v > hi) hi = v; }
    check('noise-range', lo >= -1 && hi <= 1 && hi > 0.5 && lo < -0.5, { lo: +lo.toFixed(3), hi: +hi.toFixed(3) });
  }

  // 1. Bounds under a fuzz.
  {
    const f = createFeel({ seed: 3 });
    let maxLen = 0, maxAng = 0;
    for (let i = 0; i < 60000; i++) {
      if (rnd() < 0.08) f.event(KINDS[Math.floor(rnd() * KINDS.length)], { k: rnd() * 2 });
      if (i % 500 === 0) for (let j = 0; j < 5; j++) f.event('headOn');
      f.update([1 / 30, 1 / 60, 1 / 120, 1 / 144, 0.05][i % 5]);
      const o = f.cameraOffset(i % 3 === 0 ? 4 : 1);
      maxLen = Math.max(maxLen, Math.hypot(o.x, o.y, o.z));
      maxAng = Math.max(maxAng, Math.abs(o.pitch) / DEG, Math.abs(o.yaw) / DEG, Math.abs(o.roll) / DEG);
    }
    check('offset-bounded', maxLen <= MAX_OFFSET_M + 1e-9 && maxLen > 0.1, { maxM: +maxLen.toFixed(4), capM: MAX_OFFSET_M });
    check('angle-bounded', maxAng <= MAX_ANGLE_DEG + 1e-9 && maxAng > 0.5, { maxDeg: +maxAng.toFixed(3), capDeg: MAX_ANGLE_DEG });
    const z = createFeel(); z.event('headOn'); z.update(1 / 60);
    const o0 = z.cameraOffset(0);
    check('shake-setting-0-is-still', o0.len === 0 && o0.pitch === 0 && o0.yaw === 0 && o0.roll === 0, { len: o0.len });
  }

  // 2. Decay: from trauma 1, the envelope (trauma^2) and the measured offset.
  {
    const f = createFeel({ seed: 7 });
    f.event('headOn'); f.event('copRam');
    const t0 = f.trauma();
    let t = 0, envAt = null, peak = 0, late = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 180; i++) {
      f.update(dt); t += dt;
      const o = f.cameraOffset(1);
      const mag = Math.max(o.len / MAX_OFFSET_M, Math.abs(o.pitch) / (MAX_ANGLE_DEG * DEG));
      if (t < 0.3) peak = Math.max(peak, mag);
      if (t >= 1.5) late = Math.max(late, mag);
      if (envAt === null && f.trauma() ** 2 < 0.05) envAt = t;
    }
    check('decay-envelope-under-5pct-in-1.5s', t0 === 1 && envAt !== null && envAt <= 1.5, { traumaStart: t0, secsTo5pct: envAt && +envAt.toFixed(3) });
    check('decay-measured-under-5pct-after-1.5s', late <= 0.05 * Math.max(peak, 1e-9) + 1e-12, { peak: +peak.toFixed(4), after15: +late.toFixed(5) });
    // Same at 30 fps and 144 fps: decay is per real second, not per frame.
    for (const hz of [30, 144]) {
      const g = createFeel(); g.event('headOn'); g.event('headOn');
      for (let i = 0; i < Math.round(1.5 * hz); i++) g.update(1 / hz);
      check(`decay-${hz}hz`, g.trauma() ** 2 < 0.05, { trauma: +g.trauma().toFixed(4) });
    }
  }

  // 3 and 4. Hitstop caps, and no overlap with the slow-mo, in a frame loop that
  // wires main.js's slow-mo exactly as the contract says.
  function mainLoopFuzz(seed, frames, dtOf) {
    rs = seed;
    const f = createFeel();
    const SLOWMO = { crash: { dur: 0.4, scale: 0.3 }, jump: { dur: 0.5, scale: 0.35 }, cooldown: 2.5 };
    const s = { left: 0, dur: 0, scale: 1, cool: 0 };
    const fire = (kind) => { if (s.cool > 0) return false; const c = SLOWMO[kind]; s.left = s.dur = c.dur; s.scale = c.scale; s.cool = SLOWMO.cooldown; return true; };
    const slowmoScale = (d) => { if (s.cool > 0) s.cool = Math.max(0, s.cool - d); if (s.left <= 0) return 1; s.left = Math.max(0, s.left - d); const k = s.left / s.dur; const e = k > 1 / 3 ? 1 : k * 3; return 1 - (1 - s.scale) * e; };
    let clock = 0, overlap = 0, holdStart = null, holds = [], starts = [], twoAtOnce = 0, slowmoFrames = 0, slowmoAfterHit = 0;
    for (let i = 0; i < frames; i++) {
      const dt = dtOf(i);
      // Events land inside the tick: the feel event first, then fireSlowmo (contract).
      const r = rnd();
      if (r < 0.02) {
        const kind = ['headOn', 'copRam', 'mailbox', 'bin'][Math.floor(rnd() * 4)];
        const wasHolding = f.holdsSlowmo();
        const st = f.event(kind, { slowmo: s.left > 0 });
        if (st > 0) { if (wasHolding) twoAtOnce++; starts.push(clock); }
        if (kind === 'headOn' && fire('crash') && st > 0) slowmoAfterHit++;
      } else if (r < 0.025) fire('jump');
      else if (r < 0.06) f.event(['gravel', 'nearMiss'][Math.floor(rnd() * 2)]);
      // The frame: real dt counts the feel down; while it holds, the slow-mo waits.
      f.update(dt); clock += dt;
      const holding = f.holdsSlowmo();
      const scale = holding ? f.timeScale() : f.timeScale(slowmoScale(dt));
      if (holding && scale !== 0) overlap++;
      if (!holding && scale < 1) slowmoFrames++;
      if (holding && s.left > 0 && scale > 0) overlap++;
      if (holding && holdStart === null) holdStart = clock - dt;
      if (!holding && holdStart !== null) { holds.push(clock - dt - holdStart); holdStart = null; }
    }
    let minGap = Infinity;
    for (let i = 1; i < starts.length; i++) minGap = Math.min(minGap, starts[i] - starts[i - 1]);
    return { f, holds, starts, minGap, overlap, twoAtOnce, slowmoFrames, slowmoAfterHit };
  }
  for (const [label, dtOf] of [['60hz', () => 1 / 60], ['120hz', () => 1 / 120], ['jitter', (i) => [1 / 30, 1 / 60, 1 / 144, 1 / 90][i % 4]]]) {
    const r = mainLoopFuzz(label.length * 977, 40000, dtOf);
    // A hold is measured in whole frames; it can end up to one frame past its time.
    const frameMax = label === '60hz' ? 1 / 60 : label === '120hz' ? 1 / 120 : 1 / 30;
    const maxHold = Math.max(...r.holds), maxStop = Math.max(...r.f.telemetry().log.map((e) => e.ms), 0);
    check(`hitstop-length-${label}`, maxStop <= 100 && Math.min(...r.f.telemetry().log.map((e) => e.ms)) >= 40 && maxHold <= 0.1 + frameMax + 1e-9,
      { maxMs: maxStop, maxHeldMs: +(maxHold * 1000).toFixed(1), holds: r.holds.length });
    check(`hitstop-gap-${label}`, r.minGap >= HITSTOP_GAP - 1e-9 && r.twoAtOnce === 0, { minGapS: +r.minGap.toFixed(3), starts: r.starts.length });
    check(`no-slowmo-overlap-${label}`, r.overlap === 0 && r.slowmoFrames > 0 && r.slowmoAfterHit > 0, { overlapFrames: r.overlap, slowmoFrames: r.slowmoFrames, slowmoAfterHit: r.slowmoAfterHit });
  }
  {
    const f = createFeel();
    const st = f.event('headOn', { slowmo: true });
    check('hitstop-skipped-in-slowmo', st === 0 && f.timeScale(0.3) === 0.3 && f.telemetry().skippedSlowmo === 1 && f.trauma() > 0.5, f.telemetry());
    const g = createFeel();
    g.event('headOn'); g.update(0.02);
    const second = g.event('copRam');
    for (let i = 0; i < 20; i++) g.update(1 / 60);
    const third = g.event('copRam');
    g.update(0.5);
    const fourth = g.event('copRam');
    check('hitstop-once-per-0.5s', second === 0 && third === 0 && fourth > 0 && g.telemetry().hitstops === 2, { second, third, fourth, hitstops: g.telemetry().hitstops });
  }

  // 5. The ladder, kindForImpact, the sink.
  {
    const want = { gravel: 0.1, mailbox: 0.25, bin: 0.25, nearMiss: 0.15, copRam: 0.5, headOn: 0.8 };
    check('ladder-trauma', Object.entries(want).every(([k, v]) => LADDER[k] && LADDER[k].trauma === v), Object.fromEntries(KINDS.map((k) => [k, LADDER[k].trauma])));
    const stops = KINDS.map((k) => LADDER[k].stop).filter((s) => s > 0);
    check('ladder-stops-40-100ms', stops.every((s) => s >= 0.04 && s <= 0.1) && LADDER.headOn.stop > LADDER.copRam.stop && LADDER.copRam.stop > LADDER.bin.stop, Object.fromEntries(KINDS.map((k) => [k, LADDER[k].stop])));
    check('kind-for-impact', kindForImpact(0.05) === null && kindForImpact(0.2) === 'bin' && kindForImpact(0.4) === 'copRam' && kindForImpact(0.2, { cop: true }) === 'copRam' && kindForImpact(0.8) === 'headOn', {});
    const g = createFeel(); g.event('gravel'); g.update(0.01); g.event('gravel');
    const once = g.trauma(); g.update(0.4); g.event('gravel');
    check('gravel-rate-limited', Math.abs(once - (0.1 - 0.012)) < 1e-9 && Math.abs(g.trauma() - 0.1) < 1e-9, { afterTwoIn10ms: +once.toFixed(4), after410ms: +g.trauma().toFixed(4) });
    const sink = { crash: 0 };
    const f = createFeel({ sink });
    f.event('headOn');
    for (let i = 0; i < 30; i++) { f.update(1 / 60); f.cameraOffset(1); }
    check('telemetry-sink', sink.hitstops === 1 && sink.offset > 0.05 && sink.offset <= MAX_OFFSET_M && sink.crash === 0, { offset: sink.offset, hitstops: sink.hitstops });
    f.resetTelemetry();
    check('telemetry-reset', sink.hitstops === 0 && sink.offset === 0, { offset: sink.offset, hitstops: sink.hitstops });
    f.clear();
    check('clear', f.trauma() === 0 && f.timeScale() === 1 && !f.holdsSlowmo(), {});
    check('unknown-kind-ignored', f.event('nope') === 0 && f.trauma() === 0, {});
  }

  // 6. Per-frame cost: what main.js would call each frame, with the shake live.
  {
    const f = createFeel();
    const N = 200000;
    let acc = 0;
    for (let i = 0; i < 20000; i++) { f.update(1 / 60); acc += f.cameraOffset(1).x; }   // warm up
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      if (i % 40 === 0) f.event('headOn');
      f.update(1 / 60);
      const o = f.cameraOffset(0.8);
      acc += o.x + o.pitch + f.timeScale(1);
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
    timingCheck(check, (l) => out.push(l), 'per-frame-cost-under-0.05ms', ms < 0.05, { msPerFrame: +ms.toFixed(5), capMs: 0.05, sink: Number.isFinite(acc) });
  }

  // 7. Pure: no import, no DOM, no G.
  {
    const src = readFileSync(new URL('src/game/feel.js', ROOT), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = ['import ', 'window', 'document', 'G.', 'performance', 'Date.now', 'Math.random'].filter((w) => src.includes(w));
    check('pure-module', bad.length === 0, { found: bad });
  }
}

// ------------------------------------------------- the report

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
