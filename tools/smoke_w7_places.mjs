#!/usr/bin/env node
// The five places pass (w7-places, 27 Oct 2026):  node tools/smoke_w7_places.mjs
// V3-04 designs 1 to 3 and D-12 (Super C, Galeries name, Grande-Riviere lines).
// Pure node: landmarks.js, landcover.js and mapdata only, no world bake.
import { MAP } from '../src/game/mapdata.js';
import STUB from '../src/game/materials_stub.js';
import { STRIDE } from '../src/core/mesh.js';
import {
  SITES, BUDGET, HIDE_MISSES, HERO_NEAR, bakeSite, bakeColliders,
  TIMS, TIMS_SIGN, TIMS_LAMP, TIMS_LOT, TIMS_SITE, SAINT_PAUL, CT_PYLON, SUPER_C, GALERIES_NAME,
} from '../src/game/landmarks.js';
import { fieldLines, fieldPieces } from '../src/game/world/landcover.js';

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { if (c) pass++; else fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${extra ? '   ' + extra : ''}`); };
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const segD = (x, z, ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez || 1; const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l)); return Math.hypot(ax + ex * t - x, az + ez * t - z); };
const pts = (m) => Array.from({ length: m.v.length / STRIDE }, (_, i) => m.v.slice(i * STRIDE, i * STRIDE + 3));

console.log('the Tim\'s');
const tims = SITES.filter((s) => s.key === 'timhortons');
ok(tims.length === 1 && tims[0] === TIMS_SITE && TIMS_SITE.v304, 'tims replaces the strip shop', `${tims.length} entry`);
ok(!HIDE_MISSES.length, 'every hidden footprint found');
const fp = MAP.buildings.find((b) => b.id === 94173715);
ok(fp && fp.h < 0.05 && fp.p.length === 3, 'footprint 94173715 collapsed');
const timsTexts = [TIMS_SITE.sign, ...(TIMS_SITE.signs || [])].filter(Boolean).map((g) => g.text + ' ' + g.sub).join(' ');
ok(!/drive|volant|commande/i.test(timsTexts), 'tims has no drive-through board (Tom, 6 Oct)');
ok(TIMS_SIGN.w >= 5.2 && TIMS_SIGN.h >= 1.5 && TIMS_SIGN.h / (60 * Math.tan(0.575)) * 1080 >= 40,
  'tims sign reads at 30 m', `${(TIMS_SIGN.h / (60 * Math.tan(0.575)) * 1080).toFixed(1)} px`);
const [ea, eb] = [TIMS.ring[2], TIMS.ring[3]];
ok(segD(TIMS_SIGN.x, TIMS_SIGN.z, ...ea, ...eb) <= 0.2 && Math.abs(TIMS_SIGN.z + 182) <= 1, 'tims sign sits on the east wall at z -182');
ok(TIMS_LAMP.x === -233 && TIMS_LAMP.z === -163.5 && TIMS_LAMP.h === 4.2 && !inPoly(TIMS.ring, TIMS_LAMP.x, TIMS_LAMP.z), 'heritage lamp at the contract point, outside the building');
let lampGap = Infinity;
for (const r of MAP.roads) if (r.name === 'Rue Principale' || r.name === 'Boulevard Wilfrid-Lavigne')
  for (let i = 0; i + 1 < r.pts.length; i++) lampGap = Math.min(lampGap, segD(TIMS_LAMP.x, TIMS_LAMP.z, ...r.pts[i], ...r.pts[i + 1]) - r.w / 2);
ok(lampGap >= 1.5, 'lamp clear of Principale and Wilfrid-Lavigne asphalt', `${lampGap.toFixed(2)} m`);
ok(TIMS_LOT.x === -264 && TIMS_LOT.w === 22, 'TIMS_LOT contract');
const tb = bakeSite(TIMS_SITE, STUB);
const tT = [tb.near, tb.far, tb.site].map((m) => m.i.length / 3);
ok(tT[0] <= BUDGET.timhortons.near && tT[1] <= BUDGET.timhortons.far && tT[2] <= BUDGET.timhortons.site,
  'tims inside its budget', `${tT.join(' / ')} vs ${Object.values(BUDGET.timhortons).join(' / ')}`);
ok(tb.near.max[1] >= TIMS.ridgeY - 0.1 && tb.far.max[1] >= TIMS.ridgeY - 0.1, 'the gable ridge stands in both bakes', `${tb.near.max[1].toFixed(2)} m`);
// No site paving outside the ring + 12 m except in the lot or the forecourt box.
let stray = 0;
for (const p of pts(tb.site)) {
  const inLot = Math.abs(p[0] - TIMS_LOT.x) <= TIMS_LOT.w / 2 + 2 && Math.abs(p[2] - TIMS_LOT.z) <= TIMS_LOT.d / 2 + 2;
  const inFore = p[0] > -249 && p[0] < -233 && p[2] > -166.5 && p[2] < -155.5;
  let d = inPoly(TIMS.ring, p[0], p[2]) ? 0 : Infinity;
  for (let i = 0; i < 4; i++) d = Math.min(d, segD(p[0], p[2], ...TIMS.ring[i], ...TIMS.ring[(i + 1) % 4]));
  if (d > 12 && !inLot && !inFore) stray++;
}
ok(stray === 0, 'no lane or paving beyond the lot and forecourt (no drive-through)', `${stray} stray vertices`);

console.log('Saint-Paul');
const br = SITES.find((s) => s.key === 'british');
const ch = MAP.buildings.find((b) => b.id === SAINT_PAUL.id);
ok(ch && ch.h < 0.05, 'footprint 68609126 collapsed');
ok(br.near === HERO_NEAR && Math.hypot(br.cx + 916, br.cz + 112) < 1, 'british centre and near radius unchanged');
const bb = bakeSite(br, STUB);
for (const [nm, m, cap] of [['near', bb.near, BUDGET.british.near], ['far', bb.far, BUDGET.british.far]]) {
  const has = m.min[0] <= SAINT_PAUL.x + 1 && m.max[0] >= SAINT_PAUL.x - 1 && m.min[2] <= SAINT_PAUL.z + 1 && m.max[2] >= SAINT_PAUL.z - 1 && Math.abs(m.max[1] - SAINT_PAUL.tip) <= 1;
  ok(has && m.i.length / 3 <= cap, `the spire tip is in the british ${nm} bake, inside budget`, `${m.i.length / 3}/${cap}, top ${m.max[1].toFixed(1)} m`);
}
const col = bakeColliders(br), q = [];
col.into(q, -926, -397, 10);
ok(q.length >= 4, 'church walls answer a query by the church', `${q.length} segments`);

console.log('the Galeries and the Super C');
const ga = SITES.find((s) => s.key === 'galeries');
const boards = [ga.sign, ...(ga.signs || [])];
const onSite = (g) => boards.some((b) => b && b.text === g.text && b.x === g.x && b.z === g.z && b.yaw === g.yaw);
ok(onSite(SUPER_C) && onSite(GALERIES_NAME) && onSite(CT_PYLON), 'the three boards are on the galeries site');
const mall = MAP.buildings.find((b) => b.id === 68609502);
for (const g of [SUPER_C, GALERIES_NAME]) {
  const nx = -Math.sin(g.yaw), nz = Math.cos(g.yaw);
  ok(!inPoly(mall.p, g.x + nx * 0.13, g.z + nz * 0.13), `${g.text}: the face is outside the mall footprint`);
}
const superFaces = SITES.flatMap((s) => [s.sign, ...(s.signs || [])].filter(Boolean))
  .filter((g) => g.text === 'Super C' && Math.hypot(g.x - 63, g.z + 276) < 60);
ok(superFaces.length === 1, 'exactly one Super C board on the mall wall');
const gb = bakeSite(ga, STUB);
const legs = pts(gb.site).filter((p) => p[1] <= 0.05 && [-1, 1].some((s) => Math.hypot(p[0] - (CT_PYLON.x + s * 3.2), p[2] - CT_PYLON.z) < 0.5));
ok(legs.length >= 4 && CT_PYLON.y >= 4, 'the Canadian Tire pylon stands on posts from the ground', `${legs.length} post-foot vertices`);

console.log('Grande-Riviere');
const F = fieldLines();
const track = F.find((f) => f.kind === 'track'), grid = F.find((f) => f.kind === 'gridiron');
ok(track && grid, 'one track and one gridiron', F.map((f) => `${f.kind} ${f.segs.length}`).join(', '));
const len = F.reduce((s, f) => s + f.segs.reduce((a, g) => a + Math.hypot(g[2] - g[0], g[3] - g[1]), 0), 0);
ok(len >= 1200 && len <= 2100, 'total line length', `${len.toFixed(0)} m`);
const school = MAP.areas.find((a) => a.k === 'school' && a.name === 'École secondaire Grande-Rivière');
ok(F.every((f) => f.segs.every((g) => inPoly(school.p, g[0], g[1]) && inPoly(school.p, g[2], g[3]))), 'every line end inside the school ground');
const all = fieldPieces(null).length, west = fieldPieces((x) => x < -640).length, east = fieldPieces((x) => x >= -640).length;
ok(all === west + east && all > 0, 'slices emit each piece once', `${west} + ${east} = ${all}`);
ok(all * 2 <= 2000, 'field-line tris inside 2000', `${all * 2}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
