import { fraserPoint, FRASER } from './fraser.js';
import { placementReason, roadSpot } from './tow.js';

// Photo reference: 299 is the left unit, viewed from Fraser toward the house.
// Keep the exit clear: Ranger in front, Margaret's Saturn behind it.
//
// Tom really parked the Ranger nose-in, toward the house, and backs out of the
// drive: a new game opens on « S pour reculer ». The 29 Sep flip to nose to the
// street is undone (Tom, 6 Oct). Both cars are nose-in, the Saturn behind the
// truck toward the garage, 6 m up the gravel. FRASER.yaw points from the house
// out to Fraser (fraserPoint's +z); a car's forward is (sin yaw, cos yaw).
// A stray W taps Margaret's Saturn on purpose: that is a small joke now
// (main.js, margaretBump), not a punishment. The way back to the street is
// clear, which tools/smoke_homeparking.mjs reverses along and checks.
export function fraserParking(world, p, spec, slot = 0) {
  const [x,z] = fraserPoint(spec.id === 'dbike' ? -11 : -9, spec.id === 'dbike' ? 11 : 17 - slot * 6);
  const spot = { x, z, yaw: FRASER.yaw + Math.PI };
  if (!placementReason(world, spot, spec)) return spot;
  return roadSpot(world, spot.x, spot.z, spec);
}
