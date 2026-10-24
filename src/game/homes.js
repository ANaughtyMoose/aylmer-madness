// Whose driveway each car lives in, where on that street it parks, and what the
// E key is allowed to offer when you stop beside it. One table, built once.
//
// There used to be two owner tables. main.js had one (plus VEHICLE_OWNERS, plus
// the famous cars that economy.js copied in at install time) and save.js had
// another, which vehicles.js and fortiercars.js mutated at import. They
// disagreed on five cars, and main's had no `svx` at all, so wrecking Sara's
// SVX threw a TypeError out of the tow (architecture review F2). Everything
// main.js asks about a car's home now comes from here, and the table is
// complete the moment this module has loaded: tools/smoke_homes.mjs checks that
// every CARS id has an owner and that the owner is a real place.
//
// save.js still carries its own copy for newSave() and normalizeSave() (it
// cannot import this file: vehicles.js imports save.js). The two agree on
// every car they both list, beaters on the lot included;
// tools/smoke_homes.mjs holds them to it.
//
// No DOM, no G: plain data and pure functions, so a node suite can drive it.

import { VEHICLE_OWNERS } from './vehicles.js';
import { OWNERS as FAMOUS_OWNERS } from './famouscars.js';
import { UNLOCKS } from './garage.js';
import { lotSpot, curbSpot } from './parkspots.js';

export const OWNER = {
  // Margaret's Saturn lives in the same driveway as your Ranger at 299 Fraser.
  ranger: 'home', saturn: 'home', civic: 'steph', sunfire: 'marina',
  // The other playable characters' vehicles, each outside its own house:
  // Mike's Forester at 129 Frank-Robinson, Abraham's Sienna at 841
  // Wilfrid-Lavigne. Zahra's Diamondback is in VEHICLE_OWNERS, at 299 Fraser.
  forester: 'mike', sienna: 'abraham',
  // Tyler Yank's Z24, at her aunt's on Samuel-Edey. It never moves to your
  // driveway, because it is hers.
  cavalier: 'tyler',
  // The beaters live on the lot until somebody buys them, and after that they
  // live in your driveway with everything else (homeKey below). Roger's 240D
  // is on that gravel on consignment, which is why it is here.
  cutlass: 'usedlot', caravan: 'usedlot', bus: 'usedlot', benz: 'usedlot',
  // The Club's cart. It stays at the golf course whatever you do with it.
  cart: 'golf',
  // [vehicles] the school bus at École de l'Aigle, Sayyad's cruiser outside
  // 75 Denise-Friend, the Diamondback at 299 Fraser.
  ...VEHICLE_OWNERS,
  // The famous cars and the Tempo (famouscars.js). economy.js reads them from
  // here (it used to Object.assign them into main's table).
  ...FAMOUS_OWNERS,
  // Sara Fortier's SVX is towed back to the Héritage lot, where fortier.js
  // parks it. This is the entry whose absence crashed the wreck tow.
  svx: 'heritage',
};

/** The PLACES key a car goes home to. Bought beaters come home with you. */
export function homeKey(id) {
  const k = OWNER[id];
  if (!k) return 'home';
  return k === 'usedlot' ? 'home' : k;
}

/** The place itself. Never undefined while PLACES has a `home`. */
export function homeOf(PLACES, id) {
  return (PLACES && (PLACES[homeKey(id)] || PLACES.home)) || null;
}

// lotSpot() and curbSpot() are plain geometry in parkspots.js, shared with
// save.js (which cannot import this file without an import cycle).
export { lotSpot, curbSpot };

/**
 * The next free kerb slot at `id`'s address: one per car already parked there,
 * plus one if the car you are driving lives there too (it has a slot even
 * while you are out in it).
 */
export function nextFreeSlot(parked, currentId, id) {
  const k = homeKey(id);
  let slot = currentId && homeKey(currentId) === k ? 1 : 0;
  for (const other of Object.keys(parked || {})) if (other !== id && homeKey(other) === k) slot++;
  return slot;
}

/**
 * What E may offer beside a parked car: 'take' when it is yours to drive, 'buy'
 * when it is on sale (the lot, Kijiji — even if a job gate or the wallet will
 * refuse, the prompt says why), and null for everything else.
 *
 * Margaret's Saturn is in the driveway from the first frame and it is not for
 * sale: it is lent after « Ramasser la gang ». The old prompt asked
 * garage.has() only, so a locked car that is not for sale fell through to the
 * buy branch and a new game opened on « E — acheter la Saturn · 0 $ ».
 */
export function offerFor(garage, id, done) {
  if (!garage || !id) return null;
  if (garage.has(id, done)) return 'take';
  const u = UNLOCKS[id];
  return u && u.kind === 'buy' ? 'buy' : null;
}

/** The subset of `parked` that E can do something with right now. */
export function offerableParked(parked, garage, done) {
  const out = {};
  for (const id of Object.keys(parked || {})) if (offerFor(garage, id, done)) out[id] = parked[id];
  return out;
}
