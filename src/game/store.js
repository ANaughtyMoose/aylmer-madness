// Every localStorage key the UI owns, in one place, with defaults that survive
// private mode (where setItem throws) and a corrupted / hand-edited store.
//
//   aylmer.settings   audio / video / controls / gameplay options (see below)
//   aylmer.map        minimap size index + zoom range in metres
//   aylmer.garage     LEGACY. Read once by save.js's migration, never written.
//   aylmer.cars       which cars you have been lent or have bought (game/garage.js)
//   aylmer.radio      the radio deck: on/off, station, volume (game/radio.js)
//   aylmer.tutorial   "1" once the first-drive tutorial has been finished
//   aylmer.legend     "0" if the key legend is collapsed
//
// Game state (where the cars are, money, jobs, records) is NOT here any more:
// it lives in explicit save slots, aylmer.save.1/2/3/auto — see save.js.
// aylmer.progress / aylmer.money / aylmer.best are legacy scratch keys that the
// migration reads once and nothing reads afterwards.
//
// Settings are the exception to "nothing is written unless the player saves":
// an option takes effect and is persisted the moment you move the slider.

export const KEYS = {
  settings: 'aylmer.settings',
  map: 'aylmer.map',
  garage: 'aylmer.garage',
  cars: 'aylmer.cars',
  radio: 'aylmer.radio',
  tutorial: 'aylmer.tutorial',
  legend: 'aylmer.legend',
};

function store() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function readJSON(key, fallback) {
  try {
    const raw = store()?.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return (v && typeof v === 'object') ? v : fallback;
  } catch { return fallback; }
}

export function writeJSON(key, value) {
  try { store()?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function readFlag(key) {
  try { return store()?.getItem(key) === '1'; } catch { return false; }
}
export function writeFlag(key, on) {
  try { store()?.setItem(key, on ? '1' : '0'); return true; } catch { return false; }
}

// ---------------------------------------------------------------- settings

// Everything the options screen can set, with the value it has out of the box.
// Ranges live in LIMITS below and are enforced on both read and write, so a
// hand-edited store or an old build's file can never hand the game a bad number.
export const DEFAULT_SETTINGS = {
  // ---- audio
  audio: true,             // the 0 key's master mute
  volMaster: 1,
  volEngine: 1,
  volEffects: 1,
  volRadio: 0.7,
  engineSpeed: true,       // engine note volume follows speed (if audio supports it)
  // ---- video
  quality: 'med',          // preset; it seeds the four numbers below
  renderScale: 0.85,       // 0.5 .. 1 of the CSS resolution
  maxDpr: 1.5,             // 1 / 1.5 / 2
  drawDist: 720,           // metres, 400 .. 1200
  fogMul: 1.45,            // 0.5 .. 2 x the time-of-day fog density
  fov: 0,                  // -0.15 .. 0.20 radians added to the camera FOV
  cam: 0,                  // default camera index (chase / close / far / hood)
  mapSize: 0,              // index into MAP_SIZES
  showLegend: true,
  showHud: true,
  showFps: false,
  // ---- controls
  steerSens: 1,            // 0.5 .. 1.6 multiplier on the steering input
  assist: true,
  lookBackToggle: false,   // false = hold Shift, true = Shift latches the view
  invertLook: false,       // the camera looks back until you hold Shift
  rumble: true,
  // Camera shake, 0..1. Motion sensitivity is common enough that a game you
  // hand to a dozen people will meet it; 0 removes the shake entirely and costs
  // nothing else, because the speed cue is the FOV.
  shake: 1,
  // ---- gameplay
  lang: 'fr',
  autosave: true,
  difficulty: 'normal',    // easy / normal / hard — for the AI agent, if it wants it
  // ---- story (game/story.js, game/heckle.js)
  storySeen: false,        // the new-game opener has played once
  heckles: true,           // « Les gens gueulent »: the town yells at bad driving
};

export const LIMITS = {
  volMaster: [0, 1], volEngine: [0, 1], volEffects: [0, 1], volRadio: [0, 1],
  renderScale: [0.5, 1], drawDist: [400, 1200], fogMul: [0.5, 2],
  fov: [-0.15, 0.2], steerSens: [0.5, 1.6],
};
const QUALITIES = ['low', 'med', 'high'];
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const DPRS = [1, 1.5, 2];

const num = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const bool = (v, dflt) => (v === undefined ? dflt : !!v);
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const lim = (k, v) => num(typeof v === 'string' ? parseFloat(v) : v, LIMITS[k][0], LIMITS[k][1], DEFAULT_SETTINGS[k]);

// One shape function for both directions: whatever comes in, a valid settings
// object comes out. Unknown keys are dropped.
export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const D = DEFAULT_SETTINGS;
  return {
    audio: bool(s.audio, D.audio),
    volMaster: lim('volMaster', s.volMaster),
    volEngine: lim('volEngine', s.volEngine),
    volEffects: lim('volEffects', s.volEffects),
    volRadio: lim('volRadio', s.volRadio),
    engineSpeed: bool(s.engineSpeed, D.engineSpeed),

    quality: pick(s.quality, QUALITIES, D.quality),
    renderScale: lim('renderScale', s.renderScale),
    maxDpr: pick(Number(s.maxDpr), DPRS, D.maxDpr),
    drawDist: Math.round(lim('drawDist', s.drawDist)),
    fogMul: lim('fogMul', s.fogMul),
    fov: lim('fov', s.fov),
    cam: Number.isInteger(s.cam) ? Math.min(3, Math.max(0, s.cam)) : D.cam,
    mapSize: Number.isInteger(s.mapSize) ? Math.min(MAP_SIZES.length - 1, Math.max(0, s.mapSize)) : D.mapSize,
    showLegend: bool(s.showLegend, D.showLegend),
    showHud: bool(s.showHud, D.showHud),
    showFps: bool(s.showFps, D.showFps),

    steerSens: lim('steerSens', s.steerSens),
    assist: bool(s.assist, D.assist),
    lookBackToggle: bool(s.lookBackToggle, D.lookBackToggle),
    invertLook: bool(s.invertLook, D.invertLook),
    rumble: bool(s.rumble, D.rumble),
    shake: num(s.shake, 0, 1, D.shake),

    // L'interface est uniquement en français québécois. Cette normalisation
    // ramène aussi les anciennes préférences anglaises au français.
    lang: 'fr',
    autosave: bool(s.autosave, D.autosave),
    difficulty: pick(s.difficulty, DIFFICULTIES, D.difficulty),

    storySeen: bool(s.storySeen, D.storySeen),
    heckles: bool(s.heckles, D.heckles),
  };
}

export function loadSettings() { return normalizeSettings(readJSON(KEYS.settings, {})); }

export function saveSettings(s) {
  const clean = normalizeSettings(s);
  writeJSON(KEYS.settings, clean);
  return clean;
}

// ---------------------------------------------------------------- minimap

// Two corner sizes; Tab is the third ("size") and is not persisted.
export const MAP_SIZES = [200, 340];
export const MAP_RANGE = { min: 80, max: 900, dflt: 220 };

export function loadMapPrefs() {
  const raw = readJSON(KEYS.map, {});
  const size = Number.isInteger(raw.size) ? Math.min(MAP_SIZES.length - 1, Math.max(0, raw.size)) : 0;
  return { size, range: num(raw.range, MAP_RANGE.min, MAP_RANGE.max, MAP_RANGE.dflt) };
}

export function saveMapPrefs(p) {
  return writeJSON(KEYS.map, {
    size: Math.min(MAP_SIZES.length - 1, Math.max(0, p.size | 0)),
    range: num(p.range, MAP_RANGE.min, MAP_RANGE.max, MAP_RANGE.dflt),
  });
}

// ---------------------------------------------------------------- garage (legacy)

// The pre-save-slot format: the game used to write this every time you paused,
// which is exactly the "my cars are wherever I dropped them, forever" problem
// the save slots fix. Nothing writes it now — save.js reads it once, folds it
// into the 'auto' slot, and never looks again. Kept (with its tests) because
// that migration has to keep working for anyone with an old localStorage.
// { carId, parked: { id: {x,z,yaw} }, health: { id: 0..100 } }
export function loadGarage() {
  const raw = readJSON(KEYS.garage, {});
  const parked = {};
  if (raw.parked && typeof raw.parked === 'object') {
    for (const id of Object.keys(raw.parked)) {
      const s = raw.parked[id];
      if (!s || typeof s !== 'object') continue;
      if (![s.x, s.z, s.yaw].every((v) => typeof v === 'number' && isFinite(v))) continue;
      parked[id] = { x: s.x, z: s.z, yaw: s.yaw };
    }
  }
  const health = {};
  if (raw.health && typeof raw.health === 'object') {
    for (const id of Object.keys(raw.health)) {
      const v = raw.health[id];
      if (typeof v === 'number' && isFinite(v)) health[id] = Math.min(100, Math.max(0, v));
    }
  }
  return { carId: typeof raw.carId === 'string' ? raw.carId : null, parked, health };
}

export function saveGarage(g) {
  return writeJSON(KEYS.garage, {
    carId: typeof g.carId === 'string' ? g.carId : null,
    parked: g.parked || {},
    health: g.health || {},
  });
}

export function clearGarage() {
  try { store()?.removeItem(KEYS.garage); } catch { /* private mode */ }
  try { store()?.removeItem(KEYS.cars); } catch { /* private mode */ }
}

// ---------------------------------------------------------------- radio

// { on, station, volume } — game/radio.js owns the meaning; this only clamps.
export function loadRadio() {
  const raw = readJSON(KEYS.radio, {});
  return {
    on: !!raw.on,
    station: Number.isInteger(raw.station) ? Math.max(0, Math.min(3, raw.station)) : 0,
    volume: num(raw.volume, 0, 1, 0.55),
  };
}

export function saveRadio(r) {
  return writeJSON(KEYS.radio, {
    on: !!r.on,
    station: Math.max(0, Math.min(3, r.station | 0)),
    volume: num(r.volume, 0, 1, 0.55),
  });
}
