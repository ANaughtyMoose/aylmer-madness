// Deliberate saves.
//
// The game used to dribble state into localStorage as you drove — parked cars,
// damage, money, jobs, records — so your friends' cars ended up wherever you
// last abandoned them and there was no way back. Nothing here writes unless the
// player asks for it (pause → Sauvegarde → a slot, or F5) or an autosave event
// fires (a job finished, a car bought/unlocked) with autosave on in the options.
//
// A slot belongs to a CHARACTER. Choosing Zahra does not continue Tom's summer,
// it starts hers — and coming back to Tom resumes his exactly where it was. So
// the slot id is `<character>.<n>`, four per character, one localStorage key
// each:
//
//   aylmer.save.tom.1 … aylmer.save.zahra.auto
//         {version,name,savedAt,playtime,character,carId,parked,health,money,
//          progress,best,unlocks,stats,timeOfDay,day,fuel,target,summerOver,
//          reached,mission}
//   aylmer.save.last                   the slot F5 quick-saves into (qualified)
//   aylmer.save.migrated               the migration stamp; '2' once v1 is folded in
//
// A bare '1' / 'auto' is still accepted everywhere a slot id is taken and means
// Tom's — that is what the v1 slots were, and the migration renames the keys.
//
// `parked` holds EVERY car including the one you were driving, so carId +
// parked[carId] is where you get put down when the slot is loaded.
//
// v2 also carries the four fields the summer runs on (`day`, `fuel`, `target`,
// and the wallet, which no longer persists itself — see money.js) plus the job
// you were in the middle of, so loading no longer drops it on the floor.
import { PLACES } from './places.js';
import { CARS } from './cars.js';
import { loadGarage } from './store.js';

export const SAVE_VERSION = 2;

// The five playable summers. `car` is what that character starts in and `home`
// is the PLACES key they start it AT — the hook Wave 2b left, filled in by
// Wave 3 now that the vehicles exist. Every one of these five ids must be a car
// garage.js unlocks for that character from the first frame (UNLOCKS carries a
// matching `character` field); tools/smoke_garage.mjs checks the two tables
// agree, because a save pointing at a car the garage refuses would silently
// drop you into the Ranger instead.
//
// Zahra is fifteen and has no licence, so hers is a bicycle. That is not a
// downgrade: game/bikes.js's Diamondback goes down the paths, over the kerbs,
// across the beach and between the buildings on Principale, and cops.js now
// ignores a two-wheeler outright.
export const CHARACTERS = [
  { id: 'tom', name: 'Tom', car: 'ranger', home: 'home' },
  { id: 'sayyad', name: 'Sayyad', car: 'civic', home: 'sayyad' },
  // Sayyad's sister, so `home` is his key and not one of her own: it is
  // literally the same house on Denise-Friend, and two pins on one address
  // would be two pins on one address.
  { id: 'zahra', name: 'Zahra', car: 'dbike', home: 'sayyad' },
  { id: 'mike', name: 'Mike', car: 'forester', home: 'mike' },
  { id: 'abraham', name: 'Abraham', car: 'sienna', home: 'abraham' },
];
export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
export const DEFAULT_CHARACTER = 'tom';
export const characterById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// Three slots you write into plus the autosave, per character.
export const SLOT_NUMBERS = ['1', '2', '3', 'auto'];
export const SLOTS = CHARACTER_IDS.flatMap((c) => SLOT_NUMBERS.map((n) => `${c}.${n}`));
export const KEY_PREFIX = 'aylmer.save.';
export const LAST_KEY = KEY_PREFIX + 'last';
export const MIGRATED_KEY = KEY_PREFIX + 'migrated';
// Bumped when the migration has to run again for everyone. '2' = v1 slots have
// been renamed under Tom and the wallet's private key has been folded in.
export const MIGRATION_STAMP = '2';
// The legacy keys the migration reads exactly once.
export const LEGACY_KEYS = ['aylmer.progress', 'aylmer.money', 'aylmer.best', 'aylmer.garage'];
// The wallet used to keep its own copy of your money here, which is how a slot
// could load $410 and the HUD show $80. Deleted on migration, never read again.
export const MONEY_KEY = 'aylmer.money';

// The summer: Saturday 26 June to Monday 6 September 2004, 73 days, 0-based.
export const DAYS = 73;
// A tank nobody has: the clamp only has to keep a corrupt number out of the
// fuel gauge, and the biggest vehicle in the game is a city bus.
export const FUEL_MAX = 200;
// The envelope on the kitchen table. Difficulty may move it; it stays a number
// a summer of jobs can plausibly reach.
export const DEFAULT_TARGET = 1200;
export const TARGET_MIN = 100, TARGET_MAX = 5000;

export const START_MONEY = 80;
export const DEFAULT_CAR = 'ranger';

// Whose driveway each car lives in. Margaret's Saturn shares the driveway at
// 299 Fraser with your Ranger, so the two of them get slots 0 and 1 there.
export const OWNER = { ranger: 'home', saturn: 'home', civic: 'steph', sunfire: 'marina',
  // The other three playable characters' cars, at their own addresses. The Z24
  // is Tyler's and sits at her aunt's on Samuel-Edey — it is not on the lot any
  // more, so unlike the beaters it never comes home with you.
  forester: 'mike', sienna: 'abraham', cavalier: 'tyler',
  cutlass: 'home', caravan: 'home', bus: 'home',
  // The cart never leaves the golf course; it lives on the clubhouse apron.
  cart: 'golf' };

// '1' and 'tom.1' are the same slot: the first is what v1 called it. Anything
// else — an unknown character, a fifth slot number — is not a slot at all.
export function qualifySlot(slot) {
  if (typeof slot !== 'string' || !slot) return null;
  const dot = slot.indexOf('.');
  if (dot < 0) return SLOT_NUMBERS.includes(slot) ? `${DEFAULT_CHARACTER}.${slot}` : null;
  const ch = slot.slice(0, dot), n = slot.slice(dot + 1);
  return CHARACTER_IDS.includes(ch) && SLOT_NUMBERS.includes(n) ? `${ch}.${n}` : null;
}
export function slotCharacter(slot) {
  const q = qualifySlot(slot);
  return q ? q.slice(0, q.indexOf('.')) : '';
}
export function slotNumber(slot) {
  const q = qualifySlot(slot);
  return q ? q.slice(q.indexOf('.') + 1) : '';
}

export const slotKey = (slot) => KEY_PREFIX + (qualifySlot(slot) || slot);

function store() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
function readRaw(key) {
  try { return store()?.getItem(key) ?? null; } catch { return null; }
}
function writeRaw(key, value) {
  try { store()?.setItem(key, value); return true; } catch { return false; }
}
function removeRaw(key) {
  try { store()?.removeItem(key); return true; } catch { return false; }
}

const num = (v, dflt = 0) => (typeof v === 'number' && isFinite(v) ? v : dflt);
const clamp01 = (v) => Math.min(100, Math.max(0, v));

// ---------------------------------------------------------------- geometry

// A parking spot at the curb in front of a place, nose along the street.
// `slot` spaces cars that share an address.
export function curbSpot(p, slot = 0) {
  const dx = (p.bx ?? p.x) - p.x, dz = (p.bz ?? p.z) - p.z, d = Math.hypot(dx, dz) || 1;
  const a = p.a || 0, tx = Math.sin(a) * 6.5 * slot, tz = Math.cos(a) * 6.5 * slot;
  return { x: p.x + (dx / d) * 2.6 + tx, z: p.z + (dz / d) * 2.6 + tz, yaw: a };
}

// A spot on the apron IN FRONT of the building rather than at the kerb, for a
// car whose spec says `park: 'building'`. The golf cart parks here so that its
// « E — prendre le cart » prompt does not fight the job marker out on the
// street: the mission runner offers a job inside 12 m of the giver, and a car
// inside 6.5 m of you, and only one of them can win.
export function apronSpot(p, back = 12) {
  const bx = p.bx ?? p.x, bz = p.bz ?? p.z;
  const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz);
  if (d < back + 2) return curbSpot(p, 0);        // nothing to stand off from
  return { x: bx - (dx / d) * back, z: bz - (dz / d) * back, yaw: p.a || 0 };
}

// Where every car sits when nobody has moved it: at its owner's curb.
// Cars sharing a driveway are spaced by their order in CARS.
export function homeParked() {
  const out = {}, slots = {};
  for (const c of CARS) {
    const k = OWNER[c.id];
    const p = PLACES[k];
    if (!p) continue;
    const slot = (slots[k] = (slots[k] || 0) + 1) - 1;
    out[c.id] = c.park === 'building' ? apronSpot(p) : curbSpot(p, slot);
  }
  return out;
}

// The bare address, without the curb offset. A fallback for a car that has no
// entry in OWNER at all (a new car from the PROGRESS agent, say).
export function homeSpot(carId) {
  const p = PLACES[OWNER[carId] || 'home'] || PLACES.home;
  return { x: p.x, z: p.z, yaw: p.a || 0 };
}

// ---------------------------------------------------------------- shape

export function newSave(name = '', character = DEFAULT_CHARACTER) {
  const who = characterById(CHARACTER_IDS.includes(character) ? character : DEFAULT_CHARACTER);
  return {
    version: SAVE_VERSION,
    name: name || '',
    savedAt: new Date().toISOString(),
    playtime: 0,
    character: who.id,
    carId: CARS.some((c) => c.id === who.car) ? who.car : DEFAULT_CAR,
    parked: homeParked(),
    health: {},
    money: START_MONEY,
    progress: [],
    best: {},
    unlocks: null,
    stats: {},
    timeOfDay: 'day',
    // 2a's three: the day index into the 73-day summer, the litres in the tank
    // (null = nobody has initialised the fuel system yet, so treat it as full)
    // and the envelope goal.
    day: 0,
    fuel: null,
    target: DEFAULT_TARGET,
    // The two beats of the ending: whether Labour Day has played, and whether
    // the envelope has ever been full. Both are one-way, both belong to 2a.
    summerOver: false,
    reached: false,
    // The job you were in the middle of, or null. See missionSnapshot().
    mission: null,
  };
}

// The keys a live mission rebuilds for itself out of the def, so they must not
// come back out of a save: `stages` is def.build(), `target` is stageTarget(),
// and `def` is the def. Everything else on the mission object is live state.
const MISSION_STRUCTURAL = new Set(['def', 'stages', 'target', 'idx', 'timeLeft', 'elapsed', 'failed', 'styleStart']);

// A job in progress, small and flat. Only scalars: the stage objects hang
// meters, spawned rivals and prop handles off the mission too (`m.donut`,
// `m.legs`, `m.couch`), and those are rebuilt by the stage's own onEnter when
// the job resumes — a stale copy of one is worse than none.
export function missionSnapshot(G) {
  const m = G && G.mission;
  if (!m || !m.def || typeof m.def.id !== 'string' || !Array.isArray(m.stages)) return null;
  const state = {};
  for (const k of Object.keys(m)) {
    if (MISSION_STRUCTURAL.has(k)) continue;
    const v = m[k], ty = typeof v;
    if (ty === 'string' ? v.length <= 200 : (ty === 'boolean' || (ty === 'number' && isFinite(v)))) state[k] = v;
  }
  return {
    id: m.def.id,
    stage: Math.max(0, Math.min(m.stages.length - 1, Math.round(num(m.idx, 0)))),
    timeLeft: typeof m.timeLeft === 'number' && isFinite(m.timeLeft) ? Math.max(0, m.timeLeft) : null,
    elapsed: Math.max(0, num(m.elapsed, 0)),
    passengers: Math.max(0, Math.round(num(G.veh && G.veh.passengers, 0))),
    state,
  };
}

function normalizeMission(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const state = {};
  if (raw.state && typeof raw.state === 'object') {
    for (const k of Object.keys(raw.state)) {
      if (MISSION_STRUCTURAL.has(k)) continue;
      const v = raw.state[k], ty = typeof v;
      if (ty === 'string' ? v.length <= 200 : (ty === 'boolean' || (ty === 'number' && isFinite(v)))) state[k] = v;
    }
  }
  return {
    id: raw.id.slice(0, 64),
    stage: Math.max(0, Math.round(num(raw.stage, 0))),
    timeLeft: typeof raw.timeLeft === 'number' && isFinite(raw.timeLeft) ? Math.max(0, raw.timeLeft) : null,
    elapsed: Math.max(0, num(raw.elapsed, 0)),
    passengers: Math.max(0, Math.round(num(raw.passengers, 0))),
    state,
  };
}

// Anything that comes out of localStorage (or out of another agent's hands) is
// run through this before the game sees it.
export function normalizeSave(raw, slot = '') {
  if (!raw || typeof raw !== 'object') return null;
  const carIds = CARS.map((c) => c.id);
  const parked = {};
  if (raw.parked && typeof raw.parked === 'object') {
    for (const id of Object.keys(raw.parked)) {
      if (!carIds.includes(id)) continue;
      const s = raw.parked[id];
      if (!s || typeof s !== 'object') continue;
      if (![s.x, s.z, s.yaw].every((v) => typeof v === 'number' && isFinite(v))) continue;
      parked[id] = { x: s.x, z: s.z, yaw: s.yaw };
    }
  }
  const health = {};
  if (raw.health && typeof raw.health === 'object') {
    for (const id of Object.keys(raw.health)) {
      if (!carIds.includes(id)) continue;
      const v = raw.health[id];
      if (typeof v === 'number' && isFinite(v)) health[id] = clamp01(v);
    }
  }
  const best = {};
  if (raw.best && typeof raw.best === 'object') {
    for (const id of Object.keys(raw.best)) {
      const v = raw.best[id];
      if (typeof v === 'number' && isFinite(v) && v >= 0) best[id] = v;
    }
  }
  // The slot says whose summer this is; the blob only gets a say when the slot
  // does not (a hand-built save handed over by another module).
  const character = slotCharacter(slot)
    || (CHARACTER_IDS.includes(raw.character) ? raw.character : DEFAULT_CHARACTER);
  const startCar = characterById(character).car;
  const fallbackCar = carIds.includes(startCar) ? startCar : DEFAULT_CAR;
  const carId = carIds.includes(raw.carId) ? raw.carId : fallbackCar;
  const home = homeParked();
  // A car the save has nothing to say about is at home, not at (0,0).
  for (const id of carIds) if (!parked[id]) parked[id] = home[id] || homeSpot(id);
  return {
    version: Number.isInteger(raw.version) ? raw.version : SAVE_VERSION,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date(0).toISOString(),
    playtime: Math.max(0, num(raw.playtime, 0)),
    character,
    carId,
    parked,
    health,
    money: num(raw.money, START_MONEY) >= 0 ? num(raw.money, START_MONEY) : START_MONEY,
    progress: Array.isArray(raw.progress) ? raw.progress.filter((v) => typeof v === 'string') : [],
    best,
    unlocks: raw.unlocks && typeof raw.unlocks === 'object' ? raw.unlocks : null,
    stats: raw.stats && typeof raw.stats === 'object' ? raw.stats : {},
    timeOfDay: typeof raw.timeOfDay === 'string' ? raw.timeOfDay : 'day',
    // 2a's fields, clamped to what the summer can actually mean. `fuel` is
    // null-or-litres on purpose: null is "the tank has never been touched",
    // which is not the same number as an empty one.
    // Clamped, not rounded: 2a's calendar advances `day` as a float (a job part
    // way through Tuesday is 1.4), and snapping it here would quietly move the
    // deadline every time you saved.
    day: Math.min(DAYS - 1, Math.max(0, num(raw.day, 0))),
    fuel: typeof raw.fuel === 'number' && isFinite(raw.fuel)
      ? Math.min(FUEL_MAX, Math.max(0, raw.fuel)) : null,
    target: Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.round(num(raw.target, DEFAULT_TARGET)))),
    summerOver: raw.summerOver === true,
    reached: raw.reached === true,
    mission: normalizeMission(raw.mission),
    slot: qualifySlot(slot) || qualifySlot(raw.slot) || '',
  };
}

// ---------------------------------------------------------------- slot i/o

export function readSlot(slot) {
  const raw = readRaw(slotKey(slot));
  if (!raw) return null;
  try { return normalizeSave(JSON.parse(raw), slot); } catch { return null; }
}

export function writeSlot(slot, save) {
  const id = qualifySlot(slot);
  if (!id) return false;
  const clean = normalizeSave(save, id);
  if (!clean) return false;
  delete clean.slot;
  const okWrite = writeRaw(slotKey(id), JSON.stringify(clean));
  if (okWrite && slotNumber(id) !== 'auto') writeRaw(LAST_KEY, id);
  return okWrite;
}

export function deleteSlot(slot) {
  const id = qualifySlot(slot);
  if (!id) return false;
  removeRaw(slotKey(id));
  if (lastSlot() === id) removeRaw(LAST_KEY);
  return true;
}

export function deleteAllSaves() {
  for (const s of SLOTS) removeRaw(slotKey(s));
  removeRaw(LAST_KEY);
  return true;
}

export function hasAnySave() { return SLOTS.some((s) => readRaw(slotKey(s)) !== null); }

// Whether this character has a summer going.
export function hasSaveFor(character) {
  return SLOT_NUMBERS.some((n) => readRaw(slotKey(`${character}.${n}`)) !== null);
}

// F5 goes into the slot you used last — but only if it is this character's.
// Switching to Zahra and pressing F5 must not overwrite Tom's slot 3.
export function lastSlot(character = null) {
  const v = qualifySlot(readRaw(LAST_KEY));
  if (!v) return null;
  return !character || slotCharacter(v) === character ? v : null;
}
export function setLastSlot(slot) {
  const id = qualifySlot(slot);
  if (id) writeRaw(LAST_KEY, id);
  return id;
}

// One row per slot for the load screen: empty ones included, so the picker can
// draw four boxes without knowing anything about localStorage. One character at
// a time, because that is what a screen shows at once.
export function listSlots(character = DEFAULT_CHARACTER) {
  const who = CHARACTER_IDS.includes(character) ? character : DEFAULT_CHARACTER;
  return SLOT_NUMBERS.map((n) => {
    const slot = `${who}.${n}`;
    const s = readSlot(slot);
    if (!s) return { slot, character: who, empty: true };
    return {
      slot, character: who, empty: false, name: s.name, savedAt: s.savedAt, playtime: s.playtime,
      carId: s.carId, money: s.money, jobs: s.progress.length, best: s.best,
      day: s.day, target: s.target, job: s.mission ? s.mission.id : null, save: s,
    };
  });
}

// Every slot of every character, in character order.
export function listAllSlots() {
  return CHARACTER_IDS.flatMap((c) => listSlots(c));
}

// The Charger screen: one block per character, so five summers read as five
// summers instead of twenty boxes.
export function listGroups() {
  return CHARACTERS.map((c) => {
    const rows = listSlots(c.id);
    return {
      character: c.id, name: c.name, car: c.car, carName: carName(c.car),
      rows, used: rows.filter((r) => !r.empty).length,
    };
  });
}

// The slot « Continuer » resumes: newest savedAt wins, ties go to a real slot
// over the autosave.
export function mostRecentSlot() {
  let best = null, bt = -Infinity;
  for (const row of listAllSlots()) {
    if (row.empty) continue;
    const t = Date.parse(row.savedAt) || 0;
    if (t > bt || (t === bt && slotNumber(best) === 'auto')) { bt = t; best = row.slot; }
  }
  return best;
}

// ---------------------------------------------------------------- snapshot

// Build a save out of the live game. `veh` is the car you are in; it goes into
// `parked` alongside the three you are not.
export function snapshot(G, opts = {}) {
  const v = G.veh || null;
  const parked = {};
  for (const id of Object.keys(G.parked || {})) {
    const p = G.parked[id];
    if (p) parked[id] = { x: p.x, z: p.z, yaw: p.yaw };
  }
  if (v) parked[G.carId] = { x: v.x, z: v.z, yaw: v.yaw };
  const health = { ...(G.health || {}) };
  if (v && typeof v.damage === 'number') health[G.carId] = clamp01(v.damage);
  let unlocks = null;
  try { unlocks = G.garage?.serialize?.() ?? null; } catch { unlocks = null; }
  return normalizeSave({
    version: SAVE_VERSION,
    name: opts.name || '',
    savedAt: new Date().toISOString(),
    playtime: num(G.playtime, 0),
    character: G.character,
    carId: G.carId,
    parked,
    health,
    money: G.wallet ? G.wallet.value : START_MONEY,
    progress: [...(G.done || [])],
    best: { ...(G.best || {}) },
    unlocks,
    stats: { ...(G.stats || {}) },
    timeOfDay: G.envKey || 'day',
    // 2a writes these three as the summer runs; here they just get kept.
    day: G.day,
    fuel: G.fuel,
    target: G.target,
    summerOver: G.summerOver,
    reached: G.reached,
    mission: missionSnapshot(G),
  }, opts.slot || '');
}

export function saveToSlot(G, slot, opts = {}) {
  const snap = snapshot(G, { ...opts, slot });
  if (!writeSlot(slot, snap)) return null;
  snap.slot = slot;
  return snap;
}

// ---------------------------------------------------------------- migration

// Two one-shots, stamped once.
//
// v1 -> v2: the slots were `aylmer.save.1/2/3/auto` and belonged to nobody.
// They are Tom's — that is who the game was about — so they are renamed under
// him and given the fields v2 adds (day 0, a full tank, the $1,200 envelope).
//
// Before slots existed at all there were four loose keys (aylmer.progress /
// money / best / garage); those still become Tom's autosave, but only for a
// player who has no slot of any kind.
//
// Either way the wallet's private key goes: money lives in the slot now, and
// leaving it behind is how the HUD and the save disagree after a load.
export function migrateLegacy() {
  if (readRaw(MIGRATED_KEY) === MIGRATION_STAMP) return null;
  const stamp = readRaw(MIGRATED_KEY);
  const moneyRaw = readRaw(MONEY_KEY);
  const loose = Number(moneyRaw);
  const looseMoney = Number.isFinite(loose) && loose >= 0 ? loose : null;
  // Read before the loop: writeSlot() sets this marker itself, so by the time
  // the rename is done it no longer says what v1 left behind.
  const lastRaw = readRaw(LAST_KEY);
  let first = null;

  // (a) the v1 slots, renamed under Tom.
  for (const n of SLOT_NUMBERS) {
    const raw = readRaw(KEY_PREFIX + n);
    if (raw === null) continue;
    removeRaw(KEY_PREFIX + n);
    let obj = null;
    try { obj = JSON.parse(raw); } catch { obj = null; }
    if (!obj || typeof obj !== 'object') continue;
    const save = normalizeSave({
      ...obj,
      version: SAVE_VERSION,
      character: DEFAULT_CHARACTER,
      day: 0,
      fuel: null,
      target: DEFAULT_TARGET,
      summerOver: false,
      reached: false,
      // A v1 slot that never stored money takes the wallet's old private key,
      // because that is where the number on screen was actually coming from.
      money: typeof obj.money === 'number' ? obj.money : (looseMoney != null ? looseMoney : START_MONEY),
      mission: null,
    }, `${DEFAULT_CHARACTER}.${n}`);
    if (writeSlot(`${DEFAULT_CHARACTER}.${n}`, save) && !first) first = save;
  }
  if (SLOT_NUMBERS.includes(lastRaw)) writeRaw(LAST_KEY, `${DEFAULT_CHARACTER}.${lastRaw}`);

  // (b) the pre-slot keys, for a player who has nothing else.
  if (!first && stamp !== '1' && !hasAnySave()) {
    const progRaw = readRaw('aylmer.progress');
    const bestRaw = readRaw('aylmer.best');
    const garageRaw = readRaw('aylmer.garage');
    if (progRaw !== null || moneyRaw !== null || bestRaw !== null || garageRaw !== null) {
      const parse = (raw, dflt) => { try { return raw ? JSON.parse(raw) : dflt; } catch { return dflt; } };
      const garage = garageRaw !== null ? loadGarage() : { carId: null, parked: {}, health: {} };
      const save = normalizeSave({
        version: SAVE_VERSION,
        name: 'Ancienne partie',
        savedAt: new Date().toISOString(),
        playtime: 0,
        character: DEFAULT_CHARACTER,
        carId: garage.carId || DEFAULT_CAR,
        parked: garage.parked || {},
        health: garage.health || {},
        money: looseMoney != null ? looseMoney : START_MONEY,
        progress: parse(progRaw, []),
        best: parse(bestRaw, {}),
        timeOfDay: 'day',
        day: 0,
        fuel: null,
        target: DEFAULT_TARGET,
        summerOver: false,
        reached: false,
        mission: null,
      }, `${DEFAULT_CHARACTER}.auto`);
      writeSlot(`${DEFAULT_CHARACTER}.auto`, save);
      first = save;
    }
  }

  removeRaw(MONEY_KEY);
  writeRaw(MIGRATED_KEY, MIGRATION_STAMP);
  return first;
}

// ---------------------------------------------------------------- formatting

export function fmtPlaytime(seconds) {
  const s = Math.max(0, Math.round(num(seconds, 0)));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function fmtWhen(iso, lang = 'fr') {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
    + (lang === 'en' ? '' : '');
}

export function carName(id) {
  const c = CARS.find((x) => x.id === id);
  return c ? c.name : id || '—';
}
