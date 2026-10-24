// Look feature flags (docs/visual-wave/PLAN.md, section 3.3).
//
// Every visual-wave feature sits behind one of these. A flag is ON by default
// once its task has merged, and the URL turns any of them off or on again:
//   index.html?look=-ao,-wires        ao and wires off, everything else default
//   index.html?look=wires             wires on (the same as the default)
// so a before and an after can be shot from one build. AYLMER.look({ao: false})
// does the same from a console or a capture script, and AYLMER.look() reads
// them all back.
//
// The table below is every flag tasks.json names. A flag whose feature has not
// landed yet is harmless: its stub module does nothing whatever the flag says.
// A name that is not in the table is a typo, so it warns (once per name) and
// changes nothing.

export const PROTOTYPE = typeof document !== 'undefined'
  && document.documentElement.dataset.prototype === '2004';

const DEFAULTS = {
  // wave 1: light, air, sky, texture sources
  linear: true, timecycle: true, sky2: true, aerial: true, vpack: true, atlas2: true,
  // wave 2: the street
  roads2: true, walks2: true, lawns2: true, trees2: true, yards2: true, wires: true,
  ao: true, shadowdecals: true, props2: true, parked: true,
  // wave 3: buildings, cars, water
  facades2: true, glass: true, principale2: true, landmarks2: true, carpaint: true, water2: true,
  // wave 4: night, lights, particles, car details
  coronas: true, headlights2: true, particles: true, cardetail: true,
  // wave 5: post, weather, UI, tiers
  bloom: true, wet: true, hud2: true, menu2: true, tiers: true,
  // wave 6: optional high tier and final polish
  sunshadow: true, digicam: true, season: true,
};

const state = { ...DEFAULTS };
const warned = new Set();
const listeners = [];

function warnOnce(name, why) {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(`look flag "${name}": ${why}`);
}

// Is this feature on? Called per frame by the stubs' callers, so it is a plain
// property read with no allocation.
export function isOn(name) {
  const v = state[name];
  if (v === undefined) { warnOnce(name, 'unknown flag, treated as off'); return false; }
  return v;
}

// Apply {flag: bool}. Unknown names warn once and are ignored. Returns true when
// anything actually changed, and tells the listeners.
export function set(patch) {
  let changed = false;
  for (const [name, on] of Object.entries(patch || {})) {
    if (!(name in DEFAULTS)) { warnOnce(name, 'unknown flag, ignored'); continue; }
    const v = !!on;
    if (state[name] !== v) { state[name] = v; changed = true; }
  }
  if (changed) for (const fn of listeners) fn(snapshot());
  return changed;
}

// "a,-b,+c" into {a: true, b: false, c: true}.
export function parse(text) {
  const out = {};
  for (const raw of String(text || '').split(',')) {
    const t = raw.trim();
    if (!t) continue;
    const off = t[0] === '-';
    const name = t[0] === '-' || t[0] === '+' ? t.slice(1) : t;
    if (name) out[name] = !off;
  }
  return out;
}

export function snapshot() { return { ...state }; }
export function defaults() { return { ...DEFAULTS }; }
export function known(name) { return name in DEFAULTS; }

// A module that has to react when a flag flips (drop a buffer, rebuild a mesh)
// subscribes here rather than polling.
export function onChange(fn) { listeners.push(fn); }

// The URL is read once, at module load, before any frame draws.
if (typeof location !== 'undefined') {
  try {
    const q = new URLSearchParams(location.search).get('look');
    if (q) set(parse(q));
  } catch { /* no URL, no flags */ }
}

// AYLMER.look(patch): set, then read back. AYLMER.look() only reads.
export function lookApi(patch) {
  if (patch && typeof patch === 'object') set(patch);
  else if (typeof patch === 'string') set(parse(patch));
  return snapshot();
}
