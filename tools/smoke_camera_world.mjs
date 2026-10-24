// Actual resident-world camera surfaces, coverage, memory and lifecycle.
import assert from 'node:assert/strict';
const canvasContext = { clearRect() {}, fillRect() {}, fillText() {}, drawImage() {}, measureText() { return { width: 40 }; },
  save() {}, restore() {}, translate() {}, strokeRect() {}, beginPath() {}, lineTo() {}, moveTo() {}, closePath() {}, fill() {}, ellipse() {}, quadraticCurveTo() {}, stroke() {},
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; }, putImageData() {} };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return canvasContext; } }; } };
const { buildWorld } = await import('../src/game/world.js');
const { installLandmarks, SITES } = await import('../src/game/landmarks.js');
const { makeCameraColliders, sweepCamera } = await import('../src/game/camera-colliders.js');
const { sectorAt } = await import('../src/game/sectors.js');
const { MAP } = await import('../src/game/mapdata.js');
const { polyCentre } = await import('../src/game/world/geom.js');
const MATS = (await import('../src/game/materials_stub.js')).default;
let triangles = 0, vertices = 0, freed = 0;
const renderer = { upload(b) { b.finish?.(); triangles += b.i.length / 3; vertices += b.v.length / 9; return { count: b.i.length, min: b.min, max: b.max }; },
  texture() { return {}; }, free() { freed++; }, visible() { return true; }, draw() {} };
const start = performance.now();
const world = buildWorld(renderer, MATS, { inside: (x, z) => sectorAt(x, z) === 'aylmer', signage: false });
const builtMs = performance.now() - start;
const before = { ...world.cameraStats };
installLandmarks(world, renderer, MATS);
const packet = world.cameraColliders.toPacket(), blocks = packet.blocks;
const sources = new Set(blocks.map(b => b.source));
assert.ok(sources.has('building:473653931'), 'problem-location rendered house missing');
assert.ok(sources.has('building:fraser'), 'Fraser rendered shell missing');
assert.ok(sources.has('galeries-fence') && sources.has('terrain-wall') && sources.has('cemetery-fence'), 'finite opaque site blockers missing');
for (const site of SITES) assert.ok(sources.has(`landmark:${site.key}`), `hero ${site.key} missing`);
const ordinary = MAP.buildings.filter(b => sectorAt(...polyCentre(b.p)) === 'aylmer' && b.id !== 460808559 && b.id !== 460808159);
for (const b of ordinary) assert.ok(sources.has(`building:${b.id}`), `building ${b.id} has no actual camera surfaces`);
let roofs = 0, walls = 0, candidateCount = 0;
for (const block of blocks) {
  assert.ok(block.positions instanceof Float32Array && (block.indices instanceof Uint16Array || block.indices instanceof Uint32Array));
  assert.ok(block.min.every(Number.isFinite) && block.max.every(Number.isFinite));
  // Probe one substantial surface per block. Cross its centroid along its
  // actual geometric normal, independently of the render vertex normals.
  const p = block.positions, ids = block.indices;
  for (let i = 0; i < ids.length; i += 3) {
    const a = ids[i] * 3, b = ids[i + 1] * 3, c = ids[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const n = Math.hypot(nx, ny, nz); if (n < 0.02) continue;
    nx /= n; ny /= n; nz /= n;
    const x = (p[a] + p[b] + p[c]) / 3, y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3, z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
    assert.ok(sweepCamera(world, x + nx * 0.03, y + ny * 0.03, z + nz * 0.03, x - nx * 0.03, y - ny * 0.03, z - nz * 0.03, 0, false).hit, `captured surface not found by spatial query: ${block.source}`);
    candidateCount++;
    if (Math.abs(ny) > 0.2) roofs++; else walls++;
    break;
  }
}
assert.ok(candidateCount > 10000 && walls > 1000, 'resident coverage is unexpectedly sparse');
assert.ok(world.cameraStats.bytes < vertices * 12 + triangles * 6, 'camera data exceeds all rendered position/index storage');
const restored = makeCameraColliders(structuredClone(packet));
assert.deepEqual(restored.stats, world.cameraStats, 'worker packet changed source counts or packed bytes');
restored.free();
console.log('camera source geometry', JSON.stringify({ residentBeforeHeroes: before, residentWithHeroes: world.cameraStats,
  sourceGroups: sources.size, independentlyQueriedBlocks: candidateCount, walls, roofs, gpuTriangles: triangles, gpuVertices: vertices,
  buildMs: +builtMs.toFixed(1), packedMiB: +(world.cameraStats.bytes / 1048576).toFixed(2) }));
world.free(); assert.equal(world.cameraStats.bytes, 0); assert.equal(world.cameraStats.blocks, 0); assert.ok(freed > 0);
assert.equal(world.queryCameraBlocks(-1000, -100, -1000, 1000, 1000, 1000).length, 0);
console.log('camera world: source coverage, finite geometry, packet and freeing passed');
