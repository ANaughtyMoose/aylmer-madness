// B-09: trauma shake and a capped hitstop on an event ladder.
//
// A pure module: no DOM, no GL, no G. main.js owns one instance, tells it what
// happened (event), counts it down with real seconds (update), and reads two
// numbers back: the camera offset for this frame (cameraOffset) and how fast
// the sim should run (timeScale). Nothing here touches the camera or the clock
// itself; B-12a wires both (see docs/qa/rf/B-09.md, CONTRACT NOTES).
//
// Trauma (after Squirrel Eiserloh, GDC 2016): every event adds to one number in
// 0..1, it falls back linearly at DECAY per second, and the shake is trauma
// squared, so a bin tap is a twitch and a head-on is a jolt that dies away in
// well under a second. The shake is smooth simplex noise, one channel per axis,
// never a sine, so it never repeats and never beats against the frame rate.
//
// Hitstop: a freeze of 40 to 100 ms by the event's importance. At most one per
// HITSTOP_GAP real seconds, never two at once, and never while the A-06
// slow-mo runs (a hitstop asked for during slow-mo is skipped). While a
// hitstop holds, timeScale() is 0 and holdsSlowmo() is true: main.js must not
// count the slow-mo down in that frame, so the two never overlap and the
// slow-mo still plays in full right after the freeze.

/** Linear trauma decay, per real second. */
export const DECAY = 1.2;
/** At most one hitstop per this many real seconds, counted from its start. */
export const HITSTOP_GAP = 0.5;
/** Hitstop length bounds, seconds. */
export const HITSTOP_MIN = 0.04;
export const HITSTOP_MAX = 0.1;
/** Camera offset bounds: translation length in metres, each angle in degrees. */
export const MAX_OFFSET_M = 0.35;
export const MAX_ANGLE_DEG = 2.5;

// The ladder. trauma: added per event (scaled by the caller's k, 0..1).
// stop: hitstop seconds (0 = none). every: the same kind cannot add trauma
// again within this many seconds, so a surface that reports every frame
// (gravel) or a run of near misses does not pin the shake at full.
export const LADDER = Object.freeze({
  gravel:   Object.freeze({ trauma: 0.10, stop: 0,    every: 0.4 }),
  nearMiss: Object.freeze({ trauma: 0.15, stop: 0,    every: 0.3 }),
  mailbox:  Object.freeze({ trauma: 0.25, stop: 0.04, every: 0 }),
  bin:      Object.freeze({ trauma: 0.25, stop: 0.04, every: 0 }),
  copRam:   Object.freeze({ trauma: 0.50, stop: 0.07, every: 0 }),
  headOn:   Object.freeze({ trauma: 0.80, stop: 0.10, every: 0 }),
});

/**
 * Pick a rung for a vehicle hit from its force (v.impact, 0..1, cars.js hit():
 * closing speed / 18 m/s). A hit on a cop car is always at least copRam.
 * Returns null for a touch too soft to feel.
 */
export function kindForImpact(impact, { cop = false } = {}) {
  const f = Number(impact) || 0;
  if (f >= 0.6) return 'headOn';
  if (cop && f >= 0.15) return 'copRam';
  if (f >= 0.35) return 'copRam';
  if (f >= 0.12) return 'bin';
  return null;
}

// ---------------------------------------------------------------- noise
// 2D simplex noise (Gustavson's reference, a fixed seeded permutation). Each
// axis samples its own row (y = channel * 17.3) along x = time * freq. Output is
// scaled to about -1..1 and clamped, so the bounds below are hard bounds.
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
const PERM = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 0x9e3779b9 >>> 0;
  for (let i = 255; i > 0; i--) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const j = s % (i + 1), t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
function corner(gi, x, y) {
  const t = 0.5 - x * x - y * y;
  if (t < 0) return 0;
  const g = (gi % 12) * 2, t2 = t * t;
  return t2 * t2 * (GRAD[g] * x + GRAD[g + 1] * y);
}
/** Simplex noise in -1..1 (clamped). */
export function simplex2(xin, yin) {
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s), j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t), y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  const n = corner(PERM[ii + PERM[jj]], x0, y0)
    + corner(PERM[ii + i1 + PERM[jj + j1]], x1, y1)
    + corner(PERM[ii + 1 + PERM[jj + 1]], x2, y2);
  const v = 70 * n;
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

// Per-axis amplitude at trauma 1 and scale 1. Translation is clamped to
// MAX_OFFSET_M as a vector, each angle to MAX_ANGLE_DEG.
const DEG = Math.PI / 180;
const AMP = { x: 0.26, y: 0.2, z: 0.12, pitch: 2.5 * DEG, yaw: 2.2 * DEG, roll: 1.8 * DEG };
const FREQ = 13;          // noise units per second: a jolt, not a buzz
const MAX_ANGLE = MAX_ANGLE_DEG * DEG;

/**
 * One feel state. `sink` (optional) is an object that gets the review
 * telemetry written onto it after every update: sink.offset (largest offset
 * length in metres since resetTelemetry) and sink.hitstops (hitstops fired).
 * Pass main.js's G.feel and AYLMER.feel() carries both with no other change.
 */
export function createFeel({ sink = null, seed = 0 } = {}) {
  let trauma = 0, time = seed * 31.7;
  let stopLeft = 0, stopDur = 0, sinceStop = Infinity;
  const lastKind = Object.create(null);
  let clock = 0;
  const tel = { offset: 0, angleDeg: 0, hitstops: 0, skippedSlowmo: 0, skippedGap: 0, events: 0, log: [] };
  const off = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, len: 0 };

  function writeSink() {
    if (!sink) return;
    sink.offset = +tel.offset.toFixed(4);
    sink.hitstops = tel.hitstops;
  }

  const api = {
    /**
     * Something happened. kind is a LADDER key; k (0..1, default 1) scales the
     * trauma (and only the trauma). slowmo: true when the A-06 slow-mo is
     * running right now; a hitstop is then skipped. Returns the hitstop
     * seconds that started (0 if none).
     */
    event(kind, { k = 1, slowmo = false } = {}) {
      const rung = LADDER[kind];
      if (!rung) return 0;
      if (rung.every > 0 && lastKind[kind] != null && clock - lastKind[kind] < rung.every) return 0;
      lastKind[kind] = clock;
      const kk = k > 1 ? 1 : k < 0 ? 0 : k;
      trauma = Math.min(1, trauma + rung.trauma * kk);
      tel.events++;
      if (!(rung.stop > 0)) return 0;
      if (slowmo) { tel.skippedSlowmo++; return 0; }
      if (stopLeft > 0 || sinceStop < HITSTOP_GAP) { tel.skippedGap++; return 0; }
      stopDur = stopLeft = Math.min(HITSTOP_MAX, Math.max(HITSTOP_MIN, rung.stop));
      sinceStop = 0;
      tel.hitstops++;
      if (tel.log.length >= 16) tel.log.shift();
      tel.log.push({ t: +clock.toFixed(3), kind, ms: Math.round(stopDur * 1000) });
      writeSink();
      return stopDur;
    },
    /** Count down with real seconds, once per real frame (and per AYLMER.step). */
    update(realDt) {
      const dt = realDt > 0 ? realDt : 0;
      clock += dt; time += dt; sinceStop += dt;
      if (stopLeft > 0) stopLeft = Math.max(0, stopLeft - dt);
      if (trauma > 0) trauma = Math.max(0, trauma - DECAY * dt);
      return api;
    },
    /**
     * This frame's camera offset, metres and radians, in camera space (x right,
     * y up, z back; pitch, yaw, roll). scale is the shake setting times any
     * per-camera factor, clamped to 0..1, so the bounds always hold. The
     * returned object is reused: copy what you keep.
     */
    cameraOffset(scale = 1) {
      const sc = scale > 1 ? 1 : scale > 0 ? scale : 0;
      const a = trauma * trauma * sc;
      if (a < 1e-5) {
        off.x = off.y = off.z = off.pitch = off.yaw = off.roll = off.len = 0;
        return off;
      }
      const u = time * FREQ;
      let x = AMP.x * a * simplex2(u, 0), y = AMP.y * a * simplex2(u, 17.3), z = AMP.z * a * simplex2(u, 34.6);
      let len = Math.hypot(x, y, z);
      if (len > MAX_OFFSET_M) { const r = MAX_OFFSET_M / len; x *= r; y *= r; z *= r; len = MAX_OFFSET_M; }
      const clampA = (v) => (v > MAX_ANGLE ? MAX_ANGLE : v < -MAX_ANGLE ? -MAX_ANGLE : v);
      off.x = x; off.y = y; off.z = z; off.len = len;
      off.pitch = clampA(AMP.pitch * a * simplex2(u, 51.9));
      off.yaw = clampA(AMP.yaw * a * simplex2(u, 69.2));
      off.roll = clampA(AMP.roll * a * simplex2(u, 86.5));
      if (len > tel.offset) { tel.offset = len; writeSink(); }
      const ang = Math.max(Math.abs(off.pitch), Math.abs(off.yaw), Math.abs(off.roll)) / DEG;
      if (ang > tel.angleDeg) tel.angleDeg = ang;
      return off;
    },
    /** Sim speed for this frame: 0 while a hitstop holds, else slowmoScale. */
    timeScale(slowmoScale = 1) { return stopLeft > 0 ? 0 : slowmoScale; },
    /** True while a hitstop holds: do not count the slow-mo down this frame. */
    holdsSlowmo() { return stopLeft > 0; },
    /** 0..1 */
    trauma() { return trauma; },
    /** Seconds left on the current hitstop (0 when none). */
    hitstopLeft() { return stopLeft; },
    /** The review numbers (a copy). */
    telemetry() {
      return { offset: +tel.offset.toFixed(4), angleDeg: +tel.angleDeg.toFixed(3), hitstops: tel.hitstops,
        skippedSlowmo: tel.skippedSlowmo, skippedGap: tel.skippedGap, events: tel.events, trauma: +trauma.toFixed(4),
        log: tel.log.slice() };
    },
    /** Zero the review maxima and counts (not the live shake). */
    resetTelemetry() {
      tel.offset = 0; tel.angleDeg = 0; tel.hitstops = 0; tel.skippedSlowmo = 0; tel.skippedGap = 0; tel.events = 0; tel.log.length = 0;
      writeSink();
    },
    /** Stop everything now (teleport, new game, cinematic). */
    clear() { trauma = 0; stopLeft = 0; stopDur = 0; return api; },
  };
  writeSink();
  return api;
}
