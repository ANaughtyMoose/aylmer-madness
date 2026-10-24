// Commercial facade helpers: the prototype facade codes, awnings and rooftop
// units (moved out of world.js unchanged, V0-02).
import { rgb, shade } from '../../core/mesh.js';

// ------------------------------------------------ prototype façades (facade.js)
// Which shader façade a non-house block wears: 1 retail, 2 industrial,
// 3 residential block, 4 institutional. Churches, sheds and landmarks keep theirs.
export const FACADE_KIND = { commercial: 1, mall: 1, industrial: 2, apartments: 3, big: 3, public: 4, school: 4 };
export const AWNING = [0x2f5a3a, 0x7a2a2a, 0x2b3f6b, 0xb9a57c, 0x3a3a3a, 0x8a5a2a];
export const ROOF_UNIT = rgb(0x8d9094), ROOF_UNIT_TOP = rgb(0x6f7275);

// One wall quad whose atlasRect carries (metres along, metres up, code, length),
// interpolated per vertex, so the fragment knows where it is on the façade.
export function facadeQuad(bd, a, q, by, h, col, code, L) {
  const nx = -(q[1] - a[1]) / L, nz = (q[0] - a[0]) / L;
  const z = -code, r = [0, 0, z, L];
  const put = (x, y, zz, s, up) => { r[0] = s; r[1] = up; bd.curRect = r; return bd.vert(x, y, zz, nx, 0, nz, col); };
  const b0 = put(a[0], by, a[1], 0, 0);
  put(q[0], by, q[1], L, 0);
  put(q[0], by + h, q[1], L, h);
  put(a[0], by + h, a[1], 0, h);
  bd.curRect = null;
  bd.tri(b0, b0 + 1, b0 + 2); bd.tri(b0, b0 + 2, b0 + 3);
}

// Real geometry the shader cannot fake: fabric awnings over storefronts and
// rooftop units. A few triangles per building, only in the prototype.
export function facadeExtras(bd, b, p, n, fwd, by, h, sx, sz, rnd) {
  const retail = b.k === 'commercial' || b.k === 'mall';
  if (retail && h >= 3.6) {
    let made = 0;
    for (let i = 0; i < n && made < 2; i++) {
      const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
      const a = p[ia], q = p[ib];
      const L = Math.hypot(q[0] - a[0], q[1] - a[1]);
      if (L < 5) continue;
      const tx = (q[0] - a[0]) / L, tz = (q[1] - a[1]) / L, nx = -tz, nz = tx;
      if (nx * sx + nz * sz < 0.55) continue;
      if (rnd() < 0.35) continue;
      const hex = AWNING[(rnd() * AWNING.length) | 0], col = rgb(hex);
      const inset = 0.6, depth = 1.15, y1 = by + 2.9, y0 = by + 2.4;
      const P = (t, out, y) => [a[0] + tx * t + nx * out, y, a[1] + tz * t + nz * out];
      bd.quad(P(inset, depth, y0), P(L - inset, depth, y0), P(L - inset, 0.02, y1), P(inset, 0.02, y1), col);
      // the underside, seen from the sidewalk and the driver's seat
      bd.quad(P(inset, 0.02, y1), P(L - inset, 0.02, y1), P(L - inset, depth, y0), P(inset, depth, y0), shade(hex, 0.55));
      bd.quad(P(inset, depth, y0 - 0.26), P(L - inset, depth, y0 - 0.26), P(L - inset, depth, y0), P(inset, depth, y0), shade(hex, 0.82));
      made++;
    }
  }
  // Rooftop units on the flat roofs of bigger blocks.
  let area = 0;
  for (let i = 0; i < n; i++) { const a = p[i], q = p[(i + 1) % n]; area += a[0] * q[1] - q[0] * a[1]; }
  area = Math.abs(area) / 2;
  if (area < 140 || b.k === 'big') return;
  const units = area > 900 ? 3 : area > 350 ? 2 : 1;
  const ca = Math.cos(b.a), sa = Math.sin(b.a);
  for (let k = 0; k < units; k++) {
    const u = (rnd() - 0.5) * Math.sqrt(area) * 0.35, v = (rnd() - 0.5) * Math.sqrt(area) * 0.25;
    const x = b.c[0] + u * ca - v * sa, z = b.c[1] + u * sa + v * ca;
    const w = 1.6 + rnd() * 1.2, d = 1.1 + rnd() * 0.6, hh = 0.9 + rnd() * 0.6;
    bd.tower(x, by + h, z, w, d, hh, ROOF_UNIT, { yaw: -b.a, noBottom: true, top: ROOF_UNIT_TOP });
  }
}
