// Stunt detection. Pure logic, no WebGL, no DOM — so it can be unit-tested
// under node (see tools/smoke.mjs and tools/smoke_doughnut.mjs).
//
// DoughnutMeter counts revolutions done while the car is actually sliding,
// which is what makes a doughnut a doughnut and not a U-turn.
// (The couch ballistics that used to live here are gone: the couch goes into
// Mike's maple the way it really did, lifted off the truck. See sidejobs.js.)
//
// B-05 (forgiving doughnuts): every half-turn is banked as it is done, so a
// slide that breaks halfway round keeps the half; a break shorter than
// DONUT.pause keeps the whole part-lap; and doughnutAssist() lets the truck
// actually get going from rest with the lever up (it used to stall under
// 1.7 km/h, below the 8 km/h the meter asks for).
import { angleDelta, clamp } from '../core/math.js';

const TAU = Math.PI * 2;
const HALF = Math.PI;

export const DONUT = {
  radius: 22,          // metres from the house that count
  minKmh: 8,           // below this you are just parking
  // What counts as sliding. The Ranger's lever slide at full lock runs about
  // 2.2 m/s sideways and 0.85 rad/s of model yaw (the rest of its rotation is
  // the A-02 handbrake swing), so the old 3.0 and 1.2 never saw it.
  slipLat: 1.8,        // m/s of sideways slide that counts as sliding
  slipYawRate: 0.6,    // rad/s under handbrake that counts as sliding (the Sienna slides at 0.64)
  pause: 1.2,          // seconds of not sliding before the part-lap is lost
  target: 3,
  // doughnutAssist(): in the doughnut zone, W + full lock + the lever spins
  // the rear instead of braking the truck to a stop. It cancels the lever's
  // drag (spec.brake * LEVER, the same 0.55 cars.js uses) and adds `push`
  // m/s² of drive, up to `topKmh`, so a doughnut from rest gets past minKmh.
  assist: { topKmh: 20, push: 1.5, minSteer: 0.3, minThrottle: 0.5 },
};
const LEVER = 0.55;

// Feed it the car every tick. It accumulates signed heading change while the
// car is sliding. Every half-turn (PI) in one direction is banked for good;
// two banked halves are one doughnut. Stop sliding for DONUT.pause seconds, or
// swap direction, and only the unbanked part of the half-turn is lost.
export class DoughnutMeter {
  constructor(cfg = {}) {
    this.cfg = { ...DONUT, ...cfg };
    this.reset();
  }

  reset() {
    this.count = 0;
    this.halves = 0;      // banked half-turns, never taken away
    this.acc = 0;         // signed heading change since the last banked half
    this.dir = 0;
    this.lastYaw = null;
    this.idle = 0;
    this.sliding = false;
    this.scored = 0;      // doughnuts completed on the last update()
    this.halfScored = 0;  // half-turns banked on the last update()
    return this;
  }

  // v: { x, z, yaw, vLat, yawRate, speedKmh }
  // opts: { handbrake, cx, cz }  — cx/cz is the spot you have to do them at.
  update(dt, v, opts = {}) {
    const c = this.cfg;
    this.scored = 0;
    this.halfScored = 0;
    if (this.lastYaw == null) this.lastYaw = v.yaw;
    const dYaw = angleDelta(v.yaw, this.lastYaw);
    this.lastYaw = v.yaw;

    const inZone = opts.cx == null || Math.hypot(v.x - opts.cx, v.z - opts.cz) < c.radius;
    const fast = v.speedKmh > c.minKmh;
    const slip = Math.abs(v.vLat) > c.slipLat
      || (!!opts.handbrake && Math.abs(v.yawRate) > c.slipYawRate);
    this.sliding = inZone && fast && slip;

    if (!this.sliding) {
      this.idle += dt;
      if (this.idle > c.pause) { this.acc = 0; this.dir = 0; }
      return this.state();
    }
    this.idle = 0;

    const s = Math.sign(dYaw);
    if (s !== 0) {
      if (this.dir === 0) this.dir = s;
      // Change your mind mid-doughnut and the part of the half-turn you were
      // on is lost; the halves already banked stay.
      else if (s !== this.dir && Math.abs(dYaw) > 0.004) { this.dir = s; this.acc = 0; }
    }
    this.acc += dYaw;
    while (Math.abs(this.acc) >= HALF) {
      this.acc -= Math.sign(this.acc) * HALF;
      this.halves++;
      this.halfScored++;
      const n = Math.floor(this.halves / 2);
      if (n > this.count) { this.scored += n - this.count; this.count = n; }
    }
    return this.state();
  }

  // progress: how far round the current doughnut you are, 0..1, banked half
  // included, so the bar and the arc move on every half-turn.
  state() {
    return {
      count: this.count,
      halves: this.halves,
      progress: clamp(((this.halves % 2) * HALF + Math.abs(this.acc)) / TAU, 0, 1),
      sliding: this.sliding,
      scored: this.scored,
      halfScored: this.halfScored,
      dir: this.dir,
    };
  }
}

// One tick of the doughnut assist. `v` is the Vehicle (cars.js), `ctl` the
// pedals { throttle, steer, handbrake }. Call it after the vehicle's update and
// only while the player is in the doughnut zone. It only ever adds forward
// speed, never more than `topKmh`, and does nothing on two wheels, in the air,
// in reverse, or without the lever, the gas and the wheel all held. Returns
// true on a tick it pushed.
export function doughnutAssist(v, ctl, dt, cfg = DONUT.assist) {
  if (!v || !ctl || !(dt > 0) || !v.spec) return false;
  if (v.spec.twoWheel || v.inAir || v.dir < 0) return false;
  if (!ctl.handbrake || !((ctl.throttle || 0) >= cfg.minThrottle)) return false;
  if (!(Math.abs(ctl.steer || 0) >= cfg.minSteer)) return false;
  if (!Number.isFinite(v.vx) || !Number.isFinite(v.vz) || !Number.isFinite(v.yaw)) return false;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const vLong = v.vx * fx + v.vz * fz;
  if (vLong >= cfg.topKmh / 3.6) return false;
  const a = ((v.spec.brake || 0) * LEVER + cfg.push) * Math.min(1, ctl.throttle);
  v.vx += fx * a * dt;
  v.vz += fz * a * dt;
  return true;
}
