// The ground quads (section 0) and the landuse areas (section 3).
import { mulberry32 } from '../../core/math.js';
import { CHUNK, C, Y } from './consts.js';
import { shade, rgb } from '../../core/mesh.js';
import { MAP } from '../mapdata.js';

// [w7-places] D-12 section 3. Tom, 14 Oct 2026: Grande-Riviere had the running
// track and the football field in 2004, draw both. White lines only; the grass
// stays grass, since the 2004 surface is unknown.
export const LINED_SCHOOLS = ['École secondaire Grande-Rivière'];
export const LINE = { y: 0.05, col: 0xe8e6dc, wEdge: 0.20, wYard: 0.15, lane: 1.22, lanes: 6 };
const DRAPE_PIECE = 8;

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; }
  return Math.abs(a) / 2;
}
function hull(pts) {
  const P = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function insidePoly(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// Minimum-area box over the hull edges: centre, long side L, short W, the long
// axis (ux, uz), and how much of the box the ring fills.
export function minRect(ring) {
  const h = hull(ring);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue;
    const ex = (b[0] - a[0]) / l, ez = (b[1] - a[1]) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of h) {
      const u = q[0] * ex + q[1] * ez, v = -q[0] * ez + q[1] * ex;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ex, ez, u0, u1, v0, v1 };
  }
  const um = (best.u0 + best.u1) / 2, vm = (best.v0 + best.v1) / 2;
  const cx = um * best.ex - vm * best.ez, cz = um * best.ez + vm * best.ex;
  let L = best.u1 - best.u0, W = best.v1 - best.v0, ux = best.ex, uz = best.ez;
  if (W > L) { [L, W] = [W, L]; [ux, uz] = [-best.ez, best.ex]; }
  return { cx, cz, L, W, ux, uz, fill: polyArea(ring) / (L * W) };
}

let FIELD_CACHE = null;
// Every line on the lined schools' fields, as [x0, z0, x1, z1, width] segments.
// Pure, from the global MAP.areas (a school and its pitch on two slices still pair).
export function fieldLines() {
  if (FIELD_CACHE) return FIELD_CACHE;
  const out = [];
  for (const school of MAP.areas) {
    if (school.k !== 'school' || !LINED_SCHOOLS.includes(school.name)) continue;
    const pitches = MAP.areas.filter((a) => a.k === 'pitch' && (() => {
      let x = 0, z = 0; for (const q of a.p) { x += q[0]; z += q[1]; }
      return insidePoly(school.p, x / a.p.length, z / a.p.length);
    })()).map((a) => ({ a, r: minRect(a.p) }));
    const track = pitches.find(({ r }) => r.fill >= 0.84 && r.fill <= 0.92 && r.L / r.W >= 1.7 && r.L / r.W <= 2.3);
    let inner = Infinity, axis = null;
    const at = (r, u, v) => [r.cx + r.ux * u - r.uz * v, r.cz + r.uz * u + r.ux * v];
    if (track) {
      const r = track.r, half = (r.L - r.W) / 2, R = r.W / 2;
      const segs = [];
      const radii = [R - 0.3, R - 0.3 - LINE.lanes * LINE.lane];
      for (const rr of radii) {
        for (const sv of [-1, 1]) segs.push([...at(r, -half, sv * rr), ...at(r, half, sv * rr), LINE.wEdge]);
        for (const su of [-1, 1]) {
          for (let k = 0; k < 24; k++) {
            const a0 = -Math.PI / 2 + Math.PI * k / 24, a1 = -Math.PI / 2 + Math.PI * (k + 1) / 24;
            const p0 = at(r, su * (half + rr * Math.cos(a0)), rr * Math.sin(a0) * su);
            const p1 = at(r, su * (half + rr * Math.cos(a1)), rr * Math.sin(a1) * su);
            segs.push([...p0, ...p1, LINE.wEdge]);
          }
        }
      }
      inner = radii[1]; axis = r;
      out.push({ kind: 'track', segs });
    }
    const grid = pitches.filter(({ a, r }) => a !== (track && track.a) && r.fill >= 0.97 && r.L * r.W >= 2000)
      .sort((p, q) => q.r.L * q.r.W - p.r.L * p.r.W)[0];
    if (grid) {
      const r = grid.r, hl = r.L / 2, hw = r.W / 2, raw = [];
      raw.push([-hl, -hw, hl, -hw, LINE.wEdge], [-hl, hw, hl, hw, LINE.wEdge]);
      raw.push([-hl, -hw, -hl, hw, LINE.wEdge], [hl, -hw, hl, hw, LINE.wEdge]);
      raw.push([0, -hw, 0, hw, LINE.wEdge]);
      const g = r.L * 0.105;
      for (const s of [-1, 1]) raw.push([s * (hl - g), -hw, s * (hl - g), hw, LINE.wYard]);
      const g0 = -hl + g, g1 = hl - g;
      for (let u = g0 + 9.14; u < g1 - 1; u += 9.14) if (Math.abs(u) > 1) raw.push([u, -hw, u, hw, LINE.wYard]);
      // Clip to the track infield (the gridiron's ends otherwise cross the lanes).
      const lim = inner - 0.5;
      const sd = (x, z) => {
        if (!axis) return 0;
        const dx = x - axis.cx, dz = z - axis.cz;
        const u = dx * axis.ux + dz * axis.uz, v = -dx * axis.uz + dz * axis.ux;
        return Math.hypot(Math.max(0, Math.abs(u) - (axis.L - axis.W) / 2), v);
      };
      const segs = [];
      for (const [ua, va, ub, vb, w] of raw) {
        const A = at(r, ua, va), B = at(r, ub, vb);
        const n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 0.1));
        let t0 = -1, t1 = -1;
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t;
          if (sd(x, z) <= lim) { if (t0 < 0) t0 = t; t1 = t; }
        }
        if (t0 < 0 || t1 - t0 < 1e-6) continue;
        segs.push([A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0,
          A[0] + (B[0] - A[0]) * t1, A[1] + (B[1] - A[1]) * t1, w]);
      }
      out.push({ kind: 'gridiron', segs });
    }
  }
  FIELD_CACHE = out;
  return out;
}

// Each segment cut into pieces of at most 8 m, each a 4-corner strip. A piece is
// emitted only on the slice that owns its midpoint, so seams never draw twice.
export function fieldPieces(inside) {
  const out = [];
  for (const f of fieldLines()) {
    for (const [x0, z0, x1, z1, w] of f.segs) {
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-6) continue;
      const n = Math.ceil(L / DRAPE_PIECE), tx = (x1 - x0) / L, tz = (z1 - z0) / L;
      const nx = -tz * w / 2, nz = tx * w / 2;
      for (let i = 0; i < n; i++) {
        const ax = x0 + (x1 - x0) * i / n, az = z0 + (z1 - z0) * i / n;
        const bx = x0 + (x1 - x0) * (i + 1) / n, bz = z0 + (z1 - z0) * (i + 1) / n;
        if (inside && !inside((ax + bx) / 2, (az + bz) / 2)) continue;
        out.push([[ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz], [ax + nx, az + nz]]);
      }
    }
  }
  return out;
}

export function buildGround(ctx) {
  const { NZ, NX, B, inside, bAt, cover, surface } = ctx;
  const cnt = ctx.count;
  // Grass and every pavement layer use identical terrain triangles.
  const gr=mulberry32(0x51ee7);
  for(let cz=0;cz<NZ;cz++) for(let cx=0;cx<NX;cx++) {
    const x0=B.minX+cx*CHUNK,x1=Math.min(x0+CHUNK,B.maxX);
    const z0=B.minZ+cz*CHUNK,z1=Math.min(z0+CHUNK,B.maxZ);
    if(x1<=x0||z1<=z0)continue;
    if(inside && !inside((x0+x1)/2,(z0+z1)/2))continue;
    const bd=bAt((x0+x1)/2,(z0+z1)/2),col=shade(C.grassLo,1+gr()*0.16);
    cover([[x0,z0],[x0,z1],[x1,z1],[x1,z0]],Y.grass,col,()=>bd,new Map());
    cnt.groundQuads++;
  }
  const groundMeshStats={...surface.stats};

  Object.assign(ctx, { groundMeshStats });
}

export function buildAreas(ctx) {
  const { areas, triScatter, wAt, drapeTri, bAt } = ctx;
  // ------------------------------------------------------------ 3. areas
  // colour, decal height, and how finely the polygon is cut when it is draped.
  //
  // The third number is a budget, not a preference. mapdata's ear-clipper hands
  // over a wood as a few hundred triangles up to 200 m across, and splitting
  // those to the 8 m raster cell turns 43k landuse triangles into 3.0 M - nine
  // million vertices for ground tint. So the two things you stand or drive on
  // (the beach, the car parks) are cut fine, and the big green washes under the
  // trees are cut at four cells, where a 32 m span is about 15 cm off the true
  // surface on Aylmer's steepest slope and invisible on the rest.
  const AREA = {
    park: [C.park, Y.park, 32], school: [C.school, Y.park, 32], cemetery: [C.cemetery, Y.park, 32],
    sand: [C.sand, Y.sand, 8], wood: [C.wood, Y.wood, 32], parking: [C.parking, Y.parking, 8],
    pitch: [C.pitch, Y.pitch, 8], pool: [C.pool, Y.pool, 8], water: [C.water, Y.water, 0],
  };
  // Landuse is draped; water is not. The datum in ground_data.js was chosen so
  // the river bed sits UNDER the water quad and the banks about a metre over
  // it, which only works if the river surface stays the flat sheet it is.
  for (const a of areas) {
    const spec = AREA[a.k];
    if (!spec) continue;
    if (a.k === 'water') { triScatter(a.p, a.t, spec[1], rgb(spec[0]), wAt); continue; }
    const col = rgb(spec[0]);
    for (let i = 0; i < a.t.length; i += 3) {
      const p0 = a.p[a.t[i]], p1 = a.p[a.t[i + 1]], p2 = a.p[a.t[i + 2]];
      drapeTri(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], spec[1], col, bAt, spec[2]);
    }
  }
  // [w7-places] Grande-Riviere's track and gridiron lines, after the area loop.
  if (ctx.drapeQuad) {
    const lc = rgb(LINE.col);
    for (const q of fieldPieces(ctx.inside)) ctx.drapeQuad(q, LINE.y, lc);
  }
}
