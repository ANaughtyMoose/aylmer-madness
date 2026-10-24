#!/usr/bin/env node
// Every race and blitz start line, on the real map bake:
//
//   node tools/smoke_racestarts.mjs
//
// Review 5 Oct 2026 (pack 20261005-212013-quick): « Le Raccourci du Curé »
// started the truck inside a house on Principale and the blitz failed on time
// in all three runs. All eight Midtown courses had a start that was inside a
// building footprint. This suite holds every start, the eight courses in
// modes.js and the four story races in racejobs.js, to three promises:
//
//   1. the pose is on the road and the whole body clears tow.js placementReason;
//   2. the 15 m straight ahead of it is clear (body, walls, poles) on paper;
//   3. a real Ranger on the real physics, W held, covers those 15 m without
//      touching anything.
//
// It also checks that modes.js startPose() rescues the old, bad pose.

// ---------------------------------------------------------------- stubs
const ctx2d = {
  clearRect() {}, fillRect() {}, fillText() {}, drawImage() {}, beginPath() {},
  moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, closePath() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
  measureText() { return { width: 40 }; },
  getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
  putImageData() {},
};
globalThis.document = {
  createElement() { return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } }; },
  getElementById() { return null; },
};
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
class StubRenderer {
  upload(b) { if (b.finish) b.finish(); return { vao: null, count: b.i.length, min: b.min && b.min.slice(), max: b.max && b.max.slice() }; }
  texture() { return { stub: true }; }
  visible() { return true; }
  draw() {}
}

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const group = (n) => console.log('\n' + n);
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- the game
const { buildWorld } = await import('../src/game/world.js');
const MATS = (await import('../src/game/materials_stub.js')).default;
const { PLACES, resolvePlaces } = await import('../src/game/places.js');
const { carById, Vehicle } = await import('../src/game/cars.js');
const { placementReason } = await import('../src/game/tow.js');
const { Nav } = await import('../src/game/nav.js');
const { COURSES, startPose, startReason, blockedAhead, START_CLEAR } = await import('../src/game/modes.js');
const { RACE_MISSIONS } = await import('../src/game/racejobs.js');
const { installJumps } = await import('../src/game/jumps.js');

installJumps();
const world = buildWorld(new StubRenderer(), MATS);
resolvePlaces(world);
const nav = new Nav();
const phys = {
  roadAt: (x, z) => world.roadAt(x, z),
  querySegments: (x, z, r) => world.querySegments(x, z, r),
  waterAt: (x, z) => world.waterAt(x, z),
  queryPoles: (x, z, r) => world.queryPoles(x, z, r),
  snapPole: (p, ux, uz) => world.snapPole(p, ux, uz),
  groundAt: world.groundAt,
  bounds: world.bounds,
};
const spec = carById('ranger');
const at = (c) => (typeof c === 'string' ? PLACES[c] : c);

// Every start the game can put a car on: the eight courses (the truck is
// teleported there) and the story races (the rivals are gridded there).
const STARTS = [
  ...COURSES.map((c) => ({ id: c.id, start: at(c.start) })),
  // A story race keeps its cfg in a closure; its grid stage's `at` is cfg.start.
  ...RACE_MISSIONS.map((m) => ({
    id: m.id, start: at(m.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 0 })[0].at),
  })).filter((s) => s.start),
];
const poseOf = (s) => ({ x: s.x, z: s.z, yaw: s.a != null ? s.a : (s.yaw || 0) });

// A Ranger on the line, W held at 60 %, wheel straight. Returns how far it got
// before anything touched it (or the 15 m if nothing did).
function driveAhead(p) {
  const v = new Vehicle(spec);
  v.reset(p.x, p.z, p.yaw, world.groundAt(p.x, p.z).h);
  v.onRoad = world.roadAt(p.x, p.z);
  const ctl = { steer: 0, throttle: 0.6, brake: 0, handbrake: false };
  const dt = 1 / 60;
  let hit = 0, dmg0 = v.damage;
  for (let i = 0; i < 60 * 8; i++) {
    v.lastHit = 0;
    v.update(dt, ctl, phys);
    hit = Math.max(hit, v.lastHit || 0);
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (hit > 0.02 || v.damage > dmg0 + 0.01) return { d, hit, dmg: v.damage - dmg0 };
    if (d >= START_CLEAR) return { d, hit: 0, dmg: 0 };
  }
  return { d: Math.hypot(v.x - p.x, v.z - p.z), hit, dmg: v.damage - dmg0 };
}

group(`${STARTS.length} start lines`);
ok(STARTS.length >= COURSES.length + 4, 'every course and every story race has a start',
  STARTS.map((s) => s.id).join(' '));

group('1. on the road, the body clear (tow.js placementReason)');
for (const s of STARTS) {
  const p = poseOf(s.start);
  const why = placementReason(world, p, spec);
  ok(world.roadAt(p.x, p.z) && !why, `${s.id}: on the road, clear`,
    `${r1(p.x)}, ${r1(p.z)}${why ? ' ' + why : ''}${world.roadAt(p.x, p.z) ? '' : ' OFF ROAD'}`);
}

group(`2. ${START_CLEAR} m straight ahead is clear on paper`);
for (const s of STARTS) {
  const why = blockedAhead(world, poseOf(s.start), spec);
  ok(!why, `${s.id}: nothing in the way`, why || '');
}

group(`3. a Ranger with W held covers ${START_CLEAR} m and touches nothing`);
for (const s of STARTS) {
  const r = driveAhead(poseOf(s.start));
  ok(r.d >= START_CLEAR - 0.05 && r.hit <= 0.02 && r.dmg <= 0.01, `${s.id}: drove ${r1(r.d)} m`,
    r.hit > 0.02 ? `hit ${r1(r.hit)} damage +${r1(r.dmg)}` : '');
}

group('4. modes.js startPose rescues a bad line');
{
  // The pose « Le Raccourci du Curé » shipped with: inside the brick house.
  const bad = { x: -877, z: -102, a: Math.PI / 2 };
  ok(!!startReason(world, poseOf(bad), spec), 'the old Curé start really is bad', startReason(world, poseOf(bad), spec) || '');
  const rb = driveAhead(poseOf(bad));
  ok(rb.d < START_CLEAR - 0.05 || rb.hit > 0.02, '...and the drive check catches it', `${r1(rb.d)} m, hit ${r1(rb.hit)}`);
  const first = COURSES.find((c) => c.id === 'bz_vieux').cps[0];
  const route = nav.route(bad.x, bad.z, first.x, first.z);
  const q = startPose(world, bad, spec, route);
  ok(!startReason(world, q, spec), 'startPose finds a good one', `${r1(q.x)}, ${r1(q.z)} moved ${r1(q.moved)} m`);
  ok(q.moved < 40, '...nearby');
  const r = driveAhead(q);
  ok(r.d >= START_CLEAR - 0.05 && r.hit <= 0.02, '...and it drives clear', `${r1(r.d)} m`);
  const good = COURSES[0].start;
  const same = startPose(world, good, spec, null);
  ok(same.moved === 0, 'a good line is left exactly where it is');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
