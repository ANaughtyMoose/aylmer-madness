// Getting unstuck, and getting fixed — two different things, priced differently.
//
// Thomas, 2026-09-07: « When I pressed Continue, I was stuck inside a house.
// Should be a button to re-set on the road, and have people fix your car
// costing you money (more expensive than going to the mechanic). But if you're
// just annoyingly stuck, re-setting on the road should be free. Shouldn't fix
// the car though unless you pay. »
//
// So:
//   freeReset(G)   T / the « Remettre sur la route » button. Puts the car on
//                  the nearest bit of road with whatever damage it has. Costs
//                  nothing, ever. Being stuck is the game's fault, not yours.
//   callTow(G)     Y / the « Dépanneuse » button. A flatbed drops you on the
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

/** The nearest road point, as a spot the car can be reset to. */
export function roadSpot(world, x, z) {
  const r = world && world.nearestRoad ? world.nearestRoad(x, z) : null;
  if (!r || !isFinite(r.x) || !isFinite(r.z)) return null;
  return { x: r.x, z: r.z, yaw: r.yaw || 0, name: r.name || '' };
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
    && !stuckReason(world, ls.x, ls.z)) {
    return { x: ls.x, z: ls.z, yaw: ls.yaw, name: '' };
  }
  return roadSpot(world, veh.x, veh.z);
}

function place(veh, spot) {
  veh.reset(spot.x, spot.z, spot.yaw);
  veh.lastSafe = { x: spot.x, z: spot.z, yaw: spot.yaw };
}

/** T. Back on the road, damage and all, for nothing. */
export function freeReset(G) {
  const veh = G.veh, world = G.world;
  if (!veh) return { ok: false };
  const spot = resetSpot(world, veh);
  if (!spot) { veh.recover(); return { ok: true, name: '', cost: 0 }; }
  place(veh, spot);
  return { ok: true, name: spot.name, cost: 0 };
}

/** Y. The flatbed: on the road and fixed, if you can pay. */
export function callTow(G) {
  const veh = G.veh, world = G.world, wallet = G.wallet;
  if (!veh) return { ok: false, cost: 0 };
  const cost = towCost(veh.damage || 0);
  if (wallet && !wallet.can(cost)) return { ok: false, cost, broke: true };
  if (wallet) wallet.spend(cost);
  const spot = roadSpot(world, veh.x, veh.z);
  if (spot) place(veh, spot);
  veh.repair();
  if (G.health) G.health[veh.spec.id] = 0;
  if (G.repair) { G.repair.t = 0; G.repair.key = null; }
  if (G.repairHints) { G.repairHints.h25 = false; G.repairHints.h60 = false; }
  return { ok: true, cost, name: spot ? spot.name : '' };
}

/**
 * After a load: a saved position is wherever the autosave caught you, which
 * can be a footpath, a lawn, or (assessment-roll footprints being what they
 * are) the inside of a house. Move a stuck car to the road, free, and make
 * lastSafe a road point regardless.
 */
export function settleSpawn(G) {
  const veh = G.veh, world = G.world;
  if (!veh || !world) return { moved: false, reason: null };
  const reason = stuckReason(world, veh.x, veh.z);
  if (reason) {
    const spot = roadSpot(world, veh.x, veh.z);
    if (spot) { place(veh, spot); return { moved: true, reason, name: spot.name }; }
  }
  const safe = roadSpot(world, veh.x, veh.z);
  if (safe) veh.lastSafe = { x: safe.x, z: safe.z, yaw: safe.yaw };
  return { moved: false, reason: null };
}

// ---------------------------------------------------------------- buttons

const FR = {
  reset: 'Remettre sur la route', resetSub: 'T · gratis',
  tow: 'Dépanneuse', towSub: (c) => `Y · ${c} $ · réparé`,
};
const EN = {
  reset: 'Back on the road', resetSub: 'T · free',
  tow: 'Tow truck', towSub: (c) => `Y · $${c} · fixed`,
};

/**
 * Two buttons above the key legend, bottom right. They are the same actions as
 * T and Y, for the player who does not know T and Y exist — which, on the day
 * this was asked for, was Thomas.
 */
export function installButtons(G, onReset, onTow) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const hud = document.getElementById('hud');
  if (!hud || document.getElementById('towbtns')) return null;
  const box = document.createElement('div');
  box.id = 'towbtns';
  const mk = (id) => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button';
    b.innerHTML = '<b></b><span></span>';
    box.appendChild(b);
    return b;
  };
  const reset = mk('btnReset'), tow = mk('btnTow');
  reset.onclick = () => { onReset(); reset.blur(); };
  tow.onclick = () => { onTow(); tow.blur(); };
  hud.appendChild(box);
  const ui = {
    box, reset, tow,
    // Re-labelled every few frames from main.js: the price follows the damage.
    update(damage, lang) {
      const L = lang === 'en' ? EN : FR;
      const c = towCost(damage || 0);
      if (ui._c !== c || ui._lang !== lang) {
        ui._c = c; ui._lang = lang;
        reset.firstChild.textContent = L.reset; reset.lastChild.textContent = L.resetSub;
        tow.firstChild.textContent = L.tow; tow.lastChild.textContent = L.towSub(c);
      }
    },
  };
  return ui;
}
