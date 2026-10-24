// Presentation policy and the real jump hook, with tiny CPU-only fixtures.
// No world build, renderer or browser is started by this check.
import assert from 'node:assert/strict';
import {
  QUIET_GOLF_NOTIFICATIONS, missionNotificationAllowed, landingRepairHintMuted,
} from '../src/game/mission-notifications.js';
import { golfnuit, SAYYAD } from '../src/game/setpieces/golfnuit.js';
import { JUMPS, resetJumps, updateJumps } from '../src/game/jumps.js';
import { repairHint } from '../src/game/damage.js';

let passed = 0;
function test(name, run) { run(); passed++; console.log(`  ok ${name}`); }
function domFixture() {
  let board = null, created = 0;
  const host = { appendChild(el) { board = el; } };
  globalThis.document = {
    body: host,
    getElementById(id) { return id === 'airboard' ? board : id === 'hud' ? host : null; },
    createElement() { created++; return { style: {}, textContent: '' }; },
  };
  return { get board() { return board; }, get created() { return created; } };
}
function game(mission = null, crooked = false) {
  let cash = 0;
  const toasts = [], blips = [], hits = [];
  const veh = {
    x: 5000, z: 0, y: 0, gh: 0, yaw: crooked ? Math.PI / 2 : 0,
    vx: 0, vz: 22, vLong: 22, speedKmh: 79.2, roll: 0, pitch: 0,
    airT: 0, lastAir: 0, landed: 0, inAir: false, damage: 30,
    hit(force) { hits.push(force); this.damage += force; },
  };
  return {
    mission, veh, time: 0, day: 3, stats: { nearMiss: 0 }, input: { steer: 0 },
    wallet: { add(value) { cash += value; }, get value() { return cash; } },
    hud: { toast(...args) { toasts.push(args); } },
    audio: { blip(...args) { blips.push(args); } },
    toasts, blips, hits,
  };
}
function flight(G, seconds = 2) {
  const v = G.veh, dt = 0.1;
  for (let t = 0; t < seconds; t += dt) {
    v.airT = t + dt; v.inAir = true; v.y = 2;
    v.x += v.vx * dt; v.z += v.vz * dt;
    updateJumps(G, dt); G.time += dt;
  }
  v.airT = 0; v.inAir = false; v.y = 0; v.lastAir = seconds; v.landed = 12;
  updateJumps(G, dt); G.time += dt; v.landed = 0;
}
function result(G) {
  return {
    pay: G.wallet.value, last: G.air.last, total: G.air.total, best: G.air.best,
    combo: G.air.combo, repeats: [...G.air.repeat], hits: G.hits,
    damage: G.veh.damage, vx: G.veh.vx, vz: G.veh.vz, vLong: G.veh.vLong,
  };
}

test('golf declares only stunt and jump-damage notification suppression', () => {
  assert.equal(golfnuit.notificationPolicy, QUIET_GOLF_NOTIFICATIONS);
  const G = { mission: { def: golfnuit } };
  assert.equal(missionNotificationAllowed(G, 'stunt'), false);
  assert.equal(missionNotificationAllowed(G, 'jumpDamage'), false);
  for (const kind of ['dialogue', 'crash', 'repair', 'mission', 'unknown']) {
    assert.equal(missionNotificationAllowed(G, kind), true);
  }
});

test('finish, failure, abandonment and retry cannot retain a policy flag', () => {
  const G = { mission: { def: golfnuit } };
  for (const reason of ['finish', 'fail', 'quit']) {
    G.mission = null;
    assert.equal(missionNotificationAllowed(G, 'stunt'), true, reason);
    G.mission = { def: { id: 'another-fixture' } };
    assert.equal(missionNotificationAllowed(G, 'stunt'), true);
    G.mission = { def: golfnuit };
    assert.equal(missionNotificationAllowed(G, 'stunt'), false, 'new golf retry');
  }
  assert.equal(missionNotificationAllowed(null, 'stunt'), true);
});

test('muted landing hints wait for the refund without consuming repair flags', () => {
  const G = { mission: { def: golfnuit }, veh: { landed: 10, damage: 70 } };
  const state = { h25: false, h60: false };
  assert.equal(landingRepairHintMuted(G), true);
  // This is the main.js integration contract, not evidence it is wired there.
  if (!landingRepairHintMuted(G)) repairHint(state, G.veh.damage);
  assert.deepEqual(state, { h25: false, h60: false });
  G.veh.landed = 0; G.veh.damage = 0;
  assert.equal(landingRepairHintMuted(G), false);
  assert.equal(repairHint(state, G.veh.damage).toast, null);
  G.veh.damage = 70;
  assert.ok(repairHint(state, G.veh.damage).toast, 'a real later impact still warns');
  G.mission = null; G.veh.landed = 10;
  assert.equal(landingRepairHintMuted(G), false, 'ordinary landing damage still warns');
});

test('actual mission dialogue is still delivered through its own channel', () => {
  const lines = [], G = { mission: { def: golfnuit },
    heckle: { line(...args) { lines.push(args); }, cancel() {} } };
  const stages = golfnuit.build({ carId: 'ranger' });
  stages.find((s) => s.kind === 'velo').onEnter(G);
  const sayyad = stages.find((s) => s.kind === 'sayyad'), m = {};
  sayyad.onEnter(G, m); sayyad.onExit(G, m);
  assert.deepEqual(lines.map((line) => line[1]), [SAYYAD.bikes, SAYYAD.drive, SAYYAD.hold, SAYYAD.handover]);
  assert.ok(lines.every((line) => line[3].group === 'golfnuit'));
});

for (const crooked of [false, true]) test(`${crooked ? 'crooked' : 'clean'} golf landing keeps scoring, records, money and physics`, () => {
  domFixture(); resetJumps();
  const normal = game(null, crooked); flight(normal);
  assert.ok(normal.blips.length > 0, 'ordinary stunt still produces feedback');
  assert.ok(normal.wallet.value > 0, 'fixture earns a real payout');
  const expected = result(normal);
  const dom = domFixture(); resetJumps();
  const quiet = game({ def: golfnuit }, crooked); flight(quiet);
  assert.deepEqual(result(quiet), expected);
  assert.equal(quiet.toasts.length, 0); assert.equal(quiet.blips.length, 0);
  assert.equal(dom.created, 0, 'quiet flight never creates the air board');
  assert.equal(quiet.air.last.grade === 'crooked', crooked);
});

test('starting golf hides a visible board and ending it restores the next board', () => {
  const dom = domFixture(); resetJumps();
  const G = game(); flight(G);
  assert.equal(dom.board.style.opacity, '1');
  G.mission = { def: golfnuit }; updateJumps(G, 0.1);
  assert.equal(dom.board.style.opacity, '0');
  G.mission = null; flight(G);
  assert.equal(dom.board.style.opacity, '1');
});

test('muted ramp approach does not consume its normal discovery cooldown', () => {
  domFixture(); resetJumps();
  const G = game({ def: golfnuit }), j = JUMPS[0];
  G.veh.x = j.x - Math.sin(j.yaw) * 30; G.veh.z = j.z - Math.cos(j.yaw) * 30;
  G.veh.yaw = j.yaw;
  updateJumps(G, 0.1); assert.equal(G.toasts.length, 0);
  G.mission = null; G.time += 1;
  updateJumps(G, 0.1); assert.equal(G.toasts.length, 1);
  G.time += 1; updateJumps(G, 0.1); assert.equal(G.toasts.length, 1);
});

delete globalThis.document;
resetJumps();
console.log(`\nmission notification smoke: ${passed}/${passed} checks passed (main wiring pending)`);
