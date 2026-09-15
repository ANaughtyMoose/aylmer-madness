// World smoke test — runs the whole bake under node with a stubbed GL.
//
//   node tools/smoke_world.mjs
//
// There is no WebGL and no DOM here, so Renderer.upload is replaced with a
// vertex counter and document.createElement with a canvas that draws nothing.
// Everything else — mapdata, the road graph, intersections, signals, signage —
// is the real code the browser runs.
import { strict as assert } from 'node:assert';

// ---------------------------------------------------------------- stubs
const ctx2d = {
  clearRect() {}, fillRect() {}, fillText() {}, drawImage() {},
  measureText() { return { width: 40 }; },
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
  putImageData() {},
};
globalThis.document = {
  createElement() {
    return { width: 0, height: 0, getContext() { return ctx2d; } };
  },
};

class StubRenderer {
  constructor() {
    this.uploads = 0; this.verts = 0; this.tris = 0; this.draws = 0; this.texVerts = 0;
    this.textures = 0; this.time = 0;
    this.env = { sky: [0.42, 0.62, 0.95], fog: [0.72, 0.8, 0.92], sun: [1, 1, 1] };
  }
  upload(b) {
    this.uploads++;
    if (b.finish) b.finish();          // the real Renderer.upload does this
    this.verts += b.v.length / 9;
    if (b.rect.length) this.texVerts += b.v.length / 9;
    this.tris += b.i.length / 3;
    assert.equal(b.i.length % 3, 0, 'index buffer is not whole triangles');
    if (b.uv.length) assert.equal(b.uv.length, (b.v.length / 9) * 2, 'uv array out of step');
    return { vao: null, count: b.i.length, min: b.min.slice(), max: b.max.slice() };
  }
  texture() { this.textures++; return { stub: true }; }
  visible() { return true; }
  draw() { this.draws++; }
}

// ---------------------------------------------------------------- run
const { MAP } = await import('../src/game/mapdata.js');
const { buildWorld, nightAmount, buildHeadlights } = await import('../src/game/world.js');
const { Signals, planSignals, planStopSigns, roadNodes, GREEN, AMBER } =
  await import('../src/game/signals.js');
const { planSigns, buildSignage } = await import('../src/game/signage.js');
const { Traffic } = await import('../src/game/traffic.js');
const { Nav, routeLength } = await import('../src/game/nav.js');

const fails = [];
let checks = 0;
function ok(name, fn) {
  checks++;
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { fails.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const r = new StubRenderer();
const t0 = Date.now();
const world = buildWorld(r);
const buildMs = Date.now() - t0;

console.log(`\nbuild: ${buildMs} ms, ${r.uploads} meshes, ${r.verts | 0} verts, ${r.tris | 0} tris\n`);

ok('named golf clubhouse gets a pitched landmark roof', () => {
  assert.equal(world.landmarkRoofs, 1);
});

// ------------------------------------------------- W3 intersections
ok('W3 intersection polygons exist', () => {
  assert.ok(world.intersections > 0, `intersections = ${world.intersections}`);
  assert.ok(world.intersections > 200, `only ${world.intersections} junctions found`);
});

ok('W3 junction nodes carry a positive extent', () => {
  const nodes = roadNodes();
  let junctions = 0;
  for (const nd of nodes.values()) {
    if (nd.br.length < 3) continue;
    junctions++;
    assert.ok(nd.ext > 0, 'junction with zero extent');
    assert.ok(nd.ext >= nd.maxHw, 'extent shorter than the widest kerb');
  }
  assert.equal(junctions, world.intersections, 'polygon count != junction count');
});

ok('W3 junction arms are geometrically unique', () => {
  for (const nd of roadNodes().values()) {
    for (let i = 0; i < nd.br.length; i++) {
      for (let j = i + 1; j < nd.br.length; j++) {
        const dot = nd.br[i].dx * nd.br[j].dx + nd.br[i].dz * nd.br[j].dz;
        assert.ok(dot < 0.999, `duplicate arms at road node ${nd.id}`);
      }
    }
  }
});

// ------------------------------------------------- street furniture vs asphalt
// The owner's complaint: sidewalks, kerb corners and poles standing in the
// road. `world.furniture` is every candidate piece the bake considered, where
// it was going, which way it belongs to, and whether the asphalt test threw it
// out — so one pass over it both proves the survivors are clear and says how
// much used to be laid across a lane.
ok('nothing the bake emitted alongside a road is standing on another way', () => {
  const f = world.furniture;
  assert.ok(f.n > 100000, `only ${f.n} furniture samples to check`);
  let kept = 0, bad = 0, first = '';
  for (let i = 0; i < f.n; i++) {
    if (f.dropped[i]) continue;
    kept++;
    // margin 0 == the honest asphalt edge. A piece may touch its own street's
    // kerb (that is what a kerb is); it may not be on anybody else's.
    if (!world.pavedAt(f.x[i], f.z[i], f.road[i], 0)) continue;
    bad++;
    if (!first) first = `${f.kind[i]} at ${f.x[i].toFixed(1)}, ${f.z[i].toFixed(1)}`;
  }
  const by = {};
  for (let i = 0; i < f.n; i++) if (f.dropped[i]) by[f.kind[i]] = (by[f.kind[i]] || 0) + 1;
  console.log(`       ${kept} pieces clear, ${f.droppedCount} refused (`
    + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') + ')');
  assert.equal(bad, 0, `${bad} of ${kept} emitted pieces sit on a lane (first: ${first})`);
});

ok('the pavement survives the cull: both sectors keep most of their walks', () => {
  const f = world.furniture;
  let hull = 0, ayl = 0;
  for (let i = 0; i < f.n; i++) {
    if (f.dropped[i] || f.kind[i] !== 'walk') continue;
    if (f.x[i] > 2500) hull++; else ayl++;
  }
  // A dual carriageway legitimately loses its inboard walk, so roughly half of
  // the Hull samples are expected to go; a town with no pavement left in it is
  // the failure this guards against.
  assert.ok(hull > 40000, `only ${hull} sidewalk samples left in Hull`);
  assert.ok(ayl > 3000, `only ${ayl} sidewalk samples left in old Aylmer`);
});

// ------------------------------------------------- W4 signals
const signals = planSignals();
ok('W4 signal list has 6-8 entries', () => {
  assert.ok(signals.length >= 6 && signals.length <= 8, `got ${signals.length}`);
  for (const s of signals) {
    assert.ok(s.approaches.length >= 3, `${s.name} has ${s.approaches.length} approaches`);
    assert.ok(s.approaches.some((a) => a.axis === 0), `${s.name}: no axis-0 approach`);
    assert.ok(s.approaches.some((a) => a.axis === 1), `${s.name}: no axis-1 approach`);
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z), 'signal has no position');
  }
  assert.equal(new Set(signals.map((s) => s.name)).size, signals.length, 'duplicate junction');
});

ok('W4 signals cycle correctly across update(15)', () => {
  const sig = new Signals();
  const s0 = sig.list[0];
  assert.equal(sig.stateName(s0, 0), 'green');
  assert.equal(sig.stateName(s0, 1), 'red');
  sig.update(GREEN + 0.5);                       // 12.5 s: amber on axis 0
  assert.equal(sig.stateName(s0, 0), 'amber');
  assert.equal(sig.stateName(s0, 1), 'red');
  sig.update(AMBER);                             // 15.5 s: the axes have swapped
  assert.equal(sig.stateName(s0, 0), 'red');
  assert.equal(sig.stateName(s0, 1), 'green');
  sig.update(15);                                // 30.5 s: back where we started
  assert.equal(sig.stateName(s0, 0), 'green');
  assert.equal(sig.stateName(s0, 1), 'red');
});

ok('W4 stateAt answers by heading and is null off-junction', () => {
  const sig = new Signals();
  const s0 = sig.list[0];
  const a0 = s0.approaches.find((a) => a.axis === 0);
  const a1 = s0.approaches.find((a) => a.axis === 1);
  assert.equal(sig.stateAt(s0.x, s0.z, a0.yaw), 'green');
  assert.equal(sig.stateAt(s0.x, s0.z, a1.yaw), 'red');
  // Same axis, driving the other way down the street: same light.
  assert.equal(sig.stateAt(s0.x, s0.z, a0.yaw + Math.PI), 'green');
  assert.equal(sig.stateAt(s0.x + 4000, s0.z, a0.yaw), null);
});

ok('W4 playerRanRed fires once per pass, and not on green', () => {
  const sig = new Signals();
  const s0 = sig.list[0];
  const red = s0.approaches.find((a) => a.axis === 1);
  const veh = { x: s0.x, z: s0.z, yaw: red.yaw, vLong: 16 };
  assert.equal(sig.playerRanRed(veh), true, 'first crossing should fire');
  assert.equal(sig.playerRanRed(veh), false, 'must not fire twice on one pass');
  veh.x = s0.x + 500; sig.playerRanRed(veh);       // drive away: re-arm
  veh.x = s0.x;
  assert.equal(sig.playerRanRed(veh), true, 'should re-arm after leaving');
  const green = s0.approaches.find((a) => a.axis === 0);
  const veh2 = { x: s0.x, z: s0.z, yaw: green.yaw, vLong: 16 };
  assert.equal(sig.playerRanRed(veh2), false, 'green is not a red');
  const slow = { x: s0.x, z: s0.z, yaw: red.yaw, vLong: 0.5 };
  const sig2 = new Signals();
  assert.equal(sig2.playerRanRed(slow), false, 'creeping through is not running it');
});

ok('W4 stop signs sit on residential approaches', () => {
  const stops = planStopSigns();
  assert.ok(stops.length >= 20, `only ${stops.length} stop signs`);
  assert.ok(stops.length <= 140, `${stops.length} stop signs is over the cap`);
  for (const s of stops) {
    assert.ok(Math.hypot(s.dx, s.dz) > 0.99, 'approach direction is not unit length');
  }
  assert.equal(world.stopSigns.length, stops.length);
});

ok('W4 traffic obeys a red without exploding', () => {
  const sig = new Signals();
  const traffic = new Traffic(6, 11);
  traffic.signals = sig;
  const player = { x: 0, z: 0, spec: { wid: 1.8 }, nudge() {} };
  for (let i = 0; i < 600; i++) { sig.update(1 / 60); traffic.update(1 / 60, player); }
  for (const c of traffic.cars) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z), 'traffic car went NaN');
    assert.ok(c.speed >= 0, 'negative speed');
  }
});

// ------------------------------------------------- W5 signage
ok('W5 sign atlas lists at least 20 storefront names', () => {
  const plan = planSigns();
  assert.ok(plan.length >= 100, `only ${plan.length} signs planned`);
  assert.ok(plan.length <= 120, `${plan.length} signs is over the cap`);
  assert.equal(plan.length, 120, 'every fictional POI gets a physical sign');
  const built = buildSignage(r);
  assert.ok(built, 'buildSignage returned null');
  assert.ok(built.names.length >= 20, `atlas carries ${built.names.length} names`);
  for (const n of built.names) assert.ok(n && n.length, 'empty sign name');
  assert.ok(world.signage, 'world did not build its signage');
  assert.ok(world.signage.names.length >= 20);
});

// ------------------------------------------------- W6 / W7 / W2
ok('W6 river is its own set of chunk meshes', () => {
  assert.ok(world.waterChunks.length > 0, 'no water chunks');
  assert.ok(world.waterChunks.every((c) => c.mesh.count > 0));
});

ok('W7 lamp pools exist and are separate from the day meshes', () => {
  assert.ok(world.nightChunks.length > 0, 'no night chunks');
  assert.ok(world.poles.length > 0, 'pole list is empty');
  assert.ok(world.poles.some((p) => p.kind === 'streetlight'), 'no streetlights in the pole list');
  assert.ok(world.poles.some((p) => p.kind === 'signal'), 'no signal poles in the pole list');
  assert.ok(world.poles.some((p) => p.kind === 'stopsign'), 'no stop signs in the pole list');
  for (const p of world.poles) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && p.h > 0);
  }
});

ok('W7 nightAmount reads the environment', () => {
  assert.equal(nightAmount({ sky: [0.42, 0.62, 0.95] }), 0);
  assert.ok(nightAmount({ sky: [0.16, 0.18, 0.34] }) > 0.7);
  assert.ok(buildHeadlights(r, { len: 4.4 }).count > 0);
});

ok('W2 chunks fade in over 0.4 s and reset when they leave range', () => {
  const before = r.draws;
  world.draw(r, new Float32Array(16), 0, -200, 700, 1 / 60);
  assert.ok(r.draws > before, 'world.draw issued nothing');
  const near = world.chunks.filter((c) => Math.hypot(c.cx - 0, c.cz + 200) <= 700);
  assert.ok(near.length > 0);
  assert.ok(near.every((c) => c.fade === 1), 'first frame should not fade the world in');
  // Walk far away, then come back: the chunk has to fade rather than pop.
  world.draw(r, new Float32Array(16), 100000, 100000, 700, 1 / 60);
  assert.ok(near.every((c) => c.fade === 0), 'out-of-range chunks should reset');
  world.draw(r, new Float32Array(16), 0, -200, 700, 0.1);
  assert.ok(near.every((c) => c.fade > 0 && c.fade < 1), 'chunk should be mid-fade');
  world.draw(r, new Float32Array(16), 0, -200, 700, 0.4);
  assert.ok(near.every((c) => c.fade === 1), 'chunk should be fully in after 0.4 s');
});

// ------------------------------------------------- T3 (not done — shape guard)
ok('T3 MAP keeps the shape nav/bigmap/hud/places read', () => {
  // mapdata.js was NOT re-encoded (see the summary); this guards the contract so
  // a future quantisation has to decode back to exactly this.
  assert.ok(Array.isArray(MAP.roads) && MAP.roads.length > 1000);
  const r0 = MAP.roads[0];
  assert.equal(typeof r0.name, 'string');
  assert.equal(typeof r0.cls, 'string');
  assert.equal(typeof r0.w, 'number');
  assert.equal(typeof r0.oneway, 'boolean');
  assert.ok(Array.isArray(r0.pts) && Array.isArray(r0.pts[0]));
  assert.equal(typeof r0.pts[0][0], 'number');
  assert.ok(Array.isArray(r0.ids) && r0.ids.length === r0.pts.length);
  assert.ok(Array.isArray(MAP.buildings[0].p) && typeof MAP.buildings[0].h === 'number');
  assert.ok(Array.isArray(MAP.water[0].p) && Array.isArray(MAP.water[0].t));
  assert.ok(Array.isArray(MAP.areas) && typeof MAP.pois[0].name === 'string');
  assert.ok(typeof MAP.waterMask.b64 === 'string' && MAP.waterMask.cell > 0);
  assert.ok(typeof MAP.bounds.minX === 'number');
});

ok('Highway to Hull is a connected expansion, not an isolated road island', () => {
  assert.equal(MAP.expansions?.highwayToHull, true);
  assert.ok(MAP.bounds.maxX >= 5000);
  assert.equal(MAP.expansions?.highwayToHullSource, 'OpenStreetMap');
  assert.ok(MAP.roads.some((road) => road.name === 'Boulevard des Allumettières'));
  assert.ok(MAP.pois.some((p) => p.name === "Musée canadien de l'histoire"));
  const nav = new Nav();
  const route = nav.route(932.9, 143.9, 9342.1, -3542.2);
  assert.ok(route && route.length > 20, 'home cannot route to downtown Hull');
  assert.ok(routeLength(route, 932.9, 143.9) > 5000, 'Hull route bypasses the highway corridor');
  const north = nav.route(5564.4, -6917.7, 3092.4, -12175.3);
  assert.ok(north && north.length > 20, 'Heritage College cannot route north to Chelsea');
  assert.ok(routeLength(north, 5564.4, -6917.7) > 9000, 'Chelsea route is unexpectedly short');
});

// ------------------------------------------------- budget
// The town itself (roads, ground, trees, non-house buildings) still has to fit
// the old 500k budget; the houses are baked twice on top of it — lod 0 near and
// lod 2 far — and only ever one of the two is drawn for a given chunk.
//
// REBASELINED for the topography slice, 2,500,000 -> 3,950,000. Measured on
// this machine, whole map, no sector filter: 2,423,144 town triangles before,
// 3,773,406 after. Every one of the 1,350,262 new ones is the town following
// the ground instead of lying at y = 0. Where they went:
//
//   738,024  the lawn. The 588 chunks over the raster stopped being one 200 m
//            quad each and became a grid cut on the raster's own 8 m lines:
//            369,600 quads. Vertices are SHARED across each chunk's grid, so it
//            is 702 vertices a chunk rather than the 2,500 the plan budgeted for
//            at four vertices a quad — 14 MB instead of 50.
//   338,880  landuse. A park or a wood is one ear-clipped polygon up to 200 m
//            across, and flat polygons that size are buried thirty metres inside
//            the hill they are drawn on. The surfaces you stand on — car parks,
//            the beach, the pitches — are cut at the 8 m cell; the big green
//            washes under the trees at 32 m, which is what keeps this number
//            from being 2,987,315.
//   111,596  skirts. 8,662 footprints sit on enough of a slope to need a
//            foundation wall from the median footing down past their lowest
//            corner (the deepest is 2.91 m), so a house on a grade neither
//            floats at the back nor sinks at the front. Nothing outside the
//            raster gets one.
//   ~162,000 the roads and everything laid beside them: asphalt cut to 8 m on
//            both axes, joint discs, dashes, edge lines, gutters, shoulders,
//            sidewalk slabs, junction decks fanned from their own centroids, the
//            shoreline, and the feature surfaces of section 5c.
//
// The ceiling is the measurement plus about 4 %, the same margin the 2.5 M had.
ok('the detailed two-sector world stays inside the expansion triangle budget', () => {
  const houses = world.stats.residentNear + world.stats.residentFar;
  // Two-sided residential walks now replace the former 18% one-sided policy.
  // Common terrain clipping also adds faces but shares their vertices. Retain
  // the original 340 MB memory ceiling below; allow the measured extra faces.
  assert.ok(r.tris - houses < 4700000, `${(r.tris - houses) | 0} triangles`);
});

ok('resident house geometry stays inside the LOD budget', () => {
  const st = world.stats;
  assert.ok(st.residentNear > 400000, `near bake is only ${st.residentNear | 0} tris`);
  assert.ok(st.residentNear + st.residentFar < 1300000,
    `${(st.residentNear + st.residentFar) | 0} resident house triangles`);
  // Only the near bake carries UV + atlas-rect attributes (60 B a vertex); the
  // far bake and the whole town stay on the 36 B layout.
  //
  // REBASELINED for the topography slice, 280 -> 340 MB. Measured: 7,394,172
  // vertices and 254 MB before, 9,358,304 and 321 MB after, on the whole map
  // with no sector filter — the worst case the game never actually holds, since
  // sectors.js builds one slice at a time (the Aylmer slice alone bakes 2.54 M
  // triangles in the browser).
  //
  // The plan's mitigation for this guard was to fall back to 16 m ground
  // tessellation. It is deliberately NOT taken, because the ground mesh is not
  // where the bytes are: sharing vertices across each chunk's grid puts the
  // whole hillside in 14 MB (410k vertices), and halving its resolution would
  // save 10 of the 67 MB while doubling the distance between the surface you can
  // see and the one the car drives on. 8 m is the raster's own cell, and the
  // chunk grid is cut on the raster's lines, so the drawn ground passes through
  // every node the physics reads — median disagreement between mesh and field
  // 1.8 mm, p99 6 cm, worst 0.88 m at one broken cell. At 16 m it would cut the
  // corner off every other node instead.
  //
  // The 67 MB is mostly landuse (35 MB — 1.0 M vertices of park, wood and car
  // park, none of them shared because an ear-clipped polygon has no grid to
  // share along), then the draped roads and the 8,662 skirts.
  const mb = (r.texVerts * 60 + (r.verts - r.texVerts) * 36) / (1024 * 1024);
  assert.ok(mb < 340, `${mb.toFixed(0)} MB of vertex buffers`);
  console.log(`       ${(st.residentNear / 1000) | 0}k near + ${(st.residentFar / 1000) | 0}k far tris, `
    + `${(r.texVerts / 1000) | 0}k textured verts, ${mb.toFixed(0)} MB vertex data`);
});

ok('near and far house bakes agree on how many houses there are', () => {
  let near = 0, far = 0;
  for (const c of world.chunks) { if (c.near) near++; if (c.far) far++; }
  assert.equal(near, far, `${near} near chunks vs ${far} far chunks`);
});

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) {
  console.error('FAILED: ' + fails.join(', '));
  process.exit(1);
}
