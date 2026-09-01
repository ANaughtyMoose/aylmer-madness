// Hero landmarks — the handful of places that get real architecture.
//
// Every other building in town is flat massing, a parapet and a grid of dark
// window quads (world.js §5). That is the right trade for 57 680 footprints; it
// is the wrong trade for the schools the owner and his friends went to, and for
// the two or three corners of Aylmer a person actually recognises. This module
// rebuilds six sites properly: punched openings with real reveals and muntins,
// cornices and string courses, quoins, entrance porticos and canopies, correct
// roof forms, steps, railings, flagpoles, bike racks, dumpsters, marquee signs.
//
// THE BUDGET is the whole point. The world already bakes 3.62 M triangles in
// ~4.3 s in the browser; a hero building that costs 40 k triangles is a bug, not
// a feature. Each site carries a hard triangle budget (BUDGET below, asserted by
// tools/smoke_landmarks.mjs) and is baked TWICE, exactly the way houses.js does:
//
//   near   full detail — reveals, muntins, columns, railings, bike racks
//   far    the same massing, roof form, cornice band, sign and window PATTERN,
//          with each opening collapsed to a flat two-triangle pane
//
// draw() swaps at HERO_NEAR metres, camera to centre. The far bake keeps the
// silhouette, the colours and the window rhythm, so the swap is invisible; what
// it drops is geometry that is already sub-pixel at 340 m.
//
// A third `site` mesh (paving, stalls, kerbs, walks) draws at any distance — it
// is flat, it is cheap, and seeing the lot from the road is how you know where
// to turn in.
//
// OWNERSHIP NOTE. world.js, places.js and cars.js belong to other agents this
// wave, so nothing here edits them:
//   * hero footprints already in OSM are collapsed in MAP at import time
//     (`hideFootprint`) rather than skipped by a flag world.js does not have,
//   * new destinations are written into PLACES at import time,
//   * colliders and the draw call are wrapped onto the object buildWorld
//     returns (`installLandmarks`).
// See the fold-back list at the bottom of the file.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { MAP } from './mapdata.js';
import { PLACES } from './places.js';
import { TILES } from './materials_stub.js';

// How far the detailed bake reaches, camera to building centre. Bigger than
// HOUSE_NEAR (200 m) because a school is 90 m long: at 200 m it still fills a
// third of the screen and you would watch the muntins evaporate.
export const HERO_NEAR = 340;

// Triangles a site may spend. Near is what you see from the car; far is what the
// rest of town sees. Both are asserted in tools/smoke_landmarks.mjs — if a
// change blows one, cut detail, do not raise the number.
export const BUDGET = {
  pwhs:       { near: 22000, far: 4000, site: 2600 },
  heritage:   { near: 20000, far: 4000, site: 1600 },
  symmesjr:   { near: 7000,  far: 1200, site: 900 },
  symmesinn:  { near: 9000,  far: 1000, site: 700 },
  british:    { near: 12000, far: 1400, site: 800 },
  marina:     { near: 8000,  far: 1000, site: 800 },
  mike:       { near: 7000,  far: 1000, site: 600 },
  lordaylmer: { near: 8000,  far: 1200, site: 800 },
};

// ---------------------------------------------------------------- ring maths

function shoelace(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

// Rectangle footprint, local +X along `yaw` (map angle: +X east, +Z south).
// Wound so the shoelace comes out negative, which is the winding world.js calls
// "outward on the left" and the wall code below assumes.
export function rectRing(cx, cz, w, d, yaw) {
  const co = Math.cos(yaw), si = Math.sin(yaw);
  const hw = w / 2, hd = d / 2;
  const P = (u, v) => [cx + u * co - v * si, cz + u * si + v * co];
  const r = [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)];
  return shoelace(r) < 0 ? r : r.reverse();
}

// Fan triangulation for a convex ring — all the rings built here are rectangles;
// the OSM footprints arrive with mapdata's own `t` array.
function fanTris(n) {
  const t = [];
  for (let i = 1; i < n - 1; i++) t.push(0, i, i + 1);
  return t;
}

// Outward unit normal of edge i -> i+1, whichever way the ring winds. world.js
// builds a wall as [a, b, b', a'] and gets an outward normal when the shoelace
// is negative, which makes (-ez, ex) outward along i -> i+1.
function edgeNormals(ring) {
  const n = ring.length, sg = shoelace(ring) < 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const L = Math.hypot(ex, ez) || 1;
    out.push([(-ez / L) * sg, (ex / L) * sg]);
  }
  return out;
}

// Mitred offset of a closed ring, `d` metres outward (negative pulls in). The
// miter is clamped so a re-entrant corner on Heritage's 74-gon cannot shoot a
// vertex twenty metres into the car park.
export function offsetRing(ring, d) {
  const n = ring.length, N = edgeNormals(ring), out = [];
  for (let i = 0; i < n; i++) {
    const p = N[(i - 1 + n) % n], q = N[i];
    let mx = p[0] + q[0], mz = p[1] + q[1];
    const l = Math.hypot(mx, mz);
    if (l < 1e-4) { out.push([ring[i][0] + q[0] * d, ring[i][1] + q[1] * d]); continue; }
    mx /= l; mz /= l;
    const k = d / Math.max(0.4, mx * q[0] + mz * q[1]);
    out.push([ring[i][0] + mx * k, ring[i][1] + mz * k]);
  }
  return out;
}

// Down-facing cap. capPoly always faces the sky and back faces are culled, so a
// cornice built as an offset tube would be see-through from the footpath.
function capDown(mb, ring, tris, y, col) {
  for (let i = 0; i < tris.length; i += 3) {
    const a = ring[tris[i]], b = ring[tris[i + 1]], d = ring[tris[i + 2]];
    if (!a || !b || !d) continue;
    const cross = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const v0 = mb.vert(a[0], y, a[1], 0, -1, 0, col);
    if (cross > 0) {
      mb.vert(b[0], y, b[1], 0, -1, 0, col);
      mb.vert(d[0], y, d[1], 0, -1, 0, col);
    } else {
      mb.vert(d[0], y, d[1], 0, -1, 0, col);
      mb.vert(b[0], y, b[1], 0, -1, 0, col);
    }
    mb.tri(v0, v0 + 1, v0 + 2);
  }
}

// Tapered tube — a lighthouse batter, a chimney, a column with entasis. `bands`
// is [{ y, r, c }] bottom to top; consecutive entries make one ring of quads, so
// the colour can change at a course without a crack opening in the silhouette.
function taper(mb, cx, cz, bands, segs) {
  for (let b = 0; b + 1 < bands.length; b++) {
    const lo = bands[b], hi = bands[b + 1];
    const slope = (lo.r - hi.r) / ((hi.y - lo.y) || 1);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const v = mb.vert(cx + c0 * lo.r, lo.y, cz + s0 * lo.r, c0, slope, s0, lo.c);
      mb.vert(cx + c1 * lo.r, lo.y, cz + s1 * lo.r, c1, slope, s1, lo.c);
      mb.vert(cx + c1 * hi.r, hi.y, cz + s1 * hi.r, c1, slope, s1, hi.c);
      mb.vert(cx + c0 * hi.r, hi.y, cz + s0 * hi.r, c0, slope, s0, hi.c);
      mb.tri(v, v + 1, v + 2); mb.tri(v, v + 2, v + 3);
    }
  }
}

// ---------------------------------------------------------------- the kit
//
// One context object threaded through every builder: the mesh, the material
// provider (the real atlas, or the vertex-colour stand-in the far bake uses),
// whether this is the detailed bake, and the projection origin for world-space
// tiling. `ox/oz` is always the building centre — materials.js wants the repeat
// counts small so fract() in the shader stays exact.

function kit(mb, mats, detail, ox, oz) {
  return { mb, mats, detail, ox, oz, seg: null };
}
function on(K, name, opts) {
  K.mats.tile(K.mb, name, { ox: K.ox, oz: K.oz, oy: 0, ...(opts || {}) });
}
function off(K) { K.mats.end(K.mb); }
function tint(K, name, k = 1) { return K.mats.tint(name, k); }
function flat(hex, k = 1) { return shade(hex, k); }
// The material's average colour, atlas or not — what the far bake wears.
function matCol(name, k = 1) { return shade(TILES[name] === undefined ? 0xbfb8aa : TILES[name], k); }

const TRIM = 0xf1ede3;         // painted wood / aluminium trim
const CONCRETE = 0xb8b3a8;     // cast sills, spandrels, steps, coping
const GLASS_LO = 0x27313d;     // glass at the sill
const GLASS_HI = 0x4d6577;     // ... and at the head, where it catches the sky
const ASPHALT = 0x2f2f33;
const STRIPE = 0xd8d3c2;

// ------------------------------------------------------- walls with real holes
//
// The thing that separates a hero building from the town treatment. Given one
// wall edge and a list of window rows, this lays the masonry out in bands that
// go AROUND the openings, then lines each opening with a four-sided reveal,
// drops the glass in at the back of it and puts the muntins in front. A punched
// opening reads correctly from every angle; a dark quad stuck flat on a wall
// reads correctly from exactly one.
//
// The far bake keeps the same openings and draws each as a single flat pane, so
// the window rhythm survives the LOD swap and only the depth goes away.
//
// `rows`: [{ y0, y1, w, gap, margin, max, mullions, transom, sill, head }]
function wallRow(K, ax, az, bx, bz, nx, nz, y0, y1, rows, spec) {
  const mb = K.mb;
  let ex = bx - ax, ez = bz - az;
  const L = Math.hypot(ex, ez);
  if (L < 0.4) return;
  ex /= L; ez /= L;
  const P = (u, y, o = 0) => [ax + ex * u + nx * o, y, az + ez * u + nz * o];

  // ---- lay the openings out in (u, y)
  const open = [];
  for (const r of rows) {
    if (r.y1 > y1 - 0.25 || r.y0 < y0 + 0.05) continue;
    const margin = r.margin === undefined ? 1.2 : r.margin;
    const usable = L - margin * 2;
    const pitch = r.w + r.gap;
    const count = Math.min(r.max || 99, Math.floor((usable + r.gap) / pitch));
    if (count < 1) continue;
    const span = count * pitch - r.gap;
    const u0 = margin + (usable - span) / 2;
    for (let i = 0; i < count; i++) {
      const c = u0 + i * pitch + r.w / 2;
      open.push({ u0: c - r.w / 2, u1: c + r.w / 2, y0: r.y0, y1: r.y1, r });
    }
  }

  const lo = rgb(spec.glassLo || GLASS_LO), hi = rgb(spec.glassHi || GLASS_HI);

  // ---- far bake: one solid wall, one flat pane per opening. 2 tris an opening
  // instead of 16, and the façade still reads as a façade from 400 m.
  if (!K.detail) {
    mb.quad(P(0, y0), P(L, y0), P(L, y1), P(0, y1), spec.tint, [nx, 0, nz]);
    if (!open.length) return;
    off(K);
    for (const o of open) {
      const b = mb.vert(...P(o.u0, o.y0, 0.03), nx, 0, nz, lo);
      mb.vert(...P(o.u1, o.y0, 0.03), nx, 0, nz, lo);
      mb.vert(...P(o.u1, o.y1, 0.03), nx, 0, nz, hi);
      mb.vert(...P(o.u0, o.y1, 0.03), nx, 0, nz, hi);
      mb.tri(b, b + 1, b + 2); mb.tri(b, b + 2, b + 3);
    }
    if (spec.mat) on(K, spec.mat);
    return;
  }

  // ---- masonry, band by band
  const ys = new Set([y0, y1]);
  for (const o of open) { ys.add(o.y0); ys.add(o.y1); }
  const bands = [...ys].sort((a, b) => a - b);
  for (let k = 0; k + 1 < bands.length; k++) {
    const yb = bands[k], yt = bands[k + 1];
    if (yt - yb < 0.02) continue;
    const ym = (yb + yt) / 2;
    const cuts = open.filter((o) => o.y0 < ym && o.y1 > ym).sort((a, b) => a.u0 - b.u0);
    let u = 0;
    for (const c of cuts) {
      if (c.u0 - u > 0.02) mb.quad(P(u, yb), P(c.u0, yb), P(c.u0, yt), P(u, yt), spec.tint, [nx, 0, nz]);
      u = c.u1;
    }
    if (L - u > 0.02) mb.quad(P(u, yb), P(L, yb), P(L, yt), P(u, yt), spec.tint, [nx, 0, nz]);
  }
  if (!open.length) return;

  // ---- reveals, glass, muntins. Untextured: the atlas has no window jamb.
  off(K);
  const rd = spec.reveal === undefined ? 0.22 : spec.reveal;
  const jambHex = spec.jamb || CONCRETE;
  const jamb = flat(jambHex, 0.9), soffit = flat(jambHex, 0.62);
  const bar = rgb(spec.bar || TRIM);
  for (const o of open) {
    const a0 = P(o.u0, o.y0), a1 = P(o.u1, o.y0), a2 = P(o.u1, o.y1), a3 = P(o.u0, o.y1);
    const b0 = P(o.u0, o.y0, -rd), b1 = P(o.u1, o.y0, -rd);
    const b2 = P(o.u1, o.y1, -rd), b3 = P(o.u0, o.y1, -rd);
    mb.quad(a0, b0, b3, a3, jamb, [ex, 0, ez]);                     // left jamb
    mb.quad(b1, a1, a2, b2, jamb, [-ex, 0, -ez]);                   // right jamb
    mb.quad(b3, b2, a2, a3, soffit, [0, -1, 0]);                    // head soffit
    mb.quad(a0, a1, b1, b0, flat(jambHex, 1.06), [0, 1, 0]);        // sill inside
    const g = mb.vert(b0[0], b0[1], b0[2], nx, 0, nz, lo);
    mb.vert(b1[0], b1[1], b1[2], nx, 0, nz, lo);
    mb.vert(b2[0], b2[1], b2[2], nx, 0, nz, hi);
    mb.vert(b3[0], b3[1], b3[2], nx, 0, nz, hi);
    mb.tri(g, g + 1, g + 2); mb.tri(g, g + 2, g + 3);
    const t = 0.05, dd = rd - 0.05;
    // Frosted / spandrel lower panel — the opaque band across the bottom of a
    // 1968 classroom window that stops a fourteen-year-old watching the parking
    // lot. Two triangles, and it is most of why the banding reads correctly.
    if (o.r.frost) {
      const y = o.y0 + (o.y1 - o.y0) * o.r.frost;
      mb.quad(P(o.u0, o.y0, -dd), P(o.u1, o.y0, -dd), P(o.u1, y, -dd), P(o.u0, y, -dd),
        flat(spec.frostHex || 0xa9b3ad), [nx, 0, nz]);
    }
    for (let m = 1; m <= (o.r.mullions || 0); m++) {
      const u = o.u0 + (o.u1 - o.u0) * (m / (o.r.mullions + 1));
      mb.quad(P(u - t, o.y0, -dd), P(u + t, o.y0, -dd), P(u + t, o.y1, -dd), P(u - t, o.y1, -dd),
        bar, [nx, 0, nz]);
    }
    if (o.r.transom) {
      const y = o.y0 + (o.y1 - o.y0) * o.r.transom;
      mb.quad(P(o.u0, y - t, -dd), P(o.u1, y - t, -dd), P(o.u1, y + t, -dd), P(o.u0, y + t, -dd),
        bar, [nx, 0, nz]);
    }
    if (o.r.sill) {                                   // projecting stone sill
      const s = o.r.sill, y = o.y0, c = flat(jambHex, 1.12);
      mb.quad(P(o.u0 - 0.12, y, -0.01), P(o.u1 + 0.12, y, -0.01),
        P(o.u1 + 0.12, y, s), P(o.u0 - 0.12, y, s), c, [0, 1, 0]);
      mb.quad(P(o.u0 - 0.12, y - 0.15, s), P(o.u1 + 0.12, y - 0.15, s),
        P(o.u1 + 0.12, y, s), P(o.u0 - 0.12, y, s), c, [nx, 0, nz]);
    }
    if (o.r.head) {                                   // lintel / label course
      mb.quad(P(o.u0 - 0.14, o.y1, 0.05), P(o.u1 + 0.14, o.y1, 0.05),
        P(o.u1 + 0.14, o.y1 + o.r.head, 0.05), P(o.u0 - 0.14, o.y1 + o.r.head, 0.05),
        flat(jambHex, 1.16), [nx, 0, nz]);
    }
  }
  if (spec.mat) on(K, spec.mat);
}

// Every wall of a ring. `pick(i, L)` may return a different row set per edge (a
// blank gym flank, a glazed front) or null to leave the edge solid.
function walls(K, ring, y0, y1, spec, pick) {
  const N = edgeNormals(ring), n = ring.length;
  const fwd = shoelace(ring) < 0;
  if (spec.mat) on(K, spec.mat);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Wind each quad the way world.js does so the front face is the outside.
    const a = fwd ? ring[i] : ring[j], b = fwd ? ring[j] : ring[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rows = pick ? pick(i, L) : spec.rows;
    wallRow(K, a[0], a[1], b[0], b[1], N[i][0], N[i][1], y0, y1, rows || [], spec);
    if (K.seg) K.seg(ring[i][0], ring[i][1], ring[j][0], ring[j][1]);
  }
  off(K);
}

// A projecting horizontal band: base course, string course, cornice, parapet
// coping. Two rings and three faces — cheap, and it is what makes masonry read
// as masonry instead of as a painted box.
function band(K, ring, tris, y, h, out, colHex, mat) {
  const r = offsetRing(ring, out);
  if (mat) on(K, mat); else off(K);
  K.mb.prism(r, y, h, mat ? tint(K, mat) : flat(colHex));
  off(K);
  K.mb.capPoly(r, tris, y + h, flat(colHex, 1.04));
  capDown(K.mb, r, tris, y, flat(colHex, 0.55));
  return r;
}

// Corner quoins: alternating dressed blocks up both sides of every corner. 8
// triangles a block, so the far bake skips them outright.
function quoins(K, ring, y0, y1, size, colHex) {
  if (!K.detail) return;
  const n = ring.length, N = edgeNormals(ring), c = flat(colHex);
  off(K);
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const a = N[(i - 1 + n) % n], b = N[i];
    if (a[0] * b[0] + a[1] * b[1] > 0.72) continue;      // not a real corner
    const courses = Math.floor((y1 - y0) / (size * 1.6));
    for (let k = 0; k < courses; k += 2) {
      const y = y0 + k * size * 1.6;
      K.mb.post(p[0] + (a[0] + b[0]) * size * 0.26, y, p[1] + (a[1] + b[1]) * size * 0.26,
        size * 1.5, Math.min(size * 1.6, y1 - y), c);
    }
  }
}

// A structural glass curtain wall: one graded pane and a painted-steel grid in
// front of it. Far cheaper than punched openings — 2 tris plus 2 per bar — and
// it is the single thing that makes a building read as institutional glass
// rather than as a wall with holes in it.
function curtain(K, ax, az, bx, bz, nx, nz, y0, y1, opts = {}) {
  const mb = K.mb;
  let ex = bx - ax, ez = bz - az;
  const L = Math.hypot(ex, ez);
  if (L < 0.5) return;
  ex /= L; ez /= L;
  const P = (u, y, o = 0) => [ax + ex * u + nx * o, y, az + ez * u + nz * o];
  off(K);
  const lo = rgb(opts.lo || GLASS_LO), hi = rgb(opts.hi || GLASS_HI);
  const g = mb.vert(...P(0, y0), nx, 0, nz, lo);
  mb.vert(...P(L, y0), nx, 0, nz, lo);
  mb.vert(...P(L, y1), nx, 0, nz, hi);
  mb.vert(...P(0, y1), nx, 0, nz, hi);
  mb.tri(g, g + 1, g + 2); mb.tri(g, g + 2, g + 3);
  const bar = flat(opts.steel || 0x8e9296);
  const pitch = opts.pitch || 2.2, t = 0.06, d = -0.07;
  const n = Math.max(1, Math.round(L / pitch));
  if (!K.detail) return;                       // the grid is sub-pixel far off
  for (let i = 1; i < n; i++) {
    const u = (i / n) * L;
    mb.quad(P(u - t, y0, d), P(u + t, y0, d), P(u + t, y1, d), P(u - t, y1, d), bar, [nx, 0, nz]);
  }
  const floors = Math.max(1, Math.round((y1 - y0) / (opts.floor || 3.6)));
  for (let f = 0; f <= floors; f++) {
    const y = y0 + ((y1 - y0) * f) / floors;
    mb.quad(P(0, y - 0.09, d), P(L, y - 0.09, d), P(L, y + 0.09, d), P(0, y + 0.09, d),
      bar, [nx, 0, nz]);
  }
}

// Every edge of a ring as curtain wall.
function curtainRing(K, ring, y0, y1, opts) {
  const N = edgeNormals(ring), n = ring.length, fwd = shoelace(ring) < 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = fwd ? ring[i] : ring[j], b = fwd ? ring[j] : ring[i];
    curtain(K, a[0], a[1], b[0], b[1], N[i][0], N[i][1], y0, y1, opts);
    if (K.seg) K.seg(ring[i][0], ring[i][1], ring[j][0], ring[j][1]);
  }
}

// A glazed drum — Heritage's entrance rotunda. Glass sides, a painted-steel
// ring top and bottom, mullions on the near bake.
function drum(K, cx, cz, r, y0, y1, segs, opts = {}) {
  const mb = K.mb;
  const lo = rgb(opts.lo || GLASS_LO), hi = rgb(opts.hi || GLASS_HI);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const v = mb.vert(cx + c0 * r, y0, cz + s0 * r, c0, 0, s0, lo);
    mb.vert(cx + c1 * r, y0, cz + s1 * r, c1, 0, s1, lo);
    mb.vert(cx + c1 * r, y1, cz + s1 * r, c1, 0, s1, hi);
    mb.vert(cx + c0 * r, y1, cz + s0 * r, c0, 0, s0, hi);
    mb.tri(v, v + 1, v + 2); mb.tri(v, v + 2, v + 3);
    if (K.seg && i % 2 === 0) {
      K.seg(cx + c0 * r, cz + s0 * r, cx + Math.cos(a1 + a1 - a0) * r, cz + Math.sin(a1 + a1 - a0) * r);
    }
  }
  const steel = flat(opts.steel || 0x8e9296);
  mb.cyl(cx, y1 + 0.18, cz, r + 0.22, 0.36, segs, steel);
  mb.cyl(cx, y0 + 0.16, cz, r + 0.14, 0.32, segs, steel, 'y', false);
  if (!K.detail) return;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    mb.post(cx + Math.cos(a) * (r - 0.06), y0, cz + Math.sin(a) * (r - 0.06), 0.11, y1 - y0, steel);
  }
}

// Standing-seam metal over a shallow gable — Heritage's central pavilion. The
// seams are 2 tris each and they are what makes it read as metal, not shingle.
function standingSeam(K, cx, y, cz, w, d, rise, yaw, hex) {
  const mb = K.mb, c = flat(hex);
  mb.roof(cx, y, cz, w, d, rise, c, -yaw, 0.5, { gableCol: flat(hex, 0.86) });
  if (!K.detail) return;
  const s = Math.sin(yaw), co = Math.cos(yaw);
  const slope = Math.hypot(d / 2 + 0.5, rise);
  for (let i = -Math.floor(w / 1.4) / 2; i <= Math.floor(w / 1.4) / 2; i++) {
    const u = i * 1.4;
    for (const side of [-1, 1]) {
      const ex = cx + co * u, ez = cz + s * u;
      const mx = ex - s * side * (d / 4 + 0.25), mz = ez + co * side * (d / 4 + 0.25);
      mb.box(mx, y + rise / 2 + 0.04, mz, 0.07, 0.09, slope, flat(hex, 1.22),
        { yaw: -yaw + Math.PI / 2, noBottom: true });
    }
  }
}

// ------------------------------------------------------------ site furniture

// Steps down from a building face. (fx, fz) is the middle of the face at the
// door, (ox, oz) the unit vector pointing away from the building.
function steps(K, fx, fz, ox, oz, w, treads, rise, run, colHex) {
  const c = flat(colHex), top = flat(colHex, 1.07);
  const yaw = Math.atan2(oz, ox);
  for (let i = 0; i < treads; i++) {
    const d = (treads - i) * run;
    K.mb.tower(fx + ox * d / 2, i * rise, fz + oz * d / 2, w, d, rise, c,
      { yaw: -yaw + Math.PI / 2, noBottom: true, top });
  }
}

function railing(K, ax, ay, az, bx, bz, h, colHex) {
  if (!K.detail) return;
  const c = flat(colHex);
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const n = Math.max(2, Math.round(L / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    K.mb.post(ax + (bx - ax) * t, ay, az + (bz - az) * t, 0.07, h, c);
  }
  const yaw = -Math.atan2(bz - az, bx - ax);
  for (const y of [ay + h - 0.05, ay + h * 0.55]) {
    K.mb.box((ax + bx) / 2, y, (az + bz) / 2, L, 0.08, 0.09, c, { yaw });
  }
}

function flagpole(K, x, z, h, flagHex) {
  K.mb.cyl(x, h / 2, z, 0.09, h, K.detail ? 8 : 5, flat(0xdedad0), 'y', false);
  K.mb.box(x, 0.25, z, 1.1, 0.5, 1.1, flat(CONCRETE), { noBottom: true });
  // No wind to speak of and no cloth simulation, so it hangs: a slab with two
  // faces, 1 cm apart, which reads as a flag from a moving car.
  const c = rgb(flagHex);
  K.mb.box(x + 0.14, h - 0.82, z + 0.75, 0.02, 0.95, 1.5, c, { noBottom: true });
}

// Ground-level furniture keeps a coarse stand-in in the far bake. It is not
// that anyone can read a bike rack at 340 m — it is that the near and far bakes
// must cover the same ground, or the LOD swap changes the shape of the site.
function bikeRack(K, x, z, yaw, hoops) {
  const c = flat(0x8d9096);
  const s = Math.sin(yaw), co = Math.cos(yaw);
  if (!K.detail) { K.mb.box(x, 0.45, z, hoops * 0.75, 0.9, 0.7, c, { yaw: -yaw }); return; }
  for (let i = 0; i < hoops; i++) {
    const u = (i - (hoops - 1) / 2) * 0.75;
    const px = x + co * u, pz = z + s * u;
    K.mb.post(px - s * 0.35, 0, pz + co * 0.35, 0.06, 0.9, c);
    K.mb.post(px + s * 0.35, 0, pz - co * 0.35, 0.06, 0.9, c);
    K.mb.box(px, 0.92, pz, 0.06, 0.06, 0.78, c, { yaw: -yaw });
  }
}

function dumpster(K, x, z, yaw, hex) {
  const c = flat(hex);
  K.mb.tower(x, 0.12, z, 1.9, 1.35, 1.25, c, { yaw: -yaw, noBottom: true, top: flat(hex, 0.7) });
  if (!K.detail) return;
  K.mb.box(x, 1.42, z, 2.05, 0.1, 1.5, flat(hex, 1.25), { yaw: -yaw });
}

// A flat canopy on round posts — the 1968 school entrance, the CEGEP atrium, the
// marina deck. The soffit matters: you walk and drive under these.
function canopy(K, cx, y, cz, w, d, yaw, colHex, posts) {
  const c = flat(colHex);
  K.mb.tower(cx, y, cz, w, d, 0.28, c, { yaw: -yaw, top: flat(colHex, 1.08) });
  K.mb.capRect(cx, cz, w, d, y - 0.002, -yaw, flat(colHex, 0.58), true);
  if (!posts) return;
  const s = Math.sin(yaw), co = Math.cos(yaw);
  for (let i = 0; i < posts; i++) {
    const u = (i - (posts - 1) / 2) * (w - 1.6) / Math.max(1, posts - 1);
    K.mb.cyl(cx + co * u - s * (d / 2 - 0.5), y / 2, cz + s * u + co * (d / 2 - 0.5),
      0.13, y, K.detail ? 7 : 4, flat(0x54585c), 'y', false);
  }
}

// ------------------------------------------------------------------- paving

// Asphalt pad with painted stalls. Lives in the `site` mesh: flat, always drawn,
// and it is how you spot the lot from the road.
function lot(K, cx, cz, w, d, yaw, opts = {}) {
  const mb = K.mb;
  mb.flatRot(cx, cz, w, d, 0.032, -yaw, flat(ASPHALT, 1 + (opts.k || 0)));
  const stallW = 2.6, stallD = 5.2;
  const rows = opts.rows === undefined ? Math.max(1, Math.floor(d / (stallD + 3.2))) : opts.rows;
  const cols = Math.max(1, Math.floor((w - 2) / stallW));
  const s = rgb(STRIPE), si = Math.sin(yaw), co = Math.cos(yaw);
  for (let r = 0; r < rows; r++) {
    for (const side of [-1, 1]) {
      const v = (r - (rows - 1) / 2) * (d / rows) + side * stallD / 2;
      for (let c = 0; c <= cols; c++) {
        const u = (c - cols / 2) * stallW;
        mb.flatRot(cx + co * u - si * v, cz + si * u + co * v, 0.12, stallD, 0.036, -yaw, s);
      }
    }
  }
  if (opts.kerb) mb.prism(rectRing(cx, cz, w + 0.3, d + 0.3, yaw), 0.032, 0.12, flat(0xa9a49a));
}

// A parking-lot light standard: the thing that tells you a two-hundred-metre
// slab of asphalt is a school lot and not a runway. 22 tris; they go in the site
// mesh so they are there from the road.
function lightStandard(K, x, z, h = 8.5, yaw = 0) {
  K.mb.box(x, 0.28, z, 0.7, 0.56, 0.7, flat(CONCRETE, 0.85), { noBottom: true });
  K.mb.cyl(x, h / 2, z, 0.13, h, 5, flat(0x6f6d68), 'y', false);
  K.mb.box(x + Math.cos(yaw) * 0.85, h - 0.1, z + Math.sin(yaw) * 0.85,
    1.5, 0.24, 0.6, flat(0x8e8b84), { yaw: -yaw });
}

// Painted crossing bars across a drive. Two triangles each, and they are half of
// why a forecourt reads as a school forecourt.
function crossing(K, cx, cz, w, d, yaw, bars = 6) {
  const s = Math.sin(yaw), co = Math.cos(yaw), c = rgb(STRIPE);
  for (let i = 0; i < bars; i++) {
    const u = (i - (bars - 1) / 2) * (w / bars);
    K.mb.flatRot(cx + co * u, cz + s * u, w / bars * 0.42, d, 0.037, -yaw, c);
  }
}

function walk(K, x0, z0, x1, z1, w, hex) {
  const L = Math.hypot(x1 - x0, z1 - z0) || 1;
  K.mb.flatRot((x0 + x1) / 2, (z0 + z1) / 2, w, L, 0.034,
    -Math.atan2(z1 - z0, x1 - x0) + Math.PI / 2, flat(hex || 0xb3ada1));
}

// ============================================================ the six sites

// --- A. Philemon Wright High School, 80 rue Daniel-Johnson, Hull ------------
// Built 1968, shared with Hadley Junior High — the owner's own high school, so
// it gets the most detail of anything here. A late-sixties Québec secondary: long
// buff-brick academic blocks, three storeys of ribbon windows in concrete
// spandrels, a blank gymnasium volume, a glazed lobby under a slab canopy. It
// faces south onto the forecourt Rue Daniel-Johnson runs into.
//
// Verified against mapdata: there is a 79 000 m² school landuse here (OSM
// landuse only — no footprint), the parking aprons are real, and the nearest
// road is Rue Daniel-Johnson, NOT Boulevard de la Cité-des-Jeunes (Heritage
// College is 1.77 km away).
const PW = { cx: 6800, cz: -8012 };
const PW_STOREY = 3.7;

// One classroom wing, since Philemon Wright is six of them stuck together. The
// ribbon of aluminium windows with frosted lower panels, the continuous grey
// concrete spandrel under each ribbon, the parapet and the roof deck.
function pwWing(K, ring, storeys, opts = {}) {
  const mb = K.mb, t = fanTris(ring.length);
  const brick = opts.brick || 'brick_brown';
  const eave = opts.eave === undefined ? 1.15 + storeys * PW_STOREY - 0.35 : opts.eave;
  const spandrel = 0xb2aca0;
  const rows = [];
  for (let f = 0; f < storeys; f++) {
    rows.push({ y0: 1.15 + f * PW_STOREY, y1: 3.25 + f * PW_STOREY,
      w: 2.35, gap: 0.9, margin: 2.2, mullions: 1, frost: 0.34 });
  }
  walls(K, ring, 0, eave, {
    mat: brick, tint: tint(K, brick, opts.k || 1.34), rows, jamb: spandrel,
    reveal: 0.3, bar: 0x53575b, frostHex: 0xa8b2ab,
    glassLo: 0x232c36, glassHi: 0x46606f,
  }, (i, L) => (L > (opts.minEdge || 12) ? rows : null));
  // reddish-orange brick base course, grey concrete cap: the two accents the
  // whole school is built out of
  band(K, ring, t, 0, 0.9, 0.14, 0xb06a4d, 'brick_red');
  for (let f = 0; f < storeys; f++) band(K, ring, t, 0.85 + f * PW_STOREY, 0.32, 0.11, spandrel);
  band(K, ring, t, eave, 0.9, 0.24, 0xa8a298);
  mb.capPoly(offsetRing(ring, 0.24), t, eave, flat(0x6b6963));    // membrane roof
  return eave;
}

// Rooftop mechanical: the penthouses and curbed units that give a flat-roofed
// school its actual skyline.
function penthouse(K, x, z, w, d, h, yaw = 0) {
  K.mb.tower(x, K.plant, z, w, d, h, flat(0x9d988e), { yaw: -yaw, noBottom: true, top: flat(0x807c74) });
  if (!K.detail) return;
  K.mb.box(x, K.plant + h + 0.12, z, w * 0.55, 0.24, d * 0.55, flat(0x7d8388), { yaw: -yaw });
}

function buildPWHS(K) {
  const mb = K.mb;
  const spandrel = 0xb2aca0;

  // ---- the sprawl. Every wing is joined to the next by a glazed link; the
  // plan is a comb, which is what a school built for 1 400 students in 1968
  // looks like from the air and why it takes 200 m of frontage.
  const main  = rectRing(6800, -8012, 84, 24, 0);     // 3-storey front block
  const wingD = rectRing(6706, -8062, 22, 88, 0);     // 2-storey west wing
  const wingE = rectRing(6790, -8146, 172, 20, 0);    // 2-storey north wing
  const shop  = rectRing(6896, -8130, 44, 30, 0);     // shops / tech, 1 tall storey
  const eMain = pwWing(K, main, 3);
  const eB = pwWing(K, wingD, 2);
  pwWing(K, wingE, 2);
  pwWing(K, shop, 1, { eave: 5.8, minEdge: 10, brick: 'brick_red', k: 1.06 });

  // ---- gymnasium and auditorium: blank brick volumes, clerestory near the top
  const gym = rectRing(6890, -8012, 34, 36, 0), gymT = fanTris(4);
  const clere = [{ y0: 8.4, y1: 9.9, w: 2.1, gap: 0.75, margin: 2.2, mullions: 1, frost: 0.5 }];
  walls(K, gym, 0, 11.2,
    { mat: 'brick_brown', tint: tint(K, 'brick_brown', 1.32), rows: clere, jamb: spandrel,
      reveal: 0.28, frostHex: 0xa8b2ab }, (i) => (i % 2 === 0 ? clere : null));
  band(K, gym, gymT, 0, 0.9, 0.14, 0xb06a4d, 'brick_red');
  band(K, gym, gymT, 11.2, 0.9, 0.24, 0xa8a298);
  mb.capPoly(offsetRing(gym, 0.24), gymT, 11.2, flat(0x6b6963));

  const aud = rectRing(6884, -8074, 30, 26, 0), audT = fanTris(4);
  walls(K, aud, 0, 12.6,
    { mat: 'brick_brown', tint: tint(K, 'brick_brown', 1.26), rows: [], jamb: spandrel }, () => null);
  band(K, aud, audT, 0, 0.9, 0.14, 0xb06a4d, 'brick_red');
  band(K, aud, audT, 12.6, 1.0, 0.26, 0xa8a298);
  mb.capPoly(offsetRing(aud, 0.26), audT, 12.6, flat(0x6b6963));

  // ---- the links. Each one overlaps both neighbours, so the plan really is
  // one building and not six standing near each other.
  for (const [cx, cz, w, d] of [
    [6857, -8012, 32, 12],     // front block  -> gym
    [6890, -8046, 22, 34],     // gym          -> auditorium
    [6738, -8010, 46, 12],     // front block  -> west wing
    [6706, -8122, 20, 40],     // west wing    -> north wing
    [6800, -8080, 12, 120],    // front block  -> north wing
  ]) {
    const link = rectRing(cx, cz, w, d, 0), lt = fanTris(4);
    walls(K, link, 0, 3.9,
      { mat: 'brick_brown', tint: tint(K, 'brick_brown', 1.32), rows: [] }, () => null);
    const N = edgeNormals(link);
    for (let i = 0; i < 4; i++) {
      const a = link[i], b = link[(i + 1) % 4];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < Math.max(w, d) - 1) continue;
      curtain(K, a[0], a[1], b[0], b[1], N[i][0], N[i][1], 0.9, 3.4, { pitch: 2.0, floor: 2.5 });
    }
    band(K, link, lt, 3.9, 0.55, 0.2, 0xa8a298);
    mb.capPoly(offsetRing(link, 0.2), lt, 3.9, flat(0x6b6963));
  }

  // ---- mechanical penthouses. Flat roofs are never flat.
  K.plant = eMain + 0.9;
  penthouse(K, 6772, -8012, 16, 11, 3.1);
  penthouse(K, 6824, -8016, 11, 9, 2.4);
  K.plant = eB + 0.75;
  penthouse(K, 6706, -8038, 9, 12, 2.6);
  penthouse(K, 6706, -8092, 9, 10, 2.2);
  penthouse(K, 6752, -8146, 12, 10, 2.4);
  penthouse(K, 6858, -8146, 10, 9, 2.1);
  K.plant = 12.6 + 1.0;
  penthouse(K, 6884, -8072, 12, 9, 2.8);            // the fly loft over the stage

  // ---- the entrance: a bank of heavy glass doors under a flat concrete canopy,
  // at the top of wide concrete stairs. This is the picture of the place.
  const ex = PW.cx, ez = PW.cz + 12;
  const lob = rectRing(ex, ez + 3.6, 26, 7.5, 0), lobT = fanTris(4);
  walls(K, lob, 0, 4.6, { mat: 'brick_brown', tint: tint(K, 'brick_brown'), rows: [] }, () => null);
  curtain(K, ex - 13, ez + 7.35, ex + 13, ez + 7.35, 0, 1, 0.0, 4.1,
    { pitch: 1.85, floor: 2.9, lo: 0x1c242c, hi: 0x3f5665 });
  if (K.detail) {                                   // four pairs of door leaves
    for (const u of [-6.6, -2.2, 2.2, 6.6]) {
      mb.box(ex + u, 1.12, ez + 7.28, 1.75, 2.24, 0.1, flat(0x6d7176), { noBottom: true });
      mb.box(ex + u, 1.12, ez + 7.22, 0.11, 2.24, 0.06, flat(0x9aa0a6));
    }
  }
  band(K, lob, lobT, 4.6, 0.6, 0.2, 0xa8a298);
  mb.capPoly(offsetRing(lob, 0.2), lobT, 4.6, flat(0x6b6963));
  canopy(K, ex, 5.0, ez + 10.4, 30, 7.5, 0, 0xcdc8bd, K.detail ? 5 : 0);
  steps(K, ex, ez + 7.4, 0, 1, 22, 4, 0.16, 0.55, CONCRETE);
  railing(K, ex - 11.4, 0.64, ez + 7.5, ex - 11.4, ez + 9.7, 0.95, 0x9aa0a6);
  railing(K, ex + 11.4, 0.64, ez + 7.5, ex + 11.4, ez + 9.7, 0.95, 0x9aa0a6);
  railing(K, ex, 0.64, ez + 7.5, ex, ez + 9.7, 0.95, 0x9aa0a6);
  flagpole(K, ex - 17, ez + 15, 9, 0x1e4fa0);        // le fleurdelisé
  flagpole(K, ex + 17, ez + 15, 9, 0xc8352c);        // l'unifolié
  bikeRack(K, ex + 30, ez + 10, 0, 6);
  dumpster(K, 6862, -8036, 0, 0x3f5a4a);
  dumpster(K, 6865.2, -8036, 0, 0x3f5a4a);
  dumpster(K, 6928, -8112, 0, 0x53585c);
}

function sitePWHS(K) {
  // July 2004: the lots are bare, the field has not been cut since June, and
  // the whole thing is a very large flat place to drive a pickup around.
  // The comb plan encloses two courtyards, so the stalls go where a car can
  // actually reach them: outside the west wing, outside the gym, and the long
  // strip in front that fills up at 8.15 and empties at 3.20.
  lot(K, 6656, -8060, 24, 84, 0, { rows: 5, kerb: true });
  lot(K, 6926, -8046, 20, 70, 0, { rows: 4, kerb: true });
  lot(K, 6800, -7938, 150, 22, 0, { rows: 2, kerb: true });
  // bus loops: two of them, because one 1968 school moved a lot of buses
  K.mb.flatRot(6800, -7966, 130, 24, 0.033, 0, flat(ASPHALT, 1.05));
  K.mb.flatRot(6706, -7994, 20, 40, 0.033, 0, flat(ASPHALT, 1.03));
  walk(K, 6800, -7980, 6800, -7992, 11, 0xb3ada1);
  walk(K, 6740, -7979, 6862, -7979, 2.6, 0xb3ada1);
  // ---- the field and the running track, uncut, empty, endless
  const fx = 6790, fz = -8188;
  K.mb.flatRot(fx, fz, 134, 66, 0.031, 0, flat(0x62813f));
  for (let i = 0; i < 36; i++) {                       // the track, as a ring of chords
    const a0 = (i / 36) * Math.PI * 2, a1 = ((i + 1) / 36) * Math.PI * 2;
    const RX = 56, RZ = 26, W = 6.5;
    const p = (a, k) => [fx + Math.cos(a) * (RX + k), fz + Math.sin(a) * (RZ + k)];
    const q0 = p(a0, 0), q1 = p(a1, 0), q2 = p(a1, W), q3 = p(a0, W);
    K.mb.quad([q0[0], 0.034, q0[1]], [q3[0], 0.034, q3[1]],
      [q2[0], 0.034, q2[1]], [q1[0], 0.034, q1[1]], flat(0x8d5340), [0, 1, 0]);
  }
  K.mb.flatRot(fx, fz, 84, 38, 0.035, 0, flat(0x5d7c3c));       // the pitch inside it
  for (const s of [-1, 1]) K.mb.flatRot(fx + s * 40, fz, 0.16, 36, 0.038, 0, rgb(STRIPE));
  // the ball court behind the gym, paint still there, nobody on it
  // light standards down the lots and the loops, and a crossing at the door
  for (let i = 0; i < 5; i++) lightStandard(K, 6730 + i * 36, -7938, 8.5, 1.4);
  for (let i = 0; i < 4; i++) lightStandard(K, 6656, -8092 + i * 22, 8.5, 0);
  for (let i = 0; i < 3; i++) lightStandard(K, 6926, -8072 + i * 24, 8.5, 3.14);
  crossing(K, 6800, -7978, 11, 3.6, 0, 6);
  K.mb.flatRot(6900, -8046, 26, 16, 0.033, 0, flat(0x3d4a52));
  for (const s of [-1, 1]) K.mb.flatRot(6900 + s * 11.5, -8046, 0.14, 15, 0.037, 0, rgb(STRIPE));
}

// --- B. Heritage College, boulevard de la Cité-des-Jeunes, Hull ------------
// The other school the owner's crowd actually went to, and the one PLACES
// already knew about as imported massing. Its OSM footprint is a 74-sided
// seventies CEGEP that rambles for 190 m, so this is driven off the real outline
// rather than a box: buff brick over a concrete base, bronze ribbon glazing, a
// board-formed stair tower, roof plant, and a glazed entrance pavilion where the
// drive leaves the boulevard.
const HC = { id: 53375547, cx: 5500, cz: -6790 };

// The approach is from the north-east: the nearest point of boulevard de la
// Cité-des-Jeunes to the college is (5605, -6936), and the footprint's long
// east façade runs from (5543.9, -6781.3) to (5527.3, -6846.7). The atrium sits
// on that façade and the rotunda at the top of it, so the first thing you see
// from the road is three storeys of glass.
const HC_ATR = { cx: 5545, cz: -6812, w: 18, d: 56 };
const HC_ROT = { cx: 5533, cz: -6856, r: 8.6 };

function buildHeritage(K, ring, tris) {
  const mb = K.mb;
  const brick = 'brick_buff', bt = tint(K, brick, 1.04);   // warm reddish-buff
  const panel = 0xc4bfb4, STEEL = 0x7d8a86, METAL = 0x6d7b74;
  const rows = [
    { y0: 1.1, y1: 3.3, w: 2.5, gap: 0.7, margin: 1.6, mullions: 1, transom: 0.78 },
    { y0: 4.6, y1: 6.8, w: 2.5, gap: 0.7, margin: 1.6, mullions: 1, transom: 0.78 },
  ];
  const spec = { mat: brick, tint: bt, rows, jamb: panel, reveal: 0.34, bar: STEEL,
    glassLo: 0x242e34, glassHi: 0x53707c };
  walls(K, ring, 0, 7.9, spec, (i, L) => (L > 9 ? rows : null));
  band(K, ring, tris, 0, 0.75, 0.16, 0x9a5343, 'brick_red');     // red brick base
  band(K, ring, tris, 3.55, 0.36, 0.12, panel);
  band(K, ring, tris, 7.9, 0.95, 0.28, 0x9a948a);
  mb.capPoly(offsetRing(ring, 0.28), tris, 7.9, flat(0x6f6d68));

  // rooftop plant — the boxy skyline a college has instead of a roof
  for (const [x, z, w, d, h] of [[5480, -6748, 14, 9, 2.6], [5486, -6828, 10, 8, 2.2],
    [5470, -6866, 8, 7, 1.9], [5500, -6712, 9, 7, 2.1]]) {
    mb.tower(x, 8.85, z, w, d, h, flat(0x9b968c), { noBottom: true, top: flat(0x7d7970) });
  }

  // ---- THE ATRIUM. A three-storey glazed volume down the boulevard flank with
  // a standing-seam metal roof over it. It is the cheapest geometry on the site
  // and the reason the place reads as a college from the road.
  const atr = rectRing(HC_ATR.cx, HC_ATR.cz, HC_ATR.w, HC_ATR.d, 0);
  const atrT = fanTris(4);
  // brick end walls, glass on the two long faces
  const N = edgeNormals(atr);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = atr[i], b = atr[j];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > HC_ATR.w + 1) {
      curtain(K, a[0], a[1], b[0], b[1], N[i][0], N[i][1], 0.3, 12.6,
        { pitch: 2.5, floor: 4.1, steel: STEEL, lo: 0x2a3a3c, hi: 0x7d99a0 });
    } else {
      on(K, brick);
      wallRow(K, a[0], a[1], b[0], b[1], N[i][0], N[i][1], 0, 12.6, [], { mat: brick, tint: bt });
      off(K);
    }
    if (K.seg) K.seg(a[0], a[1], b[0], b[1]);
  }
  band(K, atr, atrT, 0, 0.75, 0.2, 0x9a5343, 'brick_red');
  standingSeam(K, HC_ATR.cx, 12.6, HC_ATR.cz, HC_ATR.d + 1.0, HC_ATR.w + 1.6, 2.6,
    Math.PI / 2, METAL);
  // the internal floor plates you can see through the glass — three lines of
  // pale concrete, which is what actually sells "multi-level atrium"
  if (K.detail) {
    for (let f = 1; f <= 3; f++) {
      mb.box(HC_ATR.cx + 5.0, f * 3.9, HC_ATR.cz, 5.6, 0.34, HC_ATR.d - 4, flat(0xbfb9ac));
      mb.box(HC_ATR.cx - 5.0, f * 3.9, HC_ATR.cz, 5.6, 0.34, HC_ATR.d - 4, flat(0xbfb9ac));
    }
  }

  // ---- the entrance rotunda, glass all round, under a covered drop-off
  drum(K, HC_ROT.cx, HC_ROT.cz, HC_ROT.r, 0, 10.2, K.detail ? 16 : 9,
    { steel: STEEL, lo: 0x1f2a30, hi: 0x6d8a94 });
  mb.cone(HC_ROT.cx, 10.56, HC_ROT.cz, HC_ROT.r + 0.5, 2.3, K.detail ? 16 : 9, flat(METAL));
  canopy(K, HC_ROT.cx + 13, 4.6, HC_ROT.cz - 9, 22, 9, -0.95, 0xcfcabf, K.detail ? 3 : 0);
  steps(K, HC_ROT.cx + 7.0, HC_ROT.cz - 4.6, 0.82, -0.57, 12, 3, 0.15, 0.55, CONCRETE);
  railing(K, HC_ROT.cx + 6.0, 0.5, HC_ROT.cz - 9.8, HC_ROT.cx + 8.4, HC_ROT.cz - 8.2, 0.95, STEEL);
  railing(K, HC_ROT.cx + 11.0, 0.5, HC_ROT.cz - 2.6, HC_ROT.cx + 13.4, HC_ROT.cz - 1.0, 0.95, STEEL);

  // board-formed concrete stair tower at the far end — every campus of this
  // period has one, and it gives the 190 m sprawl a full stop
  mb.tower(5457, 0, -6862, 8, 8, 13.2, flat(0xa8a297), { noBottom: true, top: flat(0x8b8781) });
  for (let f = 0; f < 4; f++) {
    mb.panel(5453, 2.4 + f * 3.0, -6862, 1.1, 1.8, -1, 0, rgb(GLASS_LO), null, 0.03);
  }
  flagpole(K, HC_ROT.cx + 26, HC_ROT.cz - 22, 10, 0x1e4fa0);
  flagpole(K, HC_ROT.cx + 30, HC_ROT.cz - 18, 10, 0xc8352c);
  bikeRack(K, HC_ROT.cx + 4, HC_ROT.cz - 16, 0.4, 8);
  dumpster(K, 5455, -6742, 0.5, 0x53585c);
  dumpster(K, 5458.4, -6742, 0.5, 0x53585c);
}

function siteHeritage(K) {
  // Two staff cars' worth of stalls in use and 300 empty ones: it is July.
  lot(K, 5630, -6810, 88, 86, 0.06, { rows: 6, kerb: true });
  lot(K, 5436, -6799, 40, 26, 0.06, { rows: 2 });
  K.mb.flatRot(5566, -6880, 60, 18, 0.033, -0.95, flat(ASPHALT, 1.04));   // drop-off
  for (let i = 0; i < 5; i++) lightStandard(K, 5596 + i * 18, -6774 - i * 8, 9, -2.1);
  for (let i = 0; i < 4; i++) lightStandard(K, 5600 + i * 18, -6844 - i * 8, 9, -2.1);
  crossing(K, 5562, -6894, 10, 3.4, -0.95, 6);
  walk(K, HC_ROT.cx + 8, HC_ROT.cz - 8, 5580, -6898, 3.2, 0xb3ada1);
  walk(K, 5556, -6812, 5556, -6772, 2.6, 0xb3ada1);
}

// --- C. Symmes Junior High, Aylmer ----------------------------------------
// Zahra's school, not the player's. WHERE IT IS IS A GUESS: Symmes moved to
// 925 boulevard du Plateau at some point after our 2004, mapdata has no
// footprint at that address, and nobody has been able to say where the school
// sat in 2004. It is placed here on the Western Quebec School Board's Aylmer
// campus off avenue Frank-Robinson — the right board, the right sector, next to
// Lord Aylmer Elementary and the Career Centre, in the one clear corner of the
// school landuse. Kept deliberately modest for exactly that reason: a plain
// two-storey brick school and a gym, no invented ceremony.
const SJ = { cx: -318, cz: 380, yaw: -0.045 };

function buildSymmesJr(K) {
  const mb = K.mb;
  const brick = 'brick_red', bt = tint(K, brick, 1.02);
  const trimHex = 0xcfc6b2;
  const main = rectRing(SJ.cx, SJ.cz, 44, 14, SJ.yaw), mainT = fanTris(4);
  const rows = [
    { y0: 1.1, y1: 3.05, w: 2.6, gap: 1.0, margin: 2.0, mullions: 2 },
    { y0: 4.5, y1: 6.45, w: 2.6, gap: 1.0, margin: 2.0, mullions: 2 },
  ];
  const spec = { mat: brick, tint: bt, rows, jamb: trimHex, reveal: 0.24, bar: 0x55585c };
  walls(K, main, 0, 7.6, spec, (i, L) => (L > 10 ? rows : null));
  band(K, main, mainT, 0, 0.55, 0.14, 0x8b8378, 'stone_grey');
  band(K, main, mainT, 3.5, 0.3, 0.12, 'brick_buff', 'brick_buff');
  band(K, main, mainT, 7.6, 0.7, 0.24, 0x9a948a);
  mb.capPoly(offsetRing(main, 0.24), mainT, 7.6, flat(0x6f6d68));

  // gym on the east end: one blank volume, a clerestory, a taller parapet
  const gym = rectRing(-286, SJ.cz, 16, 17, SJ.yaw), gymT = fanTris(4);
  const clere = [{ y0: 6.3, y1: 7.5, w: 1.8, gap: 0.7, margin: 1.6, mullions: 1 }];
  walls(K, gym, 0, 8.6,
    { mat: 'brick_buff', tint: tint(K, 'brick_buff'), rows: clere, jamb: trimHex, reveal: 0.22 },
    (i) => (i % 2 === 1 ? clere : null));
  band(K, gym, gymT, 8.6, 0.65, 0.22, 0x9a948a);
  mb.capPoly(offsetRing(gym, 0.22), gymT, 8.6, flat(0x6f6d68));

  // entrance on the south front, facing the campus drive and the lot
  const ox = -Math.sin(SJ.yaw), oz = Math.cos(SJ.yaw);
  const fx = SJ.cx + ox * 7, fz = SJ.cz + oz * 7;
  mb.panel(fx, 1.6, fz, 3.0, 3.2, ox, oz, flat(0x2c3b46), null, 0.03);
  canopy(K, fx + ox * 1.6, 4.0, fz + oz * 1.6, 8.5, 4.2, SJ.yaw, 0xd6d1c6, K.detail ? 2 : 0);
  steps(K, fx, fz, ox, oz, 6.0, 2, 0.16, 0.5, CONCRETE);
  flagpole(K, SJ.cx - 25, SJ.cz + 9, 8, 0x1e4fa0);
  bikeRack(K, SJ.cx + 16, SJ.cz + 9, SJ.yaw, 5);
  dumpster(K, -279, 368, SJ.yaw, 0x3f5a4a);
}

function siteSymmesJr(K) {
  walk(K, -318, 388, -318, 397, 3.0, 0xb3ada1);
  walk(K, -340, 391, -290, 389, 2.2, 0xb3ada1);
  K.mb.flatRot(-300, 391, 22, 8, 0.033, -SJ.yaw, flat(ASPHALT, 1.05));
  lightStandard(K, -286, 396, 7.5, 3.14);
  K.mb.flatRot(-296, 372, 24, 16, 0.033, -SJ.yaw, flat(0x3d4a52));       // ball court
}

// --- D. L'auberge Symmes, 1 rue Front, Vieux-Aylmer ------------------------
// The 1831 Georgian coaching inn by the old steamboat landing: thick coursed
// limestone, six-over-six sashes deep in the masonry, a pitched roof with
// dormers and masonry stacks at both gable ends, a central door under a transom.
// A heritage museum in 2004 and the most recognisable old building in the
// village. It is a landmark, NOT a school, and nothing here says otherwise.
const AS = { id: 463458618, cx: -1517.5, cz: -61.1 };

function buildSymmesInn(K, ring, tris) {
  const mb = K.mb;
  const stone = 'stone_grey', st = tint(K, stone, 1.03);
  const DRESS = 0xc9bda4, TRIMC = 0xefe9da;
  const EAVE = 6.4;
  const rows = [
    { y0: 0.95, y1: 2.75, w: 1.1, gap: 1.75, margin: 1.5, mullions: 2, transom: 0.5, sill: 0.14 },
    { y0: 3.9, y1: 5.5, w: 1.1, gap: 1.75, margin: 1.5, mullions: 2, transom: 0.5, sill: 0.14 },
  ];
  const spec = { mat: stone, tint: st, rows, jamb: DRESS, reveal: 0.34, bar: TRIMC,
    glassLo: 0x1e2a33, glassHi: 0x445d6d };
  walls(K, ring, 0, EAVE, spec, (i, L) => (L > 5 ? rows : null));
  band(K, ring, tris, 0, 0.55, 0.13, 0x8f8b81, 'stone_grey');
  band(K, ring, tris, EAVE, 0.3, 0.26, TRIMC);
  quoins(K, ring, 0.55, EAVE, 0.42, DRESS);

  // gable roof, ridge along the front (east-west), stacks at both ends
  on(K, 'shingle_grey');
  const sc = tint(K, 'shingle_grey', 0.94);
  mb.roof(AS.cx, EAVE + 0.3, AS.cz + 6, 19.6, 17.2, 4.4, sc, 0, 0.55,
    { onGable: () => { on(K, stone); }, gableCol: st });
  off(K);
  for (const s of [-1, 1]) {
    mb.tower(AS.cx + s * 8.6, EAVE + 0.3, AS.cz + 6, 1.5, 1.1, 4.6, flat(0x9a8b78),
      { noBottom: true });
    mb.tower(AS.cx + s * 8.6, EAVE + 4.9, AS.cz + 6, 1.85, 1.4, 0.2, flat(DRESS),
      { noBottom: true });
  }
  // three dormers on the street slope
  if (K.detail) {
    for (const u of [-5.6, 0, 5.6]) {
      const dx = AS.cx + u, dz = AS.cz + 11.2;
      mb.tower(dx, EAVE + 1.0, dz, 1.7, 1.6, 1.45, flat(TRIMC), { noBottom: true });
      mb.panel(dx, EAVE + 1.75, dz + 0.82, 0.95, 1.1, 0, 1, rgb(GLASS_LO), null, 0.02);
      on(K, 'shingle_grey');
      mb.roof(dx, EAVE + 2.45, dz, 2.1, 1.9, 0.7, sc, Math.PI / 2, 0.2,
        { onGable: () => { off(K); }, gableCol: flat(TRIMC) });
      off(K);
    }
  }

  // ---- central doorway with a transom, stone steps, a heritage plaque
  const fx = AS.cx - 0.5, fz = AS.cz + 14.4;
  mb.panel(fx, 1.4, fz, 1.5, 2.6, 0, 1, flat(0x2f4436), null, 0.03);
  mb.panel(fx, 2.95, fz, 1.7, 0.5, 0, 1, flat(0x3f5a68), null, 0.03);
  mb.panel(fx, 3.35, fz, 2.4, 0.28, 0, 1, flat(DRESS, 1.1), null, 0.03);      // lintel
  steps(K, fx, fz, 0, 1, 2.6, 3, 0.17, 0.42, DRESS);
  if (K.detail) {
    mb.panel(fx + 2.6, 1.7, fz, 0.5, 0.7, 0, 1, flat(0x6b5030), null, 0.03);  // plaque
    railing(K, fx - 1.7, 0.5, fz + 0.4, fx - 1.7, fz + 1.5, 0.9, 0x2b2f31);
    railing(K, fx + 1.7, 0.5, fz + 0.4, fx + 1.7, fz + 1.5, 0.9, 0x2b2f31);
  }
  bikeRack(K, AS.cx + 11, AS.cz + 12, 0.1, 4);
}

function siteSymmesInn(K) {
  lot(K, -1497, -58, 20, 22, 0.08, { rows: 2 });
  walk(K, -1518, -44, -1518, -35, 3.0, 0xb0aa9e);
  walk(K, -1532, -42, -1500, -43, 2.4, 0xb0aa9e);
}

// --- E. L'Hôtel British, 71 rue Principale, Vieux-Aylmer -------------------
// The other stone inn on the old strip, and the one a local names before the
// church. Rubble limestone, quoined corners, a two-storey wooden gallery across
// the whole front, twelve-pane sashes, and a swinging sign over the sidewalk.
const BR = { id: 473653913, cx: -916, cz: -112, yaw: -0.1135 };

function buildBritish(K, ring, tris) {
  const mb = K.mb;
  const stone = 'stone_beige', st = tint(K, stone, 1.02);
  const TRIMC = 0xf2ece0, DRESS = 0xbfae90;
  const EAVE = 7.6;
  const rows = [
    { y0: 1.0, y1: 3.0, w: 1.2, gap: 1.6, margin: 1.7, mullions: 2, transom: 0.5, sill: 0.13 },
    { y0: 4.5, y1: 6.4, w: 1.2, gap: 1.6, margin: 1.7, mullions: 2, transom: 0.5, sill: 0.13 },
  ];
  const spec = { mat: stone, tint: st, rows, jamb: DRESS, reveal: 0.3, bar: TRIMC,
    glassLo: 0x22303a, glassHi: 0x506b7c };
  walls(K, ring, 0, EAVE, spec, (i, L) => (L > 5 ? rows : null));
  band(K, ring, tris, 0, 0.6, 0.13, 0x8d867a, 'stone_grey');
  band(K, ring, tris, EAVE, 0.34, 0.26, TRIMC);
  quoins(K, ring, 0.6, EAVE, 0.42, DRESS);

  on(K, 'shingle_grey');
  const sc = tint(K, 'shingle_grey', 0.96);
  mb.roof(BR.cx, EAVE + 0.34, BR.cz, 31, 39, 5.0, sc, -BR.yaw, 0.6,
    { onGable: () => { on(K, stone); }, gableCol: st });
  off(K);
  const nx = -Math.sin(BR.yaw), nz = Math.cos(BR.yaw);
  const tx = Math.cos(BR.yaw), tz = Math.sin(BR.yaw);
  if (K.detail) {
    for (let i = -2; i <= 2; i++) {
      const dx = BR.cx + tx * i * 6.2 + nx * 12.0, dz = BR.cz + tz * i * 6.2 + nz * 12.0;
      mb.tower(dx, EAVE + 1.0, dz, 1.8, 1.6, 1.4, flat(TRIMC), { yaw: -BR.yaw, noBottom: true });
      mb.panel(dx + nx * 0.82, EAVE + 1.7, dz + nz * 0.82, 1.0, 1.1, nx, nz, rgb(GLASS_LO), null, 0.02);
      on(K, 'shingle_grey');
      mb.roof(dx, EAVE + 2.4, dz, 2.2, 2.0, 0.7, sc, -BR.yaw + Math.PI / 2, 0.2,
        { onGable: () => { off(K); }, gableCol: flat(TRIMC) });
      off(K);
    }
  }
  for (const s of [-1, 1]) {
    mb.tower(BR.cx + tx * 14.5 * s, EAVE, BR.cz + tz * 14.5 * s, 1.6, 1.2, 5.6, flat(0x9b7d6a),
      { yaw: -BR.yaw, noBottom: true });
  }

  // ---- the gallery: two storeys of verandah across the front
  const gx = BR.cx + nx * 21.5, gz = BR.cz + nz * 21.5;
  for (const [y, h] of [[3.9, 3.5], [7.3, 3.2]]) {
    mb.tower(gx, y, gz, 28, 3.6, 0.24, flat(0xa08a6c), { yaw: -BR.yaw, top: flat(0xb59a78) });
    mb.capRect(gx, gz, 28, 3.6, y - 0.002, -BR.yaw, flat(0x6d5c48), true);
    if (!K.detail) continue;
    for (let i = -5; i <= 5; i++) {
      mb.cyl(gx + tx * i * 2.7 + nx * 1.5, y - h / 2, gz + tz * i * 2.7 + nz * 1.5,
        0.11, h, 6, flat(TRIMC), 'y', false);
    }
    railing(K, gx - tx * 13.9 + nx * 1.72, y - 1.0, gz - tz * 13.9 + nz * 1.72,
      gx + tx * 13.9 + nx * 1.72, gz + tz * 13.9 + nz * 1.72, 1.0, TRIMC);
  }
  mb.panel(BR.cx + nx * 19.9, 1.5, BR.cz + nz * 19.9, 2.2, 3.0, nx, nz, flat(0x25402f), null, 0.03);
  steps(K, BR.cx + nx * 23.4, BR.cz + nz * 23.4, nx, nz, 4.0, 3, 0.16, 0.42, DRESS);
  if (K.detail) {                                   // the swinging sign's bracket
    const sx = BR.cx + tx * 13.6 + nx * 23.0, sz = BR.cz + tz * 13.6 + nz * 23.0;
    mb.cyl(sx, 2.9, sz, 0.08, 5.8, 6, flat(0x2b2f31), 'y', false);
    mb.box(sx + nx * 0.9, 5.4, sz + nz * 0.9, 1.9, 0.08, 0.08, flat(0x2b2f31), { yaw: -BR.yaw + Math.PI / 2 });
  }
  bikeRack(K, BR.cx - tx * 13 + nx * 24, BR.cz - tz * 13 + nz * 24, BR.yaw, 4);
  dumpster(K, BR.cx - nx * 22, BR.cz - nz * 22, BR.yaw, 0x4a4f45);
}

function siteBritish(K) {
  lot(K, -940, -140, 20, 26, BR.yaw, { rows: 2 });
  K.mb.flatRot(-916, -88, 34, 4.6, 0.035, -BR.yaw, flat(0xb0aa9e));   // the sidewalk
}

// --- F. La marina d'Aylmer et son phare ------------------------------------
// The lighthouse at the harbour mouth and the capitainerie beside it. Not a
// school, but it is the place in Aylmer people drive to just to look at, and it
// was imported as nothing at all.
const MA = { cx: -1793, cz: -30 };

function buildMarina(K) {
  const mb = K.mb;
  const WHITE = 0xf0ece2, RED = 0xb3352c;
  const segs = K.detail ? 14 : 8;
  const w = flat(WHITE), r = flat(RED);
  mb.cyl(MA.cx, 0.35, MA.cz, 3.1, 0.7, segs, flat(0x8d8880));
  taper(mb, MA.cx, MA.cz, [
    { y: 0.7, r: 2.5, c: w }, { y: 5.6, r: 2.1, c: w },
    { y: 5.6, r: 2.1, c: r }, { y: 7.6, r: 1.95, c: r },
    { y: 7.6, r: 1.95, c: w }, { y: 10.6, r: 1.75, c: w },
  ], segs);
  mb.cyl(MA.cx, 10.75, MA.cz, 2.15, 0.3, segs, flat(0x3a3d40));           // gallery deck
  if (K.detail) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      mb.post(MA.cx + Math.cos(a) * 1.95, 10.9, MA.cz + Math.sin(a) * 1.95, 0.07, 0.9, flat(0x2f3235));
    }
    mb.cyl(MA.cx, 11.75, MA.cz, 2.0, 0.08, segs, flat(0x2f3235), 'y', false);
  }
  mb.cyl(MA.cx, 12.3, MA.cz, 1.3, 2.4, segs, flat(0x22303a), 'y', false);  // lantern glazing
  mb.cyl(MA.cx, 13.6, MA.cz, 1.6, 0.22, segs, flat(0x2b2e31));
  mb.cone(MA.cx, 13.7, MA.cz, 1.45, 1.6, segs, flat(0x2b2e31));
  mb.panel(MA.cx, 1.75, MA.cz + 2.4, 1.0, 2.1, 0, 1, flat(0x2f4436), null, 0.02);

  // ---- la capitainerie: clapboard, green trim, a deck on the water side
  const CY = 0.24, cs = Math.sin(CY), cc = Math.cos(CY);
  const cap = rectRing(-1774, -52, 13, 8, CY), ct = fanTris(4);
  const rows = [{ y0: 1.1, y1: 2.6, w: 1.2, gap: 1.1, margin: 1.1, mullions: 1, sill: 0.12 }];
  walls(K, cap, 0.25, 3.5,
    { mat: 'clapboard_white', tint: tint(K, 'clapboard_white'), rows,
      jamb: 0x2f5540, reveal: 0.2, bar: WHITE }, (i, L) => (L > 5 ? rows : null));
  band(K, cap, ct, 0, 0.25, 0.12, 0x8f8b81);
  on(K, 'shingle_grey');
  mb.roof(-1774, 3.5, -52, 13.6, 8.6, 2.2, tint(K, 'shingle_grey', 0.95), -CY, 0.5,
    { onGable: () => { off(K); }, gableCol: flat(0xe8e2d4) });
  off(K);
  const dx = -1774 - cs * 5.6, dz = -52 + cc * 5.6;
  canopy(K, dx, 2.9, dz, 13, 3.2, CY, 0x2f5540, K.detail ? 3 : 0);
  mb.flatRot(dx, dz, 13, 3.4, 0.42, -CY, flat(0x9a7c58));
  railing(K, dx - cs * 1.7 - cc * 6.4, 0.42, dz + cc * 1.7 - cs * 6.4,
    dx - cs * 1.7 + cc * 6.4, dz + cc * 1.7 + cs * 6.4, 0.95, 0x2f5540);

  // ---- the piles the docks are tied to, and a picnic table on the point
  for (let i = 0; i < 10; i++) {
    const a = -1.1 + i * 0.3;
    mb.cyl(MA.cx + Math.cos(a) * (17 + (i % 3) * 4), 0.9, MA.cz + Math.sin(a) * (17 + (i % 3) * 4),
      0.16, 2.4, K.detail ? 5 : 4, flat(0x6f5b45), 'y', false);
  }
  mb.box(-1806, 0.75, -44, 2.2, 0.08, 0.9, flat(0x9a7c58));
  if (!K.detail) return;
  for (const s of [-1, 1]) {
    mb.box(-1806, 0.42, -44 + s * 0.78, 2.2, 0.07, 0.34, flat(0x9a7c58));
    mb.post(-1806.9, 0, -44 + s * 0.5, 0.09, 0.75, flat(0x6f5b45));
    mb.post(-1805.1, 0, -44 + s * 0.5, 0.09, 0.75, flat(0x6f5b45));
  }
}

function siteMarina(K) {
  K.mb.flatRot(MA.cx, MA.cz, 26, 22, 0.033, 0, flat(0xa8a294));   // the gravel point
  lot(K, -1768, -76, 34, 24, 0.24, { rows: 2 });
  walk(K, -1780, -46, MA.cx + 5, MA.cz - 2, 2.6, 0xb3ada1);
}

// --- G. 129 avenue Frank-Robinson — chez Mike -----------------------------
// The corner of Frank-Robinson and rue Smiley, with Lord Aylmer Campus Junior
// School directly across the avenue, 133 to the north and 117 to the west —
// all four of those check out against mapdata, so the real OSM footprint is
// used as-is. Built from the owner's photograph: 1½ storeys, red brick ground
// floor, a full-width covered porch on square brick piers with white posts and
// dark lattice skirting, a steep dark shingled roof with a big shed dormer in
// dark green siding carrying a white triple window, a red brick chimney on the
// south gable, gravel drive to the north.
//
// And the couch. See COUCH below.
const MK = { id: 473653319, cx: -428.3, cz: 58.3, yaw: -0.096, fz: 53.7, mz: 56.1 };
// props.js already stands a maple on this lawn (MIKE_TREE) and the side job
// already throws a chesterfield at it. This is the aftermath: the limbs it came
// to rest on and the couch itself, lodged 5.5 m up where the street can see it.
export const MIKE_MAPLE = { x: -417.5, z: 57.0, crownY: 6.4 };
// Wedged in the fork between the two lowest limbs and pushed far enough out
// along them that a good third of it clears the foliage — the whole point is
// that you can see it from the road if you look up.
export const COUCH = {
  x: MIKE_MAPLE.x + 2.95, y: 5.62, z: MIKE_MAPLE.z + 0.44, yaw: -0.55, roll: 0.17, pitch: 0.09,
};

function buildMike(K, ring, tris) {
  const mb = K.mb;
  const brick = 'brick_red', bt = tint(K, brick, 1.0);
  const TRIMC = 0xf2efe7, GREEN = 0x39463c, DECK = 0x7b5a44, LATTICE = 0x262b26;
  const EAVE = 3.55;                        // low: the roof does most of the work
  const rows = [
    { y0: 1.15, y1: 2.85, w: 1.15, gap: 1.45, margin: 1.0, mullions: 1, transom: 0.55, sill: 0.11 },
  ];
  const spec = { mat: brick, tint: bt, rows, jamb: 0xbfae90, reveal: 0.26, bar: TRIMC,
    glassLo: 0x1c262e, glassHi: 0x3f5765 };
  walls(K, ring, 0, EAVE, spec, (i, L) => (L > 4 ? rows : null));
  band(K, ring, tris, 0, 0.42, 0.1, 0x8b8378, 'stone_grey');

  // ---- roof: side gable, ridge north-south, steep, dark shingle
  on(K, 'shingle_dark');
  const sc = tint(K, 'shingle_dark', 0.98);
  mb.roof(MK.cx + 0.2, EAVE, MK.mz, 15.6, 12.4, 4.4, sc, Math.PI / 2 - MK.yaw, 0.45,
    { onGable: () => { on(K, brick); }, gableCol: bt });
  off(K);
  // the shed dormer across the front slope, green siding, white triple window
  const nx = Math.cos(MK.yaw), nz = Math.sin(MK.yaw);        // outward: east, to the avenue
  const tx = -nz, tz = nx;                                   // along the façade, +t is south
  const dx = MK.cx + nx * 2.5 + tx * (MK.fz - MK.cz), dz = MK.cz + nz * 2.5 + tz * (MK.fz - MK.cz);
  mb.tower(dx, EAVE + 1.25, dz, 6.4, 3.4, 2.15, flat(GREEN),
    { yaw: -MK.yaw + Math.PI / 2, noBottom: true, top: flat(GREEN, 0.8) });
  mb.box(dx, EAVE + 3.45, dz, 6.9, 0.22, 3.9, flat(TRIMC), { yaw: -MK.yaw + Math.PI / 2 });
  if (K.detail) {
    for (const u of [-1.25, 0, 1.25]) {                       // the triple window
      const wx = dx + tx * u, wz = dz + tz * u;
      mb.panel(wx + nx * 1.72, EAVE + 2.3, wz + nz * 1.72, 1.08, 1.4, nx, nz, flat(TRIMC), null, 0.02);
      mb.panel(wx + nx * 1.75, EAVE + 2.3, wz + nz * 1.75, 0.86, 1.16, nx, nz, rgb(0x30414c), null, 0.02);
    }
  } else {
    mb.panel(dx + nx * 1.75, EAVE + 2.3, dz + nz * 1.75, 3.6, 1.3, nx, nz, rgb(0x30414c), null, 0.02);
  }
  // red brick chimney on the south gable wall
  // The ridge runs north-south, so the gable walls face north and south. In the
  // photograph the stack is on the right-hand one as you stand on the avenue —
  // and since rue Smiley and the gravel drive are on that side, right is north.
  const sx = -425.4, sz = 48.4;
  mb.tower(sx, 0, sz, 1.3, 1.1, 9.6, tintOrFlat(K, brick, bt), { yaw: -MK.yaw, noBottom: true });
  off(K);
  mb.tower(sx, 9.6, sz, 1.6, 1.4, 0.24, flat(0xb0a89a), { yaw: -MK.yaw, noBottom: true });

  // ---- the porch: full width, brick piers, white posts, lattice skirting
  const px = MK.cx + nx * 8.0 + tx * (MK.fz - MK.cz), pz = MK.cz + nz * 8.0 + tz * (MK.fz - MK.cz);
  mb.tower(px, 0, pz, 10.4, 3.2, 0.72, flat(DECK, 0.8),
    { yaw: -MK.yaw + Math.PI / 2, noBottom: true, top: flat(DECK) });
  for (const u of [-4.6, -1.6, 1.6, 4.6]) {                    // brick piers
    const qx = px + tx * u + nx * 1.35, qz = pz + tz * u + nz * 1.35;
    mb.tower(qx, 0, qz, 0.62, 0.62, 1.6, tintOrFlat(K, brick, bt), { yaw: -MK.yaw });
    off(K);
    mb.cyl(qx, 2.55, qz, 0.11, 1.9, K.detail ? 6 : 4, flat(TRIMC), 'y', false);   // white post
  }
  // lattice skirting under the deck, between the piers
  if (K.detail) {
    for (const u of [-3.1, 3.1]) {
      mb.panel(px + tx * u + nx * 1.36, 0.36, pz + tz * u + nz * 1.36, 2.5, 0.7, nx, nz,
        flat(LATTICE), null, 0.02);
    }
    mb.panel(px + nx * 1.36, 0.36, pz + nz * 1.36, 2.5, 0.7, nx, nz, flat(LATTICE), null, 0.02);
  }
  mb.box(px, 3.62, pz, 10.6, 0.34, 3.4, flat(TRIMC), { yaw: -MK.yaw + Math.PI / 2 });   // beam
  mb.capRect(px, pz, 10.4, 3.2, 3.42, -MK.yaw + Math.PI / 2, flat(TRIMC, 0.86), true);  // ceiling
  // front door, slightly right of centre, and the steps down to the lawn
  mb.panel(MK.cx + nx * 6.85 + tx * (MK.fz - MK.cz + 0.7), 1.75,
    MK.cz + nz * 6.85 + tz * (MK.fz - MK.cz + 0.7), 1.05, 2.1, nx, nz, flat(0x7a3a2c), null, 0.03);
  steps(K, px + nx * 1.62, pz + nz * 1.62, nx, nz, 2.4, 4, 0.18, 0.34, 0x8d857a);

  // ---- THE COUCH, still up there. Its own limbs so it is genuinely lodged in
  // a fork rather than levitating, and its own tiny mesh so a mission can turn
  // it on and off (see LANDMARK_FLAGS.couchInTree). The limbs stay in the far
  // bake: they are what the couch sits on, and they hold the site's bounds.
  for (const [a, len, rise] of [[-0.35, 3.0, 0.35], [0.62, 2.7, 0.28], [2.3, 2.2, 0.4]]) {
    mb.box(MIKE_MAPLE.x + Math.cos(a) * len / 2, 5.2 + rise / 2, MIKE_MAPLE.z + Math.sin(a) * len / 2,
      len, 0.2, 0.2, flat(0x54402e), { yaw: -a });
  }
}

// Colour helper: arm the tile and hand back the tint that goes under it.
function tintOrFlat(K, mat, t) { on(K, mat); return t; }

// The couch, in its own builder so it can be lifted in and out. Reuses the same
// 1977 plaid brown as props.js rather than inventing a second chesterfield.
function buildCouchMesh() {
  const mb = new MeshBuilder();
  const base = rgb(0x8a5f3a), dark = rgb(0x6d4a2c), cush = rgb(0xa0764a), leg = rgb(0x3b2a1c);
  const c = COUCH;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  // Yaw is a real rotation; roll and pitch are applied as a shear on the box
  // CENTRES — MeshBuilder.box only turns about Y, and for something this small,
  // wedged in a fork and seen from thirty metres below, a shear reads as a tilt.
  const kr = Math.tan(c.roll), kp = Math.tan(c.pitch);
  const put = (lx, ly, lz, w, h, d, col) => {
    mb.box(c.x + lx * cy - lz * sy, c.y + ly + lx * kr - lz * kp, c.z + lx * sy + lz * cy,
      w, h, d, col, { yaw: -c.yaw });
  };
  put(0, 0.0, 0, 1.95, 0.34, 0.86, base);                       // frame
  put(0, 0.36, -0.34, 1.95, 0.52, 0.18, dark);                  // back
  for (const sx of [-0.94, 0.94]) put(sx, 0.24, 0.02, 0.20, 0.46, 0.86, dark);
  for (const sx of [-0.55, 0, 0.55]) put(sx, 0.24, 0.05, 0.52, 0.16, 0.72, cush);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.34, 0.34]) put(sx, -0.30, sz, 0.09, 0.24, 0.09, leg);
  return mb;
}

// Whether the couch is in the tree. True by default — it is the aftermath of a
// thing that happened in 1998, and a player who never touches the side job
// should still be able to find it. The couch side job can flip this at either
// end of its own sequence: `world.landmarks.flags.couchInTree = false` before
// the launch, `= true` once it sticks.
export const LANDMARK_FLAGS = { couchInTree: true };

/** The couch mesh, unuploaded — for tools/preview_landmarks.mjs and the tests. */
export function buildCouchPreview() { const b = buildCouchMesh(); b.finish(); return b; }

function siteMike(K) {
  // gravel drive on the Smiley side, the corner sidewalk, and the street-name
  // post that stands in the photograph
  K.mb.flatRot(-419, 46, 13, 5.2, 0.033, -MK.yaw, flat(0x9c9384));
  walk(K, -413, 34.5, -413, 70, 2.0, 0xb0aa9e);
  walk(K, -434, 37, -412, 36.5, 2.0, 0xb0aa9e);
  K.mb.cyl(-412.6, 1.7, 41.5, 0.06, 3.4, 5, flat(0x8e9296), 'y', false);
  K.mb.box(-412.6, 3.25, 41.5, 0.9, 0.22, 0.05, flat(0x1c5a3a), { yaw: 0.2 });
  K.mb.box(-412.6, 2.98, 41.5, 0.05, 0.22, 0.9, flat(0x1c5a3a), { yaw: 0.2 });
}

// --- H. Lord Aylmer Campus Junior School, 130 avenue Frank-Robinson --------
// Straight across the avenue from 129, which is why it is here: it is the view
// out of Mike's front window. A plain post-war Aylmer elementary — buff brick,
// one storey, big classroom windows, a flat roof, a canopy over the doors and
// an asphalt yard with the paint still on it.
const LA = { id: 68609452 };

function buildLordAylmer(K, ring, tris) {
  const mb = K.mb;
  const brick = 'brick_buff', bt = tint(K, brick, 1.03);
  const rows = [{ y0: 1.25, y1: 3.3, w: 2.4, gap: 0.85, margin: 1.8, mullions: 2, frost: 0.3 }];
  walls(K, ring, 0, 4.4, {
    mat: brick, tint: bt, rows, jamb: 0xb6b0a4, reveal: 0.28, bar: 0x5b5f63,
    frostHex: 0xa9b3ad, glassLo: 0x212a33, glassHi: 0x445d6c,
  }, (i, L) => (L > 8 ? rows : null));
  band(K, ring, tris, 0, 0.7, 0.13, 0x9a5343, 'brick_red');
  band(K, ring, tris, 4.4, 0.7, 0.22, 0xa8a298);
  mb.capPoly(offsetRing(ring, 0.22), tris, 4.4, flat(0x6b6963));
  // the gym end: one taller volume with a clerestory
  const gym = rectRing(-370, 90, 18, 13, 1.474), gt = fanTris(4);
  const clere = [{ y0: 4.6, y1: 5.7, w: 1.7, gap: 0.7, margin: 1.5, mullions: 1, frost: 0.5 }];
  walls(K, gym, 0, 6.6, { mat: brick, tint: tint(K, brick, 0.97), rows: clere,
    jamb: 0xb6b0a4, reveal: 0.24, frostHex: 0xa9b3ad }, (i) => (i % 2 === 0 ? clere : null));
  band(K, gym, gt, 6.6, 0.6, 0.2, 0xa8a298);
  mb.capPoly(offsetRing(gym, 0.2), gt, 6.6, flat(0x6b6963));

  // entrance on the avenue side (east), under a small flat canopy
  const ex = -380.0, ez = 61.0;
  mb.panel(ex - 0.1, 1.2, ez, 2.6, 2.4, -1, 0, flat(0x2c4a3c), null, 0.04);
  canopy(K, ex - 2.2, 3.1, ez, 6.0, 4.4, -Math.PI / 2, 0xd6d1c6, K.detail ? 2 : 0);
  steps(K, ex - 0.2, ez, -1, 0, 4.0, 2, 0.15, 0.45, CONCRETE);
  flagpole(K, -388, 48, 8, 0x1e4fa0);
  bikeRack(K, -389, 76, 1.474, 5);
  dumpster(K, -350, 34, 1.474, 0x3f5a4a);
}

function siteLordAylmer(K) {
  lightStandard(K, -396, 34, 7.5, 1.57);
  crossing(K, -397, 60, 7, 3.0, 1.57, 4);
  K.mb.flatRot(-352, 118, 46, 32, 0.033, 0.1, flat(0x3d4a52));      // the yard
  for (const s of [-1, 1]) K.mb.flatRot(-352 + s * 20, 118, 0.14, 30, 0.037, 0.1, rgb(STRIPE));
  K.mb.flatRot(-352, 118, 44, 0.14, 0.037, 0.1, rgb(STRIPE));
  lot(K, -394, 22, 22, 20, 0.1, { rows: 1 });
  walk(K, -382, 61, -404, 60, 2.2, 0xb0aa9e);
}

// ============================================================ registry
//
// Each site: where it is, how big a sphere it fills (LOD swap + frustum test),
// which OSM footprint it replaces, and its builders. `keepRing` hands the real
// footprint to the builder before it is collapsed.
export const SITES = [
  { key: 'pwhs', cx: 6812, cz: -8028, r: 130, near: HERO_NEAR + 90,
    build: buildPWHS, site: sitePWHS,
    sign: { x: 6800, z: -7954, yaw: 0, w: 7.2, h: 1.7, y: 1.5,
      text: 'PHILEMON WRIGHT HIGH SCHOOL', sub: 'Hadley Junior High · 80, rue Daniel-Johnson',
      board: '#1d3f6e' } },
  { key: 'heritage', cx: 5510, cz: -6790, r: 135, near: HERO_NEAR + 70,
    hide: [{ id: HC.id, at: [5500, -6790], keepRing: true }],
    build: buildHeritage, site: siteHeritage,
    sign: { x: 5578, z: -6906, yaw: -0.95, w: 6.8, h: 1.7, y: 1.7,
      text: 'HERITAGE COLLEGE', sub: 'Boul. de la Cité-des-Jeunes', board: '#7a2230' } },
  { key: 'symmesjr', cx: SJ.cx + 8, cz: SJ.cz, r: 44, near: HERO_NEAR,
    build: buildSymmesJr, site: siteSymmesJr,
    sign: { x: -318, z: 393, yaw: 0, w: 4.4, h: 1.2, y: 1.35,
      text: 'SYMMES JUNIOR HIGH SCHOOL', sub: 'Western Quebec School Board', board: '#20563a' } },
  { key: 'symmesinn', cx: AS.cx, cz: AS.cz + 3, r: 30, near: HERO_NEAR,
    hide: [{ id: AS.id, at: [AS.cx, AS.cz], keepRing: true }],
    build: buildSymmesInn, site: siteSymmesInn,
    sign: { x: -1518, z: -39, yaw: 0, w: 4.2, h: 1.15, y: 1.3,
      text: 'AUBERGE SYMMES', sub: 'Musée · 1831', board: '#6a4a1c' } },
  { key: 'british', cx: BR.cx, cz: BR.cz, r: 32, near: HERO_NEAR,
    hide: [{ id: BR.id, at: [BR.cx, BR.cz], keepRing: true }],
    build: buildBritish, site: siteBritish,
    sign: { x: BR.cx + 13.6, z: BR.cz + 24.0, yaw: BR.yaw + Math.PI / 2, w: 1.8, h: 1.05, y: 4.3,
      text: 'HÔTEL BRITISH', sub: '1834', board: '#3a3540' } },
  { key: 'marina', cx: -1782, cz: -44, r: 48, near: HERO_NEAR,
    build: buildMarina, site: siteMarina,
    sign: { x: -1772, z: -66, yaw: 0.24 + Math.PI, w: 4.2, h: 1.2, y: 1.4,
      text: 'MARINA D’AYLMER', sub: 'Capitainerie · Rampe de mise à l’eau', board: '#1d3f6e' } },
  // A house gets no marquee. The street-name post at the corner is in siteMike.
  { key: 'mike', cx: MK.cx, cz: MK.cz, r: 26, near: HERO_NEAR,
    hide: [{ id: MK.id, at: [MK.cx, MK.cz], keepRing: true }],
    build: buildMike, site: siteMike, sign: null },
  { key: 'lordaylmer', cx: -359.4, cz: 60.3, r: 44, near: HERO_NEAR,
    hide: [{ id: LA.id, at: [-359.4, 60.3], keepRing: true }],
    build: buildLordAylmer, site: siteLordAylmer,
    sign: { x: -391, z: 56, yaw: Math.PI / 2, w: 4.6, h: 1.25, y: 1.35,
      text: 'LORD AYLMER CAMPUS', sub: 'Junior School · 130, av. Frank-Robinson',
      board: '#243a4a' } },
];

// --------------------------------------------------------- footprint removal
//
// world.js draws every entry in MAP.buildings and it is not ours to teach it a
// skip flag this wave, so a hero's OSM footprint is collapsed here instead: the
// entry stays at its index (houses.js seeds every building from its index, so
// removing one would reshuffle the whole town) but shrinks to a 2 cm triangle
// buried inside the hero mesh that replaces it. Seven triangles and three
// zero-length colliders, both of them somewhere no car will ever reach.
const HIDDEN = new Map();      // id -> { ring, tris } for the builder

function hideFootprint(spec) {
  for (let i = 0; i < MAP.buildings.length; i++) {
    const b = MAP.buildings[i];
    if (b.id !== spec.id) continue;
    HIDDEN.set(spec.id, { ring: b.p, tris: b.t, h: b.h, a: b.a, c: b.c.slice() });
    const [x, z] = spec.at;
    b.p = [[x - 0.01, z - 0.01], [x + 0.01, z - 0.01], [x, z + 0.01]];
    b.t = [0, 1, 2];
    b.h = 0.02;
    b.k = 'big';                 // no parapet, no sign board, no punched windows
    delete b.name; delete b.hs; delete b.addr;
    return true;
  }
  return false;
}

export const HIDE_MISSES = [];
for (const s of SITES) {
  for (const h of s.hide || []) if (!hideFootprint(h)) HIDE_MISSES.push(s.key + ':' + h.id);
}

// ------------------------------------------------------------------- places
//
// New destinations, registered from here rather than by editing places.js.
// resolvePlaces() walks Object.keys(PLACES) at world-build time, so an entry
// added at import time gets snapped to its street like any other. `symmes`
// already exists and already says « Auberge Symmes » — it stays a landmark and
// is deliberately NOT relabelled as a school.
PLACES.pwhs = {
  road: 'Rue Daniel-Johnson', x: 6757, z: -7928,
  label: 'Philemon Wright High School, Hull', snap: true, landmark: true,
};
PLACES.symmesjr = {
  x: -310, z: 396,
  label: 'Symmes Junior High, avenue Frank-Robinson', snap: true, lot: true, landmark: true,
};
PLACES.british = {
  road: 'Rue Principale', x: BR.cx, z: BR.cz + 26,
  label: 'Hôtel British, Vieux-Aylmer', snap: true, lot: true, landmark: true,
};

// ============================================================ the bake

// The far bake and the paving are vertex-coloured on purpose: no UVs, no atlas
// rects, a third of the bytes per vertex. This provider hands out the material's
// average colour and refuses to arm a tile.
const PLAIN = {
  tex: null, atlas: false,
  uv() { return null; }, decalUV() { return null; },
  color: (n) => matCol(n),
  tint: (n, k = 1) => matCol(n, k),
  tile(mb) { if (mb) { mb.curRect = null; mb.autoUV = null; } return false; },
  end(mb) { if (mb) { mb.curRect = null; mb.autoUV = null; } return this; },
  wallUV() {},
};

function runBuild(s, K) {
  const hidden = (s.hide && s.hide[0] && HIDDEN.get(s.hide[0].id)) || null;
  if (hidden && s.hide[0].keepRing) s.build(K, hidden.ring, hidden.tris);
  else s.build(K);
}

// Build one site into three MeshBuilders. Pure: no GL, no DOM — the smoke test
// calls it with materials_stub and counts triangles.
export function bakeSite(s, mats) {
  const near = new MeshBuilder(), far = new MeshBuilder(), site = new MeshBuilder();
  runBuild(s, kit(near, mats, true, s.cx, s.cz));
  runBuild(s, kit(far, PLAIN, false, s.cx, s.cz));
  const KS = kit(site, PLAIN, false, s.cx, s.cz);
  s.site(KS);
  if (s.sign) signFrame(KS, s.sign);
  near.finish(); far.finish(); site.finish();
  return { near, far, site };
}

// Colliders. buildWorld keeps `addSegment` to itself, so hero walls register
// here and querySegments is wrapped to merge them in — same {ax,az,bx,bz} shape,
// own object pool so the base function's pool reuse cannot alias them.
function colliderSet() {
  const segs = [], grid = new Map(), pool = [];
  const CELL = 48;
  const key = (i, j) => (i + 1024) * 4096 + (j + 1024);
  function add(ax, az, bx, bz) {
    const idx = segs.length >> 2;
    segs.push(ax, az, bx, bz);
    const i0 = Math.floor(Math.min(ax, bx) / CELL), i1 = Math.floor(Math.max(ax, bx) / CELL);
    const j0 = Math.floor(Math.min(az, bz) / CELL), j1 = Math.floor(Math.max(az, bz) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let a = grid.get(k);
        if (!a) { a = []; grid.set(k, a); }
        a.push(idx);
      }
    }
  }
  function into(out, x, z, r) {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    let n = 0;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = grid.get(key(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const o = arr[k] * 4;
          let s = pool[n];
          if (!s) { s = { ax: 0, az: 0, bx: 0, bz: 0 }; pool[n] = s; }
          s.ax = segs[o]; s.az = segs[o + 1]; s.bx = segs[o + 2]; s.bz = segs[o + 3];
          out.push(s); n++;
        }
      }
    }
    return out;
  }
  return { add, into, get count() { return segs.length >> 2; } };
}

// Walk the site once more with a collider-only kit: walls() calls K.seg per
// edge and nothing else in the kit does, so this costs one throwaway mesh.
export function bakeColliders(s) {
  const col = colliderSet();
  const K = kit(new MeshBuilder(), PLAIN, false, s.cx, s.cz);
  K.seg = col.add;
  runBuild(s, K);
  return col;
}

// ------------------------------------------------------------------- signage
//
// One canvas, one texture, one mesh for every landmark board — the same trick
// signage.js plays for the 120 storefronts, kept separate so a hero sign can run
// to two lines and be sized to its building instead of to a 4:1 fascia slot.
const SIGN_W = 1024, SIGN_H = 128;

// The board a sign hangs on: masonry plinth and posts, or a bracket for the one
// that swings over a sidewalk. In the site mesh, so it is there from the road.
function signFrame(K, g) {
  const nx = -Math.sin(g.yaw), nz = Math.cos(g.yaw);
  if (g.y > 3) {
    K.mb.box(g.x, g.y + g.h / 2, g.z, g.w + 0.12, g.h + 0.12, 0.09, flat(0x2b2f31),
      { yaw: -g.yaw + Math.PI / 2 });
    return;
  }
  K.mb.box(g.x, g.y + g.h / 2, g.z, g.w + 0.3, g.h + 0.3, 0.22, flat(0x8f8a80),
    { yaw: -g.yaw + Math.PI / 2 });
  K.mb.tower(g.x - nx * 0.02, 0, g.z - nz * 0.02, g.w + 0.9, 0.6, g.y, flat(0x9c9488),
    { yaw: -g.yaw + Math.PI / 2, noBottom: true, top: flat(0x8a857b) });
}

function buildSignMesh(renderer) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const boards = SITES.filter((s) => s.sign);
  const cv = document.createElement('canvas');
  cv.width = SIGN_W; cv.height = SIGN_H * boards.length;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const mb = new MeshBuilder();
  mb.textured = true;
  const white = [1, 1, 1];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  boards.forEach((s, i) => {
    const g = s.sign, py = i * SIGN_H;
    ctx.fillStyle = g.board; ctx.fillRect(0, py, SIGN_W, SIGN_H);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, py, SIGN_W, 4);
    ctx.fillStyle = '#f3ead6';
    ctx.font = '700 52px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(g.text, SIGN_W / 2, py + 64, SIGN_W - 40);
    ctx.fillStyle = '#cfc7b2';
    ctx.font = '500 32px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(g.sub, SIGN_W / 2, py + 106, SIGN_W - 60);
    const v0 = (py + 2) / cv.height, v1 = (py + SIGN_H - 2) / cv.height;
    const hw = g.w / 2;
    // Both faces, so a sign reads whichever way you drive past it.
    for (const side of [1, -1]) {
      const nx = -Math.sin(g.yaw) * side, nz = Math.cos(g.yaw) * side;
      const dx = Math.cos(g.yaw) * side, dz = Math.sin(g.yaw) * side;
      const ax = g.x - dx * hw + nx * 0.13, az = g.z - dz * hw + nz * 0.13;
      const bx = g.x + dx * hw + nx * 0.13, bz = g.z + dz * hw + nz * 0.13;
      const b = mb.vert(ax, g.y, az, nx, 0, nz, white, 0.002, v1);
      mb.vert(bx, g.y, bz, nx, 0, nz, white, 0.998, v1);
      mb.vert(bx, g.y + g.h, bz, nx, 0, nz, white, 0.998, v0);
      mb.vert(ax, g.y + g.h, az, nx, 0, nz, white, 0.002, v0);
      mb.tri(b, b + 1, b + 2); mb.tri(b, b + 2, b + 3);
    }
  });
  return { mesh: renderer.upload(mb), tex: renderer.texture(cv) };
}

// ============================================================ install

/**
 * Bake the hero landmarks and hang them off the world buildWorld returned.
 * Called once from main.js, immediately after buildWorld.
 *
 * @param {object} world     what buildWorld returned (draw / querySegments wrapped)
 * @param {object} renderer  core/gl.js Renderer
 * @param {object} mats      the material atlas, or materials_stub
 * @returns {object} stats
 */
export function installLandmarks(world, renderer, mats, opts = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const built = [];
  let nearT = 0, farT = 0, siteT = 0;
  for (const s of SITES) {
    const b = bakeSite(s, mats);
    nearT += b.near.i.length / 3; farT += b.far.i.length / 3; siteT += b.site.i.length / 3;
    built.push({
      key: s.key, cx: s.cx, cz: s.cz, r: s.r, near2: s.near * s.near,
      nearMesh: b.near.empty ? null : renderer.upload(b.near),
      farMesh: b.far.empty ? null : renderer.upload(b.far),
      siteMesh: b.site.empty ? null : renderer.upload(b.site),
      col: bakeColliders(s),
    });
  }
  const signs = buildSignMesh(renderer);
  const couchB = buildCouchMesh();
  couchB.finish();
  const couchMesh = renderer.upload(couchB);
  const couchTris = couchB.i.length / 3;

  // The easter egg's payoff. `say` is optional — without it the couch is simply
  // up there for anyone who looks. The line fires once, from within 26 m, which
  // is close enough that you have stopped to look and far enough that you can
  // still see the whole tree.
  const couch = {
    x: COUCH.x, z: COUCH.z, y: COUCH.y, radius: 26, found: false,
    line: 'LE DIVAN EST ENCORE LÀ-HAUT\n129 Frank-Robinson — personne l’a jamais descendu',
  };

  // ---- collider merge
  const baseQuery = world.querySegments;
  world.querySegments = (x, z, r) => {
    const out = baseQuery(x, z, r);
    for (let i = 0; i < built.length; i++) {
      const b = built[i];
      const dx = b.cx - x, dz = b.cz - z, rr = b.r + r;
      if (dx * dx + dz * dz > rr * rr) continue;
      b.col.into(out, x, z, r);
    }
    return out;
  };

  // ---- draw, after the world so the hero meshes depth-test against it
  const baseDraw = world.draw;
  const nearOpts = { tex: (mats && mats.tex) || null, fogMul: 1 };
  const plainOpts = {};
  const signOpts = { tex: null };
  const stats = { near: 0, far: 0, tris: 0, draws: 0 };
  world.draw = (r, model, x, z, drawDist, dtSec) => {
    baseDraw(r, model, x, z, drawDist, dtSec);
    const dd = drawDist + 160, dd2 = dd * dd;
    stats.near = 0; stats.far = 0; stats.tris = 0; stats.draws = 0;
    for (let i = 0; i < built.length; i++) {
      const b = built[i];
      const dx = b.cx - x, dz = b.cz - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > dd2) continue;
      if (b.siteMesh && r.visible(b.siteMesh)) {
        r.draw(b.siteMesh, model, plainOpts);
        stats.tris += b.siteMesh.count / 3; stats.draws++;
      }
      const isNear = d2 < b.near2 && b.nearMesh;
      const m = isNear ? b.nearMesh : (b.farMesh || b.nearMesh);
      if (m && r.visible(m)) {
        r.draw(m, model, isNear ? nearOpts : plainOpts);
        stats.tris += m.count / 3; stats.draws++;
        if (isNear) stats.near++; else stats.far++;
      }
    }
    if (signs && r.visible(signs.mesh)) {
      signOpts.tex = signs.tex;
      r.draw(signs.mesh, model, signOpts);
      stats.draws++;
    }
    // The couch, drawn only while the flag says it is up there. 154 triangles,
    // its own mesh, so a mission can lift it in and out for free.
    if (LANDMARK_FLAGS.couchInTree && couchMesh) {
      const dx = COUCH.x - x, dz = COUCH.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 420 * 420 && r.visible(couchMesh)) {
        r.draw(couchMesh, model, plainOpts);
        stats.tris += couchTris; stats.draws++;
      }
      if (!couch.found && d2 < couch.radius * couch.radius) {
        couch.found = true;
        if (opts.say) opts.say(couch.line);
      }
    }
  };

  const ms = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) | 0;
  let colliders = 0;
  for (const b of built) colliders += b.col.count;
  // The handle the couch side job should reach for at merge time: flip
  // world.landmarks.flags.couchInTree, and read world.landmarks.couch for where
  // it came to rest.
  world.landmarks = { sites: built, stats, signs, flags: LANDMARK_FLAGS, couch };
  console.log(`landmarks: ${SITES.length} hero sites, ${nearT | 0} near + ${farT | 0} far `
    + `+ ${siteT | 0} paving + ${couchTris} couch tris, ${colliders} colliders — ${ms} ms`);
  return { tris: nearT + farT + siteT + couchTris, near: nearT, far: farT, site: siteT,
    ms, colliders };
}

// ---------------------------------------------------------------------------
// FOLD-BACK LIST — what should move once the wave's file locks come off:
//
//  1. world.js §5 wants a `b.hero` flag so a footprint can be skipped outright
//     instead of collapsed to a 2 cm triangle by hideFootprint() above.
//  2. world.js should export `addSegment` (or take a collider sink) so hero
//     walls register with the real broadphase instead of the shim in
//     colliderSet(); the wrapper costs one extra grid lookup per query.
//  3. places.js should own the pwhs / symmesjr / british entries written above,
//     and main.js's START_POINTS should list 'pwhs' — Hull's west end has no
//     start point and Philemon Wright is the obvious one.
//  4. mapdata is missing Boulevard du Plateau west of x≈2450 and the school at
//     925 boul. du Plateau; the Hull tile clips it. tools/build_hull.py should
//     widen the clip if anyone ever wants Symmes at its modern address.
//  5. signage.js's SKIP set drops 'school'; once these are real buildings the
//     storefront planner could hang their names instead of buildSignMesh().
