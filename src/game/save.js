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
//          reached,mission,replayPaid,dadCalls}
//   aylmer.save.last                   the slot F5 quick-saves into (qualified)
//   aylmer.save.migrated               the migration stamp; '2' once v1 is folded in
//   aylmer.save.<slot>.corrupt         the bytes of a slot that would not parse,
//                                      kept aside before anything is written over it
//   aylmer.save.<slot>.v1              a v1 slot that found a v2 slot already there
//
// Reliability rules (docs/review/save-reliability.md, SR-03..SR-08):
//   - a write is read back before it counts, and a failed one is reported
//     (onSaveFailure / the 'aylmer:save-failed' event) instead of vanishing;
//   - a slot written by a NEWER build is never overwritten by this one, and
//     fields this build does not know are carried through, not stripped;
//   - a slot that will not parse is listed as damaged, never as empty;
//   - the migration deletes a v1 slot only after its v2 copy is verified, and
//     stamps itself done only when every slot made it;
//   - a slot with no `unlocks` loads with the default garage, never with
//     whatever the previous summer left in memory;
//   - after « Effacer toutes les sauvegardes » nothing is written until a new
//     summer starts (Garage.reset() calls resumeSaving()).
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
import { curbSpot, lotSpot } from './parkspots.js';
import { CARS } from './cars.js';
import { loadGarage, PROGRESS_KEYS, KEYS } from './store.js';
import { storageInfo } from './storage-ns.js';
import { isRetired } from './campaign.js';

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

// The summer: Tuesday 22 June to Monday 6 September 2004, 77 days, 0-based.
// Restructure (29 Sept 2026): it used to start on Saturday 26 June (73 days).
// A slot written before that has no `calendar` stamp, and its day index is
// moved forward by CALENDAR_SHIFT on load so the date it shows does not change.
export const DAYS = 77;
export const CALENDAR = 2;
export const CALENDAR_SHIFT = 4;
// The streets-known counter keeps names, capped so a corrupt slot stays small.
export const STREETS_MAX = 2000;
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
  // Unsold beaters start on the used lot, matching homes.js and main.js.
  cutlass: 'usedlot', caravan: 'usedlot', bus: 'usedlot', benz: 'usedlot',
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

// curbSpot() (a parking spot at the kerb in front of a place) and lotSpot() (a
// place in the used lot's row) are in parkspots.js, shared with homes.js.
export { curbSpot };

// A spot on the apron IN FRONT of the building rather than at the kerb, for a
// car whose spec says `park: 'building'`. The golf cart parks here so that its
// « E — prendre le cart » prompt does not fight the job marker out on the
// street: the mission runner offers a job inside 12 m of the giver, and a car
// inside 6.5 m of you, and only one of them can win.
// `side` slides the spot sideways (metres, to the right looking from the
// building toward the marker), for a building so deep that the spot straight
// out from it is either inside it or on top of the job marker.
export function apronSpot(p, back = 12, side = 0) {
  const bx = p.bx ?? p.x, bz = p.bz ?? p.z;
  const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz);
  if (d < back + 2) return curbSpot(p, 0);        // nothing to stand off from
  const ux = dx / d, uz = dz / d;
  return { x: bx - ux * back + uz * side, z: bz - uz * back - ux * side, yaw: p.a || 0 };
}

// Where every car sits when nobody has moved it: at its owner's curb or lot.
// Cars sharing a driveway are spaced by their order in CARS. The unsold beaters
// sit nose-to-tail on the used lot, in the row main.js's homeParked() uses
// (lotSpot, in CARS order). save.js has no garage, so it cannot know which
// beaters were bought: a slot's own `parked` says where a bought one is, and
// this is only the fallback for a car the slot says nothing about.
export function homeParked() {
  const out = {}, slots = {};
  let lot = 0;
  for (const c of CARS) {
    const k = OWNER[c.id];
    const p = PLACES[k];
    if (!p) continue;
    if (k === 'usedlot') { out[c.id] = lotSpot(p, lot++); continue; }
    const slot = (slots[k] = (slots[k] || 0) + 1) - 1;
    out[c.id] = c.park === 'building' ? apronSpot(p, c.parkBack ?? 12, c.parkSide ?? 0) : curbSpot(p, slot);
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
    // 2a's three: the day index into the 77-day summer, the litres in the tank
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
    // The economy's memory: which game day each replay was last paid
    // (missionkit.js runPay) and Dad's calls so far (dadcall.js). Without them
    // a reload pays one extra replay and lets Dad call again.
    replayPaid: {},
    dadCalls: { n: 0, week: null, log: [] },
    // The day index is counted from 22 June (see CALENDAR).
    calendar: CALENDAR,
    // « Rues d'Aylmer que tu connais »: the named streets driven so far.
    streets: [],
  };
}

// { jobId: dayIndex }. Anything else is dropped; an old save has none.
function normalizeReplayPaid(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of Object.keys(raw)) {
    const d = raw[id];
    if (typeof d === 'number' && isFinite(d) && d >= 0) out[id] = Math.floor(d);
  }
  return out;
}
// { n, week, log[] } (dadcall.js). An old save, or a number from story.js's
// dadCall(n) sketch, becomes a count with no week so the rules still hold.
function normalizeDadCalls(raw) {
  if (typeof raw === 'number' && isFinite(raw)) return { n: Math.max(0, Math.floor(raw)), week: null, log: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { n: 0, week: null, log: [] };
  const n = Math.max(0, Math.floor(num(raw.n, 0)));
  const week = typeof raw.week === 'number' && isFinite(raw.week) ? Math.max(0, Math.floor(raw.week)) : null;
  const log = Array.isArray(raw.log)
    ? raw.log.filter((e) => e && typeof e === 'object').slice(-12)
      .map((e) => ({ day: Math.max(0, Math.floor(num(e.day, 0))), amount: Math.max(0, Math.round(num(e.amount, 0))), why: typeof e.why === 'string' ? e.why.slice(0, 12) : '' }))
    : [];
  return { n, week, log };
}

// The keys a live mission rebuilds for itself out of the def, so they must not
// come back out of a save: `stages` is def.build(), `target` is stageTarget(),
// and `def` is the def. Everything else on the mission object is live state.
const MISSION_STRUCTURAL = new Set(['def', 'stages', 'target', 'idx', 'timeLeft', 'elapsed', 'failed', 'styleStart']);

// A job in progress, small and flat. Only scalars: the stage objects hang
// meters, spawned rivals and prop handles off the mission too (`m.donut`,
// `m.legs`, `m.couch`), and those are rebuilt by the stage's own onEnter when
// the job resumes — a stale copy of one is worse than none.
export function resumeStage(def, stages, idx) {
  if (def && typeof def.resumeAt === 'function') {
    try {
      const r = Math.round(Number(def.resumeAt(idx, stages)));
      if (Number.isFinite(r)) return Math.max(0, Math.min(idx, r));
    } catch { /* fall through to the generic rule */ }
  }
  if (!Array.isArray(stages)) return idx;
  for (let i = idx; i >= 0; i--) if (stages[i] && stages[i].kind === 'grid') return i < idx ? i : idx;
  return idx;
}

export function missionSnapshot(G) {
  const m = G && G.mission;
  if (!m || !m.def || typeof m.def.id !== 'string' || !Array.isArray(m.stages)) return null;
  const state = {};
  for (const k of Object.keys(m)) {
    if (MISSION_STRUCTURAL.has(k)) continue;
    const v = m[k], ty = typeof v;
    if (ty === 'string' ? v.length <= 200 : (ty === 'boolean' || (ty === 'number' && isFinite(v)))) state[k] = v;
  }
  let stage = Math.max(0, Math.min(m.stages.length - 1, Math.round(num(m.idx, 0))));
  let timeLeft = typeof m.timeLeft === 'number' && isFinite(m.timeLeft) ? Math.max(0, m.timeLeft) : null;
  // SR-10: a resume rebuilds only the stage it lands on. A stage whose world
  // was built by an EARLIER stage's onEnter — a race, whose rivals and legs
  // the grid spawns — would come back empty. So the save points at the stage
  // that builds it: the def's own resumeAt(idx) if it has one, otherwise the
  // last 'grid' stage at or before this one. The race restarts from the line
  // with its rivals, instead of resuming with nobody to race.
  const back = resumeStage(m.def, m.stages, stage);
  if (back !== stage) {
    stage = back;
    timeLeft = null;                     // the stage sets its own clock on entry
    delete state.stageTime; delete state.held; delete state.race;
  }
  return {
    id: m.def.id,
    stage,
    timeLeft,
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

// Every top-level field this build understands. Anything else in a slot was
// written by a newer build (or another branch) and is carried through as-is.
const KNOWN_FIELDS = new Set(['version', 'name', 'near', 'doing', 'last', 'savedAt', 'playtime',
  'character', 'carId', 'parked', 'health', 'money', 'progress', 'best', 'unlocks', 'stats',
  'timeOfDay', 'visualHour', 'day', 'fuel', 'target', 'summerOver', 'reached', 'mission', 'slot',
  'newer', 'corrupt', 'replayPaid', 'dadCalls', 'bestLegacy']);

// W7-BUGS: a save taken in the middle of a job that has since been cut.
// « arcsurchauffe » (D31, Tom 13 Oct 2026) blew the Ranger's radiator hose on
// the Champlain at its stage 1 (restoreDamage to at least HOSE_DAMAGE) and only
// repaired it when you paid Norm at its last stage (index 7). With no code left,
// such a save loaded with the job dropped (« Job perdue ») but the hose damage
// kept: a wrench on the map and a repair bill for a beat that never happened,
// while the S4-SUMMER calendar already holds the sauna to its own date. The
// promise in campaign.js is « goes straight on to the sauna », so: the cut job
// is not carried, and the hose damage it put on the truck comes off. Damage
// above the hose's own (a crash on top of it) stays. The day is not moved:
// the wait line and Z (sleep) take the player to the sauna's date.
export const COURSE_ID_RE = /^(bz|cp)_/;   // [w7-polish] modes.js course ids
export const RETIRED_HOSE = { id: 'arcsurchauffe', damage: 55, blownAt: 2, paidAt: 7 };
export function migrateRetiredJob(raw) {
  if (!raw || typeof raw !== 'object' || !raw.mission || typeof raw.mission !== 'object') return raw;
  const id = raw.mission.id;
  if (typeof id !== 'string' || !isRetired(id)) return raw;
  const out = { ...raw, mission: null, doing: '' };
  const stage = Math.round(num(raw.mission.stage, 0));
  if (id === RETIRED_HOSE.id && stage >= RETIRED_HOSE.blownAt && stage <= RETIRED_HOSE.paidAt
    && raw.health && typeof raw.health === 'object') {
    const car = typeof raw.carId === 'string' ? raw.carId : 'ranger';
    const h = raw.health[car];
    if (typeof h === 'number' && isFinite(h) && h <= RETIRED_HOSE.damage) out.health = { ...raw.health, [car]: 0 };
  }
  return out;
}

// Anything that comes out of localStorage (or out of another agent's hands) is
// run through this before the game sees it.
export function normalizeSave(raw, slot = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  raw = migrateRetiredJob(raw);
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
  // [w7-polish] Course bests are race time from GO now (missionkit.js
  // courseTime). A save written before has no `bestLegacy`: its course bests
  // (bz_*, cp_*) were grid-inclusive, so they move there. They still mean
  // « won once » (no second purse) and are never compared with a race time.
  const bestLegacy = {};
  if (raw.bestLegacy && typeof raw.bestLegacy === 'object') {
    for (const id of Object.keys(raw.bestLegacy)) {
      const v = raw.bestLegacy[id];
      if (typeof v === 'number' && isFinite(v) && v >= 0) bestLegacy[id] = v;
    }
  } else {
    for (const id of Object.keys(best)) if (COURSE_ID_RE.test(id)) { bestLegacy[id] = best[id]; delete best[id]; }
  }
  // The slot says whose summer this is; the blob only gets a say when the slot
  // does not (a hand-built save handed over by another module).
  const character = slotCharacter(slot)
    || (CHARACTER_IDS.includes(raw.character) ? raw.character : DEFAULT_CHARACTER);
  const startCar = characterById(character).car;
  const fallbackCar = carIds.includes(startCar) ? startCar : DEFAULT_CAR;
  const carId = carIds.includes(raw.carId) ? raw.carId : fallbackCar;
  const home = homeParked();
  // A car with no valid saved spot returns to its default curb or lot spot.
  for (const id of carIds) if (!parked[id]) parked[id] = home[id] || homeSpot(id);
  // Fields a newer build wrote and this one has never heard of ride along
  // untouched (SR-05): an older checkout on the same origin must not strip them.
  const foreign = {};
  for (const k of Object.keys(raw)) if (!KNOWN_FIELDS.has(k)) foreign[k] = raw[k];
  return {
    ...foreign,
    version: Number.isInteger(raw.version) ? raw.version : SAVE_VERSION,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
    near: typeof raw.near === 'string' ? raw.near.slice(0, 60) : '',
    doing: typeof raw.doing === 'string' ? raw.doing.slice(0, 60) : '',
    last: typeof raw.last === 'string' ? raw.last.slice(0, 60) : '',
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date(0).toISOString(),
    playtime: Math.max(0, num(raw.playtime, 0)),
    character,
    carId,
    parked,
    health,
    money: num(raw.money, START_MONEY) >= 0 ? num(raw.money, START_MONEY) : START_MONEY,
    progress: Array.isArray(raw.progress) ? raw.progress.filter((v) => typeof v === 'string') : [],
    best,
    bestLegacy,
    unlocks: raw.unlocks && typeof raw.unlocks === 'object' ? raw.unlocks : null,
    stats: raw.stats && typeof raw.stats === 'object' ? raw.stats : {},
    timeOfDay: typeof raw.timeOfDay === 'string' ? raw.timeOfDay : 'day',
    ...(Number.isFinite(raw.visualHour) ? { visualHour: ((raw.visualHour % 24) + 24) % 24 } : {}),
    // 2a's fields, clamped to what the summer can actually mean. `fuel` is
    // null-or-litres on purpose: null is "the tank has never been touched",
    // which is not the same number as an empty one.
    // Clamped, not rounded: 2a's calendar advances `day` as a float (a job part
    // way through Tuesday is 1.4), and snapping it here would quietly move the
    // deadline every time you saved.
    day: Math.min(DAYS - 1, Math.max(0, num(raw.day, 0) + (raw.calendar === CALENDAR ? 0 : CALENDAR_SHIFT))),
    calendar: CALENDAR,
    streets: Array.isArray(raw.streets)
      ? [...new Set(raw.streets.filter((v) => typeof v === 'string' && v.length < 120))].slice(0, STREETS_MAX) : [],
    fuel: typeof raw.fuel === 'number' && isFinite(raw.fuel)
      ? Math.min(FUEL_MAX, Math.max(0, raw.fuel)) : null,
    target: Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.round(num(raw.target, DEFAULT_TARGET)))),
    summerOver: raw.summerOver === true,
    reached: raw.reached === true,
    mission: normalizeMission(raw.mission),
    replayPaid: normalizeReplayPaid(raw.replayPaid),
    dadCalls: normalizeDadCalls(raw.dadCalls),
    slot: qualifySlot(slot) || qualifySlot(raw.slot) || '',
  };
}

// ---------------------------------------------------------------- slot i/o

// The garage a summer starts with. A slot that carries no `unlocks` (every
// migrated v1 save, and any save written without a garage module) loads with
// THIS, not with whatever the previous character left in memory (SR-04).
export function defaultUnlocks() {
  return { bought: [], seen: [], mods: {}, feats: [] };
}

export const CORRUPT_SUFFIX = '.corrupt';
export const V1_BACKUP_SUFFIX = '.v1';
const PROBE_KEY = KEY_PREFIX + 'probe';

// ---- failure reporting (SR-07)
//
// A write that did not land is never silent any more: the caller still gets
// false/null as before, and on top of that every listener and a DOM event
// ('aylmer:save-failed', detail = { slot, reason }) hear about it. The HUD
// toast lives in main.js; this is the hook it listens on.
//   reason: 'blocked'  the browser refuses site data
//           'quota'    setItem threw (full, or refused mid-session)
//           'verify'   the write did not read back
//           'newer'    the slot belongs to a newer build and is left alone
//           'corrupt'  a damaged slot could not be put aside first
//           'wiped'    everything was just erased; nothing is written until a
//                      new summer starts (not reported: it is on purpose)
let lastError = null;
const failureListeners = new Set();
export function onSaveFailure(fn) {
  if (typeof fn !== 'function') return () => {};
  failureListeners.add(fn);
  return () => failureListeners.delete(fn);
}
export function lastSaveError() { return lastError; }
function reportFailure(slot, reason) {
  lastError = { slot: slot || '', reason, at: Date.now() };
  if (reason === 'wiped') return;
  for (const fn of [...failureListeners]) { try { fn(lastError); } catch { /* a listener's problem */ } }
  try {
    if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent('aylmer:save-failed', { detail: lastError }));
    }
  } catch { /* no DOM */ }
}

// setItem, then read it back: only a string that is really there counts.
function putVerified(key, value) {
  const s = store();
  if (!s) return 'blocked';
  try { s.setItem(key, value); } catch { return 'quota'; }
  try { return s.getItem(key) === value ? null : 'verify'; } catch { return 'verify'; }
}

// ---- persistence (SR-07)
//
// Safari (and any browser under storage pressure) may evict script-written
// storage. Asking once for persistent storage, after the first save that
// actually landed, is the cheap half of the fix.
let persistAsked = false;
let persistState = 'unknown';
export function persistenceState() { return persistState; }
export function requestPersistence() {
  if (persistAsked) return Promise.resolve(persistState);
  persistAsked = true;
  let sm = null;
  try { sm = globalThis.navigator && globalThis.navigator.storage; } catch { sm = null; }
  if (!sm || typeof sm.persist !== 'function') { persistState = 'unsupported'; return Promise.resolve(persistState); }
  const already = typeof sm.persisted === 'function' ? Promise.resolve().then(() => sm.persisted()) : Promise.resolve(false);
  return already
    .then((yes) => (yes ? true : sm.persist()))
    .then((granted) => { persistState = granted ? 'granted' : 'denied'; return persistState; })
    .catch(() => { persistState = 'denied'; return persistState; });
}

/**
 * Can this page save at all? Writes, reads back and removes a probe key.
 * { ok, reason, review, memory, persisted } — main.js can show a badge when
 * ok is false (see the patch in docs/review/save-reliability.md).
 */
export function storageHealth() {
  const info = storageInfo();
  let reason = null;
  if (!store()) reason = 'blocked';
  else {
    const v = String(Date.now());
    reason = putVerified(PROBE_KEY, v);
    removeRaw(PROBE_KEY);
  }
  return {
    ok: !reason && !info.memory, reason: info.memory ? 'blocked' : reason,
    review: info.review || null, memory: !!info.memory, persisted: persistState,
  };
}

// ---- the wipe guard (SR-08)
let savingBlocked = false;
export function isSavingBlocked() { return savingBlocked; }
/** A new summer has started (Garage.reset() calls this): saving is allowed again. */
export function resumeSaving() { savingBlocked = false; }

// What is in a slot, without throwing: 'empty', 'ok', 'newer' (written by a
// newer build: readable, never overwritten), or 'corrupt' (the bytes are there
// and do not parse — shown as damaged, never as empty).
export function slotState(slot) {
  const raw = readRaw(slotKey(slot));
  if (raw === null) return { state: 'empty', save: null, raw: null };
  let obj = null;
  try { obj = JSON.parse(raw); } catch { obj = null; }
  const save = normalizeSave(obj, slot);
  if (!save) return { state: 'corrupt', save: null, raw };
  if (save.version > SAVE_VERSION) return { state: 'newer', save, raw };
  return { state: 'ok', save, raw };
}

export function readSlot(slot) {
  const st = slotState(slot);
  if (!st.save) return null;
  const save = st.save;
  if (!save.unlocks) save.unlocks = defaultUnlocks();
  if (st.state === 'newer') save.newer = true;
  return save;
}

// Carry what a newer build stored into the blob this build is about to write:
// unknown top-level fields, and parked/health rows for cars this build does not
// have. Our own fields always win.
function keepForeign(prevRaw, clean) {
  let prev = null;
  try { prev = prevRaw ? JSON.parse(prevRaw) : null; } catch { prev = null; }
  if (!prev || typeof prev !== 'object' || Array.isArray(prev)) return clean;
  const carIds = new Set(CARS.map((c) => c.id));
  for (const k of Object.keys(prev)) if (!KNOWN_FIELDS.has(k) && !(k in clean)) clean[k] = prev[k];
  for (const f of ['parked', 'health']) {
    const src = prev[f];
    if (!src || typeof src !== 'object') continue;
    for (const id of Object.keys(src)) if (!carIds.has(id) && !(id in clean[f])) clean[f][id] = src[id];
  }
  if (!clean.unlocks && prev.unlocks && typeof prev.unlocks === 'object') clean.unlocks = prev.unlocks;
  return clean;
}

export function writeSlot(slot, save, opts = {}) {
  const id = qualifySlot(slot);
  if (!id) return false;
  if (savingBlocked && !opts.migrating) { reportFailure(id, 'wiped'); return false; }
  const clean = normalizeSave(save, id);
  if (!clean) return false;
  delete clean.slot; delete clean.newer; delete clean.corrupt;
  const key = slotKey(id);
  const prevRaw = readRaw(key);
  if (prevRaw !== null) {
    const prev = slotState(id);
    if (prev.state === 'newer' && !opts.force) { reportFailure(id, 'newer'); return false; }
    if (prev.state === 'corrupt') {
      // Never write over the only copy of something we cannot read.
      if (putVerified(key + CORRUPT_SUFFIX, prevRaw)) { reportFailure(id, 'corrupt'); return false; }
    }
    keepForeign(prevRaw, clean);
  }
  // Whatever it said before, what THIS build writes is this build's version.
  clean.version = SAVE_VERSION;
  const body = JSON.stringify(clean);
  let err = putVerified(key, body);
  // [w7-replay] a summer is never lost to a ghost: on quota, ghosts go first.
  if (err === 'quota' && evictGhostFor(() => !(err = putVerified(key, body)))) err = null;
  if (err) { reportFailure(id, err); return false; }
  if (slotNumber(id) !== 'auto') writeRaw(LAST_KEY, id);
  requestPersistence();
  return true;
}

export function deleteSlot(slot) {
  const id = qualifySlot(slot);
  if (!id) return false;
  removeRaw(slotKey(id));
  removeRaw(slotKey(id) + CORRUPT_SUFFIX);
  if (lastSlot() === id) removeRaw(LAST_KEY);
  return true;
}

// « Effacer toutes les sauvegardes » (SR-08). Everything that is progress goes:
// the twenty slots and their damaged/v1 copies, the F5 marker, any v1 slot a
// failed migration left, and every per-browser progress key store.js lists in
// PROGRESS_KEYS (garage mirror, hangout gifts and nights, best laps, mode
// records, achievements, the legacy scratch keys). Settings, the radio and its
// library stay. Until a new summer starts nothing is written, so the game
// running behind the pause menu cannot autosave the wiped summer back.
// The erased values are kept in memory for undoWipe(), for the toast's life.
let wipeBackup = null;
export function wipeKeys() {
  const keys = [LAST_KEY];
  for (const s of SLOTS) keys.push(slotKey(s), slotKey(s) + CORRUPT_SUFFIX, slotKey(s) + V1_BACKUP_SUFFIX);
  for (const n of SLOT_NUMBERS) keys.push(KEY_PREFIX + n);
  keys.push(...PROGRESS_KEYS);
  // [w7-replay] records and ghosts go with everything else.
  keys.push(RECORDS_KEY, RECORDS_KEY + '.corrupt', GHOSTS_INDEX_KEY, ...ghostKeysInStore());
  return keys;
}
export function deleteAllSaves() {
  const backup = {};
  for (const k of wipeKeys()) {
    const v = readRaw(k);
    if (v === null) continue;
    backup[k] = v;
    removeRaw(k);
  }
  wipeBackup = backup;
  savingBlocked = true;
  return true;
}
/** Put back what the last deleteAllSaves() erased (this page only). */
export function undoWipe() {
  if (!wipeBackup) return false;
  let ok = true;
  for (const [k, v] of Object.entries(wipeBackup)) if (putVerified(k, v)) ok = false;
  wipeBackup = null;
  savingBlocked = false;
  return ok;
}

// ---- records and ghosts ([w7-replay], spec C-02b)
//
//   aylmer.records          { v: 1, rows: { [id]: Row } }
//   aylmer.records.corrupt  the bytes of a records blob that would not parse
//   aylmer.ghosts           { v: 1, rows: { [id]: { chars, t, at, used } } }
//   aylmer.ghost.<id>       one ghost: JSON header plus base64 Float32 frames
//
// Browser-wide, beside the slots, not inside them: the next person on the
// couch races your time. Each row says which playable character and which car
// set it; no free text is ever stored. Ids: a course id as is (bz_vieux), a
// story stage as stage:<job>:<n>-<of>, sub-records with a colon.
// Row: { t, better, by, car, at, top: [{ t, by, car, at }] }, top best first.
export const RECORDS_KEY = 'aylmer.records';
export const RECORD_TOP = 5;
export const RECORD_ROWS_MAX = 200;
export const RECORD_ID_RE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;
const LEGACY_MODES_KEY = 'aylmer.modes';
const CAR_IDS = new Set(CARS.map((c) => c.id));
const betterThan = (a, b, better) => (better === 'higher' ? a > b : a < b);
const warnedFlip = new Set();

function readRecords() {
  const raw = readRaw(RECORDS_KEY);
  if (raw === null) return { all: { v: 1, rows: {} }, raw, bad: false };
  try {
    const all = JSON.parse(raw);
    if (all && typeof all === 'object' && all.rows && typeof all.rows === 'object') return { all, raw, bad: false };
  } catch { /* fall through */ }
  return { all: { v: 1, rows: {} }, raw, bad: true };
}
function legacyRow(id) {
  try {
    const old = JSON.parse(readRaw(LEGACY_MODES_KEY) || '{}');
    const t = old && old[id];
    if (typeof t === 'number' && isFinite(t) && t >= 0) {
      return { t, better: 'lower', by: '', car: '', at: 0, legacy: true, top: [{ t, by: '', car: '', at: 0 }] };
    }
  } catch { /* no legacy table */ }
  return null;
}
const copyRow = (r) => (r ? { ...r, top: (r.top || []).map((x) => ({ ...x })) } : null);

/** The record for an id (a copy), or null. Folds in the old aylmer.modes best. */
export function loadRecord(id) {
  if (!RECORD_ID_RE.test(String(id || ''))) return null;
  const { all } = readRecords();
  return copyRow(all.rows[id] || legacyRow(id));
}
/** Every record whose id starts with prefix, sorted by id. */
export function listRecords(prefix = '') {
  const { all } = readRecords();
  return Object.keys(all.rows).filter((k) => k.startsWith(prefix)).sort()
    .map((k) => ({ id: k, ...copyRow(all.rows[k]) }));
}
/**
 * Put one run on the table. -> { ok, isNew, record, prev, rank, reason }
 * isNew: strictly better than the stored best (a tie is not a record).
 */
export function saveRecord(id, value, info = {}) {
  if (!RECORD_ID_RE.test(String(id || ''))) return { ok: false, reason: 'id' };
  if (typeof value !== 'number' || !isFinite(value) || value < 0) return { ok: false, reason: 'value' };
  if (savingBlocked) return { ok: false, reason: 'wiped' };
  const t = Math.round(value * 1000) / 1000;
  const { all, raw, bad } = readRecords();
  let row = all.rows[id] || legacyRow(id);
  const better0 = info.better === 'higher' ? 'higher' : 'lower';
  if (row && row.better !== better0 && !warnedFlip.has(id)) {
    warnedFlip.add(id);
    console.warn(`records: ${id} keeps '${row.better}'`);
  }
  const better = row ? row.better : better0;
  const by = CHARACTER_IDS.includes(info.by) ? info.by : '';
  const car = CAR_IDS.has(info.car) ? info.car : '';
  const at = Date.now();
  const prev = row ? row.t : null;
  const isNew = prev == null || betterThan(t, prev, better);
  const top = row ? row.top.slice() : [];
  let rank = top.findIndex((x) => betterThan(t, x.t, better));
  if (rank < 0) rank = top.length;
  top.splice(rank, 0, { t, by, car, at });
  top.length = Math.min(top.length, RECORD_TOP);
  if (rank >= RECORD_TOP) rank = -1;
  row = { t: top[0].t, better, by: top[0].by, car: top[0].car, at, top };
  if (!all.rows[id]) {
    const ids = Object.keys(all.rows);
    if (ids.length >= RECORD_ROWS_MAX) {
      const oldest = ids.reduce((a, b) => ((all.rows[a].at || 0) <= (all.rows[b].at || 0) ? a : b));
      delete all.rows[oldest];
    }
  }
  all.rows[id] = row;
  if (bad && raw !== null && putVerified(RECORDS_KEY + '.corrupt', raw)) {
    reportFailure('records', 'corrupt');
    return { ok: false, reason: 'corrupt' };
  }
  const err = putVerified(RECORDS_KEY, JSON.stringify(all));
  if (err) { reportFailure('records', err); return { ok: false, reason: err }; }
  return { ok: true, isNew, record: copyRow(row), prev, rank, reason: null };
}

export const GHOST_KEY_PREFIX = 'aylmer.ghost.';
export const GHOSTS_INDEX_KEY = 'aylmer.ghosts';
export const GHOST_MAX_BYTES = 262144;
export const GHOST_BUDGET_CHARS = 1200000;
export const GHOST_MAX_COUNT = 12;
const BIG_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 0;

function swap4(u8) {
  for (let i = 0; i + 3 < u8.length; i += 4) {
    let a = u8[i]; u8[i] = u8[i + 3]; u8[i + 3] = a;
    a = u8[i + 1]; u8[i + 1] = u8[i + 2]; u8[i + 2] = a;
  }
}
function encodeF32(frames) {
  const f = frames instanceof Float32Array ? frames : Float32Array.from(frames);
  const u8 = new Uint8Array(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength));
  if (BIG_ENDIAN) swap4(u8);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function decodeF32(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  if (BIG_ENDIAN) swap4(u8);
  return new Float32Array(u8.buffer, 0, u8.length >> 2);
}
function ghostKeysInStore() {
  const s = store();
  const out = [];
  if (!s) return out;
  try { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(GHOST_KEY_PREFIX)) out.push(k); } } catch { /* no key() */ }
  return out;
}
let ghostUsed = 0;
function readGhostIndex() {
  let idx = null;
  try { idx = JSON.parse(readRaw(GHOSTS_INDEX_KEY) || 'null'); } catch { idx = null; }
  if (!idx || typeof idx !== 'object' || !idx.rows) idx = { v: 1, rows: {} };
  // Repair: an index row with no ghost goes; a ghost with no row comes back.
  for (const id of Object.keys(idx.rows)) if (readRaw(GHOST_KEY_PREFIX + id) === null) delete idx.rows[id];
  for (const k of ghostKeysInStore()) {
    const id = k.slice(GHOST_KEY_PREFIX.length);
    if (!idx.rows[id]) {
      const raw = readRaw(k) || '';
      let t = 0; try { t = JSON.parse(raw).t || 0; } catch { /* kept, evicted first */ }
      idx.rows[id] = { chars: raw.length, t, at: 0, used: 0 };
    }
  }
  for (const r of Object.values(idx.rows)) if (r.used > ghostUsed) ghostUsed = r.used;
  return idx;
}
const nextUsed = () => (ghostUsed = Math.max(Date.now(), ghostUsed + 1));
const writeGhostIndex = (idx) => putVerified(GHOSTS_INDEX_KEY, JSON.stringify(idx));
function evictOldestGhost(idx, keep) {
  let victim = null;
  for (const [id, r] of Object.entries(idx.rows)) {
    if (id === keep) continue;
    if (!victim || r.used < idx.rows[victim].used) victim = id;
  }
  if (!victim) return false;
  removeRaw(GHOST_KEY_PREFIX + victim);
  delete idx.rows[victim];
  return true;
}
/** A slot write hit the quota: free room by dropping the least used ghosts. */
function evictGhostFor(retry) {
  const idx = readGhostIndex();
  while (Object.keys(idx.rows).length) {
    evictOldestGhost(idx, null);
    writeGhostIndex(idx);
    if (retry()) return true;
  }
  return false;
}

/** Store a ghost run. -> { ok, reason, chars } */
export function saveGhost(id, ghost, opts = {}) {
  if (!RECORD_ID_RE.test(String(id || ''))) return { ok: false, reason: 'id' };
  const g = ghost || {};
  const fr = g.frames;
  const hz = g.hz, stride = g.stride;
  if (!(hz >= 1 && hz <= 120) || !Number.isInteger(stride) || stride < 1 || stride > 16
    || !fr || !(fr.length > 0) || fr.length % stride !== 0
    || typeof g.t !== 'number' || !isFinite(g.t) || g.t < 0) return { ok: false, reason: 'shape' };
  for (let i = 0; i < fr.length; i++) if (!isFinite(fr[i])) return { ok: false, reason: 'shape' };
  if (fr.length * 4 > GHOST_MAX_BYTES) return { ok: false, reason: 'size' };
  if (savingBlocked) return { ok: false, reason: 'wiped' };
  const better = opts.better === 'higher' ? 'higher' : 'lower';
  const idx = readGhostIndex();
  const old = idx.rows[id];
  if (old && !opts.force && !betterThan(g.t, old.t, better)) return { ok: false, reason: 'slower' };
  let meta = {};
  try {
    const mj = JSON.stringify(g.meta || {});
    const scalars = g.meta && Object.values(g.meta).every((v) => v === null || ['number', 'string', 'boolean'].includes(typeof v));
    if (mj.length <= 1024 && scalars) meta = g.meta;
  } catch { meta = {}; }
  const at = Date.now();
  const blob = JSON.stringify({ v: 1, le: 1, hz, stride, n: fr.length / stride, t: g.t,
    car: CAR_IDS.has(g.car) ? g.car : '', by: CHARACTER_IDS.includes(g.by) ? g.by : '', at, meta, b64: encodeF32(fr) });
  const chars = blob.length;
  delete idx.rows[id];
  const total = () => Object.values(idx.rows).reduce((a, r) => a + (r.chars || 0), 0);
  while ((Object.keys(idx.rows).length >= GHOST_MAX_COUNT || total() + chars > GHOST_BUDGET_CHARS)
    && evictOldestGhost(idx, id)) { /* evicted one */ }
  let err = putVerified(GHOST_KEY_PREFIX + id, blob);
  while (err === 'quota' && evictOldestGhost(idx, id)) { writeGhostIndex(idx); err = putVerified(GHOST_KEY_PREFIX + id, blob); }
  if (err) {
    // A throwing setItem left the old ghost in place: keep its row.
    if (old && err === 'quota') idx.rows[id] = old; else removeRaw(GHOST_KEY_PREFIX + id);
    writeGhostIndex(idx);
    return { ok: false, reason: err, chars };
  }
  idx.rows[id] = { chars, t: g.t, at, used: nextUsed() };
  writeGhostIndex(idx);
  return { ok: true, reason: null, chars };
}
/** -> { id, hz, stride, frames: Float32Array, t, car, by, at, meta } | null */
export function loadGhost(id) {
  if (!RECORD_ID_RE.test(String(id || ''))) return null;
  const raw = readRaw(GHOST_KEY_PREFIX + id);
  if (raw === null) return null;
  let h;
  try { h = JSON.parse(raw); } catch { return null; }
  if (!h || typeof h.b64 !== 'string') return null;
  let frames;
  try { frames = decodeF32(h.b64); } catch { return null; }
  if (!savingBlocked) {
    const idx = readGhostIndex();
    if (idx.rows[id]) { idx.rows[id].used = nextUsed(); writeGhostIndex(idx); }
  }
  return { id, hz: h.hz, stride: h.stride, frames, t: h.t, car: h.car || '', by: h.by || '', at: h.at || 0, meta: h.meta || {} };
}
export function deleteGhost(id) {
  if (readRaw(GHOST_KEY_PREFIX + id) === null) return false;
  removeRaw(GHOST_KEY_PREFIX + id);
  const idx = readGhostIndex();
  delete idx.rows[id];
  writeGhostIndex(idx);
  return true;
}
export function ghostStats() {
  const idx = readGhostIndex();
  const rows = Object.values(idx.rows);
  return { count: rows.length, chars: rows.reduce((a, r) => a + (r.chars || 0), 0), budget: GHOST_BUDGET_CHARS };
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
    const st = slotState(slot);
    if (st.state === 'empty') return { slot, character: who, empty: true };
    // Damaged: the bytes are there and do not parse. Shown as a slot with a
    // warning, never as an empty box you might save over (SR-06). Saving into
    // it anyway puts the old bytes aside under `<key>.corrupt` first.
    if (st.state === 'corrupt') {
      return {
        slot, character: who, empty: false, corrupt: true,
        name: 'Sauvegarde illisible (endommagée)', savedAt: null, playtime: 0,
        carId: characterById(who).car, money: 0, jobs: 0, best: {}, day: 0, target: DEFAULT_TARGET,
        job: null, save: null, near: '', doing: '', last: '',
      };
    }
    const s = readSlot(slot);
    const newer = st.state === 'newer';
    return {
      slot, character: who, empty: false, newer,
      name: newer ? `${s.name || ''} (version plus récente)`.trim() : s.name,
      savedAt: s.savedAt, playtime: s.playtime,
      carId: s.carId, money: s.money, jobs: s.progress.length, best: s.best,
      day: s.day, target: s.target, job: s.mission ? s.mission.id : null, save: s,
      near: s.near || '', doing: s.doing || '', last: s.last || '',
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

// Thomas, 2026-09-07: « make one auto save so you start at the end of the
// last mission you completed. » The autosave IS that (it is written at the
// end of every job and nowhere else), so « Continuer » takes the newest
// autosave across every character when there is one, and only falls back to
// the newest manual slot when nobody has finished a job yet. Manual slots are
// what the Charger screen is for.
export function mostRecentAuto() {
  let best = null, bt = -Infinity;
  for (const row of listAllSlots()) {
    if (row.empty || row.corrupt || slotNumber(row.slot) !== 'auto') continue;
    const t = Date.parse(row.savedAt) || 0;
    if (t > bt) { bt = t; best = row.slot; }
  }
  return best;
}
export function continueSlot() {
  return mostRecentAuto() || mostRecentSlot();
}

// The newest slot of any kind: newest savedAt wins, ties go to a real slot
// over the autosave. What the boot uses to know who you were.
export function mostRecentSlot() {
  let best = null, bt = -Infinity;
  for (const row of listAllSlots()) {
    if (row.empty || row.corrupt) continue;
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
  // [w7-polish] Crash Night's wrecks are the mode's, not the car's: its cleanup
  // puts the pre-night damage back, so a save taken mid-night keeps that one
  // (the load lands free roaming, modes.js resumeModeSave).
  const night = G.crashNight;
  if (v && night && typeof night.savedDamage === 'number' && isFinite(night.savedDamage)) health[G.carId] = clamp01(night.savedDamage);
  let unlocks = null;
  try { unlocks = G.garage?.serialize?.() ?? null; } catch { unlocks = null; }
  return normalizeSave({
    version: SAVE_VERSION,
    name: opts.name || '',
    // « Where were you, and what were you doing » — Thomas, 2026-09-07, after
    // a Continue that said « Tom · Chemin Fraser · il y a 2 h » and nothing
    // else. The street is `name`; this is the place it was next to and the
    // title of the job in progress, both plain strings so the menu can print
    // them without loading the world.
    near: typeof opts.near === 'string' ? opts.near.slice(0, 60) : '',
    doing: typeof opts.doing === 'string' ? opts.doing.slice(0, 60) : '',
    // The autosave is written at the end of a job; this is which one, so
    // « Continuer » can say « après Poutine express » instead of « libre ».
    last: typeof opts.last === 'string' ? opts.last.slice(0, 60) : '',
    savedAt: new Date().toISOString(),
    playtime: num(G.playtime, 0),
    character: G.character,
    carId: G.carId,
    parked,
    health,
    money: G.wallet ? G.wallet.value : START_MONEY,
    progress: [...(G.done || [])],
    best: { ...(G.best || {}) },
    bestLegacy: { ...(G.bestLegacy || {}) },   // [w7-polish] always written: marks the save as race-clock
    unlocks,
    stats: { ...(G.stats || {}) },
    timeOfDay: G.envKey || 'day',
    ...(G.renderer?.isPrototype ? { visualHour: G.dayClock / 600 * 24 } : {}),
    // 2a writes these three as the summer runs; here they just get kept.
    day: G.day,
    fuel: G.fuel,
    target: G.target,
    summerOver: G.summerOver,
    reached: G.reached,
    mission: missionSnapshot(G),
    replayPaid: { ...(G.replayPaid || {}) },
    dadCalls: G.dadCalls || null,
    calendar: CALENDAR,
    streets: [...(G.streets || [])],
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
//
// Write, verify, THEN delete (SR-03). A v1 slot is removed only once its v2
// copy reads back byte for byte; if any step fails (quota, a SecurityError
// mid-boot) the v1 data stays where it was, the stamp is not written, and the
// next boot tries again. The wallet key and the legacy scratch keys go only
// after everything that needed them is safely written.
//
// v1 kept purchases in the global `aylmer.cars` and nowhere else, so a v1
// slot (or the pre-slot game) with no `unlocks` of its own is given that
// record once, here (SR-04).
export function migrateLegacy() {
  if (readRaw(MIGRATED_KEY) === MIGRATION_STAMP) return null;
  const stamp = readRaw(MIGRATED_KEY);
  const moneyRaw = readRaw(MONEY_KEY);
  const loose = Number(moneyRaw);
  const looseMoney = moneyRaw !== null && Number.isFinite(loose) && loose >= 0 ? loose : null;
  // Read before the loop: a verified write does not touch it, but a v1 build
  // might have, and it is the only record of which v1 slot F5 meant.
  const lastRaw = readRaw(LAST_KEY);
  const legacyCars = (() => {
    try {
      const v = JSON.parse(readRaw(KEYS.cars) || 'null');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch { return null; }
  })();
  let first = null;
  let allOk = true;

  const put = (slot, save) => {
    const clean = normalizeSave(save, slot);
    if (!clean) return null;
    delete clean.slot;
    clean.version = SAVE_VERSION;
    const err = putVerified(slotKey(slot), JSON.stringify(clean));
    if (err) { reportFailure(slot, err); return null; }
    return clean;
  };
  const drop = (key) => { removeRaw(key); return readRaw(key) === null; };

  // (a) the v1 slots, renamed under Tom.
  for (const n of SLOT_NUMBERS) {
    const v1Key = KEY_PREFIX + n;
    const raw = readRaw(v1Key);
    if (raw === null) continue;
    const target = `${DEFAULT_CHARACTER}.${n}`;
    let obj = null;
    try { obj = JSON.parse(raw); } catch { obj = null; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      // Unreadable: keep its bytes beside the slot it would have become.
      if (putVerified(slotKey(target) + CORRUPT_SUFFIX, raw) || !drop(v1Key)) allOk = false;
      continue;
    }
    if (readRaw(slotKey(target)) !== null) {
      // A v2 slot is already there — a save made after an earlier, half-done
      // migration. It is newer by construction; the v1 copy is parked, not lost.
      if (putVerified(slotKey(target) + V1_BACKUP_SUFFIX, raw) || !drop(v1Key)) allOk = false;
      continue;
    }
    const written = put(target, {
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
      unlocks: obj.unlocks && typeof obj.unlocks === 'object' ? obj.unlocks : legacyCars,
      mission: null,
    });
    if (!written) { allOk = false; continue; }
    if (!drop(v1Key)) { allOk = false; continue; }
    if (!first) first = written;
  }
  if (SLOT_NUMBERS.includes(lastRaw)) writeRaw(LAST_KEY, `${DEFAULT_CHARACTER}.${lastRaw}`);

  // (b) the pre-slot keys, for a player who has nothing else.
  if (!first && allOk && stamp !== '1' && !hasAnySave()) {
    const progRaw = readRaw('aylmer.progress');
    const bestRaw = readRaw('aylmer.best');
    const garageRaw = readRaw('aylmer.garage');
    if (progRaw !== null || moneyRaw !== null || bestRaw !== null || garageRaw !== null) {
      const parse = (raw, dflt) => { try { return raw ? JSON.parse(raw) : dflt; } catch { return dflt; } };
      const garage = garageRaw !== null ? loadGarage() : { carId: null, parked: {}, health: {} };
      const written = put(`${DEFAULT_CHARACTER}.auto`, {
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
        unlocks: legacyCars,
        timeOfDay: 'day',
        day: 0,
        fuel: null,
        target: DEFAULT_TARGET,
        summerOver: false,
        reached: false,
        mission: null,
      });
      if (written) first = written; else allOk = false;
    }
  }

  if (!allOk) return first;              // no stamp: the next boot retries
  if (!putVerified(MIGRATED_KEY, MIGRATION_STAMP)) {
    removeRaw(MONEY_KEY);
    // SR-16: the scratch keys are dead once the stamp is down.
    for (const k of LEGACY_KEYS) removeRaw(k);
  }
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
  if (isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
    + (lang === 'en' ? '' : '');
}

export function carName(id) {
  const c = CARS.find((x) => x.id === id);
  return c ? c.name : id || '-';
}
