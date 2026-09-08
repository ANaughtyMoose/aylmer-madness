// The camera's damping, checked as a filter rather than as a feeling.
//
// game/camdamp.js is pure scalars and seconds on purpose, so everything the
// chase camera promises can be pinned here instead of in a browser: it is
// stable at every frame rate the game runs at, it settles, it does not
// overshoot, it kills the 9.7 Hz band that made the old shake read as flicker,
// and it still follows a car driving at a constant speed with the same lag the
// exponential lerp it replaced had — which is what stops the fix from quietly
// re-framing the game.
import {
  spring, makeSpring, setSpring, lowpass,
  makeCamDamp, resetCamDamp, stepCamPos,
  XZ_OMEGA, Y_OMEGA, SNAP_DIST, SUSP_RATE, SUSP_GAIN, AIR_RATE, PITCH_RATE, SPEED_RATE,
} from '../src/game/camdamp.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

const RATES = [1 / 30, 1 / 60, 1 / 120];
const OMEGAS = [XZ_OMEGA, Y_OMEGA];

// ------------------------------------------------------------------ 1. a step
// From rest, asked for 1.0. It must arrive, it must not sail past, and it must
// do both inside the time a player would call "immediately".
for (const omega of OMEGAS) {
  for (const dt of RATES) {
    const s = makeSpring(0);
    let peak = 0, settledAt = Infinity;
    const T = 2;
    for (let t = 0, i = 0; t < T; t += dt, i++) {
      const x = spring(s, 1, omega, dt);
      if (x > peak) peak = x;
      // 2% band, and it has to STAY there — reset the clock if it leaves.
      if (Math.abs(x - 1) > 0.02) settledAt = Infinity;
      else if (settledAt === Infinity) settledAt = t;
    }
    const hz = Math.round(1 / dt);
    ok(peak <= 1.03, `w=${omega} ${hz}Hz: step overshoot ${((peak - 1) * 100).toFixed(2)}% > 3%`);
    // 0.40 s is the promise; the dt term is the implicit integrator's own lag,
    // which is real — at 30 fps the camera genuinely is a frame behind — and is
    // measured to be exactly one dt, not a fudge factor. See the lag block.
    ok(settledAt <= 0.40 + 1.5 * dt,
      `w=${omega} ${hz}Hz: settled at ${settledAt.toFixed(3)} s, want <= ${(0.4 + 1.5 * dt).toFixed(3)}`);
    near(s.x, 1, 0.02, `w=${omega} ${hz}Hz: step endpoint`);
    // ...and it is still going nowhere once it is there.
    ok(Math.abs(s.v) < 0.05, `w=${omega} ${hz}Hz: still drifting at ${s.v.toFixed(4)} m/s`);
  }
}

// The settling time a critically damped spring is supposed to have, from the
// closed form: 2% at omega*t = 5.83. If a future tune breaks this the constant
// has stopped meaning what the comments in camdamp.js say it means.
{
  const s = makeSpring(0);
  const dt = 1 / 240;
  let settledAt = Infinity;
  for (let t = 0; t < 2; t += dt) {
    const x = spring(s, 1, XZ_OMEGA, dt);
    if (Math.abs(x - 1) > 0.02) settledAt = Infinity; else if (settledAt === Infinity) settledAt = t;
  }
  near(settledAt, 5.83 / XZ_OMEGA, 0.04, 'analytic 2% settling time');
}

// ------------------------------------------------------- 2. stability at any dt
// A sector build hitches the frame; frame() clamps dt at 0.25 s. The spring has
// to survive that, and a 1 s step for good measure, without launching.
for (const dt of [0.25, 0.5, 1]) {
  const s = makeSpring(0);
  for (let i = 0; i < 40; i++) spring(s, 1, XZ_OMEGA, dt);
  ok(Number.isFinite(s.x) && Math.abs(s.x - 1) < 0.02, `dt=${dt}: diverged to ${s.x}`);
  ok(Math.abs(s.v) < 0.5, `dt=${dt}: velocity ${s.v} after settling`);
}
// dt of zero is a paused frame and must hold, not step.
{
  const s = makeSpring(3); s.v = 7;
  spring(s, 99, XZ_OMEGA, 0);
  ok(s.x === 3 && s.v === 7, 'dt = 0 must hold the spring exactly where it is');
  ok(lowpass(3, 99, 5, 0) === 3, 'dt = 0 must hold the low-pass too');
}

// ------------------------------------------------- 3. the 9.7 Hz band is dead
// The shake term that started all of this was one sine at 61 rad/s — 9.7 Hz,
// the frequency the eye reads as flicker. Whatever else the camera does, an
// input at that frequency must not reach the picture. > 80% is the bar; the
// closed form for a critically damped spring says w^2/(w^2+W^2), which at
// omega 18 against 61 rad/s is 92%.
const FLICKER = 2 * Math.PI * 9.7;
for (const omega of OMEGAS) {
  for (const dt of RATES) {
    const s = makeSpring(0);
    // Two seconds to reach steady state, then measure the swing over one more.
    const settle = Math.round(2 / dt), meas = Math.round(1 / dt);
    for (let i = 0; i < settle; i++) spring(s, Math.sin(FLICKER * i * dt), omega, dt);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < meas; i++) {
      const x = spring(s, Math.sin(FLICKER * (settle + i) * dt), omega, dt);
      if (x < lo) lo = x; if (x > hi) hi = x;
    }
    const gain = (hi - lo) / 2;
    const hz = Math.round(1 / dt);
    ok(gain < 0.20, `w=${omega} ${hz}Hz: 9.7 Hz gain ${gain.toFixed(3)}, want < 0.20 (80% down)`);
  }
}
// ...and the closed form holds at a fine dt, so the constant is doing what the
// comment claims and not passing by luck of the discretisation.
{
  const s = makeSpring(0);
  const dt = 1 / 480;
  for (let i = 0; i < 480 * 2; i++) spring(s, Math.sin(FLICKER * i * dt), XZ_OMEGA, dt);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 480; i++) {
    const x = spring(s, Math.sin(FLICKER * (960 + i) * dt), XZ_OMEGA, dt);
    if (x < lo) lo = x; if (x > hi) hi = x;
  }
  const want = (XZ_OMEGA * XZ_OMEGA) / (XZ_OMEGA * XZ_OMEGA + FLICKER * FLICKER);
  near((hi - lo) / 2, want, 0.01, 'analytic gain at 9.7 Hz');
  ok(want < 0.09, `analytic 9.7 Hz gain ${want.toFixed(3)} should be under 9%`);
}

// A first-order lerp at the rate this replaces is measurably worse in the same
// band. This is the whole argument for the change, so it is an assertion.
{
  const dt = 1 / 120, k = XZ_OMEGA / 2;   // the old kxz = 9
  let x = 0;
  for (let i = 0; i < 120 * 2; i++) x = lowpass(x, Math.sin(FLICKER * i * dt), k, dt);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 120; i++) {
    x = lowpass(x, Math.sin(FLICKER * (240 + i) * dt), k, dt);
    if (x < lo) lo = x; if (x > hi) hi = x;
  }
  const first = (hi - lo) / 2;
  ok(first > 0.12, `the old lerp should still pass >12% at 9.7 Hz, got ${first.toFixed(3)}`);
}

// ------------------------------------------------ 4. following a moving target
// The camera is behind a car doing 30 m/s. It must sit a bounded distance back
// and STAY there — the lag is what the boom length was tuned around, so it has
// to match the exponential lerp it replaces (2/omega against the old 1/k, and
// omega is 2k by construction).
for (const omega of OMEGAS) {
  for (const dt of RATES) {
    const V = 30;
    const s = makeSpring(0);
    let t = 0;
    for (; t < 4; t += dt) spring(s, V * t, omega, dt);
    const lag = (V * t - s.x) / V;                 // seconds behind
    const hz = Math.round(1 / dt);
    // The closed form is 2/omega; the implicit integrator adds exactly one dt
    // on top, which is a frame of latency and nothing more. Pinning it to
    // 2/omega + dt rather than a loose band is what would catch the scheme
    // being swapped for something that quietly lags four frames.
    near(lag, 2 / omega + dt, 0.005, `w=${omega} ${hz}Hz: constant-velocity lag`);
    ok(lag < 2 / omega + dt + 0.01, `w=${omega} ${hz}Hz: lag ${lag.toFixed(3)} s is too much boom`);
    // ...and it must still be no worse than the exponential lerp it replaced,
    // which is what keeps the boom length and the framing where they were.
    ok(lag <= 1 / (omega / 2) + dt + 0.005,
      `w=${omega} ${hz}Hz: lag ${lag.toFixed(3)} s exceeds the old lerp's ${(2 / omega).toFixed(3)}`);
    // The lag must be the same at every frame rate, or the game reframes itself
    // on a 120 Hz laptop. That was the "ringing against the new higher speeds"
    // half of NEXT.md §3.
  }
}
{
  // Explicitly: 60 Hz and 120 Hz must agree on where the camera sits.
  const run = (dt) => {
    const s = makeSpring(0);
    let t = 0;
    for (; t < 4; t += dt) spring(s, 30 * t, XZ_OMEGA, dt);
    return 30 * t - s.x;
  };
  near(run(1 / 60), run(1 / 120), 0.35, '60 Hz and 120 Hz must frame the same');
}

// ------------------------------------------------------------- 5. the low-pass
for (const dt of RATES) {
  let x = 0;
  const rate = 5;
  const n = Math.round(1 / rate / dt);
  for (let i = 0; i < n; i++) x = lowpass(x, 1, rate, dt);
  near(x, 1 - Math.exp(-1), 0.02, `lowpass 1/rate should be 63% at ${Math.round(1 / dt)}Hz`);
  ok(x <= 1, 'a low-pass can never overshoot');
}
{
  // Frame-rate independence, which min(1, dt*k) did not have. Counted in steps
  // rather than accumulated seconds: `for (t = 0; t < 0.5; t += 1/30)` runs
  // sixteen times, not fifteen, and the extra step is floating point rather
  // than physics.
  const run = (dt) => { let x = 0; for (let i = 0, n = Math.round(0.5 / dt); i < n; i++) x = lowpass(x, 1, 5, dt); return x; };
  near(run(1 / 30), run(1 / 120), 0.001, 'lowpass must not depend on the frame rate');
  near(run(1 / 60), 1 - Math.exp(-2.5), 0.001, 'lowpass must match the closed form');
}

// --------------------------------------------------------- 6. the camera state
{
  const d = makeCamDamp();
  const out = [0, 0, 0];
  // First frame places, never sweeps: booting at the origin and asking for a
  // camera 900 m away must not fly the eye across town.
  ok(stepCamPos(d, out, 900, 4, -300, 1 / 60) === true, 'the first frame must snap');
  near(out[0], 900, 1e-9, 'snap x'); near(out[1], 4, 1e-9, 'snap y'); near(out[2], -300, 1e-9, 'snap z');
  ok(d.primed, 'primed after the first frame');

  // A metre of movement springs.
  ok(stepCamPos(d, out, 901, 4, -300, 1 / 60) === false, 'a small move must spring, not snap');
  ok(out[0] > 900 && out[0] < 901, `sprung x landed at ${out[0]}`);

  // A tow across the map snaps again, with the velocity thrown away — otherwise
  // the spring arrives at the new place still doing 300 m/s.
  d.x.v = 50;
  ok(stepCamPos(d, out, 900 + SNAP_DIST + 1, 4, -300, 1 / 60) === true, 'a teleport must snap');
  ok(d.x.v === 0 && d.y.v === 0 && d.z.v === 0, 'a snap must clear the velocities');

  // ...and just inside the threshold does not.
  resetCamDamp(d, 0, 0, 0);
  ok(stepCamPos(d, out, SNAP_DIST - 1, 0, 0, 1 / 60) === false, 'inside SNAP_DIST must spring');
}

// ------------------------------------------------- 7. the constants themselves
// These are read by main.js and by the comments above; if one moves, the claim
// moves with it.
ok(XZ_OMEGA === 2 * 9, 'XZ_OMEGA must match the old kxz = 9 for tracking lag');
ok(Y_OMEGA >= 12 && Y_OMEGA <= 16, `Y_OMEGA ${Y_OMEGA} is outside the band that keeps the framing`);
ok(SUSP_GAIN > 0 && SUSP_GAIN < 0.6, 'the camera should see some of the suspension, not all of it');
ok(SUSP_RATE > 0 && SUSP_RATE < 210 / 24, 'the suspension low-pass must be slower than the spring it filters');
ok(AIR_RATE > 0 && PITCH_RATE > 0 && SPEED_RATE > 0, 'the blend rates must be positive');

// The suspension filter, end to end: cars.js rings at sqrt(210) = 14.5 rad/s,
// and what reaches the eye must be a small fraction of that.
{
  const RING = Math.sqrt(210);
  const dt = 1 / 120;
  let x = 0;
  for (let i = 0; i < 240 * 2; i++) x = lowpass(x, Math.sin(RING * i * dt), SUSP_RATE, dt);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 240; i++) {
    x = lowpass(x, Math.sin(RING * (480 + i) * dt), SUSP_RATE, dt);
    if (x < lo) lo = x; if (x > hi) hi = x;
  }
  const seen = ((hi - lo) / 2) * SUSP_GAIN;
  ok(seen < 0.15, `the camera sees ${(seen * 100).toFixed(1)}% of the suspension ring, want < 15%`);
}

// The air gate, blended. A boolean chattering at 10 Hz over rough ground must
// not reach the picture as a 10 Hz square wave of camera lean.
{
  const dt = 1 / 120;
  let a = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 240 * 3; i++) {
    const flick = Math.floor(i * dt * 20) % 2;      // on/off ten times a second
    a = lowpass(a, flick, AIR_RATE, dt);
    if (i > 240) { if (a < lo) lo = a; if (a > hi) hi = a; }
  }
  ok(hi - lo < 0.35, `a 10 Hz inAir chatter still swings the lean by ${(hi - lo).toFixed(2)} of full`);
}

console.log(`smoke_camdamp: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
