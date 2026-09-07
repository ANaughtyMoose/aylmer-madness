// Save slots + options smoke test — plain node, hand-rolled DOM/localStorage.
//
//   node tools/smoke_save.mjs
//
// What it pins down, all of it stuff that is invisible until it is wrong:
//   1. a save round-trips every field, and the three slots are independent
//   1b. every character has their own three slots, and writing one of Tom's
//       cannot be seen from Zahra's
//   1c. a job in progress round-trips: id, stage, clock — and a job whose def
//       has been pulled out of the build loads as "no job" instead of throwing
//   2. the legacy aylmer.progress/money/best/garage keys migrate exactly once,
//      and so do the v1 slots (aylmer.save.1 -> aylmer.save.tom.1)
//   3. autosave writes the 'auto' slot and only on the allowed events
//   4. « Remettre les chars chez eux » puts every car on its owner's curb and
//      repairs it
//   5. options persist, clamp, and applySettings() reaches the renderer
//   6. the options panel relabels itself when the language changes
//   7. no window.confirm / window.alert anywhere in the source

// ---------------------------------------------------------------- stubs

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  keys() { return [...this.m.keys()]; }
  get length() { return this.m.size; }
}

const noopCtx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? null : () => undefined) });
function fakeElement(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(), width: 0, height: 0, style: {},
    className: '', innerHTML: '', textContent: '', dataset: {}, checked: false, value: '',
    children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    getContext: () => noopCtx,
    appendChild(c) { this.children.push(c); return c; },
    querySelector: () => null, querySelectorAll: () => [],
  };
  return el;
}
globalThis.localStorage = new FakeStorage();
globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => fakeElement(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
};
globalThis.devicePixelRatio = 1;

// ---------------------------------------------------------------- harness

let pass = 0, fail = 0;
const fails = [];
function ok(cond, what) {
  if (cond) { pass++; return; }
  fail++; fails.push(what);
  console.log('  FAIL  ' + what);
}
function eq(a, b, what) {
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) console.log(`         got ${JSON.stringify(a)}  want ${JSON.stringify(b)}`);
  ok(same, what);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function group(n) { console.log('\n' + n); }

// ---------------------------------------------------------------- imports

const save = await import('../src/game/save.js');
const store = await import('../src/game/store.js');
const options = await import('../src/game/options.js');
const { PLACES, resolvePlaces } = await import('../src/game/places.js');
const { CARS } = await import('../src/game/cars.js');
const { MAP } = await import('../src/game/mapdata.js');
const { t, setLang } = await import('../src/game/i18n.js');
const { slotsHTML, groupsHTML } = await import('../src/game/ui.js');
const money = await import('../src/game/money.js');
// The camera clamp is a count, not a constant: C has five stops since the
// driver's seat landed (BACKLOG C6), and this suite had 3 typed into it.
const { CAMS } = await import('../src/game/cockpit.js');

// Places have to be snapped before curbSpot() means anything — same fake world
// the other smoke tests use.
const fakeWorld = {
  nearestRoad(x, z) {
    let bd = Infinity, best = { x, z, yaw: 0, name: '' };
    for (const r of MAP.roads) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
        const tt = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const px = ax + ex * tt, pz = az + ez * tt;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name || '' }; }
      }
    }
    return best;
  },
};
resolvePlaces(fakeWorld);

// ---------------------------------------------------------------- 1. slots

group('save slots');
{
  localStorage.clear();
  eq(save.listSlots().map((r) => r.empty), [true, true, true, true], 'four empty slots to start');
  ok(save.mostRecentSlot() === null, 'nothing to continue');
  ok(save.readSlot('1') === null, 'an empty slot reads as null');

  const full = {
    version: 1,
    name: 'Chemin d’Aylmer',
    savedAt: '2026-08-25T18:30:00.000Z',
    playtime: 1234.5,
    carId: 'civic',
    parked: {
      ranger: { x: 10, z: -20, yaw: 0.5 },
      saturn: { x: 1, z: 2, yaw: 3 },
      civic: { x: -100.25, z: 55.75, yaw: -1.25 },
      sunfire: { x: 7, z: 8, yaw: 9 },
    },
    health: { ranger: 42, civic: 7 },
    money: 315,
    progress: ['school', 'gang'],
    best: { school: 88.25 },
    unlocks: { owned: ['civic'], cash: 3 },
    stats: { dist: 4321 },
    timeOfDay: 'dusk',
  };
  ok(save.writeSlot('2', full), 'slot 2 writes');
  const back = save.readSlot('2');
  for (const k of ['version', 'name', 'savedAt', 'playtime', 'carId', 'money', 'timeOfDay']) {
    eq(back[k], full[k], `round-trip: ${k}`);
  }
  // normalizeSave adds a home spot for every car the fixture left out, so compare the ones it set.
  for (const id of Object.keys(full.parked)) eq(back.parked[id], full.parked[id], `round-trip: parked ${id}`);
  eq(back.health, full.health, 'round-trip: per-car damage');
  eq(back.progress, full.progress, 'round-trip: jobs done');
  eq(back.best, full.best, 'round-trip: best times');
  eq(back.unlocks, full.unlocks, 'round-trip: unlocks (garage.serialize)');
  eq(back.stats, full.stats, 'round-trip: stats');
  eq(back.slot, 'tom.2', 'the slot knows its own name, character and all');

  // Independence.
  save.writeSlot('1', { ...full, name: 'un', money: 1, carId: 'ranger' });
  save.writeSlot('3', { ...full, name: 'trois', money: 3, carId: 'sunfire' });
  eq(save.readSlot('1').money, 1, 'slot 1 keeps its own money');
  eq(save.readSlot('2').money, 315, 'slot 2 is untouched by slot 1');
  eq(save.readSlot('3').carId, 'sunfire', 'slot 3 keeps its own car');
  eq([...new Set(save.listSlots().filter((r) => !r.empty).map((r) => r.slot))].sort(),
    ['tom.1', 'tom.2', 'tom.3'], 'three used slots, the autosave still empty');
  eq(localStorage.keys().filter((k) => k.startsWith('aylmer.save.')).sort(),
    ['aylmer.save.last', 'aylmer.save.tom.1', 'aylmer.save.tom.2', 'aylmer.save.tom.3'],
    'one localStorage key per slot, plus the last-used marker');

  save.deleteSlot('2');
  ok(save.readSlot('2') === null, 'delete removes a slot');
  ok(save.readSlot('1') !== null, '…and leaves the others alone');

  // Most recent wins « Continuer ».
  save.writeSlot('1', { ...full, savedAt: '2026-01-01T00:00:00.000Z' });
  save.writeSlot('3', { ...full, savedAt: '2026-07-01T00:00:00.000Z' });
  eq(save.mostRecentSlot(), 'tom.3', 'the newest slot of any kind is tom.3');
  // 2026-09-07: « Continuer » is the end of the last job you finished — the
  // autosave — whenever there is one, even if an F5 is newer.
  eq(save.continueSlot(), 'tom.3', 'with no autosave, Continuer falls back to the newest manual slot');
  save.writeSlot('auto', { ...full, savedAt: '2026-06-01T00:00:00.000Z', last: 'Poutine express' });
  eq(save.continueSlot(), 'tom.auto', 'with an autosave, Continuer takes it even though slot 3 is newer');
  eq(save.mostRecentAuto(), 'tom.auto', 'the newest autosave across characters');
  eq(save.listSlots().find((r) => r.slot === 'tom.auto').last, 'Poutine express', 'and it knows which job it came after');
  save.deleteSlot('auto');
  eq(save.continueSlot(), 'tom.3', 'delete the autosave and the fallback is back');

  // Garbage in, sane save out.
  localStorage.setItem('aylmer.save.tom.1', '{not json');
  ok(save.readSlot('1') === null, 'a corrupt slot reads as empty, it does not throw');
  save.writeSlot('1', { carId: 'nope', money: -5, parked: { junk: { x: 1 } }, progress: [1, 'school'] });
  const clean = save.readSlot('1');
  eq(clean.carId, 'ranger', 'an unknown car falls back to the Ranger');
  eq(clean.money, save.START_MONEY, 'a negative wallet falls back to $80');
  eq(clean.progress, ['school'], 'non-string mission ids are dropped');
  eq(Object.keys(clean.parked).sort(), CARS.map((c) => c.id).sort(),
    'every car has a position, even the ones the save never mentioned');

  save.deleteAllSaves();
  eq(save.listSlots().map((r) => r.empty), [true, true, true, true], 'wipe empties every slot');
  ok(!save.hasAnySave(), 'and hasAnySave says so');
}

// ------------------------------------------------------- 1b. per character

group('one summer each');
{
  localStorage.clear();
  eq(save.CHARACTER_IDS, ['tom', 'sayyad', 'zahra', 'mike', 'abraham'], 'five playable summers');
  eq(save.SLOTS.length, save.CHARACTER_IDS.length * 4, 'four slots each, and no shared ones');
  eq(save.qualifySlot('1'), 'tom.1', "a bare v1 slot id is Tom's");
  eq(save.qualifySlot('zahra.auto'), 'zahra.auto', 'a qualified id passes through');
  ok(save.qualifySlot('nobody.1') === null, 'an unknown character is not a slot');
  ok(save.qualifySlot('tom.9') === null, 'and neither is a fifth slot');

  // The whole point: Tom's summer and Zahra's do not touch.
  save.writeSlot('tom.1', { ...save.newSave('chez nous', 'tom'), money: 300, progress: ['school'] });
  save.writeSlot('zahra.1', { ...save.newSave('le parc', 'zahra'), money: 25 });
  eq(save.readSlot('tom.1').money, 300, "Tom's slot 1 keeps Tom's money");
  eq(save.readSlot('zahra.1').money, 25, "…and Zahra's keeps hers");
  eq(save.readSlot('tom.1').progress, ['school'], "Tom's job stays Tom's");
  eq(save.readSlot('zahra.1').progress, [], 'Zahra starts from the beginning');
  eq(save.readSlot('zahra.1').character, 'zahra', 'a slot knows whose it is');
  ok(save.readSlot('sayyad.1') === null, 'and nobody else has been given a save');
  eq(localStorage.keys().filter((k) => k.startsWith('aylmer.save.') && k !== 'aylmer.save.last').sort(),
    ['aylmer.save.tom.1', 'aylmer.save.zahra.1'], 'one key per character-slot');

  // Deleting one summer leaves the other alone.
  save.deleteSlot('tom.1');
  ok(save.readSlot('tom.1') === null, "Tom's slot is gone");
  eq(save.readSlot('zahra.1').money, 25, "…and Zahra's is not");
  ok(save.hasSaveFor('zahra') && !save.hasSaveFor('tom'), 'hasSaveFor knows which summers exist');
  ok(save.hasAnySave(), 'and hasAnySave still sees the one that does');

  // F5 belongs to the character you are playing. Switching to Zahra and
  // pressing it must not land on Tom's slot 3.
  save.writeSlot('tom.3', save.newSave('trois', 'tom'));
  eq(save.lastSlot(), 'tom.3', 'the last-used marker is qualified');
  eq(save.lastSlot('tom'), 'tom.3', "…and it is Tom's");
  ok(save.lastSlot('zahra') === null, 'Zahra has never used one, so F5 starts her own');

  // The load screen groups by character.
  const groups = save.listGroups();
  eq(groups.map((g) => g.character), save.CHARACTER_IDS, 'one block per character, in order');
  eq(groups.map((g) => g.used), [1, 0, 1, 0, 0], 'and each says how many slots it is using');
  ok(groups[0].name === 'Tom' && typeof groups[0].carName === 'string' && groups[0].carName.length > 3,
    'a block carries the name and the car to draw beside it');
  eq(save.listAllSlots().length, save.CHARACTER_IDS.length * 4, 'listAllSlots is every slot there is');

  save.deleteAllSaves();
  ok(!save.hasAnySave(), 'wiping the saves wipes every character');
}

// ------------------------------------------------------- 1c. the summer

group('the summer in the slot');
{
  localStorage.clear();
  const fresh = save.newSave('', 'tom');
  eq(fresh.day, 0, 'a new summer starts on day 0 (Saturday 26 June)');
  eq(fresh.fuel, null, 'with a tank nobody has metered yet');
  eq(fresh.target, save.DEFAULT_TARGET, 'and the envelope on the kitchen table');
  eq(fresh.target, 1200, '…which is $1,200');
  eq(fresh.summerOver, false, 'the summer has not ended');
  eq(fresh.reached, false, 'and the envelope has never been full');
  eq(fresh.mission, null, 'and no job on the go');
  eq(fresh.version, 2, 'a new save is v2');

  save.writeSlot('tom.1', { ...fresh, day: 40, fuel: 21.5, target: 900, money: 640 });
  const back = save.readSlot('tom.1');
  eq(back.day, 40, 'the day round-trips');
  save.writeSlot('mike.1', { ...save.newSave('', 'mike'), day: 12.4 });
  eq(save.readSlot('mike.1').day, 12.4,
    'a part-finished day round-trips too: the calendar counts in fractions');
  save.deleteSlot('mike.1');
  eq(back.fuel, 21.5, 'the litres in the tank round-trip');
  eq(back.target, 900, 'the envelope goal round-trips');
  eq(back.money, 640, 'and the money, which no longer lives anywhere else');
  save.writeSlot('sayyad.1', { ...save.newSave('', 'sayyad'), summerOver: true, reached: true });
  const done = save.readSlot('sayyad.1');
  eq([done.summerOver, done.reached], [true, true], 'the two ending flags round-trip');
  eq(save.readSlot('tom.1').summerOver, false, '…and stay in the summer they belong to');
  save.writeSlot('sayyad.2', { ...save.newSave('', 'sayyad'), summerOver: 'oui', reached: 1 });
  const coerced = save.readSlot('sayyad.2');
  eq([coerced.summerOver, coerced.reached], [false, false], 'anything but true is false');
  save.deleteSlot('sayyad.1'); save.deleteSlot('sayyad.2');

  // Clamps. A corrupt number must not put you on day 400 of a 73-day summer.
  save.writeSlot('tom.2', { ...fresh, day: 400, fuel: 9e9, target: 999999, character: 'nobody' });
  const hi = save.readSlot('tom.2');
  eq(hi.day, 72, 'the last day of the summer is Monday 6 September, index 72');
  eq(hi.fuel, save.FUEL_MAX, 'fuel clamps to something a bus could hold');
  eq(hi.target, save.TARGET_MAX, 'the envelope clamps high');
  eq(hi.character, 'tom', 'the slot says whose summer it is, not the blob');
  save.writeSlot('tom.3', { ...fresh, day: -5, fuel: -1, target: 0 });
  const lo = save.readSlot('tom.3');
  eq(lo.day, 0, 'and low');
  eq(lo.fuel, 0, 'an empty tank is 0 litres, not null');
  eq(lo.target, save.TARGET_MIN, 'the envelope clamps low');
  save.writeSlot('tom.auto', { ...fresh, day: 'lundi', fuel: 'plein', target: null });
  const junk = save.readSlot('tom.auto');
  eq([junk.day, junk.fuel, junk.target], [0, null, save.DEFAULT_TARGET], 'garbage falls back to a new summer');
  localStorage.clear();
}

// ------------------------------------------------------- 1d. the job

group('a job in progress');
{
  localStorage.clear();
  const G = fakeG();
  // The shape the mission runner actually holds: a def, the stages it built,
  // where it is, the clock — plus whatever the running stage is counting.
  G.mission = {
    def: { id: 'gang', title: 'Ramasser la gang' },
    stages: [{ text: 'un' }, { text: 'deux' }, { text: 'trois' }],
    idx: 1, timeLeft: 42.5, elapsed: 61.25, failed: false,
    styleStart: { stats: {}, damage: 0 },
    stageTime: 3.5, leakSaid: 40, cameIn: 'ranger',
    // Live objects the stage rebuilds for itself. None of these may be saved.
    donut: { meter: { tick() {} } }, legs: [{}, {}], couch: { flight: null },
  };
  G.veh.passengers = 2;

  const snap = save.saveToSlot(G, 'tom.1', { name: 'mid-job' });
  ok(snap.mission !== null, 'the slot carries the job');
  eq(snap.mission.id, 'gang', 'the def id');
  eq(snap.mission.stage, 1, 'the stage you were on');
  eq(snap.mission.timeLeft, 42.5, 'and the clock, to the tick');
  eq(snap.mission.elapsed, 61.25, 'and how long you had been at it');
  eq(snap.mission.passengers, 2, 'and who is in the truck');
  eq(snap.mission.state.stageTime, 3.5, 'live scalars the stage kept come along');
  eq(snap.mission.state.leakSaid, 40, '…all of them');
  eq(snap.mission.state.cameIn, 'ranger', '…strings too');
  ok(!('donut' in snap.mission.state) && !('legs' in snap.mission.state) && !('couch' in snap.mission.state),
    'meters, rivals and prop handles do not: onEnter rebuilds those');
  ok(!('def' in snap.mission.state) && !('stages' in snap.mission.state),
    'and neither does anything def.build() makes');

  const back = save.readSlot('tom.1');
  eq(back.mission.id, 'gang', 'the job id survives the round trip');
  eq(back.mission.stage, 1, '…the stage index');
  eq(back.mission.timeLeft, 42.5, '…and the timer');
  eq(back.mission.state.leakSaid, 40, '…and the stage state');

  // Every job in the build can be found again by the id a save writes down.
  const { ALL_MISSIONS } = await import('../src/game/missions.js');
  const resolve = (id) => ALL_MISSIONS.find((d) => d.id === id) || null;
  for (const d of ALL_MISSIONS) ok(resolve(d.id) === d, `« ${d.id} » resolves back to its def`);

  // A def pulled out of the build: the save loads, and it loads with no job.
  const H = fakeG();
  H.mission = { def: { id: 'job-effacee' }, stages: [{}], idx: 0, timeLeft: 10, elapsed: 1, styleStart: {} };
  save.saveToSlot(H, 'tom.2', {});
  const orphan = save.readSlot('tom.2');
  ok(orphan !== null, 'a slot naming a job that no longer exists still reads');
  eq(orphan.mission.id, 'job-effacee', 'it keeps the id it was given');
  ok(resolve(orphan.mission.id) === null, '…which resolves to nothing');
  // main.js is what acts on that, and it has to say so rather than crash.
  {
    const fs = await import('node:fs');
    const MAIN = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    ok(/function resumeMission/.test(MAIN), 'main.js has a resume path');
    ok(/Job reprise/.test(MAIN), '…which says « Job reprise » when it works');
    ok(/Job perdue/.test(MAIN), '…and « Job perdue » when the def is gone');
    ok(!/la job en cours est pas sauvegard/.test(MAIN),
      'the old « pas sauvegardée » warning is gone, because it is saved now');
  }

  // Nothing running, nothing written.
  eq(save.missionSnapshot(fakeG()), null, 'free roam saves no job');
  eq(save.missionSnapshot({ mission: { def: null, stages: [] } }), null, 'and neither does a half-built one');
  save.deleteAllSaves();
  localStorage.clear();
}

// ---------------------------------------------------------------- 2. migration

group('legacy migration');
{
  localStorage.clear();
  localStorage.setItem('aylmer.progress', JSON.stringify(['school', 'gang']));
  localStorage.setItem('aylmer.money', '245');
  localStorage.setItem('aylmer.best', JSON.stringify({ school: 91.5 }));
  localStorage.setItem('aylmer.garage', JSON.stringify({
    carId: 'civic',
    parked: { ranger: { x: 5, z: 6, yaw: 0.25 } },
    health: { ranger: 30 },
  }));

  const first = save.migrateLegacy();
  ok(first !== null, 'the migration runs when there is an old game and no slot');
  const auto = save.readSlot('auto');
  eq(auto.carId, 'civic', 'the car you were in comes across');
  eq(auto.money, 245, 'the wallet comes across');
  eq(auto.progress.sort(), ['gang', 'school'], 'the jobs come across');
  eq(auto.best, { school: 91.5 }, 'the records come across');
  eq(auto.parked.ranger, { x: 5, z: 6, yaw: 0.25 }, 'the parked cars come across');
  eq(auto.health.ranger, 30, 'the damage comes across');

  // Run it again: it must not touch anything.
  localStorage.setItem('aylmer.money', '999');
  const second = save.migrateLegacy();
  ok(second === null, 'the migration is a one-shot');
  eq(save.readSlot('auto').money, 245, 'a second run does not re-read the legacy keys');

  // A player with slots already never gets migrated over.
  localStorage.clear();
  save.writeSlot('1', save.newSave('mine'));
  localStorage.setItem('aylmer.money', '999');
  ok(save.migrateLegacy() === null, 'an existing slot blocks the migration');
  ok(save.readSlot('auto') === null, 'and nothing is written to the autosave');

  // A brand new player: nothing to migrate, nothing written.
  localStorage.clear();
  ok(save.migrateLegacy() === null, 'a fresh browser has nothing to migrate');
  eq(localStorage.keys().filter((k) => k.startsWith('aylmer.save.') && k !== 'aylmer.save.migrated'), [],
    'and no slot is created');
}

group('v1 slots become Tom\u2019s');
{
  // Exactly what a player who has been on the old build has in the browser:
  // three unqualified slots, the migration already stamped '1', and the
  // wallet's own private key holding the number that was on screen.
  localStorage.clear();
  localStorage.setItem('aylmer.save.migrated', '1');
  localStorage.setItem('aylmer.save.last', '1');
  localStorage.setItem('aylmer.money', '512');
  localStorage.setItem('aylmer.save.1', JSON.stringify({
    version: 1, name: 'Rue Principale', savedAt: '2026-08-25T14:05:00.000Z', playtime: 900,
    carId: 'civic', parked: { civic: { x: 3, z: 4, yaw: 0.5 } }, health: { civic: 20 },
    money: 275, progress: ['school'], best: { school: 88 }, unlocks: { owned: ['civic'] },
    stats: { dist: 12 }, timeOfDay: 'dusk',
  }));
  // A v1 slot written before money was in the shape at all.
  localStorage.setItem('aylmer.save.auto', JSON.stringify({
    version: 1, name: 'auto', savedAt: '2026-08-24T14:05:00.000Z', carId: 'ranger',
  }));

  const first = save.migrateLegacy();
  ok(first !== null, 'the v1 slots migrate even though the old stamp said done');
  const one = save.readSlot('tom.1');
  ok(one !== null, 'slot 1 is now Tom\u2019s slot 1');
  eq(one.version, 2, 'and it is v2');
  eq(one.character, 'tom', 'the summer belongs to Tom, because that is whose it was');
  eq(one.name, 'Rue Principale', 'the name comes across');
  eq(one.money, 275, 'the money it stored comes across');
  eq(one.carId, 'civic', 'the car comes across');
  eq(one.progress, ['school'], 'the jobs come across');
  eq(one.best, { school: 88 }, 'the records come across');
  eq(one.unlocks, { owned: ['civic'] }, 'the unlocks come across');
  eq(one.parked.civic, { x: 3, z: 4, yaw: 0.5 }, 'the parked cars come across');
  eq(one.timeOfDay, 'dusk', 'the time of day comes across');
  eq(one.day, 0, 'a migrated summer starts on day 0');
  eq(one.fuel, null, 'with a tank nobody has metered');
  eq(one.target, 1200, 'and the $1,200 envelope');
  eq([one.summerOver, one.reached], [false, false], 'the ending has not played for a v1 save');
  eq(one.mission, null, 'and no job in progress, because v1 never kept one');
  eq(save.readSlot('tom.auto').money, 512,
    'a v1 slot with no money of its own takes the wallet\u2019s old private key');
  eq(save.lastSlot(), 'tom.1', 'the F5 marker is requalified');
  ok(localStorage.getItem('aylmer.save.1') === null, 'the old key is gone, not duplicated');
  ok(localStorage.getItem('aylmer.money') === null, 'and so is aylmer.money, for good');
  eq(localStorage.keys().filter((k) => k.startsWith('aylmer.save.')).sort(),
    ['aylmer.save.last', 'aylmer.save.migrated', 'aylmer.save.tom.1', 'aylmer.save.tom.auto'],
    'two slots, the marker and the stamp');

  // Nobody else has been given a summer by the migration.
  for (const c of ['sayyad', 'zahra', 'mike', 'abraham']) {
    ok(!save.hasSaveFor(c), `${c} still starts from the beginning`);
  }

  localStorage.setItem('aylmer.money', '999');
  ok(save.migrateLegacy() === null, 'the v2 migration is a one-shot too');
  eq(save.readSlot('tom.1').money, 275, 'and a second run changes nothing');
  localStorage.clear();
}

group('the wallet lives in the save');
{
  localStorage.clear();
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/game/money.js', import.meta.url), 'utf8')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  ok(!/localStorage/.test(src), 'money.js touches no storage of its own');
  ok(!/aylmer\.money/.test(src), '…and does not know the old key exists');

  const w = new money.Wallet(null);
  eq(w.value, money.START, 'a wallet starts at $80 until a slot says otherwise');
  const seen = [];
  w.onChange = (v, d) => seen.push([v, d]);
  w.add(40);
  eq(w.value, 120, 'add() adds');
  w.spend(20);
  eq(w.value, 100, 'spend() spends');
  ok(w.spend(500) === false && w.value === 100, 'and refuses what you cannot afford');
  w.set(410);
  eq(w.value, 410, 'set() is how a load puts the slot\u2019s money in');
  eq(seen, [[120, 40], [100, -20], [410, 310]], 'onChange fires with the value and the delta');
  w.set(-5);
  eq(w.value, 0, 'the wallet never goes negative');
  eq(localStorage.keys(), [], 'and none of that wrote a single key');

  // A listener that throws must not eat a payout.
  const bad = new money.Wallet(null, () => { throw new Error('boom'); });
  bad.add(50);
  eq(bad.value, money.START + 50, 'a throwing onChange does not lose the money');
}

// ---------------------------------------------------------------- 3. the game

// A stand-in for G: everything save.js and options.js are allowed to touch.
function fakeG(over = {}) {
  const veh = {
    x: 0, z: 0, yaw: 0, damage: 0, spec: { id: 'ranger' }, assist: true,
    reset(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; },
    repair() { this.damage = 0; this.repaired = (this.repaired || 0) + 1; },
  };
  return {
    mode: 'drive', carId: 'ranger', veh,
    parked: {}, health: {}, done: new Set(), best: {}, money: 80,
    playtime: 0, stats: { dist: 0 }, envKey: 'day', slot: null,
    character: 'tom', day: 0, fuel: null, target: save.DEFAULT_TARGET,
    summerOver: false, reached: false, mission: null,
    wallet: { value: 80, render() {} },
    settings: store.loadSettings(),
    mapPrefs: store.loadMapPrefs(),
    renderer: { scale: 1, maxDpr: 1, resizes: 0, resize() { this.resizes++; } },
    hud: { size: 0, visible: true, setSize(px) { this.size = px; }, setVisible(v) { this.visible = v; } },
    audio: { enabled: true, master: 1, setMaster(v) { this.master = v; } },
    ...over,
  };
}

// The same thing main.js's resetCarLocations() does, against the same helpers.
function resetCars(G) {
  const home = save.homeParked();
  G.parked = {};
  for (const c of CARS) {
    if (G.veh && c.id === G.veh.spec.id) continue;
    G.parked[c.id] = { ...home[c.id] };
  }
  G.health = {};
  if (G.veh) {
    const h = home[G.veh.spec.id];
    G.veh.reset(h.x, h.z, h.yaw);
    G.veh.repair();
  }
  return G.parked;
}

group('snapshot / restore');
{
  localStorage.clear();
  const G = fakeG();
  G.veh.x = 111.5; G.veh.z = -222.25; G.veh.yaw = 1.5; G.veh.damage = 33;
  G.parked = { civic: { x: 1, z: 2, yaw: 3 } };
  G.health = { civic: 12 };
  G.done = new Set(['school']);
  G.best = { school: 77.5 };
  G.wallet.value = 410;
  G.playtime = 600;
  G.envKey = 'night';
  G.stats = { dist: 999 };
  G.garage = { serialize: () => ({ owned: ['ranger', 'civic'] }) };

  const snap = save.saveToSlot(G, '2', { name: 'test' });
  ok(snap !== null, 'saveToSlot writes');
  const back = save.readSlot('2');
  eq(back.parked.ranger, { x: 111.5, z: -222.25, yaw: 1.5 }, 'the car you are driving is in `parked`');
  eq(back.parked.civic, { x: 1, z: 2, yaw: 3 }, 'so are the ones you are not');
  eq(back.health.ranger, 33, 'your damage is saved');
  eq(back.money, 410, 'your money is saved');
  eq(back.progress, ['school'], 'your jobs are saved');
  eq(back.best, { school: 77.5 }, 'your records are saved');
  eq(back.playtime, 600, 'your playtime is saved');
  eq(back.timeOfDay, 'night', 'the time of day is saved');
  eq(back.unlocks, { owned: ['ranger', 'civic'] }, 'garage.serialize() is picked up when it exists');
  ok(typeof back.savedAt === 'string' && !isNaN(Date.parse(back.savedAt)), 'savedAt is an ISO date');

  // Restore, the way enterDrive does.
  const H = fakeG();
  H.carId = back.carId;
  const home = save.homeParked();
  H.parked = {};
  for (const c of CARS) if (c.id !== back.carId) H.parked[c.id] = { ...(back.parked[c.id] || home[c.id]) };
  const start = back.parked[back.carId];
  H.veh.reset(start.x, start.z, start.yaw);
  eq([H.veh.x, H.veh.z, H.veh.yaw], [111.5, -222.25, 1.5], 'loading puts you back where you saved');
  eq(H.parked.civic, { x: 1, z: 2, yaw: 3 }, 'and the other cars where you left them');
  ok(!('ranger' in H.parked), 'the car you are in is not also parked next to you');

  // A save with no garage module still saves.
  const noGarage = save.saveToSlot(fakeG(), '3', {});
  eq(noGarage.unlocks, null, 'no garage module means unlocks: null, not a crash');
}

group('autosave');
{
  localStorage.clear();
  const G = fakeG();
  // main.js's autosave(), verbatim in shape.
  const autosave = (reason) => {
    if (!G.settings.autosave || !G.veh || G.mode === 'menu') return null;
    return save.saveToSlot(G, `${G.character}.auto`, { name: 'auto ' + reason });
  };

  ok(G.settings.autosave === true, 'autosave is on out of the box');
  ok(autosave('job') !== null, 'a finished job writes the autosave');
  eq(save.listSlots().filter((r) => !r.empty).map((r) => r.slot), ['tom.auto'],
    'autosave writes the auto slot and only the auto slot');
  ok(save.lastSlot() === null, 'and it does not become the F5 slot');

  G.settings = { ...G.settings, autosave: false };
  save.deleteAllSaves();
  ok(autosave('job') === null, 'autosave off means nothing is written');
  ok(autosave('unlock') === null, 'not on a purchase either');
  eq(save.listSlots().map((r) => r.empty), [true, true, true, true], 'still four empty slots');

  // Nothing else writes: drive around, pause, swap cars — the slots stay empty.
  G.settings = { ...G.settings, autosave: true };
  save.deleteAllSaves();
  G.mode = 'paused';
  G.veh.x += 500;
  G.parked.civic = { x: 9, z: 9, yaw: 0 };
  eq(save.listSlots().map((r) => r.empty), [true, true, true, true],
    'moving cars around never writes a save by itself');

  // F5 semantics: the last used slot, never the autosave.
  save.writeSlot('3', save.newSave('trois'));
  eq(save.lastSlot(), 'tom.3', 'writing a numbered slot marks it as last used');
  save.saveToSlot(G, 'auto', {});
  eq(save.lastSlot(), 'tom.3', 'the autosave does not steal the F5 slot');

  // The autosave belongs to whoever is playing. A bare 'auto' means Tom's, so
  // an autosave that forgets to qualify quietly overwrites his summer.
  save.deleteAllSaves();
  const Z = fakeG({ character: 'zahra' });
  Z.settings = { ...Z.settings, autosave: true };
  save.saveToSlot(Z, `${Z.character}.auto`, {});
  ok(save.readSlot('zahra.auto') !== null, "Zahra's autosave is Zahra's");
  ok(save.readSlot('tom.auto') === null, '…and Tom keeps his');
  {
    const fs = await import('node:fs');
    const MAIN = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    ok(/saveToSlot\(G, `\$\{G\.character\}\.auto`/.test(MAIN),
      'main.js qualifies the autosave slot with the character');
  }
  save.deleteAllSaves();
}

group('reset car locations');
{
  const G = fakeG();
  G.veh.x = 5000; G.veh.z = 5000; G.veh.damage = 88;
  G.health = { civic: 90, sunfire: 40 };
  G.parked = { civic: { x: 1, z: 1, yaw: 0 }, saturn: { x: 2, z: 2, yaw: 0 }, sunfire: { x: 3, z: 3, yaw: 0 } };
  const home = save.homeParked();

  resetCars(G);
  for (const c of CARS) {
    const want = home[c.id];
    if (c.id === G.veh.spec.id) {
      ok(near(G.veh.x, want.x, 1e-9) && near(G.veh.z, want.z, 1e-9),
        `the car you are driving (${c.id}) goes home`);
    } else {
      eq(G.parked[c.id], want, `${c.id} goes back to its owner's curb slot`);
    }
  }
  eq(G.health, {}, 'every car is repaired');
  eq(G.veh.damage, 0, 'including the one you are in');
  ok(G.veh.repaired === 1, 'and it is actually repaired, not just zeroed');

  // The curb slots are the real thing: at the owner's address, spaced apart.
  const owners = save.OWNER;
  for (const c of CARS) {
    const p = PLACES[owners[c.id]];
    const d = Math.hypot(home[c.id].x - p.x, home[c.id].z - p.z);
    // Six cars can share the driveway at 299 Fraser; slots run 6.5 m apart along the kerb.
    ok(d < 40, `${c.id} is parked at ${owners[c.id]} (${d.toFixed(1)} m from the marker)`);
  }
  const dHome = Math.hypot(home.ranger.x - home.saturn.x, home.ranger.z - home.saturn.z);
  ok(dHome > 5, 'two cars in the same driveway do not sit on top of each other');
  eq(Object.keys(save.homeParked()).sort(), CARS.map((c) => c.id).sort(), 'every car has a home');

  // A new game starts from exactly those spots.
  const fresh = save.newSave();
  eq(fresh.money, save.START_MONEY, 'a new game starts with $80');
  eq(fresh.progress, [], 'and nothing done');
  for (const c of CARS) eq(fresh.parked[c.id], home[c.id], `a new game has ${c.id} at home`);
}

// ---------------------------------------------------------------- 4. options

group('options');
{
  localStorage.clear();
  eq(store.loadSettings(), store.DEFAULT_SETTINGS, 'settings default');

  const s = store.saveSettings({
    ...store.DEFAULT_SETTINGS,
    volMaster: 0.4, volEngine: 0.25, volEffects: 0.9, volRadio: 0.1,
    quality: 'high', renderScale: 0.7, maxDpr: 2, drawDist: 1100, fogMul: 1.8,
    fov: 0.12, cam: 2, mapSize: 1, showHud: false, showLegend: false, showFps: true,
    steerSens: 1.35, assist: false, invertLook: true, rumble: false,
    lang: 'fr', autosave: false, difficulty: 'hard',
  });
  eq(store.loadSettings(), s, 'every option round-trips through localStorage');

  const bad = store.saveSettings({
    volMaster: 9, renderScale: 0.1, maxDpr: 3, drawDist: 99999, fogMul: -4,
    fov: 5, steerSens: 99, cam: 12, mapSize: 7, quality: 'ultra', lang: 'xx', difficulty: 'insane',
  });
  eq(bad.volMaster, 1, 'volume clamps to 100 %');
  eq(bad.renderScale, 0.5, 'render scale clamps to 50 %');
  eq(bad.maxDpr, store.DEFAULT_SETTINGS.maxDpr, 'an impossible DPR falls back');
  eq(bad.drawDist, 1200, 'draw distance clamps to 1200 m');
  eq(bad.fogMul, 0.5, 'fog thickness clamps to 0.5x');
  eq(bad.fov, 0.2, 'FOV clamps high');
  eq(bad.steerSens, 1.6, 'steering sensitivity clamps high');
  eq(bad.cam, CAMS.length - 1, `the camera index clamps to the last camera (${CAMS.length - 1})`);
  eq(bad.mapSize, store.MAP_SIZES.length - 1, 'minimap size clamps');
  eq(bad.quality, 'med', 'an unknown preset falls back to medium');
  eq(bad.lang, 'fr', 'an unknown language stores as French');
  eq(bad.difficulty, 'normal', 'an unknown difficulty falls back');

  localStorage.setItem('aylmer.settings', '{not json');
  eq(store.loadSettings(), store.DEFAULT_SETTINGS, 'corrupt settings fall back to the defaults');
}

group('applySettings');
{
  localStorage.clear();
  const G = fakeG();
  const want = store.saveSettings({
    ...store.DEFAULT_SETTINGS,
    quality: 'low', renderScale: 0.6, maxDpr: 1, drawDist: 460, fogMul: 1.9,
    mapSize: 1, showHud: false, volMaster: 0.25, assist: false, difficulty: 'hard', cam: 3,
  });
  const { langChanged } = options.applySettings(G, want);

  ok(!langChanged, 'no language change reported when the language did not change');
  eq(G.renderer.scale, 0.6, 'render scale reaches the renderer');
  eq(G.renderer.maxDpr, 1, 'max DPR reaches the renderer');
  ok(G.renderer.resizes === 1, 'the renderer is resized once, right away');
  eq(G.q.drawDist, 460, 'draw distance is what the frame loop will read');
  eq(G.q.fogMul, 1.9, 'fog thickness likewise');
  eq(G.q.traffic, options.QUALITY.low.traffic, 'the preset still owns the traffic count');
  eq(G.q.fov, options.QUALITY.low.fov, 'and the base FOV');
  eq(G.quality, 'low', 'G.quality follows the preset');
  eq(G.hud.size, store.MAP_SIZES[1], 'the minimap gets the size from the options');
  eq(G.hud.visible, false, 'the HUD can be turned off');
  eq(G.audio.master, 0.25, 'master volume reaches the audio module');
  eq(G.assist, false, 'the assist toggle reaches the physics');
  eq(G.veh.assist, false, '…and the car you are in');
  eq(G.difficulty, 'hard', 'difficulty is handed to whoever wants it');
  eq(G.cam, 3, 'the default camera is applied');

  // Muting takes the mixer to zero without forgetting the slider position.
  options.applySettings(G, { ...want, audio: false });
  eq(G.audio.master, 0, 'mute takes the master gain to zero');
  eq(G.audio.enabled, false, 'and flips audio.enabled for the one-shots');
  options.applySettings(G, { ...want, audio: true });
  eq(G.audio.master, 0.25, 'un-muting restores the volume you set');

  // A richer mixer wins over the fallback when one turns up (the PROGRESS agent).
  const H = fakeG({ audio: { enabled: true, got: null, setVolume(v) { this.got = v; }, setMaster() { throw new Error('should not be called'); } } });
  H.radio = { vol: null, setVolume(v) { this.vol = v; } };
  options.applySettings(H, { ...store.DEFAULT_SETTINGS, volMaster: 0.5, volEngine: 0.3, volEffects: 0.2, volRadio: 0.9 });
  eq(H.audio.got, { master: 0.5, engine: 0.3, effects: 0.2, radio: 0.9 }, 'audio.setVolume is preferred when it exists');
  eq(H.radio.vol, 0.9, 'radio.setVolume gets the radio slider');

  // The preset re-seeds the numbers it owns.
  const pre = options.presetSettings(store.DEFAULT_SETTINGS, 'high');
  eq(pre.renderScale, options.QUALITY.high.scale, 'picking High re-seeds the render scale');
  eq(pre.drawDist, options.QUALITY.high.drawDist, '…and the draw distance');
  eq(pre.fogMul, options.QUALITY.high.fogMul, '…and the fog');
  eq(pre.maxDpr, options.QUALITY.high.dpr, '…and the DPR cap');

  // No DOM at all: the smoke harness has no elements and nothing may throw.
  let threw = null;
  try { options.applySettings({ settings: store.DEFAULT_SETTINGS }, store.DEFAULT_SETTINGS); } catch (e) { threw = e; }
  ok(!threw, 'applySettings survives a bare G with no renderer, hud or audio');
}

group('the panel');
{
  localStorage.clear();
  setLang('fr');
  const s = store.loadSettings();
  const fr = options.optionsHTML(s);
  ok(fr.includes(t('opt.volMaster')), 'the audio section is labelled in French');
  ok(fr.includes('id="o_drawDist"'), 'there is a draw-distance control');
  ok(fr.includes('id="o_volRadio"'), 'there is a radio volume control');
  ok(fr.includes('data-act="resetCars"'), 'Remettre les chars chez eux is in Gameplay');
  ok(fr.includes('data-act="wipeSaves"') && fr.includes('data-confirm="1"'),
    'wiping the saves asks twice, inside the panel');
  ok(fr.includes('type="range"') && fr.includes('type="checkbox"') && fr.includes('<select'),
    'sliders, toggles and selects all present');
  ok(fr.includes('720 m'), 'the draw-distance slider shows its value in metres');
  ok(/id="o_renderScale"[^>]*value="0.85"/.test(fr), 'the render-scale slider starts where the setting is');
  ok(fr.includes('kbd'), 'the read-only key list is in the Controls section');
  for (const sec of ['opt.audio', 'opt.video', 'opt.controls', 'opt.gameplay']) {
    ok(fr.includes(t(sec)), `section ${sec} is drawn`);
  }

  // 2026-09-07: the English copy exists now (the photocopy), so the panel
  // follows the language and carries the selector that undoes it.
  setLang('en');
  const nowEn = options.optionsHTML(s);
  ok(!nowEn.includes('Volume général') && nowEn.includes('Volume master'), 'the panel follows the language');
  ok(nowEn.includes('Send all the chars at their house'), 'the reset action too, badly');
  ok(nowEn.includes('id="o_lang"'), 'there is a language selector');
  setLang('fr');
  ok(options.optionsHTML(s).includes('Volume général'), 'and French comes back');

  // Only some sections.
  const audioOnly = options.optionsHTML(s, { only: ['audio'] });
  ok(audioOnly.includes('id="o_volMaster"') && !audioOnly.includes('id="o_drawDist"'),
    'a subset of sections can be drawn on its own');
}

group('the slot list');
{
  localStorage.clear();
  save.writeSlot('1', {
    ...save.newSave('Rue Principale'), money: 250, carId: 'civic',
    progress: ['school'], playtime: 3720, savedAt: '2026-08-25T14:05:00.000Z',
  });
  const rows = save.listSlots();
  const html = slotsHTML(rows, 'save');
  ok(html.includes('Rue Principale'), 'the slot list shows the save name');
  ok(html.includes('$250'), 'and the money');
  ok(html.includes('1988 Honda Civic Si'), 'and the car');
  ok(html.includes('1 ' + t('save.jobs')), 'and how many jobs are done');
  ok(html.includes(save.fmtPlaytime(3720)), 'and the playtime');
  ok(html.includes('25/08/2026'), 'and when it was saved');
  ok(html.includes('data-slot="tom.1"') && html.includes('data-slot="tom.auto"'), 'three slots plus the autosave');
  ok((html.match(/class="saveslot"/g) || []).length === 3, 'you can write into 1/2/3 but not the autosave');
  ok(html.includes(t('save.empty')), 'empty slots say so');
  const load = slotsHTML(rows, 'load');
  ok(!load.includes('saveslot'), 'the load screen cannot write');
  ok(load.includes('delslot'), 'but it can delete');
  ok(html.includes(t('save.slot') + ' 1') && !html.includes(t('save.slot') + ' tom.1'),
    'a box is labelled by its number; the character is the heading above it');

  // A slot carrying a job in progress says so, or you cannot tell which to load.
  save.writeSlot('tom.2', { ...save.newSave('mid-job'), mission: { id: 'gang', stage: 1, timeLeft: 30 } });
  ok(slotsHTML(save.listSlots('tom'), 'load').includes('job en cours'),
    'a slot with a job on the go says so');

  // The Charger screen: five summers, one block each.
  save.writeSlot('zahra.1', { ...save.newSave('le parc', 'zahra'), money: 25 });
  const groups = groupsHTML(save.listGroups(), 'load');
  for (const c of save.CHARACTERS) ok(groups.includes('>' + c.name + '<'), `${c.name} has a block`);
  ok(groups.includes('data-character="zahra"'), 'each block knows whose it is');
  ok((groups.match(/class="newgame"/g) || []).length === save.CHARACTERS.length,
    'and every character can be started from the beginning');
  ok(groups.includes('data-slot="zahra.1"') && groups.includes('data-slot="tom.1"'),
    'the slot ids stay qualified, so a click cannot land on the wrong summer');
  ok(groups.includes('1993 Ford Ranger XL') && groups.includes('1988 Honda Civic Si'),
    'a block names the character\u2019s car');
  ok(!groupsHTML(save.listGroups(), 'load').includes('saveslot'),
    'the Charger screen still cannot write');
  ok(groups.includes('son propre été'), 'and it says the summers are separate');
}

// ---------------------------------------------------------------- 5. no dialogs

group('no modal dialogs');
{
  const fs = await import('node:fs');
  const files = ['src/main.js', 'src/game/options.js', 'src/game/save.js', 'src/game/ui.js', 'src/game/store.js'];
  for (const f of files) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')   // comments may name them
      .replace(/hud\.prompt\s*\(/g, '');                            // the HUD's own prompt line
    ok(!/\b(window\.)?(confirm|alert|prompt)\s*\(/.test(src),
      `${f} has no window.confirm / alert`);
  }
}

// ---------------------------------------------------------------- report

console.log('\n' + (fail ? `FAILED  ${fail} of ${pass + fail}` : `ok  ${pass} assertions`));
if (fail) {
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
