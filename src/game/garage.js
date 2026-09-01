// Who lets you drive what, and what you had to do to deserve it.
//
// Midtown Madness gave you one car and made you earn the rest. Same here: you
// start with the Ranger. Three cars are lent to you by people once you have done
// something for them, and four beaters sit on a gravel lot on chemin d'Aylmer
// with prices soaped on the windshields.
//
// Everything below is data. `main.js` asks this module three questions — what
// is unlocked, why is that one not, and can I buy it — and it answers them.
import { CARS } from './cars.js';
import { readJSON, writeJSON, KEYS } from './store.js';
import { normalizeMods, emptyMods, isStock } from './upgrades.js';

// `kind`:
//   'start'    you have it from the first drive
//   'mission'  somebody hands you the keys when `mission` is finished
//   'buy'      it is for sale at PLACES.usedlot (or on Kijiji) for `cost`, once
//              `jobs` jobs have been finished
//   'free'     nobody owns it in any way that matters: it is sitting there with
//              the key in it, and you can drive it whenever you like. The golf
//              cart on the apron at Club de Golf Gatineau is the only one.
//   'famous'   a car the whole town would recognise. There is no price on it and
//              no mission that hands it over on its own: game/famouscars.js
//              watches what you have actually DONE and calls earn() when you
//              have deserved it. canBuy() refuses these outright, so no amount
//              of money and no hand-edited save can shortcut one.
export const UNLOCKS = {
  ranger: { kind: 'start' },
  saturn: {
    kind: 'mission', mission: 'gang', who: 'Margaret',
    toast: 'Margaret te passe les clés\nla Saturn est dans l’entrée, à côté du truck',
    need: 'Finis « Ramasser la gang »',
    needEn: 'Finish “Ramasser la gang”',
  },
  civic: {
    kind: 'mission', mission: 'poutine', who: 'Sayyad',
    toast: 'Sayyad te passe la Civic\n« touche pas au radio »',
    need: 'Finis « Poutine express »',
    needEn: 'Finish “Poutine express”',
  },
  sunfire: {
    kind: 'mission', mission: 'curfew', who: 'Adam',
    toast: 'Adam te passe la Sunfire\nson père est couché, fais pas de bruit',
    need: 'Finis « Avant minuit »',
    needEn: 'Finish “Avant minuit”',
  },
  cutlass:  { kind: 'buy', cost: 300,  need: '300 $ au lot d’occasion',   needEn: '$300 at the used lot' },
  cavalier: { kind: 'buy', cost: 450,  need: '450 $ au lot d’occasion',   needEn: '$450 at the used lot' },
  caravan:  { kind: 'buy', cost: 250,  need: '250 $ au lot d’occasion',   needEn: '$250 at the used lot' },
  bus:      { kind: 'buy', cost: 1500, jobs: 10,
              need: '1 500 $ au lot — après 10 jobs',
              needEn: '$1,500 at the used lot — after 10 jobs' },
  // Parked at the clubhouse with the key in it, like every golf cart ever.
  cart:     { kind: 'free', who: 'Le Club' },
};

export const START_CAR = 'ranger';

// Cars nobody has to earn. They are 'seen' from the first frame, so the garage
// never announces one with an « on te passe les clés » toast — the golf cart
// has been sitting on that apron the whole time.
export const FREE_CARS = Object.keys(UNLOCKS).filter((id) => UNLOCKS[id].kind === 'free');

// Ids that are for sale rather than lent, in the order they stand on the lot.
export const FOR_SALE = CARS.filter((c) => UNLOCKS[c.id] && UNLOCKS[c.id].kind === 'buy').map((c) => c.id);

const asSet = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : []));

// Per-car upgrade state out of a save file, with every level clamped to a level
// the shop actually sells. A car nobody has touched keeps no record at all.
function loadMods(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of Object.keys(raw)) {
    if (!UNLOCKS[id]) continue;
    const m = normalizeMods(raw[id]);
    if (!isStock(m)) out[id] = m;
  }
  return out;
}

export class Garage {
  constructor(done) {
    this.done = asSet(done);
    const raw = readJSON(KEYS.cars, {});
    this.bought = new Set(Array.isArray(raw.bought) ? raw.bought.filter((id) => UNLOCKS[id]) : []);
    this.seen = new Set(Array.isArray(raw.seen) ? raw.seen.filter((id) => UNLOCKS[id]) : []);
    // What the mechanic has fitted, per car, and the things you have done that
    // a famous car is watching for (a jump landed, a chain finished). Both ride
    // in the same record save.js already carries as `unlocks`, which is why
    // buying a camshaft persists exactly the way buying a car does.
    this.mods = loadMods(raw.mods);
    this.feats = new Set(Array.isArray(raw.feats) ? raw.feats.filter((f) => typeof f === 'string') : []);
    this.seen.add(START_CAR);
    for (const id of FREE_CARS) this.seen.add(id);
  }

  // ---- upgrades ---------------------------------------------------------

  /**
   * The parts fitted to one car. Always a full record, never undefined — and
   * deliberately NOT stored when it is empty: this is read every frame for
   * whatever you are driving, and a stock car has no business growing a row in
   * the save file just because you sat in it.
   */
  modsFor(id) {
    return this.mods[id] || emptyMods();
  }

  /** What is actually recorded, or null. The per-frame read path uses this. */
  rawMods(id) { return this.mods[id] || null; }

  /** Write back what the shop did, and forget a car that is stock again. */
  setMods(id, mods) {
    const m = normalizeMods(mods);
    if (isStock(m)) delete this.mods[id];
    else this.mods[id] = m;
    this.save();
    return m;
  }

  // ---- what you have done -----------------------------------------------

  hasFeat(f) { return this.feats.has(f); }

  /** Record something that happened. Returns true the FIRST time only. */
  addFeat(f) {
    if (!f || this.feats.has(f)) return false;
    this.feats.add(f);
    this.save();
    return true;
  }

  /**
   * Hand over a famous car. Deliberately separate from buy(): there is no
   * wallet in the signature, because there is no price.
   */
  earn(id) {
    const u = UNLOCKS[id];
    if (!u || u.kind !== 'famous' || this.bought.has(id)) return false;
    this.bought.add(id);
    this.seen.add(id);
    this.save();
    return true;
  }

  // The mission progress this garage should answer questions against. main.js
  // calls this whenever a job finishes.
  setProgress(done) { this.done = asSet(done); return this; }

  /** Is this car drivable right now? */
  has(id, done = this.done) {
    const u = UNLOCKS[id];
    if (!u) return false;
    if (u.kind === 'start' || u.kind === 'free') return true;
    if (u.kind === 'mission') return asSet(done).has(u.mission);
    return this.bought.has(id);
  }

  /** Every drivable car id, in CARS order. */
  unlocked(done = this.done) { return CARS.map((c) => c.id).filter((id) => this.has(id, done)); }

  /** Cars that are on the lot with a price on them and not yours yet. */
  forSale() { return FOR_SALE.filter((id) => !this.bought.has(id)); }

  /** What it would cost, or 0 if this one is not for sale. */
  cost(id) { const u = UNLOCKS[id]; return u && u.kind === 'buy' ? u.cost : 0; }

  /**
   * Why you cannot drive this one, in French (or English), or null if you can.
   * `jobs` is how many jobs are finished — only the bus cares.
   */
  reason(id, done = this.done, lang = 'fr') {
    if (this.has(id, done)) return null;
    const u = UNLOCKS[id];
    if (!u) return 'Pas à vendre';
    const need = lang === 'en' && u.needEn ? u.needEn : u.need;
    if (u.kind === 'buy' && u.jobs && asSet(done).size < u.jobs) {
      const left = u.jobs - asSet(done).size;
      return lang === 'en'
        ? `${need} (${left} more to go)`
        : `${need} (encore ${left})`;
    }
    return need;
  }

  /**
   * Could you buy it right now? Returns { ok, why } and touches nothing — this
   * is what the HUD prompt at the lot is built from.
   */
  canBuy(id, wallet, done = this.done) {
    const u = UNLOCKS[id];
    // A famous car has no price, so the answer is never about money. Saying so
    // in the prompt is the point: « ça s'achète pas » is the whole design.
    if (u && u.kind === 'famous') {
      return { ok: this.bought.has(id), why: this.bought.has(id) ? null : 'Ça s’achète pas. ' + u.need };
    }
    if (!u || u.kind !== 'buy') return { ok: false, why: 'Celui-là est pas à vendre' };
    if (this.bought.has(id)) return { ok: true, why: null };
    if (u.jobs && asSet(done).size < u.jobs) {
      const left = u.jobs - asSet(done).size;
      return { ok: false, why: `pas avant ${u.jobs} jobs — encore ${left}` };
    }
    if (!wallet || !wallet.can(u.cost)) {
      const short = Math.max(0, u.cost - (wallet ? wallet.value : 0));
      return { ok: false, why: `il te manque ${Math.round(short)} $` };
    }
    return { ok: true, why: null };
  }

  /**
   * Buy it. Same answer as canBuy(), except that when it says yes the wallet is
   * lighter and the car is yours.
   */
  buy(id, wallet, done = this.done) {
    const r = this.canBuy(id, wallet, done);
    if (!r.ok || this.bought.has(id)) return r;
    wallet.spend(UNLOCKS[id].cost);
    this.bought.add(id);
    this.seen.add(id);
    this.save();
    return { ok: true, why: null };
  }

  /**
   * Cars that have become available since the last time anybody asked. Returns
   * [{ id, toast }] and remembers that it has told you, so the toast fires once.
   */
  newlyUnlocked(done = this.done) {
    const out = [];
    for (const id of this.unlocked(done)) {
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      out.push({ id, toast: (UNLOCKS[id] && UNLOCKS[id].toast) || null });
    }
    if (out.length) this.save();
    return out;
  }

  // ---- persistence ------------------------------------------------------
  // The save-slot system owns the real save file; this is the shape it wants,
  // and `aylmer.cars` is only the fallback for when nothing calls restore().

  serialize() {
    return {
      bought: [...this.bought], seen: [...this.seen],
      mods: this.mods, feats: [...this.feats],
    };
  }

  restore(obj) {
    const o = obj && typeof obj === 'object' ? obj : {};
    this.bought = new Set(Array.isArray(o.bought) ? o.bought.filter((id) => UNLOCKS[id]) : []);
    this.seen = new Set(Array.isArray(o.seen) ? o.seen.filter((id) => UNLOCKS[id]) : []);
    this.mods = loadMods(o.mods);
    this.feats = new Set(Array.isArray(o.feats) ? o.feats.filter((f) => typeof f === 'string') : []);
    this.seen.add(START_CAR);
    for (const id of FREE_CARS) this.seen.add(id);
    this.save();
    return this;
  }

  save() { return writeJSON(KEYS.cars, this.serialize()); }

  reset() {
    this.bought = new Set();
    this.seen = new Set([START_CAR, ...FREE_CARS]);
    this.mods = {};
    this.feats = new Set();
    this.save();
    return this;
  }
}

// Every car in CARS must say how you get it, or the menu would show a card with
// no story behind it.
for (const c of CARS) {
  if (!UNLOCKS[c.id]) throw new Error(`garage: no unlock rule for ${c.id}`);
}
