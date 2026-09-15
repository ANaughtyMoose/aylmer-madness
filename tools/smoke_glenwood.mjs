#!/usr/bin/env node
// Headless checks for the Glenwood bungalows (src/game/glenwood.js via houses.js).
//
//   node tools/smoke_glenwood.mjs
//
// Asserts, for all three variants: triangle budget per lod, finite geometry,
// front/back orientation at every rotation and street side, carport clearance,
// a shallow roof whose apex is really above the eave, structure kept inside the
// footprint (+ eave overhang), and that the default selection only ever touches
// detached one-storey houses on Rue Glenwood.
import { MeshBuilder } from '../src/core/mesh.js';
import { mulberry32 } from '../src/core/math.js';
import { MAP } from '../src/game/mapdata.js';
import STUB from '../src/game/materials_stub.js';
import {
  buildHouse, normalizeAttrs, glenwoodPlan, makeStreetYawIndex, GLENWOOD_VARIANTS, GLENWOOD_STREETS,
} from '../src/game/houses.js';

const BUDGET = { 0: 160, 1: 80, 2: 48 };
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

const ATTRS = { era: 'midcentury', storeys: 1, link: 'detached', roof: 'gable', garage: 'carport', porch: false };
const SIZE = { glenwood_carport: [16, 10], glenwood_picture: [13.5, 10], glenwood_porch: [9, 8.5] };

// W along u (x' of the ridge frame), D along v; street toward +v when streetYaw = ang + PI/2.
function rect(w, d, ang, cx = 0, cz = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (u, v) => [cx + u * ca - v * sa, cz + u * sa + v * ca];
  return { k: 'house', h: 5.5, a: ang, c: [cx, cz],
    p: [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)], t: [0, 1, 2, 0, 2, 3] };
}

function build(variant, b, lod, streetYaw, index = 7) {
  const mb = new MeshBuilder();
  const res = buildHouse(mb, b, ATTRS, STUB, mulberry32(1), { lod, streetYaw, index, glenwood: variant });
  return { mb, res };
}

function finite(mb, label) {
  for (let i = 0; i < mb.v.length; i++) if (!Number.isFinite(mb.v[i])) { fail(`${label}: non-finite vertex`); return false; }
  if (!mb.i.length) { fail(`${label}: no triangles`); return false; }
  return true;
}

console.log('glenwood smoke test\n');

// ------------------------------------------------ 1. budget + table
console.log('1. variants x lods on their reference footprints');
console.log('   variant             lod0  lod1  lod2  eave  ridge  clear  side');
for (const v of GLENWOOD_VARIANTS) {
  const [w, d] = SIZE[v];
  const tris = [];
  let r0 = null;
  for (const lod of [0, 1, 2]) {
    const { mb, res } = build(v, rect(w, d, 0), lod, Math.PI / 2);
    finite(mb, `${v} lod${lod}`);
    if (res.archetype !== v) fail(`${v} lod${lod}: built ${res.archetype}`);
    if (res.tris > BUDGET[lod]) fail(`${v} lod${lod}: ${res.tris} tris > ${BUDGET[lod]}`);
    tris.push(res.tris);
    if (lod === 0) {
      r0 = res;
      let maxY = -1e9;
      for (let i = 1; i < mb.v.length; i += 9) maxY = Math.max(maxY, mb.v[i]);
      const rise = res.attrs.ridgeHeight - res.attrs.height;
      if (!(rise > 0.6 && rise < 1.7)) fail(`${v}: roof rise ${rise.toFixed(2)} not a shallow gable`);
      if (!(maxY >= res.attrs.ridgeHeight - 0.01)) fail(`${v}: apex ${maxY.toFixed(2)} below ridge`);
      if (v !== 'glenwood_porch' && !(res.glenwood.clearance >= 2.3)) {
        fail(`${v}: carport clearance ${res.glenwood.clearance.toFixed(2)} m < 2.3`);
      }
    }
  }
  const c = r0.glenwood.clearance;
  console.log('   ' + v.padEnd(18) + tris.map((t) => String(t).padStart(6)).join('')
    + r0.attrs.height.toFixed(2).padStart(6) + r0.attrs.ridgeHeight.toFixed(2).padStart(7)
    + (Number.isFinite(c) ? c.toFixed(2) : '  -  ').padStart(7) + String(r0.glenwood.side).padStart(6));
}
ok('three variants inside 160 / 80 / 48 with shallow roofs and carport clearance');

// ------------------------------------------------ 2. orientation + footprint
// Low things standing well outside the footprint (steps, porch deck, walk, driveway)
// must all be on the street side; everything tall must stay within the eave overhang.
console.log('\n2. front/back orientation and footprint at 24 rotations x 4 street sides');
let cases = 0;
for (const v of GLENWOOD_VARIANTS) {
  const [w, d] = SIZE[v];
  for (let k = 0; k < 24; k++) {
    const ang = (k / 24) * Math.PI * 2 - Math.PI;
    for (let q = 0; q < 4; q++) {
      const sy = ang + q * Math.PI / 2 + 0.1;
      const cx = 50 * k, cz = -30 * q;
      const b = rect(w, d, ang, cx, cz);
      const { mb, res } = build(v, b, 0, sy, k * 4 + q);
      cases++;
      if (!finite(mb, `${v} rot${k} side${q}`)) continue;
      // A street on the short side leaves less frontage than a carport needs, so a
      // smaller variant is the right answer there — but it must still be Glenwood.
      if (!GLENWOOD_VARIANTS.includes(res.archetype)) { fail(`${v} rot${k} side${q}: built ${res.archetype}`); continue; }
      const sx = Math.cos(res.front), sz = Math.sin(res.front);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let frontSum = 0, frontN = 0, backLow = 0, escaped = 0;
      for (let i = 0; i < mb.v.length; i += 9) {
        const dx = mb.v[i] - cx, y = mb.v[i + 1], dz = mb.v[i + 2] - cz;
        const u = dx * ca + dz * sa, vv = -dx * sa + dz * ca;
        const outside = Math.abs(u) > w / 2 + 0.3 || Math.abs(vv) > d / 2 + 0.3;
        const along = dx * sx + dz * sz;
        if (y > 2.2) {
          if (Math.abs(u) > w / 2 + 0.62 || Math.abs(vv) > d / 2 + 0.62) escaped++;
        } else if (outside) {
          // Ground decals (y < 0.1) may run alongside: the porch variant's driveway
          // sits beside the house. Steps, decks and railings may not.
          if (along > 0) { frontSum += along; frontN++; } else if (y > 0.1) backLow++;
        }
      }
      // the street face chosen must be the one facing the requested street
      if (Math.cos(res.front - sy) < 0.7) fail(`${v} rot${k} side${q}: front ${res.front.toFixed(2)} vs street ${sy.toFixed(2)}`);
      if (frontN < 8) fail(`${v} rot${k} side${q}: only ${frontN} entrance vertices in front`);
      if (backLow) fail(`${v} rot${k} side${q}: ${backLow} low vertices outside the back/sides`);
      if (escaped) fail(`${v} rot${k} side${q}: ${escaped} tall vertices beyond the overhang`);
    }
  }
}
ok(`${cases} orientation/footprint cases`);

// ------------------------------------------------ 3. fitting + fallbacks
console.log('\n3. narrow footprints fall back to a variant that fits');
{
  const { res } = build('glenwood_carport', rect(10.8, 9, 0), 0, Math.PI / 2);
  if (res.archetype !== 'glenwood_picture') fail(`10.8 m carport request built ${res.archetype}`);
  const { res: r2 } = build('glenwood_carport', rect(8, 8, 0), 0, Math.PI / 2);
  if (r2.archetype !== 'glenwood_porch') fail(`8 m carport request built ${r2.archetype}`);
  const { res: r3 } = build('glenwood_porch', rect(5, 5, 0), 0, Math.PI / 2);
  if (GLENWOOD_VARIANTS.includes(r3.archetype)) fail(`5 x 5 m footprint still built ${r3.archetype}`);
  const sides = new Set();
  for (let i = 0; i < 16; i++) sides.add(build('glenwood_carport', rect(16, 10, 0), 0, Math.PI / 2, i).res.glenwood.side);
  if (sides.size !== 2) fail('carport side never mirrors across seeds');
}
ok('fallback chain and mirrored carport sides');

// ------------------------------------------------ 4. selection over the real map
console.log('\n4. default selection over all of MAP');
const syAt = makeStreetYawIndex(MAP.roads);
const byVariant = new Map();
let chosen = 0, offStreet = 0, notBungalow = 0, forcedOff = 0, glenHouses = 0, overBudget = 0;
for (let i = 0; i < MAP.buildings.length; i++) {
  const b = MAP.buildings[i];
  if (b.k !== 'house' && b.k !== 'terrace' && !b.hs) continue;
  const attrs = normalizeAttrs(b, b.hs || null, i);
  const sy = syAt(b.c[0], b.c[1], -b.a);
  const plan = glenwoodPlan(b, attrs, { index: i, streetYaw: sy });
  if (b.addr && GLENWOOD_STREETS.test(b.addr)) glenHouses++;
  if (!plan) continue;
  chosen++;
  byVariant.set(plan.variant, (byVariant.get(plan.variant) || 0) + 1);
  if (!(b.addr && GLENWOOD_STREETS.test(b.addr))) offStreet++;
  if (attrs.link !== 'detached' || attrs.storeys !== 1) notBungalow++;
  if (glenwoodPlan(b, attrs, { index: i, streetYaw: sy, glenwood: false })) forcedOff++;
  const mb = new MeshBuilder();
  const res = buildHouse(mb, b, b.hs || null, STUB, mulberry32(i), { lod: 0, index: i, streetYaw: sy });
  finite(mb, b.addr);
  if (res.tris > BUDGET[0]) overBudget++;
}
console.log(`   ${glenHouses} buildings on Rue Glenwood, ${chosen} got a variant: `
  + [...byVariant].map(([k, n]) => `${k} ${n}`).join(', '));
if (offStreet) fail(`${offStreet} Glenwood houses off Rue Glenwood`);
if (notBungalow) fail(`${notBungalow} Glenwood houses are not detached one-storey`);
if (forcedOff) fail('glenwood:false did not switch the variant off');
if (overBudget) fail(`${overBudget} real Glenwood houses over 160 tris`);
if (chosen < 10) fail(`only ${chosen} Glenwood houses selected`);
if (byVariant.size < 2) fail('real Rue Glenwood got a single variant');
ok('selection is street-scoped, bungalow-only and switchable');

console.log(failures ? `\n${failures} failure(s)` : '\nall glenwood checks passed');
process.exit(failures ? 1 : 0);
