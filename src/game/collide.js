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

// Scratch — module-level so the hot loop never allocates.
const A0 = { x: 0, z: 0 }, A1 = { x: 0, z: 0 };
const B0 = { x: 0, z: 0 }, B1 = { x: 0, z: 0 };
const AS = [A0, A1], BS = [B0, B1];

// The last contact found, filled by findContact() and consumed by resolveContact().
export const contact = {
  nx: 0, nz: 0,     // unit normal, pointing from B toward A
  pen: 0,           // penetration depth, metres
  px: 0, pz: 0,     // contact point in world space
  closing: 0,       // approach speed along the normal, m/s (0 if separating)
  impulse: 0,       // normal impulse magnitude, N·s
};

// Fills c0/c1 with the two circle centres and returns their radius.
function circles(b, c0, c1) {
  const r = b.wid * 0.5;
  const off = Math.max(0.05, b.len * 0.5 - r);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  c0.x = b.x + fx * off; c0.z = b.z + fz * off;
  c1.x = b.x - fx * off; c1.z = b.z - fz * off;
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
  const ra = circles(A, A0, A1), rb = circles(B, B0, B1);
  const sum = ra + rb, sum2 = sum * sum;
  let best = 0;
  for (let i = 0; i < 2; i++) {
    const a = AS[i];
    for (let j = 0; j < 2; j++) {
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
