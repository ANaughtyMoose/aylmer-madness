// Ready for the job (refine plan A-01, 6 Oct 2026 panel).
//
// Every reviewer started a job in a truck that was nearly finished, and 11 of
// 19 failed beats ended « Le char est fini. Remorqué. ». A job should be lost
// on the road, not at the giver's kerb. So when a job starts and the car is
// past cosmetic damage, whoever hands you the job patches it, free, with one
// line. Below that the dents stay: they are yours.
//
//   prepareForJob(car, mission, G?)  call from startMission, after G.mission
//                                    is set. Returns { patched, before, line }.
//
//   ensureOwnVehicle(mission, G)     refine B-01b: call from startMission
//                                    BEFORE def.build. A timed, cargo or race
//                                    job started in a cart, a bike or a loaner
//                                    swaps you into your own vehicle at the
//                                    pillar (free, the start key is the one
//                                    key), or refuses with a narrator line and
//                                    a GPS point to it. Returns
//                                    { action: 'ok'|'swap'|'refuse', kind,
//                                      role, from, to, line, gps }.
//
// No DOM. `car` is a Vehicle (damage, repair()); `mission` is the G.mission
// record or a mission def (giver is a PLACES key). `G` is optional and only
// used to clear the repair bookkeeping the way the garages do.
import { ownCarId, vehicleRole, handBack } from './garage.js';
import { CARS } from './cars.js';
import { PLACES } from './places.js';
import { placementReason, roadSpot } from './tow.js';
import { fraserParking } from './homeparking.js';

/** Damage above which the giver patches the car before the job. */
export const PATCH_ABOVE = 25;

// Givers whose place key is a friend's house. Everything else (a shop, the
// arena, the marina) gets the impersonal line.
const WHO = {
  sayyad: 'Sayyad', mike: 'Mike', margaret: 'Margaret', adam: 'Adam',
  zahra: 'Zahra', russell: 'Russell', abraham: 'Abraham', robin: 'Robin', norm: 'Le garagiste',
};

/** The one line: HUD French, the giver named only when it is a friend. */
export function patchLine(giver) {
  if (giver === 'home') return 'T’as patché ça avec du duct tape avant de partir. Gratis.';
  const who = WHO[giver];
  if (who) return `${who} t’a patché ça avec du duct tape. Gratis.`;
  return 'Quelqu’un t’a patché ça avec du duct tape avant la job. Gratis.';
}

export function prepareForJob(car, mission, G = null) {
  const before = car && Number.isFinite(car.damage) ? car.damage : 0;
  if (!car || !(before > PATCH_ABOVE)) return { patched: false, before, line: null };
  if (typeof car.repair === 'function') car.repair(); else car.damage = 0;
  car.damage = 0;
  if (G) {
    if (G.health && car.spec && car.spec.id) G.health[car.spec.id] = 0;
    if (G.repair) { G.repair.t = 0; G.repair.key = null; }
    if (G.repairHints) { G.repairHints.h25 = false; G.repairHints.h60 = false; }
    if (G.mission && G.mission.styleStart) G.mission.styleStart.damage = 0;
  }
  const def = mission && (mission.def || mission);
  return { patched: true, before, line: patchLine(def && def.giver) };
}

// ---------------------------------------------------------------- B-01b
// Never stranded (refine plan v2, B-01b). 17 of the last 18 reviewed jobs ran
// at 24 km/h because the job started in the golf cart. Russell's pickup gate
// (setpieces/royal.js) was the only job that noticed; this is that check for
// every job that needs a real vehicle.

/** Jobs that bring their own vehicle and must never be swapped out of it. */
export const SELF_VEHICLE = new Set(['golfcart', 'canot']);

/** Stage kinds that carry something (a load, a couch, a box, a bag). */
const CARGO_KINDS = /^(load|lift|fragile|slidingbox|bag|deliver|drop|cargo)$/;

/** Your own vehicle within this many metres stays where it is parked. */
export const KEEP_NEAR = 40;
/** Within this of 299 Fraser the Ranger goes in its nose-in spot. */
export const HOME_NEAR = 60;
/** How far ahead of you the brought vehicle is put down. */
const BRING_AHEAD = 8;

const kindCache = new WeakMap();
const timed = (st) => typeof st.time === 'function' || (Number.isFinite(st.time) && st.time > 0);

/**
 * 'race', 'timed', 'cargo' or null (a job any vehicle can do, or one that
 * brings its own). `stages` is optional: without it the def is built once with
 * a Ranger context and the answer is cached per def (builds are pure;
 * missions.js missionPayout builds them the same way).
 */
export function jobKind(mission, stages = null) {
  const def = mission && (mission.def || mission);
  if (!def || !def.id) return null;
  if (SELF_VEHICLE.has(def.id) || def.ownVehicle === false) return null;
  if (!stages && mission.stages) stages = mission.stages;
  if (!stages && kindCache.has(def)) return kindCache.get(def);
  let st = stages;
  if (!st && typeof def.build === 'function') {
    try { st = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, places: 2, money: 0 }); }
    catch (e) { st = null; }
  }
  st = Array.isArray(st) ? st : [];
  let kind = null;
  if (def.race) kind = 'race';
  else if (st.some(timed) || def.timed) kind = 'timed';
  else if (def.cargo || st.some((x) => x && (x.passengers || CARGO_KINDS.test(x.kind || '')))) kind = 'cargo';
  if (!stages) kindCache.set(def, kind);
  return kind;
}

const OWN_NAME = { ranger: 'Ton Ranger', civic: 'Ta Civic', dbike: 'Ton vélo', forester: 'Ton Forester', sienna: 'Ta Sienna' };
const LEFT_NAME = { cart: 'Le cart', bike: 'Le vélo', loaner: 'Le char prêté' };
const IN_NAME = { cart: 'en cart', bike: 'en vélo', loaner: 'avec un char prêté' };

/** Narrator French, one line each. No dashes. */
export function swapLine(to, role) {
  const own = OWN_NAME[to] || 'Ton char';
  return `${own} t’attend au pilier, la clé dessus. ${LEFT_NAME[role] || 'L’autre'} reste ici. Gratis.`;
}
export function refuseLine(to, role) {
  const own = (OWN_NAME[to] || 'Ton char').replace(/^T/, 't');
  return `Pas ${IN_NAME[role] || 'avec ça'} pour cette job-là. Va chercher ${own}, le GPS te montre le chemin.`;
}

const specOf = (id) => CARS.find((c) => c.id === id) || { id };

/** Where your own vehicle is put down when it is brought to the pillar. */
export function bringSpot(G, to) {
  const v = G && G.veh;
  if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.z)) return null;
  const spec = specOf(to), world = G.world || null;
  const home = PLACES && PLACES.home;
  // At 299 Fraser the Ranger is nose-in, toward the house (hard rule 4).
  if (to === 'ranger' && home && Math.hypot(v.x - home.x, v.z - home.z) < HOME_NEAR) {
    try { const s = fraserParking(world, home, spec, 0); if (s) return s; } catch (e) { /* fall through */ }
  }
  // Right next to you, the way a car in a lot is parked (a pillar is often in
  // a lot, not on a centreline): ahead, behind, either side, a bit further on.
  // Only when none of those is clear of buildings and water, the nearest road.
  const yaw = Number.isFinite(v.yaw) ? v.yaw : 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const at = (f, s) => ({ x: v.x + fx * f + fz * s, z: v.z + fz * f - fx * s, yaw });
  const tries = [at(BRING_AHEAD, 0), at(-BRING_AHEAD, 0), at(0, 5), at(0, -5), at(BRING_AHEAD * 2, 0)];
  if (!world) return tries[0];
  for (const t of tries) if (!placementReason(world, t, spec)) return t;
  return roadSpot(world, v.x, v.z, spec);
}

/**
 * Call at the top of startMission, before def.build (the stages are built for
 * the vehicle you end up in). `opts.bring` false never moves your own vehicle,
 * so a far one is a refusal. Never throws.
 */
export function ensureOwnVehicle(mission, G, opts = {}) {
  const v = G && G.veh, spec = v && v.spec;
  const character = (G && (G.character || (G.garage && G.garage.character))) || undefined;
  const to = ownCarId(character);
  const out = { action: 'ok', kind: null, role: null, from: spec ? spec.id : null, to, line: null, gps: null };
  if (!spec) return out;
  out.kind = jobKind(mission);
  out.role = vehicleRole(spec, { character, garage: G.garage || null, veh: v });
  if (!out.kind || out.role === 'own' || out.role === 'lent') return out;
  const parked = G.parked && G.parked[to];
  const near = parked && Math.hypot(parked.x - v.x, parked.z - v.z) <= KEEP_NEAR;
  let spot = null;
  if (!near && opts.bring !== false) {
    try { spot = bringSpot(G, to); } catch (e) { spot = null; }
  }
  if (near || spot) {
    let r = null;
    try { r = handBack(G, { spot: near ? null : spot }); } catch (e) { r = null; }
    if (r && r.ok && r.swapped) {
      out.action = 'swap';
      out.line = swapLine(to, out.role);
      return out;
    }
  }
  out.action = 'refuse';
  out.line = refuseLine(to, out.role);
  const p = G.parked && G.parked[to];
  out.gps = p ? { x: p.x, z: p.z } : (PLACES.home ? { x: PLACES.home.x, z: PLACES.home.z } : null);
  return out;
}
