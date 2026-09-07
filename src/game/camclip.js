// Camera occlusion for the chase cameras.
//
// The chase cam was placed by trigonometry alone: `cam.dist` metres behind the
// car, clamped above the ground, and that was the whole story. Park beside a
// house with the boom pointing through it and the camera ends up INSIDE the
// wall, looking at the back faces of a building with the car hidden behind
// them. That is the screenshot Thomas sent after the first playtest.
//
// The fix is the standard one: treat the boom as a ray, find the first thing it
// crosses, and stand just in front of that instead. Everything here is 2-D —
// the world's collider segments are 2-D and so is `buildingAt` — which is
// enough, because what blocks the view of a car on the ground is a wall in plan.
//
// Two things it deliberately does NOT do:
//
//  * It does not clip on every collider. `querySegments` returns fences,
//    hoardings and the loading-dock barrier alongside building footprints, and
//    none of those carries a height. A 1.6 m fence does not hide a car from a
//    camera 3.7 m up, and clipping on one would make the boom stutter every
//    time you drove down a street with a chain-link yard. So a crossing only
//    counts when there is a building footprint immediately behind it, or when
//    the ray is low enough that a fence really would be in the way.
//
//  * It does not smooth symmetrically. Coming in has to be instant: one frame
//    late and you have already seen the inside of the wall, which is the bug.
//    Going back out has to be slow, or a boom flicking between two segment
//    crossings at the corner of a house pumps the camera in and out at frame
//    rate. Snap in, ease out.
import { clamp } from '../core/math.js';

export const MARGIN = 0.6;     // stop this far in front of the wall, metres
export const LIFT = 0.9;       // extra height at full pull-in, metres
export const MIN_FRAC = 0.18;  // never collapse the boom onto the car
export const RELEASE = 2.4;    // 1/s, exponential ease back out
export const PROBE = 0.35;     // how far past a crossing we look for a footprint
export const BLD_PAD = 0.5;    // ...and the pad used for that lookup
export const FENCE_H = 1.9;    // a collider with no footprint behind it is
                               // assumed to be a fence this tall
export const STEP = 0.06;      // boom fraction per step when marching out of a
                               // footprint the ray never crossed a wall of
export const SNAP = 0.004;     // close enough to the target to stop easing

// Per-camera state. One object, kept by the caller across frames; `frac` is the
// fraction of the full boom length the camera is currently allowed to use.
export function makeClip() { return { frac: 1 }; }

/**
 * Fraction along p→q at which it crosses the segment a→b, or -1 if it does not.
 * Both are treated as finite segments, so a wall the boom stops short of is not
 * a crossing and neither is one it starts past.
 */
export function segCross(px, pz, qx, qz, ax, az, bx, bz) {
  const rx = qx - px, rz = qz - pz;
  const sx = bx - ax, sz = bz - az;
  const den = rx * sz - rz * sx;
  if (den > -1e-9 && den < 1e-9) return -1;      // parallel or degenerate
  const dx = ax - px, dz = az - pz;
  const t = (dx * sz - dz * sx) / den;
  if (t < 0 || t > 1) return -1;
  const u = (dx * rz - dz * rx) / den;
  if (u < 0 || u > 1) return -1;
  return t;
}

// Returned scratch — this runs once a frame and allocates nothing.
const out = { x: 0, y: 0, z: 0, frac: 1, hit: false };

/**
 * Walk the camera in until it can see the car.
 *
 * @param st       state from makeClip(), carried across frames
 * @param world    anything with querySegments(x, z, r) and buildingAt(x, z, pad)
 * @param fx,fy,fz the focus point — the car, about eye height above its body
 * @param cx,cy,cz where the camera wants to be
 * @param dt       seconds, for the ease-out
 * @param groundY  ground height under the focus, for the fence rule
 * @returns the shared scratch {x, y, z, frac, hit}
 */
export function clipCamera(st, world, fx, fy, fz, cx, cy, cz, dt, groundY = fy - 1.2) {
  const dx = cx - fx, dz = cz - fz, dy = cy - fy;
  const boom = Math.hypot(dx, dz);
  let want = 1;

  if (boom > 0.05 && world && world.querySegments) {
    // The query is centred on the middle of the boom, so its radius only has to
    // cover half of it. The slack takes segments whose nearest point is outside
    // the circle but which still cross the chord.
    const segs = world.querySegments((fx + cx) * 0.5, (fz + cz) * 0.5, boom * 0.5 + 2);
    let near = 1;
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      const t = segCross(fx, fz, cx, cz, g.ax, g.az, g.bx, g.bz);
      if (t < 0 || t >= near) continue;
      // Is this actually opaque? A footprint just past the crossing says
      // "building". Nothing there says "fence", and a fence only blocks a ray
      // that is low enough to pass through it.
      const px = fx + dx * t, pz = fz + dz * t;
      const step = Math.min(PROBE / boom, (1 - t) * 0.5 + 1e-6);
      const solid = world.buildingAt
        && world.buildingAt(px + dx * step, pz + dz * step, BLD_PAD);
      if (!solid && fy + dy * t > groundY + FENCE_H) continue;
      near = t;
    }
    if (near < 1) want = clamp(near - MARGIN / boom, MIN_FRAC, 1);
  }

  // A camera point can also land inside a footprint without the boom ever
  // crossing one of its wall segments — the car parked in a courtyard, or a
  // building slice whose near wall was dropped for sitting on the asphalt. Walk
  // in until it is out of the bricks.
  want = marchOut(world, fx, fz, dx, dz, want);

  // Snap in, ease out. `dt` of 0 (a paused frame, a test) holds the boom where
  // it is rather than releasing it a little.
  if (want < st.frac) st.frac = want;
  else if (dt > 0) {
    st.frac += (want - st.frac) * (1 - Math.exp(-RELEASE * dt));
    // An exponential never arrives. Without this the boom sits a couple of
    // centimetres short of full for the rest of the session and `hit` never
    // goes false again, which is the sort of thing that turns up two months
    // later as "the camera is subtly wrong on the highway".
    if (Math.abs(want - st.frac) < SNAP) st.frac = want;
  }

  let frac = clamp(st.frac, MIN_FRAC, 1);
  // Last line of defence: whatever the smoothing produced, it does not get to
  // sit in a wall. Fold the correction back into the state so the ease-out is
  // not fighting it every frame.
  const safe = marchOut(world, fx, fz, dx, dz, frac);
  if (safe < frac) { frac = safe; st.frac = safe; }

  out.frac = frac;
  out.hit = frac < 0.999;
  out.x = fx + dx * frac;
  out.z = fz + dz * frac;
  // The pulled-in camera rides a little higher: from three metres back a level
  // boom is looking at a tailgate, and the lift is what keeps the road ahead of
  // the car in frame. It goes away exactly as the boom comes back out.
  out.y = cy + LIFT * (1 - frac);
  return out;
}

// Step the boom fraction in until the point is out of every building footprint.
// Bounded by MIN_FRAC: being close to the car is better than being indoors, and
// if even that is inside a footprint the car itself is, which the tow handles.
function marchOut(world, fx, fz, dx, dz, frac) {
  if (!world || !world.buildingAt) return frac;
  let f = frac;
  for (let i = 0; i < 32 && f > MIN_FRAC; i++) {
    if (!world.buildingAt(fx + dx * f, fz + dz * f, BLD_PAD)) return f;
    f -= STEP;
  }
  return Math.max(MIN_FRAC, f);
}
