#!/usr/bin/env node
// [w7-replay] Records and ghosts in save.js (spec C-02b): plain node.
//
//   node tools/smoke_records.mjs
//
// A record and a 200 kB ghost survive a reload (a fresh import of save.js on
// the same storage), the old aylmer.modes best folds in without being touched,
// the faster ghost stays, the ghost budget evicts the least used, a full
// browser drops ghosts before it drops a slot, and a wipe takes both.
class FakeStorage {
  constructor(cap = Infinity) { this.m = new Map(); this.cap = cap; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    v = String(v);
    let used = 0;
    for (const [kk, vv] of this.m) if (kk !== k) used += kk.length + vv.length;
    if (used + k.length + v.length > this.cap) throw new Error('QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k) { this.m.delete(k); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
globalThis.localStorage = new FakeStorage();

let n = 0, bad = 0;
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('FAIL: ' + msg); } };
let reloads = 0;
const fresh = () => import('../src/game/save.js?reload=' + (++reloads));

let S = await fresh();

// ---- records
{
  const a = S.saveRecord('bz_vieux', 101.2, { by: 'tom', car: 'ranger' });
  ok(a.ok && a.isNew && a.prev === null && a.rank === 0, 'first record ' + JSON.stringify(a));
  const b = S.saveRecord('bz_vieux', 101.2, { by: 'sayyad' });
  ok(b.ok && !b.isNew && b.rank === 1, 'a tie is not a record, and goes after the older one');
  const c = S.saveRecord('bz_vieux', 99.9996, { by: 'Bob', car: 'nope' });
  ok(c.isNew && c.prev === 101.2 && c.record.t === 100 && c.record.by === '' && c.record.car === '', 'rounded to 1 ms, free text dropped ' + JSON.stringify(c.record));
  for (const t of [120, 130, 140]) S.saveRecord('bz_vieux', t);
  const r = S.loadRecord('bz_vieux');
  ok(r.top.length === S.RECORD_TOP && r.top[0].t === r.t && r.top.every((x, i) => i === 0 || r.top[i - 1].t <= x.t), 'top 5 sorted, best first');
  ok(S.saveRecord('bz_vieux', 200).rank === -1, 'a slow run misses the table');
  ok(S.saveRecord('bad id!', 1).reason === 'id' && S.saveRecord('x', NaN).reason === 'value' && S.saveRecord('x', -1).reason === 'value', 'bad id and value refused');
  ok(S.loadRecord('x') === null, 'nothing written on a refused call');
  S.saveRecord('tremplin:r1:air', 2.5, { better: 'higher' });
  const h = S.saveRecord('tremplin:r1:air', 3.1, { better: 'lower' });
  ok(h.isNew && h.record.better === 'higher', 'better cannot flip');
  S.saveRecord('stage:dep:2-2', 44.3, { by: 'tom' });
  const rows = S.listRecords('tremplin:');
  ok(rows.length === 1 && rows[0].id === 'tremplin:r1:air', 'listRecords by prefix');
}
// ---- records survive reload
{
  const before = JSON.stringify([S.loadRecord('bz_vieux'), S.loadRecord('stage:dep:2-2'), S.loadRecord('tremplin:r1:air')]);
  S = await fresh();
  const after = JSON.stringify([S.loadRecord('bz_vieux'), S.loadRecord('stage:dep:2-2'), S.loadRecord('tremplin:r1:air')]);
  ok(before === after && after.includes('44.3'), 'records survive a reload');
}
// ---- the old mode table
{
  localStorage.setItem('aylmer.modes', '{"cp_ruelles":95.2}');
  const raw = localStorage.getItem('aylmer.modes');
  const l = S.loadRecord('cp_ruelles');
  ok(l && l.t === 95.2 && l.legacy, 'legacy best folds in');
  const a = S.saveRecord('cp_ruelles', 99);
  ok(!a.isNew && a.record.t === 95.2 && a.record.top.length === 2, 'slower run keeps the legacy best');
  ok(S.saveRecord('cp_ruelles', 90).isNew, 'faster run beats it');
  ok(localStorage.getItem('aylmer.modes') === raw, 'aylmer.modes untouched');
}
// ---- a damaged record table
{
  localStorage.setItem('aylmer.records', '{bad');
  ok(S.loadRecord('bz_vieux') === null, 'damaged table reads as empty');
  ok(S.saveRecord('bz_hull', 400).ok && localStorage.getItem('aylmer.records.corrupt') === '{bad', 'damaged bytes kept before the write');
}
// ---- a 200 kB ghost
{
  const frames = new Float32Array(51200);
  let x = 5000, z = -2000;
  for (let i = 0; i < frames.length; i += 4) { x += Math.random() - 0.5; z += Math.random() - 0.5; frames.set([x, 1.2, z, i * 0.001], i); }
  const r = S.saveGhost('bz_vieux', { hz: 20, stride: 4, frames, t: 100, car: 'ranger', by: 'tom' });
  ok(r.ok, 'ghost saved ' + JSON.stringify(r));
  ok(localStorage.getItem('aylmer.ghost.bz_vieux').length <= 273068 + 1024, 'ghost size bound');
  S = await fresh();
  const g = S.loadGhost('bz_vieux');
  let same = g && g.frames.length === frames.length;
  for (let i = 0; same && i < frames.length; i++) if (!Object.is(g.frames[i], frames[i])) same = false;
  ok(same && g.hz === 20 && g.stride === 4 && g.t === 100 && g.car === 'ranger' && g.by === 'tom', 'a 200 kB ghost survives a reload exactly');
}
// ---- the faster ghost stays
{
  const f = new Float32Array([1, 2, 3, 4]);
  ok(S.saveGhost('cp_hull', { hz: 20, stride: 4, frames: f, t: 90 }).ok, 'ghost 90');
  ok(S.saveGhost('cp_hull', { hz: 20, stride: 4, frames: f, t: 95 }).reason === 'slower' && S.loadGhost('cp_hull').t === 90, 'slower ghost refused');
  ok(S.saveGhost('cp_hull', { hz: 20, stride: 4, frames: f, t: 95 }, { force: true }).ok && S.loadGhost('cp_hull').t === 95, 'force replaces');
  ok(S.saveGhost('crash', { hz: 20, stride: 4, frames: f, t: 10 }, { better: 'higher' }).ok
    && S.saveGhost('crash', { hz: 20, stride: 4, frames: f, t: 12 }, { better: 'higher' }).ok, 'higher-better ghost');
  ok(S.saveGhost('x', { hz: 20, stride: 3, frames: f, t: 1 }).reason === 'shape', 'bad stride is a shape error');
  ok(S.saveGhost('x', { hz: 20, stride: 4, frames: new Float32Array(70000), t: 1 }).reason === 'size', 'too big');
}
// ---- ghost budget
{
  for (const k of [...localStorage.m.keys()]) if (k.startsWith('aylmer.ghost')) localStorage.removeItem(k);
  const f = new Float32Array(30000);
  for (let i = 0; i < 12; i++) {
    ok(S.saveGhost('g' + i, { hz: 20, stride: 4, frames: f, t: 50 }).ok, 'budget ghost ' + i);
    if (i === 6) S.loadGhost('g0');            // g0 used recently: it survives
  }
  const st = S.ghostStats();
  ok(st.chars <= S.GHOST_BUDGET_CHARS && st.count <= S.GHOST_MAX_COUNT, 'budget held ' + JSON.stringify(st));
  ok(S.loadGhost('g0') && !S.loadGhost('g1'), 'least recently used goes first');
  const keys = [...localStorage.m.keys()].filter((k) => k.startsWith('aylmer.ghost.')).length;
  ok(keys === st.count, 'index matches storage');
}
// ---- a full browser: a slot write evicts ghosts, never the summer
{
  globalThis.localStorage = new FakeStorage(600000);
  S = await fresh();
  const f = new Float32Array(30000);
  const fails = [];
  S.onSaveFailure((e) => fails.push(e));
  for (let i = 0; i < 3; i++) S.saveGhost('f' + i, { hz: 20, stride: 4, frames: f, t: 50 });
  ok(S.ghostStats().count === 3, 'three ghosts fit');
  const r4 = S.saveGhost('f3', { hz: 20, stride: 4, frames: f, t: 50 });
  ok(r4.ok && S.ghostStats().count === 3 && !S.loadGhost('f0'), 'a fourth ghost evicts the oldest ' + JSON.stringify(r4));
  ok(fails.length === 0, 'no save-failed event for ghosts');
  const save = { name: 'x', character: 'tom', carId: 'ranger', parked: {}, health: {}, money: 10, progress: [], best: {},
    pad: 'p'.repeat(150000) };
  const w = S.writeSlot('tom.1', save);
  ok(w && S.ghostStats().count < 3, 'a slot write evicts ghosts to fit');
  ok(S.readSlot('tom.1') && S.readSlot('tom.1').name === 'x', 'and the slot reads back');
  const huge = { ...save, pad: 'p'.repeat(700000) };
  ok(S.writeSlot('tom.2', huge) === false && fails.some((e) => e.reason === 'quota'), 'no ghost left: the slot write reports quota');
}
// ---- wipe takes records and ghosts
{
  globalThis.localStorage = new FakeStorage();
  S = await fresh();
  S.saveRecord('bz_vieux', 100);
  S.saveGhost('bz_vieux', { hz: 20, stride: 4, frames: new Float32Array(8), t: 100 });
  const before = new Map(localStorage.m);
  S.deleteAllSaves();
  const left = [...localStorage.m.keys()].filter((k) => k.startsWith('aylmer.record') || k.startsWith('aylmer.ghost'));
  ok(left.length === 0, 'wipe took records and ghosts ' + left.join(','));
  ok(S.saveRecord('bz_vieux', 90).reason === 'wiped' && S.saveGhost('bz_vieux', { hz: 20, stride: 4, frames: new Float32Array(8), t: 90 }).reason === 'wiped', 'nothing written after a wipe');
  S.undoWipe();
  let same = true;
  for (const [k, v] of before) if (localStorage.getItem(k) !== v) same = false;
  ok(same, 'undoWipe restores them byte for byte');
  S.resumeSaving();
  ok(S.saveRecord('bz_vieux', 80).isNew, 'writes work after resumeSaving');
}

if (bad) { console.log(`${bad} of ${n} record checks failed`); process.exit(1); }
console.log(`ok  ${n} record and ghost assertions`);
