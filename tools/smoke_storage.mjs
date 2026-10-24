// Save, storage and reliability regressions — docs/review/save-reliability.md.
//
//   node tools/smoke_storage.mjs
//
// One block per finding, each one the audit's repro turned into assertions:
//   SR-03  the v1 -> v2 migration writes, verifies, then deletes; retries on failure
//   SR-01  ?review=<name> (and tools/ harness frames) isolate every key
//   SR-14  ?audioReview=1 isolates index.html too; the radio DB follows the flag
//   SR-02  the headless tools refuse to wipe a play origin
//   SR-04  a slot with no unlocks loads with the default garage
//   SR-08  the wipe clears every progress key and blocks the running game's autosave
//   SR-05  a newer build's slot is not overwritten; unknown fields survive a rewrite
//   SR-06  a corrupt slot is listed as damaged and put aside before a save over it
//   SR-07  a failed write is reported; persistence is requested once
//   SR-10  a mid-race save resumes at the grid, where the rivals are spawned
//   SR-11  blocked site data gives the prototype a session store, not a blank page
//   SR-12  a radio import during the first library read does not replace the library
//   SR-13  serve.sh binds to loopback

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

class FakeStorage {
  constructor() { this.m = new Map(); this.failSet = null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    if (this.failSet && this.failSet(k)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  keys() { return [...this.m.keys()]; }
}
const LS = new FakeStorage();
Object.defineProperty(globalThis, 'localStorage', { value: LS, configurable: true, writable: true });
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {} } }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };

// Before any save lands: persistence is asked for once per page, on the first.
let asked = 0;
Object.defineProperty(globalThis, 'navigator', { value: { storage: { persisted: async () => false, persist: async () => { asked++; return true; } } }, configurable: true, writable: true });

let pass = 0, fail = 0;
function ok(cond, what) { if (cond) pass++; else { fail++; console.log('  FAIL  ' + what); } }
function eq(a, b, what) {
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) console.log(`         got ${JSON.stringify(a)}  want ${JSON.stringify(b)}`);
  ok(same, what);
}
const group = (n) => console.log('\n' + n);

const save = await import('../src/game/save.js');
const store = await import('../src/game/store.js');
const ns = await import('../src/game/storage-ns.js');
const { Garage } = await import('../src/game/garage.js');
const reset = () => { LS.m.clear(); LS.failSet = null; save.resumeSaving(); };

// ---------------------------------------------------------------- SR-03
group('SR-03 migration: write, verify, then delete');
{
  reset();
  const v1 = JSON.stringify({ version: 1, name: 'Vieux', savedAt: '2026-08-01T00:00:00.000Z', carId: 'ranger', money: 90, progress: ['school', 'gang'] });
  LS.setItem('aylmer.save.1', v1);
  LS.setItem('aylmer.money', '300');
  // The audit's P1: every write of a new key fails.
  LS.failSet = (k) => k !== 'aylmer.save.1';
  const seen = [];
  const off = save.onSaveFailure((e) => seen.push(e.reason));
  save.migrateLegacy();
  off();
  eq(LS.getItem('aylmer.save.1'), v1, 'a failed migration keeps the v1 slot byte for byte');
  ok(LS.getItem('aylmer.save.migrated') === null, 'and does not stamp itself done');
  eq(LS.getItem('aylmer.money'), '300', 'and keeps the loose wallet the slot might need');
  ok(seen.includes('quota'), 'and the failure is reported');

  // Storage heals: the next boot retries and finishes.
  LS.failSet = null;
  const first = save.migrateLegacy();
  ok(first && first.name === 'Vieux', 'the next boot migrates it');
  eq(save.readSlot('tom.1').progress, ['school', 'gang'], 'the progress survives');
  ok(LS.getItem('aylmer.save.1') === null, 'the v1 key goes only after the v2 copy is verified');
  eq(LS.getItem('aylmer.save.migrated'), save.MIGRATION_STAMP, 'the stamp goes down once every slot made it');
  ok(LS.getItem('aylmer.money') === null, 'and only then is the wallet key deleted');

  // A write that "succeeds" but does not read back is a failure too.
  reset();
  LS.setItem('aylmer.save.2', v1);
  const real = LS.setItem.bind(LS);
  LS.setItem = (k, v) => real(k, k === 'aylmer.save.tom.2' ? '{"truncated' : v);
  save.migrateLegacy();
  LS.setItem = real;
  eq(LS.getItem('aylmer.save.2'), v1, 'a write that does not read back leaves the v1 slot alone');
  ok(LS.getItem('aylmer.save.migrated') === null, 'and leaves the stamp off');

  // A v2 slot already in the way: keep it, park the v1 copy, never overwrite.
  reset();
  save.writeSlot('tom.3', { ...save.newSave('nouveau'), money: 777 });
  LS.setItem('aylmer.save.3', v1);
  save.migrateLegacy();
  eq(save.readSlot('tom.3').money, 777, 'a v2 slot is not overwritten by a leftover v1 slot');
  eq(LS.getItem('aylmer.save.tom.3.v1'), v1, 'the v1 copy is parked beside it');
  ok(LS.getItem('aylmer.save.3') === null, 'and the v1 key is cleared once parked');

  // An unreadable v1 slot is set aside, not dropped.
  reset();
  LS.setItem('aylmer.save.auto', '{not json');
  save.migrateLegacy();
  eq(LS.getItem('aylmer.save.tom.auto.corrupt'), '{not json', 'an unreadable v1 slot is kept as .corrupt');
  eq(LS.getItem('aylmer.save.migrated'), save.MIGRATION_STAMP, 'and the migration still completes');

  // SR-16: legacy scratch keys go once the stamp is down.
  reset();
  LS.setItem('aylmer.progress', '["school"]');
  LS.setItem('aylmer.best', '{}');
  save.migrateLegacy();
  ok(save.readSlot('tom.auto') !== null, 'the pre-slot keys still become the autosave');
  ok(LS.getItem('aylmer.progress') === null && LS.getItem('aylmer.best') === null, 'and are deleted afterwards');
}

// ---------------------------------------------------------------- SR-04
group('SR-04 no unlocks means the default garage');
{
  reset();
  // v1 purchases lived in the global aylmer.cars: folded into the slot once.
  LS.setItem('aylmer.cars', JSON.stringify({ bought: ['cutlass'], seen: ['cutlass'] }));
  LS.setItem('aylmer.save.1', JSON.stringify({ version: 1, name: 'v1', carId: 'ranger' }));
  save.migrateLegacy();
  eq(save.readSlot('tom.1').unlocks.bought, ['cutlass'], 'a v1 slot inherits the v1 purchase record once');

  // The audit's probe: Mike buys, then a slot with no unlocks is loaded.
  reset();
  save.writeSlot('tom.2', { ...save.newSave('Ancienne partie'), unlocks: null });
  const loaded = save.readSlot('tom.2');
  eq(loaded.unlocks, save.defaultUnlocks(), 'a slot with no unlocks reads as the default garage, not null');
  const g = new Garage(new Set(), 'mike');
  g.bought.add('cutlass'); g.bought.add('benz');
  g.setCharacter('tom');
  // main.js enterDrive: `if (save && save.unlocks) garage.restore(save.unlocks)`
  if (loaded && loaded.unlocks) g.restore(loaded.unlocks);
  eq([...g.bought], [], 'Tom does not inherit Mike’s cars');
  ok(!g.has('benz'), 'and cannot drive Mike’s Benz');

  // The boot-time mirror belongs to one character.
  reset();
  const m = new Garage(new Set(), 'mike');
  m.bought.add('cutlass'); m.save();
  eq([...new Garage(new Set(), 'zahra').bought], [], 'a garage for Zahra ignores Mike’s mirror');
  eq([...new Garage(new Set(), 'mike').bought], ['cutlass'], 'Mike’s own garage still reads it');

  // A snapshot whose garage failed keeps what the slot already had.
  reset();
  save.writeSlot('tom.1', { ...save.newSave('x'), unlocks: { bought: ['caravan'], seen: [], mods: {}, feats: [] } });
  save.writeSlot('tom.1', { ...save.newSave('x'), unlocks: null });
  eq(save.readSlot('tom.1').unlocks.bought, ['caravan'], 'a save without a garage does not erase the slot’s purchases');
}

// ---------------------------------------------------------------- SR-08
group('SR-08 / SR-09 the wipe');
{
  reset();
  save.writeSlot('tom.1', save.newSave('a'));
  save.writeSlot('zahra.auto', save.newSave('b', 'zahra'));
  for (const k of store.PROGRESS_KEYS) LS.setItem(k, '{"x":1}');
  LS.setItem('aylmer.settings', '{"lang":"en"}');
  LS.setItem('aylmer.radio', '{"on":true}');
  LS.setItem('aylmer.save.migrated', '2');
  LS.setItem('aylmer.save.tom.2.corrupt', 'junk');
  save.deleteAllSaves();
  ok(!save.hasAnySave(), 'every slot is gone');
  for (const k of ['aylmer.cars', 'aylmer.hangout', 'aylmer.bestlap', 'aylmer.modes', 'aylmer.achievements']) {
    ok(LS.getItem(k) === null, `${k} is erased with the saves`);
  }
  ok(LS.getItem('aylmer.save.tom.2.corrupt') === null, 'and so are damaged copies');
  eq(LS.getItem('aylmer.settings'), '{"lang":"en"}', 'settings stay');
  eq(LS.getItem('aylmer.radio'), '{"on":true}', 'the radio stays');
  eq(LS.getItem('aylmer.save.migrated'), '2', 'the migration stamp stays (no re-migration)');

  // The running game behind the pause menu autosaves: nothing may land.
  const G = { character: 'tom', carId: 'ranger', veh: { x: 1, z: 2, yaw: 0, damage: 0 }, parked: {}, health: {}, done: new Set(['school']), best: {}, stats: {}, wallet: { value: 999 } };
  ok(save.saveToSlot(G, 'tom.auto', {}) === null, 'an autosave right after the wipe writes nothing');
  ok(!save.hasAnySave(), 'so the wiped summer does not come back');
  ok(save.isSavingBlocked(), 'saving stays blocked');
  new Garage(new Set(), 'tom').reset();         // what enterDrive does for a new game
  ok(!save.isSavingBlocked(), 'a new summer lifts the block');
  ok(save.saveToSlot(G, 'tom.auto', {}) !== null, 'and saves work again');

  // Undo, for the toast's lifetime.
  reset();
  save.writeSlot('tom.1', save.newSave('keep me'));
  LS.setItem('aylmer.hangout', '{"gifts":["x"]}');
  save.deleteAllSaves();
  ok(save.undoWipe(), 'undoWipe puts it back');
  eq(save.readSlot('tom.1').name, 'keep me', 'the slot is back');
  eq(LS.getItem('aylmer.hangout'), '{"gifts":["x"]}', 'the hangout record is back');
  ok(!save.isSavingBlocked(), 'and saving is allowed again');
}

// ---------------------------------------------------------------- SR-05
group('SR-05 newer builds are not downgraded');
{
  reset();
  const v3 = { version: 3, name: 'futur', carId: 'hovercraft', pets: ['chat'], parked: { hovercraft: { x: 1, z: 2, yaw: 0 } }, money: 50 };
  LS.setItem('aylmer.save.tom.1', JSON.stringify(v3));
  const row = save.listSlots('tom').find((r) => r.slot === 'tom.1');
  ok(row.newer === true && !row.empty, 'a newer build’s slot is listed, flagged newer');
  ok(save.readSlot('tom.1').newer === true, 'readSlot says so too');
  const seen = [];
  const off = save.onSaveFailure((e) => seen.push(e.reason));
  ok(save.writeSlot('tom.1', save.newSave('vieux')) === false, 'this build refuses to overwrite it');
  off();
  eq(JSON.parse(LS.getItem('aylmer.save.tom.1')), v3, 'the newer slot is byte-identical');
  ok(seen.includes('newer'), 'and the refusal is reported as "newer"');

  // A same-version slot with fields this build does not know keeps them.
  reset();
  LS.setItem('aylmer.save.tom.2', JSON.stringify({ ...save.newSave('b'), pets: ['chat'], parked: { hovercraft: { x: 5, z: 6, yaw: 1 } } }));
  const loaded = save.readSlot('tom.2');
  eq(loaded.pets, ['chat'], 'an unknown field survives a read');
  save.writeSlot('tom.2', { ...save.newSave('b2'), money: 12 });
  const raw = JSON.parse(LS.getItem('aylmer.save.tom.2'));
  eq(raw.pets, ['chat'], 'and a rewrite by this build');
  eq(raw.parked.hovercraft, { x: 5, z: 6, yaw: 1 }, 'a car this build does not have keeps its spot');
  eq([raw.money, raw.version], [12, save.SAVE_VERSION], 'our own fields are ours, stamped with our version');
}

// ---------------------------------------------------------------- SR-06
group('SR-06 a corrupt slot is damaged, not empty');
{
  reset();
  LS.setItem('aylmer.save.tom.3', '{not json');
  const row = save.listSlots('tom').find((r) => r.slot === 'tom.3');
  ok(!row.empty && row.corrupt, 'listed as damaged, not as an empty box');
  ok(/illisible/.test(row.name), 'and labelled « illisible »');
  ok(save.hasAnySave(), 'Charger stays enabled, so the damage can be seen');
  ok(save.continueSlot() === null, 'but Continuer never points at it');
  ok(save.writeSlot('tom.3', save.newSave('par-dessus')), 'saving into it still works');
  eq(LS.getItem('aylmer.save.tom.3.corrupt'), '{not json', 'after the damaged bytes are put aside');
  LS.setItem('aylmer.save.tom.1', '[]');
  ok(save.readSlot('tom.1') === null, 'an array is not a save');
  ok(save.listSlots('tom')[0].corrupt, 'and is shown as damaged');
  save.deleteSlot('tom.3');
  ok(LS.getItem('aylmer.save.tom.3.corrupt') === null, 'deleting the slot deletes its damaged copy');
}

// ---------------------------------------------------------------- SR-07
group('SR-07 failures are reported; persistence is asked for');
{
  reset();
  const heard = [];
  const off = save.onSaveFailure((e) => heard.push(e));
  LS.failSet = () => true;
  const G = { character: 'tom', carId: 'ranger', veh: { x: 1, z: 2, yaw: 0 }, parked: {}, health: {}, done: new Set(), best: {}, stats: {} };
  ok(save.saveToSlot(G, 'tom.auto', {}) === null, 'a failed autosave still returns null');
  eq(heard.map((e) => [e.slot, e.reason]), [['tom.auto', 'quota']], 'and the listener hears which slot and why');
  eq(save.lastSaveError().reason, 'quota', 'lastSaveError() remembers it');
  eq(save.storageHealth().ok, false, 'storageHealth() says the page cannot save');
  LS.failSet = null;
  ok(save.storageHealth().ok, 'and recovers when storage does');
  ok(save.saveToSlot(G, 'tom.auto', {}) !== null, 'a good write');
  save.saveToSlot(G, 'tom.auto', {});
  await new Promise((r) => setTimeout(r, 10));
  eq(asked, 1, 'navigator.storage.persist() was requested exactly once, however many saves landed');
  eq(save.persistenceState(), 'granted', 'and the answer is kept');
  off();
  // The DOM event, for main.js's toast.
  const events = [];
  globalThis.dispatchEvent = (ev) => { events.push(ev); return true; };
  LS.failSet = () => true;
  save.writeSlot('tom.1', save.newSave('x'));
  LS.failSet = null;
  delete globalThis.dispatchEvent;
  ok(events.length === 1 && events[0].type === 'aylmer:save-failed' && events[0].detail.reason === 'quota',
    'an aylmer:save-failed event is dispatched with { slot, reason }');
}

// ---------------------------------------------------------------- SR-10
group('SR-10 a mid-race save resumes at the grid');
{
  const { raceStages } = await import('../src/game/racejobs.js');
  const stages = raceStages({ cps: ['home'], start: 'home', text: 'go' }, { carName: 'Ranger' });
  const gi = stages.findIndex((s) => s.kind === 'grid'), ri = stages.findIndex((s) => s.kind === 'race');
  ok(gi >= 0 && ri > gi, 'a race job builds a grid stage before the race stage');
  const G = { mission: { def: { id: 'racedave' }, stages, idx: ri, timeLeft: 42, elapsed: 30, stageTime: 12, held: 1, laps: 2 }, veh: { passengers: 0 } };
  const snap = save.missionSnapshot(G);
  eq(snap.stage, gi, 'the snapshot points at the grid, whose onEnter spawns the rivals');
  eq(snap.timeLeft, null, 'the grid sets its own clock');
  ok(!('stageTime' in snap.state) && !('held' in snap.state), 'and the race stage’s per-stage timers are not replayed onto it');
  eq(snap.state.laps, 2, 'job-level scalars still come across');
  G.mission.idx = gi;
  eq(save.missionSnapshot(G).stage, gi, 'a save on the grid stays on the grid');
  const plain = { mission: { def: { id: 'x' }, stages: [{ kind: 'go' }, { kind: 'drop' }], idx: 1 }, veh: {} };
  eq(save.missionSnapshot(plain).stage, 1, 'a job with no grid resumes where it was');
  const hooked = { mission: { def: { id: 'y', resumeAt: () => 0 }, stages: [{}, {}, {}], idx: 2 }, veh: {} };
  eq(save.missionSnapshot(hooked).stage, 0, 'a def can say where it resumes (resumeAt)');
}

// ---------------------------------------------------------------- SR-01 / SR-14 / SR-11
group('SR-01 / SR-14 / SR-11 storage namespaces');
{
  eq(ns.reviewName('?review=first-drive'), 'first-drive', '?review=<name> names a namespace');
  eq(ns.reviewName('?review=1'), 'default', '?review=1 is the default namespace');
  eq(ns.reviewName('?audioReview=1'), 'audio', '?audioReview=1 is the audio namespace');
  eq(ns.reviewName('?life-check=17'), null, 'other flags are not a namespace');
  eq(ns.reviewName('?review=../../x'), 'default', 'a hostile name falls back to default');

  // install() under a fake page. The module keeps its answer on globalThis.
  const page = (search, framedBy = null) => {
    delete globalThis.AYLMER_STORAGE;
    const real = new FakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true, writable: true });
    globalThis.location = new URL('http://localhost:8123/index.html' + search);
    if (framedBy) globalThis.top = { location: new URL('http://localhost:8123' + framedBy) };
    else delete globalThis.top;
    return real;
  };
  const indexOpts = { base: '', reviewBase: 'aylmer.review.', audioPrefix: 'aylmer.review.audio.' };

  let real = page('');
  ns.installStorageNamespace(indexOpts);
  globalThis.localStorage.setItem('aylmer.save.tom.auto', 'player');
  eq(real.keys(), ['aylmer.save.tom.auto'], 'index.html with no flag writes the player’s raw keys');

  real = page('?review=first-drive');
  real.setItem('aylmer.save.tom.auto', 'PLAYER');
  ns.installStorageNamespace(indexOpts);
  const G = { character: 'tom', carId: 'ranger', veh: { x: 1, z: 2, yaw: 0 }, parked: {}, health: {}, done: new Set(['gang']), best: {}, stats: {} };
  save.resumeSaving();
  ok(save.saveToSlot(G, 'tom.auto', {}) !== null, 'a harness game autosaves');
  eq(real.getItem('aylmer.save.tom.auto'), 'PLAYER', 'and the player’s real autosave is byte-identical');
  ok(real.getItem('aylmer.review.first-drive.aylmer.save.tom.auto') !== null, 'the harness wrote its own namespace');
  ok(save.readSlot('tom.auto').progress.includes('gang'), 'and reads its own save back');
  globalThis.localStorage.setItem('aylmer.hangout', '{}');
  ok(real.getItem('aylmer.hangout') === null, 'every module’s keys are isolated, not only save.js’s');
  eq(globalThis.localStorage.length, 2, 'the view counts only its own keys');
  globalThis.localStorage.clear();
  eq(real.keys(), ['aylmer.save.tom.auto'], 'clear() on the view clears only the view');

  real = page('?audioReview=1');
  ns.installStorageNamespace(indexOpts);
  globalThis.localStorage.setItem('k', 'v');
  eq(real.keys(), ['aylmer.review.audio.k'], '?audioReview=1 isolates index.html as well');

  real = page('', '/tools/repair-review.html');
  ns.installStorageNamespace(indexOpts);
  globalThis.localStorage.setItem('k', 'v');
  eq(real.keys(), ['aylmer.review.harness.k'], 'a tools/ page that forgot the flag still gets its own namespace');

  real = page('', '/somewhere/else.html');
  ns.installStorageNamespace(indexOpts);
  globalThis.localStorage.setItem('k', 'v');
  eq(real.keys(), ['k'], 'framed by anything else: the normal keys');

  // SR-11: the getter throws (site data blocked).
  delete globalThis.AYLMER_STORAGE;
  globalThis.location = new URL('http://localhost:8123/prototype.html');
  delete globalThis.top;
  Object.defineProperty(globalThis, 'localStorage', { get() { const e = new Error('insecure'); e.name = 'SecurityError'; throw e; }, configurable: true });
  const info = ns.installStorageNamespace({ base: 'aylmer2004.prototype.', memoryFallback: true });
  ok(info.blocked && info.memory, 'blocked storage is detected and a session store is put in');
  globalThis.localStorage.setItem('visual-options', '{"dayMinutes":12}');
  eq(globalThis.localStorage.getItem('visual-options'), '{"dayMinutes":12}', 'the game still boots and reads its own session values');
  eq(save.storageHealth().ok, false, 'and storageHealth() says nothing is kept');
  const boot = readFileSync(join(ROOT, 'src/prototype/boot.js'), 'utf8');
  ok(!/^const realStorage\s*=\s*window\.localStorage/m.test(boot), 'boot.js no longer reads localStorage outside a try');
  ok(/storage-blocked/.test(boot), 'boot.js shows a readable message when storage is blocked');

  // The radio library DB follows the namespace.
  const rs = await import('../src/game/radio-storage.js');
  delete globalThis.AYLMER_STORAGE;
  globalThis.location = new URL('http://localhost:8123/tools/integration-radio-library.html');
  eq(rs.databaseName(), 'aylmer2004-local-radio-v1', 'no flag: the player’s library');
  globalThis.location = new URL('http://localhost:8123/x.html?audioReview=1');
  eq(rs.databaseName(), 'aylmer2004-local-radio-v1-review', '?audioReview=1: the review copy (unchanged name)');
  globalThis.location = new URL('http://localhost:8123/x.html?review=qa');
  eq(rs.databaseName(), 'aylmer2004-local-radio-v1-review-qa', '?review=qa: its own copy');
  delete globalThis.location;
  delete globalThis.AYLMER_STORAGE;
  Object.defineProperty(globalThis, 'localStorage', { value: LS, configurable: true, writable: true });

  // The pages themselves.
  for (const [f, name] of [['first-drive-check', 'first-drive'], ['life-check', 'life-check'], ['principale-check', 'principale-check'],
    ['fortier-check', 'fortier-check'], ['repair-review', 'repair-review']]) {
    const html = readFileSync(join(ROOT, 'tools', f + '.html'), 'utf8');
    const srcs = [...html.matchAll(/index\.html([^"']*)/g)].map((m) => m[1]);
    ok(srcs.length > 0 && srcs.every((q) => new URLSearchParams(q.replace(/^\?/, '')).get('review') === name),
      `tools/${f}.html loads the game under ?review=${name}`);
  }
  const radioPage = readFileSync(join(ROOT, 'tools/integration-radio-library.html'), 'utf8');
  ok(/location\.replace/.test(radioPage) && /has\('audioReview'\)/.test(radioPage),
    'the radio-library page reloads itself with ?audioReview=1 before touching IndexedDB');
  const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const a = index.indexOf('src/game/storage-boot.js'), b = index.indexOf('src/main.js');
  ok(a > 0 && a < b, 'index.html installs the namespace before main.js runs');
}

// ---------------------------------------------------------------- SR-02
group('SR-02 tools never wipe a play origin');
{
  const guard = await import('./storage_guard.mjs');
  let threw = null;
  try { guard.planStorage('http://localhost:8123/index.html', ['node', 'x', '--wipe-origin'], 'headless', {}); } catch (e) { threw = e; }
  ok(threw && /refusing/.test(threw.message), '--wipe-origin on the play port 8123 is refused');
  threw = null;
  try { guard.planStorage('http://localhost:8136/index.html', ['--wipe-origin'], 'headless', {}); } catch (e) { threw = e; }
  ok(threw, 'and on the handoff port 8136');
  ok(guard.planStorage('http://localhost:8140/index.html', ['--wipe-origin'], 'h', {}).wipeOrigin, 'a dedicated test port may be wiped');
  ok(guard.planStorage('http://localhost:8123/index.html', ['--wipe-origin', '--i-mean-it'], 'h', {}).wipeOrigin, '--i-mean-it overrides');
  ok(guard.planStorage('http://localhost:9000/index.html', ['--wipe-origin'], 'h', { AYLMER_TEST_PORTS: '9000' }).wipeOrigin, 'AYLMER_TEST_PORTS adds a test port');
  const p = guard.planStorage('http://localhost:8123/index.html?life-check=1', ['--fresh'], 'headless', {});
  ok(!p.wipeOrigin && p.name === 'headless' && /review=headless/.test(p.url) && /life-check=1/.test(p.url),
    'by default a tool runs the game in its own review namespace');
  eq(guard.planStorage('http://localhost:8123/index.html?review=qa', [], 'headless', {}).name, 'qa', 'an explicit review name is kept');
  const calls = [];
  await guard.prepareStorage(async (m, prm) => { calls.push([m, prm]); }, p, true);
  ok(!calls.some(([m]) => m === 'Storage.clearDataForOrigin'), 'fresh never clears the origin');
  ok(calls.some(([m]) => m === 'Page.addScriptToEvaluateOnNewDocument'), 'it empties the namespace before the page runs');
  // Run that script against a fake page: only the namespace goes.
  const fakeLS = new FakeStorage();
  for (const k of ['aylmer.save.tom.auto', 'aylmer.review.headless.aylmer.save.tom.auto', 'aylmer2004.review.headless.x', 'aylmer.review.other.k']) fakeLS.setItem(k, '1');
  const deleted = [];
  new Function('window', 'sessionStorage', 'indexedDB', guard.clearNamespaceScript('headless'))(
    { localStorage: fakeLS }, new FakeStorage(), { deleteDatabase: (n) => deleted.push(n) });
  eq(fakeLS.keys().sort(), ['aylmer.review.other.k', 'aylmer.save.tom.auto'], 'the namespace script removes its own keys only');
  eq(deleted, ['aylmer2004-local-radio-v1-review-headless'], 'and its own radio DB only');
  for (const f of ['measure_memory', 'shots_landmarks', 'shots_ottawa', 'headless']) {
    const src = readFileSync(join(ROOT, 'tools', f + '.mjs'), 'utf8');
    ok(!/send\('Storage\.clearDataForOrigin'|S\('Storage\.clearDataForOrigin'/.test(src) && /planStorage/.test(src),
      `tools/${f}.mjs clears storage only through storage_guard`);
  }
}

// ---------------------------------------------------------------- SR-12
group('SR-12 radio import during the first library read');
{
  const rs = await import('../src/game/radio-storage.js');
  rs._resetReadState();
  const DB = new Map();
  const PRIOR = [{ id: 'a', file: { name: 'a.mp3' } }, { id: 'b', file: { name: 'b.mp3' } }];
  DB.set('station-library-v1', PRIOR);
  const later = (fn, ms) => setTimeout(fn, ms);
  // A fake IndexedDB with a slow read, and transactions that complete only
  // after every request in them has.
  globalThis.indexedDB = { open() {
    const r = {}; later(() => { r.result = { close() {}, transaction() {
      const tx = {}; let open = 0;
      const done = () => { if (--open === 0) later(() => tx.oncomplete?.(), 0); };
      tx.objectStore = () => ({
        get(k) { open++; const q = {}; later(() => { q.result = DB.get(k); q.onsuccess?.(); done(); }, 60); return q; },
        put(v, k) { open++; const q = {}; later(() => { DB.set(k, v); q.onsuccess?.(); done(); }, 2); return q; },
      });
      return tx; } }; r.onsuccess?.(); }, 2); return r; } };
  const reading = rs.readLibrary();                         // the page mounts
  await new Promise((r) => setTimeout(r, 10));
  const wrote = rs.writeLibrary([{ id: 'new', file: { name: 'new.mp3' } }]);   // an import lands first
  const rows = await reading;
  await wrote;
  eq(DB.get('station-library-v1').map((r) => r.id), ['a', 'b', 'new'], 'the stored library keeps the old files and the new one');
  eq(rows.map((r) => r.id), ['a', 'b', 'new'], 'and the page’s list includes the import');
  await rs.writeLibrary([{ id: 'a', file: {} }]);
  eq(DB.get('station-library-v1').map((r) => r.id), ['a'], 'after the first read a write is the page’s list (Retirer still removes)');
  delete globalThis.indexedDB;
}

// ---------------------------------------------------------------- SR-13 / SR-15
group('SR-13 / SR-15 serving and deploy boundary');
{
  const sh = readFileSync(join(ROOT, 'serve.sh'), 'utf8');
  ok(/http\.server\s+"\$PORT"\s+--bind 127\.0\.0\.1/.test(sh), 'serve.sh binds to 127.0.0.1');
  const ignore = readFileSync(join(ROOT, '.assetsignore'), 'utf8').split('\n').map((l) => l.trim());
  for (const p of ['out/', '.openai/', 'assets/models/src/', '.claude/', '*.bat', 'spike-log.txt']) {
    ok(ignore.includes(p), `.assetsignore keeps ${p} out of the deploy`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
