// Stuck, and fixed, are two different bills:  node tools/smoke_tow.mjs
//
// Thomas, 2026-09-07, after Continue dropped him inside a house: a free way
// back onto the road, and a paid tow that also fixes the car, dearer than the
// garage. What this protects:
//   1. the free reset never costs, never repairs, and leaves a building
//   2. the free reset prefers lastSafe when lastSafe is real and far enough
//   3. on a fresh load lastSafe is the spawn, so T must still move you
//   4. the tow costs more than any garage for every damage value
//   5. broke, the tow still comes: fixed, nothing taken, the fee on the slate (A-01)
//   6. settleSpawn moves a save that loaded inside a house and leaves a kerb alone
//   7. Y in a borrowed vehicle (the cart, a bike, the Civic loaner) brings YOUR
//      vehicle back, not the borrowed one (plan v2 B-01a)
import {
  towCost, stuckReason, resetSpot, freeReset, callTow, settleSpawn, STUCK_FAR, MIN_MOVE,
  STUCK, newStuckWatch, stuckStep,
  ownVehicleId, isBorrowed, ownVehicleStatus, returnToOwnVehicle, towLine, jobVehicle,
} from '../src/game/tow.js';
import { carById } from '../src/game/cars.js';
import { homeParked } from '../src/game/save.js';
import { repairCost, REPAIR, DAMAGE } from '../src/game/damage.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// A world with one road along x = 0 (north-south) and one house at 20..30, 20..30.
const world = {
  roadAt: (x, z) => Math.abs(x) <= 4,
  nearestRoad: (x, z) => ({ x: 0, z, yaw: 0, name: 'Chemin Fraser', dist: Math.abs(x) }),
  buildingAt: (x, z, pad = 0) => x >= 20 - pad && x <= 30 + pad && z >= 20 - pad && z <= 30 + pad,
  waterAt: (x, z) => x < -100,
};
function fakeVeh(x, z, damage = 0) {
  const v = {
    x, z, yaw: 1, damage, spec: { id: 'ranger' }, lastSafe: { x, z, yaw: 1 },
    resets: 0, repaired: 0,
    reset(nx, nz, yaw) { this.x = nx; this.z = nz; this.yaw = yaw; this.resets++; this.lastSafe = { x: nx, z: nz, yaw }; },
    repair() { this.damage = 0; this.repaired++; },
    recover() { this.reset(this.lastSafe.x, this.lastSafe.z, this.lastSafe.yaw); },
  };
  return v;
}
function fakeWallet(v) {
  return { value: v, can(c) { return this.value >= c; }, spend(c) { if (!this.can(c)) return false; this.value -= c; return true; } };
}
// day 0's free tow already used: these check the paid flatbed (A-01 free tow is checked in smoke_jobready).
const mkG = (veh, money) => ({ veh, world, wallet: fakeWallet(money), day: 0, towFreeDay: 0, health: {}, repair: { t: 3, key: 'gas' }, repairHints: { h25: true, h60: true } });

group('stuckReason');
ok(stuckReason(world, 25, 25) === 'building', 'inside the house is « building »');
ok(stuckReason(world, -200, 0) === 'water', 'in the river is « water »');
ok(stuckReason(world, STUCK_FAR + 5, 0) === 'far', 'a field ' + (STUCK_FAR + 5) + ' m from the road is « far »');
ok(stuckReason(world, 2, 0) === null, 'on the road is fine');
ok(stuckReason(world, 6, 0) === null, 'a kerb spot 6 m out is fine (that is where cars park)');

group('the free reset');
{
  const v = fakeVeh(25, 25, 40);
  const G = mkG(v, 10);
  const r = freeReset(G);
  ok(r.ok && r.cost === 0, 'costs nothing');
  ok(G.wallet.value === 10, 'and the wallet agrees');
  ok(v.damage === 40 && v.repaired === 0, 'does not touch the damage');
  ok(world.roadAt(v.x, v.z) && !world.buildingAt(v.x, v.z), 'lands on the road, out of the house', `${v.x},${v.z}`);
  ok(Math.abs(v.z - 25) < 1e-9, 'the nearest road point, not somewhere across town');
  ok(r.name === 'Chemin Fraser', 'says which street');
  ok(v.lastSafe.x === v.x && v.lastSafe.z === v.z, 'lastSafe is now the road point');
}
{
  // Fresh load: lastSafe IS the spawn (that is what reset() does). T has to move you anyway.
  const v = fakeVeh(25, 25, 0);
  const s = resetSpot(world, v);
  ok(s && world.roadAt(s.x, s.z), 'on a fresh load, lastSafe == here, so T still goes to the road');
}
{
  // Off a jump into the field: lastSafe is a real road point far enough away. Use it.
  const v = fakeVeh(12, 80, 0);
  v.lastSafe = { x: 1, z: 40, yaw: 0.5 };
  const s = resetSpot(world, v);
  ok(s && s.x === 1 && s.z === 40 && s.yaw === 0.5, 'a real lastSafe, ' + MIN_MOVE + '+ m away, wins over the nearest road');
  v.x = 3; v.z = 80; v.lastSafe = { x: 1, z: 79, yaw: 0.5 };   // road, but you are basically there
  const s2 = resetSpot(world, v);
  ok(s2 && s2.x === 0, 'a lastSafe within ' + MIN_MOVE + ' m is not a reset; nearest road instead');
  v.lastSafe = { x: 25, z: 25, yaw: 0 };             // lastSafe inside a building (never trust it)
  const s3 = resetSpot(world, v);
  ok(s3 && world.roadAt(s3.x, s3.z) && !world.buildingAt(s3.x, s3.z), 'a lastSafe inside a building is ignored');
}

group('the tow');
for (const d of [0, 1, 5, 25, 60, 90, DAMAGE.DEAD]) {
  ok(towCost(d) > repairCost(d), `tow at damage ${d} (${towCost(d)} $) costs more than the garage (${repairCost(d)} $)`);
}
ok(towCost(0) === REPAIR.TOW, 'an undamaged car still pays the call-out');
{
  const v = fakeVeh(25, 25, 50);
  const G = mkG(v, 500);
  const cost = towCost(50);
  const r = callTow(G);
  ok(r.ok && r.cost === cost, 'paid ' + cost + ' $');
  ok(G.wallet.value === 500 - cost, 'the wallet is lighter by exactly that');
  ok(v.damage === 0 && v.repaired === 1, 'the car is fixed');
  ok(G.health.ranger === 0, 'the saved health is fixed too');
  ok(G.repair.key === null && G.repair.t === 0, 'a half-done garage repair is cancelled');
  ok(!G.repairHints.h25 && !G.repairHints.h60, 'the nag resets');
  ok(world.roadAt(v.x, v.z) && !world.buildingAt(v.x, v.z), 'and it is on the road');
}
{
  const v = fakeVeh(25, 25, 50);
  const G = mkG(v, 20);
  const r = callTow(G);
  ok(r.ok && !r.paid, 'broke: towed anyway, not a dead end');
  ok(G.wallet.value === 20 && v.damage === 0 && G.towDebt === r.cost, 'takes nothing now, fixes it, and the fee is owed');
}

group('settleSpawn');
{
  const v = fakeVeh(25, 25, 30);
  const r = settleSpawn({ veh: v, world });
  ok(r.moved && r.reason === 'building', 'a save that loaded inside a house is moved');
  ok(world.roadAt(v.x, v.z), 'to the road');
  ok(v.damage === 30, 'for free, damage intact');
}
{
  const v = fakeVeh(6, 40, 0);       // the kerb in front of the house: 6 m out, no building
  v.lastSafe = { x: 6, z: 40, yaw: 1 };
  const r = settleSpawn({ veh: v, world });
  ok(!r.moved && v.x === 6 && v.resets === 0, 'a kerb spawn is left exactly where it was');
  ok(v.lastSafe.x === 0 && v.lastSafe.z === 40, 'but lastSafe becomes the road, so T works on the first press');
}

group('the stuck offer: only when you are actually stuck (review 6 Oct 2026)');
{
  const run = (G, secs, each) => { const s = newStuckWatch(); let on = 0;
    for (let i = 0; i < secs * 60; i++) { if (each) each(G, i / 60); stuckStep(s, G, 1 / 60); if (s.on) on++; }
    return { s, onSecs: on / 60 }; };
  const drive = (x, z, kmh, inp = {}) => ({ mode: 'drive', world, veh: { x, z, yaw: 0, speedKmh: kmh, roll: 0, pitch: 0 },
    input: { throttle: 0, brake: 0, handbrake: false, ...inp } });

  ok(run(drive(0, 0, 50, { throttle: 1 }), 20).onSecs === 0, 'driving down the road: no offer');
  ok(run(drive(0, 0, 0), 60).onSecs === 0, 'parked at a light for a minute: no offer');
  ok(run(drive(STUCK_FAR + 30, 0, 0, { throttle: 0 }), 20).onSecs === 0, 'parked on a lawn far from the road: no offer');
  {
    const r = run(drive(2, 0, 0.5, { throttle: 1 }), 6);
    ok(r.s.on && r.s.why === 'pinned', `nose in a wall, W held: offered after ${STUCK.pinnedAfter} s`, r.s.why);
    ok(Math.abs(r.onSecs - (6 - STUCK.pinnedAfter)) < 0.1, `not before (${r.onSecs.toFixed(2)} s shown of 6)`);
  }
  ok(run(drive(2, 0, 0.5, { throttle: 1, handbrake: true }), 10).onSecs === 0, 'revving on the handbrake is not stuck');
  ok(run({ ...drive(2, 0, 0.5, { throttle: 1 }), fuel: 0 }, 10).onSecs === 0, 'an empty tank is a jerrycan problem, not a reset');
  ok(run(drive(25, 25, 0), 3).s.why === 'building', 'inside a house: offered');
  {
    // A footprint that overlaps the asphalt (Principale, 6 Oct capture) is not « in a house ».
    const G = drive(0, 0, 0); G.world = { ...world, buildingAt: () => true };
    ok(run(G, 5).onSecs === 0, 'on the road under a stray footprint: no offer');
  }
  ok(run(drive(-200, 0, 0), 3).s.why === 'water', 'in the river: offered');
  {
    const G = drive(0, 0, 0); G.veh.roll = 1.6;
    ok(run(G, 3).s.why === 'flipped', 'on its roof: offered');
  }
  {
    // Wedged, then backs out and drives away: the offer goes, not before minShow.
    const G = drive(2, 0, 0.5, { throttle: 1 });
    const r = run(G, 10, (g, t) => { if (t > 4) { g.veh.speedKmh = 30; g.veh.z = (t - 4) * 8; } });
    ok(!r.s.on, 'drives off: the offer clears');
    ok(r.onSecs >= STUCK.minShow - 0.05, `after at least ${STUCK.minShow} s on screen (${r.onSecs.toFixed(2)})`);
  }
  ok(run({ ...drive(2, 0, 0.5, { throttle: 1 }), mode: 'menu' }, 10).onSecs === 0, 'never in a menu');
}

group('Y in a borrowed vehicle brings your own back (B-01a)');
{
  const SPECS = {
    ranger: carById('ranger'), cart: carById('cart'), civic: carById('civic'), forester: carById('forester'),
    dbike: { id: 'dbike', name: 'Diamondback Sorrento', who: 'Yours', style: 'bike', twoWheel: true },
    cutlass: carById('cutlass'),
  };
  const mk = (id, x, z, damage = 0) => {
    const v = fakeVeh(x, z, damage); v.spec = SPECS[id]; return v;
  };
  const mkY = (id, { money = 500, character = 'tom', rangerAt = { x: 0, z: 2000, yaw: 0 }, rangerDamage = 0 } = {}) => {
    const G = mkG(mk(id, 10, 300, 40), money);
    G.character = character;
    G.parked = { ranger: { ...rangerAt } };
    G.health = { ranger: rangerDamage };
    G.carId = id;
    G.swapCar = (to) => {
      const v = G.veh, spot = G.parked[to];
      if (!spot) return;
      G.health[v.spec.id] = v.damage;
      G.parked[v.spec.id] = { x: v.x, z: v.z, yaw: v.yaw };
      delete G.parked[to];
      G.carId = to; G.veh = mk(to, spot.x, spot.z, G.health[to] || 0); G.veh.yaw = spot.yaw;
    };
    return G;
  };
  ok(ownVehicleId({ character: 'tom' }) === 'ranger', 'Tom’s own vehicle is the Ranger');
  ok(ownVehicleId({ character: 'zahra' }) === 'dbike', 'Zahra’s is her bike');
  ok(ownVehicleId({}) === 'ranger' && ownVehicleId({ ownCarId: 'saturn' }) === 'saturn', 'no character: the Ranger; main.js may name another');
  let held = 0;
  for (const id of ['cart', 'dbike', 'civic']) {
    const G = mkY(id, { rangerDamage: 30 });
    ok(isBorrowed(G), `the ${id} is borrowed`);
    const st = ownVehicleStatus(G);
    ok(st.id === 'ranger' && !st.inOwn && st.borrowed && st.at && st.at.z === 2000 && st.dist > 1500,
      `ownVehicleStatus in the ${id}: Ranger ${Math.round(st.dist)} m away`, JSON.stringify(st));
    const r = returnToOwnVehicle(G, 'tow');
    const good = r.ok && r.swapped && G.veh.spec.id === 'ranger' && r.from === id && r.to === 'ranger';
    if (good) held++;
    ok(good, `Y in the ${id}: you are in the Ranger`, JSON.stringify(r));
    ok(Math.hypot(G.veh.x - 10, G.veh.z - 300) < 40 && world.roadAt(G.veh.x, G.veh.z), 'brought to the road next to you, not you sent to it');
    ok(Math.hypot(G.veh.x - G.parked[id].x, G.veh.z - G.parked[id].z) >= 5 || !!homeParked()[id], 'not parked on top of what you were in');
    ok(G.veh.damage === 0 && G.health.ranger === 0, 'and the Ranger comes fixed');
    ok(r.cost === towCost(30) && G.wallet.value === 500 - towCost(30), `for the flatbed price (${r.cost} $)`);
    const home = homeParked()[id];
    if (home) ok(Math.hypot(G.parked[id].x - home.x, G.parked[id].z - home.z) < 1, `the ${id} goes home on the flatbed`);
    ok(/Ranger/.test(towLine(r)) && !/cart|Civic|vélo/i.test(towLine(r).split('\n')[0]), `the toast names the Ranger: « ${towLine(r).replace(/\n/g, ' / ')} »`);
    ok(ownVehicleStatus(G).inOwn, 'and the status says so');
  }
  ok(held === 3, `${held} of 3: the cart, a bike and the Civic loaner each return the Ranger`);
  console.log(`  B01A_TOW ${held}/3`);
  {
    const G = mkY('ranger');
    G.veh.x = 25; G.veh.z = 25;
    const r = returnToOwnVehicle(G, 'tow');
    ok(r.ok && !r.swapped && G.veh.spec.id === 'ranger' && G.veh.repaired === 1, 'in your own Ranger: the plain flatbed, as before');
  }
  {
    const G = mkY('cart'); delete G.parked.ranger;
    const r = returnToOwnVehicle(G, 'tow');
    ok(r.ok && G.veh.spec.id === 'ranger', 'the Ranger not parked anywhere: the flatbed still brings it');
  }
  {
    const G = mkY('dbike', { character: 'zahra' });
    const r = returnToOwnVehicle(G, 'tow');
    ok(!r.swapped && G.veh.spec.id === 'dbike', 'Zahra on her own bike: her bike, fixed where she is');
  }
  {
    const G = mkY('cart');
    G.mission = { def: { id: 'golfcart' }, cameIn: 'dbike' };
    ok(jobVehicle(G), 'a live job put you in the cart');
    const r = returnToOwnVehicle(G, 'tow');
    ok(r.ok && !r.swapped && G.veh.spec.id === 'cart', 'Y mid-job tows the job’s cart, it does not end the job for you');
  }
  {
    const G = mkY('cutlass');
    ok(!isBorrowed(G), 'a car you bought off the lot is yours: Y tows it');
    G.ownsCar = (id) => id !== 'cutlass';
    ok(isBorrowed(G), 'unless main.js’s garage says otherwise');
  }
  {
    const G = mkY('civic', { money: 5 });
    G.towFreeDay = G.day;
    const r = returnToOwnVehicle(G, 'tow');
    ok(r.ok && r.swapped && !r.paid && G.towDebt === r.cost, 'broke: the Ranger still comes, on the slate');
  }
  {
    const G = mkY('cart'); G.towFreeDay = -1;
    const r = returnToOwnVehicle(G, 'tow');
    ok(r.free && r.cost === 0, 'first flatbed of the day: free');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
