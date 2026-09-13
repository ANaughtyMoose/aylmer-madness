import { fraserPoint, FRASER } from './fraser.js';
import { placementReason, roadSpot } from './tow.js';

// Photo reference: 299 is the left unit, viewed from Fraser toward the house.
// Keep the exit clear: Ranger in front, Margaret's Saturn behind it.
export function fraserParking(world, p, spec, slot = 0) {
  const [x,z] = fraserPoint(spec.id === 'dbike' ? -11 : -9, spec.id === 'dbike' ? 11 : 17 - slot * 6);
  const spot = { x,z,yaw:FRASER.yaw + (spec.id === 'ranger' ? Math.PI : 0) };
  if (!placementReason(world, spot, spec)) return spot;
  return roadSpot(world, spot.x, spot.z, spec);
}
