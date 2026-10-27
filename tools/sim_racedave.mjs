// [w6-races step 3] racedave balance, in node, on the real road bake with traffic.
//
//   node tools/sim_racedave.mjs          (heavy: loads the world; run it on the VM
//                                         through colab-test/ct.py, never on the Mac)
//
// Not part of npm test (no smoke_ prefix). It races Adam's Sunfire (the race.js
// Rival exactly as racejobs.js builds it, normal difficulty, same rubber band)
// against a stand-in for the player in the Ranger, over the real marina to
// Galeries route, with medium traffic (26 cars), five traffic seeds.
//
// The player stand-in is the timers.mjs pace car (SKILL.pace, "a decent human
// on a keyboard and not a great one") capped at 100 km/h, the cap the review bot
// races at (S3-BOT fix 5), with the same traffic rules the rivals now use. The
// two cars still collide. Two runs per seed:
//   clean   no mistakes
//   sloppy  two mistakes: at 35 % and 70 % of the route the truck loses all its
//           speed (a kerb, a spin, a tap on a car) and has to pull away again.
// Prints, per Dave tuning tried: finish times and margins (+ is the player ahead).

const ctx2d = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 40 })
  : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) : () => {}) });
globalThis.document = globalThis.document || {
  createElement() { return { width: 0, height: 0, style: {}, getContext() { return ctx2d; } }; },
  getElementById() { return null; },
};
const mem = new Map();
globalThis.localStorage = globalThis.localStorage || {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
};
class StubRenderer {
  upload(b) { if (b.finish) b.finish(); return { vao: null, count: b.i.length, min: b.min && b.min.slice(), max: b.max && b.max.slice() }; }
  texture() { return { stub: true }; } visible() { return true; } draw() {}
}

const { buildWorld } = await import('../src/game/world.js');
const MATS = (await import('../src/game/materials_stub.js')).default;
const { Nav } = await import('../src/game/nav.js');
const { PLACES, resolvePlaces } = await import('../src/game/places.js');
const { carById } = await import('../src/game/cars.js');
const { Traffic } = await import('../src/game/traffic.js');
const { Rival, SKILL, collideRivals, BAND_AHEAD, BAND_BEHIND } = await import('../src/game/race.js');
const { rivalSkill, FINISH_R } = await import('../src/game/racejobs.js');
const { installJumps } = await import('../src/game/jumps.js');
installJumps();

const world = buildWorld(new StubRenderer(), MATS);
resolvePlaces(world);
const nav = new Nav();
const phys = {
  roadAt: (x, z) => world.roadAt(x, z), querySegments: (x, z, r) => world.querySegments(x, z, r),
  waterAt: (x, z) => world.waterAt(x, z), queryPoles: (x, z, r) => world.queryPoles(x, z, r),
  snapPole: (p, ux, uz) => world.snapPole(p, ux, uz), groundAt: world.groundAt, bounds: world.bounds,
};

const start = PLACES.marina, goal = PLACES.mall;
const leg = nav.route(start.x, start.z, goal.x, goal.z);
const path = [[start.x, start.z], ...leg.slice(1)];
let routeM = 0;
for (let k = 1; k < path.length; k++) routeM += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
// racejobs.js gridSpot(): the player on the line, Dave one lane over, one row back.
function gridSpot(i) {
  const a = start.a || 0, fx = Math.sin(a), fz = Math.cos(a), rx = -fz, rz = fx;
  const side = i === 0 ? 0 : (i % 2 ? 1 : -1), row = Math.floor(i / 2);
  return { x: start.x + rx * side * 3.2 - fx * row * 5.8, z: start.z + rz * side * 3.2 - fz * row * 5.8, yaw: a };
}

const PLAYER = { ...SKILL.pace, cruise: 100 / 3.6, band: { ahead: 1, behind: 1 } };
const STEP = 1 / 60, MAX_T = 400;

function race(daveSkill, seed, mistakes, trafficN = 26) {
  const me = new Rival(carById('ranger'), { skill: PLAYER, phys });
  const dave = new Rival(carById('sunfire'), { skill: rivalSkill({ difficulty: 'normal' }, daveSkill), phys });
  for (const [rv, i] of [[me, 0], [dave, 1]]) {
    const s = gridSpot(i);
    rv.place(s.x, s.z, s.yaw);
    rv.setPath(path);
    rv.active = true;
  }
  const traffic = trafficN ? new Traffic(trafficN, seed) : null;
  if (traffic) traffic.signals = null;
  const cars = traffic ? traffic.cars : [];
  // Dave is NOT in the player's follow list: the bot only stops nose to tail
  // behind a rival and otherwise races him (S3-BOT fix 7); collisions still count.
  const meCtx = { traffic: cars, band: 1, grip: 1 };
  const dCtx = { traffic: cars, band: 1, grip: 1 };
  const total = me.pathLength;
  const marks = mistakes ? [0.35, 0.7] : [];
  let t = 0, tMe = null, tDave = null, hit = 0;
  for (let i = 0; i < MAX_T / STEP && (tMe == null || tDave == null); i++) {
    t += STEP;
    if (traffic) traffic.update(STEP, me.veh);
    if (marks.length && me.along() > marks[0] * total) {
      marks.shift();
      me.veh.vLong = 0; me.veh.vx = 0; me.veh.vz = 0;
    }
    // racejobs.js tick: the band from progress along the race.
    const lead = dave.along() - me.along();
    dave.band = lead > BAND_AHEAD ? daveSkill.band.ahead : lead < -BAND_BEHIND ? daveSkill.band.behind : 1;
    dCtx.band = dave.band;
    if (tMe == null) me.update(STEP, phys, meCtx);
    if (tDave == null) dave.update(STEP, phys, dCtx);
    if (collideRivals(me.veh, dave.veh) > 0.9) hit++;
    if (traffic) { traffic.collideBody(me.veh); traffic.collideBody(dave.veh); }
    if (tMe == null && Math.hypot(me.x - goal.x, me.z - goal.z) < FINISH_R) tMe = t;
    if (tDave == null && Math.hypot(dave.x - goal.x, dave.z - goal.z) < FINISH_R) tDave = t;
  }
  return { tMe, tDave, margin: (tDave ?? MAX_T) - (tMe ?? MAX_T), resetsMe: me.resets, resetsD: dave.resets, passes: me.passes, dPasses: dave.passes, hit };
}

const SEEDS = [7, 11, 23, 42, 99, 3, 5, 17, 31, 64];
const f1 = (v) => (v == null ? 'DNF' : v.toFixed(1));
console.log(`racedave sim: route ${Math.round(routeM)} m marina to Galeries, medium traffic (26), seeds ${SEEDS.join(' ')}`);
console.log(`smoke_race's "driven properly" teleport at 75 km/h needs ${(routeM / 21).toFixed(1)} s: Dave with no traffic must be slower than that.`);

const variants = (process.env.DAVE_TRY ? JSON.parse(process.env.DAVE_TRY) : null) || [
  { name: 'old dave', ...SKILL.dave },
  { name: 'daveSprint (shipped)', ...SKILL.daveSprint },
];
for (const v of variants) {
  const sk = { ...v }; delete sk.name;
  const solo = race(sk, 1, false, 0);
  const rows = [];
  for (const seed of SEEDS) {
    const c = race(sk, seed, false), s = race(sk, seed, true);
    rows.push({ seed, c, s });
  }
  const cw = rows.filter((r) => r.c.margin > 0).length, sw = rows.filter((r) => r.s.margin > 0).length;
  const avg = (k) => rows.reduce((a, r) => a + r[k].margin, 0) / rows.length;
  console.log(`\n${v.name}: cruise ${sk.cruise} cornerK ${sk.cornerK}  | no traffic: player ${f1(solo.tMe)} s, Dave ${f1(solo.tDave)} s`);
  for (const r of rows) {
    console.log(`  seed ${String(r.seed).padStart(2)}  clean: you ${f1(r.c.tMe)} Dave ${f1(r.c.tDave)} margin ${r.c.margin.toFixed(1)} (passes ${r.c.passes}, Dave passes ${r.c.dPasses}, resets ${r.c.resetsMe}/${r.c.resetsD})` +
      `   sloppy: you ${f1(r.s.tMe)} Dave ${f1(r.s.tDave)} margin ${r.s.margin.toFixed(1)}`);
  }
  const med = (k) => { const m = rows.map((r) => r[k].margin).sort((x, y) => x - y); return (m[4] + m[5]) / 2; };
  console.log(`  => median margin clean ${med('c').toFixed(1)} s, sloppy ${med('s').toFixed(1)} s`);
  console.log(`  => clean wins ${cw}/${rows.length} (avg margin ${avg('c').toFixed(1)} s), sloppy wins ${sw}/${rows.length} (avg ${avg('s').toFixed(1)} s)`);
}
