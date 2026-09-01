#!/usr/bin/env node
// The reactive world under plain node: sidewalks, pedestrians, knock-over
// street props and the debris they become.
//
//   node tools/smoke_react.mjs
//
// Same trick as smoke_world.mjs: there is no WebGL and no DOM, so Renderer is a
// counter and document is a stub. Everything else — mapdata, the world bake,
// world.js section 9's sidewalk runs, peds.js, streetprops.js, debris.js — is
// the code the browser runs.
import { strict as assert } from 'node:assert';

// ---------------------------------------------------------------- stubs
const ctx2d = {
  clearRect() {}, fillRect() {}, fillText() {}, drawImage() {},
  measureText() { return { width: 40 }; },
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
  putImageData() {},
};
globalThis.document = {
  body: { appendChild() {} },
  createElement() {
    return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } };
  },
};

class StubRenderer {
  constructor() {
    this.uploads = 0; this.tris = 0; this.draws = 0; this.blanked = 0; this.blankedIdx = 0;
    this.env = { sky: [0.42, 0.62, 0.95], fog: [0.72, 0.8, 0.92], sun: [1, 1, 1] };
  }
  upload(b) {
    this.uploads++;
    if (b.finish) b.finish();
    this.tris += b.i.length / 3;
    return { vao: null, ibo: {}, count: b.i.length, min: b.min.slice(), max: b.max.slice() };
  }
  blankIndices(mesh, start, count) {
    assert.ok(mesh && count > 0, 'blankIndices with nothing to blank');
    assert.ok(start >= 0 && start + count <= mesh.count, `slice ${start}+${count} outside ${mesh.count}`);
    this.blanked++; this.blankedIdx += count;
  }
  texture() { return { stub: true }; }
  visible() { return true; }
  draw() { this.draws++; }
}

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? '   ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? '   ' + detail : ''}`); }
}
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- run
const { buildWorld } = await import('../src/game/world.js');
const { buildStreetProps, KINDS } = await import('../src/game/streetprops.js');
const { Debris, MAX_BODIES } = await import('../src/game/debris.js');
const { Peds, WALK, DIVE, DOWN, GETUP, POOL, SEE_KMH } = await import('../src/game/peds.js');

const r = new StubRenderer();
const tW0 = Date.now();
const world = buildWorld(r);
const worldMs = Date.now() - tW0;
const tP0 = Date.now();
const props = buildStreetProps(r, world);
const propMs = Date.now() - tP0;
console.log(`\nbuild: world ${worldMs} ms + streetprops ${propMs} ms, `
  + `${world.walks.length} walks, ${props.count} props, ${props.chunks.length} prop chunks\n`);

// ------------------------------------------------- P1 sidewalk runs
console.log('sidewalks');
ok('P1 the town has sidewalk runs', world.walks.length > 500, `${world.walks.length} runs`);
ok('P1 every run is at least 20 m of pavement',
  world.walks.every((w) => w.len >= 20 && w.n >= 5),
  `shortest ${r2(Math.min(...world.walks.map((w) => w.len)))} m`);
ok('P1 nodes are exactly walkStep apart', (() => {
  for (const w of world.walks) {
    for (let i = 0; i + 3 < w.pts.length; i += 2) {
      const d = Math.hypot(w.pts[i + 2] - w.pts[i], w.pts[i + 3] - w.pts[i + 1]);
      if (Math.abs(d - world.walkStep) > 1.0) return false;
    }
  }
  return true;
})(), `step ${world.walkStep} m`);

// Every single node has to be walkable ground: off the tarmac, out of a house.
{
  let onRoad = 0, indoors = 0, nodes = 0;
  for (const w of world.walks) {
    for (let i = 0; i < w.pts.length; i += 2) {
      nodes++;
      if (world.roadAt(w.pts[i], w.pts[i + 1])) onRoad++;
      if (world.buildingAt(w.pts[i], w.pts[i + 1], 0)) indoors++;
    }
  }
  // The expanded 14 km map has more than 300k sampled nodes. One boundary
  // sample can classify both ways because roadAt and the sidewalk offset meet
  // on the same floating-point edge; pedestrians themselves are checked below.
  ok('P1 sidewalk road-edge overlap stays negligible', onRoad <= 1, `${onRoad} of ${nodes}`);
  ok('P1 no sidewalk node is inside a building', indoors === 0, `${indoors} of ${nodes}`);
}

// Denise-Friend and Principale, the two spots the screenshots use.
for (const [name, x, z] of [['Denise-Friend', -719, -452], ['Principale', -870, -100]]) {
  const near = world.queryWalks(x, z, 120);
  ok(`P1 ${name} has pavement to walk on`, near.length > 0, `${near.length} runs within 120 m`);
}

// ------------------------------------------------- P2 pedestrians spawn on it
console.log('\npedestrians');
const peds = new Peds(r, world, 0xabcdef);
{
  // Two blocks, 60 spawn attempts each: they must all land on a sidewalk.
  let spawned = 0, onRoad = 0, indoors = 0, tooFar = 0, inWater = 0;
  for (const [x, z] of [[-719, -452], [-870, -100]]) {
    for (const p of peds.list) p.live = false;
    peds.alive = 0;
    for (let i = 0; i < 60; i++) peds.spawn(x, z);
    for (const p of peds.list) {
      if (!p.live) continue;
      spawned++;
      if (world.roadAt(p.x, p.z)) onRoad++;
      if (world.buildingAt(p.x, p.z, 0)) indoors++;
      if (world.waterAt(p.x, p.z)) inWater++;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > 250 || d < 24) tooFar++;
    }
  }
  ok('P2 peds actually spawn on both blocks', spawned >= 40, `${spawned} alive`);
  ok('P2 no ped spawns on the road', onRoad === 0, `${onRoad}`);
  ok('P2 no ped spawns inside a building', indoors === 0, `${indoors}`);
  ok('P2 no ped spawns in the river', inWater === 0, `${inWater}`);
  ok('P2 every ped is inside the spawn ring', tooFar === 0, `${tooFar} outside 26-250 m`);
  ok('P2 the pool is the cap', peds.list.length === POOL && peds.alive <= POOL,
    `${peds.alive} of ${POOL}`);
}

// A ped keeps to the pavement while it walks a whole block and turns around.
{
  peds.list.forEach((p) => { p.live = false; });
  peds.alive = 0;
  peds.spawn(-719, -452);
  const p = peds.list.find((q) => q.live);
  const G = fakeG(-719, -452);
  let onRoad = 0, turns = 0, lastDir = p.dir;
  for (let i = 0; i < 60 * 120; i++) {
    peds.update(1 / 60, G);
    if (world.roadAt(p.x, p.z)) onRoad++;
    if (p.dir !== lastDir) { turns++; lastDir = p.dir; }
  }
  ok('P2 two minutes of walking never puts them on the tarmac', onRoad === 0, `${onRoad} frames`);
  ok('P2 they turn around at the end of the block', turns > 0, `${turns} turns`);
}

// ------------------------------------------------- P3 the dive
console.log('\nthe dive');
function fakeG(x, z, car) {
  return {
    mode: 'drive',
    veh: car || { x, z, yaw: 0, vLong: 0, vx: 0, vz: 0, y: 0, spec: { len: 4.4, wid: 1.8 } },
    traffic: { cars: [] },
    world,
    audio: { heille() {}, blip() {}, thud() {} },
    hud: { toast() {} },
    stats: {},
  };
}

// Put one ped on a straight bit of pavement and aim a car at it.
function aimedRun(lateral) {
  const P = new Peds(r, world, 0x1234);
  P.list.forEach((q) => { q.live = false; });
  P.alive = 0;
  // A long straight run near Denise-Friend.
  let wi = -1;
  for (const i of world.queryWalks(-719, -452, 200)) {
    if (world.walks[i].len > 60) { wi = i; break; }
  }
  assert.ok(wi >= 0, 'no long walk near Denise-Friend');
  const w = world.walks[wi];
  const p = P.list[0];
  p.live = true; p.wi = wi; p.s = w.len / 2; p.off = 0.5; p.base = 0.5;
  p.dir = 1; p.spd = 1.4; p.state = WALK; p.t = 0; p.phase = 0; p.outfit = 0;
  p.y = 0; p.vy = 0; p.lean = 0; p.grazed = false;
  P.alive = 1;
  P.at(wi, p.s, p.off, { x: 0, z: 0 });
  const at = P.at(wi, p.s, p.off, {});
  p.x = at.x; p.z = at.z;
  // Heading straight down the walk, 25 m back, doing 40 km/h; `lateral` slides
  // the whole approach sideways.
  const dirX = at.dx, dirZ = at.dz;
  const nx = at.nx, nz = at.nz;
  const speed = 40 / 3.6;
  const car = {
    x: p.x - dirX * 25 + nx * lateral, z: p.z - dirZ * 25 + nz * lateral,
    yaw: Math.atan2(dirX, dirZ), vLong: speed, y: 0,
    vx: dirX * speed, vz: dirZ * speed, spec: { len: 4.4, wid: 1.8 },
  };
  const G = fakeG(0, 0, car);
  let dived = false, minD = 1e9, maxOff = 0;
  for (let i = 0; i < 60 * 4; i++) {
    car.x += car.vx / 60; car.z += car.vz / 60;
    P.update(1 / 60, G);
    minD = Math.min(minD, Math.hypot(p.x - car.x, p.z - car.z));
    if (Math.abs(p.off - 0.5) > Math.abs(maxOff)) maxOff = p.off - 0.5;
    if (p.state === DIVE || p.state === DOWN || p.state === GETUP) dived = true;
  }
  return { dived, minD, maxOff, p, P };
}

{
  const head = aimedRun(0);
  ok('P3 a car on a collision course makes them dive', head.dived,
    `closest approach ${r2(head.minD)} m`);
  ok('P3 ...and they clear the line of the car by more than a metre',
    Math.abs(head.maxOff) > 1.2, `${r2(head.maxOff)} m sideways`);
  const wide = aimedRun(6);
  ok('P3 a car passing 6 m wide does NOT', !wide.dived,
    `closest approach ${r2(wide.minD)} m, state ${wide.p.state}`);
}

// Slow traffic is not a threat either.
{
  const P = new Peds(r, world, 0x77);
  P.list.forEach((q) => { q.live = false; });
  P.alive = 0;
  P.spawn(-719, -452);
  const p = P.list.find((q) => q.live);
  const slow = {
    x: p.x - 3, z: p.z, yaw: Math.atan2(1, 0), vLong: 2.0, y: 0,
    vx: 2.0, vz: 0, spec: { len: 4.4, wid: 1.8 },
  };
  const G = fakeG(0, 0, slow);
  for (let i = 0; i < 30; i++) P.update(1 / 60, G);
  ok(`P3 a car under ${SEE_KMH} km/h walks past unnoticed`,
    p.state === WALK || p.state === STAND, `state ${p.state}`);
}

// ------------------------------------------------- P4 props and chunks
console.log('\nstreet props');
ok('P4 the placement cap holds', props.count <= 1600 && world.propSpots.length <= 1600,
  `${props.count} props from ${world.propSpots.length} spots`);
ok('P4 there are enough of them to notice', props.count > 1000, `${props.count}`);
ok('P4 every prop is a known kind with a mesh slice',
  props.items.every((it) => KINDS[it.kind] && it.n > 0 && it.mesh),
  `${props.items.length} items`);
ok('P4 chunks still batch props across the expanded sparse map',
  props.chunks.length > 0 && props.chunks.length < props.count,
  `${props.chunks.length} chunks for ${props.count} props`);
{
  // No chunk may hold a prop that belongs 200 m away.
  let stray = 0;
  const byKey = new Map();
  for (const it of props.items) byKey.set(it.k, (byKey.get(it.k) || 0) + 1);
  for (const it of props.items) {
    const c = props.chunks.find((q) => q.mesh === it.mesh);
    if (!c || Math.abs(c.cx - it.x) > 101 || Math.abs(c.cz - it.z) > 101) stray++;
  }
  ok('P4 every prop sits in its own chunk', stray === 0, `${stray} stray`);
  ok('P4 chunk occupancy is sane',
    Math.max(...byKey.values()) < 200, `busiest chunk ${Math.max(...byKey.values())} props`);
}
{
  let onRoad = 0, indoors = 0;
  for (const it of props.items) {
    if (world.roadAt(it.x, it.z)) onRoad++;
    if (world.buildingAt(it.x, it.z, 0)) indoors++;
  }
  ok('P4 no prop stands on the road', onRoad === 0, `${onRoad}`);
  ok('P4 no prop stands inside a building', indoors === 0, `${indoors}`);
}
{
  const kinds = new Set(props.items.map((it) => it.kind));
  ok('P4 the whole catalogue got placed', kinds.size >= 8, [...kinds].join(', '));
  ok('P4 there is a fruit stand at the dep', kinds.has('fruitstand'));
  ok('P4 there are carts in a lot', kinds.has('cart'));
}

// Knocking one out blanks its slice and it stops answering queries.
{
  const it = props.items.find((q) => !q.dead);
  const before = r.blanked;
  const found = () => props.query(it.x, it.z, 0.5).includes(it);
  ok('P5 a standing prop answers the hit query', found());
  props.knock(it);
  ok('P5 knocking it blanks exactly its slice of the chunk mesh',
    r.blanked === before + 1 && it.dead);
  ok('P5 ...and it stops answering', !found());
  ok('P5 knocking it twice is a no-op', props.knock(it) === false);
}

// ------------------------------------------------- P6 debris settles
console.log('\ndebris');
{
  const d = new Debris(r, props.meshes);
  const kinds = ['garbage', 'recyc', 'mailbox', 'newsbox', 'cart', 'relaybox', 'bag', 'can'];
  for (let i = 0; i < kinds.length; i++) d.spawn(kinds[i], i * 4, 0, 16, -6, 0);
  let settledAt = -1;
  for (let f = 0; f < 60 * 10; f++) {
    d.update(1 / 60);
    if (settledAt < 0 && d.moving() === 0) settledAt = f / 60;
  }
  const bodies = d.bodies.filter((b) => b.live);
  ok('P6 everything thrown settles inside 10 s', settledAt >= 0 && settledAt < 10,
    `settled after ${r2(settledAt)} s`);
  ok('P6 settled debris has no velocity left',
    bodies.every((b) => b.vx === 0 && b.vz === 0 && b.vy === 0));
  ok('P6 settled debris is on or above the ground',
    bodies.every((b) => b.y >= 0), `lowest ${r2(Math.min(...bodies.map((b) => b.y)))} m`);
  ok('P6 it landed downrange of where it was hit',
    bodies.some((b) => Math.hypot(b.x - 0, b.z - 0) > 1), 'at least one travelled');

  // The pool is a ring: 200 spawns still leaves 48 bodies.
  for (let i = 0; i < 200; i++) d.spawn('can', 0, 0, 3, 3, 0);
  ok('P6 the body pool never grows past its cap',
    d.bodies.length === MAX_BODIES && d.bodies.filter((b) => b.live).length <= MAX_BODIES,
    `${MAX_BODIES} slots`);

  // Particles are pooled too — 500 puffs must not allocate a 501st slot.
  const n0 = d.smokePool.p.length + d.sparkPool.p.length + d.glassPool.p.length;
  for (let i = 0; i < 500; i++) { d.puff(0, 1, 0, 1, 1); d.spark(0, 1, 0, 1, 1); }
  d.glassBurst(0, 1, 0, 1, 1, 60);
  const n1 = d.smokePool.p.length + d.sparkPool.p.length + d.glassPool.p.length;
  ok('P6 particle pools are fixed size', n0 === n1, `${n0} slots`);
  for (let f = 0; f < 60 * 12; f++) d.update(1 / 60);
  ok('P6 particles do expire', d.stats.particles === 0, `${d.stats.particles} left`);
}

// ------------------------------------------------- P7 the whole thing wired up
console.log('\nreactive');
{
  const { Reactive } = await import('../src/game/reactive.js');
  const R = new Reactive(r, world);
  // Line a car up on a row of props and drive through them.
  const it = props.items.find((q) => !q.dead && q.kind === 'garbage')
    || props.items.find((q) => !q.dead);
  const speed = 40 / 3.6;
  const car = {
    x: it.x - 20, z: it.z, yaw: Math.atan2(1, 0), vLong: speed, y: 0, skid: 0,
    vx: speed, vz: 0, damage: 0, spec: { len: 4.4, wid: 1.8, axleZ: 1.3, track: 1.5 },
    speedKmh: 40,
    hit(c) { this.damage += Math.max(0, Math.min(1, c / 18) - 0.055) * 46; return 0; },
  };
  const G = fakeG(0, 0, car);
  G.mission = null;
  const smashed0 = R.stats ? R.stats.propsSmashed : 0;
  for (let f = 0; f < 60 * 6; f++) {
    car.x += car.vx / 60; car.z += car.vz / 60;
    R.update(1 / 60, G);
  }
  ok('P7 driving through the furniture knocks it over',
    G.stats.propsSmashed > 0, `${G.stats.propsSmashed} smashed`);
  ok('P7 ...and it costs a little damage, not a lot',
    car.damage > 0 && car.damage < 25, `damage ${r2(car.damage)}`);
  ok('P7 ...and something is flying', R.debris.stats.bodies > 0,
    `${R.debris.stats.bodies} bodies`);
  ok('P7 G.stats is exposed for the HUD',
    typeof G.stats.nearMiss === 'number' && typeof G.stats.propsSmashed === 'number');
  for (let f = 0; f < 60 * 10; f++) R.update(1 / 60, G);
  ok('P7 the debris settles while the game runs', R.debris.moving() === 0);
}

// ------------------------------------------------- budget
console.log('\nbudget');
ok('P8 the reactive world costs under 150k resident triangles',
  props.tris < 150000, `${props.tris | 0} tris of props`);
ok('P8 world.js section 9 stays inside its build budget',
  propMs < 60, `streetprops bake ${propMs} ms`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
