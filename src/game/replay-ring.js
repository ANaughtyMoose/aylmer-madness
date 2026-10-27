// [w6-crashnight] C-12 core: a fixed-size ring of car states sampled by sim time,
// so a big crash can be played back. No allocation after construction.
// Pure module (no DOM, no GL): node-tested by tools/smoke_replay_ring.mjs.

export const RING = {
  hz: 60,          // samples per sim second
  ringSec: 2.4,    // capacity: 2.0 s clip (1.2 pre + 0.8 post) + 0.4 s slack
  pre: 1.2, post: 0.8,
  maxCars: 16,     // player is slot 0, then up to 15 nearby cars
  teleport: 8,     // m of player jump between two samples = ring reset
};

const F = 7; // floats per car: x, y, z, yaw, pitch, roll, speed

export class ReplayRing {
  constructor(opts = {}) {
    this.hz = opts.hz || RING.hz;
    this.maxCars = opts.maxCars || RING.maxCars;
    this.cap = Math.ceil((opts.ringSec || RING.ringSec) * this.hz);
    this.teleport = opts.teleport || RING.teleport;
    this.t = new Float64Array(this.cap);
    this.n = new Uint8Array(this.cap);            // cars in each sample
    this.ids = new Int32Array(this.cap * this.maxCars);
    this.s = new Float32Array(this.cap * this.maxCars * F);
    this.head = 0; this.len = 0; this.nextT = -Infinity;
    this.resets = 0;
  }
  reset() { this.head = 0; this.len = 0; this.nextT = -Infinity; this.resets++; }

  // cars: array of { id, x, y, z, yaw, pitch?, roll?, speed? }; cars[0] is the player.
  // Samples only when sim time t crosses the next 1/hz tick. Returns true if stored.
  record(t, cars) {
    if (t < this.nextT) return false;
    if (this.len > 0 && cars.length) {
      const last = (this.head - 1 + this.cap) % this.cap;
      const o = last * this.maxCars * F, p = cars[0];
      const dx = p.x - this.s[o], dz = p.z - this.s[o + 2];
      if (dx * dx + dz * dz > this.teleport * this.teleport || t < this.t[last]) this.reset();
    }
    const i = this.head, k = Math.min(cars.length, this.maxCars);
    this.t[i] = t; this.n[i] = k;
    for (let c = 0; c < k; c++) {
      const car = cars[c], o = (i * this.maxCars + c) * F;
      this.ids[i * this.maxCars + c] = car.id | 0;
      this.s[o] = car.x; this.s[o + 1] = car.y || 0; this.s[o + 2] = car.z;
      this.s[o + 3] = car.yaw || 0; this.s[o + 4] = car.pitch || 0;
      this.s[o + 5] = car.roll || 0; this.s[o + 6] = car.speed || 0;
    }
    this.head = (i + 1) % this.cap;
    if (this.len < this.cap) this.len++;
    this.nextT = (this.nextT === -Infinity ? t : this.nextT) + 1 / this.hz;
    if (this.nextT <= t) this.nextT = t + 1 / this.hz;
    return true;
  }

  // sample index j from oldest (0) to newest (len-1)
  slot(j) { return (this.head - this.len + j + this.cap) % this.cap; }
  firstT() { return this.len ? this.t[this.slot(0)] : NaN; }
  lastT() { return this.len ? this.t[this.slot(this.len - 1)] : NaN; }

  // Interpolated pose of car id at time t into out {x,y,z,yaw,pitch,roll,speed}.
  // Returns false if t is outside the ring or the car is absent at either side.
  poseAt(t, id, out) {
    if (!this.len || t < this.firstT() || t > this.lastT()) return false;
    let lo = 0, hi = this.len - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.t[this.slot(m)] <= t) lo = m; else hi = m; }
    const a = this.slot(lo), b = this.slot(hi);
    const oa = this._find(a, id), ob = this._find(b, id);
    if (oa < 0 || ob < 0) return false;
    const span = this.t[b] - this.t[a], u = span > 0 ? Math.min(1, Math.max(0, (t - this.t[a]) / span)) : 0;
    const s = this.s, L = (q) => s[oa + q] + (s[ob + q] - s[oa + q]) * u;
    out.x = L(0); out.y = L(1); out.z = L(2);
    let dy = s[ob + 3] - s[oa + 3];
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    out.yaw = s[oa + 3] + dy * u;
    out.pitch = L(4); out.roll = L(5); out.speed = L(6);
    return true;
  }
  _find(i, id) {
    const base = i * this.maxCars, k = this.n[i];
    for (let c = 0; c < k; c++) if (this.ids[base + c] === id) return (base + c) * F;
    return -1;
  }

  // Clip window around crash time ct, clamped to what the ring holds.
  clip(ct, pre = RING.pre, post = RING.post) {
    if (!this.len) return null;
    const t0 = Math.max(this.firstT(), ct - pre), t1 = Math.min(this.lastT(), ct + post);
    return t1 > t0 ? { t0, t1, crashT: ct } : null;
  }
}
