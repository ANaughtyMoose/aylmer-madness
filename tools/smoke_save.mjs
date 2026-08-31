// Save slots + options smoke test — plain node, hand-rolled DOM/localStorage.
//
//   node tools/smoke_save.mjs
//
// What it pins down, all of it stuff that is invisible until it is wrong:
//   1. a save round-trips every field, and the three slots are independent
//   2. the legacy aylmer.progress/money/best/garage keys migrate exactly once
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
const { slotsHTML } = await import('../src/game/ui.js');

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
  eq(back.slot, '2', 'the slot knows its own name');

  // Independence.
  save.writeSlot('1', { ...full, name: 'un', money: 1, carId: 'ranger' });
  save.writeSlot('3', { ...full, name: 'trois', money: 3, carId: 'sunfire' });
  eq(save.readSlot('1').money, 1, 'slot 1 keeps its own money');
  eq(save.readSlot('2').money, 315, 'slot 2 is untouched by slot 1');
  eq(save.readSlot('3').carId, 'sunfire', 'slot 3 keeps its own car');
  eq([...new Set(save.listSlots().filter((r) => !r.empty).map((r) => r.slot))].sort(),
    ['1', '2', '3'], 'three used slots, the autosave still empty');
  eq(localStorage.keys().filter((k) => k.startsWith('aylmer.save.')).sort(),
    ['aylmer.save.1', 'aylmer.save.2', 'aylmer.save.3', 'aylmer.save.last'],
    'one localStorage key per slot, plus the last-used marker');

  save.deleteSlot('2');
  ok(save.readSlot('2') === null, 'delete removes a slot');
  ok(save.readSlot('1') !== null, '…and leaves the others alone');

  // Most recent wins « Continuer ».
  save.writeSlot('1', { ...full, savedAt: '2026-01-01T00:00:00.000Z' });
  save.writeSlot('3', { ...full, savedAt: '2026-07-01T00:00:00.000Z' });
  eq(save.mostRecentSlot(), '3', 'Continuer picks the newest slot');

  // Garbage in, sane save out.
  localStorage.setItem('aylmer.save.1', '{not json');
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
    return save.saveToSlot(G, 'auto', { name: 'auto ' + reason });
  };

  ok(G.settings.autosave === true, 'autosave is on out of the box');
  ok(autosave('job') !== null, 'a finished job writes the autosave');
  eq(save.listSlots().filter((r) => !r.empty).map((r) => r.slot), ['auto'],
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
  eq(save.lastSlot(), '3', 'writing a numbered slot marks it as last used');
  save.saveToSlot(G, 'auto', {});
  eq(save.lastSlot(), '3', 'the autosave does not steal the F5 slot');
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
  eq(bad.cam, 3, 'the camera index clamps to the last camera');
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

  setLang('en');
  const stillFr = options.optionsHTML(s);
  ok(stillFr.includes('Volume général') && !stillFr.includes('Master volume'), 'the panel stays in French');
  ok(stillFr.includes('Remettre les chars chez eux'), 'the reset action stays in French too');
  ok(!stillFr.includes('id="o_lang"'), 'there is no language selector');

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
  ok(html.includes('data-slot="1"') && html.includes('data-slot="auto"'), 'three slots plus the autosave');
  ok((html.match(/class="saveslot"/g) || []).length === 3, 'you can write into 1/2/3 but not the autosave');
  ok(html.includes(t('save.empty')), 'empty slots say so');
  const load = slotsHTML(rows, 'load');
  ok(!load.includes('saveslot'), 'the load screen cannot write');
  ok(load.includes('delslot'), 'but it can delete');
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
