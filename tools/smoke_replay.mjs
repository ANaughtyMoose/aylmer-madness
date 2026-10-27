#!/usr/bin/env node
// [w7-replay] « Une autre run »: src/game/replay.js judges a timed story stage
// and a course, writes the record through save.js (it survives a reload), and
// a fail gets an estimate line; modes.js restarts a course on R. Stubs only:
// no world, no map bake.
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

const replay = await import('../src/game/replay.js');
const { resultLine } = await import('../src/game/medals.js');

// ---- a timed story stage: dep 2/2 (Or 39, Argent 43, Bronze 50; [w6-curfew] re-paced
// 27 Oct from 38/42/48, every run moved with its threshold)
{
  const G = { character: 'tom', carId: 'ranger', veh: { x: 0, z: 0 } };
  const stages = [{ text: 'a' }, { text: 'b', time: 60 }];
  const m = { def: { id: 'dep' }, stages, idx: 0, elapsed: 0, target: { x: 0, z: 500 } };
  ok(replay.stageStart(G, m) === null && replay.stageDone(G, m) === null, 'an untimed stage opens nothing');
  m.idx = 1; m.elapsed = 20;
  const run = replay.stageStart(G, m);
  ok(run && run.key === 'dep 2/2' && run.d0 === 500, 'the timed stage opens a run');
  m.elapsed = 20 + 47.3;
  const r = replay.stageDone(G, m);
  ok(r && r.medal === 'bronze' && r.gap === 4.3 && r.isNew && !r.newBest, 'bronze, 4,3 s from silver, first run is not « Nouveau record »');
  ok(resultLine(r) === '0:47,3. Bronze. 4,3 s de l’argent.', resultLine(r));
  ok(replay.lastResult() === r && m.medal === r, 'lastResult and m.medal');
  // A faster second try is a new record; a slower one is not.
  m.medalRun = null; replay.stageStart(G, m); m.elapsed += 40;
  const r2 = replay.stageDone(G, m);
  ok(r2.medal === 'argent' && r2.newBest && resultLine({ ...r2, rerun: false }).endsWith('Nouveau record.'), 'silver, new record');
  replay.stageStart(G, m); m.elapsed += 50;
  ok(!replay.stageDone(G, m).newBest, 'slower run keeps the record');
}
// ---- records survive a reload of save.js
{
  const S = await import('../src/game/save.js?reload=1');
  const r = S.loadRecord('stage:dep:2-2');
  ok(r && r.t === 40 && r.top.length === 3 && r.by === 'tom' && r.car === 'ranger', 'stage record reloaded ' + JSON.stringify(r));
}
// ---- a chase over several flags is one run
{
  const G = { veh: { x: 0, z: 0 } };
  const stages = Array.from({ length: 12 }, (_, i) => (i >= 6 && i <= 10 ? { kind: 'chase' + (i - 5), time: 120 } : {}));
  const m = { def: { id: 'golfcart' }, stages, idx: 6, elapsed: 0, target: { x: 0, z: 100 } };
  replay.stageStart(G, m);
  for (let i = 6; i < 10; i++) { m.elapsed += 10; ok(replay.stageDone(G, m) === null, 'flag ' + i + ' does not close the run'); m.idx++; replay.stageStart(G, m); }
  m.elapsed += 30;
  const r = replay.stageDone(G, m);
  ok(r && r.key === 'golfcart 7/12' && r.value === 70, 'the run closes on the last flag ' + JSON.stringify(r && r.value));
}
// ---- a fail: the estimate line, and nothing on an untimed stage
{
  const G = { veh: { x: 0, z: 0 } };
  const m = { def: { id: 'dep' }, stages: [{}, { time: 60 }], idx: 1, elapsed: 0, target: { x: 0, z: 1000 } };
  replay.stageStart(G, m);
  G.veh.z = 600; m.elapsed = 40;                    // 600 m in 40 s: 15 m/s, 400 m left -> about 27 s, 67 vs bronze 50
  const line = replay.failLine(G, m);
  ok(line === 'Il restait 400 m, environ 17 s du bronze.', 'fail line: ' + line);
  ok(replay.failLine(G, { def: { id: 'divan' }, stages: [{}], idx: 0, elapsed: 5 }) === '', 'untimed: no line');
}
// ---- a course: judged on m.race.t at the last stage, fail from the track
{
  const G = { character: 'sayyad', carId: 'ranger', veh: { x: 0, z: 0 } };
  const track = { total: 2000, progress: () => 1500 };
  const m = { def: { id: 'bz_vieux', mode: 'blitz' }, stages: [{}, {}], idx: 0, elapsed: 130,
    race: { t: 101.2, going: true, track, me: { done: 3 } } };
  ok(replay.stageDone(G, m) === null, 'the grid stage closes nothing');
  m.idx = 1;
  const r = replay.stageDone(G, m);
  ok(r && r.value === 101.2 && r.id === 'bz_vieux', 'course judged on race time, not elapsed');
  const fl = replay.failLine(G, m);
  ok(/^Il restait 500 m/.test(fl) && /environ/.test(fl), 'course fail line: ' + fl);
}
// ---- R on a course: straight back on the line, no card
{
  const M = await import('../src/game/modes.js');
  const calls = [];
  const G = { input: null, hud: null };
  M.installModes(G, { startMission: (d, o) => { calls.push([d.id, o]); } });
  ok(M.restartRun(G, 'bz_vieux') === true && calls[0][0] === 'bz_vieux' && calls[0][1] && calls[0][1].card === false, 'restartRun: no brief card');
  ok(M.restartRun(G, 'dep') === false, 'a story job is not a course');
  let hits = 0;
  const input = { hit: (k) => k === 'KeyR' && hits-- > 0, consume() {} };
  ok(M.offerRerun(G, 'cp_ruelles') && G.rerun.left === 10, 'rerun offered');
  ok(M.tickRerun(G, 1, input) === false && G.rerun.left === 9, 'no key, the window runs down');
  hits = 1;
  ok(M.tickRerun(G, 0.016, input) === true && calls.at(-1)[0] === 'cp_ruelles' && !G.rerun, 'R restarts once');
  M.offerRerun(G, 'cp_ruelles');
  hits = 1;
  M.tickRerun(G, 11, { hit: () => false });
  ok(!G.rerun && M.tickRerun(G, 0, input) === false, 'gone after 10 s');
  M.offerRerun(G, 'cp_ruelles'); G.mission = {};
  ok(M.tickRerun(G, 0, input) === false && !G.rerun, 'a mission closes the window');
  const pills = M.targetPills('bz_vieux');
  ok((pills.match(/class="tg"/g) || []).length === 3 && /Sayyad/.test(pills) && /Adam/.test(pills)
    && !/data-tier="bronze">[^<]*(Sayyad|Adam)/.test(pills), 'picker pills: gold Sayyad, silver Adam, bronze unnamed');
}

// ---- [w7-polish] a save taken mid-course or mid Crash Night: free roam, no « Job perdue »
{
  const M = await import('../src/game/modes.js');
  const toasts = [], resets = [];
  const veh = { damage: 70, x: 0, z: 0, yaw: 0, spec: {}, reset(x, z, a) { resets.push([x, z, a]); this.x = x; this.z = z; this.yaw = a; } };
  const G = { input: null, hud: { toast: (s) => toasts.push(s) }, veh, modeNow: 'blitz', waypoint: { x: 1, z: 1 } };
  M.installModes(G, { startMission: () => { throw new Error('a loaded course must not start a run'); } });
  const c = M.COURSES.find((x) => x.id === 'bz_vieux');
  const r = M.resumeModeSave(G, 'bz_vieux');
  ok(r && r.course === c, 'a course save is recognised');
  ok(resets.length === 1 && Math.abs(veh.x - (c.start.x ?? 0)) < 0.01 && Math.abs(veh.z - (c.start.z ?? 0)) < 0.01, 'the truck lands on the course start line');
  ok(G.modeNow === 'cruise' && !G.mission && G.waypoint === null, 'free roaming, no run started');
  ok(toasts.length === 1 && !/perdue/i.test(toasts[0]) && /balade/.test(toasts[0]) && /\bM\b/.test(toasts[0]), 'no loss message, says M runs it again: ' + toasts[0]);
  ok(!/[\u2013\u2014]/.test(toasts[0]), 'no em or en dash in the load line');
  M.registerMode({ id: 'crashnight', name: 'Crash Night', fr: 'Tôle froissée' });
  resets.length = 0; toasts.length = 0; G.modeNow = 'crashnight';
  const r2 = M.resumeModeSave(G, 'crashnight');
  ok(r2 && !r2.course && resets.length === 0 && G.modeNow === 'cruise', 'a Crash Night save: free roam where it was saved');
  ok(toasts.length === 1 && /Tôle froissée/.test(toasts[0]) && !/perdue/i.test(toasts[0]), 'Crash Night load line: ' + toasts[0]);
  ok(M.resumeModeSave(G, 'dep') === null && M.resumeModeSave(G, 'gone_job') === null, 'a story or retired job id is not a mode');
  const fs = await import('node:fs');
  const MAIN = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = MAIN.slice(MAIN.indexOf('function resumeMission'), MAIN.indexOf('Job perdue'));
  ok(/resumeModeSave\(G, saved\.id\)/.test(body), 'main.js resumeMission asks resumeModeSave before « Job perdue »');
  // A mid-night save keeps the pre-night damage (the night's wrecks are the mode's).
  const S = await import('../src/game/save.js');
  const snap = S.snapshot({ veh: { damage: 70, x: 1, z: 2, yaw: 0 }, carId: 'ranger', character: 'tom', crashNight: { savedDamage: 12 }, done: new Set() });
  ok(snap && snap.health && snap.health.ranger === 12, 'a mid Crash Night save keeps the pre-night damage: ' + (snap && snap.health && snap.health.ranger));
  const snap2 = S.snapshot({ veh: { damage: 70, x: 1, z: 2, yaw: 0 }, carId: 'ranger', character: 'tom', done: new Set() });
  ok(snap2 && snap2.health && snap2.health.ranger === 70, 'outside the night the damage is the car\'s');
}

// ---- [w7-polish] one clock for a course: G.best, the purse and the best-time toast use m.race.t
{
  const K = await import('../src/game/missionkit.js');
  const M = await import('../src/game/modes.js');
  const S = await import('../src/game/save.js');
  const course = M.COURSES.find((c) => c.id === 'cp_ruelles');
  const def = M.missionFor(course);
  ok(K.courseTime({ elapsed: 95, race: { t: 80 } }) === 80 && K.courseTime({ elapsed: 95 }) === 95, 'courseTime: race time, elapsed only as a fallback');
  // 95 s on the old clock is slower than an 85 s best; 80 s from GO beats it.
  const G = { best: { cp_ruelles: 85 }, bestLegacy: {}, done: new Set() };
  ok(K.runPay(G, { def, elapsed: 95, race: { t: 80 } }).kind === 'mode-pb', 'the purse compares race time, not grid-inclusive elapsed');
  ok(K.runPay(G, { def, elapsed: 84, race: { t: 86 } }).kind === 'mode-repeat', 'a slower race time is no new best, whatever elapsed says');
  // An old save's grid-inclusive best: still « won », never compared.
  const GL = { best: {}, bestLegacy: { cp_ruelles: 120 }, done: new Set() };
  ok(K.runPay(GL, { def, elapsed: 130, race: { t: 100 } }).kind === 'mode-repeat', 'a legacy win: no second purse, no false new best');
  ok(K.runPay({ best: {}, bestLegacy: {} }, { def, elapsed: 130, race: { t: 100 } }).kind === 'mode-first', 'never won: the whole purse');
  // Old saves load; their course bests move to bestLegacy, story bests stay.
  const old = S.normalizeSave({ character: 'tom', carId: 'ranger', best: { cp_ruelles: 120, bz_vieux: 140, school: 88 } });
  ok(old && old.best.school === 88 && old.best.cp_ruelles == null && old.bestLegacy.cp_ruelles === 120 && old.bestLegacy.bz_vieux === 140, 'an old save loads, course bests set aside as legacy');
  const again = S.normalizeSave({ ...old, best: { ...old.best, cp_ruelles: 80 } });
  ok(again.best.cp_ruelles === 80 && again.bestLegacy.cp_ruelles === 120, 'a new save keeps its race-time best (no second migration)');
  const snap = S.snapshot({ veh: { damage: 0, x: 1, z: 2, yaw: 0 }, carId: 'ranger', character: 'tom', done: new Set(), best: { cp_ruelles: 80 } });
  ok(snap.best.cp_ruelles === 80 && snap.bestLegacy && typeof snap.bestLegacy === 'object', 'a snapshot always writes bestLegacy, so its course bests are race time');
  // The modes table and its toast take the same clock.
  const toasts = [];
  const GM = { done: new Set([def.id]), hud: { toast: (t) => toasts.push(t), prompt() {} }, rivals: [], raceParked: {}, parked: {} };
  def.cleanup(GM, { elapsed: 75.5, race: { t: 61.25 } });
  ok(M.loadModeBests()[def.id] === 61.25, 'the modes table keeps race time: ' + M.loadModeBests()[def.id]);
  ok(toasts.some((t) => /MEILLEUR TEMPS : 1:01/.test(t)), 'the best-time toast shows race time: ' + toasts.join(' | '));
  const fs = await import('node:fs');
  const MAIN = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok(/const runT = def\.course \? courseTime\(m\) : m\.elapsed;/.test(MAIN) && /G\.best\[def\.id\] = runT/.test(MAIN), 'main.js records a course on courseTime');
}

if (bad) { console.log(`${bad} of ${n} replay checks failed`); process.exit(1); }
console.log(`ok  ${n} replay checks`);
