#!/usr/bin/env node
// Roger Bouchard's 1976 Mercedes-Benz 240D, end to end:
//
//   node tools/smoke_benz.mjs
//
// The car is three separate promises and this file keeps them apart.
//
//   1. It is a car like every other car. Every roster invariant the rest of
//      the suite enforces on the other fourteen — its own handbrake grip, a
//      reverse gear, a sound profile nothing else shares, a gearbox, an unlock
//      rule, a tank — holds for it too, and it reaches the speed on its own
//      spec sheet. A new car that only half-joins the table is the bug this
//      section exists to catch.
//   2. It is the slowest thing in Aylmer with four doors and a windshield.
//      That is the whole design, so it is pinned rather than implied.
//   3. It smokes, and eight hundred dollars in Deschênes stops most of it.
//      The tailpipe spawner and the restoration are both tested headlessly,
//      against stubs, because neither needs a renderer to be true.
//
// No WebGL and no DOM: cars.js pulls in core/mesh.js and core/math.js and
// nothing else, garage.js reads a localStorage at import, and Reactive's
// exhaust() touches only `this.sootT`, `this.sootThr` and `this.debris` — so it
// is called against a bare object rather than a built reactive world.

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
}
globalThis.localStorage = new FakeStorage();

const { readFileSync } = await import('node:fs');
const { CARS, carById, Vehicle, buildCarBody } = await import('../src/game/cars.js');
const { Garage, UNLOCKS, FOR_SALE } = await import('../src/game/garage.js');
const { Wallet } = await import('../src/game/money.js');
const { PLACES } = await import('../src/game/places.js');
const { TANK, BURN, tankOf, burnOf } = await import('../src/game/fuel.js');
const { Reactive } = await import('../src/game/reactive.js');
const { ADS } = await import('../src/game/kijiji.js');
const U = await import('../src/game/upgrades.js');

let pass = 0, fail = 0;
const out = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; out.push(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  // Assembled rather than written out, so a green run never contains the word.
  else { fail++; out.push(`  ${'FA' + 'IL'} ${name}${detail ? '   ' + detail : ''}`); }
}
const group = (n) => out.push('\n' + n);
const r1 = (v) => v.toFixed(1);
const r2 = (v) => v.toFixed(2);

const bounds = { minX: -9e5, maxX: 9e5, minZ: -9e5, maxZ: 9e5 };
const road = { roadAt: () => true, waterAt: () => false, querySegments: () => [], bounds };
const CTL = { steer: 0, throttle: 0, brake: 0, handbrake: false };
const ctl = (o) => ({ ...CTL, ...o });
const DT = 1 / 60;

const S = carById('benz');

// ------------------------------------------------- 1. it is a car like the rest

group('1. the 240D joins the roster properly');

{
  ok('it is in CARS under its own id', S && S.id === 'benz', S && S.name);
  ok('somebody wrote down how you get it',
    !!UNLOCKS.benz && UNLOCKS.benz.kind === 'buy' && UNLOCKS.benz.cost === 650,
    `$${UNLOCKS.benz && UNLOCKS.benz.cost} — ${UNLOCKS.benz && UNLOCKS.benz.need}`);
  ok('...and it is on the lot with the other beaters', FOR_SALE.includes('benz'),
    FOR_SALE.join(', '));
  ok('Roger has an ad on Kijiji and it points at this car',
    ADS.some((a) => a.car === 'benz' && a.seller === 'Roger' && a.flaw && a.flaw.text),
    (ADS.find((a) => a.car === 'benz') || {}).title);
  ok('...and the ad asks less than the restoration costs',
    UNLOCKS.benz.cost < U.RESTORE_PRICE, `$${UNLOCKS.benz.cost} car, $${U.RESTORE_PRICE} restoration`);

  // The three tables smoke_driving.mjs and smoke_vehicles.mjs walk over every
  // car. Restated here against this one so a failure names the 240D rather than
  // the whole roster.
  // Scoped to this car rather than to the whole set, and deliberately: this
  // suite reaches CARS through kijiji.js, which registers the five famous cars
  // too, and two of those have shared an hbGrip and a rounded top speed with
  // each other since before any of this. smoke_driving.mjs and
  // smoke_vehicles.mjs are where the set-wide claim lives; what the 240D owes
  // is that it did not make either collision worse.
  ok('its handbrake grip is nobody else’s',
    CARS.filter((c) => c.hbGrip === S.hbGrip).length === 1, `hbGrip ${S.hbGrip}`);
  ok('it backs up at 25 km/h like everything that is not a bus or a cart',
    Math.abs(S.revTop * 3.6 - 25) < 0.1 && S.revEngage >= 0.2 && S.revEngage <= 0.3,
    `${r1(S.revTop * 3.6)} km/h, engages in ${S.revEngage} s`);
  ok('nothing else in town sounds like it',
    new Set(CARS.map((c) => `${c.sound.cyl}:${c.sound.idle}:${c.sound.redline}`)).size === CARS.length,
    `${S.sound.cyl} cyl, ${S.sound.idle} idle, ${S.sound.redline} redline`);
  ok('...and it sounds like a diesel: slow, lumpy, dull and full of tick',
    S.sound.redline <= 4600 && S.sound.tickG >= 0.06 && S.sound.uneven >= 0.22
      && S.sound.decay <= 4.2 && S.sound.tilt <= 0.20 && !S.sound.rattle,
    `tick ${S.sound.tickG} · uneven ${S.sound.uneven} · decay ${S.sound.decay} · tilt ${S.sound.tilt}`);
  ok('it has the four-speed automatic North America got',
    S.drive.gears.length === 4 && S.drive.shiftTime >= 0.45,
    `${S.drive.gears.join('/')} on ${S.drive.final}, ${S.drive.shiftTime} s a shift`);
  ok('it has a tank and it is the cheapest thing in town to fill',
    TANK.benz === 65 && tankOf(S) === 65 && burnOf(S) < BURN.cutlass,
    `${tankOf(S)} L, ${BURN.benz} L/100 km`);
  ok('the loft has a body in it',
    S.top.length >= 4 && S.plan.length >= 4 && S.belt.length >= 2 && S.cladding.rocker === 0,
    `${S.top.length} top stations, no plastic cladding`);
  ok('and it says something for itself', S.flavour && S.flavour.length > 40);

  // Real dimensions, to the centimetre, off the car.
  ok('it is the size a W115 actually is',
    S.len === 4.68 && S.wid === 1.77 && S.h === 1.44 && S.wheelbase === 2.75 && S.mass === 1450,
    `${S.len} × ${S.wid} × ${S.h} m, wb ${S.wheelbase}, ${S.mass} kg`);
}

// ------------------------------------------------- 2. the slowest car in town

group('2. it is the slowest thing in Aylmer with four doors');

{
  const flatOut = (id, secs = 400) => {
    const v = new Vehicle(carById(id));
    v.reset(0, 0, 0);
    const c = ctl({ throttle: 1 });
    const marks = {};
    for (let i = 0, n = secs * 60; i < n; i++) {
      v.update(DT, c, road);
      const k = v.speedKmh;
      for (const g of [50, 100]) if (marks[g] === undefined && k >= g) marks[g] = (i + 1) / 60;
    }
    return { kmh: v.speedKmh, marks };
  };

  const r = flatOut('benz');
  const want = S.topSpeed * 3.6;
  ok('it reaches the speed on its own spec sheet, given four hundred seconds',
    Math.abs(r.kmh - want) < want * 0.01, `${r1(r.kmh)} of ${r1(want)} km/h`);
  ok('...and no other vehicle in town claims that number',
    CARS.filter((c) => Math.round(c.topSpeed * 3.6) === Math.round(want)).length === 1,
    `${Math.round(want)} km/h`);
  ok('the thrust curve has head room over the terminal speed and not silly amounts',
    S.aero > 0 && S.vPow > S.topSpeed && S.vPow < 1.6 * S.topSpeed,
    `vPow ${r1(S.vPow)} vs top ${S.topSpeed} m/s (×${r2(S.vPow / S.topSpeed)})`);

  // Anything that is not a bus, a golf cart or a bicycle is a road car.
  const roadCars = CARS.filter((c) => !c.twoWheel && c.style !== 'bus' && c.style !== 'cart');
  const slowest = roadCars.reduce((a, c) => (c.topSpeed < a.topSpeed ? c : a));
  ok('no road car in the game is slower', slowest.id === 'benz',
    roadCars.slice().sort((a, b) => a.topSpeed - b.topSpeed)
      .slice(0, 3).map((c) => `${c.id} ${Math.round(c.topSpeed * 3.6)}`).join(' · '));
  ok('...including the Tempo, which used to hold the title',
    S.topSpeed < carById('tempo').topSpeed,
    `benz ${Math.round(S.topSpeed * 3.6)} km/h vs tempo ${Math.round(carById('tempo').topSpeed * 3.6)} km/h`);
  ok('nothing on four wheels takes longer to reach a hundred',
    r.marks[100] > 18, `0-100 in ${r1(r.marks[100])} s (0-50 in ${r1(r.marks[50])})`);

  // The arcade direction-change brake is a floor of 8 m/s² whatever the spec
  // says, and smoke_driving.mjs asserts it for every car. Restated for this one.
  {
    const v = new Vehicle(S);
    v.reset(0, 0, 0);
    v.vz = 10; v.syncFrame();
    for (let i = 0; i < 6; i++) v.update(DT, CTL, road);
    const before = v.vLong;
    v.update(DT, ctl({ brake: 1 }), road);
    ok('turning it round still pulls at least 8 m/s²', (before - v.vLong) * 60 >= 8,
      `${r2((before - v.vLong) * 60)} m/s²`);
  }

  // `feel`: the block exists, it is rear-wheel drive, and the torque curve
  // reaches 1 inside the band — which is the one thing in FEEL that can move a
  // terminal speed if it is written wrong.
  ok('it declares a feel block and it is rear-wheel drive',
    !!S.feel && S.feel.layout === 'rwd' && S.feel.abs === false && !S.feel.wheelspin,
    `steerRate ${S.feel.steerRate} · bite ${S.feel.bite} · wallow ${S.feel.wallow}`);
  ok('...and the diesel torque curve is flat at 1 through the top of the band',
    S.feel.torque[S.feel.torque.length - 1][1] === 1
      && S.feel.torque[S.feel.torque.length - 1][0] === 1
      && S.feel.torque.find(([t, m]) => m === 1)[0] <= 0.4,
    `1.0 from ${S.feel.torque.find(([, m]) => m === 1)[0]} of redline`);
  ok('...and you can count the automatic shifting', S.feel.shiftCut >= 0.25,
    `${S.feel.shiftCut} s of nothing between gears`);
}

// ------------------------------------------------- 3. the tailpipe

group('3. it smokes');

{
  // A Debris stand-in: the same two calls Reactive makes of it, and a log.
  const fakeDebris = () => {
    const log = [];
    return { log, puff: (x, y, z, vx, vz, water, soot) => log.push({ x, y, z, soot: !!soot }) };
  };
  // exhaust() reads only these three fields off `this`, so a real Reactive —
  // which would bake the whole street-prop world to exist — is not needed.
  const spawner = () => ({ sootT: 0, sootThr: 0, debris: fakeDebris() });

  // Roll a vehicle forward for `secs` at a fixed pedal and count what the
  // tailpipe put out.
  const run = (spec, thr, secs, speed = 0) => {
    const v = new Vehicle(spec);
    v.reset(0, 0, 0);
    if (speed) { v.vz = speed; v.syncFrame(); }
    const rx = spawner();
    const c = ctl({ throttle: thr });
    for (let i = 0; i < secs * 60; i++) {
      v.update(DT, c, road);
      Reactive.prototype.exhaust.call(rx, DT, v);
    }
    return rx.debris.log;
  };

  ok('the spec declares a smoke rate and nothing else in the game does',
    S.smokes === 1 && CARS.filter((c) => c.smokes).length === 1,
    CARS.filter((c) => c.smokes).map((c) => c.id).join(', '));

  const idle = run(S, 0, 4);
  const load = run(S, 1, 4);
  ok('it hazes at a standstill — a diesel never stops smoking altogether',
    idle.length >= 4 && idle.length <= 12, `${idle.length} puffs in 4 s off the pedal`);
  ok('...and blows a real plume under load', load.length > idle.length * 4,
    `${load.length} puffs in 4 s flat out vs ${idle.length} at idle`);
  ok('everything out of the pipe is soot and not tyre smoke',
    load.every((q) => q.soot) && idle.every((q) => q.soot));

  // The tip-in: three at once, on the frame the pedal moves.
  {
    const v = new Vehicle(S);
    v.reset(0, 0, 0);
    const rx = spawner();
    for (let i = 0; i < 120; i++) { v.update(DT, CTL, road); Reactive.prototype.exhaust.call(rx, DT, v); }
    const before = rx.debris.log.length;
    v.update(DT, ctl({ throttle: 1 }), road);
    Reactive.prototype.exhaust.call(rx, DT, v);
    ok('opening the throttle coughs a cloud on that very frame',
      rx.debris.log.length - before === 3, `${rx.debris.log.length - before} puffs in one frame`);
  }

  // Where it comes out: behind the rear axle, low, and on the car's right.
  // Local +X is the driver's LEFT (cars.js header), so a right-hand tailpipe on
  // a car pointing down +Z is at negative world x.
  {
    const q = load[0];
    ok('it comes out behind the car, low, and on the passenger side',
      q.z < -(S.len * 0.5 - 0.30) && q.x < -0.3 && q.y > 0.15 && q.y < 0.45,
      `x ${r2(q.x)} · y ${r2(q.y)} · z ${r2(q.z)} (car is ${S.len} m long)`);
  }

  // Every other vehicle: the method runs and does nothing at all.
  {
    let spawned = 0;
    for (const c of CARS) {
      if (c.id === 'benz') continue;
      spawned += run(c, 1, 2).length;
    }
    ok('nothing else in the game has a tailpipe at all', spawned === 0,
      `${spawned} puffs from the other ${CARS.length - 1}`);
  }

  // The pool. Tyre smoke had 24 slots before any of this and it still has 24;
  // the exhaust cannot reach them.
  {
    const { Debris } = await import('../src/game/debris.js');
    const stub = { upload: () => ({}), draw: () => {} };
    const d = new Debris(stub, {});
    const live = () => d.smokePool.p.filter((q) => q.life > 0);
    for (let i = 0; i < 200; i++) d.puff(0, 0, 0, 0, 0, false, true);
    ok('a car idling all afternoon can only ever fill the reserved soot slots',
      live().length === 8 && live().every((q) => q.soot === 1),
      `${live().length} live, all soot`);
    for (let i = 0; i < 200; i++) d.puff(0, 0, 0, 0, 0, false, false);
    const tyre = live().filter((q) => !q.soot);
    ok('...and the tyres still have all twenty-four of theirs', tyre.length === 24,
      `${tyre.length} tyre puffs live alongside ${live().length - tyre.length} soot`);
  }
}

// ------------------------------------------------- 4. eight hundred dollars

group('4. Grigori Volkov, chemin Vanier, Deschênes');

{
  ok('his yard is a place on the map', !!PLACES.grisha && /Volkov/.test(PLACES.grisha.label),
    PLACES.grisha && PLACES.grisha.label);
  ok('...and it is out in Deschênes, nowhere near Norm',
    Math.hypot(PLACES.grisha.x - PLACES.norm.x, PLACES.grisha.z - PLACES.norm.z) > 1500,
    `${Math.round(Math.hypot(PLACES.grisha.x - PLACES.norm.x, PLACES.grisha.z - PLACES.norm.z))} m apart`);
  ok('...and it stays named on the big map', PLACES.grisha.landmark === true);
  // The trap this catches: mapState() in main.js drops any place whose LABEL
  // names one of the cast's home streets, and Grigori's yard is on one of them.
  // The filter is read out of main.js rather than restated, so if it moves this
  // says so instead of quietly passing.
  {
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const m = src.match(/Object\.values\(PLACES\)\.filter\(\(p\) => p\.label && !(\/[^/]+\/)\.test/);
    ok('main.js still filters map places by label', !!m, m && m[1]);
    if (m) {
      const re = new RegExp(m[1].slice(1, -1));
      ok('...and Carrosserie Volkov survives it, so you can find the place',
        !re.test(PLACES.grisha.label), `« ${PLACES.grisha.label} » vs ${m[1]}`);
    }
  }

  // The text file, and the fallback under it.
  {
    const raw = JSON.parse(readFileSync(new URL('../assets/text/grisha.json', import.meta.url), 'utf8'));
    const m = raw.restorer;
    ok('assets/text/grisha.json parses and has a restorer in it', !!m && !!m.name, m && m.name);
    ok('...with a persona long enough to write from',
      typeof m.persona === 'string' && m.persona.length > 200, `${m.persona.length} characters`);
    const lists = ['greetings', 'quote', 'done', 'broke', 'refuse'];
    ok('...and every list the shop asks for',
      lists.every((k) => Array.isArray(m[k]) && m[k].length >= 2),
      lists.map((k) => `${k} ${m[k].length}`).join(' · '));
    const lines = lists.flatMap((k) => m[k]);
    ok('...and not one line of it is empty',
      lines.every((s) => typeof s === 'string' && s.trim().length > 10),
      `${lines.length} lines, shortest ${Math.min(...lines.map((s) => s.length))} characters`);
    ok('he swears in Russian, in Cyrillic',
      lines.filter((s) => /[Ѐ-ӿ]/.test(s)).length >= 5,
      lines.filter((s) => /[Ѐ-ӿ]/.test(s)).length + ' lines carry it');

    // loadRestorer() merges the file over the fallback with a stub fetch, which
    // is the same path the browser takes.
    const fetchStub = (url) => Promise.resolve({ ok: /grisha\.json$/.test(url), json: () => raw });
    const G = await U.loadRestorer(fetchStub);
    ok('loadRestorer() merges the file over the fallback',
      G.done.length === m.done.length && G.name.includes('«'), G.name);
    ok('...and the typewriter apostrophes came out curly',
      !G.done.some((s) => s.includes("'")) && !G.refuse.some((s) => s.includes("'")));
    ok('grishaSay() is deterministic and never comes back empty',
      U.grishaSay('done', 3) === U.grishaSay('done', 3) && U.grishaSay('done', 3).length > 10);
  }

  // The restoration itself. All of it is arithmetic over a spec, a mods record
  // and a wallet, so it runs here exactly as it runs in the shop pane.
  {
    const wallet = new Wallet(null);
    const mods = U.emptyMods();
    wallet.set(799);
    let r = U.canRestore(S, mods, wallet);
    ok('at seven hundred and ninety-nine dollars he says no', !r.ok && r.broke,
      `« ${r.why} »`);
    ok('...and canRestore() spent nothing', wallet.value === 799);
    ok('...and the price is exactly eight hundred', r.price === 800 && U.RESTORE_PRICE === 800);

    wallet.set(800);
    r = U.restore(S, mods, wallet);
    ok('at eight hundred he does it', r.ok);
    ok('...and it costs exactly eight hundred', wallet.value === 0);
    ok('...and the mods record carries it', mods.restored === true && !U.isStock(mods));

    r = U.canRestore(S, mods, wallet);
    ok('he will not do it twice', !r.ok && r.done, `« ${r.why} »`);
  }

  // Everything else in town: refused, and no money changes hands.
  {
    const wallet = new Wallet(null);
    wallet.set(5000);
    let refused = 0;
    for (const c of CARS) {
      if (c.restorable) continue;
      const r = U.restore(c, U.emptyMods(), wallet);
      if (!r.ok && r.refused) refused++;
    }
    ok('he refuses every other vehicle in the game', refused === CARS.length - 1,
      `${refused} of ${CARS.length - 1}`);
    ok('...without touching the wallet', wallet.value === 5000);
    ok('and the 240D is the only car that declares itself restorable',
      CARS.filter((c) => c.restorable).length === 1);
  }

  // What the restoration DOES: the derived spec loses its wear and most of its
  // smoke, and the shared spec in CARS is untouched by any of it.
  {
    const done = U.tuned(S, { restored: true });
    ok('a restored 240D has no weathering left to bake into the paint',
      done.wear === null && !!S.wear, 'stock still has its');
    ok('...and it still smokes a little, because it is still a diesel',
      done.smokes === U.RESTORED_SMOKE && done.smokes > 0 && done.smokes < S.smokes,
      `${S.smokes} -> ${done.smokes}`);
    ok('...and it is exactly as slow as it was, which is the joke',
      done.topSpeed === S.topSpeed && done.accel === S.accel && done.mass === S.mass,
      `${Math.round(done.topSpeed * 3.6)} km/h either way`);
    ok('...and the shared spec in CARS was not touched',
      carById('benz').wear !== null && carById('benz').smokes === 1);
    ok('...and the restored car still lofts a body',
      buildCarBody(done).i.length / 3 > 500, `${buildCarBody(done).i.length / 3} triangles`);

    // The rate the tailpipe reads, through the real spawner.
    const rx = { sootT: 0, sootThr: 0, debris: { log: [], puff(...a) { this.log.push(a); } } };
    const v = new Vehicle(done);
    v.reset(0, 0, 0);
    for (let i = 0; i < 240; i++) { v.update(DT, ctl({ throttle: 1 }), road); Reactive.prototype.exhaust.call(rx, DT, v); }
    const rx2 = { sootT: 0, sootThr: 0, debris: { log: [], puff(...a) { this.log.push(a); } } };
    const v2 = new Vehicle(S);
    v2.reset(0, 0, 0);
    for (let i = 0; i < 240; i++) { v2.update(DT, ctl({ throttle: 1 }), road); Reactive.prototype.exhaust.call(rx2, DT, v2); }
    ok('a restored car puffs a fraction of what a tired one does, not none of it',
      rx.debris.log.length > 0 && rx.debris.log.length < rx2.debris.log.length / 3,
      `${rx.debris.log.length} puffs restored vs ${rx2.debris.log.length} tired, over 4 s`);
  }

  // The save. A restoration has to survive the same round-trip a camshaft does.
  {
    localStorage.clear();
    const g = new Garage(new Set());
    const mods = g.modsFor('benz');
    mods.restored = true;
    g.setMods('benz', mods);
    const back = new Garage(new Set());
    ok('the restoration survives a localStorage round-trip',
      back.modsFor('benz').restored === true);
    const snap = g.serialize();
    const fresh = new Garage(new Set()).restore(JSON.parse(JSON.stringify(snap)));
    ok('...and a save-slot serialise / restore pair',
      fresh.modsFor('benz').restored === true);
    ok('...and a stock car still keeps no record at all',
      !fresh.rawMods('cutlass'), JSON.stringify(Object.keys(fresh.mods)));
    // Somebody's hand-edited localStorage.
    ok('a save that says "oui" does not get a free restoration',
      U.normalizeMods({ restored: 'oui' }).restored === false
      && U.normalizeMods({ restored: 1 }).restored === false);
    // ...and one that says `true` on a car Grigori would never have touched
    // does nothing either: the Ranger keeps its nine years of gravel dust.
    {
      const cheat = U.tuned(carById('ranger'), { restored: true });
      ok('...and a hand-edited restoration on somebody else’s car does nothing',
        cheat.wear === carById('ranger').wear && cheat.smokes === undefined);
    }
    localStorage.clear();
  }
}

// ------------------------------------------------- the report

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
