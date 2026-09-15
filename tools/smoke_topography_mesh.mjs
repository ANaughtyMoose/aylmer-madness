import { strict as assert } from 'node:assert';
import { buildWorld } from '../src/game/world.js';
import { GROUND } from '../src/game/ground_data.js';
import { decodeGround } from '../src/game/ground.js';

// Inspect uploaded geometry, not subdivision counters or the emitter's formula.
const raster = decodeGround(GROUND);
let worst = { error: 0 };
for (let j = 0; j < raster.h - 1; j++) for (let i = 0; i < raster.w - 1; i++) {
  const k = j * raster.w + i;
  const error = Math.abs(raster.hgt[k] + raster.hgt[k + raster.w + 1]
    - raster.hgt[k + 1] - raster.hgt[k + raster.w]) / 4;
  if (error > worst.error) worst = { error, x: raster.x0 + i * raster.cell, z: raster.z0 + j * raster.cell };
}
const triangles = [], walls = [];
const renderer = {
  verts: 0, tris: 0, uploads: 0,
  upload(b) {
    b.finish?.(); this.uploads++; this.verts += b.v.length / 9; this.tris += b.i.length / 3;
    for (let i = 0; i < b.i.length; i += 3) {
      const p = b.i.slice(i, i + 3).map(k => Array.from(new Float32Array(b.v.slice(k * 9, k * 9 + 3))));
      if (p.every(v => v[0] >= worst.x - 8.01 && v[0] <= worst.x + 16.01
        && v[2] >= worst.z - 8.01 && v[2] <= worst.z + 16.01)) triangles.push(p);
      if (p.every(v => v[0] >= -137 && v[0] <= -103 && v[2] >= -438 && v[2] <= -422)) walls.push(p);
    }
    return { count: b.i.length, min: b.min.slice(), max: b.max.slice() };
  },
  texture() { return {}; }, visible() { return true; }, draw() {}, time: 0,
};
const start = performance.now();
const world = buildWorld(renderer);
const buildMs = performance.now() - start;
const ground = triangles.filter(p => p.every(v => Math.abs(v[1] - world.baseAt(v[0], v[2]).h) < 0.002));
assert.ok(ground.length > 0, 'no uploaded ground triangles near raster extreme');
let maxError = 0, samples = 0;
for (const p of ground) {
  const area = (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) - (p[2][0] - p[0][0]) * (p[1][2] - p[0][2]);
  if (Math.abs(area) < 1e-8) continue;
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12 - i; j++) {
    const u = i / 12, v = j / 12, w = 1 - u - v;
    const x = w * p[0][0] + u * p[1][0] + v * p[2][0];
    const z = w * p[0][2] + u * p[1][2] + v * p[2][2];
    const drawn = w * p[0][1] + u * p[1][1] + v * p[2][1];
    const error = Math.abs(drawn - world.groundAt(x, z).h);
    maxError = Math.max(maxError, error); samples++;
    assert.ok(error <= 0.1, `drawn/physics error ${error} at ${x},${z}`);
  }
}
const deckWalls = walls.filter(p => {
  const area = (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) - (p[2][0] - p[0][0]) * (p[1][2] - p[0][2]);
  return Math.abs(area) < 1e-7 && Math.max(...p.map(v => v[1])) - Math.min(...p.map(v => v[1])) > 0.35
    && p.some(v => Math.abs(v[1] - world.baseAt(v[0], v[2]).h - 1.35) < 0.002);
});
assert.ok(deckWalls.length >= 2, 'mall dock has no absolute-height wall faces');
for (const p of deckWalls) {
  assert.ok(p.every(v => v[1] > 20), 'deck wall reaches obsolete sea-level height');
}
const segments = world.querySegments(-120, -430, 22).map(s => ({ ...s }));
for (const edgeZ of [-436.5, -423.5]) {
  assert.ok(segments.some(s => Math.abs(s.az - edgeZ) < 0.01 && Math.abs(s.bz - edgeZ) < 0.01
    && Math.min(s.ax, s.bx) >= -136.01 && Math.max(s.ax, s.bx) <= -103.99), `missing dock collider at z=${edgeZ}`);
}
// Independently check shared raster boundaries: both coarse and refined edges
// must be straight interpolants of the same two raster nodes.
let edgeChecks = 0;
for (const p of ground) for (const v of p) {
  const fx = (v[0] - raster.x0) / raster.cell, fz = (v[2] - raster.z0) / raster.cell;
  if (Math.abs(fx - Math.round(fx)) > 0.00002 && Math.abs(fz - Math.round(fz)) > 0.00002) continue;
  const vertical = Math.abs(fx - Math.round(fx)) <= 0.00002;
  const i = vertical ? Math.round(fx) : Math.floor(fx);
  const j = vertical ? Math.floor(fz) : Math.round(fz);
  const k = j * raster.w + i, t = vertical ? fz - j : fx - i;
  const linear = raster.hgt[k] * (1 - t) + raster.hgt[k + (vertical ? raster.w : 1)] * t;
  assert.ok(Math.abs(v[1] - linear) < 0.002, 'shared raster edge is not linear');
  edgeChecks++;
}
assert.ok(edgeChecks > 0, 'no shared raster boundaries checked');
assert.ok(world.groundMeshStats.extraVertices < 100000, 'adaptive vertex budget exceeded');
assert.ok(world.groundMeshStats.extraTriangles < 150000, 'adaptive triangle budget exceeded');
console.log(JSON.stringify({ worst, maxError, samples, edgeChecks, groundTriangles: ground.length, deckWallTriangles: deckWalls.length,
  buildMs: Math.round(buildMs), uploads: renderer.uploads, vertices: renderer.verts, triangles: renderer.tris,
  refinement: world.groundMeshStats, terrain: world.terrainStats }, null, 2));
console.log('PASS topography mesh / absolute deck walls / colliders');
