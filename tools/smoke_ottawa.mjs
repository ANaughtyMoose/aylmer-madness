// Downtown Ottawa smoke test — the sector, the 2004 rollback, the hero
// buildings and, above all, that you can still drive there.
//
//   node tools/smoke_ottawa.mjs
//
// The load order matters and is the load order main.js uses: importing
// game/ottawa.js merges the sector into MAP and rolls it back to 2004 BEFORE
// anything reads MAP. nav.js builds its graph from MAP.roads at construction,
// so a Nav made after that import is the graph the game actually routes on.
import { strict as assert } from 'node:assert';

import { PERIOD, HERO_CLEARED, OTTAWA_PLACES, OTTAWA_STARTS } from '../src/game/ottawa.js';
import { OTTAWA_MAP } from '../src/game/ottawa_mapdata.js';
import { landmarkTriangles, HERO } from '../src/game/ottawa_landmarks.js';
import { MAP } from '../src/game/mapdata.js';
import { PLACES } from '../src/game/places.js';
import { Nav } from '../src/game/nav.js';

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// ---------------------------------------------------------------- 1. the sector

// The Hull extract stops at lon -75.690 (x = 11374). Everything the Rideau
// Centre and the ByWard Market need lives east of that line.
const SEAM = 11374;
ok(OTTAWA_MAP.bounds.minX === SEAM, `sector starts at the Hull seam (${OTTAWA_MAP.bounds.minX})`);
ok(OTTAWA_MAP.bounds.maxX > 12100, `sector reaches Nicholas / King Edward (${OTTAWA_MAP.bounds.maxX})`);
ok(MAP.bounds.maxX >= OTTAWA_MAP.bounds.maxX, 'MAP.bounds grew to cover the sector');
ok(OTTAWA_MAP.roads.length > 900, `sector carries real streets (${OTTAWA_MAP.roads.length})`);
ok(OTTAWA_MAP.buildings.length > 4000, `sector carries real footprints (${OTTAWA_MAP.buildings.length})`);

// Every road point in the sector module belongs inside its own rectangle, give
// or take the one node each way is allowed to carry past a world edge.
let stray = 0;
for (const r of OTTAWA_MAP.roads) {
  const inside = r.pts.filter((p) => p[0] >= SEAM - 1).length;
  if (inside === 0) stray++;
}
ok(stray === 0, `no sector road lies wholly west of the seam (${stray})`);

// Named destinations that were clipped mid-street before this sector existed.
const named = (n) => MAP.buildings.find((b) => b.name === n) || MAP.pois.find((p) => p.name === n);
for (const n of ['Rideau Centre', 'Byward Market Building', 'Fairmont Château Laurier',
  'National Gallery of Canada', 'Centre Block', 'Peace Tower']) {
  ok(!!named(n), `map contains ${n}`);
}
// The Rideau Centre's footprint straddles the seam, so BOTH extracts' all-points
// -inside test used to drop it. It is the reason build_ottawa.py reaches west.
const rc = MAP.buildings.find((b) => b.name === 'Rideau Centre');
ok(rc && rc.p.some((p) => p[0] > SEAM) && rc.p.some((p) => p[0] < SEAM),
  'the Rideau Centre footprint really does cross the seam');

// Buildings must not be merged twice: the seam overlap is deduped by OSM id.
const ids = new Set(); let dupes = 0;
for (const b of MAP.buildings) { if (b.id == null) continue; if (ids.has(b.id)) dupes++; ids.add(b.id); }
ok(dupes === 0, `no building merged twice (${dupes})`);

// ---------------------------------------------------------------- 2. 2004

ok(PERIOD.roadsCut > 60, `2006 census diff removed post-2004 streets (${PERIOD.roadsCut})`);
ok(PERIOD.poisCut >= 5, `post-2004 POIs removed (${PERIOD.poisCut})`);
ok(!MAP.pois.some((p) => p.name === 'LRT tickets'), 'no Confederation Line in 2004');
ok(!MAP.buildings.some((b) => b.name && b.name.startsWith('Zibi')), 'no Zibi in 2004');
ok(!MAP.pois.some((p) => p.name === 'TD Place Stadium'), 'the stadium is Frank Clair in 2004');
ok(MAP.pois.some((p) => p.name === 'Frank Clair Stadium'), 'renamed rather than deleted');
// The rollback must never take a street the game needs.
for (const n of ['Chemin Fraser', 'Rue Principale', 'Wellington Street', 'Rideau Street']) {
  ok(MAP.roads.some((r) => r.name === n), `${n} survived the rollback`);
}

// ---------------------------------------------------------------- 3. heroes

const tris = landmarkTriangles();
ok(HERO_CLEARED === HERO.reduce((n, h) => n + h.ids.length, 0),
  `every hero footprint was found and cleared (${HERO_CLEARED})`);
for (const [key, t] of Object.entries(tris)) {
  ok(t.near > 200, `${key} near mesh is real geometry (${t.near} tris)`);
  ok(t.near <= t.budget, `${key} near ${t.near} within budget ${t.budget}`);
  ok(t.far > 20, `${key} far mesh is real geometry (${t.far} tris)`);
  ok(t.far <= t.farBudget, `${key} far ${t.far} within budget ${t.farBudget}`);
  ok(t.far < t.near, `${key} far LOD is cheaper than near`);
}
// The cleared footprints must still collide, and must still be short enough to
// hide inside the hero mesh that replaced them.
for (const h of HERO) for (const id of h.ids) {
  const b = MAP.buildings.find((x) => x.id === id);
  ok(b && b.hero && b.h <= 3 && b.p.length >= 3, `hero stub ${id} still collides`);
}

// ---------------------------------------------------------------- 4. driving

// resolvePlaces needs a world; nearestRoad off MAP.roads is all it uses here.
const world = {
  nearestRoad(x, z) {
    let best = null, bd = Infinity;
    for (const r of MAP.roads) {
      if (r.cls === 'service') continue;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const px = ax + ex * t, pz = az + ez * t;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name }; }
      }
    }
    return best;
  },
};
const { resolvePlaces } = await import('../src/game/places.js');
resolvePlaces(world);

for (const key of Object.keys(OTTAWA_PLACES)) {
  ok(!!PLACES[key], `${key} registered as a place`);
  ok(OTTAWA_STARTS.every((s) => PLACES[s]), 'every start point resolves');
}

const nav = new Nav();
const home = PLACES.home;
console.log(`\n  road graph: ${nav.nodes.length} nodes`);
console.log(`  routes from ${home.label}:`);
let routed = 0;
for (const key of Object.keys(OTTAWA_PLACES)) {
  const p = PLACES[key];
  const path = nav.route(home.x, home.z, p.x, p.z);
  ok(path && path.length > 2, `${key}: routable from 299 Chemin Fraser`);
  let L = 0;
  for (let i = 0; i + 1 < path.length; i++) L += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  // Aylmer to downtown Ottawa is about 20 km by road; anything under 10 km means
  // the router found a shortcut that is not a road, and anything over 60 km
  // means it went the wrong way around Gatineau Park.
  ok(L > 10000 && L < 60000, `${key}: route is ${(L / 1000).toFixed(1)} km`);
  console.log(`    ${p.label.padEnd(28)} ${(L / 1000).toFixed(2)} km, ${path.length} nodes`);
  routed++;
}
ok(routed === Object.keys(OTTAWA_PLACES).length, 'every Ottawa destination is reachable');

// The Champlain Bridge specifically: the owner's crossing, and the one a bike
// has to be able to take. Route from the Québec end of the bridge to Parliament
// and insist the path actually uses the bridge deck.
const champ = MAP.roads.filter((r) => /^(Champlain Bridge|Pont Champlain Bridge)$/.test(r.name || ''));
ok(champ.length > 0, `Champlain Bridge is in the road graph (${champ.length} ways)`);
const deck = champ.flatMap((r) => r.pts);
const qcEnd = deck.reduce((a, b) => (a[0] < b[0] ? a : b));   // west/Québec end
const parl = PLACES.parlement;
const bridgePath = nav.route(qcEnd[0], qcEnd[1], parl.x, parl.z);
ok(bridgePath && bridgePath.length > 2, 'Champlain Bridge (QC side) routes to Parliament');
let bl = 0;
for (let i = 0; i + 1 < bridgePath.length; i++) {
  bl += Math.hypot(bridgePath[i + 1][0] - bridgePath[i][0], bridgePath[i + 1][1] - bridgePath[i][1]);
}
console.log(`    ${'Champlain Bridge -> Parliament'.padEnd(28)} ${(bl / 1000).toFixed(2)} km`);

// Starting ON the bridge is not the same as crossing it. OSM splits this
// crossing into thirteen ways under two names — "Champlain Bridge" and "Pont
// Champlain Bridge", which meet at the provincial boundary in mid-river — so
// the failure mode to guard against is the halves NOT sharing nodes, leaving a
// router that quietly goes seven kilometres round by the Chaudière while every
// other test still passes.
const onEnd = deck.reduce((a, b) => (a[0] > b[0] ? a : b));      // Ontario end
const straight = Math.hypot(onEnd[0] - qcEnd[0], onEnd[1] - qcEnd[1]);
const across = nav.route(qcEnd[0], qcEnd[1], onEnd[0], onEnd[1]);
ok(across, 'the bridge deck is drivable end to end');
let dl = 0;
for (let i = 0; i + 1 < across.length; i++) {
  dl += Math.hypot(across[i + 1][0] - across[i][0], across[i + 1][1] - across[i][1]);
}
ok(dl < straight * 1.5,
  `crossing the Champlain Bridge is ${(dl / 1000).toFixed(2)} km over a `
  + `${(straight / 1000).toFixed(2)} km span — it uses the deck, not a detour`);
console.log(`    ${'Champlain Bridge, QC to ON'.padEnd(28)} ${(dl / 1000).toFixed(2)} km `
  + `(span ${(straight / 1000).toFixed(2)} km)`);
const qcHalf = new Set(champ.filter((r) => r.name === 'Pont Champlain Bridge').flatMap((r) => r.ids));
const onHalf = champ.filter((r) => r.name === 'Champlain Bridge').flatMap((r) => r.ids);
ok(onHalf.some((id) => qcHalf.has(id)),
  'the Québec and Ontario halves of the bridge share OSM nodes');
// Nothing on the deck is one-way, so a bike can come back.
ok(champ.every((r) => !r.oneway), 'the bridge is two-way in both directions');

// One connected component either side of the river: pick a node in Aylmer and a
// node in the Ottawa sector and insist the graph joins them. This is what a
// clipped sector breaks first, and it breaks silently.
const aylmer = nav.nearest(PLACES.principale.x, PLACES.principale.z);
const ottawa = nav.nearest(PLACES.byward.x, PLACES.byward.z);
ok(aylmer && ottawa, 'both ends have graph nodes');
ok(nav.route(aylmer.x, aylmer.z, ottawa.x, ottawa.z), 'the road graph crosses the river');

// The seam itself: the two extracts have to SHARE node ids, not merely touch.
// Every road that ends on the seam should have a partner starting there.
const atSeam = new Map();
for (const r of MAP.roads) {
  for (let i = 0; i < r.pts.length; i++) {
    if (Math.abs(r.pts[i][0] - SEAM) < 60) {
      atSeam.set(r.ids[i], (atSeam.get(r.ids[i]) || 0) + 1);
    }
  }
}
const shared = [...atSeam.values()].filter((n) => n > 1).length;
ok(shared > 5, `sectors share OSM nodes across the seam (${shared} shared)`);

console.log(`\nsmoke_ottawa: ${checks} checks passed`);
