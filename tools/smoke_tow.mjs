// Stuck, and fixed, are two different bills:  node tools/smoke_tow.mjs
//
// Thomas, 2026-09-07, after Continue dropped him inside a house: a free way
// back onto the road, and a paid tow that also fixes the car, dearer than the
// garage. What this protects:
//   1. the free reset never costs, never repairs, and leaves a building
//   2. the free reset prefers lastSafe when lastSafe is real and far enough
//   3. on a fresh load lastSafe is the spawn, so T must still move you
//   4. the tow costs more than any garage for every damage value
//   5. the tow refuses a broke player and takes nothing
//   6. settleSpawn moves a save that loaded inside a house and leaves a kerb alone
import {
  towCost, stuckReason, resetSpot, freeReset, callTow, settleSpawn, STUCK_FAR, MIN_MOVE,
} from '../src/game/tow.js';
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
const mkG = (veh, money) => ({ veh, world, wallet: fakeWallet(money), health: {}, repair: { t: 3, key: 'gas' }, repairHints: { h25: true, h60: true } });

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
  ok(!r.ok && r.broke, 'refused when you cannot pay');
  ok(G.wallet.value === 20 && v.damage === 50 && v.x === 25, 'takes nothing, fixes nothing, moves nothing');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
