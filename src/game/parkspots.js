// Parking-spot geometry, with no imports at all. homes.js (main.js's view of
// where cars live) and save.js (the spots a new or repaired save starts from)
// both need the same kerb and lot rows. save.js cannot import homes.js: homes.js
// pulls in vehicles.js, which imports save.js, and that cycle would hit a
// `const` before it is initialised. So the geometry lives here, below both.

// A row of parking spots along the kerb: the used lot, where the four beaters
// sit nose-to-tail. `i` is the place in the row.
export function lotSpot(p, i = 0) {
  const a = p.a || 0;
  const fx = Math.sin(a), fz = Math.cos(a);
  let dx = p.bx - p.x, dz = p.bz - p.z;
  const d = Math.hypot(dx, dz);
  // If the marker snapped exactly onto the building there is no "in" direction;
  // step off the road to the right instead.
  if (!(d >= 0.5)) { dx = fz; dz = -fx; } else { dx /= d; dz /= d; }
  const along = (i - 1.5) * 6.2;
  return { x: p.x + dx * 4.0 + fx * along, z: p.z + dz * 4.0 + fz * along, yaw: a };
}

// A parking spot at the curb in front of a place, nose along the street.
// `slot` spaces cars parked at the same address along the street.
export function curbSpot(p, slot = 0) {
  const dx = (p.bx ?? p.x) - p.x, dz = (p.bz ?? p.z) - p.z, d = Math.hypot(dx, dz) || 1;
  const a = p.a || 0, tx = Math.sin(a) * 6.5 * slot, tz = Math.cos(a) * 6.5 * slot;
  return { x: p.x + (dx / d) * 2.6 + tx, z: p.z + (dz / d) * 2.6 + tz, yaw: a };
}
