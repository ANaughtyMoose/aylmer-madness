// The canoe. A second, much dumber vehicle: no grip, no gears, a great deal of
// momentum and a hole in it.
//
// It exposes the same handful of fields the chase camera and the HUD read off a
// Vehicle — x, z, yaw, vLong, vLat, pitch, roll, spec.topSpeed, speedKmh — so
// render() can focus on it without knowing what it is.
import { clamp } from '../core/math.js';

export const PADDLE = {
  // A canoe cruises at about 1.5 m/s and two teens sprinting one will hit 2.5.
  // This is 13 km/h, which is a lie, but Île Aylmer is 1.2 km off the beach and
  // nobody wants to hold W for eight minutes. Turn it down to 2.5 for realism.
  top: 3.6,
  accel: 2.2,          // paddling forward
  back: 1.0,           // back-paddling
  turn: 1.05,          // rad/s at speed
  turnStill: 0.34,     // you can still spin on the spot, slowly
  dragLin: 0.32,       // hull drag ~ linear + quadratic
  dragQuad: 0.075,
  latDrag: 2.6,        // a canoe barely slides sideways
  current: 1.5,        // Lac Deschênes, running toward the island
  shoreBounce: 0.15,
};

export class Boat {
  // world: { waterAt(x,z), bounds }; opts: { land(x,z), current: {x,z} }
  constructor(world, opts = {}) {
    this.world = world;
    this.land = opts.land || (() => false);
    this.current = opts.current || { x: 0, z: 0 };
    this.spec = { topSpeed: PADDLE.top, wid: 0.92, len: 4.8, seats: 0, wheelR: 0.3 };
    this.active = false;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vLong = 0; this.vLat = 0; this.yawRate = 0;
    this.pitch = 0; this.roll = 0; this.spin = 0; this.steer = 0;
    this.t = 0;
    this.water = 0;           // 0 dry .. 1 swamped
    this.leakRate = 0;        // per second
    this.grounded = false;
    this.beached = 0;         // seconds spent stuck on something
    this.skid = 0;
    this.impact = 0;
  }

  // quality 0..1 from the Bondo minigame; fillSeconds is how long a *perfect*
  // patch takes to fill the boat. A bad patch fills it a good deal sooner.
  setLeak(quality, fillSeconds) {
    const q = clamp(quality, 0, 1);
    this.quality = q;
    this.leakRate = 1 / Math.max(20, fillSeconds * (0.55 + 0.45 * q));
  }

  get speedKmh() { return Math.abs(this.vLong) * 3.6; }
  get swamped() { return this.water >= 1; }
  get forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }

  floats(x, z) {
    return this.world.waterAt(x, z) && !this.land(x, z);
  }

  update(dt, ctl) {
    this.t += dt;
    const P = PADDLE;

    // Water in the boat: slower, heavier, harder to turn.
    this.water = clamp(this.water + this.leakRate * dt, 0, 1);
    const swamp = 1 - this.water * 0.45;

    let a = 0;
    if (ctl.throttle > 0) a += ctl.throttle * P.accel * swamp;
    if (ctl.brake > 0) a -= ctl.brake * P.back * swamp;
    a -= this.vLong * P.dragLin;
    a -= this.vLong * Math.abs(this.vLong) * P.dragQuad;
    this.vLong = clamp(this.vLong + a * dt, -P.top * 0.4, P.top * swamp);
    if (ctl.throttle === 0 && ctl.brake === 0 && Math.abs(this.vLong) < 0.05) this.vLong = 0;

    // Steering. A canoe turns on the paddle, not on the hull, so there is turn
    // authority at a standstill and it never bites.
    const sf = clamp(Math.abs(this.vLong) / (P.top * 0.7), 0, 1);
    const rate = -(ctl.steer || 0) * (P.turnStill + (P.turn - P.turnStill) * sf) * swamp;
    this.yawRate += (rate - this.yawRate) * Math.min(1, dt * 3.2);
    this.yaw += this.yawRate * dt;
    this.steer = ctl.steer || 0;

    // Sideways slip washes off almost instantly.
    this.vLat -= this.vLat * Math.min(1, P.latDrag * dt);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let vx = fx * this.vLong + rx * this.vLat + this.current.x;
    let vz = fz * this.vLong + rz * this.vLat + this.current.z;

    // Move, but only over water. Try the full step, then each axis on its own so
    // you slide along a shoreline instead of sticking to it.
    const nx = this.x + vx * dt, nz = this.z + vz * dt;
    this.grounded = false;
    if (this.floats(nx, nz)) {
      this.x = nx; this.z = nz;
    } else if (this.floats(nx, this.z)) {
      this.x = nx; this.grounded = true; vz = 0;
    } else if (this.floats(this.x, nz)) {
      this.z = nz; this.grounded = true; vx = 0;
    } else {
      this.grounded = true;
    }
    if (this.grounded) {
      this.vLong *= PADDLE.shoreBounce;
      this.vLat = 0;
      this.beached += dt;
    } else {
      this.beached = 0;
    }

    // Cosmetic: a slow bob, and a lean into the turn. Sinks lower as it fills.
    this.pitch = Math.sin(this.t * 1.7) * 0.020 - clamp(this.vLong * 0.012, -0.05, 0.05);
    this.roll = Math.sin(this.t * 1.13) * 0.030 + clamp(this.yawRate * 0.10, -0.10, 0.10);
    this.draft = this.water * 0.16;
    this.skid = 0;

    const W = this.world.bounds;
    if (W) {
      this.x = clamp(this.x, W.minX + 6, W.maxX - 6);
      this.z = clamp(this.z, W.minZ + 6, W.maxZ - 6);
    }
    return this;
  }
}

// Straight-line unit vector from a to b, times PADDLE.current — the drift that
// makes the crossing survivable.
export function currentToward(from, to, strength = PADDLE.current) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: (dx / d) * strength, z: (dz / d) * strength };
}
