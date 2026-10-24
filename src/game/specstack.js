// The car's spec stack: which sheet the Vehicle drives, in one place.
//
// A Vehicle drives a stack of sheets, bottom to top:
//   1. the CARS entry (cars.js), never touched;
//   2. the tuned sheet: the parts you bought (upgrades.js tuned/tunedSound),
//      kept as `v.baseSpec`, the "dry" sheet everything above derives from;
//   3. weather (weather.js specFor) and skills (skills.js specFor), rebuilt
//      every tick as clones over the base;
//   4. a dry tank (fuel.js tickFuel), still in main.js's tick because it also
//      burns fuel and can trigger Dad's call.
//
// Architecture review E3 (docs/review/architecture.md, F3). Layer 2 used to
// have its own writer: economy.js's retune(), run from economy's own
// requestAnimationFrame loop after main's frame, keyed on G.carId rather than
// on the Vehicle. main's tick wrote layer 3 and, on a fresh Vehicle, captured
// the stock sheet as the base. Now:
//   - seat(v) puts the tuned sheet under a Vehicle and sets the engine voice,
//     once, when that sheet changes (a new Vehicle, a part fitted, a repaint);
//   - driveSpec(G, v, layers) is the per-tick call: seat, then weather and
//     skills over the base;
//   - the tuned sheet is keyed on the Vehicle's own car (`v.carId`, set where
//     main.js builds the Vehicle), so a Vehicle never wears another car's parts;
//   - the cache hands weather and skills the SAME base object every tick, which
//     is what their own caches compare on (weather.js `hit.base === spec`).
//
// No DOM, no G at construction: plain functions over what is passed in, so a
// node suite (tools/smoke_specstack.mjs) can drive it.
import { tuned, tunedSound } from './upgrades.js';

/**
 * @param {object} o
 * @param {(id:string)=>object} o.carById   the CARS lookup
 * @param {(id:string)=>object|null} o.modsOf  the raw mods record for a car, or null (stock)
 * @param {(sound:object)=>void} [o.setEngineProfile]  called once per change of tuned sheet
 */
export function createSpecStack({ carById, modsOf, setEngineProfile }) {
  // One derived sheet per (car, parts) pair, kept until the parts change.
  // tuned() allocates, and this is asked up to eight times a frame.
  let cache = { key: '', spec: null, sound: null };

  /** The tuned sheet and engine voice for car `id` with its current parts. */
  function tunedFor(id) {
    // rawMods, not modsFor: a stock car should not allocate a record just to
    // be told it is stock.
    const mods = (modsOf && modsOf(id)) || null;
    const key = id + ':' + JSON.stringify(mods);
    if (cache.key !== key) {
      const base = carById(id);
      cache = { key, spec: tuned(base, mods), sound: tunedSound(base.sound, mods) };
    }
    return cache;
  }

  /** Forget the cached sheet: a repaint or restoration changes it in place. */
  function invalidate() { cache.key = ''; }

  /** The car a Vehicle is: its own id, set at construction by main.js. */
  const carOf = (v) => v.carId || (v.spec && v.spec.id);

  /**
   * Put the tuned sheet under `v`. Returns true when it changed, in which case
   * the engine voice was set once. A no-op on every other call: compares the
   * stable base, never the weather/skills clone (the silent-driveway bug,
   * tools/smoke_engine_rebuilds.mjs).
   */
  function seat(v) {
    if (!v) return false;
    const w = tunedFor(carOf(v));
    if (v.baseSpec === w.spec) return false;
    v.baseSpec = w.spec;
    v.spec = w.spec;
    if (setEngineProfile) setEngineProfile(w.sound);
    return true;
  }

  /**
   * The per-tick sheet: the tuned base with weather and skills over it.
   * main.js's tick assigns it to v.spec, then lets fuel have the last word.
   */
  function driveSpec(G, v, { weather, skills }) {
    seat(v);
    return skills.specFor(weather.specFor(v.baseSpec), G);
  }

  return { tunedFor, invalidate, seat, driveSpec };
}
