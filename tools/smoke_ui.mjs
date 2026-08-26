// UI smoke test — runs under plain node with a hand-rolled DOM/localStorage
// stub. No browser, no framework, no dependencies.
//
//   node tools/smoke_ui.mjs
//
// Covers the four things that are easy to break and impossible to eyeball:
//   1. the toast queue's ordering and durations
//   2. i18n falling back to French for a key English does not have
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

// ---------------------------------------------------------------- 2. i18n

group('i18n');
{
  setLang('fr');
  eq(t('menu.drive'), 'EMBARQUE', 'French is the base dictionary');
  setLang('en');
  eq(getLang(), 'en', 'setLang takes');
  eq(t('menu.drive'), 'DRIVE', 'English overrides where it has the key');
  // 'intro.go' and 'hud.kmh' exist only in French.
  eq(t('intro.go'), 'GO', 'a key English lacks falls back to French');
  eq(t('hud.kmh'), 'km/h', 'second French-only fallback');
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
  ok(!/class="used[^"]*">M</.test(kb), 'M is no longer a lit key (mute moved to 0)');
  ok(/class="used[^"]*">0</.test(kb), '0 is the mute key now');
  ok(/class="used[^"]*">N</.test(kb), 'N cycles the minimap size');
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

  // -- settings
  localStorage.clear();
  eq(store.loadSettings(), store.DEFAULT_SETTINGS, 'settings default');
  const want = { lang: 'en', lookBackToggle: true, steerSens: 1.3, fov: 0.12, assist: false, audio: false };
  store.saveSettings(want);
  eq(store.loadSettings(), want, 'settings round-trip');
  store.saveSettings({ ...want, steerSens: 9, fov: -5, lang: 'xx' });
  const clamped = store.loadSettings();
  eq(clamped.steerSens, 1.6, 'steering sensitivity clamps high');
  eq(clamped.fov, -0.15, 'FOV clamps low');
  eq(clamped.lang, 'fr', 'an unknown language stores as French');
  localStorage.setItem('aylmer.settings', 'null');
  eq(store.loadSettings(), store.DEFAULT_SETTINGS, 'corrupt settings fall back');

  // -- parked cars / current car / damage
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
  ok(/\| \*\*tour\*\* \| \*\*total\*\*/.test(md), 'per-mission totals are present');
  ok(!/\bNaN\b/.test(md), 'no stage failed to route');
}

// ---------------------------------------------------------------- report

console.log('\n' + (fail ? `FAILED  ${fail} of ${pass + fail}` : `ok  ${pass} assertions`));
if (fail) {
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
