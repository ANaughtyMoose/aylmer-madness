#!/usr/bin/env node
// Headless checks for src/game/landmarks.js — no browser, no GL.
//
//   node tools/smoke_landmarks.mjs           assert the budgets
//   node tools/smoke_landmarks.mjs --table   also print the per-site table
//
// Asserts: every hero site stays inside its triangle budget at both LODs, the
// far bake keeps the near bake's silhouette (so the LOD swap is not a pop), no
// NaN/Inf vertices, every OSM footprint a site replaces was actually found and
// collapsed, the new PLACES entries exist and resolve, and the couch is where
// the tree is rather than somewhere over the road.
import { MAP } from '../src/game/mapdata.js';
import { PLACES } from '../src/game/places.js';
import STUB from '../src/game/materials_stub.js';
import {
  SITES, BUDGET, HIDE_MISSES, bakeSite, bakeColliders, COUCH, MIKE_MAPLE,
  LANDMARK_FLAGS, HERO_NEAR, offsetRing, rectRing,
} from '../src/game/landmarks.js';

const table = process.argv.includes('--table');
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

// ---------------------------------------------------------------- footprints

if (HIDE_MISSES.length) fail('OSM footprints not found: ' + HIDE_MISSES.join(', '));
else ok(`every replaced OSM footprint was found (${SITES.filter((s) => s.hide).length} of them)`);

// Each hidden entry must now be a 2 cm stub: world.js still draws it, and it has
// to be small enough and low enough to stay buried inside the hero mesh.
for (const s of SITES) {
  for (const h of s.hide || []) {
    const b = MAP.buildings.find((q) => q.id === h.id);
    if (!b) { fail(`${s.key}: building ${h.id} vanished from MAP`); continue; }
    if (b.h > 0.05) fail(`${s.key}: collapsed footprint is ${b.h} m tall, must be < 5 cm`);
    if (b.p.length !== 3) fail(`${s.key}: collapsed footprint has ${b.p.length} points, want 3`);
    if (b.name || b.hs) fail(`${s.key}: collapsed footprint still carries name/hs`);
    const d = Math.hypot(b.c[0] - h.at[0], b.c[1] - h.at[1]);
    if (d > 90) fail(`${s.key}: collapse point is ${d | 0} m from the footprint centroid`);
  }
}
ok('collapsed footprints are 2 cm stubs at their own centroids');

// ---------------------------------------------------------------- the bakes

const bbox = (b) => ({
  w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], d: b.max[2] - b.min[2],
  min: b.min, max: b.max,
});
const rows = [];
let totalNear = 0, totalFar = 0, totalSite = 0;

for (const s of SITES) {
  const b = bakeSite(s, STUB);
  const nT = b.near.i.length / 3, fT = b.far.i.length / 3, sT = b.site.i.length / 3;
  totalNear += nT; totalFar += fT; totalSite += sT;
  const bud = BUDGET[s.key];
  if (!bud) { fail(`${s.key}: no entry in BUDGET`); continue; }
  if (nT > bud.near) fail(`${s.key}: near bake ${nT} tris > budget ${bud.near}`);
  if (fT > bud.far) fail(`${s.key}: far bake ${fT} tris > budget ${bud.far}`);
  if (sT > bud.site) fail(`${s.key}: paving ${sT} tris > budget ${bud.site}`);
  if (!nT) fail(`${s.key}: near bake is empty`);
  if (!fT) fail(`${s.key}: far bake is empty`);

  // no NaN / Inf anywhere
  for (const arr of [b.near.v, b.far.v, b.site.v]) {
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) { fail(`${s.key}: non-finite vertex component at ${i}`); break; }
    }
  }
  // indices in range, whole triangles
  for (const [nm, m] of [['near', b.near], ['far', b.far], ['site', b.site]]) {
    if (m.i.length % 3) fail(`${s.key} ${nm}: index buffer is not whole triangles`);
    const n = m.v.length / 9;
    for (let i = 0; i < m.i.length; i++) {
      if (m.i[i] < 0 || m.i[i] >= n) { fail(`${s.key} ${nm}: index out of range`); break; }
    }
  }

  // ---- the LOD swap must not be visible as a pop. The far bake is the same
  // building minus the small parts, so its bounding box has to match the near
  // one to within the depth of a window reveal plus a railing.
  const N = bbox(b.near), F = bbox(b.far);
  for (const k of [0, 1, 2]) {
    const dmin = Math.abs(N.min[k] - F.min[k]), dmax = Math.abs(N.max[k] - F.max[k]);
    if (dmin > 3.2 || dmax > 3.2) {
      fail(`${s.key}: far bake bounds differ from near by ${Math.max(dmin, dmax).toFixed(1)} m `
        + `on axis ${k} — that swap would pop`);
    }
  }
  // ... and it must keep the window rhythm, not just the massing: the far bake
  // draws one flat pane per opening, so it cannot be a bare box.
  if (fT < nT * 0.04) fail(`${s.key}: far bake is only ${fT} tris against ${nT} — too bare to match`);

  // colliders: every hero has walls you cannot drive through
  const col = bakeColliders(s);
  if (col.count < 4) fail(`${s.key}: only ${col.count} colliders`);
  const probe = [];
  col.into(probe, s.cx, s.cz, s.r);
  if (!probe.length) fail(`${s.key}: colliders do not answer a query at the site centre`);

  rows.push([s.key, nT, bud.near, fT, bud.far, sT, bud.site, col.count,
    N.w.toFixed(0) + '×' + N.d.toFixed(0) + '×' + N.h.toFixed(0)]);
}
ok(`all ${SITES.length} sites inside budget (${totalNear | 0} near + ${totalFar | 0} far `
  + `+ ${totalSite | 0} paving tris)`);
ok('far bakes share the near silhouette — the LOD swap at ' + HERO_NEAR + ' m is not a pop');

if (table) {
  console.log('\n  site         near/budget      far/budget    paving/budget  seg   extent');
  for (const r of rows) {
    console.log('  ' + r[0].padEnd(12)
      + String(r[1]).padStart(6) + '/' + String(r[2]).padEnd(7)
      + String(r[3]).padStart(6) + '/' + String(r[4]).padEnd(6)
      + String(r[5]).padStart(6) + '/' + String(r[6]).padEnd(6)
      + String(r[7]).padStart(5) + '   ' + r[8]);
  }
  console.log();
}

// ---------------------------------------------------------------- the places

// `foodcourt` is here because « Poutine express » aims at it: the first job in
// the game must finish at a door somebody built, not at the mall's centroid.
for (const k of ['pwhs', 'symmesjr', 'british', 'heritage', 'marina', 'symmes', 'mike', 'foodcourt']) {
  const p = PLACES[k];
  if (!p) { fail(`PLACES.${k} is missing`); continue; }
  if (!p.label) fail(`PLACES.${k} has no label`);
}
ok('every hero destination is in PLACES with a label');

// The one thing the owner will notice instantly: the Auberge Symmes is a
// landmark, not a school, and nothing player-facing may say otherwise.
if (/school|école|junior|high/i.test(PLACES.symmes.label)) {
  fail('PLACES.symmes is labelled as a school — it is the 1831 inn');
}
const innSign = SITES.find((s) => s.key === 'symmesinn').sign;
if (/school|école|junior|high/i.test(innSign.text + ' ' + innSign.sub)) {
  fail('the Auberge Symmes sign calls it a school');
}
ok('the Auberge Symmes is signed as an inn/museum, never as a school');

// ------------------------------------------------------------ the clubhouse
//
// PLAYTEST #36: « three bare brown wall slabs with no roof ». world.js does
// carry a named-clubhouse special case, but it gables the footprint's BOUNDING
// BOX, and this footprint is a 28-sided blob with a 7 m step-out on the east —
// so the roof hung over nothing and the walls ran into the sky. The site is
// landmarks.js's now. Three things have to stay true for that to hold.
{
  const golf = SITES.find((s) => s.key === 'golf');
  if (!golf) fail('there is no golf clubhouse site');
  else {
    // 1. world.js must not roof it as well: two roofs in one place is worse
    //    than none, and landmarks.js is imported before buildWorld runs.
    const b = MAP.buildings.find((q) => q.id === 235894221);
    if (!b) fail('the clubhouse footprint vanished from MAP');
    else if (b.name) fail('world.js can still see the clubhouse by name — it will roof it too');
    else ok('the OSM clubhouse footprint is collapsed, so world.js no longer roofs it');

    // 2. the roof has to be ABOVE the walls and inside the outline, not a plane
    //    hanging over the car park. The OSM mass is 6.2 m; the near bake must
    //    reach higher than that and must not reach wider than the footprint
    //    plus an eave.
    const bake = bakeSite(golf, STUB);
    const N = bbox(bake.near);
    if (N.h < 7.5) fail(`the clubhouse is only ${N.h.toFixed(1)} m tall — the roof is missing`);
    else ok(`the clubhouse stands ${N.h.toFixed(1)} m to the lantern, over a 6.2 m mass`);
    // The real OSM outline reaches 33.6 m from its centroid at the far
    // south-west corner. The veranda and the porte-cochère legitimately project
    // past the walls; seven metres of roof over open grass is what this test
    // exists to stop coming back, so 42 m is the whole allowance.
    const reach = Math.max(
      Math.hypot(N.min[0] - golf.cx, N.min[2] - golf.cz),
      Math.hypot(N.max[0] - golf.cx, N.max[2] - golf.cz));
    if (reach > 42) {
      fail(`the clubhouse mesh reaches ${reach.toFixed(1)} m from centre against a `
        + '33.6 m footprint — something is hanging over nothing again');
    } else ok(`nothing reaches past ${reach.toFixed(1)} m — no roof over open grass`);

    // 3. you cannot drive through it.
    const col = bakeColliders(golf);
    if (col.count < 20) fail(`the clubhouse has only ${col.count} wall colliders`);
    else ok(`the clubhouse outline is ${col.count} wall colliders, not a box`);
  }
}

// ---------------------------------------------------------------- the couch

if (Math.hypot(COUCH.x - MIKE_MAPLE.x, COUCH.z - MIKE_MAPLE.z) > 4.0) {
  fail('the couch is not in the maple');
}
if (COUCH.y < 4.5 || COUCH.y > MIKE_MAPLE.crownY + 3) {
  fail(`the couch is at ${COUCH.y} m — wanted "high in the branches", not on the lawn`);
}
if (LANDMARK_FLAGS.couchInTree !== true) fail('the couch should be there by default');
ok(`the couch is lodged ${COUCH.y} m up in the maple at 129 Frank-Robinson`);

// ---------------------------------------------------------------- ring maths

const r = rectRing(10, -20, 8, 4, 0.3);
const out = offsetRing(r, 0.5);
for (let i = 0; i < 4; i++) {
  const d = Math.hypot(out[i][0] - r[i][0], out[i][1] - r[i][1]);
  if (d < 0.6 || d > 0.9) fail(`offsetRing moved a rectangle corner by ${d.toFixed(2)} m, want ~0.71`);
}
ok('offsetRing mitres a rectangle corner correctly');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nlandmarks: all good');
process.exit(failures ? 1 : 0);
