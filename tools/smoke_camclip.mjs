// Finite geometry, continuous sphere sweeps and final-render camera evidence.
import assert from 'node:assert/strict';
import { MeshBuilder } from '../src/core/mesh.js';
import { MAP } from '../src/game/mapdata.js';
import { buildHouse, houseRng } from '../src/game/houses.js';
import MATS from '../src/game/materials_stub.js';
import { makeCameraColliders, sphereTriangle, sweepCamera } from '../src/game/camera-colliders.js';
import { makeClip, clipCamera, guardView, recordCameraFrame, camClipStats, CAST_R, SKIN, RELEASE } from '../src/game/camclip.js';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok ' + name); }
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const wall = (mb, z, x0 = -8, x1 = 8, y0 = 0, y1 = 12) => mb.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [1, 1, 1]);
function world(build = () => {}) {
  const mesh = new MeshBuilder(); build(mesh);
  const index = makeCameraColliders(); index.addMesh(mesh);
  return { queryCameraBlocks: index.query, index };
}
const empty = world();
const front = world(m => wall(m, 5));
const clip = (w, st = makeClip(), x = 0, y = 3.7, z = 9.2, dt = 1 / 60) => clipCamera(st, w, 0, 1.2, 0, x, y, z, dt);
function clear(w, p, focus = [0, 1.2, 0]) {
  assert.equal(sweepCamera(w, ...focus, ...p, 0, false).hit, false, 'final ray intersects rendered geometry');
  assert.equal(sweepCamera(w, ...p, ...p, CAST_R, false).hit, false, 'final eye overlaps rendered geometry');
}

test('open road preserves the desired camera exactly', () => {
  const c = clip(empty); assert.deepEqual([c.x, c.y, c.z], [0, 3.7, 9.2]); assert.equal(c.hit, false);
  assert.equal(c, clip(empty), 'camera output reuses its scratch object');
});
test('wall stops the whole camera sphere in the first frame', () => {
  const c = clip(front); near(c.z, 5 - CAST_R - SKIN * 9.2 / Math.hypot(9.2, 2.5)); clear(front, [c.x, c.y, c.z]);
});
test('low finite wall is passed above, not extruded to the sky', () => {
  const w = world(m => wall(m, 5, -8, 8, 0, 1.3)); const c = clip(w); assert.equal(c.z, 9.2);
  const low = clip(w, makeClip(), 0, 1.4, 9.2); assert.ok(low.z < 5); clear(w, [low.x, low.y, low.z]);
});
test('finite high roof does not block a camera below its eave', () => {
  const w = world(m => m.quad([-5, 5, 3], [5, 5, 3], [5, 5, 12], [-5, 5, 12], [1, 1, 1]));
  const c = clip(w); assert.equal(c.z, 9.2);
});
test('sloped roof blocks a rising boom where no 2D wall is crossed', () => {
  const w = world(m => m.quad([-6, 3, 4], [6, 3, 4], [6, 5, 10], [-6, 5, 10], [1, 1, 1]));
  const c = clip(w, makeClip(), 0, 7, 12); assert.ok(c.z < 8); clear(w, [c.x, c.y, c.z]);
});
test('sphere catches a finite wall edge missed by the center ray', () => {
  const w = world(m => wall(m, 5, 0.3, 8)); assert.equal(sweepCamera(w, 0, 1.2, 0, 0, 3.7, 9.2, 0).hit, false);
  const c = clip(w); assert.ok(c.z < 5); clear(w, [c.x, c.y, c.z]);
});
test('sphere catches a triangle vertex, without making an infinite wall', () => {
  const p = new Float32Array([0, 0, 5, 2, 0, 5, 0, 2, 5]);
  const t = sphereTriangle(-0.2, -0.2, 0, 0, 0, 10, 0.5, p, 0, 3, 6);
  near(t, (5 - Math.sqrt(0.25 - 0.08)) / 10);
  assert.equal(sphereTriangle(-1, -1, 0, 0, 0, 10, 0.5, p, 0, 3, 6), Infinity);
});
test('first surface wins independently of mesh insertion order', () => {
  const w = world(m => { wall(m, 7); wall(m, 3); }); const c = clip(w); assert.ok(c.z < 3 && c.z > 2); clear(w, [c.x, c.y, c.z]);
});
test('two-sided triangle winding gives the same impact time', () => {
  const p = new Float32Array([-3, 0, 5, 3, 0, 5, 0, 8, 5]);
  near(sphereTriangle(0, 2, 0, 0, 0, 10, 0.4, p, 0, 3, 6), sphereTriangle(0, 2, 0, 0, 0, 10, 0.4, p, 6, 3, 0));
});
test('continuous sweep catches a thin wall between widely spaced points', () => {
  const w = world(m => wall(m, 0.123)); const hit = sweepCamera(w, 0, 2, -20, 0, 2, 200, 0.45); near(hit.t, (20 + 0.123 - 0.45) / 220, 1e-7);
});
test('starting in a wall skin may move away without collapsing the camera', () => {
  const w = world(m => wall(m, -0.2)); const c = clip(w); assert.equal(c.z, 9.2); clear(w, [c.x, c.y, c.z]);
});
test('starting in a wall skin may not move through the surface', () => {
  const w = world(m => wall(m, 0.2)); const hit = sweepCamera(w, 0, 1.2, 0, 0, 3.7, 9.2, CAST_R); assert.equal(hit.t, 0);
  const c = clip(w); assert.ok(c.alternate); clear(w, [c.x, c.y, c.z]); assert.ok(Math.hypot(c.x, c.y - 1.2, c.z) >= 1.7);
});
test('corner escape checks every adjacent surface', () => {
  const w = world(m => { wall(m, 0.2); m.quad([0.2, 0, -8], [0.2, 0, 8], [0.2, 9, 8], [0.2, 9, -8], [1, 1, 1]); });
  const c = clip(w); clear(w, [c.x, c.y, c.z]); assert.ok(c.x < 0.2 && c.z < 0.2);
});
test('alternate crash camera releases its actual boom without a full-distance jump', () => {
  const w = world(m => wall(m, 0.2)), st = makeClip();
  const first = clip(w, st); let last = [first.x, first.y, first.z]; assert.ok(first.alternate);
  const paused = clip(empty, st, 0, 3.7, 9.2, 0); [paused.x, paused.y, paused.z].forEach((v, i) => near(v, last[i], 1e-10));
  for (let i = 0; i < 240; i++) {
    const c = clip(empty, st), p = [c.x, c.y, c.z];
    assert.ok(Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 1, `camera jumped on release frame ${i}`);
    assert.ok(Math.hypot(p[0], p[1] - 1.2, p[2]) >= 1.7, `release crossed the car on frame ${i}`);
    last = p;
  }
  const c = clip(empty, st); assert.deepEqual([c.x, c.y, c.z], [0, 3.7, 9.2]); assert.equal(st.escaping, false);
});
test('snap inward and exponential outward release keep their different rates', () => {
  const s = makeClip(); clip(front, s); const f = s.frac;
  clip(empty, s); near(s.frac, f + (1 - f) * (1 - Math.exp(-RELEASE / 60)));
  const held = s.frac; clip(empty, s, 0, 3.7, 9.2, 0); assert.equal(s.frac, held);
  for (let i = 0; i < 240; i++) clip(empty, s); assert.equal(s.frac, 1);
  clip(front, s); near(s.frac, f);
});
test('a teleport resets stale boom state instead of sweeping the previous town view', () => {
  const st = makeClip(); clip(front, st); assert.ok(st.frac < 1);
  clip(empty, st); assert.equal(st.teleported, false);
  clipCamera(st, empty, 900, 1.2, 0, 900, 3.7, 9.2, 1 / 60);
  assert.equal(st.teleported, true); assert.equal(st.frac, 1);
});
test('the final eye is corrected after smoothing has trailed inside the wall', () => {
  const p = [0, 3.7, 7]; const s = makeClip(); assert.equal(guardView(s, front, 0, 1.2, 0, p), true); clear(front, p);
});
test('post-smoothing ground lift is checked against a roof', () => {
  const w = world(m => m.quad([-5, 2.5, 4], [5, 2.5, 4], [5, 2.5, 12], [-5, 2.5, 12], [1, 1, 1]));
  const p = [0, 1.8, 9]; guardView(makeClip(), w, 0, 1.2, 0, p, (_x, z) => z > 4 ? 2 : 0); clear(w, p);
});
test('zero-length boom and degenerate triangles remain finite', () => {
  const p = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]); assert.equal(sphereTriangle(0, 0, 0, 0, 0, 0, 1, p, 0, 3, 6), Infinity);
  const c = clip(empty, makeClip(), 0, 1.2, 0); assert.ok([c.x, c.y, c.z].every(Number.isFinite));
});
test('surface capture copies only its range and survives builder release', () => {
  const mesh = new MeshBuilder(); wall(mesh, -100); const from = mesh.i.length; wall(mesh, 5);
  const index = makeCameraColliders(); index.addMesh(mesh, from, mesh.i.length, 'measured-wall');
  assert.equal(index.stats.triangles, 2); assert.equal(index.stats.vertices, 4); assert.equal(index.stats.bytes, 60);
  mesh.v.length = mesh.i.length = 0;
  const w = { queryCameraBlocks: index.query }; assert.equal(sweepCamera(w, 0, 2, 0, 0, 2, 10, 0).source, 'measured-wall');
  assert.equal(sweepCamera(w, 0, 2, -101, 0, 2, -99, 0).hit, false);
});
test('spatial broadphase deduplicates blocks across cells and includes negative coordinates', () => {
  const w = world(m => wall(m, -65, -100, 100)); const list = w.queryCameraBlocks(-110, -1, -70, 110, 20, -60);
  assert.equal(list.length, 1); assert.equal(w.queryCameraBlocks(-110, 20, -70, 110, 30, -60).length, 0);
  w.index.free(); assert.equal(w.index.stats.bytes, 0); assert.equal(w.queryCameraBlocks(-110, -1, -70, 110, 20, -60).length, 0);
});
test('worker transfer round trip preserves buffers, ordering, queries and freeing', () => {
  const w = world(m => { wall(m, 5); wall(m, 9); });
  const packet = w.index.toPacket();
  const received = structuredClone(packet, { transfer: packet.blocks.flatMap(b => [b.positions.buffer, b.indices.buffer]) });
  assert.equal(packet.blocks[0].positions.byteLength, 0, 'worker buffers were transferred rather than retained');
  const restored = makeCameraColliders(received), rw = { queryCameraBlocks: restored.query };
  assert.equal(restored.query(-10, -10, -10, 10, 20, 20)[0].positions, received.blocks[0].positions);
  near(sweepCamera(rw, 0, 2, 0, 0, 2, 10, CAST_R).t, (5 - CAST_R) / 10);
  assert.equal(restored.stats.triangles, 4); restored.free();
  assert.equal(restored.stats.bytes, 0);
  assert.throws(() => makeCameraColliders({ ...received, version: 99 }), /unknown/);
});
test('final-eye statistics report a bad actual ray rather than a clipped target', () => {
  camClipStats.reset(); const s = makeClip(); clip(front, s);
  const vp = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  recordCameraFrame(s, front, 0, 1.2, 0, [0, 3.7, 7], vp, 0.02);
  assert.equal(camClipStats.rayBlocked, 1); assert.equal(camClipStats.clearPct, 0); near(camClipStats.maxBlockedSeconds, 0.02);
  const p = [0, 3.7, 7]; guardView(s, front, 0, 1.2, 0, p); recordCameraFrame(s, front, 0, 1.2, 0, p, vp, 0.02);
  assert.equal(camClipStats.frames, 2); assert.equal(camClipStats.rayBlocked, 1); assert.equal(camClipStats.last.rayClear, true); assert.equal(camClipStats.clearPct, 50);
});
test('work evidence counts correction scans even when the final ray is clear', () => {
  camClipStats.reset(); const w = world(m => wall(m, 0.2)), st = makeClip(); const c = clip(w, st);
  const p = [c.x, c.y, c.z]; guardView(st, w, 0, 1.2, 0, p);
  recordCameraFrame(st, w, 0, 1.2, 0, p, null);
  assert.equal(camClipStats.rayBlocked, 0); assert.ok(camClipStats.maxQueries > 20);
  assert.ok(camClipStats.maxScannedTriangles > 0 && camClipStats.maxTestedTriangles > 0);
});
test('missing geometry and out-of-frame focus are not recorded as success', () => {
  camClipStats.reset(); recordCameraFrame(makeClip(), {}, 0, 1.2, 0, [0, 4, 9], null);
  assert.equal(camClipStats.unknown, 1); assert.equal(camClipStats.clearPct, 0); assert.equal(camClipStats.unframed, 1);
  recordCameraFrame(makeClip(), { queryCameraBlocks: empty.queryCameraBlocks, cameraReady: () => false }, 0, 1.2, 0, [0, 4, 9], null);
  assert.equal(camClipStats.unknown, 2, 'an unloaded sector is unknown even when other sectors have geometry');
  camClipStats.reset(); assert.equal(camClipStats.clearPct, null);
});
test('rigid rotations and large map coordinates preserve exact face impact', () => {
  for (let i = 0; i < 100; i++) {
    const angle = i * 0.173, c = Math.cos(angle), s = Math.sin(angle), offset = i * 173;
    const P = (x, y, z) => [x * c + z * s + offset, y + i, -x * s + z * c - offset];
    const p = new Float64Array([...P(-4, -4, 5), ...P(4, -4, 5), ...P(0, 4, 5)]);
    const f = P(0, 0, 0), t = P(0, 0, 10);
    near(sphereTriangle(...f, t[0] - f[0], t[1] - f[1], t[2] - f[2], 0.45, p, 0, 3, 6), 0.455, 1e-8);
  }
});
test('the problem-location house keeps its actual rendered roof and porch surfaces', () => {
  const bi = MAP.buildings.findIndex(b => b.id === 473653931), b = MAP.buildings[bi];
  const mesh = new MeshBuilder();
  const info = buildHouse(mesh, b, b.hs, MATS, houseRng(b, bi), { lod: 0, index: bi, streetYaw: -b.a, y: 11 });
  const index = makeCameraColliders(); index.addMesh(mesh, 0, mesh.i.length, 'problem-house');
  const w = { queryCameraBlocks: index.query };
  let checked = 0, roofs = 0;
  for (let j = 0; j < mesh.i.length; j += 3) {
    const a = mesh.i[j] * 9, b = mesh.i[j + 1] * 9, c = mesh.i[j + 2] * 9;
    const x = (mesh.v[a] + mesh.v[b] + mesh.v[c]) / 3;
    const y = (mesh.v[a + 1] + mesh.v[b + 1] + mesh.v[c + 1]) / 3;
    const z = (mesh.v[a + 2] + mesh.v[b + 2] + mesh.v[c + 2]) / 3;
    const nx = mesh.v[a + 3], ny = mesh.v[a + 4], nz = mesh.v[a + 5];
    const hit = sweepCamera(w, x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, x - nx * 0.1, y - ny * 0.1, z - nz * 0.1, 0, false);
    assert.ok(hit.hit, `rendered triangle ${j / 3} missing from camera index`); checked++;
    if (ny > 0.2 && y > 14) roofs++;
  }
  assert.ok(checked >= 20 && roofs >= 4, JSON.stringify({ checked, roofs, info }));
  assert.equal(index.stats.triangles, checked);
  console.log('  source house:', JSON.stringify({ triangles: checked, roofs, packedBytes: index.stats.bytes }));
});
console.log(`camera: ${passed} passed`);
