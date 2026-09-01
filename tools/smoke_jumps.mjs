#!/usr/bin/env node
// Headless checks on the jump set:
//
//   node tools/smoke_jumps.mjs
//
// Every ramp in game/jumps.js is bot-driven. The world is the REAL bake —
// buildWorld() with a stubbed renderer, the trick smoke_world.mjs uses — so the
// ground the truck leaves is the ground the game ships, and the airtime printed
// below is a measurement and not an estimate.
//
// Three things are checked per jump, and all three have failed at some point in
// this file's history, which is why they are all here:
//
//   1. the AIR. The truck is put on the jump's own axis at the speed the jump
//      says it wants, and the flight has to start ON the ramp (within 16 m of
//      the lip) — a kerb hop forty metres short that sails over the top used to
//      read as a 0.83 s "jump" on every single one of them.
//   2. the LINE. Nothing solid within 4 m of the axis from 115 m before the lip
//      to 140 m after it. A ramp with a hydro pole on the landing is a trap.
//   3. the LANDING. Straight down costs almost nothing; sideways costs.
import { strict as assert } from 'node:assert';

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
  constructor() { this.uploads = 0; this.draws = 0; this.time = 0; }
  upload(b) { this.uploads++; if (b.finish) b.finish(); return { vao: null, count: b.i.length, min: b.min && b.min.slice(), max: b.max && b.max.slice() }; }
  texture() { return { stub: true }; }
  visible() { return true; }
  draw() { this.draws++; }
}

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const group = (n) => console.log('\n' + n);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- the game
const {
  JUMPS, JUMP_FEATURES, installJumps, jumpSlope, jumpAir, jumpName,
  predictAir, AirScorer, AIR, scoreText, nearestJump,
} = await import('../src/game/jumps.js');
const { FEATURES, buildTerrain, SURF } = await import('../src/game/terrain.js');
const { loadRacingText, TEXT } = await import('../src/game/racingtext.js');

const before = FEATURES.length;
const after = installJumps();
const again = installJumps();

const { buildWorld } = await import('../src/game/world.js');
const MATS = (await import('../src/game/materials_stub.js')).default;
const { carById, Vehicle, DAMAGE } = await import('../src/game/cars.js');
const world = buildWorld(new StubRenderer(), MATS);
const phys = {
  roadAt: (x, z) => world.roadAt(x, z),
  querySegments: (x, z, r) => world.querySegments(x, z, r),
  waterAt: (x, z) => world.waterAt(x, z),
  queryPoles: (x, z, r) => world.queryPoles(x, z, r),
  snapPole: (p, ux, uz) => world.snapPole(p, ux, uz),
  groundAt: world.groundAt,
  bounds: world.bounds,
};
await loadRacingText();

// ================================================================ 1. the table

group('the ramps are in the height field');
{
  ok(after > before, `installJumps added ${after - before} features to terrain.js`,
    `${before} -> ${after}`);
  ok(again === after, 'and it is idempotent — a second call adds nothing');
  ok(JUMPS.length >= 10, `${JUMPS.length} named jumps`);
  ok(new Set(JUMPS.map((j) => j.id)).size === JUMPS.length, 'every jump id is unique');
  ok(new Set(JUMP_FEATURES.map((f) => f.id)).size === JUMP_FEATURES.length,
    'every feature id is unique');
  ok(!JUMP_FEATURES.some((f) => FEATURES.filter((g) => g.id === f.id).length > 1),
    'and none of them collides with terrain.js’s own twenty');
  ok(JUMP_FEATURES.every((f) => SURF[f.kind] && SURF[f.side || f.kind]),
    'every surface named is a surface that exists',
    [...new Set(JUMP_FEATURES.map((f) => f.kind))].join(', '));
  ok(JUMPS.every((j) => j.kmh >= 60 && j.kmh <= 130), 'every jump asks for a plausible speed');
  ok(JUMPS.every((j) => j.name && j.where), 'every jump has a name and a place');
}

group('the ballistics agree with the arithmetic');
{
  // vy = slope * v, and airtime is the positive root. If these two ever stop
  // agreeing, cars.js has changed how a ramp works and every number below is a
  // lie — which is the whole reason this check is here.
  ok(r2(predictAir(0.4, 25, 0)) === r2(2 * 0.4 * 25 / 9.81),
    'a flat-to-flat launch is 2*vy/g', `${r2(predictAir(0.4, 25, 0))} s`);
  ok(predictAir(0.4, 25, 3) > predictAir(0.4, 25, 0), 'and dropping further takes longer');
  ok(JUMPS.every((j) => jumpSlope(j) > 0.25 && jumpSlope(j) < 0.55),
    'every slope is between 1-in-4 and 1-in-2',
    JUMPS.map((j) => r2(jumpSlope(j))).join(' '));
}

// ================================================================ 2. the line

// Nothing solid near the axis, from well before the lip to well after it.
function axisClear(j, w0 = -115, w1 = 140) {
  const S = Math.sin(j.yaw), C = Math.cos(j.yaw);
  let worst = 99, at = 0;
  for (let w = w0; w <= w1; w += 2) {
    const x = j.x + S * w, z = j.z + C * w;
    let d = 99;
    for (const s of (world.querySegments(x, z, 8) || [])) {
      const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / l2));
      d = Math.min(d, Math.hypot(s.ax + ex * t - x, s.az + ez * t - z));
    }
    for (const q of (world.queryPoles(x, z, 8) || [])) {
      d = Math.min(d, Math.hypot((q.x != null ? q.x : q[0]) - x, (q.z != null ? q.z : q[1]) - z));
    }
    if (d < worst) { worst = d; at = w; }
  }
  return { worst, at };
}

group('every approach and every landing is clear');
for (const j of JUMPS) {
  const c = axisClear(j);
  ok(c.worst >= 4, `${j.id}: nothing solid on the line`,
    `closest ${r1(c.worst)} m at w=${c.at}`);
}

group('no jump throws you into the Outaouais');
for (const j of JUMPS) {
  const S = Math.sin(j.yaw), C = Math.cos(j.yaw);
  const reach = jumpAir(j) * (j.kmh / 3.6) + 20;
  let wet = 0;
  for (let w = -60; w <= reach; w += 4) if (world.waterAt(j.x + S * w, j.z + C * w)) wet++;
  ok(wet === 0, `${j.id}: dry from the run-up to the run-out`, `${Math.round(reach)} m`);
}

// ================================================================ 3. the air

/**
 * Fly one jump. The truck starts on the axis `D` metres back at `kmh`, holds the
 * line, and the flight that counts is the one that STARTS on the ramp.
 */
function fly(j, kmh = j.kmh, opts = {}) {
  const S = Math.sin(j.yaw), C = Math.cos(j.yaw);
  const v = new Vehicle(carById(opts.carId || 'ranger'));
  v.assist = true;
  const D = opts.D || 55;
  v.reset(j.x - S * D, j.z - C * D, j.yaw);
  // reset() leaves onRoad stale; a stale flip fires the kerb kick on the first
  // tick and steals twenty km/h off the run-up.
  v.onRoad = phys.roadAt(v.x, v.z);
  v.vLong = kmh / 3.6;
  v.vx = S * v.vLong; v.vz = C * v.vLong;
  const sc = new AirScorer();
  const ctl = { steer: 0, throttle: 1, brake: 0, handbrake: false };
  let hit = null, dmgAt = 0;
  const STEP = 1 / 60;
  for (let i = 0; i < 60 * 25; i++) {
    const t = (v.x - j.x) * S + (v.z - j.z) * C;
    const wx = j.x + S * (t + 20), wz = j.z + C * (t + 20);
    const e = Math.atan2(Math.sin(Math.atan2(wx - v.x, wz - v.z) - v.yaw),
      Math.cos(Math.atan2(wx - v.x, wz - v.z) - v.yaw));
    ctl.steer = sc.flying ? (opts.steer || 0) : Math.max(-1, Math.min(1, -e * 1.9 + v.yawRate * 0.26));
    ctl.throttle = v.speedKmh < kmh ? 1 : 0.35;
    const dmg0 = v.damage;
    v.update(STEP, ctl, phys);
    const rec = sc.update(STEP, v, { steer: opts.airSteer || 0, siteId: opts.repeat ? j.id : null });
    if (rec) {
      const w0 = (sc.x0 - j.x) * S + (sc.z0 - j.z) * C;
      const off = Math.abs((sc.x0 - j.x) * C - (sc.z0 - j.z) * S);
      if (Math.abs(w0) < 16 && off < 10 && (!hit || rec.air > hit.air)) {
        hit = { ...rec, w0, off, dmgAfter: v.damage, dmgBefore: dmgAt };
      }
    }
    if (!sc.flying) dmgAt = v.damage;
    if (t > 200) break;
  }
  return hit;
}

group('every ramp is bot-driven, and every one of them flies');
const flown = new Map();
for (const j of JUMPS) {
  const f = fly(j);
  flown.set(j.id, f);
  if (!f) { ok(false, `${j.id}: NO AIR off the ramp itself`); continue; }
  ok(f.air >= 1.4,
    `${jumpName(j)} (${j.id}): ${r2(f.air)} s`,
    `${Math.round(f.dist)} m · ${Math.round(f.entryKmh)} km/h in · ${r1(f.peak)} m up · ${f.grade} · +${f.pay} $`);
}

group('and the whole set is worth driving to');
{
  const all = JUMPS.map((j) => flown.get(j.id)).filter(Boolean);
  const best = all.reduce((a, b) => (b.air > a.air ? b : a));
  const worst = all.reduce((a, b) => (b.air < a.air ? b : a));
  ok(all.length === JUMPS.length, 'all of them flew');
  ok(best.air >= 2.2, 'the biggest one is over two seconds of air', `${r2(best.air)} s`);
  ok(worst.air >= 1.4, 'and even the smallest is over one and a half', `${r2(worst.air)} s`);
  ok(all.filter((f) => f.air >= 1.8).length >= 5,
    'at least five of them are 1.8 s or better',
    all.filter((f) => f.air >= 1.8).length + ' of ' + all.length);
  ok(all.every((f) => f.dist >= 25), 'and none of them is a hop', `shortest ${Math.round(worst.dist)} m`);
}

group('a straight landing costs the truck almost nothing');
{
  // The biggest jump in the game, landed square, on a truck that starts clean.
  const j = JUMPS.find((x) => x.id === 'hull') || JUMPS[0];
  const f = fly(j);
  ok(f && f.grade !== 'crooked', 'the bot lands it clean', f ? f.grade : 'no flight');
  ok(f && f.dmgAfter < DAMAGE.COSMETIC,
    'and walks away under the cosmetic threshold',
    f ? `${r1(f.dmgAfter)} / ${DAMAGE.COSMETIC}` : '');
}

group('a sideways landing does not');
{
  // Same jump, same speed, but the stick is held over in the air — which is what
  // the yaw authority is FOR, and what it costs you when you get it wrong.
  const j = JUMPS.find((x) => x.id === 'hull') || JUMPS[0];
  const straight = fly(j);
  const sideways = fly(j, j.kmh, { airSteer: 1 });
  ok(!!sideways, 'it still flies with the wheel over');
  if (straight && sideways) {
    ok(sideways.slip > straight.slip, 'it lands more sideways',
      `${r2(sideways.slip)} rad vs ${r2(straight.slip)}`);
    ok(sideways.grade === 'crooked', 'and it is graded croche', sideways.grade);
    ok(sideways.dmgAfter > straight.dmgAfter, 'and it costs more',
      `${r1(sideways.dmgAfter)} vs ${r1(straight.dmgAfter)} damage`);
    ok(sideways.pay < straight.pay, 'and it pays less',
      `${sideways.pay} $ vs ${straight.pay} $`);
  }
}

group('the same ramp, over and over, pays less');
{
  const j = JUMPS.find((x) => x.id === 'chantier');
  const pays = [];
  const sc = new AirScorer();
  // Score four identical flights through the scorer directly: the decay is the
  // scorer's, not the ramp's.
  const fake = () => ({
    x: 0, z: 0, y: 0, gh: 0, yaw: 0, vx: 0, vz: 20, vLong: 20, roll: 0, pitch: 0,
    airT: 0, lastAir: 0, landed: 0, inAir: false, damage: 0, speedKmh: 72, hit() {},
  });
  for (let n = 0; n < 4; n++) {
    const v = fake();
    v.airT = 0.5; sc.update(1 / 60, v, { siteId: j.id });   // take off
    v.airT = 0; v.lastAir = 2.0; v.landed = 8;
    const rec = sc.update(1 / 60, v, { siteId: j.id });
    pays.push(rec ? rec.pay : 0);
    sc.combo = 0; sc.comboT = 0;                            // isolate the decay
  }
  ok(pays[0] > pays[1] && pays[1] > pays[2], 'the payout falls off', pays.join(' -> '));
  ok(pays[3] > 0, 'but never to zero', String(pays[3]));
}

group('chaining pays more');
{
  const sc = new AirScorer();
  const fake = () => ({
    x: 0, z: 0, y: 0, gh: 0, yaw: 0, vx: 0, vz: 20, vLong: 20, roll: 0, pitch: 0,
    airT: 0, lastAir: 0, landed: 0, inAir: false, damage: 0, speedKmh: 72, hit() {},
  });
  const pays = [];
  for (let n = 0; n < 3; n++) {
    const v = fake();
    v.airT = 0.5; sc.update(1 / 60, v, {});
    v.airT = 0; v.lastAir = 1.5; v.landed = 6;
    pays.push(sc.update(1 / 60, v, {}).pay);
  }
  ok(pays[1] > pays[0] && pays[2] > pays[1], 'each link is worth more', pays.join(' -> '));
  ok(sc.combo === 3, 'and the chain counts', String(sc.combo));
  // ...and it lapses.
  const v = { ...fake() };
  for (let i = 0; i < 60 * (AIR.comboWindow + 1); i++) sc.update(1 / 60, v, {});
  ok(sc.combo === 0, 'a chain lapses after the window', `${AIR.comboWindow} s`);
}

group('the board says what happened');
{
  const rec = { air: 2.4, dist: 61, peak: 7, entryKmh: 100, grade: 'perfect', slip: 0.05,
    drop: 12, near: 2, combo: 2, mult: 1.5, pay: 44, big: true };
  const t = scoreText(rec);
  ok(t.includes('2.4 s dans les airs') && t.includes('61 m'), 'airtime and distance', t.split('\n')[1]);
  ok(t.includes('2 frôlements'), 'near misses');
  ok(t.includes('CHAÎNE ×2'), 'the chain');
  ok(t.includes('+44 $'), 'and the money');
  ok(!/\b(steph|marc|dave)\b/i.test(JSON.stringify(JUMPS)), 'no internal ids in the jump table');
}

group('a jump you are driving at is a jump you are told about');
{
  const j = JUMPS[0];
  const S = Math.sin(j.yaw), C = Math.cos(j.yaw);
  const n = nearestJump(j.x - S * 60, j.z - C * 60);
  ok(n && n.jump.id === j.id, 'nearestJump finds the one in front of you', n ? n.jump.id : '?');
  ok(n.d > 55 && n.d < 65, 'at about the right distance', `${r1(n.d)} m`);
}

// ================================================================ 4. the copy

group('the written names are wired through');
{
  ok(TEXT.loaded, 'assets/text loaded', `${TEXT.jumps.length} written jumps, ${TEXT.callouts.length} callouts`);
  const named = JUMPS.filter((j) => j.text != null);
  ok(named.length >= 4, `${named.length} jumps carry a name from racing.json`);
  for (const j of named) {
    const want = TEXT.jumps[j.text] && TEXT.jumps[j.text].name;
    if (jumpName(j) !== want) { ok(false, `${j.id}: name is not the written one`, `${jumpName(j)} != ${want}`); }
  }
  ok(named.every((j) => jumpName(j) === TEXT.jumps[j.text].name),
    'and every one of them shows the written name',
    named.map((j) => jumpName(j)).join(' · '));
  ok(TEXT.callouts.length > 20, 'the callout pool is the written one, not the fallback',
    `${TEXT.callouts.length} lines`);
  ok(TEXT.callouts.every((c) => c.en), 'every callout keeps its English gloss');
}

// ================================================================ done
console.log('\nmeasured airtimes');
for (const j of JUMPS) {
  const f = flown.get(j.id);
  console.log(`  ${(jumpName(j) + '                          ').slice(0, 30)}` +
    `${(j.where + '                                  ').slice(0, 36)}` +
    (f ? `${r2(f.air)} s   ${Math.round(f.dist)} m   ${Math.round(f.entryKmh)} km/h in   ${f.grade}` : 'NO AIR'));
}
console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
