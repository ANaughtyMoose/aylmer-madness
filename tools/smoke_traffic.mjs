// Ambient traffic keeps to the right. There was no suite for this, and the
// bug it would have caught shipped: cars steered straight at the far end of
// their road segment, so on every left-hand bend the chord ran through the
// oncoming lane (7 % of samples left of the centreline, 3.4 m out on rue
// Principale). What is pinned here is what a player sees from the driver's
// seat: a moving car, away from an intersection, sits in its own lane, points
// the way its lane goes, and a cyclist rides further right than a Caravan.
//
//   node tools/smoke_traffic.mjs

import { strict as assert } from 'node:assert';

let failed = 0;
const ok = (name, fn) => {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.message || e)); }
};

await import('../src/game/mapdata.js');
const { Traffic } = await import('../src/game/traffic.js');

// Two minutes of the ambient population around 299 Fraser, sampled three times
// a second once the spawn transient has settled. Mid-edge means at least 8 m
// from either node: inside an intersection the lane line is not where a real
// car goes either.
const t = new Traffic(80, 3);
const player = { x: 932.9, z: 143.9, spec: { wid: 1.8 }, nudge() {} };
const samples = [];
for (let i = 0; i < 60 * 120; i++) {
  t.update(1 / 60, player);
  if (i % 20 === 19 && i > 600) {
    for (const c of t.cars) {
      const e = t.edges[c.edge], A = t.nodes[e.a];
      const ex = c.x - A.x, ez = c.z - A.z;
      const s = ex * e.dx + ez * e.dz;
      const lat = ex * (-e.dz) + ez * e.dx;                 // + is the right-hand side
      const heading = Math.sin(c.yaw) * e.dx + Math.cos(c.yaw) * e.dz;
      samples.push({ c, e, s, lat, heading, mid: s > 8 && s < e.len - 8, moving: c.speed > 1.5 });
    }
  }
}

ok('T0 nothing went NaN and nobody reverses', () => {
  for (const c of t.cars) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.yaw), 'NaN car');
    assert.ok(c.speed >= 0, 'negative speed');
  }
  assert.ok(samples.length > 5000, `only ${samples.length} samples`);
});

ok('T1 a moving car mid-edge is never left of the centreline', () => {
  const mid = samples.filter((x) => x.mid && x.moving);
  assert.ok(mid.length > 2000, `only ${mid.length} mid-edge samples`);
  const wrong = mid.filter((x) => x.lat < 0.3);
  assert.equal(wrong.length, 0,
    `${wrong.length} of ${mid.length} samples left of centre, e.g. ${wrong.slice(0, 3).map((x) => `${x.c.spec.id} lat ${x.lat.toFixed(1)} on a ${x.e.cls}`).join('; ')}`);
});

ok('T2 …and within 1.2 m of its own lane line 99.5 % of the time', () => {
  const mid = samples.filter((x) => x.mid && x.moving);
  const off = mid.filter((x) => Math.abs(x.lat - x.e.off - (x.c.lane || 0)) > 1.2);
  assert.ok(off.length / mid.length < 0.005, `${off.length} of ${mid.length} samples off the lane line`);
});

ok('T3 the nose points the way the lane goes', () => {
  const mid = samples.filter((x) => x.mid && x.moving);
  const back = mid.filter((x) => x.heading < 0.9);
  assert.ok(back.length / mid.length < 0.005, `${back.length} of ${mid.length} samples more than 26° off the edge`);
});

ok('T4 cyclists ride further right than cars, and slower', () => {
  const bikes = samples.filter((x) => x.mid && x.moving && x.c.kind === 'bike');
  const cars = samples.filter((x) => x.mid && x.moving && !x.c.kind);
  assert.ok(bikes.length > 50, `only ${bikes.length} cyclist samples`);
  const mean = (xs) => xs.reduce((a, x) => a + (x.lat - x.e.off), 0) / xs.length;
  assert.ok(mean(bikes) > mean(cars) + 0.6, `bikes ${mean(bikes).toFixed(2)} vs cars ${mean(cars).toFixed(2)} beyond the lane`);
  assert.ok(bikes.every((x) => x.c.speed <= 5.5), 'a cyclist is doing car speeds');
});

ok('T5 the look-ahead target is on the lane line ahead, and rolls into the next edge', () => {
  const out = [0, 0];
  const c = t.cars.find((x) => x.speed > 3 && x.next >= 0 && !x.kind);
  assert.ok(c, 'no moving car with a chosen next edge');
  const e = t.edges[c.edge], A = t.nodes[e.a];
  t.aimAt(c, e, out);
  const d = Math.hypot(out[0] - c.x, out[1] - c.z);
  assert.ok(d > 3 && d < 20, `aim ${d.toFixed(1)} m away`);
  // Park the car 1 m short of the end: the aim must now lie on the NEXT edge's lane.
  const probe = { ...c, x: A.x + e.dx * (e.len - 1), z: A.z + e.dz * (e.len - 1) };
  t.aimAt(probe, e, out);
  const n = t.edges[c.next], N = t.nodes[n.a];
  const nx = out[0] - N.x, nz = out[1] - N.z;
  const along = nx * n.dx + nz * n.dz, lat = nx * (-n.dz) + nz * n.dx;
  assert.ok(along > 0 && along <= n.len + 0.01, `aim is ${along.toFixed(1)} m along the next edge`);
  assert.ok(Math.abs(lat - n.off) < 0.05, `aim sits ${lat.toFixed(2)} m right, lane is ${n.off}`);
});

// ---------------------------------------------------------------- S3-CRASH
// A hit car slides and spins (Midtown), a near miss or your horn makes one
// jink away and honk, and the arterials respawn closer in.
const { carById, Vehicle } = await import('../src/game/cars.js');
const TR = await import('../src/game/traffic.js');
const lateral = (c) => {
  const e = t.edges[c.edge], A = t.nodes[e.a];
  return (c.x - A.x) * (-e.dz) + (c.z - A.z) * e.dx - e.off - (c.lane || 0);
};
const left = (x) => { const e = t.edges[x.edge], A = t.nodes[e.a]; return e.len - ((x.x - A.x) * e.dx + (x.z - A.z) * e.dz); };
const fresh = () => t.cars.find((x) => !x.kind && x.speed > 4 && x.stunT <= 0 && x.swerveT <= 0 && !(x.swerveCool > 0) && left(x) > 35);
const still = (x, z) => ({ x, z, yaw: 0, spec: { wid: 1.8 } });   // no mass, no vx: touches nothing

ok('T6 a T-bone at 50 km/h spins the car and slides it, then it drives on', () => {
  const c = fresh();
  assert.ok(c, 'no moving car');
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  // The Ranger comes in from the car's left, square across it, aimed at its rear quarter.
  const v = new Vehicle(carById('ranger'));
  const lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw);
  v.reset(c.x + lx * 3.2 - fx * 1.3, c.z + lz * 3.2 - fz * 1.3, Math.atan2(-lx, -lz));
  v.vx = -lx * 13.9; v.vz = -lz * 13.9; v.syncFrame();
  let closing = 0;
  for (let i = 0; i < 20 && c.stunT <= 0; i++) { v.x += v.vx / 60; v.z += v.vz / 60; t.collidePlayer(c, v); closing = c.hitBy; }
  assert.ok(c.stunT > TR.SLIDE_AT * 0 + 2 && c.slide, `stun ${c.stunT.toFixed(2)} s, slide ${c.slide}, closing ${closing.toFixed(1)}`);
  const y0 = c.yaw, x0 = c.x, z0 = c.z, stun = c.stunT;
  const away = still(c.x + 60, c.z);
  for (let i = 0; i < Math.ceil(stun * 60) + 3; i++) t.update(1 / 60, away);
  const turned = Math.abs(((c.yaw - y0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 57.3;
  const slid = Math.hypot(c.x - x0, c.z - z0);
  console.log(`     closing ${closing.toFixed(1)} m/s, stun ${stun.toFixed(2)} s, turned ${turned.toFixed(0)} deg, slid ${slid.toFixed(1)} m`);
  assert.ok(turned > 30, `turned only ${turned.toFixed(0)} deg`);
  assert.ok(slid > 3, `slid only ${slid.toFixed(1)} m`);
  assert.ok(c.stunT <= 0 && !c.slide, 'still stunned after its stun');
  for (let i = 0; i < 180; i++) t.update(1 / 60, away);
  assert.ok(c.speed > 1, `parked after the stun (${c.speed.toFixed(1)} m/s)`);
});

ok('T7 a square hit still spins it a little (never parks dead straight)', () => {
  const c = fresh();
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  const v = new Vehicle(carById('ranger'));
  v.reset(c.x - fx * 5.2, c.z - fz * 5.2, c.yaw);           // up its tailpipe, dead centre
  const sp = c.speed + 12; v.vx = fx * sp; v.vz = fz * sp; v.syncFrame();
  for (let i = 0; i < 30 && c.stunT <= 0; i++) { v.x += v.vx / 60; v.z += v.vz / 60; t.collidePlayer(c, v); }
  assert.ok(c.slide, `closing ${c.hitBy.toFixed(1)} m/s did not slide`);
  assert.ok(Math.abs(c.yawSpin) >= c.hitBy * TR.SPIN_PER - 1e-6, `yawSpin ${c.yawSpin.toFixed(2)} for ${c.hitBy.toFixed(1)} m/s`);
  const away = still(c.x + 60, c.z);
  for (let i = 0; i < 200; i++) t.update(1 / 60, away);
});

ok('T8 a near miss makes the car jink away from you and honk', () => {
  const c = fresh();
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  const rx = -fz, rz = fx;                                   // the car's right
  // The player blows past on the car's left, 0.8 m of air, 70 km/h the other way.
  const gap = 0.8 + (c.wid + 1.9) * 0.5;
  const p = { x: c.x - rx * gap, z: c.z - rz * gap, yaw: c.yaw + Math.PI, vx: -fx * 19.4, vz: -fz * 19.4, len: 4.6, wid: 1.9 };
  const n0 = t.swerves || 0;
  t.update(1 / 60, p);                                       // the pass is seen in update(), as in the game
  assert.ok((t.swerves || 0) === n0 + 1 && c.swerveT > 0 && c.honk === 1, `swerve ${c.swerveT}, honk ${c.honk}`);
  assert.ok(c.swerveDir === 1, `swerved toward the player (${c.swerveDir})`);
  const lat0 = lateral(c);
  const away = still(c.x + 150, c.z + 150);
  let most = 0;
  const e0 = c.edge;
  for (let i = 0; i < 60; i++) { t.update(1 / 60, away); if (c.edge === e0) most = Math.max(most, lateral(c) - lat0); }
  console.log(`     moved ${most.toFixed(2)} m right in the first second (lane offset ${c.swerveOff.toFixed(2)} m)`);
  assert.ok(most > 0.5 && most < 1.6, `${most.toFixed(2)} m of swerve`);
  for (let i = 0; i < 120; i++) t.update(1 / 60, away);
  assert.ok(c.swerveT === 0 && c.swerveOff === 0, 'the swerve never ended');
});

ok('T9 your horn swerves a car 10 m ahead of you, not one 25 m ahead', () => {
  const c = fresh(), d = t.cars.find((x) => x !== c && !x.kind && x.speed > 4 && x.swerveT <= 0 && !(x.swerveCool > 0));
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  const p = { x: c.x - fx * 10, z: c.z - fz * 10, yaw: c.yaw };
  assert.ok(t.hornSwerve(c, p), 'no swerve at 10 m');
  const gx = Math.sin(d.yaw), gz = Math.cos(d.yaw);
  assert.ok(!t.hornSwerve(d, { x: d.x - gx * 25, z: d.z - gz * 25, yaw: d.yaw }), 'swerved at 25 m');
  assert.ok(!t.hornSwerve(d, { x: d.x + gx * 10, z: d.z + gz * 10, yaw: d.yaw }), 'swerved for a horn behind it');
});

ok('T10 arterials respawn 80 to 300 m out, side streets 120 to 300 m', () => {
  const p = { x: 932.9, z: 143.9 };
  const big = [], side = [];
  const c = t.cars.find((x) => !x.kind);
  for (let i = 0; i < 300; i++) {
    c.respawnT = 0;
    if (!t.respawn(c, p)) continue;
    const e = t.edges[c.edge], A = t.nodes[e.a], B = t.nodes[e.b];
    const d = Math.hypot((A.x + B.x) / 2 - p.x, (A.z + B.z) / 2 - p.z);
    (e.cls === 'residential' ? side : big).push(d);
  }
  assert.ok(big.length > 100, `${big.length} arterial respawns`);
  assert.ok(big.every((d) => d >= 80 && d <= 300) && big.some((d) => d < 120), `arterial ${Math.min(...big).toFixed(0)}..${Math.max(...big).toFixed(0)} m`);
  assert.ok(side.every((d) => d >= 120 && d <= 300), `side ${Math.min(...side).toFixed(0)}..${Math.max(...side).toFixed(0)} m`);
  console.log(`     ${big.length} arterial (${Math.min(...big).toFixed(0)}-${Math.max(...big).toFixed(0)} m), ${side.length} side street`);
});

console.log(failed ? `${failed} FAILED` : 'all green');
process.exit(failed ? 1 : 0);
