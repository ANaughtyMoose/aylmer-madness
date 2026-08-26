// Stunt detection. Pure logic, no WebGL, no DOM — so it can be unit-tested
// under node (see tools/smoke.mjs).
//
// Two things live here:
//   * DoughnutMeter — counts full revolutions done while the car is actually
//     sliding, which is what makes a doughnut a doughnut and not a U-turn.
//   * the couch ballistics — what happens when a 1977 chesterfield meets a maple.
import { angleDelta, clamp } from '../core/math.js';

const TAU = Math.PI * 2;

export const DONUT = {
  radius: 22,          // metres from the house that count
  minKmh: 8,           // below this you are just parking
  slipLat: 3.0,        // m/s of sideways slide that counts as sliding
  slipYawRate: 1.2,    // rad/s under handbrake that counts as sliding
  pause: 1.0,          // seconds of not sliding before the lap resets
  target: 3,
};

// Feed it the car every tick. It accumulates signed heading change while the
// car is sliding; every 2*PI in the same direction is one doughnut. Stop
// sliding for DONUT.pause seconds, or swap direction, and the lap is lost.
export class DoughnutMeter {
  constructor(cfg = {}) {
    this.cfg = { ...DONUT, ...cfg };
    this.reset();
  }

  reset() {
    this.count = 0;
    this.acc = 0;
    this.dir = 0;
    this.lastYaw = null;
    this.idle = 0;
    this.sliding = false;
    this.scored = 0;      // doughnuts completed on the last update()
    return this;
  }

  // v: { x, z, yaw, vLat, yawRate, speedKmh }
  // opts: { handbrake, cx, cz }  — cx/cz is the spot you have to do them at.
  update(dt, v, opts = {}) {
    const c = this.cfg;
    this.scored = 0;
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
      // Change your mind mid-doughnut and you start the lap over.
      else if (s !== this.dir && Math.abs(dYaw) > 0.004) { this.dir = s; this.acc = 0; }
    }
    this.acc += dYaw;
    while (Math.abs(this.acc) >= TAU) {
      this.acc -= Math.sign(this.acc) * TAU;
      this.count++;
      this.scored++;
    }
    return this.state();
  }

  state() {
    return {
      count: this.count,
      progress: clamp(Math.abs(this.acc) / TAU, 0, 1),
      sliding: this.sliding,
      scored: this.scored,
    };
  }
}

// ---------------------------------------------------------------- the couch

export const COUCH = {
  g: 9.81,
  minKmh: 35,        // below this the couch just slumps forward
  startY: 1.5,       // it leaves from the roof rack
  up: 4.5,           // upward kick, m/s
  upPerSpeed: 0.55,  // ...plus this much per m/s of impact speed
  fwd: 0.30,         // the tree eats most of the forward momentum
  side: 0.18,        // per metre of off-centre hit, per m/s of speed:
                     // roughly +/- 1.2 m of aim is forgiven, past that it spins off
  flight: 1.20,      // seconds of animation
  spin: 5.0,         // rad/s of tumble
  hitRadius: 3.4,    // how close the car has to get to the trunk to count (a corner hit the trunk stops still counts)
};

// Does this car, right now, launch the couch? car: { x, z, yaw, vLong }.
// tree: { x, z, crownY, crownR, trunkR }.
export function couchLaunch(car, tree, cfg = COUCH) {
  const speed = Math.abs(car.vLong);
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  const dx = tree.x - car.x, dz = tree.z - car.z;
  const dist = Math.hypot(dx, dz);
  const ahead = dx * fx + dz * fz;          // + = the tree is in front of you
  const side = dx * rx + dz * rz;           // signed miss distance off the nose
  if (dist > (tree.trunkR || 0.5) + cfg.hitRadius) return { ok: false, reason: 'far', dist };
  if (ahead < -0.5) return { ok: false, reason: 'behind', dist };
  if (speed * 3.6 < cfg.minKmh) return { ok: false, reason: 'slow', speed, dist };

  const vy = cfg.up + cfg.upPerSpeed * speed;
  const vf = cfg.fwd * speed;
  const vs = -side * cfg.side * speed;      // clip it on one side, it goes the other
  return {
    ok: true,
    speed,
    p0: [car.x, cfg.startY, car.z],
    v: [fx * vf + rx * vs, vy, fz * vf + rz * vs],
    side,
  };
}

// Fly the arc and say where it ends up. It "sticks" if, on the way DOWN, it
// passes through the crown sphere — over the top and it lands on the lawn.
export function couchSim(launch, tree, cfg = COUCH) {
  const step = 1 / 120;
  let [x, y, z] = launch.p0;
  let [vx, vy, vz] = launch.v;
  const cy = tree.crownY, cr = tree.crownR;
  for (let t = 0; t < 4; t += step) {
    vy -= cfg.g * step;
    x += vx * step; y += vy * step; z += vz * step;
    if (vy <= 0) {
      const d = Math.hypot(x - tree.x, y - cy, z - tree.z);
      if (d <= cr) return { stuck: true, x, y, z, t, d };
    }
    if (y <= 0.35) return { stuck: false, x, y: 0.35, z, t };
  }
  return { stuck: false, x, y: 0.35, z, t: 4 };
}

// The animated version: 1.2 s of arc, tumbling, then it either freezes in the
// canopy or flops on the grass.
export class CouchFlight {
  constructor(launch, tree, cfg = COUCH) {
    this.cfg = cfg;
    this.tree = tree;
    this.result = couchSim(launch, tree, cfg);
    this.x = launch.p0[0]; this.y = launch.p0[1]; this.z = launch.p0[2];
    this.vx = launch.v[0]; this.vy = launch.v[1]; this.vz = launch.v[2];
    this.yaw = Math.atan2(launch.v[0], launch.v[2]);
    this.pitch = 0; this.roll = 0;
    this.t = 0;
    this.done = false;
  }

  update(dt) {
    if (this.done) return this;
    this.t += dt;
    const end = this.result.t;
    if (this.t >= end) {
      this.t = end;
      this.done = true;
      this.x = this.result.x; this.y = this.result.y; this.z = this.result.z;
      // In the tree it hangs at a rude angle; on the lawn it lands flat-ish.
      this.pitch = this.result.stuck ? 0.62 : 0.06;
      this.roll = this.result.stuck ? -0.48 : 0.0;
      return this;
    }
    this.vy -= this.cfg.g * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.pitch += this.cfg.spin * dt * 0.5;
    this.roll += this.cfg.spin * dt * 0.35;
    return this;
  }

  get stuck() { return this.result.stuck; }
}
