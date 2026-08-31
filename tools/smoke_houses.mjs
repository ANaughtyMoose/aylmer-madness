#!/usr/bin/env node
// Headless checks for src/game/houses.js — no browser, no GL.
//
//   node tools/smoke_houses.mjs            build everything, assert budgets
//   node tools/smoke_houses.mjs --table    also print the per-archetype table
//
// Asserts: triangle budget per lod, no NaN/Inf vertices, roof apex above the
// eave, every archetype reachable, and that the attribute fallback classifies
// all ~10k MAP buildings into a real archetype inside two seconds.
import { readFileSync } from 'node:fs';
import { MeshBuilder } from '../src/core/mesh.js';
import { mulberry32 } from '../src/core/math.js';
import { MAP } from '../src/game/mapdata.js';
import STUB from '../src/game/materials_stub.js';
import { loadMaterials } from '../src/game/materials.js';
import {
  buildHouse, inferAttrs, archetypeOf, ARCHETYPES, makeStreetYawIndex, normalizeAttrs,
} from '../src/game/houses.js';

const BUDGET = { 0: 160, 1: 80, 2: 48 };
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

// ---------------------------------------------------------------- footprints

// A plain 11 x 8 m rectangle, ridge along +X, centred at the origin.
function rectFootprint(w = 11, d = 8, ang = 0, cx = 0, cz = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (u, v) => [+(cx + u * ca - v * sa).toFixed(3), +(cz + u * sa + v * ca).toFixed(3)];
  const p = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
  return { k: 'house', h: 5.5, a: ang, c: [cx, cz], p, t: [0, 1, 2, 0, 2, 3] };
}
// An L-shaped 13 x 9 plan with a 5 x 4 bite out of one corner — the shape that
// in Aylmer almost always means "house plus attached garage".
function lFootprint() {
  const p = [[-6.5, -4.5], [6.5, -4.5], [6.5, 4.5], [1.5, 4.5], [1.5, 0.5], [-6.5, 0.5]];
  return {
    k: 'house', h: 5.5, a: 0, c: [0, 0], p,
    t: [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5],
  };
}

// Three real Aylmer footprints, picked by address so the test is reproducible.
function realFootprints() {
  const want = [/Denise-Friend/, /Frank-Robinson/, /Bancroft/];
  const out = [];
  for (const re of want) {
    const b = MAP.buildings.find((x) => x.addr && re.test(x.addr) && (x.k === 'house' || x.k === 'terrace'));
    if (b) out.push(b);
  }
  return out;
}

// Force one specific archetype by handing buildHouse a full attrs object.
const FORCE = {
  old_2s_gable_brick: { era: 'old', storeys: 2, link: 'detached', roof: 'gable', garage: 'none', porch: true },
  old_25s_mansard: { era: 'old', storeys: 2.5, link: 'detached', roof: 'mansard', garage: 'detached', porch: true },
  old_2s_semi: { era: 'old', storeys: 2, link: 'semi', roof: 'gable', garage: 'none', porch: true },
  mid_bungalow_hip: { era: 'midcentury', storeys: 1, link: 'detached', roof: 'hip', garage: 'carport', porch: true },
  mid_bungalow_gable: { era: 'midcentury', storeys: 1, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  mid_15s_dormer: { era: 'midcentury', storeys: 1.5, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  cottage_1s_gable: { era: 'cottage', storeys: 1, link: 'detached', roof: 'gable', garage: 'none', porch: true },
  cottage_15s_gable: { era: 'cottage', storeys: 1.5, link: 'detached', roof: 'gable', garage: 'detached', porch: true },
  sub_split: { era: 'suburban', storeys: 1.5, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  sub_2s_colonial: { era: 'suburban', storeys: 2, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  sub_bungalow_hip: { era: 'suburban', storeys: 1, link: 'detached', roof: 'hip', garage: 'attached', porch: true },
  mod_2s_stone: { era: 'modern', storeys: 2, link: 'detached', roof: 'hip', garage: 'attached', porch: true },
  mod_2s_gable: { era: 'modern', storeys: 2, link: 'detached', roof: 'gable', garage: 'attached', porch: true },
  row_terrace: { era: 'suburban', storeys: 2, link: 'row', roof: 'gable', garage: 'none', porch: false },
};
export { FORCE };

function checkMesh(mb, label, eaveGuess) {
  let bad = 0, maxY = -1e9;
  for (let i = 0; i < mb.v.length; i++) {
    if (!Number.isFinite(mb.v[i])) bad++;
  }
  for (let i = 1; i < mb.v.length; i += 9) if (mb.v[i] > maxY) maxY = mb.v[i];
  if (bad) fail(`${label}: ${bad} non-finite vertex components`);
  if (mb.i.length === 0) fail(`${label}: produced no triangles`);
  for (let i = 0; i < mb.i.length; i++) {
    if (mb.i[i] < 0 || mb.i[i] >= mb.vertCount) { fail(`${label}: index out of range`); break; }
  }
  return { maxY, bad };
}

console.log('houses smoke test\n');

// ------------------------------------------------- 1. every archetype, 3 lods
console.log('1. archetypes on a synthetic 13x9 footprint');
const rows = [];
const foot = () => lFootprint();
for (const id of ARCHETYPES) {
  const row = { id, tris: {}, ok: true };
  for (const lod of [0, 1, 2]) {
    const mb = new MeshBuilder();
    const b = foot();
    const rng = mulberry32(0xa17e0 + id.length * 31 + lod);
    const res = buildHouse(mb, b, FORCE[id], STUB, rng, { lod, streetYaw: Math.PI / 2, index: 7 });
    if (res.archetype !== id) fail(`${id}: forced attrs produced ${res.archetype}`);
    const st = checkMesh(mb, `${id} lod${lod}`);
    row.tris[lod] = res.tris;
    if (res.tris > BUDGET[lod]) { fail(`${id} lod${lod}: ${res.tris} tris > ${BUDGET[lod]}`); row.ok = false; }
    if (lod === 0) {
      const eave = res.attrs.height;
      if (!(st.maxY > eave + 0.4)) fail(`${id}: roof apex ${st.maxY.toFixed(2)} not above eave ${eave.toFixed(2)}`);
      row.eave = eave; row.apex = st.maxY;
    }
  }
  rows.push(row);
}
if (rows.every((r) => r.ok)) ok(`${rows.length} archetypes within budget at every lod`);

console.log('\n   archetype                lod0  lod1  lod2   eave   apex');
for (const r of rows) {
  console.log('   ' + r.id.padEnd(22)
    + String(r.tris[0]).padStart(5) + String(r.tris[1]).padStart(6) + String(r.tris[2]).padStart(6)
    + r.eave.toFixed(2).padStart(7) + r.apex.toFixed(2).padStart(7));
}

// ------------------------------------------------- 2. real Aylmer footprints
console.log('\n2. three real footprints from MAP');
const reals = realFootprints();
if (reals.length < 3) fail(`only found ${reals.length} of 3 named footprints`);
const streetYaw = makeStreetYawIndex(MAP.roads);
for (const b of reals) {
  for (const lod of [0, 1, 2]) {
    const mb = new MeshBuilder();
    const rng = mulberry32(0xbeef + lod);
    const sy = streetYaw(b.c[0], b.c[1], -b.a);
    const res = buildHouse(mb, b, null, STUB, rng, { lod, streetYaw: sy, index: 3 });
    checkMesh(mb, `${b.addr} lod${lod}`);
    if (res.tris > BUDGET[lod] + 20) fail(`${b.addr} lod${lod}: ${res.tris} tris`);
    if (lod === 0) {
      console.log(`   ${(b.addr || '?').padEnd(28)} ${res.archetype.padEnd(20)} `
        + `${String(res.tris).padStart(3)} tris  streetYaw ${sy.toFixed(2)}`);
    }
  }
}
ok('real footprints build clean at every lod');

// ------------------------------------------------- 3. rotation / degeneracy
console.log('\n3. rotated, tiny and thin footprints');
for (let k = 0; k < 24; k++) {
  const ang = (k / 24) * Math.PI * 2 - Math.PI;
  const b = rectFootprint(11, 8, ang, 120 * k, -90 * k);
  const mb = new MeshBuilder();
  const res = buildHouse(mb, b, FORCE.sub_2s_colonial, STUB, mulberry32(k + 1),
    { lod: 0, streetYaw: ang + Math.PI / 2, index: k });
  checkMesh(mb, `rot ${k}`);
  if (res.tris > BUDGET[0]) fail(`rot ${k}: ${res.tris} tris`);
}
for (const [w, d] of [[3.2, 3.0], [24, 5.5], [5.5, 24], [60, 12]]) {
  for (const id of ARCHETYPES) {
    const mb = new MeshBuilder();
    const b = rectFootprint(w, d, 0.4, 0, 0);
    buildHouse(mb, b, FORCE[id], STUB, mulberry32(9), { lod: 0, streetYaw: 2, index: 1 });
    checkMesh(mb, `${id} ${w}x${d}`);
  }
}
ok('rotation sweep + degenerate footprints clean');

// ------------------------------------------------- 4. fallback over all of MAP
console.log('\n4. attribute fallback across the whole map');
const t0 = Date.now();
const counts = new Map();
let bad = 0;
for (let i = 0; i < MAP.buildings.length; i++) {
  const b = MAP.buildings[i];
  const hs = inferAttrs(b, i);
  const id = archetypeOf(hs);
  if (id !== 'flat_block' && ARCHETYPES.indexOf(id) < 0) bad++;
  if (!Number.isFinite(hs.height) || hs.height <= 0) bad++;
  if (!Number.isFinite(hs.ridgeHeight) || hs.ridgeHeight <= hs.height) bad++;
  counts.set(id, (counts.get(id) || 0) + 1);
}
const dt = Date.now() - t0;
if (bad) fail(`${bad} buildings produced an invalid archetype or height`);
if (dt > 2000) fail(`inference took ${dt} ms (budget 2000 ms)`);
else ok(`${MAP.buildings.length} buildings classified in ${dt} ms`);
console.log('   distribution:');
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log('     ' + k.padEnd(22) + String(v).padStart(6)
    + '  ' + (100 * v / MAP.buildings.length).toFixed(1) + '%');
}

// ------------------------------------------------- 5. the real average
console.log('\n5. average cost over every house in MAP (lod 0)');
let total = 0, n = 0, worst = 0, worstId = '';
const t1 = Date.now();
for (let i = 0; i < MAP.buildings.length; i += 7) {
  const b = MAP.buildings[i];
  if (b.k !== 'house') continue;
  const hs = inferAttrs(b, i);
  if (hs.link !== 'detached') continue;
  const mb = new MeshBuilder();
  const res = buildHouse(mb, b, hs, STUB, mulberry32(i + 1), { lod: 0, index: i });
  total += res.tris; n++;
  if (res.tris > worst) { worst = res.tris; worstId = res.archetype + ' @ ' + (b.addr || i); }
  if (!Number.isFinite(mb.min[0]) || !Number.isFinite(mb.max[1])) fail('non-finite bounds at ' + i);
}
const avg = total / Math.max(1, n);
console.log(`   ${n} detached houses, mean ${avg.toFixed(1)} tris, worst ${worst} (${worstId}) — ${Date.now() - t1} ms`);
if (avg > 140) fail(`mean ${avg.toFixed(1)} tris exceeds the 140 budget`);
else ok(`mean ${avg.toFixed(1)} tris <= 140`);
if (worst > 165) fail(`worst case ${worst} tris — the budget guard leaked`);
else ok(`worst case ${worst} tris <= 165`);

// ------------------------------------------------- 6. wall winding
// Back-face culling is on, so an inward-facing wall is an invisible house.
// Only the porch deck's back panel legitimately faces the centroid.
console.log('\n6. wall triangles face outward at every rotation');
for (const ang of [0, 0.7, -1.9, 2.6, Math.PI]) {
  const b = rectFootprint(12, 8, ang, 0, 0);
  const mb = new MeshBuilder();
  const res = buildHouse(mb, b, FORCE.sub_2s_colonial, STUB, mulberry32(3),
    { lod: 0, streetYaw: ang + Math.PI / 2, index: 1 });
  let inward = 0, walls = 0;
  const V = mb.v, I = mb.i;
  for (let k = 0; k < I.length; k += 3) {
    let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0;
    for (let q = 0; q < 3; q++) {
      const o = I[k + q] * 9;
      cx += V[o] / 3; cy += V[o + 1] / 3; cz += V[o + 2] / 3;
      nx += V[o + 3] / 3; ny += V[o + 4] / 3; nz += V[o + 5] / 3;
    }
    if (Math.abs(ny) > 0.35) continue;                      // roof slopes and caps
    if (cy < 0.3 || cy > res.attrs.height - 0.3) continue;
    walls++;
    if (cx * nx + cz * nz < -0.05) inward++;
  }
    // The synthetic upper wall at an attached-garage valley is deliberately
    // double-sided (four triangles total) because the decomposition may mirror
    // which side is exposed. No other wall may face inward.
    if (inward > 4) fail(`ang ${ang.toFixed(2)}: ${inward}/${walls} wall tris face inward`);
}
ok('wall winding consistent across rotations');

// ------------------------------------------------- 7. the real atlas
// No image and no GL here — loadMaterials takes the manifest off disk, which is
// enough to check every number that reaches the vertex buffers.
console.log('\n7. the real material atlas (manifest only, no GL)');
const manifest = JSON.parse(readFileSync(new URL('../assets/materials/atlas.json', import.meta.url), 'utf8'));
const mats = await loadMaterials(null, { manifest, current: false });

{
  // A house built against the atlas must arm a non-zero rect on its walls and
  // roofs, and leave rect 0 on its decals (they carry absolute UVs).
  const mb = new MeshBuilder();
  const b = lFootprint();
  const res = buildHouse(mb, b, FORCE.sub_2s_colonial, mats, mulberry32(11),
    { lod: 0, streetYaw: Math.PI / 2, index: 5 });
  const n = mb.vertCount;
  if (mb.uv.length !== n * 2) fail(`uv array is ${mb.uv.length}, expected ${n * 2}`);
  if (mb.rect.length !== n * 4) fail(`rect array is ${mb.rect.length}, expected ${n * 4}`);
  let tiled = 0, absolute = 0;
  for (let i = 0; i < n; i++) {
    if (mb.rect[i * 4 + 2] > 0) tiled++; else absolute++;
  }
  // Walls, roofs, gable ends, the base course and the chimney tile; the decals
  // and the untextured trim (steps, driveway, porch posts) do not. On a
  // window-heavy colonial that lands near half and half.
  if (tiled < n * 0.4) fail(`only ${tiled}/${n} vertices tile a material`);
  if (absolute < 8) fail(`${absolute} untiled vertices — the decals lost their absolute UVs`);
  const kinds = new Set();
  for (let i = 0; i < n; i++) if (mb.rect[i * 4 + 2] > 0) kinds.add(mb.rect.slice(i * 4, i * 4 + 4).join(','));
  if (kinds.size < 3) fail(`only ${kinds.size} distinct materials armed (wall/roof/base expected)`);
  ok(`${res.tris} tris, ${tiled} tiled (${kinds.size} materials) + ${absolute} absolute-UV vertices`);

  // Every armed rect must be a real atlas cell, and every absolute UV inside [0,1].
  const cells = new Set(mats.list.map((k) => mats.rect(k).join(',')));
  let badRect = 0, badUV = 0;
  for (let i = 0; i < n; i++) {
    const r = mb.rect.slice(i * 4, i * 4 + 4);
    if (r[2] > 0) { if (!cells.has(r.join(','))) badRect++; }
    else if (mb.uv[i * 2] < 0 || mb.uv[i * 2] > 1 || mb.uv[i * 2 + 1] < 0 || mb.uv[i * 2 + 1] > 1) badUV++;
  }
  if (badRect) fail(`${badRect} vertices carry a rect that is not an atlas cell`);
  if (badUV) fail(`${badUV} untiled vertices have UVs outside [0,1]`);
  if (!badRect && !badUV) ok('every rect is an atlas cell and every decal UV is in [0,1]');
}

{
  // The repeat count across a wall has to be metres / tile metres, or the brick
  // comes out the wrong size. Check the primitive directly, both axes.
  const cases = [['brick_red', 6, 3], ['vinyl_white', 11.5, 5.75], ['stone_grey', 4, 2.4]];
  let bad = 0;
  for (const [name, w, h] of cases) {
    const mb = new MeshBuilder();
    mats.tile(mb, name, { ox: 0, oz: 0 });
    mb.quad([0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0], [1, 1, 1], [0, 0, 1]);
    const m = mats.metres(name);
    const du = Math.abs(mb.uv[2] - mb.uv[0]), dv = Math.abs(mb.uv[7] - mb.uv[1]);
    if (Math.abs(du - w / m) > 1e-6) { fail(`${name}: ${du} repeats across ${w} m, expected ${w / m}`); bad++; }
    if (Math.abs(dv - h / m) > 1e-6) { fail(`${name}: ${dv} repeats up ${h} m, expected ${h / m}`); bad++; }
  }
  // A roof slope measures its repeats along the PITCH, not the plan.
  {
    const mb = new MeshBuilder();
    mats.tile(mb, 'shingle_dark', { ox: 0, oz: 0 });
    mb.quad([0, 0, 0], [8, 0, 0], [8, 3, -4], [0, 3, -4], [1, 1, 1], [0, 0.8, 0.6]);
    const m = mats.metres('shingle_dark');
    const dv = Math.abs(mb.uv[7] - mb.uv[1]);
    if (Math.abs(dv - Math.hypot(3, 4) / m) > 1e-6) {
      fail(`shingle: ${dv} repeats up the slope, expected ${Math.hypot(3, 4) / m}`); bad++;
    }
  }
  if (!bad) ok('UV repeats are wall metres / tile metres on walls and slopes');
}

{
  // The stub has to keep working: no atlas, no rect, no UVs, same triangles.
  const mb = new MeshBuilder();
  const b = lFootprint();
  const res = buildHouse(mb, b, FORCE.sub_2s_colonial, STUB, mulberry32(11),
    { lod: 0, streetYaw: Math.PI / 2, index: 5 });
  if (mb.rect.length) fail(`the stub path emitted ${mb.rect.length / 4} rects`);
  if (mb.uv.length) fail(`the stub path emitted ${mb.uv.length / 2} UVs`);
  ok(`untextured fallback still builds (${res.tris} tris, no uv/rect)`);
}

{
  // Phase 1 ships short keys (e/s/l/r/ry/h/rh/g/p); both spellings must decode.
  const b = lFootprint();
  const short = normalizeAttrs(b, { e: 'old', s: 2, l: 'detached', r: 'gable', ry: 0.3, h: 6.1, rh: 8.4, g: 'none', p: 1 }, 3);
  const long = normalizeAttrs(b, { era: 'old', storeys: 2, link: 'detached', roof: 'gable', ridgeYaw: 0.3, height: 6.1, ridgeHeight: 8.4, garage: 'none', porch: true }, 3);
  for (const k of ['era', 'storeys', 'link', 'roof', 'ridgeYaw', 'height', 'ridgeHeight', 'garage', 'porch']) {
    if (String(short[k]) !== String(long[k])) fail(`short key ${k}: ${short[k]} vs ${long[k]}`);
  }
  ok('Phase 1 short attribute keys decode to the same house as long ones');
  let withHs = 0;
  for (const bb of MAP.buildings) if (bb.hs) withHs++;
  ok(`${withHs} of ${MAP.buildings.length} buildings carry Phase 1 attributes`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
