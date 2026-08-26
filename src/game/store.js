// Every localStorage key the UI owns, in one place, with defaults that survive
// private mode (where setItem throws) and a corrupted / hand-edited store.
//
//   aylmer.settings   language, look-back mode, steering sensitivity, FOV, assists, sound
//   aylmer.map        minimap size index + zoom range in metres
//   aylmer.garage     current car, where the other three are parked, per-car damage
//   aylmer.cars       which cars you have been lent or have bought (game/garage.js)
//   aylmer.radio      the radio deck: on/off, station, volume (game/radio.js)
//   aylmer.tutorial   "1" once the first-drive tutorial has been finished
//   aylmer.legend     "0" if the key legend is collapsed
//
// (aylmer.progress and aylmer.best predate this file and stay where they are.)

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

export const DEFAULT_SETTINGS = {
  lang: 'fr',
  lookBackToggle: false,   // false = hold Shift, true = Shift latches the view
  steerSens: 1,            // 0.5 .. 1.6 multiplier on the steering input
  fov: 0,                  // -0.15 .. 0.20 radians added to the camera FOV
  assist: true,
  audio: true,
};

const num = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

export function loadSettings() {
  const raw = readJSON(KEYS.settings, {});
  return {
    lang: raw.lang === 'en' ? 'en' : 'fr',
    lookBackToggle: !!raw.lookBackToggle,
    steerSens: num(raw.steerSens, 0.5, 1.6, DEFAULT_SETTINGS.steerSens),
    fov: num(raw.fov, -0.15, 0.2, DEFAULT_SETTINGS.fov),
    assist: raw.assist === undefined ? true : !!raw.assist,
    audio: raw.audio === undefined ? true : !!raw.audio,
  };
}

export function saveSettings(s) { return writeJSON(KEYS.settings, loadSettingsShape(s)); }

function loadSettingsShape(s) {
  return {
    lang: s.lang === 'en' ? 'en' : 'fr',
    lookBackToggle: !!s.lookBackToggle,
    steerSens: num(s.steerSens, 0.5, 1.6, 1),
    fov: num(s.fov, -0.15, 0.2, 0),
    assist: !!s.assist,
    audio: !!s.audio,
  };
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

// ---------------------------------------------------------------- garage

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
