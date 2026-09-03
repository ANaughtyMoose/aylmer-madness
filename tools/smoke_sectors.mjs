// Sector gating (src/game/sectors.js): the map is baked a slice at a time and
// the aggregate must look exactly like the whole-map world to everything else.
// Same DOM/GL stubs as smoke_world.mjs (signage bakes on a 2D canvas).
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
  constructor() { this.uploads = 0; this.frees = 0; this.gpuBytes = 0; this.env = { sky: [0.4, 0.6, 0.9], fog: [0.7, 0.8, 0.9], sun: [1, 1, 1] }; }
  upload(b) {
    this.uploads++;
    if (b.finish) b.finish();
    const bytes = (b.v.length + b.uv.length + (b.rect ? b.rect.length : 0) + b.i.length) * 4;
    this.gpuBytes += bytes;
    return { vao: {}, count: b.i.length, bytes, min: b.min.slice(), max: b.max.slice() };
  }
  free(m) { if (!m || !m.vao) return; this.frees++; this.gpuBytes -= m.bytes; m.vao = null; m.count = 0; }
  texture() { return { stub: true }; }
  visible() { return true; }
  draw() {}
}

const { MAP } = await import('../src/game/mapdata.js');
const { buildWorld, clipRoads } = await import('../src/game/world.js');
const { buildSectors, sectorAt, riverZ, nearSectors, SECTOR_IDS, APPROACH, LEAVE } =
  await import('../src/game/sectors.js');

const fails = [];
let checks = 0;
function ok(name, fn) {
  checks++;
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { fails.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

// ---------------------------------------------------------------- where is what
ok('the cast lives where the sectors say', () => {
  assert.equal(sectorAt(932.9, 143.9), 'aylmer', '299 Fraser');
  assert.equal(sectorAt(-18.9, -331.2), 'aylmer', 'Galeries');
  assert.equal(sectorAt(2734.8, -3245.4), 'hull', 'Route 148 gate');
  assert.equal(sectorAt(9510, -3364), 'hull', 'Place du Portage');
  assert.equal(sectorAt(10668, -3330), 'ottawa', 'Parliament Hill');
  assert.equal(sectorAt(10695, -3928), 'ottawa', 'National Gallery');
  assert.equal(sectorAt(11276, -3465), 'ottawa', 'Rideau Centre');
  assert.equal(sectorAt(6311, -1107), 'ottawa', 'Champlain Bridge, Ottawa end');
  assert.equal(sectorAt(5614.7, -2005.2), 'hull', 'Champlain Bridge, Hull end');
  assert.equal(sectorAt(4102.8, -12378.1), 'chelsea', 'École Montessori de Chelsea');
  assert.equal(sectorAt(3692.3, -9728.0), 'chelsea', 'Parc de la Technologie');
});
ok('the river runs the right way', () => {
  assert.ok(riverZ(5000) > riverZ(9000), 'the river flows north-east, so z falls with x');
  // Every water POI south of the centreline is Ottawa; every named Hull POI north of it is Hull.
  const bad = [];
  for (const p of MAP.pois) {
    if (/Parliament|Château Laurier|Rideau Centre|Byward Market Building|National Gallery/.test(p.name) && sectorAt(p.x, p.z) !== 'ottawa') bad.push(p.name);
    if (/Casino du Lac-Leamy|Place du Portage|Musée canadien de l|Galeries de Hull/.test(p.name) && sectorAt(p.x, p.z) !== 'hull') bad.push(p.name + '@' + sectorAt(p.x, p.z));
  }
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- the road cut
ok('every road segment belongs to exactly one sector, and none is lost', () => {
  let total = 0;
  for (const r of MAP.roads) total += Math.max(0, r.pts.length - 1);
  let sum = 0;
  for (const id of SECTOR_IDS) {
    const cut = clipRoads(MAP.roads, (x, z) => sectorAt(x, z) === id);
    for (const r of cut) {
      assert.ok(r.pts.length >= 2, 'a run with one point');
      if (r.ids) assert.equal(r.ids.length, r.pts.length, 'ids out of step with pts');
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const mx = (r.pts[i][0] + r.pts[i + 1][0]) / 2, mz = (r.pts[i][1] + r.pts[i + 1][1]) / 2;
        assert.equal(sectorAt(mx, mz), id, `${r.name} segment ${i} baked by ${id}`);
      }
      sum += r.pts.length - 1;
    }
  }
  assert.equal(sum, total, 'segments across the four cuts != segments in the map');
});
ok('a whole-map build is untouched by the filter (same roads object)', () => {
  const r = new StubRenderer();
  const w = buildWorld(r);
  assert.strictEqual(w.roads, MAP.roads);
  assert.ok(w.distant, 'distant scenery built');
  assert.ok(w.signage, 'signage built');
});

// ---------------------------------------------------------------- the aggregate
const r = new StubRenderer();
const t0 = Date.now();
const W = buildSectors(r, undefined, { x: 932.9, z: 143.9 });
console.log(`\nhome build: ${Date.now() - t0} ms, ${r.uploads} meshes, ${(r.gpuBytes / 1e6) | 0} MB\n`);
ok('starts with only Aylmer resident', () => {
  assert.equal(W.sectors.loaded(), 'aylmer');
  assert.ok(W.chunks.length > 500, `chunks ${W.chunks.length}`);
  assert.ok(W.distant && W.signage, 'shared scenery and signage exist');
  assert.ok(W.walks.length > 100 && W.propSpots.length > 100 && W.poles.length > 100, 'reactive lists filled');
});
ok('nothing to do in the driveway; Hull is wanted at the 148 gate', () => {
  assert.deepEqual(W.sectors.plan(932.9, 143.9), { load: [], unload: [] });
  const p = W.sectors.plan(2734.8, -3245.4);
  assert.ok(p.load.includes('hull'), JSON.stringify(p));
  assert.ok(!p.unload.includes('aylmer'), 'Aylmer stays while you are 200 m past the seam');
});
// A point ON a named road in a given sector — the place coordinates are the
// house and the plaza, which is exactly where roadAt() should say no.
function onRoad(name, sector) {
  for (const r of MAP.roads) {
    if (r.name !== name) continue;
    const p = r.pts[r.pts.length >> 1];
    if (sectorAt(p[0], p[1]) === sector) return p;
  }
  throw new Error(`no ${name} in ${sector}`);
}
const FRASER = onRoad('Chemin Fraser', 'aylmer');
const PORTAGE = onRoad('Promenade du Portage', 'hull');
const WELLINGTON = onRoad('Wellington Street', 'ottawa');
ok('queries answer from the loaded slice, and the raw map for the rest', () => {
  assert.equal(W.roadAt(FRASER[0], FRASER[1]), true, 'Chemin Fraser is tarmac');
  assert.equal(W.roadAt(932.9, 143.9), false, 'the driveway at 299 is not');
  assert.equal(W.roadAt(WELLINGTON[0], WELLINGTON[1]), false, 'Wellington is not built yet');
  const n = W.nearestRoad(10668, -3330);
  assert.equal(n.name, 'Wellington Street', `raw fallback said ${n.name}`);
  assert.ok(n.dist < 150, `dist ${n.dist}`);   // the marker is on the Hill; the street is ~100 m off
  assert.equal(W.nearestRoad(932.9, 143.9).name, 'Chemin Fraser');
});
const aylmerBytes = r.gpuBytes;
ok('crossing into Hull loads it, keeps Aylmer; reaching Parliament drops Aylmer', () => {
  W.sectors.update(2734.8, -3245.4);
  assert.equal(W.sectors.loaded(), 'aylmer+hull');
  assert.ok(W.roadAt(PORTAGE[0], PORTAGE[1]), 'Promenade du Portage is tarmac now');
  W.sectors.update(10668, -3330);
  assert.ok(W.sectors.has('ottawa') && W.sectors.has('hull'), W.sectors.loaded());
  assert.ok(!W.sectors.has('aylmer'), 'Aylmer should be freed 8 km away');
  assert.ok(W.roadAt(WELLINGTON[0], WELLINGTON[1]), 'Wellington is tarmac now');
  assert.equal(W.roadAt(FRASER[0], FRASER[1]), false, 'Chemin Fraser is gone');
  assert.ok(W.querySegments(10668, -3330, 80).length > 0, 'walls near Parliament');
});
ok('freeing gives every byte back', () => {
  const before = r.gpuBytes, frees = r.frees;
  W.sectors.unload('ottawa');
  assert.ok(r.frees > frees, 'nothing freed');
  assert.ok(r.gpuBytes < before, 'bytes did not drop');
  W.sectors.unload('hull');
  assert.equal(W.sectors.loaded(), '');
  // Only the shared distant scenery and signage remain.
  assert.ok(r.gpuBytes < aylmerBytes * 0.05, `left ${(r.gpuBytes / 1e6).toFixed(1)} MB after freeing everything`);
  W.sectors.load('aylmer');
  assert.equal(W.sectors.loaded(), 'aylmer');
  assert.ok(Math.abs(r.gpuBytes - aylmerBytes) < 1e5, 'Aylmer rebuilt to the same size');
});
ok('the four slices together are about the whole map', () => {
  for (const id of SECTOR_IDS) W.sectors.load(id);
  const full = buildWorld(new StubRenderer());
  const ratio = W.stats.resident / full.stats.resident;
  // Per-sector tree/pole caps mean a little more than the whole-map bake, never less.
  assert.ok(ratio > 0.98 && ratio < 1.25, `slices/full = ${ratio.toFixed(3)}`);
  assert.equal(W.intersections > full.intersections * 0.95, true, `${W.intersections} vs ${full.intersections} intersections`);
});
// The Champlain Bridge deck lies over the OSM river polygon for its whole
// length, so waterAt() says "river" on tarmac. cars.js exempts roads from the
// in-water rule for exactly this reason (see smoke_driving's bridge check);
// this pins the premise, so a future map rebuild that moves the deck off the
// road grid shows up here and not as an invisible wall.
ok('the Champlain Bridge deck is tarmac over water, end to end', () => {
  let n = 0, road = 0, water = 0;
  for (const r of MAP.roads) {
    if (!/Champlain Bridge/.test(r.name || '')) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const x = (r.pts[i][0] + r.pts[i + 1][0]) / 2, z = (r.pts[i][1] + r.pts[i + 1][1]) / 2;
      n++; if (W.roadAt(x, z)) road++; if (W.waterAt(x, z)) water++;
    }
  }
  assert.ok(n > 10, `only ${n} deck segments`);
  assert.equal(road, n, `${n - road} deck segments are not on the road grid`);
  assert.ok(water > n / 2, `only ${water}/${n} deck segments over water — the premise changed`);
});
ok('approach index: Hull is near the gate, Chelsea is not near Aylmer', () => {
  assert.ok(nearSectors(2734.8, -3245.4, APPROACH).has('hull'));
  assert.ok(!nearSectors(932.9, 143.9, LEAVE).has('chelsea'));
  assert.ok(nearSectors(932.9, 143.9, APPROACH).has('aylmer'));
});

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED: ' + fails.join(', ')); process.exit(1); }
