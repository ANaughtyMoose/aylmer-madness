// Small CPU-only fixtures. This does not bake MAP, launch a browser or claim a
// frame budget. It checks the future Worker boundary before world integration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MeshBuilder } from '../src/core/mesh.js';
import { m4 } from '../src/core/math.js';
import { makeCameraColliders } from '../src/game/camera-colliders.js';
import { Reactive } from '../src/game/reactive.js';
import { distPtSeg2, pointInPoly } from '../src/game/world/geom.js';
import {
  WORKER_PACKET_VERSION, packMesh, packIndexGrid, unpackIndexGrid,
  packPoles, restorePoles, packetTransfer,
} from '../src/game/world/worker-packet.js';
import {
  worldGridKey as key, packSegmentQueries, restoreSegmentQueries,
  packRoadQueries, restoreRoadQueries, packBuildingQueries, restoreBuildingQueries,
  restoreWalkQueries,
} from '../src/game/world/worker-queries.js';

let passed = 0;
function test(name, run) { run(); passed++; console.log(`  ok ${name}`); }
function roundTrip(packet) {
  const { transfer } = packetTransfer(packet);
  return structuredClone(packet, { transfer });
}
function indexBounds(bounds, cell) {
  const grid = new Map();
  bounds.forEach(([x0, z0, x1, z1], id) => {
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
      for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(id);
      }
    }
  });
  return grid;
}
function meshFixture() {
  const b = new MeshBuilder();
  b.box(-5, 2, 3, 2, 4, 3, [0.12345, 0.4, 0.8]);
  b.textured = true; b.curRect = [0.125, 0.25, 0.0625, 0.0625];
  b.box(4, 5, -3, 3, 2, 2, [0.955, 0.955, 0.955]);
  b.textured = false; b.curRect = null;
  b.box(9, 1, 0, 1, 2, 1, [0.5, 0.25, 0]);
  return b;
}

test('mesh transport preserves renderer input, bounds, indices and atlas attributes', () => {
  const b = meshFixture(), packet = packMesh(b, 'near', 42);
  assert.deepEqual(packet.v, Float32Array.from(b.v));
  assert.deepEqual(packet.i, Uint32Array.from(b.i));
  assert.deepEqual(packet.uv, Float32Array.from(b.uv));
  assert.deepEqual(packet.rect, Float32Array.from(b.rect));
  assert.deepEqual(packet.min, b.min); assert.deepEqual(packet.max, b.max);
  assert.equal(packet.uv.length, b.vertCount * 2);
  assert.equal(packet.rect.length, b.vertCount * 4);
  const expected = structuredClone(packet), received = roundTrip(packet);
  assert.deepEqual(received, expected);
  assert.equal(packet.v.byteLength, 0);
  assert.ok(b.v.length > 0, 'source builder remains usable');
});

test('same geometry produces the same packed bytes without consuming RNG', () => {
  assert.deepEqual(packMesh(meshFixture(), 'land', 7), packMesh(meshFixture(), 'land', 7));
});

test('bad mesh layouts fail before crossing the Worker boundary', () => {
  const b = meshFixture();
  assert.throws(() => packMesh(b, 'unknown'), /mesh kind/);
  b.i[0] = -1;
  assert.throws(() => packMesh(b, 'land'), /index outside/);
  assert.throws(() => packMesh({ v: [1], i: [], uv: [], rect: [] }, 'land'), /stride/);
  assert.throws(() => packMesh({ v: new Array(27).fill(0), i: [0, 1, 2], uv: [1] }, 'land'), /UV/);
});

test('numeric grids preserve negative and large keys, empty buckets and order', () => {
  const grid = new Map([[-400, [3, 1, 3]], [2 ** 40, []], [key(-1, 2), [8, 4]]]);
  const packed = packIndexGrid(grid), received = roundTrip(packed), restored = unpackIndexGrid(received);
  assert.deepEqual([...restored.keys()], [...grid.keys()]);
  for (const [k, values] of restored) {
    assert.deepEqual([...values], grid.get(k));
    assert.equal(values.buffer, received.items.buffer, 'bucket is a shared typed view');
  }
  assert.equal(unpackIndexGrid(packIndexGrid(new Map())).size, 0);
});

test('invalid grids fail instead of silently truncating IDs', () => {
  assert.throws(() => packIndexGrid(new Map([[1, [-1]]])), /grid member/);
  assert.throws(() => packIndexGrid(new Map([[1.5, [0]]])), /grid key/);
  const packet = packIndexGrid(new Map([[1, [3]], [2, [4]]]));
  packet.offsets[1] = 9;
  assert.throws(() => unpackIndexGrid(packet), /ordered/);
});

test('transport counts shared buffers once and rejects runtime closures', () => {
  const data = new Float32Array(12);
  const transfer = packetTransfer({ whole: data, tail: data.subarray(3), alias: data.buffer });
  assert.equal(transfer.transfer.length, 1); assert.equal(transfer.bytes, 48);
  assert.throws(() => packetTransfer({ draw() {} }), /runtime value/);
  assert.throws(() => packetTransfer({ grid: new Map() }), /class instance/);
});

test('A-05 camera schema travels unchanged, including Uint16 and Uint32 indices', () => {
  const camera = {
    schema: 'aylmer-camera-colliders', version: 1,
    blocks: [Uint16Array, Uint32Array].map((Index, i) => ({
      positions: new Float32Array([0, 0, 0, 2, 4, 0, 0, 4, 3]),
      indices: new Index([2, 0, 1]), min: [0, 0, 0], max: [2, 4, 3], source: `fixture-${i}`,
    })),
  };
  const envelope = { schema: 'aylmer-sector', version: WORKER_PACKET_VERSION, camera };
  const expected = structuredClone(envelope), received = roundTrip(envelope);
  assert.deepEqual(received, expected);
  assert.ok(received.camera.blocks[0].indices instanceof Uint16Array);
  assert.ok(received.camera.blocks[1].indices instanceof Uint32Array);
});

test('real A-05 camera round trip restores exact surfaces and owns receiver buffers', () => {
  const mesh = new MeshBuilder();
  mesh.box(1, 2, 3, 2, 4, 6, [1, 1, 1]);
  const camera = makeCameraColliders();
  camera.addMesh(mesh, 0, mesh.i.length, 'worker-camera-fixture');
  const expectedStats = { ...camera.stats }, sent = camera.toPacket();
  const expected = structuredClone(sent), info = packetTransfer({ camera: sent });
  const received = structuredClone({ camera: sent }, { transfer: info.transfer });
  assert.deepEqual(received.camera, expected);
  assert.equal(info.bytes, expectedStats.bytes);
  assert.equal(sent.blocks[0].positions.byteLength, 0);
  assert.equal(sent.blocks[0].indices.byteLength, 0);
  assert.ok(mesh.v.length > 0 && mesh.i.length > 0, 'geometry source remains usable');
  const restored = makeCameraColliders(received.camera);
  assert.deepEqual(restored.stats, expectedStats);
  const hits = restored.query(-10, -10, -10, 10, 10, 10);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].positions, received.camera.blocks[0].positions);
  assert.equal(hits[0].indices, received.camera.blocks[0].indices);
  const aggregate = [{ source: 'existing-sector' }];
  restored.query(-10, -10, -10, 10, 10, 10, aggregate);
  assert.equal(aggregate.length, 2, 'sector query appends to aggregate output');
  assert.equal(restored.query(30, 30, 30, 40, 40, 40).length, 0);
  restored.free();
  assert.equal(restored.stats.bytes, 0);
  assert.equal(restored.stats.blocks, 0);
});

const segments = [-40, 0, 40, 0, 0, -40, 0, 40, -15, 20, 20, 20, 50, 50, 60, 60];
const segmentGrid = indexBounds(Array.from({ length: 4 }, (_, i) => {
  const o = i * 4;
  return [Math.min(segments[o], segments[o + 2]), Math.min(segments[o + 1], segments[o + 3]),
    Math.max(segments[o], segments[o + 2]), Math.max(segments[o + 1], segments[o + 3])];
}), 32);

test('restored collider queries retain broadphase coverage and deduplicate cells', () => {
  const ctx = restoreSegmentQueries(roundTrip(packSegmentQueries({ segs: segments, segGrid: segmentGrid })));
  for (const [x, z, r] of [[0, 0, 45], [-40, 0, 0], [53, 50, 5], [100, 100, 1]]) {
    const result = ctx.querySegments(x, z, r).map(({ ax, az, bx, bz }) => [ax, az, bx, bz]);
    const expected = Array.from({ length: 4 }, (_, i) => segments.slice(i * 4, i * 4 + 4))
      .filter((s) => distPtSeg2(x, z, ...s) <= r * r);
    assert.deepEqual(result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort());
  }
  const scratch = ctx.querySegments(0, 0, 1);
  assert.equal(ctx.querySegments(100, 100, 1), scratch);
});

test('restored collider dead-mask disables only the snapped pole segments', () => {
  const ctx = restoreSegmentQueries(packSegmentQueries({ segs: segments, segGrid: segmentGrid }));
  const dead = ctx.allocSegDead(); dead[1] = 1;
  assert.deepEqual(ctx.querySegments(0, 0, 1).map((s) => [s.ax, s.az, s.bx, s.bz]), [[-40, 0, 40, 0]]);
});

const roadSegArr = [-60, 0, 60, 0, 4.8 ** 2, 4, 0, 0, -60, 0, 60, 3.8 ** 2, 3, 1,
  25, 20, 35, 20, 2.8 ** 2, 2, 2];
const roadGrid = indexBounds(Array.from({ length: 3 }, (_, i) => {
  const o = i * 7, radius = Math.sqrt(roadSegArr[o + 4]);
  return [Math.min(roadSegArr[o], roadSegArr[o + 2]) - radius,
    Math.min(roadSegArr[o + 1], roadSegArr[o + 3]) - radius,
    Math.max(roadSegArr[o], roadSegArr[o + 2]) + radius,
    Math.max(roadSegArr[o + 1], roadSegArr[o + 3]) + radius];
}), 40);
const roadPacket = () => packRoadQueries({ roadSegArr, roadGrid,
  nearArr: [-60, 0, 60, 0, 0, 0, -60, 0, 60, 1],
  roads: [{ name: 'Fixture A' }, { name: 'Fixture B' }, { name: 'Service fixture', cls: 'service' }],
});

test('restored road queries preserve kerb, skip-road and strict furniture edges', () => {
  const q = restoreRoadQueries(roundTrip(roadPacket()));
  assert.equal(q.roadAt(-20, 4.8), true); assert.equal(q.roadAt(-20, 4.801), false);
  assert.equal(q.pavedAt(-20, 4, -1, 0), true); assert.equal(q.pavedAt(-20, 4, 0, 0), false);
  assert.equal(q.pavedAt(0, 0, 0, 0), true, 'crossing road still counts');
  assert.equal(q.streetClear(-20, 6.6), true); assert.equal(q.streetClear(-20, 6.599), false);
  assert.equal(q.roadAt(30, 20), true, 'service road is still paved');
  assert.equal(q.roadAt(900, 900), false);
});

test('sidewalk queries cross service driveways but stop at actual streets', () => {
  const packed = roadPacket();
  assert.deepEqual(packed.service, new Uint8Array([0, 0, 1]));
  const received = roundTrip(packed), q = restoreRoadQueries(received);
  assert.equal(packed.service.byteLength, 0, 'service flags transfer with other road data');
  assert.ok(received.service instanceof Uint8Array);
  assert.equal(q.roadAt(30, 20), true, 'service surface remains road pavement');
  assert.equal(q.pavedAt(30, 20, -1, 0), true, 'omitted argument includes service roads');
  assert.equal(q.pavedAt(30, 20, -1, 0, false), true, 'explicit false includes service roads');
  assert.equal(q.pavedAt(30, 20, -1, 0, true), false, 'sidewalk continues across driveway');
  assert.equal(q.pavedAt(30, 20, 2, 0), false, 'source-road skip still applies');
  assert.equal(q.pavedAt(-20, 0, -1, 0, true), true, 'actual crossing street clips sidewalk');
  assert.equal(q.pavedAt(-20, 0, 0, 0, true), false, 'own street remains excluded');
  assert.equal(q.streetClear(30, 20), false, 'furniture still avoids driveways');

  const crossing = restoreRoadQueries(roundTrip(packRoadQueries({
    roadSegArr: [0, 0, 10, 0, 2.8 ** 2, 2, 0, 5, -5, 5, 5, 3.8 ** 2, 3, 1],
    roadGrid: new Map([[key(0, 0), [0, 1]]]), nearArr: [5, -5, 5, 5, 1],
    roads: [{ cls: 'service' }, { cls: 'residential', name: 'Crossing street' }],
  })));
  assert.equal(crossing.pavedAt(5, 0, -1, 0, true), true, 'service skip does not hide a later street');
  assert.equal(crossing.pavedAt(5, 0, 1, 0, true), false, 'only skipped street and driveway remain');
  assert.equal(crossing.pavedAt(5, 0, 1, 0, false), true, 'ordinary query still sees the driveway');
});

test('nearest road preserves clipping, names, tie order and excludes service segments', () => {
  const q = restoreRoadQueries(roundTrip(roadPacket()));
  assert.deepEqual(q.nearestRoad(90, 10), { x: 60, z: 0, yaw: Math.PI / 2, name: 'Fixture A', dist: Math.sqrt(1000) });
  assert.equal(q.nearestRoad(4, 4).name, 'Fixture A');
  assert.equal(q.nearestRoad(30, 20).name, 'Fixture A');
  const empty = restoreRoadQueries(packRoadQueries({ roadSegArr: [], roadGrid: new Map(), nearArr: [], roads: [] }));
  assert.deepEqual(empty.nearestRoad(2, 3), { x: 2, z: 3, yaw: 0, name: '', dist: Infinity });
});

test('packed building queries preserve corrected concave footprints and padding', () => {
  const buildings = [{ p: [[1, 1], [8, 1], [8, 3], [3, 3], [3, 8], [1, 8]] },
    { p: [[44, 44], [52, 44], [52, 52], [44, 52]] }];
  const bldBox = [1, 1, 8, 8, 44, 44, 52, 52];
  const q = restoreBuildingQueries(roundTrip(packBuildingQueries({ buildings, bldBox,
    bldGrid: indexBounds([[1, 1, 8, 8], [44, 44, 52, 52]], 48) })));
  for (const [x, z, pad] of [[2, 5, 0], [5, 5, 0], [0.5, 2, 0.6], [0.5, 2, 0.5], [49, 49, 0], [10, 10, 1]]) {
    const expected = buildings.some(({ p }) => pointInPoly(p, x, z)
      || (pad > 0 && p.some((b, i) => {
        const a = p[(i + p.length - 1) % p.length];
        return distPtSeg2(x, z, ...a, ...b) < pad * pad;
      })));
    assert.equal(q.buildingAt(x, z, pad), expected, `${x},${z},${pad}`);
  }
});

test('walk queries keep conservative cell semantics and stable deduplicated order', () => {
  const packet = packIndexGrid(new Map([[key(0, 0), [3, 1]], [key(1, 0), [1, 2]]]));
  const { queryWalks } = restoreWalkQueries(roundTrip(packet));
  const first = queryWalks(127, 5, 2);
  assert.deepEqual(first, [3, 1, 2]);
  assert.equal(queryWalks(900, 900, 1), first); assert.deepEqual(first, []);
});

function signalFixture() {
  return [{ x: 10, z: 20, approaches: [
    { poleX: 11, poleZ: 22, headX: 13, headZ: 24, headY: 8, broken: false },
    { poleX: 9, poleZ: 18, headX: 7, headZ: 16, headY: 9, broken: false },
  ] }];
}
function poleFixture(signals) {
  const poles = [{ x: 11, y: 2, z: 22, kind: 'signal', h: 6.2, k: 3, i0: 9, n: 12, seg: 4,
    dead: false, signal: signals[0].approaches[0],
    fragment: { v: new Float32Array(27), i: new Uint16Array([0, 1, 2]), uv: new Float32Array(6) },
  }];
  return { poles, grid: new Map([[key(0, 0), poles]]) };
}

test('poles reconnect canonical live signal identity, mesh indices and fragment storage', () => {
  const bakedSignals = signalFixture(), fixture = poleFixture(bakedSignals);
  const packet = packPoles(fixture.poles, fixture.grid, bakedSignals);
  const received = roundTrip(packet), liveSignals = signalFixture();
  const live = liveSignals[0].approaches[0]; live.broken = true; live.headY = -1;
  liveSignals[0].approaches.reverse();
  const mesh = { gpuHandle: 1 }, restored = restorePoles(received, liveSignals, new Map([[3, mesh]]));
  const p = restored.poles[0];
  assert.equal(p.signal, live); assert.equal(live.broken, true); assert.equal(live.headY, 8);
  assert.equal(p.mesh, mesh); assert.equal(p.i0, 9); assert.equal(p.n, 12); assert.equal(p.seg, 4);
  assert.equal(restored.poleGrid.get(key(0, 0))[0], p);
  assert.ok(p.fragment.i instanceof Uint16Array);
  assert.notEqual(p.fragment.v.buffer, fixture.poles[0].fragment.v.buffer);
  assert.equal(fixture.poles[0].fragment.v.byteLength, 108, 'live source fragment was not detached');
});

test('incomplete pole hydration fails without modifying the live signal', () => {
  const signals = signalFixture(), { poles, grid } = poleFixture(signals);
  const packet = packPoles(poles, grid, signals), live = signalFixture();
  live[0].approaches[0].headY = -10;
  assert.throws(() => restorePoles(packet, live, new Map()), /mesh is missing/);
  assert.equal(live[0].approaches[0].headY, -10);
  assert.throws(() => restorePoles(packet, [], new Map([[3, {}]])), /signal is missing/);
});

// The real client against an explicitly controlled Worker transport. This
// exercises request ownership and cancellation without generating MAP geometry.
const { createSectorClient } = await import('../src/game/world/sector-client.js');
class FakeWorker {
  sent = []; terminated = false;
  postMessage(message) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  emit(message) { return this.onmessage({ data: message }); }
}
const workers = [], handles = new Set();
const renderer = {
  upload(packet) { const mesh = { count: packet.i.length, min: packet.min, max: packet.max }; handles.add(mesh); return mesh; },
  free(mesh) { assert.ok(handles.delete(mesh), 'pending handle is freed exactly once'); },
};
let warmResolve;
const client = createSectorClient(renderer, null, { workerFactory: () => { const w = new FakeWorker(); workers.push(w); return w; },
  nextFrame: async () => {}, prewarm: () => new Promise((resolve) => { warmResolve = resolve; }) });
const p1 = client.prepare('aylmer').catch((error) => error);
assert.equal(client.cancel(), true);
assert.equal((await p1).name, 'AbortError'); assert.equal(workers[0].terminated, true);
assert.equal(client.pending, null); passed++; console.log('  ok cancellation terminates an active CPU bake before any GPU upload');

const p2 = client.prepare('aylmer').catch((error) => error), w2 = workers.at(-1), id2 = w2.sent[0].id;
const builder = new MeshBuilder(); builder.box(0, 0, 0, 1, 1, 1, [1, 1, 1]);
const delivering = w2.emit({ version: WORKER_PACKET_VERSION, id: id2, sequence: 1, kind: 'mesh', packet: packMesh(builder, 'land', 0), bytes: 100 });
assert.equal(handles.size, 1); assert.equal(w2.sent.length, 1, 'no ACK before real prewarm finishes');
client.cancel(); assert.equal((await p2).name, 'AbortError'); assert.equal(handles.size, 0);
const p3 = client.prepare('hull').catch((error) => error), w3 = workers.at(-1), id3 = w3.sent[0].id;
warmResolve(); await delivering;
assert.equal(w2.sent.length, 1, 'cancelled request never sends a late ACK');
assert.equal(client.pending.id, id3, 'late old work cannot cancel its replacement');
await w3.emit({ version: WORKER_PACKET_VERSION, id: id3, sequence: 2, kind: 'mesh', packet: packMesh(builder, 'land', 0) });
assert.match((await p3).message, /order mismatch/); assert.equal(w3.terminated, true); assert.equal(handles.size, 0);
passed++; console.log('  ok cancellation frees pending GPU ownership, ignores late work and rejects wrong sequence');

// Execute the actual main entry functions against controlled frame/Worker
// boundaries. Reading their declarations avoids importing the browser shell
// and avoids testing a second copy of the cancellation implementation.
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
test('sector reactive refresh releases every retired mesh and preserves the score', () => {
  const live = new Set(), freed = new Set();
  const renderer = {
    upload(builder) {
      const mesh = { count: builder.i.length, min: builder.min, max: builder.max };
      live.add(mesh); return mesh;
    },
    free(mesh) {
      assert.ok(live.delete(mesh), 'free only a live owned mesh');
      assert.ok(!freed.has(mesh), 'shared debris kind meshes free once');
      freed.add(mesh);
    },
  };
  const world = { bounds: { minX: 0, minZ: 0, maxX: 200, maxZ: 200 },
    propSpots: [{ kind: 'garbage', x: 30, z: 30, yaw: 0 }], walks: [] };
  const G = { renderer, world, stats: {} };
  G.reactive = new Reactive(renderer, world); G.reactive.bind(G);
  Object.assign(G.reactive, { streak: 7, streakT: 3, streakKind: 'garbage', streakStep: 1, prevDamage: 9 });
  const expected = live.size;
  const start = mainSource.indexOf('function refreshReactive() {');
  const end = mainSource.indexOf('function showSeamCard(', start);
  assert.ok(start > 0 && end > start);
  const refresh = new Function('G', 'Reactive', mainSource.slice(start, end) + '; return refreshReactive;')(G, Reactive);
  for (let i = 0; i < 3; i++) {
    const retired = [...live]; refresh();
    assert.equal(live.size, expected, 'repeated transitions keep mesh ownership bounded');
    assert.ok(retired.every(mesh => freed.has(mesh)));
    assert.equal(G.reactive.streak, 7); assert.equal(G.reactive.prevDamage, 9);
    assert.equal(G.stats.streak, 7);
  }
});
const warmStart = mainSource.indexOf('const warmIdentity = ');
const warmEnd = mainSource.indexOf('// Loading.run', warmStart);
assert.ok(warmStart >= 0 && warmEnd > warmStart);
test('first prewarm initializes the environment and submits an identity transform', () => {
  const calls = [], G = { env: null, dayClock: 123 };
  G.renderer = {
    stats: { draws: 0 }, setEnvironment(env) { this.env = env; calls.push('environment'); },
    begin() { assert.ok(this.env.fog); calls.push('begin'); },
    draw(mesh, model) { assert.deepEqual(Array.from(model), Array.from(m4.identity(m4.create()))); this.stats.draws++; },
    end() { calls.push('end'); },
  };
  const warm = new Function('G', 'm4', 'setCycleEnv', mainSource.slice(warmStart, warmEnd) + '; return prewarmSectorMesh;')(
    G, m4, () => { G.env = { fog: [0, 0, 0] }; });
  assert.equal(warm({ min: [0, 0, 0], max: [1, 1, 1], count: 3 }, 'land').submitted, 1);
  assert.deepEqual(calls, ['environment', 'begin', 'end']); assert.equal(G.dayClock, 123);
});
test('failed prewarm closes the renderer frame and preserves its original error', () => {
  const G = { env: { fog: [0, 0, 0] }, renderer: {
    stats: { draws: 0 }, setEnvironment() {}, begin() { this.queryActive = true; },
    draw() { throw new Error('draw failed'); }, end() { this.queryActive = false; },
  } };
  const warm = new Function('G', 'm4', 'setCycleEnv', mainSource.slice(warmStart, warmEnd) + '; return prewarmSectorMesh;')(G, m4, () => {});
  assert.throws(() => warm({ min: [0, 0, 0], max: [1, 1, 1] }, 'land'), /draw failed/);
  assert.equal(G.renderer.queryActive, false);
});

const transitionStart = mainSource.indexOf('const SEAM_MIN_MS = ');
const transitionEnd = mainSource.indexOf('function currentSectorReady(', transitionStart);
assert.ok(transitionStart >= 0 && transitionEnd > transitionStart);
function transitionFixture(ignoreCancellation = false) {
  const frames = [], calls = [], resets = [], loaded = new Set([0]), requests = new Map();
  const S = {
    at: (x) => x, has: (x) => loaded.has(x),
    plan: (x) => ({ load: loaded.has(x) ? [] : [x], unload: [] }),
    update(x) {
      calls.push(x);
      return new Promise((resolve, reject) => requests.set(x, { resolve: () => { loaded.add(x); resolve(); }, reject }));
    },
    cancel() {
      if (ignoreCancellation) return;
      for (const [x, request] of requests) { request.reject(new DOMException('Cancelled', 'AbortError')); requests.delete(x); }
    },
  };
  const G = { world: { sectors: S }, veh: { reset: (...args) => resets.push(args) }, seamHold: false };
  let clock = 0;
  const api = new Function('G', 'requestAnimationFrame', 'window', 'performance', 'setTimeout', 'refreshReactive', 'showSeamCard', 'hideSeamCard', 'spawnY',
    mainSource.slice(transitionStart, transitionEnd) + '; return { teleportTo };')(
    G, (resolve) => frames.push(resolve), {}, { now: () => clock += 2000 }, (resolve) => resolve(), () => {}, () => {}, () => {}, () => 0);
  const advance = async (n = 8) => {
    for (let i = 0; i < n; i++) { for (const resolve of frames.splice(0)) resolve(); await Promise.resolve(); await Promise.resolve(); }
  };
  return { ...api, G, calls, resets, requests, advance };
}
async function asyncTest(name, run) { await run(); passed++; console.log(`  ok ${name}`); }
await asyncTest('resident teleport cancels queued work before its Worker starts', async () => {
  const f = transitionFixture();
  const old = f.teleportTo(1, 0), current = f.teleportTo(0, 2);
  assert.deepEqual(f.resets, [[0, 2, 0, 0]], 'resident placement remains synchronous');
  await f.advance();
  assert.equal((await old).cancelled, true); assert.equal((await current).cancelled, false);
  assert.deepEqual(f.calls, []); assert.equal(f.G.seamHold, false);
});
await asyncTest('resident destination wins over an active remote preparation', async () => {
  const f = transitionFixture();
  const old = f.teleportTo(1, 0); await f.advance(3); assert.deepEqual(f.calls, [1]);
  await f.teleportTo(0, 3); await f.advance();
  assert.equal((await old).cancelled, true); assert.deepEqual(f.resets, [[0, 3, 0, 0]]);
  assert.equal(f.G.seamHold, false);
});
await asyncTest('old cancellation cannot release the replacement destination hold', async () => {
  const f = transitionFixture();
  const old = f.teleportTo(1, 0); await f.advance(3);
  const current = f.teleportTo(2, 0); await f.advance(3);
  assert.equal((await old).cancelled, true); assert.equal(f.G.seamHold, true);
  assert.deepEqual(f.resets, []); f.requests.get(2).resolve(); await f.advance();
  assert.equal((await current).cancelled, false); assert.deepEqual(f.resets, [[2, 0, 0, 0]]);
  assert.equal(f.G.seamHold, false);
});
await asyncTest('a late resolved preparation cannot overwrite a newer resident placement', async () => {
  const f = transitionFixture(true);
  const old = f.teleportTo(1, 0); await f.advance(3);
  await f.teleportTo(0, 4); f.requests.get(1).resolve(); await f.advance();
  assert.equal((await old).cancelled, true); assert.deepEqual(f.resets, [[0, 4, 0, 0]]);
});

console.log(`\nsector worker packet smoke: ${passed}/${passed} checks passed (pure fixtures only)`);

// Explicit heavy gate, scheduled separately from the default pure fixtures.
// Compare an actual dedicated Worker with the synchronous source bake. The
// renderer hashes incoming attributes instead of allocating a GPU or a canvas.
if (process.argv.includes('--world')) {
  const [{ Worker: NodeWorker }, { createHash }, fs] = await Promise.all([
    import('node:worker_threads'), import('node:crypto'), import('node:fs'),
  ]);
  await import('../src/game/landmarks.js');
  await import('../src/game/ottawa.js');
  const [{ bakeWorld, packWorldQueries }, { sectorAt }, { Materials, prototypeManifest, setMaterials }] = await Promise.all([
    import('../src/game/world.js'), import('../src/game/sectors.js'), import('../src/game/materials.js'),
  ]);
  const prototype = process.argv.includes('--prototype');
  const sectorArg = process.argv.indexOf('--sector');
  const sector = sectorArg >= 0 ? process.argv[sectorArg + 1] : 'aylmer';
  assert.ok(['aylmer', 'hull', 'chelsea', 'ottawa'].includes(sector), 'pass --sector <sector>');
  const manifest = JSON.parse(fs.readFileSync(new URL(`../assets/materials/${prototype ? 'atlas.real' : 'atlas'}.json`, import.meta.url), 'utf8'));
  const mats = new Materials(prototype ? prototypeManifest(manifest) : manifest, null);
  mats.prototypeStyle = prototype; setMaterials(mats);
  function digest(value) {
    const hash = createHash('sha256');
    function add(v) {
      if (ArrayBuffer.isView(v)) { hash.update(v.constructor.name); hash.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); }
      else if (Array.isArray(v)) { hash.update('['); for (const item of v) add(item); hash.update(']'); }
      else if (v && typeof v === 'object') { for (const k of Object.keys(v).sort()) { hash.update(k); add(v[k]); } }
      else hash.update(JSON.stringify(v) ?? 'undefined');
    }
    add(value); return hash.digest('hex');
  }
  const sync = bakeWorld({ isPrototype: prototype }, mats, { inside: (x, z) => sectorAt(x, z) === sector, distant: true, signage: false });
  const expected = [], actual = [];
  for (const [kind, map] of [['land', sync.builders], ['near', sync.houseNearB], ['far', sync.houseFarB],
    ['water', sync.waterB], ['night', sync.nightB], ['distant', new Map([[null, sync.distant]])]]) {
    for (const [k, b] of map) {
      if (!b.empty) expected.push(digest(packMesh(b, kind, k)));
      b.v.length = b.i.length = b.uv.length = b.rect.length = 0; map.delete(k);
    }
  }
  const expectedQueries = digest(packWorldQueries(sync));
  let actualQueries = null, liveBytes = 0, peakBytes = 0;
  const workerURL = new URL('../src/game/world/sector-worker.js', import.meta.url).href;
  class RealWorker {
    constructor() {
      const source = `import { parentPort } from 'node:worker_threads';
        const queue = []; let ready = false;
        globalThis.self = { postMessage: (data, transfer) => parentPort.postMessage(data, transfer) };
        parentPort.on('message', data => { if (ready) self.onmessage({ data }); else queue.push(data); });
        await import(${JSON.stringify(workerURL)}); ready = true;
        for (const data of queue) self.onmessage({ data });`;
      this.worker = new NodeWorker(new URL('data:text/javascript,' + encodeURIComponent(source)), { type: 'module' });
      this.worker.on('message', (data) => {
        if (data.kind === 'queries') { const { bakeMs, ...packet } = data.packet; actualQueries = digest(packet); }
        this.onmessage?.({ data });
      });
      this.worker.on('error', (error) => this.onerror?.(error));
    }
    postMessage(data) { this.worker.postMessage(data); }
    terminate() { this.terminated = true; return this.worker.terminate(); }
  }
  const gpu = {
    isPrototype: prototype,
    upload(packet) {
      actual.push(digest(packet));
      const bytes = packetTransfer(packet).bytes; liveBytes += bytes; peakBytes = Math.max(peakBytes, liveBytes);
      return { count: packet.i.length, bytes, min: packet.min, max: packet.max };
    },
    free(mesh) { assert.ok(mesh.count > 0); liveBytes -= mesh.bytes; mesh.count = 0; },
  };
  const real = createSectorClient(gpu, mats, { workerFactory: () => new RealWorker(), nextFrame: async () => {} });
  const world = await real.prepare(sector, { distant: true });
  assert.deepEqual(actual, expected, 'exact mesh bytes, kind/key ordering and bounds match');
  assert.equal(actualQueries, expectedQueries, 'all query, pole, camera and source metadata match');
  let queryChecks = 0;
  for (const road of sync.roads.slice(0, 300)) for (const [x, z] of road.pts.slice(0, 2)) {
    assert.equal(world.roadAt(x, z), sync.roadAt(x, z));
    for (const streetsOnly of [false, true]) assert.equal(world.pavedAt(x, z, -1, 0.4, streetsOnly), sync.pavedAt(x, z, -1, 0.4, streetsOnly));
    assert.equal(world.buildingAt(x, z, 0.9), sync.buildingAt(x, z, 0.9));
    assert.deepEqual(world.querySegments(x, z, 6).map((s) => ({ ...s })), sync.querySegments(x, z, 6).map((s) => ({ ...s })));
    assert.deepEqual([...world.queryWalks(x, z, 20)], [...sync.queryWalks(x, z, 20)]);
    assert.deepEqual({ ...world.groundAt(x, z) }, { ...sync.groundAt(x, z) });
    assert.equal(world.waterAt(x, z), sync.waterAt(x, z)); queryChecks++;
  }
  const stats = { ...world.loadingStats, peakUploadedBytes: peakBytes, meshesCompared: expected.length, queryChecks };
  world.free(); if (world.distant) gpu.free(world.distant);
  assert.equal(liveBytes, 0, 'all uploaded handles freed'); sync.cameraColliders.free();
  // Cancel the actual Worker after it announces synchronous CPU bake entry.
  let cancelledWorker;
  const cancelling = createSectorClient(gpu, mats, { workerFactory: () => {
    const w = cancelledWorker = new RealWorker();
    const original = w.worker.listeners('message')[0]; w.worker.removeListener('message', original);
    w.worker.on('message', (data) => { original(data); if (data.kind === 'bake-start') cancelling.cancel(); });
    return w;
  } });
  const cancelled = await cancelling.prepare(sector).catch((error) => error);
  assert.equal(cancelled.name, 'AbortError'); assert.equal(cancelledWorker.terminated, true);
  await cancelledWorker.worker.terminate();
  console.log('sector worker actual parity:', JSON.stringify({ sector, prototype, ...stats, cancellation: 'terminated during CPU bake' }));
}
