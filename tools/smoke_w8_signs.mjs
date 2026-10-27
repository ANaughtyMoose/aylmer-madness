#!/usr/bin/env node
// Wave 8 signs (w8-signs, 27 Oct 2026):  node tools/smoke_w8_signs.mjs
// D-12: the Grande-Riviere name board and the two place keys; V3-04 4: the
// lit-sign night overlay for the five recognition places. Pure node: landmarks,
// places and mapdata, a fake renderer, no world bake.
import { MAP } from '../src/game/mapdata.js';
import STUB from '../src/game/materials_stub.js';
import { STRIDE } from '../src/core/mesh.js';
import {
  SITES, BUDGET, bakeSite, bakeColliders, installLandmarks,
  GRANDE_RIVIERE, LIT_OUT, LIT_NIGHT, LIT_NEAR, TIMS_SIGN,
} from '../src/game/landmarks.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { if (c) pass++; else fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${extra ? '   ' + extra : ''}`); };
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const segD = (x, z, ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez || 1; const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l)); return Math.hypot(ax + ex * t - x, az + ez * t - z); };

console.log('Grande-Riviere board');
const gr = SITES.filter((s) => s.key === 'granderiviere');
ok(gr.length === 1 && gr[0].signs && gr[0].signs[0] === GRANDE_RIVIERE && !gr[0].hide, 'one school site, the board only, OSM building kept');
const g = GRANDE_RIVIERE;
const school = MAP.buildings.find((b) => b.id === 68609168);
const nx = -Math.sin(g.yaw), nz = Math.cos(g.yaw);
ok(school && !inPoly(school.p, g.x + nx * 0.13, g.z + nz * 0.13), 'front face outside footprint 68609168');
let wallD = Infinity;
if (school) for (let i = 0; i < school.p.length; i++) { const a = school.p[i], b = school.p[(i + 1) % school.p.length]; wallD = Math.min(wallD, segD(g.x, g.z, a[0], a[1], b[0], b[1])); }
ok(wallD >= 0.1 && wallD <= 0.3, 'board on the west wall, not off it', `${wallD.toFixed(3)} m`);
let best = null, bd = Infinity;
for (const r of MAP.roads) if (r.name === 'Rue Broad') for (let i = 0; i + 1 < r.pts.length; i++) {
  const d = segD(g.x, g.z, ...r.pts[i], ...r.pts[i + 1]); if (d < bd) { bd = d; best = r.pts[i]; }
}
const toBroad = bd < Infinity ? [(-732.1 - g.x), (-1093.7 - g.z)] : [0, 0];
const tl = Math.hypot(...toBroad) || 1;
ok(bd < 40 && (nx * toBroad[0] + nz * toBroad[1]) / tl > 0.9, 'faces Rue Broad', `${bd.toFixed(1)} m`);
ok(0.52 * g.h * 808 / 18 >= 40 && g.w / g.h <= 8, 'legible from 40 m in the chase frame', `${(0.52 * g.h * 808 / 18).toFixed(1)} m`);
ok(g.y + g.h <= 7.0 - 0.5, 'top under the 7 m wall', `${(g.y + g.h).toFixed(2)} m`);
const gb = bakeSite(gr[0], STUB);
const gt = [gb.near, gb.far, gb.site].map((m) => m.i.length / 3);
const bud = BUDGET.granderiviere;
ok(bud && gt[0] && gt[1] && gt[0] <= bud.near && gt[1] <= bud.far && gt[2] <= bud.site, 'school site inside its budget', gt.join(' / '));
const gc = bakeColliders(gr[0]); const probe = []; gc.into(probe, gr[0].cx, gr[0].cz, gr[0].r);
ok(gc.count >= 4 && probe.length, 'sign band has colliders at the site centre', `${gc.count}`);

console.log('place keys');
const world = { nearestRoad: (x, z) => ({ x, z, yaw: 0, name: '' }) };
resolvePlaces(world);
const sc = PLACES.superc, gk = PLACES.granderiviere;
ok(sc && Math.hypot(sc.x - 67.6, sc.z + 263.2) < 0.1 && Math.abs(sc.a - 1.4949) < 1e-6, 'superc at the door, unsnapped');
ok(gk && Math.hypot(gk.x + 732.1, gk.z + 1093.7) < 1, 'granderiviere snapped to Rue Broad abeam the board', gk ? `${gk.x.toFixed(2)}, ${gk.z.toFixed(2)}` : '');
ok([sc, gk].every((p) => p && p.label && ![...p.label].some((c) => c.charCodeAt(0) === 0x2013 || c.charCodeAt(0) === 0x2014) && !/Fraser|Denise|Bancroft|Vanier/.test(p.label)), 'labels: no dashes, no home filter match');

console.log('lit signs at night');
const LIT_TEXTS = ['Tim Hortons', 'PAROISSE SAINT-PAUL', 'LES GALERIES D’AYLMER', 'Super C', 'MARINA D’AYLMER'];
const boards = SITES.flatMap((s) => [s.sign, ...(s.signs || [])].filter(Boolean).map((b) => ({ key: s.key, b })));
const litBoards = boards.filter((q) => q.b.lit);
ok(litBoards.length === 5 && LIT_TEXTS.every((t) => litBoards.some((q) => q.b.text === t)), 'exactly the five recognition boards are lit', litBoards.map((q) => q.b.text).join(', '));
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: (o, k) => o[k] ?? (() => {}) }) }) };
const lw = { baseAt: () => ({ h: 30 }), groundAt: () => ({ h: 30 }), querySegments: () => [], draw() {} };
const renderer = { upload: (m) => { m.finish(); return { ...m, count: m.i.length }; }, texture: () => ({}) };
installLandmarks(lw, renderer, STUB);
const sm = lw.landmarks.signs;
ok(sm.mesh.v.length / STRIDE === boards.length * 8, 'main sign mesh keeps 8 vertices per board', `${boards.length} boards`);
const quads = sm.lit.reduce((n, L) => n + L.quads, 0);
ok(quads === litBoards.length * 2 && sm.lit.reduce((n, L) => n + L.mesh.v.length / STRIDE, 0) === litBoards.length * 8, 'overlay: 8 vertices per lit board');
// Each overlay vertex is its main-mesh twin pushed LIT_OUT along the normal.
let worst = 0, k = 0;
const cursor = new Map();
boards.forEach((q, i) => {
  if (!q.b.lit) return;
  const L = sm.lit.find((e) => e.key === q.key); const at = cursor.get(q.key) || 0;
  for (let j = 0; j < 8; j++) {
    const a = (i * 8 + j) * STRIDE, b = (at + j) * STRIDE;
    const ex = sm.mesh.v[a] + sm.mesh.v[a + 3] * LIT_OUT, ez = sm.mesh.v[a + 2] + sm.mesh.v[a + 5] * LIT_OUT;
    worst = Math.max(worst, Math.hypot(L.mesh.v[b] - ex, L.mesh.v[b + 1] - sm.mesh.v[a + 1], L.mesh.v[b + 2] - ez));
    k++;
  }
  cursor.set(q.key, at + 8);
});
ok(k === 40 && worst < 1e-6, 'overlay quads sit LIT_OUT proud of the lit boards', `${worst.toExponential(1)} m`);
const drawn = [];
const fakeR = (sky) => ({ env: { sky }, visible: () => true, draw: (m, model, o) => drawn.push(o) });
const day = fakeR([0.45, 0.62, 0.9]), night = fakeR([0.02, 0.03, 0.06]);
const tx = TIMS_SIGN.x - 20, tz = TIMS_SIGN.z;
drawn.length = 0; lw.draw(day, null, tx, tz, 720, 0.016);
ok(lw.landmarks.stats.lit === 0, 'nothing extra by day');
drawn.length = 0; lw.draw(night, null, tx, tz, 720, 0.016);
const o1 = drawn.filter((o) => o && o.unlit);
ok(lw.landmarks.stats.lit >= 1 && o1.length === lw.landmarks.stats.lit, 'the Tim\'s glows at night from 20 m', `${lw.landmarks.stats.lit} overlay draw`);
drawn.length = 0; lw.draw(night, null, tx, tz, 720, 0.016);
const o2 = drawn.filter((o) => o && o.unlit);
ok(o1.length && o2[0] === o1[0] && o2[0].colorMul === o1[0].colorMul, 'same opts object every frame (no per-frame allocation)');
drawn.length = 0; lw.draw(night, null, 3000, 3000, 720, 0.016);
ok(lw.landmarks.stats.lit === 0, `nothing beyond ${LIT_NEAR} m`);
ok(LIT_NIGHT > 0 && LIT_NIGHT < 1, 'night gate is a fraction of nightAmount');

console.log(`\nsmoke_w8_signs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
