// Progression smoke test:  node tools/smoke_garage.mjs
//
// The unlock rules, the used lot, the wallet gate, the localStorage round-trip
// and the save-slot serialise/restore pair — plus the thing that makes the whole
// economy work: every job has to pay something.
//
// No browser: localStorage is a twelve-line stub.

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
const { Garage, UNLOCKS, FOR_SALE, START_CAR } = await import('../src/game/garage.js');
const { MISSIONS, missionPayout } = await import('../src/game/missions.js');
const { PLACES, resolvePlaces } = await import('../src/game/places.js');
const { Wallet, START } = await import('../src/game/money.js');
const { KEYS, readJSON, clearGarage } = await import('../src/game/store.js');
const { STYLES, CKOI_TRACKS, STATION_NAMES } = await import('../src/game/radio.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const fresh = () => { localStorage.clear(); return new Garage(new Set()); };

// ---------------------------------------------------------------- 1. rules

group('unlock rules');
{
  const g = fresh();
  ok(g.unlocked().length === 1 && g.unlocked()[0] === START_CAR,
    'you start with the Ranger and nothing else', JSON.stringify(g.unlocked()));
  for (const c of CARS) ok(!!UNLOCKS[c.id], `${c.id} has an unlock rule`);
  ok(CARS.every((c) => c.sound && c.drive), 'every car has a sound profile and a gearbox');

  // The three lent cars, each behind its own job.
  const lent = [['saturn', 'gang', 'Margaret'], ['civic', 'poutine', 'Sayyad'], ['sunfire', 'curfew', 'Dave']];
  for (const [id, mission, who] of lent) {
    const done = new Set();
    ok(!g.has(id, done), `${id} is locked before « ${mission} »`);
    ok(/\S/.test(g.reason(id, done) || ''), `${id} says what you have to do: ${g.reason(id, done)}`);
    done.add(mission);
    ok(g.has(id, done), `${id} unlocks when « ${mission} » is finished`);
    ok(UNLOCKS[id].who === who, `${id} is ${who}'s`);
    ok((UNLOCKS[id].toast || '').includes(who), `${id}'s toast names ${who}`, UNLOCKS[id].toast);
  }
  // One job does not unlock somebody else's car.
  ok(!g.has('civic', new Set(['gang'])), 'the gang job does not hand you the Civic');
  ok(!g.has('cutlass', new Set(MISSIONS.map((m) => m.id))), 'finishing everything does not gift you the lot');
}

// ---------------------------------------------------------------- 2. the lot

group('the used lot');
{
  ok(!!PLACES.usedlot, 'PLACES.usedlot exists');
  resolvePlaces({ nearestRoad: () => null });
  const d = Math.hypot(PLACES.usedlot.x - PLACES.ctire.x, PLACES.usedlot.z - PLACES.ctire.z);
  ok(d < 250, `the lot is ${d.toFixed(0)} m from the Canadian Tire`);
  ok((PLACES.usedlot.street || '').includes('Aylmer'), `and it is on ${PLACES.usedlot.street}`);
  ok(FOR_SALE.length === 4, `four cars for sale: ${FOR_SALE.join(', ')}`);

  const g = fresh();
  const w = new Wallet(null);
  w.set(1000);
  const prices = { cutlass: 300, cavalier: 450, caravan: 250, bus: 1500 };
  for (const id of FOR_SALE) ok(g.cost(id) === prices[id], `${id} costs $${g.cost(id)}`);

  // Too poor.
  w.set(100);
  let r = g.buy('cutlass', w, new Set());
  ok(!r.ok && /manque 200/.test(r.why), `a hundred bucks does not buy the Cutlass: « ${r.why} »`, r.why);
  ok(!g.canBuy('cutlass', w, new Set()).ok, 'canBuy says no without spending anything');
  ok(w.value === 100, 'and the wallet was not touched');
  ok(!g.has('cutlass'), 'and it is still on the lot');

  // Rich enough.
  w.set(320);
  r = g.buy('cutlass', w, new Set());
  ok(r.ok, 'three hundred and twenty does');
  ok(w.value === 20, `the wallet went 320 -> ${w.value}`);
  ok(g.has('cutlass'), 'and the Cutlass is yours');
  ok(g.forSale().length === 3, 'three left on the lot');

  // Buying it twice is free and harmless.
  r = g.buy('cutlass', w, new Set());
  ok(r.ok && w.value === 20, 'buying it again does not charge you twice');

  // The bus needs ten jobs, whatever the wallet says.
  w.set(5000);
  const few = new Set(['gang', 'poutine']);
  r = g.buy('bus', w, few);
  ok(!r.ok, 'the bus is not for sale after two jobs', r.why);
  ok(w.value === 5000, 'and the money stays put');
  ok(/10/.test(g.reason('bus', few)), `the reason counts them: ${g.reason('bus', few)}`);
  ok(/8/.test(g.canBuy('bus', w, few).why), `and so does the prompt at the lot: « ${g.canBuy('bus', w, few).why} »`);
  const ten = new Set(MISSIONS.slice(0, 10).map((m) => m.id));
  ok(ten.size >= 10, `there are ${MISSIONS.length} jobs, so ten is reachable`);
  r = g.buy('bus', w, ten);
  ok(r.ok && w.value === 3500, `after ten jobs it sells, for $1500 (wallet ${w.value})`);
}

// ---------------------------------------------------------------- 3. saving

group('persistence');
{
  localStorage.clear();
  const w = new Wallet(null); w.set(2000);
  const a = new Garage(new Set());
  a.buy('caravan', w, new Set());
  a.buy('cavalier', w, new Set());
  const raw = readJSON(KEYS.cars, null);
  ok(raw && Array.isArray(raw.bought), `aylmer.cars holds ${JSON.stringify(raw.bought)}`);

  // A fresh Garage in a fresh session sees the same cars.
  const b = new Garage(new Set());
  ok(b.has('caravan') && b.has('cavalier'), 'a reload keeps what you bought');
  ok(!b.has('bus'), 'and not what you did not');

  // Save slots: serialize / restore instead of the localStorage key.
  const snap = JSON.parse(JSON.stringify(a.serialize()));
  const c = new Garage(new Set());
  c.reset();
  ok(!c.has('caravan'), 'reset clears the lot purchases');
  c.restore(snap);
  ok(c.has('caravan') && c.has('cavalier'), 'restore() puts a save slot back');
  ok(JSON.stringify(c.serialize().bought.slice().sort()) === JSON.stringify(snap.bought.slice().sort()),
    'serialize -> restore -> serialize round-trips');
  c.restore({ bought: ['not-a-car', 'bus'], seen: 7 });
  ok(c.has('bus') && !c.bought.has('not-a-car'), 'and a hand-edited save cannot invent cars');

  // The toast only fires once.
  const d = new Garage(new Set());
  d.reset();
  const done = new Set(['gang']);
  const first = d.newlyUnlocked(done);
  ok(first.length === 1 && first[0].id === 'saturn', 'the Saturn is announced once');
  ok(d.newlyUnlocked(done).length === 0, 'and not again');
  ok(d.newlyUnlocked(new Set(['gang', 'poutine'])).length === 1, 'but the next job announces the next car');

  clearGarage();
  ok(readJSON(KEYS.cars, null) === null, 'wiping the progress wipes the cars');
}

// ---------------------------------------------------------------- 4. economy

group('economy');
{
  ok(MISSIONS.length >= 10, `${MISSIONS.length} jobs`);
  let total = 0;
  for (const def of MISSIONS) {
    // Both variants: the Ranger's bench seats two, everything else seats more.
    const bench = missionPayout(def, { seats: 2, carId: 'ranger' });
    const wide = missionPayout(def, { seats: 6, carId: 'caravan' });
    ok(bench > 0, `${def.id} pays $${bench} net in the Ranger`);
    ok(wide > 0, `${def.id} pays $${wide} net in the van`);
    ok(bench >= 15 && bench <= 40, `${def.id}'s payout is in the $15-40 band`, String(bench));
    total += bench;
  }
  ok(total >= 200, `a clean sweep of every job is $${total} on top of the $${START} you start with`);
  ok(total + START >= 300, 'which is a Cutlass');
  ok(total + START < 1500, 'and nowhere near a bus, which is the point of the bus');
}

// ---------------------------------------------------------------- 5. cars

group('the new cars');
{
  for (const id of FOR_SALE) {
    const c = carById(id);
    ok(c.id === id, `${id} is in CARS`);
    ok(c.len > 0 && c.wid > 0 && c.h > 0 && c.wheelbase > 0, `${id} has real dimensions`);
    ok(c.top.length >= 4 && c.plan.length >= 4 && c.belt.length >= 2, `${id} has a body to loft`);
    ok(c.sound.cyl === 4 || c.sound.cyl === 6, `${id} is a ${c.sound.cyl}`);
    ok(c.drive.gears.length >= 3, `${id} has ${c.drive.gears.length} gears`);
    ok(c.flavour && c.flavour.length > 20, `${id} has something to say for itself`);
  }
  ok(carById('caravan').seats >= 6, 'the Caravan seats seven, so the gang goes in one trip');
  ok(carById('bus').seats >= 39, 'the bus seats forty');
  ok(carById('bus').len > 10, `and it is ${carById('bus').len} m long`);

  // The gang job re-plans itself for the seats it is given.
  const gang = MISSIONS.find((m) => m.id === 'gang');
  const inRanger = gang.build({ carId: 'ranger', carName: 'Ranger', seats: 2 });
  const inVan = gang.build({ carId: 'caravan', carName: 'Caravan', seats: 6 });
  ok(inRanger.length > inVan.length, `two trips in the Ranger (${inRanger.length} stages), one in the van (${inVan.length})`);
  const inBus = gang.build({ carId: 'bus', carName: 'Orion', seats: 39 });
  ok(inBus[0].at === 'principale', 'the bus does not go down Bancroft — Marc walks to Principale');
  ok(inRanger[0].at === 'marc', 'everything else picks him up at his door');
}

// ---------------------------------------------------------------- 6. radio

group('radio');
{
  ok(STYLES.length >= 3, `${STYLES.length} styles: ${STYLES.map((s) => s.name).join(', ')}`);
  ok(CKOI_TRACKS.length >= 4, `${CKOI_TRACKS.length} tracks on CKOI`);
  ok(CKOI_TRACKS.every((t) => STYLES.some((s) => s.id === t.style)), 'every track has a style to render');
  ok(CKOI_TRACKS.every((t) => t.seconds >= 90 && t.seconds <= 120), 'and they all run 90-120 s');
  ok(STATION_NAMES[0].startsWith('CKOI'), `station 0 is ${STATION_NAMES[0]}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
