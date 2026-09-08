// Ambient traffic keeps to the right. There was no suite for this, and the
// bug it would have caught shipped: cars steered straight at the far end of
// their road segment, so on every left-hand bend the chord ran through the
// oncoming lane (7 % of samples left of the centreline, 3.4 m out on rue
// Principale). What is pinned here is what a player sees from the driver's
// seat: a moving car, away from an intersection, sits in its own lane, points
// the way its lane goes, and a cyclist rides further right than a Caravan.
//
// T6-T10 came later, from the same complaint measured again: mid-road was by
// then already right, and what was left was the approach to a junction, plus
// the streets Fraser does not have — one-ways and boulevards, which only exist
// in Hull and Ottawa and so need a second vantage point.
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
      samples.push({ T: t, c, e, s, lat, heading, mid: s > 8 && s < e.len - 8, moving: c.speed > 1.5 });
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

// ---------------------------------------------------------------------------
// The junction pass. Everything above is measured against the edge a car is on
// and away from its ends, which is where the previous fix left it correct. What
// was still wrong is the approach to a junction: pure pursuit hung its rope on
// the *next* edge's lane as soon as the look-ahead outran the edge, so a car
// about to turn left set off diagonally across the oncoming lane from up to
// fourteen metres out, and swung so wide it missed the arrival radius and
// carried on past the corner.
//
// T6, T7 and T8 all fail on the pre-fix tree. What they measure, before ->
// after, on the two runs this file makes:
//
//   the aim 12 m before a junction left turn      -0.19 m -> +2.00 m of centre
//   the approach, weighted by distance driven,
//     spent more than 1 m into the oncoming lane   5.1 % -> 0 %
//   worst lateral excursion of any vehicle       -11.0 m -> -4.5 m
//
// tools/probe_traffic_side.mjs says the same thing from seven vantage points
// and against the OSM centreline rather than the graph: mid-road was already
// 100 % correct before this change, and the whole of what was left was the
// approach to a junction.

ok('T6 the rope is not thrown across the junction before the car gets there', () => {
  // A left turn at a real junction, taken from the graph itself.
  let e = null, nx = null;
  for (let i = 0; i < t.edges.length && !e; i++) {
    const c = t.edges[i];
    if (c.len < 26 || t.nodes[c.b].deg < 3) continue;
    for (const j of t.nodes[c.b].out) {
      const n = t.edges[j];
      if (n.b === c.a || n.len < 12) continue;
      const dot = c.dx * n.dx + c.dz * n.dz;
      const cross = c.dx * n.dz - c.dz * n.dx;   // z runs south: < 0 is a left turn
      if (dot < 0.8 && cross < 0) { e = c; nx = j; break; }
    }
    if (!e) continue;
  }
  assert.ok(e, 'no junction left turn in the graph');
  const A = t.nodes[e.a], out = [0, 0];
  // 10 m short of the corner at 12 m/s the look-ahead is 12.2 m, so it used to
  // spill onto the next edge's lane — which for a left turn is across the
  // centreline of the road we are still on.
  const car = { x: 0, z: 0, speed: 12, next: nx, lane: 0 };
  const at = (rem) => {
    const p = t.laneAt(e, (e.len - rem) / e.len, [0, 0], 0);
    car.x = p[0]; car.z = p[1];
    t.aimAt(car, e, out);
    return (out[0] - A.x) * -e.dz + (out[1] - A.z) * e.dx;   // aim, right of centre
  };
  for (const rem of [14, 12, 10, 8, 6]) {
    const lat = at(rem);
    assert.ok(lat >= e.off - 0.01,
      `${rem} m before the corner the aim is ${lat.toFixed(2)} m right of centre, lane is ${e.off}`);
  }
  // ...but it still turns: inside the arrival radius the aim is on the new lane.
  assert.ok(at(1) < e.off, 'the aim never crosses over, so the car cannot turn');
});

// ---------------------------------------------------------------------------
// Fraser is a two-way residential street and nothing else. One-way streets,
// dual carriageways and boulevards only exist in Hull and Ottawa, and traffic
// lives in a 300 m ring around the player, so they have to be visited.
const t2 = new Traffic(60, 11);
const far = [];
for (const [px, pz] of [[9581, -4086], [10752, -3261], [7677, -3206]]) {
  const p2 = { x: px, z: pz, spec: { wid: 1.8 }, nudge() {} };
  for (const c of t2.cars) { c.respawnT = 0; c.stunT = 0; }
  for (let i = 0; i < 60 * 25; i++) {
    t2.update(1 / 60, p2);
    if (i % 20 !== 19 || i <= 420) continue;
    for (const c of t2.cars) {
      if (c.stunT > 0 || c.speed < 1.5) continue;
      const e = t2.edges[c.edge], A = t2.nodes[e.a];
      const ex = c.x - A.x, ez = c.z - A.z;
      far.push({
        T: t2, c, e, moving: true,
        s: ex * e.dx + ez * e.dz,
        lat: ex * -e.dz + ez * e.dx,
        heading: Math.sin(c.yaw) * e.dx + Math.cos(c.yaw) * e.dz,
      });
    }
  }
}

const every = samples.concat(far);
ok('T7 nobody swings a left turn through the far side of the road', () => {
  const turn = every.filter((x) => {
    const T = x.T, e = x.e, n = x.c.next >= 0 ? T.edges[x.c.next] : null;
    if (!n || T.nodes[e.b].deg < 3) return false;
    const dot = e.dx * n.dx + e.dz * n.dz, cross = e.dx * n.dz - e.dz * n.dx;
    return dot < 0.8 && cross < 0 && x.s > e.len - 8 && x.moving;
  });
  assert.ok(turn.length > 60, `only ${turn.length} left-turn approach samples`);
  // Weighted by distance driven, not by frame: a car that dawdles through a
  // junction must not count for more than one that hurries.
  const W = (xs) => xs.reduce((a, x) => a + x.c.speed, 0);
  const deep = W(turn.filter((x) => x.lat <= -1)) / W(turn);
  assert.ok(deep < 0.02,
    `${(deep * 100).toFixed(1)} % of the approach is more than 1 m into the oncoming lane (5.1 % of it before the fix, 0 % after)`);
  const worst = turn.reduce((a, x) => Math.min(a, x.lat), 0);
  assert.ok(worst > -6, `a left-turner reached ${worst.toFixed(1)} m into the oncoming side`);
});

ok('T8 and no vehicle anywhere ends up on the far side of the street', () => {
  const worst = every.reduce((a, x) => Math.min(a, x.lat), 0);
  assert.ok(worst > -6, `worst lateral excursion ${worst.toFixed(1)} m (-11.0 m before the fix)`);
});

ok('T9 a one-way street is driven the way the way points', () => {
  const one = far.filter((x) => x.e.oneway);
  assert.ok(one.length > 400, `only ${one.length} one-way samples`);
  // Edges are directed and a one-way road only ever got its forward half
  // linked, so this is the whole of it — but it is the assumption the whole
  // one-way story rests on, and nothing else checks it.
  const back = one.filter((x) => x.heading < 0.5);
  assert.ok(back.length / one.length < 0.01,
    `${back.length} of ${one.length} one-way samples pointing back up the street`);
});

ok('T10 a boulevard is no different: keep right of its centreline', () => {
  const wide = far.filter((x) => x.e.off >= 3 && x.s > 8 && x.s < x.e.len - 8);
  assert.ok(wide.length > 200, `only ${wide.length} samples on a road 12 m or wider`);
  const wrong = wide.filter((x) => x.lat < 0.3);
  assert.equal(wrong.length, 0,
    `${wrong.length} of ${wide.length} samples left of centre on a boulevard`);
});

console.log(failed ? `${failed} FAILED` : 'all green');
process.exit(failed ? 1 : 0);
