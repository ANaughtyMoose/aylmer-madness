// One owner table (game/homes.js), the E offer beside a parked car, and the
// wreck tow (tow.towHome). Architecture review F2 + the first-run « acheter la
// Saturn · 0 $ » prompt.
//
//   node tools/smoke_homes.mjs
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  — ' + extra : '')); }
};

// Everything main.js imports that registers cars: the buses and bikes, the
// famous cars, and Sara Fortier's SVX (fortier.js pulls in fortiercars.js).
const { CARS, carById } = await import('../src/game/cars.js');
await import('../src/game/vehicles.js');
await import('../src/game/famouscars.js');
await import('../src/game/fortiercars.js');
const { PLACES } = await import('../src/game/places.js');
const { Garage, UNLOCKS } = await import('../src/game/garage.js');
const homes = await import('../src/game/homes.js');
const tow = await import('../src/game/tow.js');
const { REPAIR } = await import('../src/game/damage.js');

console.log('every car has a home');
{
  const missing = CARS.map((c) => c.id).filter((id) => !homes.OWNER[id]);
  ok(missing.length === 0, `all ${CARS.length} CARS ids have an owner`, missing.join(', '));
  ok(homes.OWNER.svx === 'heritage', 'the SVX goes back to the Héritage lot (F2: it had no owner)');
  const noPlace = CARS.map((c) => c.id).filter((id) => !PLACES[homes.homeKey(id)]);
  ok(noPlace.length === 0, 'every owner is a real place', noPlace.join(', '));
  ok(homes.homeKey('cutlass') === 'home', 'a bought beater comes home with you');
  ok(homes.homeOf(PLACES, 'no-such-car') === PLACES.home, 'an unknown car still has somewhere to go');
}

console.log('the next kerb slot');
{
  ok(homes.nextFreeSlot({}, 'ranger', 'saturn') === 1, 'your own car holds slot 0 at 299 Fraser');
  ok(homes.nextFreeSlot({ dbike: {} }, 'ranger', 'saturn') === 2, '...and every car already parked there counts');
  ok(homes.nextFreeSlot({ dbike: {} }, 'civic', 'sunfire') === 0, 'another address starts at 0');
}

console.log('what E offers beside a parked car');
{
  const g = new Garage(new Set(), 'tom');
  ok(homes.offerFor(g, 'saturn', new Set()) === null,
    'the Saturn before « Ramasser la gang » offers nothing (it used to be « acheter · 0 $ »)');
  ok(homes.offerFor(g, 'ranger', new Set()) === 'take', 'your Ranger is yours to take');
  ok(homes.offerFor(g, 'cutlass', new Set()) === 'buy', 'the Cutlass on the lot is for sale');
  ok(homes.offerFor(g, 'bus', new Set()) === 'buy', 'the job-gated bus still shows its price and why not');
  ok(homes.offerFor(g, 'saturn', new Set(['gang'])) === 'take', 'after « Ramasser la gang » Margaret lends it');
  for (const id of Object.keys(UNLOCKS)) {
    if (homes.offerFor(g, id, new Set()) === 'buy') ok(g.cost(id) > 0, `${id}: a buy offer always has a price`);
  }
  const parked = { saturn: { x: 0, z: 0 }, cutlass: { x: 5, z: 0 } };
  const seen = homes.offerableParked(parked, g, new Set());
  ok(!seen.saturn && !!seen.cutlass, 'offerableParked drops the locked Saturn and keeps the lot');
}

console.log('the wreck tow');
{
  // A fake world with a road everywhere, no buildings.
  const world = {
    nearestRoad: (x, z) => ({ x: Math.round(x), z: Math.round(z), yaw: 0, dist: 0, name: 'chemin test' }),
    roadAt: () => true, buildingAt: () => false, waterAt: () => false,
    groundAt: () => ({ h: 0 }),
  };
  const wallet = { value: 500, can(c) { return this.value >= c; }, spend(c) { if (!this.can(c)) return false; this.value -= c; return true; } };
  for (const id of ['svx', 'ranger', 'cart']) {
    const spec = carById(id);
    ok(!!spec, `${id} is registered`);
    const veh = {
      spec, x: 9999, z: 9999, damage: 100,
      reset(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; },
      repair() { this.damage = 0; },
    };
    // day 0's free tow already used (A-01: the first tow of each day is free).
    const G = { veh, world, wallet, day: 0, towFreeDay: 0, health: { [id]: 100 }, repair: { t: 3, key: 'gas' }, repairHints: { h25: true, h60: true } };
    const before = wallet.value;
    let r = null, threw = null;
    try { r = tow.towHome(G, homes.homeOf(PLACES, id), { fee: REPAIR.TOW }); } catch (e) { threw = e; }
    ok(!threw, `${id}: wrecking it does not throw`, threw && threw.message);
    if (!r) continue;
    const home = homes.homeOf(PLACES, id);
    ok(veh.damage === 0 && G.health[id] === 0, `${id}: fixed`);
    ok(Math.hypot(veh.x - home.x, veh.z - home.z) < 2, `${id}: towed to ${homes.homeKey(id)}`);
    ok(r.paid && before - wallet.value === REPAIR.TOW, `${id}: charged the flat ${REPAIR.TOW} $`);
    ok(G.repair.key === null && !G.repairHints.h25, `${id}: repair state reset`);
    ok(veh.lastSafe && veh.lastSafe.x === veh.x, `${id}: lastSafe is the new road spot, not the crash`);
  }
  // Broke: still towed, not charged; the fee goes on the slate (A-01).
  const poor = { value: 3, can(c) { return this.value >= c; }, spend() { return false; } };
  const veh = { spec: carById('ranger'), x: 0, z: 0, damage: 100, reset(x, z) { this.x = x; this.z = z; }, repair() { this.damage = 0; } };
  const PG = { veh, world, wallet: poor, day: 0, towFreeDay: 0 };
  const r = tow.towHome(PG, null);
  ok(r.ok && !r.paid && veh.damage === 0 && poor.value === 3, 'broke: towed and fixed anyway, nothing charged');
  ok(PG.towDebt === REPAIR.TOW && r.debt === REPAIR.TOW, 'broke: the fee is on the slate, not a dead end');
}

console.log('unsold beaters start on the used lot');
{
  const save = await import('../src/game/save.js');
  const BEATERS = ['cutlass', 'caravan', 'bus', 'benz'];
  const disagree = Object.keys(save.OWNER).filter((id) => homes.OWNER[id] && homes.OWNER[id] !== save.OWNER[id]);
  ok(disagree.length === 0, 'save.js and homes.js agree on every shared owner', disagree.join(', '));
  const home = save.homeParked();
  const fresh = save.newSave();
  const missing = save.normalizeSave({ parked: {} }, 'tom.1');
  const invalid = save.normalizeSave({ parked: Object.fromEntries(BEATERS.map((id) => [id, { x: NaN, z: 1, yaw: 0 }])) }, 'tom.1');
  const sameSpot = (a, b) => !!a && !!b && ['x', 'z', 'yaw'].every((key) => Math.abs(a[key] - b[key]) < 1e-9);
  BEATERS.forEach((id, i) => {
    ok(save.OWNER[id] === 'usedlot' && homes.OWNER[id] === 'usedlot', `${id} belongs to the used lot in both owner tables`);
    const lot = homes.lotSpot(PLACES.usedlot, i);
    ok(sameSpot(home[id], lot), `${id} is in lot slot ${i}, including heading`);
    ok(Math.hypot(home[id].x - PLACES.home.x, home[id].z - PLACES.home.z) > 100, `${id} is away from the home driveway`);
    ok(sameSpot(fresh.parked[id], lot), `a new save starts ${id} on the lot`);
    ok(sameSpot(missing.parked[id], lot), `a missing saved ${id} spot falls back to the lot`);
    ok(sameSpot(invalid.parked[id], lot), `an invalid saved ${id} spot falls back to the lot`);
  });
  // Loading a bought or moved car must respect its saved position.
  const moved = { x: 111, z: -222, yaw: 1.25 };
  const restored = save.normalizeSave({ parked: { benz: moved }, unlocks: { owned: ['ranger', 'benz'] } }, 'tom.1');
  ok(sameSpot(restored.parked.benz, moved), 'a bought beater keeps its saved position');
  ok(sameSpot(home.ranger, homes.curbSpot(PLACES.home, 0)), 'the Ranger keeps its home curb fallback');
  ok(sameSpot(home.saturn, homes.curbSpot(PLACES.home, 1)), 'the Saturn keeps its separate home curb fallback');
}

console.log('main.js uses the one table');
{
  const MAIN = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok(!/const OWNER\s*=/.test(MAIN), 'main.js no longer declares its own OWNER');
  ok(!/PLACES\[OWNER\[/.test(MAIN), 'no raw PLACES[OWNER[id]] dereference left');
  ok(/tow\.towHome\(/.test(MAIN), 'the wreck goes through tow.towHome');
  ok(/from '\.\/game\/homes\.js'/.test(MAIN), 'main.js imports game/homes.js');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
