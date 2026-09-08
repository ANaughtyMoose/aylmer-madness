// Which side of the road is the ambient traffic actually on?
//
// Independent of traffic.js's own bookkeeping: for every vehicle, find the
// nearest *road centreline* in MAP.roads (the OSM way geometry, not the
// traffic graph edge the car thinks it is on), then measure the signed lateral
// offset of the car from that centreline in the car's own direction of travel.
// Positive = right of centre = correct for Québec.
//
//   node tools/probe_traffic_side.mjs

import { MAP } from '../src/game/mapdata.js';
const { Traffic } = await import('../src/game/traffic.js');

// ---------------------------------------------------------------- road index
// Same classes the AI is allowed on, so we never match a car to a footpath.
const DRIVABLE = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential']);
const CELL = 60;
const segs = [];                 // {ax,az,bx,bz,dx,dz,len,road}
for (const road of MAP.roads) {
  if (!DRIVABLE.has(road.cls)) continue;
  const p = road.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const dx = p[i + 1][0] - p[i][0], dz = p[i + 1][1] - p[i][1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    segs.push({ ax: p[i][0], az: p[i][1], dx: dx / len, dz: dz / len, len, road, i,
      ida: road.ids[i], idb: road.ids[i + 1] });
  }
}
// How many drivable segments touch each OSM node: 1 or 2 is a bend inside a
// street, 3+ is a real junction where a turning car may cross the middle.
const degree = new Map();
for (const s of segs) {
  degree.set(s.ida, (degree.get(s.ida) || 0) + 1);
  degree.set(s.idb, (degree.get(s.idb) || 0) + 1);
}
const grid = new Map();
const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
for (let i = 0; i < segs.length; i++) {
  const s = segs[i];
  const n = Math.ceil(s.len / CELL) + 1;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * s.len;
    const kk = key(s.ax + s.dx * t, s.az + s.dz * t);
    const b = grid.get(kk);
    if (b) { if (b[b.length - 1] !== i) b.push(i); } else grid.set(kk, [i]);
  }
}

/** Nearest centreline segment to (x,z), searching the 3x3 cells around it. */
function nearestSeg(x, z) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best = null, bestD = Infinity, bestT = 0;
  for (let iz = cz - 1; iz <= cz + 1; iz++) {
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      const b = grid.get(ix + ',' + iz);
      if (!b) continue;
      for (const i of b) {
        const s = segs[i];
        const rx = x - s.ax, rz = z - s.az;
        const t = Math.max(0, Math.min(s.len, rx * s.dx + rz * s.dz));
        const px = rx - s.dx * t, pz = rz - s.dz * t;
        const d = px * px + pz * pz;
        if (d < bestD) { bestD = d; best = s; bestT = t; }
      }
    }
  }
  return best ? { s: best, t: bestT, d: Math.sqrt(bestD) } : null;
}

// ------------------------------------------------------------------ simulate
// Traffic only exists in a 300 m ring around the player, so one vantage point
// only ever measures one kind of street. Stand in seven of them.
const STATIONS = [
  ['299 Chemin Fraser (residential)', 932.9, 143.9],
  ["Chemin d'Aylmer (secondary, two-way, w13.6)", 2533, -816],
  ['Boulevard Alexandre-Taché (secondary, two-way)', 7677, -3206],
  ['Boulevard Maisonneuve, Hull (primary, one-way)', 9581, -4086],
  ['Boulevard Saint-Raymond (secondary, one-way)', 7955, -5924],
  ['Boulevard des Allumettières (trunk, one-way)', 2735, -3245],
  ['Wellington Street, Ottawa (primary, one-way)', 10752, -3261],
];
const SEC = Number(process.argv[2] || 60);
const only = process.argv[3] ? Number(process.argv[3]) : -1;
const t = new Traffic(80, 3);
const player = { x: 932.9, z: 143.9, spec: { wid: 1.8 }, nudge() {} };
const rows = [];
for (let si = 0; si < STATIONS.length; si++) {
  if (only >= 0 && si !== only) continue;
  const [label, px0, pz0] = STATIONS[si];
  player.x = px0; player.z = pz0;
  for (const c of t.cars) { c.respawnT = 0; c.stunT = 0; }
  for (let i = 0; i < 60 * SEC; i++) {
    t.update(1 / 60, player);
    if (i % 20 !== 19 || i <= 600) continue;
    for (const c of t.cars) {
      if (c.stunT > 0 || c.speed < 1.5) continue;
      const hit = nearestSeg(c.x, c.z);
      if (!hit || hit.d > 14) continue;
      const s = hit.s;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      // Right of the direction of travel is (-fz, fx) with x east, z south.
      const qx = c.x - (s.ax + s.dx * hit.t), qz = c.z - (s.az + s.dz * hit.t);
      const lat = qx * -fz + qz * fx;
      const along = fx * s.dx + fz * s.dz;        // +1 = with the way's point order
      // mid = far from either end of this centreline segment, i.e. not inside a
      // junction where a turning car legitimately crosses the middle.
      const mid = hit.t > 8 && hit.t < s.len - 8;
      // Which end are we near, and is that end a junction or just a bend?
      const nearId = hit.t <= s.len / 2 ? s.ida : s.idb;
      const junction = (degree.get(nearId) || 0) >= 3;
      // What manoeuvre is this car in the middle of? Left turns legitimately
      // cross the centre; going straight on never should.
      const ce = t.edges[c.edge], ne = c.next >= 0 ? t.edges[c.next] : null;
      let turn = 'straight';
      if (ne) {
        // z runs south, so east (1,0) turning north (0,-1) gives cross < 0.
        const cross = ce.dx * ne.dz - ce.dz * ne.dx;   // >0 = right, <0 = left
        const dot = ce.dx * ne.dx + ce.dz * ne.dz;
        if (dot < 0.87) turn = cross > 0 ? 'right' : 'left';
      }
      // Second, independent-of-matching measure: the offset from the line of
      // the edge the car is actually driving. Near a junction the nearest
      // centreline can be the cross street, which makes `lat` meaningless
      // there; this one cannot be confused that way.
      const EA = t.nodes[ce.a];
      const ex = c.x - EA.x, ez = c.z - EA.z;
      const eLat = ex * -ce.dz + ez * ce.dx;
      const eS = ex * ce.dx + ez * ce.dz;
      rows.push({ lat, along, mid, junction, turn, eLat, eS, eLen: ce.len, wgt: c.speed,
        d: hit.d, road: s.road, station: label, kind: c.kind || 'car', id: c.spec.id });
    }
  }
}

// -------------------------------------------------------------------- report
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : 'n/a';
function report(label, xs, useAlong) {
  if (!xs.length) { console.log(`${label.padEnd(34)} no samples`); return; }
  const right = xs.filter((x) => x.lat > 0).length;
  const withWay = xs.filter((x) => x.along > 0).length;
  const mean = xs.reduce((a, x) => a + x.lat, 0) / xs.length;
  console.log(`${label.padEnd(34)} n=${String(xs.length).padStart(6)}  right ${pct(right, xs.length).padStart(6)}` +
    (useAlong ? `  with point order ${pct(withWay, xs.length).padStart(6)}` : '') +
    `  mean lat ${mean.toFixed(2)} m`);
}

const mid = rows.filter((r) => r.mid);
const two = mid.filter((r) => !r.road.oneway);
console.log(`\n${rows.length} samples over ${SEC}s, ${mid.length} of them mid-segment\n`);
report('ALL mid-segment', mid, false);
report('two-way roads', two, false);
report('  two-way, w < 12', two.filter((r) => r.road.w < 12), false);
report('  two-way, w >= 12', two.filter((r) => r.road.w >= 12), false);
report('one-way roads', mid.filter((r) => r.road.oneway), true);
report('near a node (t<8 or >len-8)', rows.filter((r) => !r.mid), false);
report('  ...at a real junction (deg>=3)', rows.filter((r) => !r.mid && r.junction), false);
report('  ...at a mere bend (deg<3)', rows.filter((r) => !r.mid && !r.junction), false);
for (const turn of ['straight', 'left', 'right']) {
  report(`    junction, going ${turn}`, rows.filter((r) => !r.mid && r.junction && r.turn === turn), false);
}
for (const turn of ['straight', 'left', 'right']) {
  report(`    bend, going ${turn}`, rows.filter((r) => !r.mid && !r.junction && r.turn === turn), false);
}
console.log('');
report('cars', mid.filter((r) => r.kind === 'car'), false);
report('cyclists', mid.filter((r) => r.kind === 'bike'), false);
report('buses', mid.filter((r) => r.kind === 'city' || r.kind === 'school'), false);

// The worst offenders, by street.
const byRoad = new Map();
for (const r of two) {
  const k = r.road.name || r.road.cls;
  const v = byRoad.get(k) || { n: 0, bad: 0, w: r.road.w };
  v.n++; if (r.lat <= 0) v.bad++;
  byRoad.set(k, v);
}
const worst = [...byRoad].filter(([, v]) => v.n >= 40).sort((a, b) => b[1].bad / b[1].n - a[1].bad / a[1].n).slice(0, 12);
console.log('\nworst two-way streets (>=40 samples):');
for (const [k, v] of worst) console.log(`  ${pct(v.bad, v.n).padStart(6)} wrong  n=${String(v.n).padStart(5)}  w=${v.w}  ${k}`);

// ---- measured against the car's own edge, which no cross street can confuse
console.log('\nagainst the edge the car is driving (eLat > 0 = right of it):');
const eb = (label, xs) => {
  if (!xs.length) { console.log(`  ${label.padEnd(30)} no samples`); return; }
  // Weighted by speed, so a car that dawdles through a junction does not count
  // for more than one that hurries: this is metres of road driven, not frames.
  const W = (ys) => ys.reduce((a, x) => a + x.wgt, 0);
  const all = W(xs);
  const bad = xs.filter((x) => x.eLat <= 0);
  const deep = xs.filter((x) => x.eLat <= -1.0);
  const worst = xs.reduce((a, x) => Math.min(a, x.eLat), 0);
  console.log(`  ${label.padEnd(30)} n=${String(xs.length).padStart(6)}  right ${pct(all - W(bad), all).padStart(6)}` +
    `  >1 m into the oncoming lane ${pct(W(deep), all).padStart(6)}  worst ${worst.toFixed(1)} m`);
};
eb('whole edge', rows);
eb('mid-edge (8 m from each end)', rows.filter((x) => x.eS > 8 && x.eS < x.eLen - 8));
eb('first 8 m of an edge', rows.filter((x) => x.eS <= 8));
eb('last 8 m of an edge', rows.filter((x) => x.eS >= x.eLen - 8));
eb('  ...of those, at a junction', rows.filter((x) => x.junction && (x.eS <= 8 || x.eS >= x.eLen - 8)));
eb('  ...of those, at a bend', rows.filter((x) => !x.junction && (x.eS <= 8 || x.eS >= x.eLen - 8)));
// The one case that is never legitimate: the last stretch before the node with
// no turn coming. A car carrying straight on has no business left of centre.
console.log('  — the last 8 m, split by the manoeuvre that follows:');
for (const turn of ['straight', 'left', 'right']) {
  eb(`    approaching, then ${turn}`, rows.filter((x) => x.eS >= x.eLen - 8 && x.turn === turn));
}

console.log('\n  — how far from the node the lane is given up (left turns coming):');
for (const [lo, hi] of [[12, 20], [8, 12], [6, 8], [4, 6], [2, 4], [0, 2]]) {
  const xs = rows.filter((x) => x.turn === 'left' && x.eLen - x.eS >= lo && x.eLen - x.eS < hi);
  eb(`    ${lo}-${hi} m before the node`, xs);
}
console.log('  — same buckets, any manoeuvre:');
for (const [lo, hi] of [[12, 20], [8, 12], [6, 8], [4, 6], [2, 4], [0, 2]]) {
  const xs = rows.filter((x) => x.eLen - x.eS >= lo && x.eLen - x.eS < hi);
  eb(`    ${lo}-${hi} m before the node`, xs);
}

console.log('\nper station (mid-segment):');
for (const [label] of STATIONS) {
  const xs = mid.filter((r) => r.station === label);
  if (!xs.length) { console.log(`  ${label.padEnd(48)} no samples`); continue; }
  const one = xs.filter((r) => r.road.oneway), tw = xs.filter((r) => !r.road.oneway);
  console.log(`  ${label.padEnd(48)} two-way n=${String(tw.length).padStart(5)} right ${pct(tw.filter((r) => r.lat > 0).length, tw.length).padStart(6)}` +
    ` | one-way n=${String(one.length).padStart(5)} along ${pct(one.filter((r) => r.along > 0).length, one.length).padStart(6)}`);
}
