// The filters between the suspension and the eye.
//
// The chase camera used to be smoothed by one exponential lerp per axis:
//
//   G.camPos[1] = lerp(G.camPos[1], py, 1 - Math.exp(-6 * dt));
//
// which is a first-order low-pass, and a first-order low-pass has a problem
// that matters here and nowhere else in the game. Its OUTPUT VELOCITY is
// proportional to its input ERROR, so its output ACCELERATION is proportional
// to the rate of change of that error — that is, to the input's velocity,
// undamped. The suspension's velocity is exactly what a kerb strike and a
// landing consist of: `suspV` reverses sign in a single tick. So every thump in
// cars.js arrived at the camera as a step change in camera acceleration, which
// is the thing the eye reads as "the picture jumped" rather than "the truck hit
// something". Softening the shake term could never fix that, because the shake
// term was not where it came from.
//
// A second-order critically damped spring has no such path: acceleration is a
// continuous function of position and velocity, so a step in the input's
// velocity produces a step in the output's JERK, one derivative further away
// from anything anyone can see. It also rolls off at 40 dB/decade instead of
// 20, so the 9.7 Hz band the old shake lived in is attenuated by 94% instead of
// 85%. What it costs is a second state variable per axis and the discipline to
// integrate it in a way that cannot blow up at a big dt.
//
// Nothing in here knows about the game. It is scalars and seconds, so
// tools/smoke_camdamp.mjs can drive it at 1/30, 1/60 and 1/120 and check the
// step response, the roll-off and the tracking lag directly.

/**
 * A critically damped spring, integrated implicitly.
 *
 * The explicit form (v += (k(target-x) - c v) dt; x += v dt) goes unstable
 * somewhere around dt > 2/omega, which at omega = 18 is a 110 ms frame — well
 * inside what a laptop does when a sector builds. Solving it implicitly instead
 * costs one divide and is stable at every dt, so a hitch produces a slow
 * camera, never a launched one.
 *
 *   x' = x + dt v'
 *   v' = v + dt (omega^2 (target - x') - 2 omega v')
 *
 * substitute and the (1 + omega dt)^2 falls straight out:
 *
 *   v' = (v + dt omega^2 (target - x)) / (1 + omega dt)^2
 *
 * `omega` is the undamped natural frequency in rad/s. For a critically damped
 * spring the useful identities are: 2% settling time after a step is 5.83/omega
 * seconds, the steady-state lag behind a constant-velocity input is 2/omega
 * seconds, and the gain at frequency W rad/s is omega^2 / (omega^2 + W^2).
 * That last one is why replacing an exponential lerp of rate k with a spring of
 * omega = 2k keeps the same tracking lag while attenuating far more.
 *
 * @param s      {x, v}, mutated in place
 * @param target where it is being pulled to
 * @param omega  rad/s
 * @param dt     seconds
 * @returns the new position (also s.x)
 */
export function spring(s, target, omega, dt) {
  if (!(dt > 0)) return s.x;
  const od = omega * dt;
  const den = (1 + od) * (1 + od);
  s.v = (s.v + dt * omega * omega * (target - s.x)) / den;
  s.x += dt * s.v;
  return s.x;
}

/** A spring at rest at `x`. */
export function makeSpring(x = 0) { return { x, v: 0 }; }

/** Put a spring exactly at `x`, standing still. For teleports and boots. */
export function setSpring(s, x) { s.x = x; s.v = 0; return s.x; }

/**
 * First-order exponential low-pass, frame-rate independent: the same time
 * constant at 60 and at 120 Hz. `rate` is 1/s; the signal reaches 63% of a step
 * in 1/rate seconds. Used where a spring would be overkill — the blends and the
 * scalars, not the eye's position.
 */
export function lowpass(prev, target, rate, dt) {
  if (!(dt > 0)) return prev;
  return prev + (target - prev) * (1 - Math.exp(-rate * dt));
}

// ------------------------------------------------------------- the constants
//
// Every rate here is picked against what it replaced, so the camera still sits
// where it used to sit at a steady 100 km/h and only the transients change.
//
// A spring of omega lags a constant-velocity input by 2/omega; an exponential
// lerp of rate k lags it by 1/k. Matching those is what keeps the framing:
// the boom was k = 9, so omega = 18 puts the camera the same distance behind
// the car on a straight, and the height was k = 6, so omega = 15 is a shade
// tighter than the 12 that would match exactly — deliberate, because height is
// the axis the bumps live on and a little less lag there reads as the camera
// being attached to the truck rather than towed by it.
export const XZ_OMEGA = 18;    // rad/s — 0.111 s of tracking lag, 0.32 s to settle
export const Y_OMEGA = 15;     // rad/s — 0.133 s of tracking lag, 0.39 s to settle

// A teleport is not a camera move. The tow truck, a mission start and the seam
// card all put the car somewhere else between two frames; without this the
// spring would spend two seconds flying across Aylmer at 300 m/s with the world
// streaming under it. Beyond this many metres the camera is placed, not sprung.
export const SNAP_DIST = 40;

// The suspension, on its way to the eye. `susp` is the body on its springs
// (cars.js SUSP_K = 210, SUSP_C = 24 — about 2.3 Hz, and it rings), and the
// camera used to get all of it through `bodyY`. It gets a low-passed third of
// it now: enough that a landing still compresses the picture, little enough
// that the ringing afterwards is gone. The chassis height itself is untouched,
// so the camera still rides over a berm exactly as before.
export const SUSP_RATE = 5;    // 1/s
export const SUSP_GAIN = 0.35;

// The in-air nose lean. `inAir` is a boolean off a 8 cm clearance test, so it
// chatters on and off several times a second over rough ground — and the lean
// it gates is up to 0.22 rad, which is twelve and a half degrees of camera
// appearing and disappearing at frame rate. That, not the shake, is the biggest
// single term in the pitch column of the pre-fix measurement. Blending the gate
// and low-passing the angle keeps the lean (it is deliberate: the camera looks
// where a jump is going) and removes the chatter.
export const AIR_RATE = 7;     // 1/s on the 0/1 gate
export const PITCH_RATE = 9;   // 1/s on f.pitch itself

// Road speed as the camera reads it, for the boom length, the ride height and
// the speed FOV. Wheelspin and a gearchange both put a kink in vLong that has
// no business moving the camera at all.
export const SPEED_RATE = 6;   // 1/s

/**
 * All the camera's filter state in one object, so main.js keeps one handle and
 * a teleport can reset the lot. `primed` is false until the first frame places
 * it, which is what stops the camera sweeping in from the origin on boot.
 */
export function makeCamDamp() {
  return {
    x: makeSpring(0), y: makeSpring(0), z: makeSpring(0),
    susp: 0, pitch: 0, air: 0, speed: 0,
    primed: false,
  };
}

/** Place the camera and stop every filter dead. Boot, teleport, tow, seam. */
export function resetCamDamp(d, x, y, z) {
  setSpring(d.x, x); setSpring(d.y, y); setSpring(d.z, z);
  d.susp = 0; d.pitch = 0; d.air = 0; d.speed = 0;
  d.primed = true;
  return d;
}

/**
 * Step the three position springs toward where the camera wants to be, and
 * write the result into `out` (G.camPos — a plain 3-array, reused).
 *
 * Returns true if it snapped rather than sprung, which is the caller's cue that
 * this frame was a teleport and not a motion.
 */
export function stepCamPos(d, out, px, py, pz, dt) {
  if (!d.primed || Math.hypot(px - d.x.x, pz - d.z.x) > SNAP_DIST) {
    resetCamDamp(d, px, py, pz);
    out[0] = px; out[1] = py; out[2] = pz;
    return true;
  }
  out[0] = spring(d.x, px, XZ_OMEGA, dt);
  out[1] = spring(d.y, py, Y_OMEGA, dt);
  out[2] = spring(d.z, pz, XZ_OMEGA, dt);
  return false;
}
