#!/usr/bin/env node
// [w8-courseproof] The QA course driver (src/game/qacourse.js): it finishes a
// course through the race's own gate test, in order, on game time; and it is
// unreachable in normal play (AYLMER.qa exists only under a review namespace,
// G.qaFollow is set nowhere else). Also the harness papercuts from
// wave7-cloud/RESULTS.md. Stubs only: no world, no map bake, no browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
let n = 0, bad = 0;
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('FAIL: ' + msg); } };

const qa = await import('../src/game/qacourse.js');
const { Track } = await import('../src/game/race.js');
const ns = await import('../src/game/storage-ns.js');

// ---- 1. gate: only a review namespace opens it
ok(!qa.qaAllowed(null) && !qa.qaAllowed(undefined) && !qa.qaAllowed({}), 'no storage info: closed');
ok(!qa.qaAllowed({ installed: true, review: null, prefix: '' }), 'player keys (no flag): closed');
ok(!qa.qaAllowed({ installed: true, review: '' }), 'empty review: closed');
ok(qa.qaAllowed({ installed: true, review: 'panel', prefix: 'aylmer.review.panel.' }), '?review=panel (the harness): open');
ok(qa.qaAllowed({ installed: true, review: 'harness' }), 'framed by a tools/ harness: open');
ok(ns.reviewName('') === null && ns.reviewName('?drive=1') === null, 'storage-ns: no review flag on a plain url');
ok(ns.reviewName('?review=panel') === 'panel', 'storage-ns: ?review=panel');

// ---- 2. the wiring: AYLMER.qa only behind qaAllowed, G.qaFollow only from qacourse.js
{
  const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const assigns = main.split('\n').filter((l) => /AYLMER\.qa\s*=/.test(l));
  ok(assigns.length === 1 && /if \(qaCourse\.qaAllowed\(globalThis\.AYLMER_STORAGE\)\) window\.AYLMER\.qa = /.test(assigns[0]), 'main.js: one AYLMER.qa assignment, guarded by qaAllowed');
  ok(!/\bqa\s*:/.test(main.slice(main.indexOf('window.AYLMER = {'), main.indexOf('window.AYLMER = {') + 6000)), 'main.js: no qa key in the AYLMER literal');
  const ticks = main.split('\n').filter((l) => /qaCourse\.qaTick/.test(l));
  ok(ticks.length === 1 && /if \(G\.qaFollow\) qaCourse\.qaTick\(G, dt\)/.test(ticks[0]), 'main.js: qaTick only when G.qaFollow');
  ok(main.includes('[w8-courseproof]'), 'main.js edits are marked [w8-courseproof]');
  const setters = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.js$/.test(f.name) && /qaFollow\s*=[^=]/.test(fs.readFileSync(p, 'utf8'))) setters.push(path.relative(ROOT, p)); } };
  walk(path.join(ROOT, 'src'));
  ok(setters.length === 1 && setters[0] === path.join('src', 'game', 'qacourse.js'), `G.qaFollow set only in qacourse.js (${setters.join(', ')})`);
  ok(!/qacourse|AYLMER\.qa\b/.test(fs.readFileSync(path.join(ROOT, 'src/game/hud.js'), 'utf8')), 'no player-facing file mentions it');
}

// ---- 3. a stub course: three gates, the race's own Track.check
function stub(going = true) {
  const v = { x: 0, z: 0, yaw: 0, vLong: 5, resets: 0, reset(x, z, yaw, y) { this.x = x; this.z = z; this.yaw = yaw; this.y = y; this.vLong = 0; this.resets++; } };
  const cps = [{ x: 0, z: 200, r: 14 }, { x: 150, z: 200, r: 14 }, { x: 150, z: 0, r: 14 }];
  const track = new Track(cps, 1, null, { x: 0, z: 0 });
  const m = { def: { id: 'stub' }, idx: 1, stages: [{ kind: 'grid' }, { kind: 'race' }], race: { track, me: { done: 0 }, going, t: 0 } };
  return { G: { veh: v, mission: m, phys: { groundY: () => 1.5 } }, m, v, track };
}
function race(G, m, dt) {
  // racejobs.js onTick, the part that matters: the clock and the gate test.
  const R = m.race;
  if (!R.going) return false;
  R.t += dt;
  const fin = R.track.check(R.me, G.veh.x, G.veh.z, R.track.gate(R.me.done).r);
  return fin;
}
{
  const { G, m, v } = stub(false);
  ok(qa.completeNextGate(G).ok === false, 'completeNextGate refuses before GO');
  qa.follow(G, { kmh: 100 });
  for (let i = 0; i < 60; i++) qa.qaTick(G, 1 / 60);
  ok(v.x === 0 && v.z === 0 && v.resets === 0, 'follow is idle on the grid / in the count-in');
  m.race.going = true;
  const info = qa.gateInfo(G);
  ok(info && info.kind === 'race' && info.done === 0 && info.n === 3 && info.gate && info.gate.d === 200, 'gateInfo: next gate and distance');
}
{
  const { G, m, v } = stub(true);
  const r = qa.completeNextGate(G);
  ok(r.ok && v.x === 0 && v.z === 200 && v.y === 1.5, 'completeNextGate: truck in the middle of gate 1, on the ground');
  ok(Math.abs(v.yaw - Math.atan2(150, 0)) < 1e-9, 'completeNextGate: facing the next gate');
  ok(!race(G, m, 1 / 60) && m.race.me.done === 1, 'the race clears gate 1 itself on the next tick');
  qa.completeNextGate(G); race(G, m, 1 / 60);
  qa.completeNextGate(G);
  ok(race(G, m, 1 / 60) === true && m.race.me.done === 3, 'three calls finish the course, in order');
  ok(qa.completeNextGate(G).ok === false, 'nothing after the line');
}
{
  // follow at 72 km/h (20 m/s), gates in a line 200 m apart (no G.nav: the straight
  // line stands in for the GPS route): the last ring (r 14) is entered at 586 m = 29.3 s.
  const { G, m, v } = stub(true);
  m.race.track = new Track([{ x: 0, z: 200, r: 14 }, { x: 0, z: 400, r: 14 }, { x: 0, z: 600, r: 14 }], 1, null, { x: 0, z: 0 });
  qa.follow(G, { kmh: 72 });
  let fin = false, ticks = 0, order = [];
  while (!fin && ticks < 60 * 60) {
    qa.qaTick(G, 1 / 60);
    const before = m.race.me.done;
    fin = race(G, m, 1 / 60);
    if (m.race.me.done !== before) order.push(m.race.me.done);
    ticks++;
  }
  ok(fin, 'follow finishes the course');
  ok(order.join(',') === '1,2,3', `gates cleared in order (${order})`);
  ok(Math.abs(m.race.t - 29.3) < 0.05, `race time is game time at the set speed (${m.race.t.toFixed(2)} s, want 29.3)`);
  const fs1 = qa.followState(G);
  ok(fs1 && fs1.kmh === 72 && fs1.gates === 2 && fs1.metres > 500, 'followState reports speed, gates and metres');
  const x = v.x, z = v.z;
  for (let i = 0; i < 30; i++) qa.qaTick(G, 1 / 60);
  ok(v.x === x && v.z === z, 'follow is idle after the line');
  qa.follow(G, null);
  ok(G.qaFollow === null && qa.followState(G) === null, 'follow(null) stops it');
}
{
  // with a route from G.nav: the truck walks the polyline, not the straight line
  const { G, m, v } = stub(true);
  G.nav = { route: (x0, z0, x1, z1) => [[x0, z0], [x0 + 100, z0], [x1, z1]] };
  qa.follow(G, { kmh: 36 });
  for (let i = 0; i < 60 * 5; i++) { qa.qaTick(G, 1 / 60); race(G, m, 1 / 60); }
  ok(Math.abs(v.x - 50) < 0.5 && Math.abs(v.z) < 0.5, `follows the nav route's first leg (${v.x.toFixed(1)}, ${v.z.toFixed(1)})`);
  ok(Math.abs(v.yaw - Math.PI / 2) < 1e-6, 'yaw along the leg');
  const G2 = { veh: { x: 3, z: 4, yaw: 0, reset() { throw new Error('moved'); } }, mission: m };
  let threw = false; try { qa.qaTick(G2, 1 / 60); } catch { threw = true; }
  ok(!threw, 'no G.qaFollow: qaTick does nothing');
}

{
  // a fixed path (a shortcut's points): walked once at the set speed, no course needed
  const v = { x: 0, z: 0, yaw: 0, reset(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; } };
  const G = { veh: v, mission: null };
  const r = qa.follow(G, { kmh: 36, path: [[0, 0], [0, 30], [40, 30]] });
  ok(r.fixed === true, 'follow with a path is a fixed walk');
  for (let i = 0; i < 60 * 4; i++) qa.qaTick(G, 1 / 60);
  ok(Math.abs(v.x - 10) < 0.2 && Math.abs(v.z - 30) < 0.2 && !qa.followState(G).done, `fixed path: 40 m in 4 s at 36 km/h (${v.x.toFixed(1)}, ${v.z.toFixed(1)})`);
  for (let i = 0; i < 60 * 10; i++) qa.qaTick(G, 1 / 60);
  ok(v.x === 40 && v.z === 30 && qa.followState(G).done === true, 'fixed path: stops at its end, followState().done');
}

// ---- 4. the harness papercuts (RESULTS.md "Harness and tooling problems")
{
  const h = fs.readFileSync(path.join(ROOT, 'tools/review/harness.mjs'), 'utf8');
  ok(/path\.resolve\(OUT\)\.startsWith\(path\.resolve\(REVIEW_ROOT\) \+ path\.sep\) && !fs\.existsSync\(path\.join\(REVIEW_ROOT, '\.gitignore'\)\)/.test(h), 'harness: .gitignore only under REVIEW_ROOT');
  ok(/code === 'Enter' \? '\\r'/.test(h), 'harness: Enter sends text "\\r"');
  ok(/gameSecs > maxSecs \|\| Date\.now\(\) - t0 > maxSecs \* WALL_FACTOR \* 1000/.test(h), 'harness: runTask maxSecs in game seconds, wall cap x WALL_FACTOR');
  const r = fs.readFileSync(path.join(ROOT, 'tools/qa/lib/rig.mjs'), 'utf8');
  ok(/CMP_CHROME_NO_SANDBOX === '1'\) flags\.push\('--no-sandbox'\)/.test(r) && r.includes("'--enable-unsafe-swiftshader'"), 'rig: no-sandbox switch and unsafe-swiftshader');
  const a = fs.readFileSync(path.join(ROOT, 'tools/review/page-agent.js'), 'utf8');
  ok(/control\(gameDt\(dt \/ 1000\)\)/.test(a) && /RV\.clock = 'game'/.test(a), 'page agent: task clocks on game time');
}
// The page agent's game clock, run for real: a stub window, three frames.
{
  const frames = [];
  const G = { time: 10, mode: 'menu' };
  const win = { AYLMER: { G, camClipStats: null } };
  win.dispatchEvent = () => {}; win.__rawTiming = null;
  const ctx = vm.createContext({
    window: win, document: { querySelectorAll: () => [], getElementById: () => null, querySelector: () => null },
    performance: { now: () => 0 }, requestAnimationFrame: (f) => frames.push(f), setInterval() {}, setTimeout() {}, console,
    KeyboardEvent: class {}, getComputedStyle: () => ({}), Promise, Math, Object, JSON, Float64Array, Set, Map, Number, String, Array, Infinity,
  });
  let RV = null;
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'tools/review/page-agent.js'), 'utf8'), ctx, { filename: 'page-agent.js' });
    RV = win.__RV;
  } catch (e) { console.log('page-agent stub: ' + e.message); }
  if (RV) {
    const tick = (wallMs) => { const f = frames.shift(); f(wallMs); };
    tick(16); G.time = 10.5; tick(1016); G.time = 10.6; tick(2016);
    ok(Math.abs(RV.gameSecs - 0.6) < 1e-9, `page agent counts G.time, not the 2 wall seconds (${RV.gameSecs})`);
    G.time = 0; tick(3016);
    ok(Math.abs(RV.gameSecs - 0.6) < 1e-9, 'a reset G.time adds no negative step');
  } else ok(false, 'page agent loads in a stub window');
}

console.log(`smoke_qacourse: ${n - bad}/${n} passed`);
if (bad) process.exit(1);
