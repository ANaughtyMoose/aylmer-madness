// UI smoke test — runs under plain node with a hand-rolled DOM/localStorage
// stub. No browser, no framework, no dependencies.
//
//   node tools/smoke_ui.mjs
//
// Covers the four things that are easy to break and impossible to eyeball:
//   1. the toast queue's ordering and durations
//   2. the interface remaining in Quebec French
//   3. every localStorage round-trip the UI owns (map size/zoom, settings,
//      parked cars) including clamping and garbage input
//   4. the mission-timer table actually generating

// ---------------------------------------------------------------- stubs

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
}

// Just enough <canvas>/document that importing hud.js and ui.js is safe. The
// heavy Hud constructor is never called here; this only has to exist.
const noopCtx = new Proxy({}, {
  get: (_, k) => (k === 'canvas' ? null : () => undefined),
});
function fakeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(), width: 0, height: 0, style: {},
    className: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    getContext: () => noopCtx,
    appendChild() {}, querySelector: () => null, querySelectorAll: () => [],
  };
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
function group(name) { console.log('\n' + name); }

// ---------------------------------------------------------------- imports

const { ToastQueue } = await import('../src/game/hud.js');
const { t, setLang, getLang, KEYMAP } = await import('../src/game/i18n.js');
const store = await import('../src/game/store.js');
const { keyboardHTML } = await import('../src/game/ui.js');
const { buildTimersTable } = await import('./timers.mjs');

// ---------------------------------------------------------------- 1. toasts

group('toast queue');
{
  const q = new ToastQueue(2);
  q.push('un', 1000);
  q.push('deux', 1000);
  q.push('trois', 500);
  q.step(0);
  eq(q.texts(), ['un', 'deux'], 'at most two on screen, oldest first');
  ok(q.pending.length === 1, 'the third waits its turn');

  ok(q.step(500) === false, 'nothing changes mid-life');
  eq(q.texts(), ['un', 'deux'], 'still the same two at t=500');
  eq(q.nextDeadline(500), 500, 'next expiry is 500 ms away');

  ok(q.step(1000) === true, 'both expire together at t=1000');
  eq(q.texts(), ['trois'], 'the queued one is promoted FIFO');

  q.step(1500);
  eq(q.texts(), [], 'a 500 ms toast is gone 500 ms later');
  eq(q.nextDeadline(1500), Infinity, 'no deadline when empty');
}
{
  // Durations are per-toast, not shared.
  const q = new ToastQueue(2);
  q.push('court', 300);
  q.push('long', 900);
  q.step(0);
  q.step(300);
  eq(q.texts(), ['long'], 'the short one expires without taking the long one');
  q.step(900);
  eq(q.texts(), [], 'the long one expires on its own clock');
}
{
  // FIFO holds across many pushes.
  const q = new ToastQueue(2);
  for (const n of ['a', 'b', 'c', 'd', 'e']) q.push(n, 100);
  q.step(0); eq(q.texts(), ['a', 'b'], 'FIFO batch 1');
  q.step(100); eq(q.texts(), ['c', 'd'], 'FIFO batch 2');
  q.step(200); eq(q.texts(), ['e'], 'FIFO batch 3');
  q.step(300); eq(q.texts(), [], 'drained');
}
{
  // A direct response to E must not sit behind scenery/tutorial messages —
  // and « visible somewhere » is not enough. Slot two is small and dim
  // (.toastline:nth-child(2) is 21 px at .88 opacity against 26 px at 1), so a
  // refusal that lands there is what PLAYTEST #18 recorded as "press E and the
  // game does nothing". It has to be the FRONT line.
  const q = new ToastQueue(2);
  q.push('ancien 1', 2000);
  q.push('ancien 2', 2000);
  q.step(0);
  q.push('il te manque 200 $', 1200, true);
  q.step(1);
  eq(q.texts()[0], 'il te manque 200 $', 'urgent feedback takes the front slot, not the small one');
  ok(q.pending.some((x) => x.text === 'ancien 1'), 'the displaced toast is preserved for later');
  q.step(1201);
  ok(!q.texts().includes('il te manque 200 $'), 'and it still expires on its own clock');
}
{
  // U7: while a modal owns the screen the queue freezes. A toast that plays
  // out behind a story card is a toast nobody read.
  const q = new ToastQueue(2);
  q.push('avant', 1000);
  q.step(0);
  eq(q.texts(), ['avant'], 'showing before the modal opens');
  q.hold(true);
  q.push('pendant', 1000);
  ok(q.step(5000) === false, 'nothing expires and nothing is promoted while held');
  eq(q.texts(), ['avant'], 'and the queue has not moved');
  eq(q.nextDeadline(5000), Infinity, 'no deadline while held');
  q.hold(false);
  q.step(5000);
  eq(q.texts(), ['avant', 'pendant'], 'both play once the modal closes');
  q.step(5999); eq(q.texts(), ['avant', 'pendant'], 'on a clock that restarted, not one that ran out');
  q.step(6001); eq(q.texts(), [], 'and then they go');
}

// ---------------------------------------------------------------- 2. i18n

group('i18n');
{
  setLang('fr');
  eq(t('menu.drive'), 'EMBARQUE', 'French is the base dictionary');
  // Thomas, 2026-09-07: English is selectable. Tom, 20 Oct 2026: it is real
  // English (the photocopy gag is no longer the default). French stays the
  // master copy and the default.
  setLang('en');
  eq(getLang(), 'en', 'English can be selected');
  eq(t('menu.drive'), 'GET IN', 'and the interface is real English');
  eq(t('k.handbrake'), 'Handbrake', 'the controls are real English too');
  setLang('fr');
  eq(t('menu.drive'), 'EMBARQUE', 'French is exactly what it was, and the default');
  eq(t('intro.go'), 'GO', 'shared wording remains available');
  eq(t('hud.kmh'), 'km/h', 'units remain available');
  eq(t('definitely.not.a.key'), 'definitely.not.a.key', 'an unknown key returns itself');
  eq(setLang('klingon'), 'fr', 'an unknown language falls back to French');
  eq(t('menu.drive'), 'EMBARQUE', '…and the strings come back in French');
  setLang('fr');

  ok(KEYMAP.length >= 12, 'the key map covers the whole keyboard legend');
  ok(KEYMAP.every((k) => t(k.label) !== k.label), 'every legend row has a translation');
  const kb = keyboardHTML();
  ok(kb.includes('class="used"'), 'the keyboard diagram highlights used keys');
  for (const cap of ['Tab', 'Espace', 'Shift', '?']) {
    ok(kb.includes('>' + cap + '<'), `the diagram draws the ${cap} key`);
  }
  // This used to assert M was dark (mute moved to 0). M has since become the
  // modes picker and is in KEYMAP, so a dark M was the bug (UX review P8).
  ok(/class="used[^"]*">M</.test(kb), 'M is lit: it opens the modes picker');
  for (const cap of ['T', 'Y', 'V', 'M', 'K', 'U']) {
    ok(new RegExp(`class="used[^"]*">${cap}<`).test(kb), `${cap} is bound, so it is lit`);
  }
  const { KEYBOARD_CAPS } = await import('../src/game/ui.js');
  const drawn = new Set(KEYBOARD_CAPS);
  for (const k of KEYMAP) for (const cap of k.caps) {
    if (!drawn.has(cap)) continue;
    const re = new RegExp(`class="used[^"]*">${cap.replace(/[?+]/g, '\\$&')}<`);
    ok(re.test(kb), `KEYMAP cap ${cap} is lit on the drawn keyboard`);
  }
  ok(/class="used[^"]*">0</.test(kb), '0 is the mute key now');
  ok(/class="used[^"]*">N</.test(kb), 'N cycles the minimap size');
}

group('damaged and newer save slots (save review SR-05, SR-06)');
{
  const { slotsHTML } = await import('../src/game/ui.js');
  const corrupt = slotsHTML([{ slot: 'tom.1', character: 'tom', empty: false, corrupt: true, name: 'x' }], 'save');
  ok(/class="slot corrupt"/.test(corrupt) && !/loadslot/.test(corrupt), 'a damaged slot has no Load');
  ok(/delslot/.test(corrupt) && /saveslot/.test(corrupt), '...only Delete, and Save in the pause menu');
  const row = { slot: 'tom.2', character: 'tom', empty: false, newer: true, name: 'n', savedAt: 0, carId: 'ranger', money: 1, jobs: 0, playtime: 0 };
  const newer = slotsHTML([row], 'save');
  ok(!/saveslot/.test(newer) && /loadslot/.test(newer), 'a slot from a newer build can be loaded, never saved over');
  ok(/saveslot/.test(slotsHTML([{ ...row, newer: false }], 'save')), 'an ordinary slot still offers Save');
}

// ---------------------------------------------------------------- 3. storage

group('localStorage round-trips');
{
  localStorage.clear();

  // -- minimap size + zoom
  eq(store.loadMapPrefs(), { size: 0, range: store.MAP_RANGE.dflt }, 'map prefs default');
  store.saveMapPrefs({ size: 1, range: 640 });
  eq(store.loadMapPrefs(), { size: 1, range: 640 }, 'map size + zoom round-trip');
  store.saveMapPrefs({ size: 99, range: 99999 });
  eq(store.loadMapPrefs(), { size: store.MAP_SIZES.length - 1, range: store.MAP_RANGE.max },
    'map prefs clamp on write');
  localStorage.setItem('aylmer.map', '{not json');
  eq(store.loadMapPrefs(), { size: 0, range: store.MAP_RANGE.dflt }, 'corrupt map prefs fall back');

  // -- settings. The options screen (options.js) grew the settings object well
  // past these six keys; smoke_save.mjs covers the rest, this still covers the
  // ones that predate it, plus the promise that unknown keys never survive.
  localStorage.clear();
  eq(store.loadSettings(), store.DEFAULT_SETTINGS, 'settings default');
  const want = { lang: 'fr', lookBackToggle: true, steerSens: 1.3, fov: 0.12, assist: false, audio: false };
  store.saveSettings({ ...store.DEFAULT_SETTINGS, ...want });
  const got = store.loadSettings();
  eq(Object.fromEntries(Object.keys(want).map((k) => [k, got[k]])), want, 'settings round-trip');
  eq(Object.keys(got).sort(), Object.keys(store.DEFAULT_SETTINGS).sort(),
    'a stored settings object has exactly the known keys');
  store.saveSettings({ ...want, steerSens: 9, fov: -5, lang: 'xx', bogus: 1 });
  const clamped = store.loadSettings();
  eq(clamped.steerSens, 1.6, 'steering sensitivity clamps high');
  eq(clamped.fov, -0.15, 'FOV clamps low');
  eq(clamped.lang, 'fr', 'an unknown language stores as French');
  ok(!('bogus' in clamped), 'an unknown setting is dropped, not stored');
  localStorage.setItem('aylmer.settings', 'null');
  eq(store.loadSettings(), store.DEFAULT_SETTINGS, 'corrupt settings fall back');

  // -- parked cars / current car / damage. This is the LEGACY aylmer.garage
  // format: nothing writes it any more (save slots replaced it), but save.js's
  // one-shot migration still reads it, so it still has to parse and clamp.
  localStorage.clear();
  eq(store.loadGarage(), { carId: null, parked: {}, health: {} }, 'garage default');
  const garage = {
    carId: 'civic',
    parked: { ranger: { x: 12.5, z: -3, yaw: 1.25 }, saturn: { x: 0, z: 0, yaw: 0 } },
    health: { ranger: 82, civic: 100 },
  };
  store.saveGarage(garage);
  eq(store.loadGarage(), garage, 'parked cars + current car + damage round-trip');

  localStorage.setItem('aylmer.garage', JSON.stringify({
    carId: 42,
    parked: { ranger: { x: 1, z: 2, yaw: 3 }, junk: { x: 'nope' }, nul: null },
    health: { ranger: 500, bad: 'x' },
  }));
  const cleaned = store.loadGarage();
  eq(cleaned.carId, null, 'a non-string carId is dropped');
  eq(Object.keys(cleaned.parked), ['ranger'], 'malformed parked entries are dropped');
  eq(cleaned.health, { ranger: 100 }, 'damage clamps to 0..100 and drops non-numbers');

  store.clearGarage();
  eq(store.loadGarage(), { carId: null, parked: {}, health: {} }, 'clearGarage wipes it');

  // The auto-restore is gone: booting the game does not read aylmer.garage any
  // more, so a stale one cannot decide where your cars are. Only the migration
  // touches it, and only when there is no save slot at all.
  const saveMod = await import('../src/game/save.js');
  localStorage.clear();
  localStorage.setItem('aylmer.garage', JSON.stringify({ carId: 'civic', parked: { ranger: { x: 900, z: 900, yaw: 0 } }, health: {} }));
  saveMod.writeSlot('1', saveMod.newSave('mine'));
  ok(saveMod.migrateLegacy() === null, 'an existing save slot beats a stale aylmer.garage');
  eq(saveMod.readSlot('1').carId, 'ranger', 'and the slot decides which car you are in');
  localStorage.clear();

  // -- flags
  localStorage.clear();
  ok(store.readFlag(store.KEYS.tutorial) === false, 'the tutorial flag starts unset');
  store.writeFlag(store.KEYS.tutorial, true);
  ok(store.readFlag(store.KEYS.tutorial) === true, 'the tutorial flag round-trips');
  store.writeFlag(store.KEYS.legend, false);
  ok(store.readFlag(store.KEYS.legend) === false, 'the legend flag round-trips');

  // -- private mode: setItem throws, nothing else may.
  const real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('private mode'); },
    setItem() { throw new Error('private mode'); },
    removeItem() { throw new Error('private mode'); },
  };
  let threw = false;
  try {
    store.saveSettings(store.DEFAULT_SETTINGS);
    store.saveMapPrefs({ size: 0, range: 220 });
    store.saveGarage({ carId: 'ranger', parked: {}, health: {} });
    store.clearGarage();
    eq(store.loadSettings(), store.DEFAULT_SETTINGS, 'private mode still yields defaults');
    eq(store.loadGarage(), { carId: null, parked: {}, health: {} }, 'private mode garage is empty');
  } catch (e) { threw = true; }
  ok(!threw, 'private mode never throws out of the store');
  globalThis.localStorage = real;
}

// ---------------------------------------------------------------- 4. timers

group('mission timer table');
{
  const md = buildTimersTable();
  ok(typeof md === 'string' && md.length > 800, 'the table generates');
  ok(md.includes('| mission | stage | target | route m | timer s | implied km/h |'.slice(0, 40)),
    'it has the header row');
  const { MISSIONS } = await import('../src/game/missions.js');
  for (const m of MISSIONS) ok(md.includes('| ' + m.id + ' |'), `mission ${m.id} is in the table`);
  // « tour » was the sample here until the restructure retired it (29 Sept
  // 2026); every listed job must carry a totals row now.
  for (const m of MISSIONS) ok(md.includes('| **' + m.id + '** | **total**'), `per-mission totals are present for ${m.id}`);
  ok(!/\bNaN\b/.test(md), 'no stage failed to route');
}

// ---------------------------------------------------------------- S3-RANGER
console.log('\nS3-RANGER: the speedo fits the car, the steering chip retires');
{
  const { gaugeScale } = await import('../src/game/hud.js');
  const { carById } = await import('../src/game/cars.js');
  const r = gaugeScale(carById('ranger').topSpeed * 3.6);
  ok(r.max === 140 && r.red === 110, `the Ranger's dial ends at 140 with red from 110 (got ${r.max}/${r.red})`);
  ok(116 >= r.red && 90 / r.max > 0.6, 'the speedRun top (116) is in the red and 90 km/h is past three fifths of the sweep');
  ok(gaugeScale(25).max === 60, 'nothing gets a dial under 60');
  // The tutorial: a light touch on A or D (under the 0.35 the step asks for)
  // still retires the chip after 50 m driven with the wheel turned.
  const { Tutorial } = await import('../src/game/ui.js');
  const tu = new Tutorial();
  tu.finished = false; tu.i = 1; tu.wait = 0; tu.hold = 0;
  const step = (dt, c) => tu.update(dt, { speedKmh: 0, steer: 0, brake: 0, handbrake: false, ...c });
  for (let k = 0; k < 60; k++) step(1 / 60, { speedKmh: 36, steer: 0 });      // 10 m straight: still up
  const upStraight = tu.i === 1 && tu.hold === 0;
  for (let k = 0; k < 4 * 60; k++) step(1 / 60, { speedKmh: 36, steer: 0.2 });  // 40 m with a light touch
  const upAt40 = tu.hold === 0;
  for (let k = 0; k < 2 * 60; k++) step(1 / 60, { speedKmh: 36, steer: 0.2 });  // past 50 m
  ok(upStraight && upAt40 && (tu.hold > 0 || tu.i === 2), 'the « A / D » chip retires after 50 m of driving with steering on, not before');
}

// ---------------------------------------------------------------- report

console.log('\n' + (fail ? `FAILED  ${fail} of ${pass + fail}` : `ok  ${pass} assertions`));
if (fail) {
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
