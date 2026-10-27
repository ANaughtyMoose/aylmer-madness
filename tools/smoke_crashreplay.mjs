// [w7-crashnight] C-12 small: crash replay on ReplayRing. Pure node, stub G,
// no map, no world. Ring, trigger (G.feel.crash), offer, playback, restore.
import { CrashReplay, CRASH_REPLAY } from '../src/game/crashreplay.js';

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };

// Analytic path: the player drives east at 25 m/s, traffic cars sit or circle.
const pathX = (t) => 100 + 25 * t;
function makeG() {
  const cars = [];
  for (let i = 0; i < 30; i++) cars.push({ x: 0, y: 0, z: 0, yaw: 0, speed: 0, r: 20 + i * 1.5, a: i });
  return {
    mode: 'drive', time: 0, focus: null, mission: null, feel: { crash: 0 },
    veh: { x: pathX(0), y: 0.3, z: 50, yaw: Math.PI / 2, pitch: 0, roll: 0, vLong: 25 },
    traffic: { cars }, rivals: [],
    camPos: [1, 2, 3], camYaw: 0.5, cineCam: null,
    q: { fov: 1.15 }, settings: { fov: 0 },
  };
}
function move(G) {
  G.veh.x = pathX(G.time);
  for (const c of G.traffic.cars) { c.x = G.veh.x + Math.cos(c.a + G.time) * c.r; c.z = 50 + Math.sin(c.a + G.time) * c.r; c.yaw = c.a; }
}
function run(G, R, secs, dt) {
  const end = G.time + secs;
  while (G.time < end - 1e-9) { G.time += dt; move(G); R.record(G, dt); }
}

// ring + trigger + clip window
{
  const G = makeG(), R = new CrashReplay();
  ok(R.bytes() < 2 * 1024 * 1024, 'buffers under 2 MB: ' + R.bytes());
  run(G, R, 3, 1 / 120);
  ok(R.ring.len > 100 && !R.have, 'records, no clip without a crash');
  G.feel.crash++;
  const crashT = G.time;
  run(G, R, 0.4, 1 / 60);
  ok(!R.have, 'no clip before the post-roll');
  run(G, R, 0.6, 1 / 240);   // slow-mo sized steps
  ok(!!R.have, 'clip frozen after the post-roll');
  const h = R.have;
  ok(h.crashT > crashT && h.crashT - crashT <= 1 / 60 + 1e-9, 'crash time is the next tick');
  ok(Math.abs(h.t1 - h.t0 - 2.0) < 1 / 30, 'clip about 2.0 s: ' + (h.t1 - h.t0).toFixed(3));
  ok(Math.abs(h.crashT - h.t0 - 1.2) < 1 / 30, '1.2 s pre-roll');
  const pose = {};
  let worst = 0;
  for (let i = 0; i <= 100; i++) {
    const t = h.t0 + (h.t1 - h.t0) * i / 100;
    if (R.clip.poseAt(t, 0, pose)) worst = Math.max(worst, Math.abs(pose.x - pathX(t)));
  }
  ok(worst < 0.1, 'player pose within 0.1 m: ' + worst.toFixed(4));
  ok(R.clip.n[R.clip.slot(0)] === 16, 'player + 15 nearest cars kept');

  // the offer waits for the crash show, then counts down in real time
  G.crashQuietUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 60000;
  ok(R.offerText(G, 1) === null && R.offerLeft === CRASH_REPLAY.offerSec, 'offer held while the crash show is on');
  ok(!R.play(G), 'play refused during the crash show');
  G.crashQuietUntil = 0;
  ok(R.offerText(G, 1) === CRASH_REPLAY.prompt, 'offer up after the show');
  ok(R.offered(G), 'offered()');

  // playback
  const before = { x: G.veh.x, cam: G.camPos.slice(), yaw: G.camYaw };
  const t0 = Date.now();
  ok(R.play(G), 'play starts');
  ok(Date.now() - t0 < 200 && G.cineCam === R.cam, 'cineCam set within 200 ms');
  let frames = 0, crashes = 0, wall = 0, s;
  do { s = R.step(G, 1 / 60); frames++; wall += 1 / 60; if (s.crash) crashes++; } while (s.playing && frames < 2000);
  ok(crashes === 1, 'crash sound once: ' + crashes);
  ok(wall > 2.5 && wall < 6, 'a few seconds of playback: ' + wall.toFixed(2));
  // poses swap in and out bit-exact
  R.playing = true; R.head = h.crashT; R.clip.poseAt(R.head, 0, R.pose);
  const tc = G.traffic.cars.map((c) => [c.x, c.y, c.z, c.yaw]);
  R.applyPoses(G);
  ok(Math.abs(G.veh.x - pathX(h.crashT)) < 0.1, 'player posed at the playhead');
  R.restorePoses(G);
  ok(G.veh.x === before.x, 'player restored exactly');
  ok(G.traffic.cars.every((c, i) => c.x === tc[i][0] && c.z === tc[i][2] && c.yaw === tc[i][3]), 'traffic restored exactly');
  R.stop(G);
  ok(G.cineCam === null && G.camYaw === before.yaw && G.camPos.every((v, i) => v === before.cam[i]), 'stop restores the camera');
  ok(!R.offered(G), 'offer used up');
}

// offer rules
{
  const G = makeG(), R = new CrashReplay();
  run(G, R, 2, 1 / 60); G.feel.crash++; run(G, R, 1, 1 / 60);
  let up = 0;
  while (R.offerText(G, 0.1)) up += 0.1;
  ok(Math.abs(up - 5) < 0.15, 'offer lasts 5 s: ' + up.toFixed(2));
  G.feel.crash++; run(G, R, 1, 1 / 60);
  G.mission = {};
  ok(R.offerText(G, 0.1) === null && R.offerLeft === 0, 'a new mission cancels the offer');
  G.mission = null; G.feel.crash++; run(G, R, 1, 1 / 60);
  ok(R.offerText(G, 0.1, true) === null && R.offerLeft === 0, 'blocked cancels the offer');
  G.feel.crash++; run(G, R, 1, 1 / 60);
  G.veh.x += 300;
  ok(R.offerText(G, 0.1) === null, 'not offered 300 m away');
  // teleport in the post-roll freezes early with what exists
  const R2 = new CrashReplay(), G2 = makeG();
  run(G2, R2, 2, 1 / 60); G2.feel.crash++; run(G2, R2, 0.3, 1 / 60);
  G2.veh.x += 500; G2.time += 1 / 60; R2.record(G2, 1 / 60);
  ok(!!R2.have && R2.have.t1 - R2.have.t0 >= 1.2, 'teleport in the post-roll freezes early');
}

// cost: no allocation pattern, mean record under 0.05 ms
{
  const G = makeG(), R = new CrashReplay();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 10000; i++) { G.time += 1 / 60; move(G); R.record(G, 1 / 60); }
  const us = Number(process.hrtime.bigint() - t0) / 1e3 / 10000;
  console.log(`record mean ${us.toFixed(1)} us (includes the stub's own motion)`);
  ok(us < 50, 'record under 0.05 ms');
}

// W8-BUGS: the speech bubbles hide for the replay and come back as they were
// (cloud run 27 Oct: Margaret's line stayed over the REPRISE letterbox).
{
  const { SPEECH_IDS } = await import('../src/game/crashreplay.js');
  const els = {
    heckles: { id: 'heckles', style: { visibility: '' } },
    slangpanel: { id: 'slangpanel', style: { visibility: 'visible' } },
  };
  const had = globalThis.document;
  globalThis.document = {
    getElementById: (id) => els[id] || null,
    createElement: () => ({ style: {}, set innerHTML(v) {} }),
    body: { appendChild() {} },
  };
  const R = new CrashReplay();
  R.overlay(true);
  ok(SPEECH_IDS.includes('heckles') && els.heckles.style.visibility === 'hidden' && els.slangpanel.style.visibility === 'hidden', 'replay on: the speech bubbles and the slang panel are hidden');
  R.overlay(true);
  R.overlay(false);
  ok(els.heckles.style.visibility === '' && els.slangpanel.style.visibility === 'visible', 'replay off: both back exactly as they were (a second on does not lose that)');
  globalThis.document = had;
}

console.log(fails ? `smoke_crashreplay: ${fails} FAIL` : `smoke_crashreplay: ${n}/${n} ok`);
if (fails) process.exit(1);
