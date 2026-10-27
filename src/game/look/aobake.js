// Baked ambient occlusion: task V2-07 (vertex AO part), look flag `ao`.
// S5-LIGHT (20 Oct): the prelit vertex gradient, the MM3 and GTA way. Every
// wall, post, trunk and hedge is darker at its foot and full at one storey, so
// a house sits in its lawn instead of hovering on it. No new vertex, no new
// attribute, no draw and no per-frame code: the bake multiplies the vertex
// colours once, in world/ postBuild (contact.js queues it), before upload.
//
// Three passes per builder (land `builders`, `houseNearB`, `houseFarB`; never
// water, night pools or the distant mesh):
//   1. base walls: vertical triangles at least MIN_EXTENT tall whose lowest
//      vertex is within BASE_H of the ground get aoFactor(height above ground);
//      a wall quad has vertices only at its base and its top, so this is one
//      linear gradient per wall;
//   2. proud and free vertical parts: a vertical triangle lying up to DECAL_D in
//      front of a base wall (a window, a door, trim) takes that wall's
//      interpolated value at each vertex height, so it never sits in a pale box;
//      any other vertical triangle at least MIN_EXTENT tall (a post, a trunk, a
//      hedge, a mast) gets aoFactor at its own height;
//   3. soffits: down-facing faces (eaves, porch ceilings, canopies) x SOFFIT.
// Dark vertices (glass, black trim) are left alone. The flag does not reach the
// sector Worker (it reads its own URL), so ?look=-ao changes nothing in a
// sector bake; ctx.opts.ao = false turns it off for a smoke.
import { isOn } from './flags.js';
import { advLight } from './advlight.js';

export const AO = {
  WALL0: 0.74,      // factor at the wall base (h = 0)
  RAMP: 2.6,        // metres to full (one storey): smoothstep(0, RAMP, h)
  MIN_EXTENT: 0.9,  // a vertical triangle shorter than this is a kerb or step: untouched
  VERT_NY: 0.35,    // |ny| below this is a vertical face
  BASE_H: 1.0,      // a wall triangle whose lowest vertex is this close to the ground is a base wall
  DECAL_D: 0.25,    // metres off a base wall's plane: a proud quad takes the wall's value
  SOFFIT: 0.62,     // faces with ny < DOWN_NY
  DOWN_NY: -0.5,
  DARK_SKIP: 0.20,  // max(r,g,b) below this is left alone
  PROTO_V: 500,     // uv.y above this is a prototype-grounded wall: skip the base term
  CELL: 2,          // metres, the wall grid
};
const STRIDE = 9;

// W8-LIGHT: part of Advanced lighting (off: today's vertex colours); ctx.opts.ao still forces it for a smoke.
export function aoOn(ctx) { return ctx.opts?.ao ?? (advLight() && isOn('ao')); }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function aoFactor(h, t = AO) { return t.WALL0 + (1 - t.WALL0) * smooth(0, t.RAMP, Math.max(0, h)); }

// -> { verts, wallVerts, proudVerts, freeVerts, soffitVerts, ms }
export function bakeAO(ctx, t = AO) {
  if (ctx.aoBaked) return ctx.aoBaked;
  const t0 = Date.now();
  const st = { verts: 0, wallVerts: 0, proudVerts: 0, freeVerts: 0, soffitVerts: 0, ms: 0 };
  const lists = [ctx.builders, ctx.houseNearB, ctx.houseFarB];
  const base = (x, z) => (ctx.baseAt ? ctx.baseAt(x, z).h : 0);
  for (const map of lists) {
    if (!map) continue;
    for (const b of map.values()) bakeBuilder(b, base, t, st);
  }
  st.ms = Date.now() - t0;
  ctx.aoBaked = st;
  if (ctx.count) ctx.count.aoVerts = (ctx.count.aoVerts || 0) + st.verts;
  return st;
}

// Per vertical triangle, in flat typed arrays (the bake visits millions).
const F = 12;   // f, y0, y1, nx, nz, d, s0, s1, cx, cz, g, flags
function bakeBuilder(b, base, t, st) {
  const v = b.v, I = b.i, nV = v.length / STRIDE;
  if (!I.length) return;
  const done = new Uint8Array(nV);
  const hasUV = b.uv && b.uv.length >= nV * 2;
  // 1. vertical triangles
  let nT = 0;
  for (let f = 0; f < I.length; f += 3) {
    if (Math.abs(v[I[f] * STRIDE + 4]) < t.VERT_NY && Math.abs(v[I[f + 1] * STRIDE + 4]) < t.VERT_NY
      && Math.abs(v[I[f + 2] * STRIDE + 4]) < t.VERT_NY) nT++;
  }
  const T = new Float64Array(nT * F);
  const K = new Float32Array(nT * 2);   // k0, k1 of a base wall
  let n = 0;
  for (let f = 0; f < I.length; f += 3) {
    const a = I[f] * STRIDE, c = I[f + 1] * STRIDE, e = I[f + 2] * STRIDE;
    if (!(Math.abs(v[a + 4]) < t.VERT_NY && Math.abs(v[c + 4]) < t.VERT_NY && Math.abs(v[e + 4]) < t.VERT_NY)) continue;
    let nx = v[a + 3] + v[c + 3] + v[e + 3], nz = v[a + 5] + v[c + 5] + v[e + 5];
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const tx = -nz, tz = nx;
    const sa = v[a] * tx + v[a + 2] * tz, sc = v[c] * tx + v[c + 2] * tz, se = v[e] * tx + v[e + 2] * tz;
    const ya = v[a + 1], yc = v[c + 1], ye = v[e + 1];
    const lo = ya <= yc && ya <= ye ? a : (yc <= ye ? c : e);
    const o = n * F;
    T[o] = f; T[o + 1] = Math.min(ya, yc, ye); T[o + 2] = Math.max(ya, yc, ye);
    T[o + 3] = nx; T[o + 4] = nz;
    T[o + 5] = ((v[a] + v[c] + v[e]) * nx + (v[a + 2] + v[c + 2] + v[e + 2]) * nz) / 3;
    T[o + 6] = Math.min(sa, sc, se); T[o + 7] = Math.max(sa, sc, se);
    T[o + 8] = (v[a] + v[c] + v[e]) / 3; T[o + 9] = (v[a + 2] + v[c + 2] + v[e + 2]) / 3;
    T[o + 10] = base(v[lo], v[lo + 2]);
    // flags: 1 candidate base wall, 2 proud
    T[o + 11] = (T[o + 2] - T[o + 1] >= t.MIN_EXTENT && T[o + 1] - T[o + 10] <= t.BASE_H) ? 1 : 0;
    n++;
  }
  // 2. grid of candidate walls, by every 2 m cell their xz extent touches
  const cell = t.CELL, grid = new Map();
  const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
  for (let w = 0; w < nT; w++) {
    const o = w * F; if (T[o + 11] !== 1) continue;
    const f = T[o];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let j = 0; j < 3; j++) { const q = I[f + j] * STRIDE; x0 = Math.min(x0, v[q]); x1 = Math.max(x1, v[q]); z0 = Math.min(z0, v[q + 2]); z1 = Math.max(z1, v[q + 2]); }
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++)
      for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) {
        const k = key(cx, cz), bk = grid.get(k); if (bk) bk.push(w); else grid.set(k, [w]);
      }
  }
  // The base wall a triangle lies just in front of (same facing, inside its span and height), or -1.
  const behind = (self) => {
    const o = self * F;
    const list = grid.get(key(Math.floor(T[o + 8] / cell), Math.floor(T[o + 9] / cell)));
    if (!list) return -1;
    let best = -1, bd = Infinity;
    for (let j = 0; j < list.length; j++) {
      const w = list[j]; if (w === self) continue;
      const q = w * F; if (T[q + 11] !== 1) continue;      // a base wall that is not proud itself
      if (T[q + 3] * T[o + 3] + T[q + 4] * T[o + 4] < 0.9) continue;
      const gap = T[o + 5] - T[q + 5];
      if (gap < 0.005 || gap > t.DECAL_D) continue;
      if (T[o + 6] < T[q + 6] - 0.02 || T[o + 7] > T[q + 7] + 0.02 || T[o + 1] < T[q + 1] - 0.02 || T[o + 2] > T[q + 2] + 0.02) continue;
      if (gap < bd) { bd = gap; best = w; }
    }
    return best;
  };
  // Proud candidates (a door in front of its wall) leave the base set.
  const proud = new Uint8Array(nT);
  for (let w = 0; w < nT; w++) if (T[w * F + 11] === 1 && behind(w) >= 0) proud[w] = 1;
  for (let w = 0; w < nT; w++) if (proud[w]) T[w * F + 11] = 2;
  const ok = (i) => {
    if (done[i]) return false;
    const q = i * STRIDE;
    if (Math.max(v[q + 6], v[q + 7], v[q + 8]) < t.DARK_SKIP) return false;
    if (v[q + 6] > 1.5) return false;   // a night-glow tag (shaders/glass.js), not an albedo
    if (hasUV && b.uv[i * 2 + 1] > t.PROTO_V) { done[i] = 1; return false; }
    return true;
  };
  const mul = (i, k) => { const q = i * STRIDE + 6; v[q] *= k; v[q + 1] *= k; v[q + 2] *= k; done[i] = 1; st.verts++; };
  // Pass 1: base walls.
  for (let w = 0; w < nT; w++) {
    const o = w * F; if (T[o + 11] !== 1) continue;
    const g = T[o + 10];
    K[w * 2] = aoFactor(T[o + 1] - g, t); K[w * 2 + 1] = aoFactor(T[o + 2] - g, t);
    for (let j = 0; j < 3; j++) { const i = I[T[o] + j]; if (ok(i)) { mul(i, aoFactor(v[i * STRIDE + 1] - g, t)); st.wallVerts++; } }
  }
  // Pass 2: proud parts take the wall's value; free vertical parts their own.
  for (let w = 0; w < nT; w++) {
    const o = w * F; if (T[o + 11] === 1) continue;
    const f = T[o];
    if (done[I[f]] && done[I[f + 1]] && done[I[f + 2]]) continue;
    const wb = behind(w);
    if (wb >= 0) {
      const q = wb * F, y0 = T[q + 1], y1 = T[q + 2], k0 = K[wb * 2], k1 = K[wb * 2 + 1];
      for (let j = 0; j < 3; j++) {
        const i = I[f + j]; if (!ok(i)) continue;
        const u = y1 > y0 ? Math.min(1, Math.max(0, (v[i * STRIDE + 1] - y0) / (y1 - y0))) : 1;
        mul(i, k0 + (k1 - k0) * u); st.proudVerts++;
      }
      continue;
    }
    if (T[o + 2] - T[o + 1] < t.MIN_EXTENT) continue;
    const g = T[o + 10];
    for (let j = 0; j < 3; j++) { const i = I[f + j]; if (ok(i)) { mul(i, aoFactor(v[i * STRIDE + 1] - g, t)); st.freeVerts++; } }
  }
  // Pass 3: soffits.
  for (let f = 0; f < I.length; f += 3) {
    if (!(v[I[f] * STRIDE + 4] < t.DOWN_NY && v[I[f + 1] * STRIDE + 4] < t.DOWN_NY && v[I[f + 2] * STRIDE + 4] < t.DOWN_NY)) continue;
    for (let j = 0; j < 3; j++) { const i = I[f + j]; if (ok(i)) { mul(i, t.SOFFIT); st.soffitVerts++; } }
  }
}

export function init(G, r) {}
export function tick(dt) {}
export function draw(r, G) {}
