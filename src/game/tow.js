// Getting unstuck, and getting fixed — two different things, priced differently.
//
// Thomas, 2026-09-07: « When I pressed Continue, I was stuck inside a house.
// Should be a button to re-set on the road, and have people fix your car
// costing you money (more expensive than going to the mechanic). But if you're
// just annoyingly stuck, re-setting on the road should be free. Shouldn't fix
// the car though unless you pay. »
//
// So:
//   freeReset(G)   T / the « Remettre sur la route » button (shown only when
//                  stuckStep() says you are stuck). Puts the car on
//                  the nearest bit of road with whatever damage it has. Costs
//                  nothing, ever. Being stuck is the game's fault, not yours.
//   callTow(G)     Y (named in a hint under the stuck offer). A flatbed drops you on the
//                  road AND fixes the car, for the flatbed's call-out fee on
//                  top of what a garage would charge. Always more than the
//                  Petro-Can or the Canadian Tire, which is the point: those
//                  are a drive away, this one comes to you.
//   settleSpawn(G) Run once after a save is loaded. If the save put the car
//                  inside a building, in the water or nowhere near a road,
//                  move it to the road for free and say so. Either way the
//                  car's `lastSafe` becomes a real road point, so T has
//                  somewhere to go on the very first press.
//
// The old T went to `veh.lastSafe`, and `reset()` seeds lastSafe with the spawn
// itself. Spawn inside a house and T brought you back inside the same house.
//
// No DOM here except `installButtons`, which is guarded; everything else is
// numbers on a world object that has nearestRoad / roadAt / buildingAt /
// waterAt, so a node suite can drive it with a fake world.

import { REPAIR, repairCost } from './damage.js';
import { characterById, homeParked } from './save.js';
import { CARS } from './cars.js';

const specOf = (id) => CARS.find((c) => c.id === id) || null;

/** Metres from the nearest road centreline beyond which « stuck » is obvious. */
export const STUCK_FAR = 16;
/** The free reset prefers your last safe spot only if it is this far away. */
export const MIN_MOVE = 6;

/** The flatbed: call-out on top of the garage's price. Never the cheaper option. */
export function towCost(damage) {
  return REPAIR.TOW + repairCost(damage);
}

/** Why the car cannot simply be driven out of here, or null if it can. */
export function stuckReason(world, x, z) {
  if (!world) return null;
  if (world.buildingAt && world.buildingAt(x, z, 0.6)) return 'building';
  if (world.waterAt && world.waterAt(x, z)) return 'water';
  if (world.nearestRoad) {
    const r = world.nearestRoad(x, z);
    if (!r || !(r.dist < STUCK_FAR)) return 'far';
  }
  return null;
}

/** Check the oriented body, including corners and interior, with clearance. */
export function placementReason(world, spot, spec = {}) {
  if (!spot || ![spot.x, spot.z, spot.yaw ?? 0].every(Number.isFinite)) return 'invalid';
  const hw = (spec.wid || 1.8) / 2, hl = (spec.len || 4.8) / 2;
  const nx = Math.ceil(hw * 2 / 0.5), nz = Math.ceil(hl * 2 / 0.5);
  const sn = Math.sin(spot.yaw || 0), cs = Math.cos(spot.yaw || 0);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const side = -hw + 2 * hw * i / nx, along = -hl + 2 * hl * j / nz;
    const x = spot.x + side * cs + along * sn;
    const z = spot.z - side * sn + along * cs;
    if (world?.buildingAt?.(x, z, 0.4)) return 'building';
    if (world?.waterAt?.(x, z)) return 'water';
  }
  return null;
}

/** Search nearby road points; a blocked nearest point is not a safe reset. */
export function roadSpot(world, x, z, spec = {}) {
  if (!world?.nearestRoad) return null;
  const seen = new Set();
  for (const radius of [0, 6, 12, 24, 48, 96]) {
    const count = radius ? 16 : 1;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      const r = world.nearestRoad(x + Math.sin(angle) * radius, z + Math.cos(angle) * radius);
      if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
      const spot = { x: r.x, z: r.z, yaw: r.yaw || 0, name: r.name || '' };
      const key = `${spot.x.toFixed(1)},${spot.z.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!placementReason(world, spot, spec)) return spot;
    }
  }
  return null;
}

/**
 * Where a FREE reset puts the car: the last place it was driving on a road, if
 * that is a real road point and far enough away to be a change; otherwise the
 * nearest road. `lastSafe` is what the old T used, and it is still the better
 * answer after a jump into the river — it is the wrong answer on a fresh load.
 */
export function resetSpot(world, veh) {
  const ls = veh && veh.lastSafe;
  if (ls && world && world.roadAt && world.roadAt(ls.x, ls.z)
    && Math.hypot(ls.x - veh.x, ls.z - veh.z) >= MIN_MOVE
    && !stuckReason(world, ls.x, ls.z)
    && !placementReason(world, ls, veh.spec)) {
    return { x: ls.x, z: ls.z, yaw: ls.yaw, name: '' };
  }
  return roadSpot(world, veh.x, veh.z, veh.spec);
}

function place(veh, spot, world) {
  const y = world?.groundAt?.(spot.x, spot.z)?.h || 0;
  veh.reset(spot.x, spot.z, spot.yaw, y);
  veh.onRoad = world?.roadAt?.(spot.x, spot.z) || null;
  veh.lastSafe = { x: spot.x, z: spot.z, yaw: spot.yaw, y };
}

/** T. Back on the road, damage and all, for nothing. */
export function freeReset(G) {
  const veh = G.veh, world = G.world;
  if (!veh) return { ok: false };
  const spot = resetSpot(world, veh);
  if (!spot) return { ok: false, reason: 'no-safe-road' };
  place(veh, spot, world);
  return { ok: true, name: spot.name, cost: 0 };
}

// ---------------------------------------------------------------- fair tow
//
// Refine plan A-01 (6 Oct panel): Sean and Julie at 23 $ facing a 60-69 $
// flatbed was a death spiral; a broke player who wrecked had no way back. Now:
//   - the first tow of each game day is free (G.towFreeDay holds that day);
//   - short of cash, the flatbed still comes, and the fee goes on the slate
//     (G.towDebt). The slate is the gag, never a dead end: collectTowDebt()
//     takes at most half of each later payment until it is square.

const dayOf = (G) => (G && Number.isFinite(G.day) ? Math.floor(G.day) : 0);

/** True when today's free tow has not been used yet. */
export function freeTowToday(G) {
  return !!G && G.towFreeDay !== dayOf(G);
}

/**
 * What a tow of `fee` costs this player right now, and charges it: free (first
 * of the day), paid from the wallet, or put on the slate. Never refuses.
 */
export function chargeTow(G, fee) {
  if (!(fee > 0)) return { cost: 0, paid: true, free: false, debt: 0 };
  if (freeTowToday(G)) { G.towFreeDay = dayOf(G); return { cost: 0, paid: true, free: true, debt: 0 }; }
  const wallet = G && G.wallet;
  if (!wallet || (wallet.can(fee) && wallet.spend(fee) !== false)) return { cost: fee, paid: true, free: false, debt: 0 };
  G.towDebt = (G.towDebt || 0) + fee;
  return { cost: fee, paid: false, free: false, debt: G.towDebt };
}

/**
 * Pay the slate off a payment that just came in. `gained` is how much the
 * wallet went up; at most `share` of it goes to the flatbed. Returns what was
 * taken (0 if nothing was owed).
 */
export function collectTowDebt(G, gained, share = 0.5) {
  const owe = G && G.towDebt > 0 ? G.towDebt : 0;
  if (!owe || !(gained > 0) || !G.wallet) return 0;
  const take = Math.min(owe, Math.max(1, Math.floor(gained * share)), G.wallet.value || 0);
  if (!(take > 0) || G.wallet.spend(take) === false) return 0;
  G.towDebt = owe - take;
  return take;
}

/** The toast line for a tow record (callTow or towHome). HUD French. */
export function towLine(r, { wreck = false } = {}) {
  const head = wreck ? 'LE CHAR EST FINI\n' : '';
  const where = r && r.name ? `Remis sur ${r.name}` : 'Remis sur la route';
  if (!r || !r.ok) return head + 'Pas de place libre pour la dépanneuse.';
  if (r.swapped) {
    // B-01a: the flatbed brought your own vehicle, not the borrowed one, back.
    const what = r.to === 'ranger' ? 'ton Ranger' : (specOf(r.to) && specOf(r.to).twoWheel ? 'ton vélo' : 'ton char');
    const brought = `La dépanneuse t’amène ${what}, réparé${r.name ? `, sur ${r.name}` : ''}.`
      + (r.from === 'cart' ? '\nLe cart retourne au Club.' : '');
    if (r.free) return head + `Dépanneuse: gratis, la première de la journée.\n${brought}`;
    if (!r.paid) return head + `Dépanneuse: ${r.cost} $ que t’as pas. Le gars te fait crédit (${r.debt} $ dus).\n${brought}`;
    return head + `Dépanneuse: ${r.cost} $.\n${brought}`;
  }
  if (r.free) return head + `Dépanneuse: gratis, la première de la journée.\n${where}, pis réparé.`;
  if (!r.paid) return head + `Dépanneuse: ${r.cost} $ que t’as pas. Le gars te fait crédit,\nil va se payer sur tes prochaines payes (${r.debt} $ dus).`;
  return head + `Dépanneuse: ${r.cost} $.\n${where}, pis réparé.`;
}

/** Y. The flatbed: on the road and fixed. Free once a day; broke, on the slate. */
export function callTow(G) {
  const veh = G.veh, world = G.world;
  if (!veh) return { ok: false, cost: 0 };
  const spot = roadSpot(world, veh.x, veh.z, veh.spec);
  if (!spot) return { ok: false, cost: 0, reason: 'no-safe-road' };
  const bill = chargeTow(G, towCost(veh.damage || 0));
  place(veh, spot, world);
  veh.repair();
  if (G.health) G.health[veh.spec.id] = 0;
  if (G.repair) { G.repair.t = 0; G.repair.key = null; }
  if (G.repairHints) { G.repairHints.h25 = false; G.repairHints.h60 = false; }
  return { ok: true, ...bill, name: spot ? spot.name : '' };
}

/**
 * The car is dead (damage at DAMAGE.DEAD): the flatbed takes it home and it
 * comes back fixed. `home` is the owner's place (homes.js `homeOf`); the fee is
 * the flat call-out, through chargeTow: free once a day, and broke you still
 * get towed with the fee on the slate, because a wreck in the middle of the
 * 148 is not a game state.
 *
 * This replaces the inline tow in main.js's driveHooks, which dereferenced
 * PLACES[OWNER[id]] with no fallback (the SVX had no owner: TypeError), put
 * the car on the raw place point with no footprint check, and left `lastSafe`
 * pointing at the crash. Here the car lands on a checked road spot near home,
 * or where it died if the world has no road to offer, and never throws.
 */
export function towHome(G, home, { fee = REPAIR.TOW } = {}) {
  const veh = G && G.veh, world = G && G.world;
  if (!veh) return { ok: false, paid: false, cost: 0 };
  const bill = chargeTow(G, fee);
  const from = home && Number.isFinite(home.x) && Number.isFinite(home.z) ? home : veh;
  const spot = roadSpot(world, from.x, from.z, veh.spec)
    || (from === home ? { x: home.x, z: home.z, yaw: home.a || 0, name: '' } : null);
  if (spot) place(veh, spot, world);
  veh.repair();
  if (G.health && veh.spec) G.health[veh.spec.id] = 0;
  if (G.repair) { G.repair.t = 0; G.repair.key = null; }
  if (G.repairHints) { G.repairHints.h25 = false; G.repairHints.h60 = false; }
  return { ok: true, ...bill, name: spot ? spot.name || '' : '' };
}

// ---------------------------------------------------------------- your own wheels
//
// Plan v2, B-01a (13 Oct panel, fix 1 for all five reviewers): after the golf
// night, Y repaired the Club's cart and left you in it, and nothing said where
// the Ranger was; 17 of the last 18 jobs were driven at 24 km/h. Y in a
// borrowed vehicle now brings YOUR vehicle to you on the flatbed instead, and
// the borrowed one goes back where it lives.
//
//   ownVehicleId(G)          the vehicle that is yours: G.ownCarId if main.js set
//                            one, else the character's car (save.js), else the Ranger.
//   isBorrowed(G, id?)       true for a vehicle that is not yours to keep: the
//                            Club's cart, a bike, a friend's loaner. G.ownsCar(id),
//                            when main.js provides it (the garage), has the last word.
//   ownVehicleStatus(G)      what the HUD needs for the own-truck marker (B-06):
//                            { id, current, inOwn, borrowed, jobVehicle, at, dist }.
//   returnToOwnVehicle(G, reason, opts)
//                            Y's handler (B-12a). In a borrowed vehicle, outside a
//                            job that put you in it: the flatbed brings your own
//                            vehicle to the nearest clear road spot, fixed, at the
//                            usual flatbed price (free once a day, broke on the
//                            slate), and the borrowed one goes home. In your own
//                            vehicle (or the job's vehicle): exactly callTow(G).
//                            Never throws; the record is callTow's plus
//                            { swapped, from, to, reason }.

/** The vehicle that is yours. */
export function ownVehicleId(G) {
  if (G && typeof G.ownCarId === 'string' && G.ownCarId) return G.ownCarId;
  try {
    const c = G && G.character ? characterById(G.character) : null;
    if (c && c.car) return c.car;
  } catch (e) { /* no character table: the Ranger */ }
  return 'ranger';
}

/** Not yours to keep: the cart, a bike, a friend's car. */
export function isBorrowed(G, id) {
  const cur = id || (G && G.veh && G.veh.spec && G.veh.spec.id);
  if (!cur || cur === ownVehicleId(G)) return false;
  if (G && typeof G.ownsCar === 'function') return !G.ownsCar(cur);
  const spec = (G && G.veh && G.veh.spec && G.veh.spec.id === cur) ? G.veh.spec : specOf(cur);
  if (!spec) return true;
  if (spec.style === 'cart' || spec.twoWheel || spec.style === 'bike') return true;
  // A used-lot car you bought is yours; a friend's, a club's or a school
  // board's is a loan.
  return spec.who !== 'Yours' && spec.who !== 'Le lot';
}

/** True while a live job put you in this vehicle (cartkit's swap, golf night's bikes). */
export function jobVehicle(G) {
  const m = G && G.mission;
  return !!(m && !m.failed && (m.cameIn || m.truck || (m.def && m.def.keepVehicle)));
}

/** Where your own vehicle is, for the HUD marker and the wrong-vehicle chip. */
export function ownVehicleStatus(G) {
  const id = ownVehicleId(G);
  const v = G && G.veh;
  const current = v && v.spec ? v.spec.id : null;
  const inOwn = current === id;
  const p = inOwn ? v : (G && G.parked && G.parked[id]) || null;
  const at = p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z, yaw: p.yaw || 0 } : null;
  const dist = at && v && !inOwn ? Math.hypot(at.x - v.x, at.z - v.z) : 0;
  return { id, current, inOwn, borrowed: !inOwn && isBorrowed(G, current), jobVehicle: jobVehicle(G), at, dist };
}

// A clear road spot near (x, z) that is not on top of the vehicle you are leaving.
function besideSpot(world, v, spec) {
  const s = roadSpot(world, v.x, v.z, spec);
  if (!s) return null;
  if (Math.hypot(s.x - v.x, s.z - v.z) >= 5) return s;
  for (const d of [8, -8, 14, -14, 24, -24]) {
    const x = s.x + Math.sin(s.yaw || 0) * d, z = s.z + Math.cos(s.yaw || 0) * d;
    const r = world && world.nearestRoad ? world.nearestRoad(x, z) : null;
    const q = r && Number.isFinite(r.x) ? { x: r.x, z: r.z, yaw: r.yaw || 0, name: r.name || s.name || '' } : { x, z, yaw: s.yaw || 0, name: s.name || '' };
    if (Math.hypot(q.x - v.x, q.z - v.z) >= 5 && !placementReason(world, q, spec)) return q;
  }
  return s;
}

/** Y. Your own vehicle back, or the plain flatbed when you are already in it. */
export function returnToOwnVehicle(G, reason = 'tow', opts = {}) {
  const v = G && G.veh;
  if (!v || !v.spec) return { ok: false, cost: 0, swapped: false, reason };
  const own = ownVehicleId(G);
  const from = v.spec.id;
  if (from === own || !isBorrowed(G, from) || (jobVehicle(G) && !opts.force) || typeof G.swapCar !== 'function') {
    return { ...callTow(G), swapped: false, from, to: from, reason };
  }
  const ownSpec = specOf(own) || v.spec;
  const spot = besideSpot(G.world, v, ownSpec);
  if (!spot) return { ok: false, cost: 0, reason: 'no-safe-road', swapped: false, from, to: from };
  if (!G.parked) G.parked = {};
  const ownDamage = (G.health && Number.isFinite(G.health[own])) ? G.health[own] : 0;
  const bill = chargeTow(G, towCost(ownDamage));
  G.parked[own] = { x: spot.x, z: spot.z, yaw: spot.yaw || 0 };
  G.swapCar(own);
  const now = G.veh;
  if (!now || !now.spec || now.spec.id !== own) return { ok: false, cost: bill.cost, swapped: false, from, to: from, reason };
  if (now.repair) now.repair();
  if (G.health) G.health[own] = 0;
  if (G.repair) { G.repair.t = 0; G.repair.key = null; }
  if (G.repairHints) { G.repairHints.h25 = false; G.repairHints.h60 = false; }
  // The flatbed takes the borrowed one home on its way back.
  let home = null;
  try { home = (opts.homeOf ? opts.homeOf(from) : homeParked()[from]) || null; } catch (e) { home = null; }
  if (home && G.parked[from]) G.parked[from] = { x: home.x, z: home.z, yaw: home.yaw || 0 };
  return { ok: true, ...bill, name: spot.name || '', swapped: true, from, to: own, reason };
}

/**
 * After a load: a saved position is wherever the autosave caught you, which
 * can be a footpath, a lawn, or (assessment-roll footprints being what they
 * are) the inside of a house. Move a stuck car to the road, free, and make
 * lastSafe a road point regardless.
 */
export function settleSpawn(G, {allowOffRoad = false} = {}) {
  const veh = G.veh, world = G.world;
  if (!veh || !world) return { moved: false, reason: null };
  let reason = placementReason(world, veh, veh.spec) || stuckReason(world, veh.x, veh.z);
  // A deliberately parked car can be well inside a parking lot. Distance to
  // the road alone is not evidence that this known parking spot is stuck.
  if (allowOffRoad && reason === 'far') reason = null;
  if (reason) {
    const spot = roadSpot(world, veh.x, veh.z, veh.spec);
    if (spot) { place(veh, spot, world); return { moved: true, reason, name: spot.name }; }
  }
  const safe = roadSpot(world, veh.x, veh.z, veh.spec);
  if (safe) veh.lastSafe = { x: safe.x, z: safe.z, yaw: safe.yaw, y: world?.groundAt?.(safe.x, safe.z)?.h || 0 };
  return { moved: false, reason, blocked: !!reason };
}

// ---------------------------------------------------------------- stuck?
//
// Refine A-01: offerVisible() is the one test for « may the T and Y offer be
// on screen »; the buttons below and main.js's keys should both ask it.
//
// Review, 6 Oct 2026: the two buttons sat on screen in every shot, and a free
// reset one click away took the cost out of every crash. So the offer only
// comes up when you are actually stuck, and the flatbed is a one-line hint
// under it rather than a second button. T and Y still answer on the keyboard
// (main.js owns the keys).
//
// « Stuck », for the offer, is any of:
//   place    off the road, and inside a building or in the water (stuckReason,
//            not 'far': a parking lot or a lawn job is a long way from a
//            centreline and is not stuck)
//   pinned   a pedal held for `pinnedAfter` s and the car going nowhere: nosed
//            into a wall, hung up on a kerb, wedged between two parked cars
//   flipped  on its side or its roof
// It clears once you are moving again (or have gone `clearM` from where it
// started), and stays up at least `minShow` s so it does not flicker.
export const STUCK = {
  pinnedAfter: 3, pinnedKmh: 2, pedal: 0.3,
  flippedAfter: 1.5, flipRoll: 1.1, flipPitch: 0.9,
  placeAfter: 1.0,
  clearKmh: 15, clearM: 8, minShow: 3,
};

export function newStuckWatch() {
  return { pinT: 0, flipT: 0, placeT: 0, on: false, why: null, at: null, shownT: 0 };
}

/**
 * One step of the stuck watch. `s` is a newStuckWatch() record, `dt` seconds.
 * Reads G.veh, G.world and G.input; returns `s`, whose `on`/`why` say whether
 * to offer the free reset. Pure enough for a node suite.
 */
export function stuckStep(s, G, dt) {
  const v = G && G.veh;
  const quiet = !v || (G.mode && G.mode !== 'drive') || (G.boat && G.boat.active)
    || (Number.isFinite(G.fuel) && G.fuel <= 0.01);
  if (quiet) { s.pinT = s.flipT = s.placeT = 0; s.on = false; s.why = null; return s; }
  const kmh = Math.abs(v.speedKmh != null ? v.speedKmh : (v.vLong || 0) * 3.6);
  const inp = G.input || {};
  const pedal = Math.max(Math.abs(inp.throttle || 0), Math.abs(inp.brake || 0));

  // A footprint from the assessment roll can overlap the asphalt, and a bridge
  // is over water: on a road you are not « in » either of them.
  const w = G.world;
  const onRoad = !!(w && w.roadAt && w.roadAt(v.x, v.z));
  const place = onRoad ? null : stuckReason(w, v.x, v.z);
  s.placeT = place && place !== 'far' ? s.placeT + dt : 0;
  s.pinT = pedal > STUCK.pedal && !inp.handbrake && kmh < STUCK.pinnedKmh ? s.pinT + dt : 0;
  const flipped = Math.abs(v.roll || 0) > STUCK.flipRoll || Math.abs(v.pitch || 0) > STUCK.flipPitch;
  s.flipT = flipped ? s.flipT + dt : 0;

  const why = s.placeT >= STUCK.placeAfter ? place
    : s.flipT >= STUCK.flippedAfter ? 'flipped'
      : s.pinT >= STUCK.pinnedAfter ? 'pinned' : null;
  if (why && !s.on) { s.on = true; s.why = why; s.at = { x: v.x, z: v.z }; s.shownT = 0; return s; }
  if (s.on) {
    s.shownT += dt;
    if (why) s.why = why;
    const moved = s.at ? Math.hypot(v.x - s.at.x, v.z - s.at.z) : 0;
    if (!why && s.shownT >= STUCK.minShow && (kmh > STUCK.clearKmh || moved > STUCK.clearM)) {
      s.on = false; s.why = null; s.at = null;
    }
  }
  return s;
}

/** May the T / Y offer be on screen? Only with a live stuck reason. */
export function offerVisible(s, G = null) {
  if (!s || !s.on || !s.why) return false;
  if (G && G.mode && G.mode !== 'drive') return false;
  return true;
}

// ---------------------------------------------------------------- buttons

const FR = {
  reset: 'Remettre sur la route', resetSub: 'T · gratis',
  tow: 'Dépanneuse', towSub: (c) => `Y · ${c} $ · réparé`,
  hint: (c) => `Y : la dépanneuse, ${c} $, pis c’est réparé`,
};
const EN = {
  reset: 'Back on the road', resetSub: 'T · free',
  tow: 'Tow truck', towSub: (c) => `Y · $${c} · fixed`,
  hint: (c) => `Y: the tow truck, $${c}, and it's fixed`,
};

/**
 * The stuck offer, bottom left above the street name: one button (the same
 * action as T) and a line naming Y. Hidden unless stuckStep() says you are
 * stuck. The flatbed button is still built, hidden, so its id stays stable.
 */
export function installButtons(G, onReset, onTow) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const hud = document.getElementById('hud');
  if (!hud || document.getElementById('towbtns')) return null;
  const box = document.createElement('div');
  box.id = 'towbtns';
  box.style.display = 'none';
  const mk = (id) => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button';
    b.innerHTML = '<b></b><span></span>';
    box.appendChild(b);
    return b;
  };
  const reset = mk('btnReset'), tow = mk('btnTow');
  tow.style.display = 'none';
  const hint = document.createElement('div');
  hint.className = 'towhint';
  box.appendChild(hint);
  reset.onclick = () => { onReset(); reset.blur(); };
  tow.onclick = () => { onTow(); tow.blur(); };
  hud.appendChild(box);
  const watch = newStuckWatch();
  let lastT = null;
  const ui = {
    box, reset, tow, hint, watch,
    get stuck() { return offerVisible(watch, G); },
    // Called every tick from main.js: the price follows the damage, and the
    // offer follows the stuck watch. dt comes off the game clock.
    update(damage, lang) {
      const now = Number.isFinite(G && G.time) ? G.time
        : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
      const dt = lastT == null ? 0 : Math.max(0, Math.min(0.25, now - lastT));
      lastT = now;
      stuckStep(watch, G, dt);
      const show = offerVisible(watch, G);
      if (ui._show !== show) { ui._show = show; box.style.display = show ? '' : 'none'; }
      const L = lang === 'en' ? EN : FR;
      const c = towCost(damage || 0);
      if (ui._c !== c || ui._lang !== lang) {
        ui._c = c; ui._lang = lang;
        reset.firstChild.textContent = L.reset; reset.lastChild.textContent = L.resetSub;
        tow.firstChild.textContent = L.tow; tow.lastChild.textContent = L.towSub(c);
        hint.textContent = L.hint(c);
      }
    },
  };
  return ui;
}
