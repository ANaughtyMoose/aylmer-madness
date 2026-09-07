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

console.log(failed ? `${failed} FAILED` : 'all green');
process.exit(failed ? 1 : 0);
