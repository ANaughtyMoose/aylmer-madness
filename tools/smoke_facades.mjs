#!/usr/bin/env node
// The photographic facades, checked against the game's own data.
//   node tools/smoke_facades.mjs
//
// docs/VERIFY.md §4: Gemini's material is good and specifically wrong, always
// at high confidence. gemini-inbox/look/facades/facades.json claims 75 Denise-
// Friend has an 8.12 m frontage; the OSM footprint the game bakes says the
// street-facing edge is 6.22 m. So NOTHING here trusts the inbox — every number
// a facade is placed with comes out of mapdata.js and houses.js, and this suite
// is what says so.
//
// What it guards, in order of how badly it would fail silently:
//   * the OSM way id is real and its `addr` is the address on the label. A
//     typo'd id draws Aylmer's most photographed facade onto a stranger's shed.
//   * the wall the quad lands on is the wall houses.js already put the front
//     door on — checked BOTH ways round, with the real street index and with
//     the footprint's principal axis, because main.js passes the cheap one.
//   * the quad's outward normal really points outward, and its winding matches
//     that normal, or the photograph renders inside-out and invisible.
//   * the image files exist, are inside the size budget, and are JPEG.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MAP } from '../src/game/mapdata.js';
import { makeStreetYawIndex, normalizeAttrs } from '../src/game/houses.js';
import { PLACES } from '../src/game/places.js';
import {
  FACADES, FACADE_DIR, frontEdge, facadePlacements, facadeMesh,
} from '../src/game/facades.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let checks = 0;
const fails = [];
function ok(cond, what) {
  checks++;
  if (cond) console.log(`  ok   ${what}`);
  else { fails.push(what); console.log(`  FAIL ${what}`); }
}

// ------------------------------------------------------------- 1. the facts
ok(FACADES.length > 0, `${FACADES.length} facades are wired`);

const byId = new Map(MAP.buildings.map((b) => [b.id, b]));
for (const f of FACADES) {
  const b = byId.get(f.id);
  ok(!!b, `${f.key}: way ${f.id} is a real footprint in mapdata`);
  if (!b) continue;
  // The address is the check that catches a transposed id: mapdata carries
  // Gatineau's own addr:housenumber + addr:street on 53 206 of 57 680 buildings.
  ok(b.addr === f.addr, `${f.key}: mapdata calls way ${f.id} "${b.addr}"`);
  ok(b.k === 'house', `${f.key}: and it is a house, not a shed or a shop`);
  ok(b.hs && Number.isFinite(b.hs.h),
    `${f.key}: carries a measured eave (Phase 1 / LiDAR), so the quad has a real height`);
  const [u0, v0, u1, v1] = f.crop;
  ok(u0 >= 0 && v0 >= 0 && u1 <= 1 && v1 <= 1 && u1 > u0 && v1 > v0,
    `${f.key}: crop is a real rect inside the image`);
}

// Cross-reference against places.js: every wired facade has to be somewhere the
// game actually sends you, or it is decoration nobody will ever drive past.
{
  const labels = Object.values(PLACES).map((p) => (p.label || '').toLowerCase());
  for (const f of FACADES) {
    const num = f.addr.split(' ')[0];
    const street = f.addr.split(' ').slice(1).join(' ').toLowerCase()
      .replace(/^(chemin|rue|avenue|boulevard)\s+/, '');
    ok(labels.some((l) => l.includes(num) && l.includes(street)),
      `${f.key}: "${f.addr}" is a place in places.js`);
  }
}

// -------------------------------------------------------- 2. the front wall
const streetYawAt = makeStreetYawIndex(MAP.roads);
const withIndex = facadePlacements(streetYawAt);
const withAxis = facadePlacements(null);          // what main.js actually uses
ok(withIndex.length === FACADES.length, 'every facade got a placement');
ok(withAxis.length === withIndex.length, '…both ways of deciding which way it faces');

for (let i = 0; i < withIndex.length; i++) {
  const a = withIndex[i], b = withAxis[i];
  ok(Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01,
    `${a.key}: the street index and the principal axis pick the SAME wall`);
  const bl = byId.get(FACADES[i].id);
  const attrs = normalizeAttrs(bl, bl.hs, 0);
  ok(Math.abs(a.eave - attrs.height) < 1e-9,
    `${a.key}: the quad is exactly as tall as the eave houses.js builds (${a.eave.toFixed(2)} m)`);
  ok(a.len > 3 && a.len < 40, `${a.key}: street edge is ${a.len.toFixed(2)} m`);
  // Outward means outward: 0.5 m along the normal from the wall midpoint has to
  // be OUTSIDE the footprint, and 0.5 m against it inside.
  const inPoly = (p, x, z) => {
    let inside = false;
    for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
      const xi = p[k][0], zi = p[k][1], xj = p[j][0], zj = p[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  ok(!inPoly(bl.p, a.x + a.nx * 0.5, a.z + a.nz * 0.5)
    && inPoly(bl.p, a.x - a.nx * 0.5, a.z - a.nz * 0.5),
  `${a.key}: the normal points out of the house, not into it`);
  // And the wall it chose faces the road, not the back garden.
  const sy = streetYawAt(bl.c[0], bl.c[1], -bl.a);
  ok(Math.cos(Math.atan2(a.nz, a.nx) - sy) > 0.8,
    `${a.key}: that wall faces the street (cos ${Math.cos(Math.atan2(a.nz, a.nx) - sy).toFixed(3)})`);
}

// ------------------------------------------------------------- 3. the quad
for (const p of withIndex) {
  const mb = facadeMesh(p);
  ok(mb.i.length === 6, `${p.key}: two triangles`);
  const V = (k) => [mb.v[k * 9], mb.v[k * 9 + 1], mb.v[k * 9 + 2]];
  const [a, b, c] = [V(mb.i[0]), V(mb.i[1]), V(mb.i[2])];
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const L = Math.hypot(...n) || 1;
  // The renderer culls by WINDING, not by the normal attribute, so the geometric
  // normal of the first triangle is the thing that decides whether you see this.
  ok(n[0] / L * p.nx + n[2] / L * p.nz > 0.99,
    `${p.key}: wound so the face you see is the one pointing at the street`);
  // Not mirrored: u grows toward the viewer's right when they stand outside.
  const uAt = (k) => mb.uv[mb.i[k] * 2];
  ok(uAt(0) < uAt(1), `${p.key}: u runs left to right, so the photograph is not flipped`);
  // The quad has to reach the ground and the eave, or a strip of procedural
  // brick shows above or below the photograph.
  let lo = 1e9, hi = -1e9;
  for (let k = 1; k < mb.v.length; k += 9) { if (mb.v[k] < lo) lo = mb.v[k]; if (mb.v[k] > hi) hi = mb.v[k]; }
  ok(lo < 0.05 && Math.abs(hi - p.eave) < 1e-6, `${p.key}: spans ${lo.toFixed(2)} m to the eave`);
  // Proud of the wall, but not further than the porch decals houses.js hangs.
  const d = (mb.v[0] - p.x) * p.nx + (mb.v[2] - p.z) * p.nz;
  ok(d > 0.045 && d < 0.12, `${p.key}: stands ${(d * 100).toFixed(0)} cm proud of the wall`);
}

// ---------------------------------------------------------- 4. the pictures
// The originals are 52 MB of PNG for 20 buildings. Only the faces that are
// actually wired are copied in, downscaled and re-encoded, and this is the
// assertion that stops that budget quietly coming back.
{
  let total = 0;
  for (const f of FACADES) {
    const path = join(ROOT, FACADE_DIR, f.img);
    ok(existsSync(path), `${f.key}: ${f.img} is committed`);
    if (!existsSync(path)) continue;
    const bytes = statSync(path).size;
    total += bytes;
    ok(/\.(jpg|jpeg|webp)$/i.test(f.img), `${f.key}: re-encoded, not a PNG`);
    ok(bytes < 400 * 1024, `${f.key}: ${(bytes / 1024) | 0} kB`);
    // JPEG SOF0/SOF2 gives the real pixel size without a decoder.
    const buf = readFileSync(path);
    let w = 0, h = 0;
    for (let i = 2; i < buf.length - 9;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    ok(w > 0 && w <= 1024 && h > 0, `${f.key}: ${w}x${h}, inside the 1024 px budget`);
  }
  console.log(`facades: ${FACADES.length} images, ${(total / 1024) | 0} kB total`);
}

console.log(`${checks - fails.length}/${checks} checks passed`);
if (fails.length) {
  for (const f of [...new Set(fails)]) console.error('FAIL:', f);
  process.exit(1);
}
console.log('OK: facades land on the right wall of the right house, the right way round');
