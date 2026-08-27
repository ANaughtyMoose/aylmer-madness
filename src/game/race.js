// AI rival drivers.
//
// A Rival is a real `Vehicle` out of cars.js with a robot at the wheel: same
// physics, same damage, same collisions, it just gets its `ctl` from a
// controller instead of from the keyboard. The controller is three ideas:
//
//   1. pure pursuit — aim at a point 12-20 m along the route (further the
//      faster you go) and steer at it;
//   2. a target speed that comes off the bend in the road ahead, so the car
//      lifts before a corner instead of understeering into a hedge;
//   3. a gentle rubber band — a friend who is 150 m up the road eases off, a
//      friend who is 90 m behind leans on it. Gentle: losing has to be possible.
//
// Rivals run reds. They are your friends, not saints. They do brake for a
// traffic car sitting in their lane, because a race that ends in the back of a
// Corsica is not a race.
//
// Nothing in update() allocates: the look-ahead probes write into module-level
// scratch, and the route is handed in whole (a whole race, all laps) so a
// racing rival never re-plans. The police re-plan, at most every 1.5 s each.
import { Vehicle } from './cars.js';
import { collideCars, contact } from './collide.js';
import { clamp, angleDelta } from '../core/math.js';
// Story agent: a friend going by you has something to say about it.
import { heckle } from './heckle.js';

// Per-driver tuning.
//   cruise    speed on a straight, m/s
//   cornerK   how much of it a bend sheds, per radian of bend ahead
//   minSpeed  the floor, so a hairpin never stalls the car
//   gain/damp steering: proportional on heading error, damped on yaw rate
//   band      throttle multipliers when well ahead / well behind the player
export const SKILL = {
  // Dave's Sunfire: quick in a straight line, lazy in the corners — which is
  // exactly what the car is.
  dave:     { cruise: 18.8, cornerK: 0.64, minSpeed: 6.2, gain: 1.55, damp: 0.26,
              band: { ahead: 0.88, behind: 1.08 } },
  // Sayyad's Civic: two thousand pounds of nothing. He barely lifts.
  sayyad:   { cruise: 17.8, cornerK: 0.40, minSpeed: 8.4, gain: 1.80, damp: 0.22,
              band: { ahead: 0.90, behind: 1.07 } },
  // Margaret's Saturn: average at everything, including at giving up.
  margaret: { cruise: 17.2, cornerK: 0.58, minSpeed: 6.6, gain: 1.60, damp: 0.26,
              band: { ahead: 0.88, behind: 1.09 } },
  // The cruiser. No rubber band: it is either on you or it is not.
  cop:      { cruise: 26.0, cornerK: 0.56, minSpeed: 7.0, gain: 1.70, damp: 0.24,
              band: { ahead: 1, behind: 1 } },
};

export const BAND_AHEAD = 150;    // m up the road before a rival eases off
export const BAND_BEHIND = 90;    // m down the road before it leans on it
export const STUCK_T = 3;         // seconds below STUCK_MS before a reset
export const STUCK_MS = 1.3;      // m/s
export const LOOK_MIN = 12, LOOK_MAX = 20;
export const AVOID_D = 10;        // brake for a traffic car this close ahead
export const AVOID_W = 2.6;       // ...and this far off the centre of the lane
export const RESET_AHEAD = 8;     // how far up the road a stuck rival is put back

// Scratch. Module-level so the hot loop allocates nothing.
const PA = [0, 0], PB = [0, 0];

export class Rival {
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.veh = new Vehicle(spec);
    this.veh.assist = true;
    this.id = opts.id || spec.id;
    this.name = opts.name || spec.who || spec.name;
    this.skill = opts.skill || SKILL.dave;
    this.ctl = { steer: 0, throttle: 0, brake: 0, handbrake: false };
    this.path = [];
    this.cum = new Float64Array(0);
    this.n = 0;                 // points actually in `path`
    this.i = 0;                 // segment the car is on
    this.active = false;        // released from the grid?
    this.finished = false;
    this.stuckT = 0;
    this.resets = 0;
    this.band = 1;
    this.blocked = false;
    this.done = 0;              // checkpoints passed (the race code owns this)
    this.progress = 0;
    this.tint = opts.tint || null;
  }

  // The collide.js / minimap contract, so a rival can stand in for a traffic car.
  get x() { return this.veh.x; }
  get z() { return this.veh.z; }
  get yaw() { return this.veh.yaw; }
  get speed() { return Math.abs(this.veh.vLong); }
  get speedKmh() { return this.veh.speedKmh; }

  place(x, z, yaw) {
    this.veh.reset(x, z, yaw);
    this.stuckT = 0;
    // Moving the car invalidates the segment index, and _advance() only ever
    // walks forward, so re-find it here rather than leave the car chasing the
    // far end of its own route.
    if (this.n > 1) this._reindex();
    return this;
  }

  /**
   * Adopt a route: an array of [x, z] the way nav.route() hands it back. The
   * cumulative-length table is rebuilt here and nowhere else, and the backing
   * Float64Array is only ever grown, so a re-planning cruiser is not churning
   * the heap every 1.5 s.
   */
  setPath(pts) {
    if (!pts || pts.length < 2) return false;
    this.path = pts;
    this.n = pts.length;
    if (this.cum.length < this.n) this.cum = new Float64Array(this.n + 64);
    this.cum[0] = 0;
    for (let k = 1; k < this.n; k++) {
      this.cum[k] = this.cum[k - 1] +
        Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    }
    this.i = 0;
    this.finished = false;
    this._reindex();
    return true;
  }

  get pathLength() { return this.n > 1 ? this.cum[this.n - 1] : 0; }

  // Jump `i` to the segment nearest the car. Only called on a new path, so the
  // per-frame version below can be the cheap forward-only walk.
  _reindex() {
    let best = 0, bd = Infinity;
    for (let k = 0; k + 1 < this.n; k++) {
      const d = this._segDist(k);
      if (d < bd) { bd = d; best = k; }
    }
    this.i = best;
  }

  _segDist(k) {
    const p = this.path, v = this.veh;
    const ax = p[k][0], az = p[k][1];
    const ex = p[k + 1][0] - ax, ez = p[k + 1][1] - az;
    const l2 = ex * ex + ez * ez || 1e-6;
    const t = clamp(((v.x - ax) * ex + (v.z - az) * ez) / l2, 0, 1);
    const dx = ax + ex * t - v.x, dz = az + ez * t - v.z;
    return Math.hypot(dx, dz);
  }

  // Walk `i` forward while the car has driven past the end of its segment.
  _advance() {
    const p = this.path, v = this.veh;
    while (this.i + 2 < this.n) {
      const ax = p[this.i][0], az = p[this.i][1];
      const ex = p[this.i + 1][0] - ax, ez = p[this.i + 1][1] - az;
      const l2 = ex * ex + ez * ez || 1e-6;
      if (((v.x - ax) * ex + (v.z - az) * ez) / l2 > 1) this.i++;
      else break;
    }
  }

  // Distance travelled along the route, metres.
  along() {
    if (this.n < 2) return 0;
    const p = this.path, v = this.veh, k = this.i;
    const ax = p[k][0], az = p[k][1];
    const ex = p[k + 1][0] - ax, ez = p[k + 1][1] - az;
    const l2 = ex * ex + ez * ez || 1e-6;
    const t = clamp(((v.x - ax) * ex + (v.z - az) * ez) / l2, 0, 1);
    return this.cum[k] + Math.sqrt(l2) * t;
  }

  // How far off the line the car actually is.
  offLine() { return this.n > 1 ? this._segDist(this.i) : 0; }

  // A point `d` metres further along the route than the car is now, into `out`.
  lookAhead(d, out) {
    const p = this.path;
    if (this.n < 2) { out[0] = this.veh.x; out[1] = this.veh.z; return false; }
    let want = this.along() + d;
    const total = this.cum[this.n - 1];
    if (want >= total) {
      out[0] = p[this.n - 1][0]; out[1] = p[this.n - 1][1];
      return false;
    }
    let k = this.i;
    while (k + 1 < this.n - 1 && this.cum[k + 1] < want) k++;
    const seg = this.cum[k + 1] - this.cum[k] || 1e-6;
    const t = clamp((want - this.cum[k]) / seg, 0, 1);
    out[0] = p[k][0] + (p[k + 1][0] - p[k][0]) * t;
    out[1] = p[k][1] + (p[k + 1][1] - p[k][1]) * t;
    return true;
  }

  /**
   * One step. `world` is main.js's G.phys; `ctx` carries the optional traffic
   * list to avoid and the rubber-band multiplier the race code worked out.
   */
  update(dt, world, ctx) {
    const v = this.veh, s = this.skill;
    if (!this.active || this.n < 2) {
      this.ctl.steer = 0; this.ctl.throttle = 0; this.ctl.brake = 1;
      this.ctl.handbrake = true;
      v.update(dt, this.ctl, world);
      return;
    }
    this._advance();

    // ---- 1. pure pursuit -------------------------------------------------
    const sp = v.vLong;
    const look = clamp(9 + Math.abs(sp) * 0.62, LOOK_MIN, LOOK_MAX);
    const atEnd = !this.lookAhead(look, PA);
    const err = angleDelta(Math.atan2(PA[0] - v.x, PA[1] - v.z), v.yaw);
    // Positive yaw is a left turn (forward is (sin yaw, cos yaw), local +X is
    // the driver's left), and Vehicle turns left on negative ctl.steer.
    this.ctl.steer = clamp(-err * s.gain + v.yawRate * s.damp, -1, 1);

    // ---- 2. how fast do we want to be going ------------------------------
    // Two probes: where the road is in a moment, and where it is after that.
    // The angle between them is the bend, and the bend is what you lift for.
    const d1 = clamp(6 + Math.abs(sp) * 0.9, 8, 26);
    this.lookAhead(d1, PA);
    this.lookAhead(d1 + clamp(8 + Math.abs(sp) * 1.0, 10, 30), PB);
    const bend = Math.abs(angleDelta(
      Math.atan2(PB[0] - PA[0], PB[1] - PA[1]),
      Math.atan2(PA[0] - v.x, PA[1] - v.z)));
    let want = s.cruise * (1 - Math.min(0.74, bend * s.cornerK));
    want = Math.max(s.minSpeed, want) * (ctx && ctx.band ? ctx.band : this.band);
    // Fighting the wheel is its own reason to slow down.
    if (Math.abs(err) > 0.5) want = Math.min(want, s.minSpeed + 2);
    if (atEnd) want = Math.min(want, 9);

    // ---- 3. crude traffic avoidance -------------------------------------
    this.blocked = false;
    const traffic = ctx && ctx.traffic;
    if (traffic && traffic.length) {
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      for (let k = 0; k < traffic.length; k++) {
        const o = traffic[k];
        const rx = o.x - v.x, rz = o.z - v.z;
        const ahead = rx * fx + rz * fz;
        if (ahead < 1 || ahead > AVOID_D) continue;
        if (Math.abs(rx * fz - rz * fx) > AVOID_W) continue;
        this.blocked = true;
        break;
      }
    }

    // ---- 4. pedals -------------------------------------------------------
    if (this.blocked) {
      this.ctl.throttle = 0;
      this.ctl.brake = 1;
    } else if (sp < want - 0.4) {
      this.ctl.throttle = 1; this.ctl.brake = 0;
    } else if (sp > want + 1.2) {
      this.ctl.throttle = 0; this.ctl.brake = clamp((sp - want) / 6, 0.2, 1);
    } else {
      this.ctl.throttle = 0.4; this.ctl.brake = 0;
    }
    this.ctl.handbrake = false;

    v.update(dt, this.ctl, world);

    // ---- 5. stuck ---------------------------------------------------------
    // Wedged on a pole, spun into a fence, nose-first in somebody's hedge: give
    // it three seconds of dignity and then put it back on the road ahead.
    if (Math.abs(v.vLong) < STUCK_MS || this.offLine() > 28) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > STUCK_T) this.unstick();

    if (this.along() >= this.pathLength - 4) this.finished = true;
  }

  // Back onto the road a short way ahead, pointing the right way. Deliberately
  // a bounded hop (RESET_AHEAD metres, never "jump to the next node", which on
  // a two-point route would be the finish line) so a wedged rival loses time
  // rather than gaining it.
  unstick() {
    if (this.n < 2) return;
    this.stuckT = 0;
    this.resets++;
    this.lookAhead(RESET_AHEAD, PA);
    this.lookAhead(RESET_AHEAD + 14, PB);
    const dx = PB[0] - PA[0], dz = PB[1] - PA[1];
    const yaw = (dx || dz) ? Math.atan2(dx, dz) : this.veh.yaw;
    this.veh.reset(PA[0], PA[1], yaw);
    this.veh.vLong = 4;
    this.veh.vx = Math.sin(yaw) * 4;
    this.veh.vz = Math.cos(yaw) * 4;
  }
}

// ---------------------------------------------------------------- collisions

/**
 * Two cars that both feel it. collide.js resolves the pair's velocities; the
 * damage model wants a call on each side with the normal pointing at it.
 */
export function collideRivals(A, B) {
  const closing = collideCars(A, B);
  if (closing <= 0) return 0;
  const nx = contact.nx, nz = contact.nz;
  if (A.hit) { A.hit(closing, nx, nz); A.syncFrame && A.syncFrame(); }
  if (B.hit) { B.hit(closing, -nx, -nz); B.syncFrame && B.syncFrame(); }
  return closing;
}

/**
 * main.js hook: step every live rival, then let them hit the player, each other
 * and the traffic. Cheap no-op when nobody is racing, which is most of the time.
 */
export function updateRivals(G, dt) {
  const list = G.rivals;
  if (!list || !list.length) return;
  const traffic = G.traffic ? G.traffic.cars : null;
  for (let i = 0; i < list.length; i++) {
    const rv = list[i];
    rv.ctx = rv.ctx || { traffic: null, band: 1 };
    rv.ctx.traffic = traffic;
    rv.ctx.band = rv.band;
    rv.update(dt, G.phys, rv.ctx);
    sassOnPass(G, rv);
    const closing = collideRivals(G.veh, rv.veh);
    if (closing > 0.9 && G.audio) G.audio.crash(Math.min(1, closing / 18));
    if (G.traffic && G.traffic.collideBody) G.traffic.collideBody(rv.veh);
    for (let j = i + 1; j < list.length; j++) collideRivals(rv.veh, list[j].veh);
  }
}

// ---------------------------------------------------------------- the track

/**
 * Story agent: the moment a rival goes from behind you to in front of you —
 * measured along YOUR nose, not the track, so it reads the way it looks from
 * the driver's seat — he gets one line in. The 30 m band stops a car running
 * beside you from setting it off every second, and heckle.js's own limiter
 * takes care of the rest.
 */
const PASS_BAND = 30;
function sassOnPass(G, rv) {
  const v = G.veh, c = rv.veh;
  if (!v || !c) return;
  const ahead = (c.x - v.x) * Math.sin(v.yaw) + (c.z - v.z) * Math.cos(v.yaw);
  const near = Math.hypot(c.x - v.x, c.z - v.z) < 90;
  if (rv.wasAhead === undefined) { rv.wasAhead = ahead > 0; return; }
  if (!rv.wasAhead && ahead > PASS_BAND) {
    rv.wasAhead = true;
    if (near && v.speedKmh > 25) heckle.say(rv.name, 'rival');
  } else if (rv.wasAhead && ahead < -PASS_BAND) {
    rv.wasAhead = false;
  }
}

/**
 * A checkpoint chain, one or more laps of it. Everybody in the race — you and
 * the rivals alike — is scored the same way: how many gates they have been
 * through, and how far they still are from the next one.
 */
export class Track {
  /**
   * `cps` are the gates in order, `laps` how many times round, `legs` the real
   * route length of each leg if the caller measured it (buildRacePath does),
   * and `start` the line, so leg 0 of the first lap is honest.
   */
  constructor(cps, laps = 1, legs = null, start = null) {
    this.cps = cps;
    this.laps = Math.max(1, laps);
    this.n = cps.length;
    const measured = legs && legs.length === this.n;
    this.legLen = new Array(this.n);
    for (let k = 0; k < this.n; k++) {
      if (measured && legs[k] > 0) { this.legLen[k] = legs[k]; continue; }
      const a = k === 0 ? (start || cps[this.n - 1]) : cps[k - 1];
      this.legLen[k] = Math.hypot(cps[k].x - a.x, cps[k].z - a.z);
    }
    this.cum = new Array(this.n);
    let s = 0;
    for (let k = 0; k < this.n; k++) { s += this.legLen[k]; this.cum[k] = s; }
    this.lapLen = s;
    this.total = this.lapLen * this.laps;
  }

  gate(done) { return this.cps[done % this.n]; }
  lapOf(done) { return Math.floor(done / this.n); }
  isFinished(done) { return done >= this.n * this.laps; }

  // Distance from the line to the `g`-th gate (0-based, laps included).
  gateDist(g) {
    if (g < 0) return 0;
    return Math.floor(g / this.n) * this.lapLen + this.cum[g % this.n];
  }

  // Metres of race behind a car that has passed `done` gates and is at (x, z).
  progress(done, x, z) {
    if (this.isFinished(done)) return this.total;
    const g = this.gate(done);
    const rest = Math.hypot(g.x - x, g.z - z);
    return Math.max(0, this.gateDist(done) - rest);
  }

  /**
   * Gate test. Bumps `racer.done` when the car is inside the ring; returns true
   * when that was the last gate of the last lap.
   */
  check(racer, x, z, radius) {
    if (this.isFinished(racer.done)) return true;
    const g = this.gate(racer.done);
    const r = radius || g.r || 16;
    if (Math.hypot(g.x - x, g.z - z) > r) return false;
    racer.done++;
    return this.isFinished(racer.done);
  }
}

// « 1er » / « 2e » / « 3e ».
export function ordinalFr(n) {
  return n === 1 ? '1er' : `${n}e`;
}

export const fmtGap = (m) =>
  (m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km');
