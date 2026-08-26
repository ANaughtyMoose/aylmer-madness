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

// `kind`:
//   'start'    you have it from the first drive
//   'mission'  somebody hands you the keys when `mission` is finished
//   'buy'      it is for sale at PLACES.usedlot for `cost`, once `jobs` jobs
//              have been finished
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
    kind: 'mission', mission: 'curfew', who: 'Dave',
    toast: 'Dave te passe la Sunfire\nson père est couché, fais pas de bruit',
    need: 'Finis « Avant minuit »',
    needEn: 'Finish “Avant minuit”',
  },
  cutlass:  { kind: 'buy', cost: 300,  need: '300 $ au lot d’occasion',   needEn: '$300 at the used lot' },
  cavalier: { kind: 'buy', cost: 450,  need: '450 $ au lot d’occasion',   needEn: '$450 at the used lot' },
  caravan:  { kind: 'buy', cost: 250,  need: '250 $ au lot d’occasion',   needEn: '$250 at the used lot' },
  bus:      { kind: 'buy', cost: 1500, jobs: 10,
              need: '1 500 $ au lot — après 10 jobs',
              needEn: '$1,500 at the used lot — after 10 jobs' },
};

export const START_CAR = 'ranger';

// Ids that are for sale rather than lent, in the order they stand on the lot.
export const FOR_SALE = CARS.filter((c) => UNLOCKS[c.id] && UNLOCKS[c.id].kind === 'buy').map((c) => c.id);

const asSet = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : []));

export class Garage {
  constructor(done) {
    this.done = asSet(done);
    const raw = readJSON(KEYS.cars, {});
    this.bought = new Set(Array.isArray(raw.bought) ? raw.bought.filter((id) => UNLOCKS[id]) : []);
    this.seen = new Set(Array.isArray(raw.seen) ? raw.seen.filter((id) => UNLOCKS[id]) : []);
    this.seen.add(START_CAR);
  }

  // The mission progress this garage should answer questions against. main.js
  // calls this whenever a job finishes.
  setProgress(done) { this.done = asSet(done); return this; }

  /** Is this car drivable right now? */
  has(id, done = this.done) {
    const u = UNLOCKS[id];
    if (!u) return false;
    if (u.kind === 'start') return true;
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

  serialize() { return { bought: [...this.bought], seen: [...this.seen] }; }

  restore(obj) {
    const o = obj && typeof obj === 'object' ? obj : {};
    this.bought = new Set(Array.isArray(o.bought) ? o.bought.filter((id) => UNLOCKS[id]) : []);
    this.seen = new Set(Array.isArray(o.seen) ? o.seen.filter((id) => UNLOCKS[id]) : []);
    this.seen.add(START_CAR);
    this.save();
    return this;
  }

  save() { return writeJSON(KEYS.cars, this.serialize()); }

  reset() {
    this.bought = new Set();
    this.seen = new Set([START_CAR]);
    this.save();
    return this;
  }
}

// Every car in CARS must say how you get it, or the menu would show a card with
// no story behind it.
for (const c of CARS) {
  if (!UNLOCKS[c.id]) throw new Error(`garage: no unlock rule for ${c.id}`);
}
