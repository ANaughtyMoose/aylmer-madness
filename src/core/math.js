// Minimal column-major 4x4 math + helpers. No dependencies.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothDamp = (cur, target, t) => cur + (target - cur) * t;
// Shortest signed angular difference (a - b) wrapped to [-PI, PI].
export function angleDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const m4 = {
  create: () => new Float32Array(16),

  identity(o) {
    o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o;
  },

  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf;
    o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  },

  mul(o, a, b) { // o = a * b
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
      }
    }
    return o;
  },

  // Translation + Ry*Rx*Rz rotation + non-uniform scale.
  compose(o, x, y, z, yaw, pitch, roll, sx = 1, sy = 1, sz = 1) {
    const cy = Math.cos(yaw), sy_ = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    // R = Ry * Rx * Rz, expanded.
    const m00 = cy, m01 = sy_ * sp, m02 = sy_ * cp;
    const m10 = 0, m11 = cp, m12 = -sp;
    const m20 = -sy_, m21 = cy * sp, m22 = cy * cp;
    const r00 = m00 * cr + m01 * sr, r01 = -m00 * sr + m01 * cr, r02 = m02;
    const r10 = m10 * cr + m11 * sr, r11 = -m10 * sr + m11 * cr, r12 = m12;
    const r20 = m20 * cr + m21 * sr, r21 = -m20 * sr + m21 * cr, r22 = m22;
    o[0] = r00 * sx; o[1] = r10 * sx; o[2] = r20 * sx; o[3] = 0;
    o[4] = r01 * sy; o[5] = r11 * sy; o[6] = r21 * sy; o[7] = 0;
    o[8] = r02 * sz; o[9] = r12 * sz; o[10] = r22 * sz; o[11] = 0;
    o[12] = x; o[13] = y; o[14] = z; o[15] = 1;
    return o;
  },

  // Inverse of a rotation+translation matrix (no scale).
  invertRigid(o, m) {
    o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[3] = 0;
    o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[7] = 0;
    o[8] = m[2]; o[9] = m[6]; o[10] = m[10]; o[11] = 0;
    const x = m[12], y = m[13], z = m[14];
    o[12] = -(o[0] * x + o[4] * y + o[8] * z);
    o[13] = -(o[1] * x + o[5] * y + o[9] * z);
    o[14] = -(o[2] * x + o[6] * y + o[10] * z);
    o[15] = 1;
    return o;
  },
};

// Six frustum planes (a,b,c,d) extracted from a view-projection matrix.
export function extractFrustum(planes, m) {
  const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const set = (n, s, a) => {
    for (let i = 0; i < 4; i++) planes[n * 4 + i] = r3[i] + s * a[i];
  };
  set(0, 1, r0); set(1, -1, r0);
  set(2, 1, r1); set(3, -1, r1);
  set(4, 1, r2); set(5, -1, r2);
  return planes;
}

export function aabbInFrustum(planes, min, max) {
  for (let i = 0; i < 6; i++) {
    const a = planes[i * 4], b = planes[i * 4 + 1], c = planes[i * 4 + 2], d = planes[i * 4 + 3];
    const px = a >= 0 ? max[0] : min[0];
    const py = b >= 0 ? max[1] : min[1];
    const pz = c >= 0 ? max[2] : min[2];
    if (a * px + b * py + c * pz + d < 0) return false;
  }
  return true;
}
