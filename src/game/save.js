// Deliberate saves.
//
// The game used to dribble state into localStorage as you drove — parked cars,
// damage, money, jobs, records — so your friends' cars ended up wherever you
// last abandoned them and there was no way back. Nothing here writes unless the
// player asks for it (pause → Sauvegarde → a slot, or F5) or an autosave event
// fires (a job finished, a car bought/unlocked) with autosave on in the options.
//
// Four slots: '1', '2', '3' and 'auto', one localStorage key each:
//
//   aylmer.save.1 … aylmer.save.auto   {version,name,savedAt,playtime,carId,
//                                       parked,health,money,progress,best,
//                                       unlocks,stats,timeOfDay}
//   aylmer.save.last                   the slot F5 quick-saves into
//   aylmer.save.migrated               "1" once the legacy keys have been folded in
//
// `parked` holds EVERY car including the one you were driving, so carId +
// parked[carId] is where you get put down when the slot is loaded.
import { PLACES } from './places.js';
import { CARS } from './cars.js';
import { loadGarage } from './store.js';

export const SAVE_VERSION = 1;
export const SLOTS = ['1', '2', '3', 'auto'];
export const KEY_PREFIX = 'aylmer.save.';
export const LAST_KEY = KEY_PREFIX + 'last';
export const MIGRATED_KEY = KEY_PREFIX + 'migrated';
// The legacy keys the migration reads exactly once.
export const LEGACY_KEYS = ['aylmer.progress', 'aylmer.money', 'aylmer.best', 'aylmer.garage'];

export const START_MONEY = 80;
export const DEFAULT_CAR = 'ranger';

// Whose driveway each car lives in. Margaret's Saturn shares the driveway at
// 299 Fraser with your Ranger, so the two of them get slots 0 and 1 there.
export const OWNER = { ranger: 'home', saturn: 'home', civic: 'steph', sunfire: 'dave' };

export const slotKey = (slot) => KEY_PREFIX + slot;

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

// Where every car sits when nobody has moved it: at its owner's curb.
// Cars sharing a driveway are spaced by their order in CARS.
export function homeParked() {
  const out = {}, slots = {};
  for (const c of CARS) {
    const k = OWNER[c.id];
    const p = PLACES[k];
    if (!p) continue;
    const slot = (slots[k] = (slots[k] || 0) + 1) - 1;
    out[c.id] = curbSpot(p, slot);
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

export function newSave(name = '') {
  return {
    version: SAVE_VERSION,
    name: name || '',
    savedAt: new Date().toISOString(),
    playtime: 0,
    carId: DEFAULT_CAR,
    parked: homeParked(),
    health: {},
    money: START_MONEY,
    progress: [],
    best: {},
    unlocks: null,
    stats: {},
    timeOfDay: 'day',
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
  const carId = carIds.includes(raw.carId) ? raw.carId : DEFAULT_CAR;
  const home = homeParked();
  // A car the save has nothing to say about is at home, not at (0,0).
  for (const id of carIds) if (!parked[id]) parked[id] = home[id] || homeSpot(id);
  return {
    version: Number.isInteger(raw.version) ? raw.version : SAVE_VERSION,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date(0).toISOString(),
    playtime: Math.max(0, num(raw.playtime, 0)),
    carId,
    parked,
    health,
    money: num(raw.money, START_MONEY) >= 0 ? num(raw.money, START_MONEY) : START_MONEY,
    progress: Array.isArray(raw.progress) ? raw.progress.filter((v) => typeof v === 'string') : [],
    best,
    unlocks: raw.unlocks && typeof raw.unlocks === 'object' ? raw.unlocks : null,
    stats: raw.stats && typeof raw.stats === 'object' ? raw.stats : {},
    timeOfDay: typeof raw.timeOfDay === 'string' ? raw.timeOfDay : 'day',
    slot: slot || raw.slot || '',
  };
}

// ---------------------------------------------------------------- slot i/o

export function readSlot(slot) {
  const raw = readRaw(slotKey(slot));
  if (!raw) return null;
  try { return normalizeSave(JSON.parse(raw), slot); } catch { return null; }
}

export function writeSlot(slot, save) {
  if (!SLOTS.includes(slot)) return false;
  const clean = normalizeSave(save, slot);
  if (!clean) return false;
  delete clean.slot;
  const okWrite = writeRaw(slotKey(slot), JSON.stringify(clean));
  if (okWrite && slot !== 'auto') writeRaw(LAST_KEY, slot);
  return okWrite;
}

export function deleteSlot(slot) {
  removeRaw(slotKey(slot));
  if (lastSlot() === slot) removeRaw(LAST_KEY);
  return true;
}

export function deleteAllSaves() {
  for (const s of SLOTS) removeRaw(slotKey(s));
  removeRaw(LAST_KEY);
  return true;
}

export function hasAnySave() { return SLOTS.some((s) => readRaw(slotKey(s)) !== null); }

export function lastSlot() {
  const v = readRaw(LAST_KEY);
  return SLOTS.includes(v) ? v : null;
}
export function setLastSlot(slot) {
  if (SLOTS.includes(slot)) writeRaw(LAST_KEY, slot);
  return slot;
}

// One row per slot for the load screen: empty ones included, so the picker can
// draw four boxes without knowing anything about localStorage.
export function listSlots() {
  return SLOTS.map((slot) => {
    const s = readSlot(slot);
    if (!s) return { slot, empty: true };
    return {
      slot, empty: false, name: s.name, savedAt: s.savedAt, playtime: s.playtime,
      carId: s.carId, money: s.money, jobs: s.progress.length, best: s.best, save: s,
    };
  });
}

// The slot « Continuer » resumes: newest savedAt wins, ties go to a real slot
// over the autosave.
export function mostRecentSlot() {
  let best = null, bt = -Infinity;
  for (const row of listSlots()) {
    if (row.empty) continue;
    const t = Date.parse(row.savedAt) || 0;
    if (t > bt || (t === bt && best === 'auto')) { bt = t; best = row.slot; }
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
    carId: G.carId,
    parked,
    health,
    money: G.wallet ? G.wallet.value : START_MONEY,
    progress: [...(G.done || [])],
    best: { ...(G.best || {}) },
    unlocks,
    stats: { ...(G.stats || {}) },
    timeOfDay: G.envKey || 'day',
  }, opts.slot || '');
}

export function saveToSlot(G, slot, opts = {}) {
  const snap = snapshot(G, { ...opts, slot });
  if (!writeSlot(slot, snap)) return null;
  snap.slot = slot;
  return snap;
}

// ---------------------------------------------------------------- migration

// One-shot: an existing player's aylmer.progress / money / best / garage become
// the 'auto' slot the first time this build runs. After that the flag is set and
// the legacy keys are never read again — the save slots are the only truth.
export function migrateLegacy() {
  if (readRaw(MIGRATED_KEY) === '1') return null;
  if (hasAnySave()) { writeRaw(MIGRATED_KEY, '1'); return null; }
  const progRaw = readRaw('aylmer.progress');
  const moneyRaw = readRaw('aylmer.money');
  const bestRaw = readRaw('aylmer.best');
  const garageRaw = readRaw('aylmer.garage');
  if (progRaw === null && moneyRaw === null && bestRaw === null && garageRaw === null) {
    writeRaw(MIGRATED_KEY, '1');
    return null;
  }
  const parse = (raw, dflt) => { try { return raw ? JSON.parse(raw) : dflt; } catch { return dflt; } };
  const garage = garageRaw !== null ? loadGarage() : { carId: null, parked: {}, health: {} };
  const money = Number(moneyRaw);
  const save = normalizeSave({
    version: SAVE_VERSION,
    name: 'Ancienne partie',
    savedAt: new Date().toISOString(),
    playtime: 0,
    carId: garage.carId || DEFAULT_CAR,
    parked: garage.parked || {},
    health: garage.health || {},
    money: Number.isFinite(money) && money >= 0 ? money : START_MONEY,
    progress: parse(progRaw, []),
    best: parse(bestRaw, {}),
    timeOfDay: 'day',
  }, 'auto');
  writeSlot('auto', save);
  writeRaw(MIGRATED_KEY, '1');
  return save;
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
