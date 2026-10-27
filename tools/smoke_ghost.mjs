#!/usr/bin/env node
// [w7-replay] The ghost of your best run (src/game/ghost.js, spec C-11): a
// synthetic run is recorded through update(), saved through save.js, comes
// back after a reload, replays within 0.5 m of the real path, and only the
// faster run replaces it. Stubs only: no world, no map, no GL.
class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
globalThis.localStorage = new FakeStorage();
let n = 0, bad = 0;
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('FAIL: ' + msg); } };
const tick = () => new Promise((res) => setTimeout(res, 5));

const ghost = await import('../src/game/ghost.js');

// ---- who gets a ghost
ok(ghost.ghostIdFor({ mode: 'blitz', course: { id: 'bz_vieux' } }) === 'bz_vieux', 'blitz course');
ok(ghost.ghostIdFor({ mode: 'places', course: { id: 'pl_1', kind: 'blitz' } }) === 'pl_1', 'a registered course by kind');
ok(ghost.ghostIdFor({ race: true, id: 'blitz' }) === 'blitz', 'the story blitz');
ok(ghost.ghostIdFor({ race: true, id: 'circuit' }) === null && ghost.ghostIdFor({ id: 'dep' }) === null, 'rival races and jobs: none');

// A path: a gentle S curve at 20 m/s, with the true pose a function of time.
const path = (t) => ({ x: 100 + 20 * t, z: 50 * Math.sin(t / 10), yaw: Math.atan2(20, 5 * Math.cos(t / 10)) });
function drive(G, m, T, dt = 1 / 60, teleportAt = -1) {
  m.race.going = false;
  ghost.update(G);                                 // grid: nothing recorded
  m.race.going = true;
  for (let t = 0; t <= T + 1e-9; t += dt) {
    m.race.t = t;
    const p = path(t);
    G.veh.x = p.x + (teleportAt >= 0 && t >= teleportAt ? 300 : 0); G.veh.z = p.z; G.veh.yaw = p.yaw;
    ghost.update(G);
  }
  m.idx = m.stages.length;                         // done
  G.mission = null;
  ghost.update(G);
}
const mkG = () => ({ character: 'tom', veh: { x: 0, z: 0, y: 0, bodyY: 0.5, yaw: 0, pitch: 0, roll: 0, steer: 0, spec: { id: 'ranger' } } });
const mkM = () => ({ def: { mode: 'blitz', course: { id: 'bz_vieux' }, id: 'bz_vieux' }, stages: [{}, {}], idx: 1,
  race: { t: 0, going: false }, medal: { medal: 'bronze' } });

// ---- record, save, reload
{
  const G = mkG(), m = mkM();
  G.mission = m;
  ghost.update(G);
  ok(ghost.ghostState().id === 'bz_vieux', 'a course arms the recorder');
  drive(G, m, 60);
  await tick();
  ok(ghost.last.save && ghost.last.save.ok, 'saved ' + JSON.stringify(ghost.last.save));
  const S = await import('../src/game/save.js?reload=1');
  const g = S.loadGhost('bz_vieux');
  ok(g && g.hz === 20 && g.stride === 7 && Math.abs(g.t - 60) < 0.02 && g.meta.medal === 'bronze' && g.by === 'tom', 'ghost survives a reload');
  const p = ghost.prep(g);
  let worst = 0;
  const out = new Float64Array(8);
  for (let t = 0; t <= 60; t += 0.137) {
    ghost.sampleAt(p, t, out);
    const q = path(t);
    worst = Math.max(worst, Math.hypot(out[0] - q.x, out[2] - q.z));
  }
  ok(worst < 0.5, `replay within 0.5 m of the run (worst ${worst.toFixed(3)} m)`);
  ok(p.dist[p.n - 1] > 1100, 'path length for wheel spin');
}
// ---- the next run races it; only a faster run replaces it
{
  const G = mkG(), m = mkM();
  G.mission = m;
  ghost.update(G);
  ok(ghost.ghostState().loaded && ghost.ghostState().t > 59, 'the cached ghost is ready on the grid');
  m.race.t = 58.9;
  ok(ghost.finishLine(G, m) === 'Fantôme battu de 1,1 s', 'beaten line: ' + ghost.finishLine(G, m));
  m.race.t = 60.4;
  ok(ghost.finishLine(G, m) === '0,4 s derrière le fantôme' && ghost.finishLine(G, m, true) === '0.4 s behind the ghost', 'behind line');
  m.race.t = 60.01;
  ok(ghost.finishLine(G, m) === 'À égalité avec le fantôme', 'tie');
  // draw: five queued draws, translucent, unlit, tinted bronze
  const draws = [];
  const r = { draw: (mesh, mm, o) => draws.push([mesh, o.alpha, o.unlit, o.colorMul]) };
  G.meshes = { cars: { ranger: 'body' }, wheels: { ranger: 'wheel' } };
  G.veh.x = 1000; G.veh.z = 0;                     // far enough to see it, inside 400 m? no: move closer
  G.veh.x = 120; m.race.going = true; m.race.t = 0.5;
  const spec = { id: 'ranger', track: 1.67, wheelR: 0.34, axleZ: 1.37 };
  ok(ghost.draw(r, G, () => spec) === true && draws.length === 5, 'five draws for a car: ' + draws.length);
  ok(draws.every((d) => d[1] > 0 && d[1] < 0.35 && d[2] === true && d[3] === ghost.TINT.bronze), 'translucent, unlit, bronze tint');
  G.veh.x = path(0.5).x; G.veh.z = path(0.5).z;
  ok(ghost.draw(r, G, () => spec) === false, 'invisible when you sit in it');
  drive(G, m, 70);                                 // slower: kept out
  await tick();
  ok(ghost.last.save.reason === 'slower', 'a slower run does not replace the ghost');
  const G2 = mkG(), m2 = mkM();
  G2.mission = m2; ghost.update(G2);
  drive(G2, m2, 50);
  await tick();
  ok(ghost.last.save.ok && ghost.ghostState().cached >= 1, 'a faster run replaces it');
}
// ---- a teleport is a cut, not a slide; a fail is never a ghost
{
  const G = mkG(), m = mkM();
  m.def = { mode: 'checkpoint', course: { id: 'cp_ruelles' }, id: 'cp_ruelles' };
  G.mission = m; ghost.update(G);
  drive(G, m, 20, 1 / 60, 10);
  await tick();
  const S = await import('../src/game/save.js?reload=2');
  const g = ghost.prep(S.loadGhost('cp_ruelles'));
  ok(g && g.cuts.size === 1, 'one cut recorded');
  const out = new Float64Array(8);
  let slid = false;
  for (let t = 9.9; t < 10.2; t += 0.01) { ghost.sampleAt(g, t, out); const x0 = path(t).x; if (Math.abs(out[0] - x0) > 5 && Math.abs(out[0] - x0 - 300) > 5) slid = true; }
  ok(!slid, 'no slide across the teleport');
  const G3 = mkG(), m3 = mkM();
  m3.def = { mode: 'blitz', course: { id: 'bz_hull' }, id: 'bz_hull' };
  G3.mission = m3; ghost.update(G3);
  m3.race.going = true;
  for (let t = 0; t < 5; t += 1 / 60) { m3.race.t = t; G3.veh.x = t * 20; ghost.update(G3); }
  G3.mission = null; ghost.update(G3);              // idx not past the end: a fail
  await tick();
  ok(S.loadGhost('bz_hull') === null, 'a fail is never saved');
}
// ---- a long run saves at 10 Hz and stays under the size cap
{
  const G = mkG(), m = mkM();
  m.def = { mode: 'checkpoint', course: { id: 'cp_hull' }, id: 'cp_hull' };
  G.mission = m; ghost.update(G);
  drive(G, m, 300, 1 / 30);
  await tick();
  const S = await import('../src/game/save.js?reload=3');
  const g = S.loadGhost('cp_hull');
  ok(g && g.hz === 10 && g.frames.length * 4 <= 262144, 'long run at 10 Hz ' + (g && g.frames.length));
  const p = ghost.prep(g);
  const out = new Float64Array(8);
  ghost.sampleAt(p, 300, out);
  ok(Math.hypot(out[0] - path(300).x, out[2] - path(300).z) < 0.5, 'the 10 Hz ghost still reaches the line');
}
// ---- cost: one playback sample is cheap
{
  const g = ghost.prep((await import('../src/game/save.js?reload=4')).loadGhost('bz_vieux'));
  const out = new Float64Array(8);
  for (let i = 0; i < 2000; i++) ghost.sampleAt(g, (i % 600) / 10, out);
  const t0 = performance.now();
  for (let i = 0; i < 10000; i++) ghost.sampleAt(g, (i % 600) / 10, out);
  const us = (performance.now() - t0) / 10000 * 1000;
  ok(us < 30, `sampleAt ${us.toFixed(2)} us`);
}

if (bad) { console.log(`${bad} of ${n} ghost checks failed`); process.exit(1); }
console.log(`ok  ${n} ghost checks`);
