#!/usr/bin/env node
// Headless checks on the baked height field: that ground_data.js and ground.js
// still agree about the layout tools/build_ground.py wrote, that the numbers in
// the header describe the blob, and that the grid actually lands on the Aylmer
// clip rather than somewhere in the Ottawa river.
//
//   node tools/smoke_ground.mjs
//
// Deliberately NOT asserted yet: any specific place's height. The raster on disk
// is still 77% median hole-fill from a partial 4-of-30 tile LiDAR download, so
// "the marina slipway is within 2 m of the water" would be testing the fill, not
// Aylmer. Those land in A5 once the full set is in. What is asserted here is the
// contract, which the rebuild will not change.
import { GROUND } from '../src/game/ground_data.js';
import { decodeGround } from '../src/game/ground.js';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const out = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; out.push(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; out.push(`  FAIL ${name}${detail ? '   ' + detail : ''}`); }
}
const r2 = (v) => Math.round(v * 100) / 100;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const t0 = process.hrtime.bigint();
const G = decodeGround(GROUND);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;

// ---------------------------------------------------------------- the blob

{
  const n = GROUND.w * GROUND.h;
  ok('decode gives one value per node', G.hgt.length === n && G.gx.length === n
    && G.gz.length === n, `${GROUND.w} x ${GROUND.h} = ${n} nodes`);
  ok('the decoded record carries the layout terrain.js needs',
    G.x0 === GROUND.x0 && G.z0 === GROUND.z0 && G.cell === GROUND.cell
    && G.w === GROUND.w && G.h === GROUND.h);
  ok('decode is fast enough to sit in the boot path', ms < 500,
    `${ms.toFixed(0)} ms for ${(GROUND.b64.length / 1024).toFixed(0)} KB of base64`);
}

// ------------------------------------------------------------ the geometry

{
  // tools/build_map.py:36-47. The clip is the whole contract: if these move the
  // ground slides under the town.
  const MINX = -2540.6, MAXX = 2540.6, MINZ = -1769.2, MAXZ = 1769.2;
  const w = Math.ceil((MAXX - MINX) / 8) + 1;
  const h = Math.ceil((MAXZ - MINZ) / 8) + 1;
  ok('the grid is the clip bounds at 8 m, node-aligned',
    GROUND.cell === 8 && GROUND.w === w && GROUND.h === h
    && GROUND.x0 === MINX && GROUND.z0 === MINZ, `${w} x ${h}`);
  ok('the last node covers the far corner of the clip',
    GROUND.x0 + (GROUND.w - 1) * GROUND.cell >= MAXX
    && GROUND.z0 + (GROUND.h - 1) * GROUND.cell >= MAXZ,
    `reaches x ${r2(GROUND.x0 + (GROUND.w - 1) * GROUND.cell)}, `
    + `z ${r2(GROUND.z0 + (GROUND.h - 1) * GROUND.cell)}`);
}

// ------------------------------------------------------------- the heights

let elo = Infinity, ehi = -Infinity;
for (let k = 0; k < G.hgt.length; k++) {
  const e = G.hgt[k] + GROUND.datum;
  if (e < elo) elo = e;
  if (e > ehi) ehi = e;
}

{
  ok('the header min is the lowest elevation in the blob',
    Math.abs(elo - GROUND.min) < GROUND.scale,
    `${r2(elo)} m vs header ${r2(GROUND.min)}`);
  ok('nothing in the blob sits below the header min', elo >= GROUND.min - 1e-6);
  ok('the quantised range fits a uint16 with room to spare',
    (ehi - elo) / GROUND.scale < 65535, `${r2(ehi - elo)} m of range at `
    + `${GROUND.scale} m = ${Math.round((ehi - elo) / GROUND.scale)} steps`);
  ok('the datum puts the low ground just under the water quad',
    GROUND.datum > GROUND.min && GROUND.datum < ehi,
    `datum ${r2(GROUND.datum)} -> game y ${r2(elo - GROUND.datum)} to `
    + `${r2(ehi - GROUND.datum)}`);

  // data/raw is gitignored, so this one only runs on a machine that has the
  // LiDAR. Bilinear resampling onto a lattice rotated 0.47 deg off MTM cannot
  // reproduce a single-cell peak exactly — it averages four neighbours — so the
  // grid max sits a little UNDER the raster max and must never sit above it.
  const hp = join(ROOT, 'data', 'raw', 'ground_8m.json');
  if (existsSync(hp)) {
    const hd = JSON.parse(readFileSync(hp, 'utf8'));
    ok('the grid max tracks the raster max without exceeding it',
      ehi <= hd.max + GROUND.scale && ehi > hd.max - 0.5,
      `${r2(ehi)} m vs raster ${r2(hd.max)} (${r2(hd.max - ehi)} m low)`);
  } else {
    out.push('  --   raster max not checked   data/raw/ground_8m.json absent');
  }
}

// ------------------------------------------------------------ the gradient

{
  let bad = 0, steepest = 0;
  for (let k = 0; k < G.gx.length; k++) {
    if (!Number.isFinite(G.gx[k]) || !Number.isFinite(G.gz[k])) bad++;
    const g = Math.hypot(G.gx[k], G.gz[k]);
    if (g > steepest) steepest = g;
  }
  ok('every gradient is finite', bad === 0, `steepest node ${r2(steepest * 100)}%`);

  // One central difference checked by hand, so a sign flip between gx/gz or a
  // transposed index cannot pass.
  const i = 300, j = 200, k = j * G.w + i;
  ok('gx is the east-west central difference',
    Math.abs(G.gx[k] - (G.hgt[k + 1] - G.hgt[k - 1]) / 16) < 1e-6);
  ok('gz is the north-south central difference',
    Math.abs(G.gz[k] - (G.hgt[k + G.w] - G.hgt[k - G.w]) / 16) < 1e-6);
  ok('the edges fall back to one-sided differences',
    Math.abs(G.gx[j * G.w] - (G.hgt[j * G.w + 1] - G.hgt[j * G.w]) / 8) < 1e-6
    && Math.abs(G.gz[i] - (G.hgt[i + G.w] - G.hgt[i]) / 8) < 1e-6);
}

// --------------------------------------------------------- the real window

{
  // The four downloaded tiles cover x -855..1201, z -1585..471; everything else
  // is lidar_roof's median hole-fill, one constant value over most of the grid.
  // (0, -500) is well inside that core, so it must not read as fill, and its
  // neighbourhood must have real relief in it.
  const at = (x, z) => {
    const i = Math.round((x - G.x0) / G.cell), j = Math.round((z - G.z0) / G.cell);
    return G.hgt[j * G.w + i] + GROUND.datum;
  };
  // The fill value is whatever elevation repeats most often across the grid.
  const seen = new Map();
  for (let k = 0; k < G.hgt.length; k++) {
    const q = Math.round(G.hgt[k] / GROUND.scale);
    seen.set(q, (seen.get(q) || 0) + 1);
  }
  let fq = 0, fc = 0;
  for (const [q, c] of seen) if (c > fc) { fc = c; fq = q; }
  const fill = fq * GROUND.scale + GROUND.datum;

  const core = at(0, -500);
  ok('a node in the four-tile core is measured ground, not the hole-fill',
    Math.abs(core - fill) > GROUND.scale,
    `y=${r2(core - GROUND.datum)} (${r2(core)} m) vs fill ${r2(fill)} m, `
    + `fill covers ${Math.round(fc / G.hgt.length * 100)}% of the grid`);

  let lo = Infinity, hi = -Infinity;
  for (let dz = -96; dz <= 96; dz += 8) for (let dx = -96; dx <= 96; dx += 8) {
    const e = at(dx, -500 + dz);
    if (e < lo) lo = e;
    if (e > hi) hi = e;
  }
  ok('the core has real relief in it, not a plateau', hi - lo > 0.5,
    `${r2(hi - lo)} m over a 200 m window at (0, -500)`);
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
