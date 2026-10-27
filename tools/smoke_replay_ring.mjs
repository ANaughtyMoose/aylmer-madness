// [w6-crashnight] C-12 core: ring buffer of car states for the crash replay.
import { ReplayRing, RING } from '../src/game/replay-ring.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };

const r = new ReplayRing();
ok(r.cap === Math.ceil(RING.ringSec * RING.hz), 'capacity');
const cars = [{ id: 0, x: 0, y: 0, z: 0, yaw: 0, speed: 0 }, { id: 5, x: 10, y: 0, z: 0, yaw: 3.1, speed: 0 }];
const dt = 1 / 120;
let stored = 0;
for (let t = 0; t <= 4; t += dt) {
  cars[0].x = 20 * t; cars[0].yaw = 0.5 * t;
  cars[1].yaw = 3.1 + 0.2 * t; // crosses +pi: yaw wrap must interpolate the short way
  if (r.record(t, cars)) stored++;
}
ok(Math.abs(stored - 4 * RING.hz) <= 2, 'samples at hz from 120 Hz sim: ' + stored);
ok(r.len === r.cap, 'ring full');
ok(r.lastT() - r.firstT() <= RING.ringSec + 1e-6, 'span within ringSec');
const out = {};
const tq = r.lastT() - 0.505;
ok(r.poseAt(tq, 0, out), 'poseAt player');
ok(Math.abs(out.x - 20 * tq) < 0.01, 'player x interpolated: ' + out.x);
ok(Math.abs(out.yaw - 0.5 * tq) < 0.001, 'player yaw interpolated');
ok(r.poseAt(tq, 5, out) && Math.abs(Math.atan2(Math.sin(out.yaw - (3.1 + 0.2 * tq)), Math.cos(out.yaw - (3.1 + 0.2 * tq)))) < 0.01, 'yaw wrap');
ok(!r.poseAt(r.firstT() - 0.1, 0, out), 'before ring is refused');
ok(!r.poseAt(tq, 99, out), 'absent car is refused');
const c = r.clip(r.lastT() - 0.8);
ok(c && Math.abs(c.t1 - c.t0 - 2.0) < 0.02, 'clip is 2.0 s: ' + (c && c.t1 - c.t0));
// teleport resets
const before = r.resets;
cars[0].x += 50; r.record(r.lastT() + 0.02, cars);
ok(r.resets === before + 1 && r.len === 1, 'teleport resets the ring');
// no allocation growth: typed arrays fixed
ok(r.s.length === r.cap * r.maxCars * 7, 'fixed storage');

console.log(fails ? `smoke_replay_ring: ${fails} FAIL` : 'smoke_replay_ring: ok');
process.exit(fails ? 1 : 0);
