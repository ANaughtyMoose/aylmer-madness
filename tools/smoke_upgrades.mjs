// The money loop:  node tools/smoke_upgrades.mjs
//
// The mechanic's maths, the price curve against what the jobs actually pay, the
// Kijiji ads, and the one rule the famous cars exist to enforce: they cannot be
// bought, and no amount of money skips them.
//
// The before/after driving numbers here are the SAME measurements the shop puts
// on its work order — upgrades.js measure() drives a Vehicle round a flat empty
// world — so if this file says the Civic's 0-100 drops from 7,7 s to 6,2 s, that
// is what the car does in the browser.

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
}
globalThis.localStorage = new FakeStorage();

const { CARS, carById } = await import('../src/game/cars.js');
const { Garage, UNLOCKS } = await import('../src/game/garage.js');
const { Wallet, START } = await import('../src/game/money.js');
const { MISSIONS, missionPayout } = await import('../src/game/missions.js');
const U = await import('../src/game/upgrades.js');
const F = await import('../src/game/famouscars.js');
const K = await import('../src/game/kijiji.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const fresh = () => { localStorage.clear(); return new Garage(new Set()); };
const s1 = (v) => (v == null ? 'n/a' : v.toFixed(2));

// ---------------------------------------------------------------- 1. the layer

group('the modifier layer');
{
  const base = carById('civic');
  const before = JSON.stringify({ a: base.accel, t: base.topSpeed, g: base.grip, b: base.brake });

  ok(U.tuned(base, U.emptyMods()) === base, 'a stock car IS the spec out of cars.js, not a copy');

  const full = { moteur: 3, pneus: 3, suspension: 2, freins: 2, paint: null };
  const t = U.tuned(base, full);
  ok(t !== base, 'a built car is a derived object');
  ok(Object.getPrototypeOf(t) === base, 'whose prototype is the real spec');
  ok(t.id === 'civic' && t.name === base.name && t.top === base.top,
    'so the id, the name and the loft profiles still come from cars.js');
  ok(JSON.stringify({ a: base.accel, t: base.topSpeed, g: base.grip, b: base.brake }) === before,
    'and the spec in CARS was not touched', JSON.stringify(base.accel));

  ok(Math.abs(t.accel - base.accel * 1.36) < 1e-9, `accel ${base.accel} -> ${t.accel.toFixed(2)}`);
  ok(Math.abs(t.topSpeed - base.topSpeed * 1.15) < 1e-9, `topSpeed ${base.topSpeed} -> ${t.topSpeed.toFixed(1)}`);
  ok(Math.abs(t.grip - base.grip * 1.30 * 1.06) < 1e-9, `grip ${base.grip} -> ${t.grip.toFixed(3)} (pneus x suspension)`);
  ok(Math.abs(t.brake - base.brake * 1.28) < 1e-9, `brake ${base.brake} -> ${t.brake.toFixed(2)}`);
  ok(t.suspension === 0.085, 'and the springs are shorter');

  // Levels are the row, not the product of the rows below it.
  const one = U.tuned(base, { moteur: 1 });
  ok(Math.abs(one.accel - base.accel * 1.10) < 1e-9, 'level 1 is level 1, not level 1 compounded');

  // Nothing a hand-edited save can say makes a part that does not exist.
  const wild = U.normalizeMods({ moteur: 99, pneus: -4, freins: 1.7, paint: 'rouge', bazooka: 3 });
  ok(wild.moteur === 3 && wild.pneus === 0 && wild.freins === 1, 'levels out of a save are clamped');
  ok(wild.paint === null && wild.bazooka === undefined, 'and invented parts are dropped');

  const painted = U.tuned(base, { paint: 0x123456 });
  ok(painted.body === 0x123456 && base.body !== 0x123456, 'paint is on the derived spec only');
}

// ---------------------------------------------------------------- 2. the feel

group('what the parts actually do (measured)');
const NUMBERS = {};
for (const id of ['ranger', 'civic', 'cutlass']) {
  const base = carById(id);
  const full = { moteur: 3, pneus: 3, suspension: 2, freins: 2 };
  const a = U.measure(base);
  const b = U.measure(U.tuned(base, full));
  NUMBERS[id] = { a, b };
  console.log(`  ${base.name}`);
  console.log(`     0-100 km/h  ${s1(a.zeroTo100)} s  ->  ${s1(b.zeroTo100)} s`);
  console.log(`     vitesse max ${a.top.toFixed(1)} -> ${b.top.toFixed(1)} km/h`);
  console.log(`     100-0       ${a.brake.toFixed(1)} -> ${b.brake.toFixed(1)} m`);
  console.log(`     tenue       ${a.grip.toFixed(2)} -> ${b.grip.toFixed(2)} g  (skidpad 40 m: ${a.corner.toFixed(0)} -> ${b.corner.toFixed(0)} km/h)`);
  ok(b.zeroTo100 < a.zeroTo100 * 0.92, `${id}: the 0-100 drops at least 8 %`);
  ok(b.top > a.top * 1.08, `${id}: the top speed climbs at least 8 %`);
  ok(b.brake < a.brake * 0.95, `${id}: it stops shorter`);
  ok(b.grip > a.grip * 1.05, `${id}: and it corners harder`);
  ok(b.corner > a.corner * 1.02, `${id}: and holds the 40 m circle faster — ${a.corner.toFixed(0)} -> ${b.corner.toFixed(0)} km/h`);
}
{
  // One part at a time has to be worth something on its own, or the shop is
  // selling four things that only matter together.
  const base = carById('ranger');
  const stock = U.measure(base);
  const eng = U.measure(U.tuned(base, { moteur: 1 }));
  const tyres = U.measure(U.tuned(base, { pneus: 1 }));
  const brakes = U.measure(U.tuned(base, { freins: 1 }));
  ok(eng.zeroTo100 < stock.zeroTo100 - 0.15,
    `the $${U.priceOf(base, 'moteur', 0)} muffler alone is ${s1(stock.zeroTo100)} -> ${s1(eng.zeroTo100)} s`);
  ok(tyres.grip > stock.grip * 1.02,
    `the $${U.priceOf(base, 'pneus', 0)} tyres alone are ${stock.grip.toFixed(3)} -> ${tyres.grip.toFixed(3)} g`);
  ok(brakes.brake < stock.brake - 1,
    `the $${U.priceOf(base, 'freins', 0)} pads alone are ${stock.brake.toFixed(1)} -> ${brakes.brake.toFixed(1)} m`);
}

// ---------------------------------------------------------------- 3. the till

group('the price curve');
{
  const ranger = carById('ranger');
  const tier1 = U.PARTS.reduce((t, p) => t + U.priceOf(ranger, p.id, 0), 0);
  const full = U.PARTS.reduce((t, p) => {
    for (let i = 0; i < p.levels.length; i++) t += U.priceOf(ranger, p.id, i);
    return t;
  }, 0);
  let jobs = 0;
  for (const def of MISSIONS) jobs += missionPayout(def, { seats: 2, carId: 'ranger' });

  console.log(`  every job once = $${jobs}, plus $${START} to start = $${jobs + START}`);
  console.log(`  the Ranger: tier 1 everywhere $${tier1}, built to the last bolt $${full}`);
  ok(U.priceOf(ranger, 'pneus', 0) <= 90, `the cheapest first upgrade is $${U.priceOf(ranger, 'pneus', 0)}`);
  ok(U.priceOf(ranger, 'pneus', 0) <= jobs / 6, 'which is a handful of jobs, not a season');
  ok(tier1 < jobs + START, `tier 1 on all five parts ($${tier1}) is about one clean sweep ($${jobs} + $${START})`);
  ok(full > jobs + START, `a fully built Ranger ($${full}) is more than one sweep can pay for`);
  // The Civic is the car anybody actually builds, and it is the light one, so
  // the parts are cheaper: building it is a long project, not a second game.
  const civic = carById('civic');
  const civicFull = U.PARTS.reduce((t, p) => {
    for (let i = 0; i < p.levels.length; i++) t += U.priceOf(civic, p.id, i);
    return t;
  }, 0);
  console.log(`  the Civic, built to the last bolt: $${civicFull}`);
  ok(civicFull < 3 * (jobs + START), `...and a built Civic ($${civicFull}) is about three sweeps`);
  ok(civicFull < full, 'a light car costs less to build than a truck');

  // Parts are priced off the car, so a bus costs bus money and a cart does not.
  ok(U.partsMul(carById('bus')) > 2, `the bus multiplier is x${U.partsMul(carById('bus'))}`);
  ok(U.partsMul(carById('cart')) < 0.6, `the golf cart's is x${U.partsMul(carById('cart'))}`);
  ok(U.priceOf(carById('bus'), 'freins', 0) > U.priceOf(carById('civic'), 'freins', 0) * 2,
    'bus brakes cost more than Civic brakes');

  const w = new Wallet(null);
  const mods = U.emptyMods();
  w.set(50);
  let r = U.canFit(ranger, mods, 'pneus', w);
  ok(!r.ok && /manque/.test(r.why), `fifty bucks is not enough: « ${r.why} »`);
  ok(mods.pneus === 0 && w.value === 50, 'and canFit spent nothing');
  w.set(200);
  r = U.fit(ranger, mods, 'pneus', w);
  ok(r.ok && mods.pneus === 1 && w.value === 200 - r.price, `fitted for $${r.price}, wallet ${w.value}`);
  for (let i = 0; i < 5; i++) U.fit(ranger, mods, 'pneus', (w.set(9999), w));
  ok(mods.pneus === 3, 'and it stops at the top of the tree, however much money you wave');
  ok(U.canFit(ranger, mods, 'pneus', w).why === 'Déjà au boutte', 'saying so');

  // The body shop costs more than the four-minute job at the pump, and always
  // has a floor under it.
  ok(U.bodyPrice(ranger, 0) >= U.BODY_MIN, `an undamaged car still costs $${U.bodyPrice(ranger, 0)} to look at`);
  ok(U.bodyPrice(ranger, 80) > U.bodyPrice(ranger, 20), 'and a bent one costs more than a scratched one');
}

// ---------------------------------------------------------------- 4. Kijiji

group('Kijiji');
{
  const g = fresh();
  const cars = K.ADS.filter((a) => a.car);
  ok(K.ADS.length >= 8, `${K.ADS.length} ads`);
  ok(cars.length >= 5, `${cars.length} of them are cars for sale`);
  ok(K.ADS.some((a) => !a.car), 'and at least one is a couch');
  for (const a of cars) {
    ok(UNLOCKS[a.car] && UNLOCKS[a.car].kind === 'buy', `${a.car} is genuinely for sale`);
    ok(g.cost(a.car) > 0, `${a.car}: ${g.cost(a.car)} $`);
    ok(/[A-ZÀ-Ý]{6,}/.test(a.title), `« ${a.title} » is shouted, the way they were`);
  }
  ok(K.ADS.some((a) => /LOWBALLER|SAIS CE QUE J/.test(a.body)), 'somebody knows what they have');
  ok(K.ADS.some((a) => /SERIEUX SEULEMENT/.test(a.body)), 'and somebody wants serious inquiries only');
  ok(K.ADS.some((a) => /PAS DE MESSAGE|REPONDS PAS/.test(a.body)), 'and somebody will not answer the phone');
  ok(cars.every((a) => a.seller && a.where && a.posted), 'every ad has a seller, a place and a date');

  // The Tempo: the cheapest whole car in the game, and the only one that is
  // only ever sold here.
  ok(g.cost('tempo') < Math.min(...['cutlass', 'cavalier', 'caravan'].map((id) => g.cost(id))),
    `the Tempo at $${g.cost('tempo')} undercuts everything on the lot`);
  const w = new Wallet(null);
  w.set(100);
  ok(!g.buy('tempo', w, new Set()).ok, 'a hundred bucks does not buy it');
  w.set(200);
  ok(g.buy('tempo', w, new Set()).ok && w.value === 20, `two hundred does, leaving ${w.value}`);
  ok(g.has('tempo'), 'and it is yours');

  // The bus gate still holds through Kijiji: same Garage.buy, same rules.
  w.set(9999);
  ok(!g.buy('bus', w, new Set(['gang'])).ok, 'the bus still needs ten jobs, ad or no ad');
  ok(w.value === 9999, 'and the money stays put');
}

// ------------------------------------------------------- 4b. the classifieds

group('the forty ads in assets/text/kijiji.json');
{
  const fs = await import('node:fs');
  const raw = JSON.parse(fs.readFileSync(new URL('../assets/text/kijiji.json', import.meta.url), 'utf8'));
  ok(Array.isArray(raw.listings) && raw.listings.length >= 30, `${raw.listings.length} listings in the file`);

  const all = K.mergeListings(raw);
  const buyable = all.filter((a) => a.car);
  const phantoms = all.filter((a) => a.phantom);
  ok(all.length === K.ADS.length + raw.listings.length, `${all.length} ads on the page`);
  ok(buyable.length === 5, 'five of them are cars this game can actually build');
  ok(phantoms.length === raw.listings.length, `${phantoms.length} are phantoms`);
  ok(phantoms.every((a) => !a.car), 'and not one phantom is buyable');
  ok(phantoms.every((a) => a.redFlag), 'every phantom knows what is wrong with itself');
  ok(phantoms.every((a) => a.phone), 'and has a number that will not be answered');

  // The file's asking prices are honest 2004 money; this game's are one notch
  // below. The scale keeps the ordering and the floor keeps the Tempo cheapest.
  const raws = raw.listings.map((l) => l.price);
  const prices = phantoms.map((a) => a.price);
  console.log(`  file $${Math.min(...raws)}-$${Math.max(...raws)} -> page $${Math.min(...prices)}-$${Math.max(...prices)}`);
  ok(Math.min(...prices) >= K.PHANTOM_MIN, `nothing on the page is under $${K.PHANTOM_MIN}`);
  ok(Math.min(...prices) > UNLOCKS.tempo.cost, `so the $${UNLOCKS.tempo.cost} Tempo is still the cheapest whole car`);
  ok(Math.max(...prices) <= 2000, `and the dearest phantom is $${Math.max(...prices)}, not $${Math.max(...raws)}`);
  const richest = raw.listings.find((l) => l.price === Math.max(...raws));
  ok(K.phantomPrice(richest.price) < K.phantomPrice(richest.price) * 3, 'scaling is monotonic');
  ok(K.phantomPrice(400) <= K.phantomPrice(4500), 'a cheap car stays cheaper than a dear one');

  // The two ads that collide with a car you can only earn get a line about it.
  const tam = phantoms.find((a) => /FIREBIRD TRANS AM/.test(a.title));
  const cop = phantoms.find((a) => /EX AUTO DE POLICE/.test(a.title));
  ok(tam && /pas à vendre/.test(tam.footer), `the Trans Am ad says: « ${tam && tam.footer} »`);
  ok(cop && /encan/.test(cop.footer), `and the ex-cruiser ad says: « ${cop && cop.footer} »`);

  // The inspection: what it costs, what it saves, and where the line is.
  ok(K.INSPECT_PRICE === 25, `an inspection is $${K.INSPECT_PRICE}`);
  const reb = (id) => K.rebateOn(UNLOCKS[id].cost);
  console.log(`  rebates: tempo $${reb('tempo')}, cavalier $${reb('cavalier')}, bus $${reb('bus')}`);
  ok(reb('tempo') >= K.INSPECT_PRICE, 'it just about pays for itself on the cheapest car');
  ok(reb('bus') > K.INSPECT_PRICE * 5, 'and it is obviously worth it on the dearest');
  ok(K.ADS.filter((a) => a.car).every((a) => a.flaw && a.flaw.damage > 0),
    'every car you can buy has something wrong with it');
  ok(K.ADS.filter((a) => a.car).every((a) => a.flaw.damage < 40),
    'but nothing you buy arrives undriveable');
  for (const a of K.ADS.filter((x) => x.car)) {
    ok(a.flaw.text.length > 30, `${a.car}: ${a.flaw.text}`);
  }
  ok(!K.wasInspected(K.ADS[0]), 'and nothing is inspected until you pay for it');
}

// ---------------------------------------------------------------- 5. famous

group('the famous cars');
{
  ok(F.FAMOUS.length === 4, `${F.FAMOUS.length} famous cars`);
  // Four of the writers' eight legends need a car model cars.js does not have.
  // They are not shipped as unearnable unlocks; they are things Norm says.
  ok(F.RUMOURS.length + F.FAMOUS.length >= 8, 'all eight legends have a home, earnable or not');
  ok(F.FAMOUS.some((f) => f.id === 'sicivic'), 'Sayyad\'s Si is one of them');
  ok(carById('sicivic').name.includes('Civic Si'), `and it is a ${carById('sicivic').name}`);
  ok(carById('sicivic').accel > carById('civic').accel, 'quicker than the one he lends you');
  ok(carById('sicivic').mass < carById('civic').mass, 'and lighter');
  ok(UNLOCKS.sicivic.who === 'Sayyad', 'it is still Sayyad\'s car');
  for (const f of F.FAMOUS) {
    ok(UNLOCKS[f.id] && UNLOCKS[f.id].kind === 'famous', `${f.id} is kind 'famous'`);
    ok(UNLOCKS[f.id].cost === undefined, `${f.id} has no price anywhere`);
    ok(f.card.length > 80 && f.title === f.title.toUpperCase(), `${f.id} has a moment written for it`);
    ok(!!F.OWNERS[f.id], `${f.id} has a driveway to sit in`);
    ok(CARS.some((c) => c.id === f.id), `${f.id} is a real car in CARS`);
  }

  // Money does not touch them.
  const g = fresh();
  const w = new Wallet(null);
  w.set(1e6);
  for (const f of F.FAMOUS) {
    const can = g.canBuy(f.id, w, new Set());
    ok(!can.ok && /achète pas/.test(can.why), `${f.id}: « ${can.why} »`);
    const r = g.buy(f.id, w, new Set());
    ok(!r.ok, `${f.id} cannot be bought`);
    ok(!g.has(f.id), `${f.id} is still not yours`);
  }
  ok(w.value === 1e6, 'a million dollars later, the wallet is untouched');
  ok(!g.earn('cutlass'), 'and earn() refuses a car that is merely for sale');

  // Nor does finishing everything ELSE.
  const allJobs = new Set(MISSIONS.map((m) => m.id));
  const partial = new Set(['poutine', 'sayyad']);
  ok(F.claimFamous(g, partial).length === 0, 'two thirds of Sayyad\'s chain is not the chain');
  const chain = new Set(['poutine', 'sayyad', 'racecivic']);
  const got = F.claimFamous(g, chain);
  ok(got.length === 1 && got[0].id === 'sicivic', 'the whole chain hands over the Si');
  ok(g.has('sicivic'), 'and it is drivable');
  ok(F.claimFamous(g, chain).length === 0, 'once, not every frame');

  const races = new Set(['racedave', 'racecivic', 'circuit', 'blitz']);
  ok(F.claimFamous(fresh(), new Set(['racedave', 'circuit'])).length === 0, 'two races out of four is nothing');
  const g2 = fresh();
  ok(F.claimFamous(g2, races).some((f) => f.id === 'crownvic'), 'all four races is the Crown Vic');

  const g3 = fresh();
  ok(F.claimFamous(g3, allJobs).some((f) => f.id === 'leone'), 'every job in the game is the Leone');
  ok(F.claimFamous(fresh(), new Set([...allJobs].slice(0, -1))).every((f) => f.id !== 'leone'),
    'sixteen out of seventeen is not every job');
}

// ---------------------------------------------------------------- 6. jumps

group('the jumps');
{
  const g = fresh();
  ok(F.JUMPS.length === 8, `${F.JUMPS.length} jumps, all of them real terrain features`);
  for (const j of F.JUMPS) {
    ok(Number.isFinite(j.x) && Number.isFinite(j.z), `${j.id} is somewhere: ${j.x}, ${j.z}`);
    ok(!!j.label, `${j.id}: ${j.label}`);
  }
  const j0 = F.JUMPS[0];
  const car = { inAir: false, y: 3, gh: 0, speedKmh: 60, x: j0.x, z: j0.z };
  ok(F.watchJumps(car, g) === null, 'driving past on the ground is not a jump');
  car.inAir = true;
  car.speedKmh = 8;
  ok(F.watchJumps(car, g) === null, 'nor is creeping over it');
  car.speedKmh = 60;
  ok(F.watchJumps(car, g) === j0, `landing it counts: ${j0.label}`);
  ok(F.watchJumps(car, g) === null, 'and it only counts once');
  ok(F.jumpsFound(g) === 1, 'one of eight');
  car.x = j0.x + 400;
  ok(F.watchJumps(car, g) === null, 'air four hundred metres away is not a jump either');

  ok(!g.has('firebird'), 'one jump is not the Firebird');
  for (const j of F.JUMPS) { car.x = j.x; car.z = j.z; F.watchJumps(car, g); }
  ok(F.jumpsFound(g) === 8, 'eight of eight');
  ok(F.claimFamous(g, new Set()).some((f) => f.id === 'firebird'), 'and THAT is the Firebird');
}

// ---------------------------------------------------------------- 7. saving

group('persistence');
{
  localStorage.clear();
  const a = new Garage(new Set());
  const mods = a.modsFor('ranger');
  mods.moteur = 2; mods.pneus = 1; mods.paint = 0x1b1c1f;
  a.setMods('ranger', mods);
  a.addFeat('jump:dirtJump');
  a.earn('firebird');

  // A reload off the localStorage fallback.
  const b = new Garage(new Set());
  ok(b.modsFor('ranger').moteur === 2 && b.modsFor('ranger').pneus === 1, 'a reload keeps the parts');
  ok(b.modsFor('ranger').paint === 0x1b1c1f, 'and the paint');
  ok(b.hasFeat('jump:dirtJump'), 'and the jump you found');
  ok(b.has('firebird'), 'and the car you earned');
  ok(b.modsFor('civic').moteur === 0, 'a car nobody has touched is stock');

  // ...and through a save slot, which is the one that matters: save.js reads
  // G.garage.serialize() into `unlocks` and hands it straight back to restore().
  const snap = JSON.parse(JSON.stringify(a.serialize()));
  ok(Array.isArray(snap.feats) && snap.mods && typeof snap.mods === 'object',
    'serialize() carries mods and feats', JSON.stringify(Object.keys(snap)));
  const c = new Garage(new Set());
  c.reset();
  ok(c.modsFor('ranger').moteur === 0 && !c.hasFeat('jump:dirtJump') && !c.has('firebird'),
    'reset() wipes all three');
  c.restore(snap);
  ok(c.modsFor('ranger').moteur === 2 && c.hasFeat('jump:dirtJump') && c.has('firebird'),
    'restore() puts all three back');
  ok(JSON.stringify(c.serialize().mods) === JSON.stringify(snap.mods), 'and it round-trips');

  c.restore({ mods: { ranger: { moteur: 99 }, 'not-a-car': { moteur: 1 } }, feats: [7, 'jump:x'] });
  ok(c.modsFor('ranger').moteur === 3, 'a hand-edited save cannot fit a part that does not exist');
  ok(!c.mods['not-a-car'], 'nor tune a car that does not exist');
  ok(c.hasFeat('jump:x') && !c.hasFeat('7'), 'and a feat has to be a string');

  // The car the shop repainted also has to come back painted.
  ok(U.tuned(carById('ranger'), c.modsFor('ranger')).accel > carById('ranger').accel,
    'and the restored car really is quicker than a stock one');
}

// ---------------------------------------------------------------- 8. Norm

group('Normand « Norm » Lafleur');
{
  const fs = await import('node:fs');
  const url = (u) => new URL('../' + u, import.meta.url);
  // The same file the browser fetches, read off disk. `loadMechanic` is written
  // so the fetch can be handed in, which is the only reason this is testable.
  const fake = (u) => Promise.resolve({ ok: true, json: () => JSON.parse(fs.readFileSync(url(u), 'utf8')) });

  // Before the file lands, the fallback has to be enough to run a shop.
  ok(U.NORM.greetings.length >= 3, 'the hardcoded fallback has him saying something');
  ok(U.NORM.work.some((w) => w.part === 'brakes'), 'and it covers every part the shop sells');

  await U.loadMechanic(fake);
  ok(/Lafleur/.test(U.NORM.name) && /\u00ab\s*Norm\s*\u00bb/.test(U.NORM.name),
    `he is ${U.NORM.name}`);
  ok(U.NORM.greetings.length >= 12, `${U.NORM.greetings.length} greetings`);
  ok(U.NORM.broke.length >= 8, `${U.NORM.broke.length} ways of saying you are broke`);
  ok(U.NORM.wrecked.length >= 8, `${U.NORM.wrecked.length} ways of saying you wrecked it`);
  ok(U.NORM.work.length >= 20, `${U.NORM.work.length} lines about the actual work`);
  ok(!/'/.test(U.NORM.greetings.join('')), 'and every apostrophe is the curly one');

  // A line for every part the shop can sell, or a part would fit in silence.
  for (const part of U.PARTS) {
    const line = U.normSay('work', 3, part.id);
    ok(line && line.length > 12, `${part.id}: « ${line} »`);
  }
  ok(U.normSay('work', 3, 'peinture').length > 12, 'and one for the paint');
  ok(U.normSay('work', 3, 'carrosserie').length > 12, 'and one for the bodywork');
  ok(U.normSay('greetings', 0) !== U.normSay('greetings', 1), 'two visits are two greetings');
  ok(U.normSay('greetings', 5) === U.normSay('greetings', 5), 'but one visit is one greeting');
  ok(U.BOARD.length >= 5, `${U.BOARD.length} jobs on the wall he will do and this game cannot model`);
  ok(F.RUMOURS.length >= 4, `${F.RUMOURS.length} legends he talks about that you can never own`);
  ok(F.RUMOURS.every((r) => r.length > 80), 'and each of them is a story, not a name');
  ok(!F.RUMOURS.some((r) => F.FAMOUS_IDS.some((id) => r.includes(id))),
    'none of which is a car this game would let you earn');

  // The driveline part exists because the writers gave us a clutch and a Posi.
  const tr = U.partById('transmission');
  ok(tr && tr.levels.length === 2, 'the driveline is two levels: a clutch, then a Posi');
  ok(/[Ee]mbrayage/.test(tr.levels[0].label) && /Posi/.test(tr.levels[1].label),
    `« ${tr.levels[0].label} » then « ${tr.levels[1].label} »`);
  const rangerT = U.tuned(carById('ranger'), { transmission: 2 });
  ok(rangerT.accel > carById('ranger').accel, 'a Posi and a clutch launch harder');
  ok(rangerT.hbYaw > carById('ranger').hbYaw, 'and the back end comes round on purpose');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
