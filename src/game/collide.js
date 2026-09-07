// Car-vs-car response. Every car is two circles strung along its length — a
// stadium that hugs an oriented rectangle closely enough at Aylmer speeds and
// costs four subtractions and one square root instead of a full SAT.
//
// A "body" is any object carrying:
//   x, z, yaw          position and heading (forward = (sin yaw, cos yaw))
//   vx, vz             world velocity
//   yawRate, yawSpin   angular velocity: steering + impact spin (either may be absent)
//   mass, len, wid     the numbers off the spec sheet
// The solver writes back to x/z, vx/vz and yawSpin. Nothing is allocated.
//
// Local +X is the driver's LEFT, so a point at local (lx, lz) sits at
//   world = (x + lx·cos y + lz·sin y,  z − lx·sin y + lz·cos y)
// and its velocity is (vx + ω·rz, vz − ω·rx) for r = point − centre. Every
// angular term below falls out of that one identity.
import { clamp } from '../core/math.js';

export const RESTITUTION = 0.30;   // arcade: a hit shoves more than it bounces
export const FRICTION = 0.55;      // tangential scrub at the contact patch
export const SPIN = 1.35;          // extra rotation on off-centre hits, for flavour

// Consecutive circles are this many radii apart, so they always overlap: at
// 1.5 r two circles of radius r cover the strip between them out to two thirds
// of the way to the flank, which is far more than a rectangle-in-a-stadium ever
// promised. See circles() for why the count is not two.
export const SPACING = 1.5;

// Scratch — module-level so the hot loop never allocates. They grow to the
// longest body ever tested and are then reused; `cn` carries the count out of
// circles(), which already has a return value.
const AS = [], BS = [];
let cn = 0;

// The last contact found, filled by findContact() and consumed by resolveContact().
export const contact = {
  nx: 0, nz: 0,     // unit normal, pointing from B toward A
  pen: 0,           // penetration depth, metres
  px: 0, pz: 0,     // contact point in world space
  closing: 0,       // approach speed along the normal, m/s (0 if separating)
  impulse: 0,       // normal impulse magnitude, N·s
};

// Fills `into` with the circle centres nose to tail and returns their radius;
// the count is left in `cn`.
//
// This used to be exactly two circles, one at each end. For a 4.5 m car that is
// a fair stadium — the circles are 2.7 m apart and 1.7 m across, so the hole in
// the middle is under a metre and something is always touching. For the STO bus
// it is not a stadium at all: 12 m long and 2.59 m wide puts the two circles
// 9.4 m apart with a radius of 1.3, leaving SIX AND A HALF METRES of the middle
// of the bus with no collider in it. That is Thomas's "sometimes you can drive
// through a bus", and it was never about the bus's extents — traffic.js has had
// `len: spec.len` on it since it was written. It was the shape.
//
// So the span is filled with as many circles as it takes for consecutive ones
// to overlap. A short body still gets the two it always had plus enough to
// close its own middle; nothing gets wider, because the radius is untouched.
function circles(b, into) {
  const r = b.wid * 0.5;
  const end = Math.max(0.05, b.len * 0.5 - r);
  const n = Math.max(2, Math.ceil((end * 2) / (r * SPACING)) + 1);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  for (let i = 0; i < n; i++) {
    let p = into[i];
    if (!p) { p = { x: 0, z: 0 }; into[i] = p; }
    const o = end - (end * 2 * i) / (n - 1);      // nose first, as before
    p.x = b.x + fx * o; p.z = b.z + fz * o;
  }
  cn = n;
  return r;
}

const invInertia = (b) => (b.mass > 0 ? 12 / (b.mass * (b.len * b.len + b.wid * b.wid)) : 0);
const omega = (b) => (b.yawRate || 0) + (b.yawSpin || 0);

// Cheap reject before the four circle tests: are the bounding radii even close?
export function nearby(A, B, slack = 0) {
  const dx = A.x - B.x, dz = A.z - B.z;
  const r = (A.len + B.len) * 0.5 + slack;
  return dx * dx + dz * dz < r * r;
}

// Deepest overlapping circle pair, written into `contact`. True if they touch.
export function findContact(A, B) {
  const ra = circles(A, AS), na = cn;
  const rb = circles(B, BS), nb = cn;
  const sum = ra + rb, sum2 = sum * sum;
  let best = 0;
  for (let i = 0; i < na; i++) {
    const a = AS[i];
    for (let j = 0; j < nb; j++) {
      const b = BS[j];
      let dx = a.x - b.x, dz = a.z - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= sum2) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) {   // perfectly stacked: shove along A's own axis
        dx = Math.sin(A.yaw); dz = Math.cos(A.yaw); d = 1;
      }
      const pen = sum - d;
      if (pen <= best) continue;
      best = pen;
      const nx = dx / d, nz = dz / d;
      contact.nx = nx; contact.nz = nz; contact.pen = pen;
      contact.px = a.x - nx * (ra - pen * 0.5);
      contact.pz = a.z - nz * (ra - pen * 0.5);
    }
  }
  return best > 0;
}

/**
 * Separates the pair and applies one normal + one friction impulse at the
 * contact point found by findContact(). Returns the approach speed in m/s,
 * which is what the damage model and the crash sound both want.
 */
export function resolveContact(A, B, e = RESTITUTION, mu = FRICTION, spinK = SPIN) {
  const nx = contact.nx, nz = contact.nz;
  const imA = A.mass > 0 ? 1 / A.mass : 0, imB = B.mass > 0 ? 1 / B.mass : 0;
  const iiA = invInertia(A), iiB = invInertia(B);

  // Positional correction first, split by inverse mass: the heavier car holds.
  const tot = imA + imB;
  if (tot > 0) {
    const push = contact.pen / tot;
    A.x += nx * push * imA; A.z += nz * push * imA;
    B.x -= nx * push * imB; B.z -= nz * push * imB;
  }

  const rax = contact.px - A.x, raz = contact.pz - A.z;
  const rbx = contact.px - B.x, rbz = contact.pz - B.z;
  const wa = omega(A), wb = omega(B);
  const rvx = (A.vx + wa * raz) - (B.vx + wb * rbz);
  const rvz = (A.vz - wa * rax) - (B.vz - wb * rbx);
  const vn = rvx * nx + rvz * nz;
  contact.closing = vn < 0 ? -vn : 0;
  contact.impulse = 0;
  if (vn >= 0) return 0;                       // already pulling apart

  // Normal impulse. The angular Jacobian of a contact along n is (n × r).
  const ja = nx * raz - nz * rax;
  const jb = nx * rbz - nz * rbx;
  const kn = imA + imB + ja * ja * iiA + jb * jb * iiB;
  const jn = kn > 1e-9 ? -(1 + e) * vn / kn : 0;
  if (jn <= 0) return 0;
  contact.impulse = jn;

  A.vx += jn * nx * imA; A.vz += jn * nz * imA;
  B.vx -= jn * nx * imB; B.vz -= jn * nz * imB;
  A.yawSpin = (A.yawSpin || 0) + jn * ja * iiA * spinK;
  B.yawSpin = (B.yawSpin || 0) - jn * jb * iiB * spinK;

  // Coulomb friction along the tangent, clamped to μ·jn.
  const tx = -nz, tz = nx;
  const vt = rvx * tx + rvz * tz;
  if (vt !== 0) {
    const ta = tx * raz - tz * rax;
    const tb = tx * rbz - tz * rbx;
    const kt = imA + imB + ta * ta * iiA + tb * tb * iiB;
    let jt = kt > 1e-9 ? -vt / kt : 0;
    const lim = mu * jn;
    jt = clamp(jt, -lim, lim);
    A.vx += jt * tx * imA; A.vz += jt * tz * imA;
    B.vx -= jt * tx * imB; B.vz -= jt * tz * imB;
    A.yawSpin = (A.yawSpin || 0) + jt * ta * iiA * spinK;
    B.yawSpin = (B.yawSpin || 0) - jt * tb * iiB * spinK;
  }
  return contact.closing;
}

// findContact + resolveContact, with the cheap reject in front. Returns the
// approach speed in m/s, or 0 if they never touched.
export function collideCars(A, B, e = RESTITUTION, mu = FRICTION, spinK = SPIN) {
  if (!nearby(A, B, 0.6)) return 0;
  if (!findContact(A, B)) return 0;
  return resolveContact(A, B, e, mu, spinK);
}

// Give a plain object (a parked car, a traffic car) the fields the solver reads.
// Idempotent, so it can sit in a loop.
export function asBody(o, spec) {
  if (o.len === undefined) {
    o.len = spec.len; o.wid = spec.wid; o.mass = spec.mass;
    o.vx = 0; o.vz = 0; o.yawSpin = 0;
  }
  return o;
}

// Damp a shoved body's velocity and roll its spin into its heading. Used for
// parked cars and for traffic cars while they are stunned.
export function driftBody(b, dt, drag = 3.2, spinDrag = 3.0) {
  if (b.vx || b.vz) {
    const k = Math.exp(-drag * dt);
    b.x += b.vx * dt; b.z += b.vz * dt;
    b.vx *= k; b.vz *= k;
    if (Math.abs(b.vx) < 0.02) b.vx = 0;
    if (Math.abs(b.vz) < 0.02) b.vz = 0;
  }
  if (b.yawSpin) {
    b.yaw += b.yawSpin * dt;
    b.yawSpin *= Math.exp(-spinDrag * dt);
    if (Math.abs(b.yawSpin) < 0.015) b.yawSpin = 0;
  }
}
