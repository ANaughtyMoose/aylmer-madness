#!/usr/bin/env node
// Hero landmark colliders against the roads:  node tools/smoke_landmark_roads.mjs
//
// s1-hotel, 20 Oct 2026. The red team (redteam-2026-10-19/tech.md finding 3)
// read the bz_vieux wedge at (-932, -97) as an invisible wall: the British
// Hotel's collider reaching onto Rue Parker. That box was the CAMERA collider
// (landmark:british, the whole near mesh including the front walk to the
// sidewalk), which never stops a car. The car collider is the hotel's own OSM
// ring, drawn and collided by the same walls() call. This suite holds every hero
// site (landmarks.js SITES, which includes historicstrip.js and oldaylmer.js) to
// the two promises the red team asked for:
//
//   1. no landmark car collider crosses the asphalt of a street (any MAP.roads
//      way that is not cls 'service'), at its honest half width (road.w / 2,
//      the width world.js paves), and the British Hotel keeps clear of Rue
//      Parker and Rue Principale;
//   2. every landmark car collider stands on drawn geometry: a near-bake face at
//      least 0.25 m tall within 0.5 m of it, or (for a site that repeats a
//      world.js wall) an OSM footprint edge world.js still draws.
//
// Service ways (driveways, lot aisles, drive-throughs, school loops) are OSM
// lines that often run up to and under a building. Where a hero wall crosses
// one today it is listed in SERVICE_KNOWN with its depth, waiting for a ruling
// (move the wall, cut the way, or accept it); the suite fails on any new
// crossing, or on a listed one that gets deeper. Never add to that list to make
// this pass: a new crossing is a bug until the lead rules on it.
//
// Pure node: landmarks.js and mapdata.js only, no world bake, no WebGL.

import { SITES, bakeColliders, bakeSite } from '../src/game/landmarks.js';
import { MAP } from '../src/game/mapdata.js';
import STUB from '../src/game/materials_stub.js';
import { STRIDE } from '../src/core/mesh.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const group = (n) => console.log('\n' + n);
const r2 = (v) => Math.round(v * 100) / 100;

const TOL = 0.05;          // m of asphalt a wall may graze (sampling noise)
const STEP = 0.25;         // m between samples along a collider
const DRAWN = 0.5;         // m from a collider to the face that shows it
const FACE_H = 0.25;       // m: a face this tall or more counts as something you can see

function dist2(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / l));
  const dx = ax + ex * t - px, dz = az + ez * t - pz;
  return dx * dx + dz * dz;
}

// Each site's car colliders, deduplicated (the grid hands a segment back once per cell).
function collidersOf(s) {
  const col = bakeColliders(s), out = [];
  col.into(out, s.cx, s.cz, s.r + 600);
  const seen = new Map();
  for (const q of out) {
    const k = [q.ax, q.az, q.bx, q.bz].map((v) => v.toFixed(2)).join(' ');
    if (!seen.has(k)) seen.set(k, { ax: q.ax, az: q.az, bx: q.bx, bz: q.bz, k });
  }
  return [...seen.values()];
}

// Where a collider crosses a way's asphalt: deepest point (half width minus the
// distance to the centreline) and the length of collider inside it.
const roadSegs = [];
MAP.roads.forEach((r, ri) => {
  for (let j = 0; j + 1 < r.pts.length; j++) {
    const a = r.pts[j], b = r.pts[j + 1];
    roadSegs.push({ ri, hw: r.w / 2, ax: a[0], az: a[1], bx: b[0], bz: b[1],
      minX: Math.min(a[0], b[0]) - r.w, maxX: Math.max(a[0], b[0]) + r.w,
      minZ: Math.min(a[1], b[1]) - r.w, maxZ: Math.max(a[1], b[1]) + r.w });
  }
});
function crossings(q) {
  const hits = new Map();
  const L = Math.hypot(q.bx - q.ax, q.bz - q.az), n = Math.max(1, Math.ceil(L / STEP));
  for (let i = 0; i <= n; i++) {
    const x = q.ax + (q.bx - q.ax) * i / n, z = q.az + (q.bz - q.az) * i / n;
    const deepest = new Map();
    for (const s of roadSegs) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const depth = s.hw - Math.sqrt(dist2(x, z, s.ax, s.az, s.bx, s.bz));
      if (depth > TOL && depth > (deepest.get(s.ri) ?? -1)) deepest.set(s.ri, depth);
    }
    for (const [ri, depth] of deepest) {
      const h = hits.get(ri) || { ri, depth: 0, len: 0, at: null };
      h.len += L / n;
      if (depth > h.depth) { h.depth = depth; h.at = [r2(x), r2(z)]; }
      hits.set(ri, h);
    }
  }
  return [...hits.values()];
}

// Service-way crossings found on 20 Oct 2026 (7ed4dfb), waiting for a ruling.
// key: `${site}|${collider ax az bx bz to 1 dp}`, value: deepest metres of
// asphalt the wall stands in (half width minus centreline distance).
const SERVICE_KNOWN = {
  'pwhs|6717.0 -8018.0 6717.0 -8106.0': 2.40, 'pwhs|6695.0 -8106.0 6695.0 -8018.0': 2.48,
  'pwhs|6806.0 -8020.0 6806.0 -8140.0': 2.48, 'pwhs|6794.0 -8140.0 6794.0 -8020.0': 2.44,
  'pwhs|6899.0 -8061.0 6899.0 -8087.0': 1.82, 'pwhs|6899.0 -8087.0 6869.0 -8087.0': 2.49,
  'pwhs|6907.0 -8030.0 6873.0 -8030.0': 2.44, 'pwhs|6869.0 -8061.0 6899.0 -8061.0': 2.44,
  'pwhs|6879.0 -8029.0 6901.0 -8029.0': 2.45, 'pwhs|6901.0 -8029.0 6901.0 -8063.0': 2.42,
  'pwhs|6901.0 -8063.0 6879.0 -8063.0': 2.50, 'pwhs|6873.0 -7994.0 6907.0 -7994.0': 2.50,
  'heritage|5545.8 -6737.1 5539.2 -6762.5': 0.66,
  'symmesjr|-294.6 389.0 -272.6 388.0': 2.49, 'symmesjr|-272.6 388.0 -273.4 371.0': 2.43,
  'galeries|-119.0 -327.0 -195.0 -327.0': 2.49, 'galeries|-195.0 -327.0 -195.0 -253.0': 2.48,
  'galeries|-5.6 -280.3 7.1 -283.4': 2.03, 'galeries|-6.8 -285.3 -5.6 -280.3': 1.31,
  'galeries|7.1 -283.4 5.8 -288.4': 2.03,
  'loblaws|997.9 -304.7 1021.4 -309.6': 2.48, 'loblaws|1021.4 -309.6 1008.1 -373.3': 2.44,
  'mcdonalds|325.2 -254.7 308.3 -253.2': 2.46, 'mcdonalds|308.3 -253.2 310.8 -225.3': 2.50,
  'mcdonalds|310.8 -225.3 327.7 -226.8': 2.39,
  'esso|416.5 -248.0 441.5 -248.0': 0.90, 'esso|441.5 -258.0 416.5 -258.0': 1.85,
  'esso|416.5 -258.0 416.5 -248.0': 0.87, 'esso|441.5 -248.0 441.5 -258.0': 1.85,
  'edeycorner|517.5 -232.6 518.5 -232.6': 1.54, 'edeycorner|517.5 -231.4 518.5 -231.4': 1.44,
  'galaxie|-651.0 30.0 -689.0 30.0': 2.47, 'galaxie|-689.0 30.0 -689.0 66.0': 2.47,
  'galaxie|-689.0 66.0 -651.0 66.0': 1.48,
  'frankarena|-589.0 118.5 -589.0 39.5': 2.46, 'frankarena|-624.0 118.5 -589.0 118.5': 2.40,
};

const cols = new Map(SITES.map((s) => [s.key, collidersOf(s)]));

group(`1. no hero collider stands on a street (${SITES.length} sites, honest half width, ${TOL} m grazing)`);
const serviceSeen = [];
for (const s of SITES) {
  const street = [];
  for (const q of cols.get(s.key)) {
    for (const h of crossings(q)) {
      const road = MAP.roads[h.ri];
      if (road.cls === 'service') { serviceSeen.push({ site: s.key, q, h }); continue; }
      street.push(`${road.name || road.cls} ${r2(h.depth)} m deep for ${r2(h.len)} m at ${h.at.join(', ')}`);
    }
  }
  ok(!street.length, `${s.key}: clear of every street`, street.join('; '));
}

group('2. the British Hotel (the bz_vieux wedge) is clear of Rue Parker and Rue Principale');
{
  const br = SITES.find((s) => s.key === 'british');
  const segs = cols.get('british');
  ok(segs.length >= 4, 'the hotel has its walls', `${segs.length} colliders`);
  for (const name of ['Rue Parker', 'Rue Principale']) {
    let gap = Infinity;
    for (const q of segs) {
      const L = Math.hypot(q.bx - q.ax, q.bz - q.az), n = Math.max(1, Math.ceil(L / STEP));
      for (let i = 0; i <= n; i++) {
        const x = q.ax + (q.bx - q.ax) * i / n, z = q.az + (q.bz - q.az) * i / n;
        for (const s of roadSegs) {
          const road = MAP.roads[s.ri];
          if (road.name !== name) continue;
          gap = Math.min(gap, Math.sqrt(dist2(x, z, s.ax, s.az, s.bx, s.bz)) - s.hw);
        }
      }
    }
    ok(gap > 1, `walls stand off the ${name} asphalt`, `${r2(gap)} m`);
  }
  // The red team's stop point is on Rue Parker's east kerb with the hotel's west wall ahead.
  let near = Infinity;
  for (const q of segs) near = Math.min(near, Math.sqrt(dist2(-931.8, -96.8, q.ax, q.az, q.bx, q.bz)));
  ok(near > 1.5 && near < 4, 'the (-931.8, -96.8) stop is a nose against the west wall, not a wall in the street',
    `${r2(near)} m from the truck's centre to the wall`);
  ok(Math.hypot(br.cx + 916, br.cz + 112) < 1, 'the site is still at its OSM centre', `${br.cx}, ${br.cz}`);
}

group('3. service-way crossings: only the ones listed for a ruling, none deeper');
{
  const seen = new Set();
  const news = [], deeper = [];
  for (const { site, q, h } of serviceSeen) {
    const key = `${site}|${[q.ax, q.az, q.bx, q.bz].map((v) => v.toFixed(1)).join(' ')}`;
    seen.add(key);
    const known = SERVICE_KNOWN[key];
    if (known == null) news.push(`${key} ${r2(h.depth)} m at ${h.at.join(', ')}`);
    else if (h.depth > known + 0.02) deeper.push(`${key} ${r2(h.depth)} m (listed ${known})`);
  }
  ok(!news.length, 'no new hero wall across a service way', news.join('; '));
  ok(!deeper.length, 'no listed crossing got deeper', deeper.join('; '));
  const gone = Object.keys(SERVICE_KNOWN).filter((k) => !seen.has(k));
  console.log(`       ${seen.size} crossings listed for a ruling${gone.length ? `; ${gone.length} fixed since (drop them): ${gone.join(', ')}` : ''}`);
}

group('4. every hero collider stands on something drawn');
{
  // OSM footprints world.js still draws (a hero's own footprint is collapsed to a stub).
  const osmEdges = [];
  for (const b of MAP.buildings) {
    const p = b.p;
    if (!p || p.length < 3) continue;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      if (Math.hypot(c[0] - a[0], c[1] - a[1]) > 0.1) osmEdges.push([a[0], a[1], c[0], c[1]]);
    }
  }
  for (const s of SITES) {
    const m = bakeSite(s, STUB).near, V = m.v, I = m.i, faces = [];
    for (let t = 0; t < I.length; t += 3) {
      const p = [0, 1, 2].map((k) => I[t + k] * STRIDE);
      const ys = p.map((o) => V[o + 1]);
      if (Math.max(...ys) - Math.min(...ys) < FACE_H) continue;
      for (let k = 0; k < 3; k++) {
        const a = p[k], c = p[(k + 1) % 3];
        faces.push([V[a], V[a + 2], V[c], V[c + 2]]);
      }
    }
    const R = s.r + 60;
    const osm = osmEdges.filter((e) => Math.hypot(e[0] - s.cx, e[1] - s.cz) < R + 200);
    const bare = [];
    for (const q of cols.get(s.key)) {
      let miss = 0;
      for (let i = 0; i <= 8; i++) {
        const x = q.ax + (q.bx - q.ax) * i / 8, z = q.az + (q.bz - q.az) * i / 8;
        const hit = (list) => list.some((f) => dist2(x, z, f[0], f[1], f[2], f[3]) < DRAWN * DRAWN);
        if (!hit(faces) && !hit(osm)) miss++;
      }
      if (miss) bare.push(`${q.k} (${miss}/9 samples with nothing drawn)`);
    }
    ok(!bare.length, `${s.key}: ${cols.get(s.key).length} colliders, all drawn`, bare.join('; '));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
