// Parametric Aylmer house archetypes (docs/HOUSES.md, Phase 2).
//
// One entry point:
//
//   buildHouse(mb, b, hs, mats, rng, opts) -> { archetype, attrs, tris }
//
// `b`    a mapdata building: { k, h, a, c:[x,z], p:[[x,z]...], t:[i,i,i...], addr? }
// `hs`   Phase 1's per-house attributes, or null (then they are inferred here)
// `mats` a material provider: src/game/materials.js (the real 2048² atlas) or
//        src/game/materials_stub.js (no atlas, vertex colours only). The
//        contract is seven members and is written out in the stub's header.
//        Which one you pass is the whole difference between a textured house
//        and the flat-coloured one the game had before Phase 3 — every call
//        site below works either way:
//          mt.wall() / mt.roof() / mt.base()  arm a tiling material; the next
//            primitive gets world-projected UVs at the tile's real size
//            (MeshBuilder.autoUV) until mt.off()
//          mt.dec(name)                       an alpha-cut decal rect, or null
//          mats.tint(name, k)                 vertex colour UNDER a texture
//            (near-white x k with the atlas, the material's colour without it)
//          mats.color(name)                   the material's own colour, for
//            the untextured trim: concrete, asphalt, porch posts
// `rng`  a seeded 0..1 generator (mulberry32 from core/math.js)
// `opts` { lod, streetYaw, y, index, addSegment, budget }
//
// Everything is appended to the MeshBuilder the caller passes in, so a whole
// chunk of houses ends up in one draw call. No per-house meshes, no state.
//
// FRAME. Metres, +X east, +Z south, +Y up. mapdata angles are
// `atan2(dz, dx)` — 0 is east, growing toward south. MeshBuilder's `yaw` turns
// the other way, so the rule used everywhere below is:
//
//     meshYaw = -mapAngle
//
// The "ridge frame" is the 2-D basis (U, V) with U along the ridge:
//     U = ( cos a,  sin a)      V = (-sin a,  cos a)
//     local -> map:  x = ox + u*ca - v*sa ,  z = oz + u*sa + v*ca
//     map -> local:  u = dx*ca + dz*sa    ,  v = -dx*sa + dz*ca

import { rgb, shade } from '../core/mesh.js';
import { clamp, mulberry32 } from '../core/math.js';

// Decal ladder — must stay between world.js's Y.grass (0) and Y.road (0.05).
const Y_DRIVE = 0.042;
const OUT = 0.045;     // how far decal quads stand off their wall

// ---------------------------------------------------------------- attributes

export const ERAS = ['old', 'midcentury', 'cottage', 'suburban', 'modern'];

// Eave (wall top) height in metres per storey count. mapdata's `h` for a house
// is a random 4.8–6.2 with no real information in it, so unless Phase 1 hands
// over a measured height these numbers decide the silhouette.
const EAVE = { 1: 3.05, 1.5: 3.7, 2: 5.75, 2.5: 6.5, 3: 8.4 };

// Neighbourhood prior. Anchors are centroids of the real streets in MAP (mean
// position of the addressed houses on them), radius is roughly how far that
// character carries. Weights are [old, midcentury, cottage, suburban, modern].
// Only used when Phase 1 has nothing to say about a building.
const HOODS = [
  // Vieux-Aylmer: Principale / Court / Symmes / Thomas / Parker / Brook / Broad
  { x: -1060, z: -500, r: 620, w: [0.60, 0.16, 0.06, 0.14, 0.04] },
  { x: -880, z: -210, r: 300, w: [0.72, 0.10, 0.04, 0.10, 0.04] },
  // Wychwood / Lakeview west: Wychwood, Lord-Aylmer, Frank-Robinson, Elizabeth
  { x: -350, z: 380, r: 780, w: [0.10, 0.56, 0.10, 0.20, 0.04] },
  // Lakeview east / Garden / Vanier
  { x: 2150, z: 200, r: 480, w: [0.06, 0.50, 0.10, 0.28, 0.06] },
  // Deschênes cottages, down by the river to the south-east
  { x: 2259, z: 1059, r: 520, w: [0.10, 0.14, 0.58, 0.14, 0.04] },
  // 70s–90s belt: Wilfrid-Lavigne, John-Egan, de la Colline, des Artisans
  { x: 100, z: -900, r: 760, w: [0.04, 0.16, 0.04, 0.66, 0.10] },
  // Denise-Friend and the pocket west of Wilfrid-Lavigne
  { x: -710, z: -452, r: 260, w: [0.10, 0.14, 0.04, 0.66, 0.06] },
  // Lucerne / Champlain / Fraser / Cochrane / Foley
  { x: 1120, z: 620, r: 700, w: [0.02, 0.14, 0.08, 0.62, 0.14] },
  // 2000s north-west: Terrasse-Eardley, Prentiss, Bourgeau, Louis-Saint-Laurent
  { x: -1350, z: -1330, r: 1150, w: [0.02, 0.04, 0.02, 0.22, 0.70] },
  // 2000s north strip: LaCasse, Adelbert-Dumoulin, De Bruyne, Saint-Maurice
  { x: -100, z: -1560, r: 700, w: [0.02, 0.04, 0.02, 0.22, 0.70] },
  // Plateau "vineyard" streets: Grands-Châteaux, Sancerre, Maucaillou, Buzet
  { x: 620, z: 1000, r: 620, w: [0.02, 0.04, 0.04, 0.20, 0.70] },
  // East new-build: Victor-Beaudry, Arthur-Quesnel, Gérald-Dubois, Norval-Jones
  { x: 1600, z: 400, r: 460, w: [0.02, 0.06, 0.04, 0.24, 0.64] },
  // North-east golf subdivision: de la Croisée, du Tournoi, du Golf
  { x: 1980, z: -940, r: 620, w: [0.02, 0.04, 0.02, 0.20, 0.72] },
];
const HOOD_DEFAULT = [0.10, 0.22, 0.08, 0.42, 0.18];

// Street-name evidence, which beats position when it fires. Aylmer's naming is
// unusually legible: anglophone surnames in the core are 1880–1920, nature
// words are the 50s–60s subdivisions, and the wine/château series is 2000s.
const STREET_ERA = [
  [/Principale|Symmes|Court|Thomas|Parker|Brook|Broad|Conroy|Couvent|Bancroft|Church|Albert|Wharf|Bridge|Front|Patrimoine|Charles|Queen|Kent|Mary|Wilson/i, 'old'],
  [/Wychwood|Lord-Aylmer|Frank-Robinson|Elizabeth|Lake\b|Forest|Woods|Lortie|Chartrand|Ren[eé]-Th[eé]rien|Terrasse\b|Anjou|Elgin|Louisbourg|Garden|Lakeview|Vanier|Belmont|Kennedy/i, 'midcentury'],
  [/Desch[eê]nes|Rivermead|Berge|Plage|Quai/i, 'cottage'],
  [/Lucerne|Champlain|Denise-Friend|Fraser|Cochrane|Foley|Wilfrid-Lavigne|John-Egan|Colline|Artisans|Fondateurs|Corse|Paix|Grand-Calumet|Cal[eè]ches|Lionel-Renaud/i, 'suburban'],
  [/Terrasse-Eardley|Prentiss|Bourgeau|Louis-Saint-Laurent|Coleman|Grand-Hunier|Hautes-Rives|Alexis-Rajotte|[EÉ]douard-Gagnon|LaCasse|Adelbert-Dumoulin|De Bruyne|Saint-Maurice|Paysans|Ch[aâ]teaux|Sancerre|Maucaillou|Parench[eè]re|Buzet|Riesling|Chablis|Victor-Beaudry|Arthur-Quesnel|G[eé]rald-Dubois|Norval-Jones|Guilford-Booth|Crois[eé]e|Tournoi|Golf|Georges-Lebel|Arthur-Graveline|Caveau|Samuel-Edey/i, 'modern'],
];

const ERA_YEAR = { old: 1900, midcentury: 1958, cottage: 1935, suburban: 1982, modern: 2007 };

function polyArea(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

function pointInPoly(p, x, z) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// A deterministic per-building seed. Same building -> same house, every load.
export function houseSeed(b, index = 0) {
  let h = (index * 2654435761) >>> 0;
  h = (h ^ Math.round((b.c[0] + 4096) * 8)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
  h = (h ^ Math.round((b.c[1] + 4096) * 8)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
export function houseRng(b, index = 0) { return mulberry32(houseSeed(b, index)); }

// Era prior at a map position, blended over the anchors.
function eraWeights(x, z, out) {
  const w = out || [0, 0, 0, 0, 0];
  w[0] = w[1] = w[2] = w[3] = w[4] = 0;
  let total = 0;
  for (let i = 0; i < HOODS.length; i++) {
    const h = HOODS[i];
    const dx = x - h.x, dz = z - h.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > h.r * 1.6) continue;
    // 1 at the anchor, 0 at 1.6r — squared so the core of a hood dominates
    const t = clamp(1 - d / (h.r * 1.6), 0, 1);
    const k = t * t;
    for (let e = 0; e < 5; e++) w[e] += h.w[e] * k;
    total += k;
  }
  if (total < 0.15) {
    const k = 0.15 - total;
    for (let e = 0; e < 5; e++) w[e] += HOOD_DEFAULT[e] * k;
    total = 0.15;
  }
  for (let e = 0; e < 5; e++) w[e] /= total;
  return w;
}

const W_TMP = [0, 0, 0, 0, 0];

// Fallback for buildings Phase 1 does not cover: infer era / storeys / link /
// roof from kind + height + footprint + the neighbourhood prior. Deterministic.
export function inferAttrs(b, index = 0) {
  const seed = houseSeed(b, index);
  const r0 = ((seed >>> 8) & 1023) / 1024;
  const r1 = ((seed >>> 18) & 1023) / 1024;
  const r2 = ((seed >>> 3) & 255) / 256;
  const k = b.k;
  const area = polyArea(b.p);

  if (k === 'apartments' || k === 'commercial' || k === 'industrial' || k === 'big'
    || k === 'mall' || k === 'public' || k === 'school' || k === 'church' || k === 'shed') {
    return {
      era: 'modern', year: 1990, storeys: Math.max(1, Math.round(b.h / 3.1)),
      link: 'apartment', roof: 'flat', ridgeYaw: b.a, height: b.h,
      ridgeHeight: b.h + 0.4, garage: 'none', porch: false, source: 'kind',
    };
  }

  // -------- era
  let era = null;
  if (b.addr) {
    for (const [re, e] of STREET_ERA) { if (re.test(b.addr)) { era = e; break; } }
  }
  if (!era) {
    const w = eraWeights(b.c[0], b.c[1], W_TMP);
    let acc = 0;
    era = 'suburban';
    for (let e = 0; e < 5; e++) { acc += w[e]; if (r0 <= acc) { era = ERAS[e]; break; } }
  }
  // Footprint size overrides the prior at the extremes: nobody builds a 40 m²
  // modern two-storey, and a 220 m² footprint is never a Deschênes cottage.
  if (area < 62 && era !== 'old') era = 'cottage';
  if (area > 190 && (era === 'cottage')) era = 'suburban';

  // -------- link
  const ext = obbExtent(b.p, b.c, b.a);
  const w0 = ext.u1 - ext.u0, d0 = ext.v1 - ext.v0;
  const long = Math.max(w0, d0), short = Math.min(w0, d0);
  let link = 'detached';
  if (k === 'terrace') link = long / Math.max(short, 0.1) > 3.4 ? 'row' : 'semi';
  else if (long > 26 && short < 11) link = 'row';
  else if (long > 17 && short < 8.5 && r2 < 0.5) link = 'semi';

  // -------- storeys
  let storeys;
  switch (era) {
    case 'old': storeys = r1 < 0.18 ? 2.5 : (r1 < 0.86 ? 2 : 1.5); break;
    case 'midcentury': storeys = r1 < 0.72 ? 1 : 1.5; break;
    case 'cottage': storeys = r1 < 0.78 ? 1 : 1.5; break;
    case 'suburban': storeys = r1 < 0.30 ? 1 : (r1 < 0.58 ? 1.5 : 2); break;
    default: storeys = r1 < 0.12 ? 1.5 : 2; break;
  }
  if (link === 'row' || link === 'semi') storeys = Math.max(2, storeys);
  if (area < 55) storeys = Math.min(storeys, 1.5);

  // -------- roof
  let roof;
  switch (era) {
    case 'old': roof = r2 < 0.13 ? 'mansard' : 'gable'; break;
    case 'midcentury': roof = r2 < 0.68 ? 'hip' : 'gable'; break;
    case 'cottage': roof = r2 < 0.88 ? 'gable' : 'hip'; break;
    case 'suburban': roof = r2 < 0.58 ? 'gable' : 'hip'; break;
    default: roof = r2 < 0.5 ? 'hip' : 'gable'; break;
  }
  if (link === 'row') roof = r2 < 0.6 ? 'gable' : 'flat';

  // -------- garage
  let garage = 'none';
  const room = long > 13.5;
  switch (era) {
    case 'old': garage = r0 < 0.25 ? 'detached' : 'none'; break;
    case 'midcentury': garage = r0 < 0.34 ? 'carport' : (r0 < 0.62 && room ? 'attached' : 'none'); break;
    case 'cottage': garage = r0 < 0.42 ? 'detached' : 'none'; break;
    case 'suburban': garage = room ? (r0 < 0.78 ? 'attached' : 'detached') : 'none'; break;
    default: garage = room ? 'attached' : 'none'; break;
  }
  if (link === 'row' || link === 'semi') garage = r0 < 0.3 ? 'attached' : 'none';

  const height = EAVE[storeys] * (0.94 + r1 * 0.12);
  const pitch = era === 'old' ? 0.95 : era === 'midcentury' ? 0.42 : 0.62;
  const ridgeHeight = height + clamp(Math.min(short, 11) * 0.5 * pitch, 1.1, 4.2);

  return {
    era, year: ERA_YEAR[era] + Math.round((r1 - 0.5) * 30), storeys, link, roof,
    ridgeYaw: b.a, height, ridgeHeight, garage,
    porch: era === 'old' ? r2 < 0.86 : era === 'cottage' ? r2 < 0.7 : r2 < 0.34,
    source: 'inferred',
  };
}

// Fill the gaps in whatever Phase 1 supplied; never trusts it to be complete.
// Heights are re-derived from the storey count that actually wins, so partial
// attrs ({era, storeys, roof} and nothing else) still give the right silhouette.
// Phase 1 (tools/build_houses.py) ships SHORT keys to keep mapdata small:
//   e era, y year, s storeys, l link, r roof, ry ridgeYaw, h eave height,
//   rh ridge height, g garage, p porch (1 or absent), sr source bitmask.
// Both spellings are accepted so a hand-written attrs object still works.
export function decodeAttrs(hs) {
  if (!hs) return null;
  if (hs.era !== undefined || hs.storeys !== undefined || hs.roof !== undefined) return hs;
  return {
    era: hs.e, year: hs.y, storeys: hs.s, link: hs.l, roof: hs.r,
    ridgeYaw: hs.ry, height: hs.h, ridgeHeight: hs.rh,
    garage: hs.g, porch: hs.p === undefined ? undefined : !!hs.p,
    src: hs.sr,
  };
}

export function normalizeAttrs(b, hs0, index = 0) {
  const base = inferAttrs(b, index);
  const hs = decodeAttrs(hs0);
  if (!hs) return base;
  const out = {
    era: ERAS.indexOf(hs.era) >= 0 ? hs.era : base.era,
    year: Number.isFinite(hs.year) ? hs.year : base.year,
    storeys: EAVE[hs.storeys] !== undefined ? hs.storeys : base.storeys,
    link: hs.link || base.link,
    roof: hs.roof || base.roof,
    ridgeYaw: Number.isFinite(hs.ridgeYaw) ? hs.ridgeYaw : base.ridgeYaw,
    garage: hs.garage || base.garage,
    porch: hs.porch === undefined ? base.porch : !!hs.porch,
    source: 'phase1',
  };
  if (Number.isFinite(hs.height) && hs.height > 1.8) {
    // Trust the measured eave, but keep it inside what the storey count can
    // hold: a LiDAR "eave" is a percentile of the roof surface, and a 12 m
    // bungalow is a tree overhanging the footprint, not a house.
    const nom = EAVE[out.storeys] || EAVE[2];
    out.height = clamp(hs.height, nom * 0.8, nom * 1.45);
  } else if (out.storeys === base.storeys) {
    out.height = base.height;
  } else {
    out.height = EAVE[out.storeys] * (base.height / EAVE[base.storeys]);
  }
  const ext = obbExtent(b.p, b.c, out.ridgeYaw);
  const short = Math.min(ext.u1 - ext.u0, ext.v1 - ext.v0);
  if (Number.isFinite(hs.ridgeHeight) && hs.ridgeHeight > out.height) {
    // LiDAR maxima catch overhanging trees and chimneys, so a "ridge" 6 m above
    // the eave of a bungalow is noise, not a spire: cap the rise at what a 12/12
    // pitch over the short span could actually reach.
    out.ridgeHeight = out.height
      + clamp(hs.ridgeHeight - out.height, 0.8, Math.max(1.4, Math.min(short, 12) * 0.62));
  } else {
    const pitch = out.era === 'old' ? 0.95 : out.era === 'midcentury' ? 0.42 : 0.62;
    out.ridgeHeight = out.height + clamp(Math.min(short, 11) * 0.5 * pitch, 1.1, 4.2);
  }
  return out;
}

// -------------------------------------------------------------- ridge frame

// Oriented bounding rect of a footprint in the frame of `ang`.
function obbExtent(p, c, ang) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let i = 0; i < p.length; i++) {
    const dx = p[i][0] - c[0], dz = p[i][1] - c[1];
    const u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
    if (u < u0) u0 = u; if (u > u1) u1 = u;
    if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  return { u0, u1, v0, v1, ca, sa };
}

// Largest all-true axis-aligned rectangle in a boolean grid (histogram scan).
function largestRect(occ, NU, NV, heights, stack) {
  let best = 0, bu0 = 0, bu1 = -1, bv0 = 0, bv1 = -1;
  for (let i = 0; i < NU; i++) heights[i] = 0;
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) heights[i] = occ[j * NU + i] ? heights[i] + 1 : 0;
    stack.length = 0;
    for (let i = 0; i <= NU; i++) {
      const h = i < NU ? heights[i] : 0;
      let start = i;
      while (stack.length && stack[stack.length - 1][1] >= h) {
        const top = stack.pop();
        const area = top[1] * (i - top[0]);
        if (area > best) { best = area; bu0 = top[0]; bu1 = i - 1; bv0 = j - top[1] + 1; bv1 = j; }
        start = top[0];
      }
      stack.push([start, h]);
    }
  }
  return best > 0 ? { u0: bu0, u1: bu1, v0: bv0, v1: bv1, cells: best } : null;
}

const _heights = new Int32Array(16);
const _stack = [];

// Decompose a footprint into 1–2 rectangles in the ridge frame. Concave and
// L-shaped plans (which in Aylmer almost always mean "house + garage wing")
// come back as two; everything else as one.
export function decompose(p, c, ang) {
  const ext = obbExtent(p, c, ang);
  const W = ext.u1 - ext.u0, D = ext.v1 - ext.v0;
  const full = { u0: ext.u0, u1: ext.u1, v0: ext.v0, v1: ext.v1 };
  if (W < 3 || D < 3) return { ext, rects: [full], fill: 1 };
  const area = polyArea(p);
  const fill = area / (W * D);
  if (fill > 0.93 || p.length <= 4) return { ext, rects: [full], fill };

  const NU = clamp(Math.round(W / 1.4), 3, 14);
  const NV = clamp(Math.round(D / 1.4), 3, 14);
  const du = W / NU, dv = D / NV;
  const occ = new Uint8Array(NU * NV);
  const ca = ext.ca, sa = ext.sa;
  let count = 0;
  for (let j = 0; j < NV; j++) {
    const v = ext.v0 + (j + 0.5) * dv;
    for (let i = 0; i < NU; i++) {
      const u = ext.u0 + (i + 0.5) * du;
      const x = c[0] + u * ca - v * sa, z = c[1] + u * sa + v * ca;
      if (pointInPoly(p, x, z)) { occ[j * NU + i] = 1; count++; }
    }
  }
  if (count < 2) return { ext, rects: [full], fill };
  if (_heights.length < NU) return { ext, rects: [full], fill };

  const toM = (r) => ({
    u0: ext.u0 + r.u0 * du, u1: ext.u0 + (r.u1 + 1) * du,
    v0: ext.v0 + r.v0 * dv, v1: ext.v0 + (r.v1 + 1) * dv,
  });
  const r1 = largestRect(occ, NU, NV, _heights, _stack);
  if (!r1) return { ext, rects: [full], fill };
  for (let j = r1.v0; j <= r1.v1; j++) for (let i = r1.u0; i <= r1.u1; i++) occ[j * NU + i] = 0;
  const r2 = largestRect(occ, NU, NV, _heights, _stack);
  const rects = [toM(r1)];
  if (r2 && r2.cells >= Math.max(2, r1.cells * 0.16)) rects.push(toM(r2));
  return { ext, rects, fill };
}

// Clip a map-space segment against a rect in the ridge frame; returns the
// parameter interval [tIn, tOut] inside it, or null.
function clipToRect(ax, az, bx, bz, ox, oz, ca, sa, r) {
  const au = (ax - ox) * ca + (az - oz) * sa, av = -(ax - ox) * sa + (az - oz) * ca;
  const bu = (bx - ox) * ca + (bz - oz) * sa, bv = -(bx - ox) * sa + (bz - oz) * ca;
  let t0 = 0, t1 = 1;
  const slab = (p0, p1, lo, hi) => {
    const d = p1 - p0;
    if (Math.abs(d) < 1e-9) return p0 >= lo && p0 <= hi;
    let ta = (lo - p0) / d, tb = (hi - p0) / d;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    return t0 < t1;
  };
  if (!slab(au, bu, r.u0, r.u1)) return null;
  if (!slab(av, bv, r.v0, r.v1)) return null;
  if (t1 - t0 < 1e-4) return null;
  return [clamp(t0, 0, 1), clamp(t1, 0, 1)];
}

// ------------------------------------------------------------- street facing

// Uniform grid over the road network. `index(x, z)` gives the map-angle of the
// direction from (x, z) toward the nearest road — the house's street side.
export function makeStreetYawIndex(roads, cell = 64) {
  const grid = new Map();
  const seg = [];
  const key = (i, j) => (i + 4096) * 8192 + (j + 4096);
  for (const road of roads) {
    const pts = road.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
      const idx = seg.length / 4;
      seg.push(ax, az, bx, bz);
      const i0 = Math.floor(Math.min(ax, bx) / cell), i1 = Math.floor(Math.max(ax, bx) / cell);
      const j0 = Math.floor(Math.min(az, bz) / cell), j1 = Math.floor(Math.max(az, bz) / cell);
      for (let ii = i0; ii <= i1; ii++) {
        for (let jj = j0; jj <= j1; jj++) {
          const k = key(ii, jj);
          let a = grid.get(k);
          if (!a) { a = []; grid.set(k, a); }
          a.push(idx);
        }
      }
    }
  }
  return function streetYawAt(x, z, fallback = 0) {
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    let best = Infinity, bx = 0, bz = 0;
    for (let ring = 0; ring <= 3; ring++) {
      for (let i = ci - ring; i <= ci + ring; i++) {
        for (let j = cj - ring; j <= cj + ring; j++) {
          if (ring > 0 && Math.abs(i - ci) !== ring && Math.abs(j - cj) !== ring) continue;
          const arr = grid.get(key(i, j));
          if (!arr) continue;
          for (let n = 0; n < arr.length; n++) {
            const o = arr[n] * 4;
            const ax = seg[o], az = seg[o + 1];
            const dx = seg[o + 2] - ax, dz = seg[o + 3] - az;
            const l2 = dx * dx + dz * dz;
            let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
            t = clamp(t, 0, 1);
            const px = ax + t * dx - x, pz = az + t * dz - z;
            const d2 = px * px + pz * pz;
            if (d2 < best) { best = d2; bx = px; bz = pz; }
          }
        }
      }
      if (best < Infinity && ring >= 1) break;
    }
    if (best === Infinity || best < 1e-6) return fallback;
    return Math.atan2(bz, bx);
  };
}

// Which of the four rect faces looks at the street. Returns
// { axis: 'u'|'v', sign: +1|-1, nx, nz, yaw } with (nx,nz) the outward normal.
function frontFace(ang, streetYaw) {
  const cands = [
    ['u', 1, ang], ['u', -1, ang + Math.PI],
    ['v', 1, ang + Math.PI / 2], ['v', -1, ang - Math.PI / 2],
  ];
  let best = -2, out = cands[3];
  for (const cd of cands) {
    const d = Math.cos(cd[2] - streetYaw);
    if (d > best) { best = d; out = cd; }
  }
  return { axis: out[0], sign: out[1], yaw: out[2], nx: Math.cos(out[2]), nz: Math.sin(out[2]) };
}

// ------------------------------------------------------------- material recipes

function pick(arr, r) { return arr[Math.min(arr.length - 1, (r * arr.length) | 0)]; }
// Vertex-colour jitter so neighbours differ even before the atlas lands.
function jitter(c, k) { return [clamp(c[0] * k, 0, 1), clamp(c[1] * k, 0, 1), clamp(c[2] * k, 0, 1)]; }

const SHINGLE = ['shingle_dark', 'shingle_dark', 'shingle_grey', 'shingle_brown'];

// ---------------------------------------------------------------- materials
//
// Every surface goes out one of three ways, and all three work with or without
// an atlas (materials_stub.js answers "no" to everything, and the vertex colours
// alone are then exactly what the game looked like before Phase 3):
//
//   tiled     mt.wall() / mt.roof() / mt.base() arm a material on the builder;
//             whatever primitive runs next gets UVs projected from world space
//             at the tile's real size (mesh.js autoUV). Close with mt.off().
//   decal     mt.off() then mb.panel(..., mt.dec('window_2pane'), OUT) — an
//             absolute-UV, alpha-cut quad standing OUT metres proud of the wall.
//   plain     vertex colour only: trim, concrete, asphalt, glass fallbacks.
//
// Vertex colours are TINTS under a texture (mats.tint -> near-white × jitter) and
// the material's own colour without one (mats.tint -> mats.color × jitter), so
// the same call site is right either way.

// Tiles and per-house colour jitter, drawn from `rng` in a FIXED order so that
// the near (lod 0) and far (lod 2) bakes — separate builders, same seed — agree
// on what a given house looks like.
function recipe(spec, mats, rng) {
  const wallTile = pick(spec.wall, rng());
  const wallK = 0.9 + rng() * 0.2;
  const baseTile = spec.base ? pick(spec.base, rng()) : null;
  const baseK = 0.92 + rng() * 0.16;
  const roofTile = pick(spec.roofTiles, rng());
  const roofK = 0.88 + rng() * 0.22;
  return {
    wallTile, baseTile, roofTile,
    wall: mats.tint(wallTile, wallK),
    base: baseTile ? mats.tint(baseTile, baseK) : null,
    roof: mats.tint(roofTile, roofK),
    // Per-house pattern offset: without it every wall on the street starts its
    // brick on the same half-course and the row reads as one long building.
    uOff: rng() * 8,
  };
}

// The per-house arming kit. `M` is the projection origin — the building centre,
// so the repeat counts stay small and fract() in the shader stays exact.
function matKit(mb, mats, R, cx, cz) {
  const M = { ox: cx, oy: 0, oz: cz, uOffset: R.uOff };
  const mt = {
    M,
    wall: () => mats.tile(mb, R.wallTile, M),
    roof: () => mats.tile(mb, R.roofTile, M),
    base: () => (R.baseTile ? mats.tile(mb, R.baseTile, M) : mats.end(mb)),
    named: (name) => mats.tile(mb, name, M),
    off: () => mats.end(mb),
    dec: (name) => mats.decalUV(name),
    col: (name) => mats.color(name),
    tint: (name, k) => mats.tint(name, k),
  };
  // Handed to MeshBuilder.roof: the two gable-end triangles of a roof prism are
  // wall, not shingle, so the armed material swaps for them.
  mt.gable = { gableCol: R.wall, onGable: mt.wall };
  return mt;
}

// Per-archetype recipe: which atlas tiles the walls, base course and roof draw
// from, and what the extras are. `p*` fields are probabilities against rng().
const SPECS = {
  old_2s_gable_brick: {
    era: 'old', storeys: 2, link: 'detached', roof: 'gable',
    wall: ['brick_red', 'brick_red', 'brick_brown', 'clapboard_white', 'clapboard_yellow'],
    base: null, roofTiles: ['shingle_dark', 'shingle_grey'],
    pitch: 1.05, overhang: 0.25, porch: 'full', chimney: 1, pChimney2: 0.3,
    winW: 0.85, winH: 1.85, winTile: 'window_2pane', door: 'door_wood',
    bay: 0, dormers: 0, garageBays: 1, setback: 4,
  },
  old_25s_mansard: {
    era: 'old', storeys: 2.5, link: 'detached', roof: 'mansard',
    wall: ['brick_red', 'brick_brown', 'clapboard_white'],
    base: null, roofTiles: ['shingle_dark', 'shingle_grey'],
    pitch: 1.15, overhang: 0.3, porch: 'full', chimney: 1, pChimney2: 0.45,
    winW: 0.85, winH: 1.8, winTile: 'window_2pane', door: 'door_wood',
    bay: 0, dormers: 2, garageBays: 1, setback: 4,
  },
  old_2s_semi: {
    era: 'old', storeys: 2, link: 'semi', roof: 'gable',
    wall: ['brick_red', 'brick_brown', 'clapboard_white'],
    base: null, roofTiles: ['shingle_dark', 'shingle_grey'],
    pitch: 0.95, overhang: 0.25, porch: 'small', chimney: 1, pChimney2: 0,
    winW: 0.85, winH: 1.8, winTile: 'window_2pane', door: 'door_wood',
    bay: 0, dormers: 0, garageBays: 1, setback: 4, units: 2,
  },
  mid_bungalow_hip: {
    era: 'midcentury', storeys: 1, link: 'detached', roof: 'hip',
    wall: ['brick_buff', 'brick_red', 'brick_brown', 'stone_beige'],
    base: null, roofTiles: SHINGLE,
    pitch: 0.40, overhang: 0.75, porch: 'stoop', chimney: 0.8, pChimney2: 0,
    winW: 1.25, winH: 1.25, winTile: 'window_2pane', door: 'door_white',
    bay: 0, picture: 1, dormers: 0, garageBays: 1, setback: 7,
  },
  mid_bungalow_gable: {
    era: 'midcentury', storeys: 1, link: 'detached', roof: 'gable',
    wall: ['brick_buff', 'brick_red', 'vinyl_beige', 'vinyl_white'],
    base: null, roofTiles: SHINGLE,
    pitch: 0.50, overhang: 0.6, porch: 'stoop', chimney: 0.7, pChimney2: 0,
    winW: 1.25, winH: 1.25, winTile: 'window_2pane', door: 'door_white',
    bay: 0, picture: 1, dormers: 0, garageBays: 1, setback: 7,
  },
  mid_15s_dormer: {
    era: 'midcentury', storeys: 1.5, link: 'detached', roof: 'gable',
    wall: ['brick_buff', 'brick_red', 'clapboard_white', 'vinyl_beige'],
    base: null, roofTiles: SHINGLE,
    pitch: 0.85, overhang: 0.5, porch: 'stoop', chimney: 0.8, pChimney2: 0,
    winW: 1.1, winH: 1.3, winTile: 'window_2pane', door: 'door_white',
    bay: 0, dormers: 2, garageBays: 1, setback: 7,
  },
  cottage_1s_gable: {
    era: 'cottage', storeys: 1, link: 'detached', roof: 'gable',
    wall: ['clapboard_white', 'clapboard_yellow', 'vinyl_white', 'vinyl_green', 'vinyl_blue'],
    base: null, roofTiles: ['shingle_dark', 'shingle_brown', 'shingle_grey'],
    pitch: 0.80, overhang: 0.35, porch: 'small', chimney: 0.5, pChimney2: 0,
    winW: 0.95, winH: 1.15, winTile: 'window_small', door: 'door_wood',
    bay: 0, dormers: 0, garageBays: 1, shed: 1, setback: 5,
  },
  cottage_15s_gable: {
    era: 'cottage', storeys: 1.5, link: 'detached', roof: 'gable',
    wall: ['clapboard_white', 'clapboard_yellow', 'vinyl_green', 'cedar'],
    base: null, roofTiles: ['shingle_dark', 'shingle_brown'],
    pitch: 0.95, overhang: 0.35, porch: 'small', chimney: 0.6, pChimney2: 0,
    winW: 0.95, winH: 1.2, winTile: 'window_small', door: 'door_wood',
    bay: 0, dormers: 1, garageBays: 1, shed: 1, setback: 5,
  },
  sub_split: {
    era: 'suburban', storeys: 1.5, link: 'detached', roof: 'gable',
    wall: ['vinyl_beige', 'vinyl_white', 'vinyl_grey', 'vinyl_blue'],
    base: ['brick_red', 'brick_brown', 'brick_buff'], baseH: 1.5,
    roofTiles: SHINGLE,
    pitch: 0.55, overhang: 0.45, porch: 'stoop', chimney: 0.5, pChimney2: 0,
    winW: 1.15, winH: 1.25, winTile: 'window_2pane', door: 'door_white',
    bay: 1, dormers: 0, garageBays: 1, split: 1, setback: 8,
  },
  sub_2s_colonial: {
    era: 'suburban', storeys: 2, link: 'detached', roof: 'gable',
    wall: ['vinyl_white', 'vinyl_beige', 'vinyl_grey', 'vinyl_blue', 'vinyl_green'],
    base: ['brick_red', 'brick_brown', 'brick_buff'], baseH: 2.6,
    roofTiles: SHINGLE,
    pitch: 0.62, overhang: 0.45, porch: 'stoop', chimney: 0.55, pChimney2: 0,
    winW: 1.1, winH: 1.35, winTile: 'window_2pane', door: 'door_white',
    bay: 1, dormers: 0, garageBays: 1, setback: 8,
  },
  sub_bungalow_hip: {
    era: 'suburban', storeys: 1, link: 'detached', roof: 'hip',
    wall: ['brick_brown', 'brick_buff', 'vinyl_beige', 'vinyl_grey'],
    base: null, roofTiles: SHINGLE,
    pitch: 0.45, overhang: 0.55, porch: 'stoop', chimney: 0.45, pChimney2: 0,
    winW: 1.2, winH: 1.25, winTile: 'window_2pane', door: 'door_white',
    bay: 1, dormers: 0, garageBays: 1, setback: 8,
  },
  mod_2s_stone: {
    era: 'modern', storeys: 2, link: 'detached', roof: 'hip',
    wall: ['vinyl_beige', 'vinyl_grey', 'vinyl_white', 'stucco'],
    base: ['stone_grey', 'stone_beige'], baseH: 3.0,
    roofTiles: ['shingle_dark', 'shingle_grey', 'shingle_brown'],
    pitch: 0.60, overhang: 0.55, porch: 'stoop', chimney: 0.3, pChimney2: 0,
    winW: 1.25, winH: 1.45, winTile: 'window_2pane', door: 'door_white',
    bay: 0, dormers: 0, garageBays: 2, setback: 9,
  },
  mod_2s_gable: {
    era: 'modern', storeys: 2, link: 'detached', roof: 'gable',
    wall: ['vinyl_grey', 'vinyl_beige', 'stucco', 'vinyl_white'],
    base: ['stone_grey', 'stone_beige', 'brick_brown'], baseH: 3.0,
    roofTiles: ['shingle_dark', 'shingle_grey'],
    pitch: 0.72, overhang: 0.5, porch: 'stoop', chimney: 0.3, pChimney2: 0,
    winW: 1.25, winH: 1.45, winTile: 'window_2pane', door: 'door_white',
    bay: 1, dormers: 0, garageBays: 2, setback: 9,
  },
  row_terrace: {
    era: 'suburban', storeys: 2, link: 'row', roof: 'gable',
    wall: ['brick_red', 'brick_brown', 'vinyl_beige', 'vinyl_white', 'vinyl_grey'],
    base: null, roofTiles: SHINGLE,
    pitch: 0.55, overhang: 0.3, porch: 'stoop', chimney: 0.25, pChimney2: 0,
    winW: 1.05, winH: 1.3, winTile: 'window_2pane', door: 'door_white',
    bay: 0, dormers: 0, garageBays: 1, row: 1, setback: 6,
  },
};

export const ARCHETYPES = Object.keys(SPECS);

export function archetypeOf(hs) {
  if (hs.link === 'apartment') return 'flat_block';
  if (hs.link === 'row') return 'row_terrace';
  if (hs.link === 'semi') return hs.era === 'old' ? 'old_2s_semi' : 'row_terrace';
  switch (hs.era) {
    case 'old': return hs.roof === 'mansard' ? 'old_25s_mansard' : 'old_2s_gable_brick';
    case 'midcentury':
      if (hs.storeys >= 1.5) return 'mid_15s_dormer';
      return hs.roof === 'hip' ? 'mid_bungalow_hip' : 'mid_bungalow_gable';
    case 'cottage': return hs.storeys >= 1.5 ? 'cottage_15s_gable' : 'cottage_1s_gable';
    case 'suburban':
      if (hs.storeys >= 2) return 'sub_2s_colonial';
      if (hs.storeys >= 1.5) return 'sub_split';
      return 'sub_bungalow_hip';
    default:
      return hs.roof === 'gable' ? 'mod_2s_gable' : 'mod_2s_stone';
  }
}

// --------------------------------------------------------------- plain builder

// What world.js does today: extrude the footprint, cap it, gable or parapet.
// Used for apartments / commercial / anything not a house, and for lod 2.
export function buildPlain(mb, b, mats, rng, opts = {}) {
  const y0 = opts.y || 0;
  const gable = opts.gable !== undefined ? opts.gable
    : (b.k === 'house' || b.k === 'terrace' || b.k === 'shed');
  const h = opts.h || b.h;
  // `mt` (from a caller that already drew the recipe) keeps the far LOD in the
  // same materials as the near one; without it, pick a plausible pair here.
  const mt = opts.mt || null;
  const wallTile = opts.wallTile || (b.k === 'house' ? 'vinyl_beige' : 'stucco');
  const wallCol = opts.wall || mats.tint(wallTile, 0.88 + rng() * 0.24);
  if (mt) mt.wall(); else mats.tile(mb, wallTile, { ox: b.c[0], oz: b.c[1] });
  mb.prism(b.p, y0, h, wallCol, { onEdge: opts.addSegment });
  if (gable) {
    const roofTile = opts.roofTile || pick(SHINGLE, rng());
    const roofCol = opts.roofCol || mats.tint(roofTile, 0.9 + rng() * 0.2);
    if (mt) mt.roof(); else mats.tile(mb, roofTile, { ox: b.c[0], oz: b.c[1] });
    mb.capPoly(b.p, b.t, y0 + h, roofCol);
    const e = obbExtent(b.p, b.c, b.a);
    const ew = e.u1 - e.u0, ed = e.v1 - e.v0;
    const cu = (e.u0 + e.u1) / 2, cv = (e.v0 + e.v1) / 2;
    const gx = b.c[0] + cu * e.ca - cv * e.sa, gz = b.c[1] + cu * e.sa + cv * e.ca;
    mb.roof(gx, y0 + h, gz, ew, ed, clamp(0.35 * ed, 1.6, 3.2), roofCol, -b.a, 0.4,
      mt ? mt.gable : null);
  } else {
    mats.end(mb);
    const flat = mats.color('flat');
    const rc = [flat[0] * 0.46, flat[1] * 0.45, flat[2] * 0.42];
    mb.capPoly(b.p, b.t, y0 + h, rc);
  }
  mats.end(mb);
}

// --------------------------------------------------------------------- houses

const PORCH_D = 2.1;

export function buildHouse(mb, b, hs, mats, rng, opts = {}) {
  const lod = opts.lod | 0;
  const y0 = opts.y || 0;
  const attrs = normalizeAttrs(b, hs, opts.index || 0);
  const id = archetypeOf(attrs);
  const t0 = mb.i.length;

  if (id === 'flat_block') {
    buildPlain(mb, b, mats, rng, { y: y0, addSegment: opts.addSegment });
    return { archetype: 'flat_block', attrs, tris: (mb.i.length - t0) / 3 };
  }
  const spec = SPECS[id];
  // The recipe is drawn first at EVERY lod, from the same rng draws, so the far
  // silhouette wears the same brick and shingle as the near one.
  const R = recipe(spec, mats, rng);
  const mt = matKit(mb, mats, R, b.c[0], b.c[1]);
  if (lod >= 2) {
    buildPlain(mb, b, mats, rng, {
      y: y0, h: attrs.height, gable: attrs.roof !== 'flat',
      wall: R.wall, roofCol: R.roof, wallTile: R.wallTile, roofTile: R.roofTile, mt,
      addSegment: opts.addSegment,
    });
    return { archetype: id, attrs, tris: (mb.i.length - t0) / 3 };
  }

  const detail = lod === 0;
  // Hard triangle budget. Everything structural (walls, caps, roofs, garage
  // door, driveway) is unconditional; the trimmings below check `room()` in
  // priority order and drop off the end of a fat footprint rather than blowing
  // the budget. Deterministic — it only ever looks at what has been emitted.
  const cap = Number.isFinite(opts.budget) ? opts.budget : 140;
  const spent = () => (mb.i.length - t0) / 3;
  // 6 reserved for the three quads that are never optional: front door,
  // garage door, driveway. (A footprint with enough edges to blow the budget on
  // walls alone still will — nothing optional is left to drop by then.)
  const room = (n) => spent() + n <= cap - 6;

  const ang = attrs.ridgeYaw;
  const yaw = -ang;                       // MeshBuilder yaw for the ridge frame
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const ox = b.c[0], oz = b.c[1];
  const L2M = (u, v) => [ox + u * ca - v * sa, oz + u * sa + v * ca];

  const dec = decompose(b.p, b.c, ang);
  const ext = dec.ext;
  const streetYaw = Number.isFinite(opts.streetYaw) ? opts.streetYaw : -ang;
  const front = frontFace(ang, streetYaw);

  // ---- colours (seeded, so a street reads as a street and not a paint chart)
  const wallTile = R.wallTile, baseTile = R.baseTile;
  const wallCol = R.wall, baseCol = R.base, roofCol = R.roof;
  const trimCol = mats.color('trim');
  // Decals carry their own glass and paint, so under the atlas the vertex colour
  // is only a tint; without it, it is the whole window.
  const winCol = mats.tint(spec.winTile, 1);
  const doorCol = mats.tint(spec.door, 0.9 + rng() * 0.2);
  const conc = mats.color('concrete');
  const asphalt = mats.color('asphalt');
  const uvWin = mats.decalUV(spec.winTile), uvDoor = mats.decalUV(spec.door);

  const eave = attrs.height;
  const roofRise = Math.max(0.8, attrs.ridgeHeight - attrs.height);

  // ---- garage wing. Either the small half of an L-shaped plan, or a strip
  // carved off the frontage of a single rectangle. Real Aylmer garages sit at
  // one end of the front, one storey lower than the house.
  let main = dec.rects[0];
  let wing = dec.rects[1] || null;
  const wantGarage = attrs.garage === 'attached' || attrs.garage === 'carport';
  const bays = spec.garageBays || 1;
  let garageRect = null;

  if (wing) {
    const aMain = (main.u1 - main.u0) * (main.v1 - main.v0);
    const aWing = (wing.u1 - wing.u0) * (wing.v1 - wing.v0);
    if (aWing > aMain) { const t = main; main = wing; wing = t; }
    if (wantGarage && aWing < aMain * 0.75 && aWing > 14) garageRect = wing;
  }
  if (!garageRect && wantGarage) {
    // carve a full-depth strip off the end of the frontage
    const along = front.axis === 'v' ? 'u' : 'v';
    const lo = along === 'u' ? main.u0 : main.v0, hi = along === 'u' ? main.u1 : main.v1;
    const span = hi - lo;
    const gw = clamp(bays === 2 ? 6.4 : 3.6, 3.0, span - 6.0);
    if (gw >= 3.0 && span - gw >= 6.0) {
      const atHi = rng() < 0.5;
      garageRect = { u0: main.u0, u1: main.u1, v0: main.v0, v1: main.v1 };
      if (along === 'u') {
        if (atHi) { garageRect.u0 = hi - gw; main = { ...main, u1: hi - gw }; }
        else { garageRect.u1 = lo + gw; main = { ...main, u0: lo + gw }; }
      } else {
        if (atHi) { garageRect.v0 = hi - gw; main = { ...main, v1: hi - gw }; }
        else { garageRect.v1 = lo + gw; main = { ...main, v0: lo + gw }; }
      }
    }
  }
  const carport = attrs.garage === 'carport' && !!garageRect;
  const garageEave = clamp(eave - (attrs.storeys >= 2 ? 2.5 : 0.55), 2.5, eave);

  // ---- walls: the real footprint, stepped down over the garage wing
  const wallRect = garageRect;
  mt.wall();
  emitWalls(mb, b, y0, eave, garageEave, wallRect, ox, oz, ca, sa, wallCol, opts.addSegment);

  // Cap the plan at the garage height (hidden inside the house, closes the wing).
  mt.roof();
  mb.capPoly(b.p, b.t, y0 + (wallRect ? garageEave : eave), roofCol);

  // ---- roofs, one per rect, on the real footprint's oriented rectangles
  roofOn(mb, main, L2M, yaw, y0 + eave, roofRise, attrs.roof, spec, roofCol, mt);
  if (wing && wing !== garageRect) {
    roofOn(mb, wing, L2M, yaw, y0 + eave, roofRise * 0.8, attrs.roof, spec, roofCol, mt);
  }
  if (garageRect) {
    roofOn(mb, garageRect, L2M, yaw, y0 + garageEave, Math.max(0.7, roofRise * 0.65),
      carport ? 'flat' : (attrs.roof === 'flat' ? 'gable' : attrs.roof), spec, roofCol, mt);
  }
  mt.off();

  // ---- brick / stone base course on the visible faces
  if (baseCol && detail && room(8)) {
    const bh = Math.min(spec.baseH, eave - 0.4);
    mt.base();
    faceBand(mb, main, L2M, y0 + bh / 2, bh, baseCol, null, front, true);
    mt.off();
  }

  // ---- front elements
  const habitable = wing && wing !== garageRect ? [main, wing] : [main];
  const fw = frontFaceOf(habitable, L2M, front);
  const doorSide = spec.row ? 0 : (rng() - 0.5) * fw.len * 0.42;
  const dx0 = fw.cx + fw.tx * doorSide, dz0 = fw.cz + fw.tz * doorSide;

  if (detail) {
    // door + steps first — a house without a front door reads as a warehouse
    mb.panel(dx0, y0 + 1.12, dz0, 0.98, 2.15, front.nx, front.nz, doorCol, uvDoor, OUT);
    // front step: local +X is the outward normal, so wBot is the tread depth
    if (room(10)) {
      mb.tower(dx0 + front.nx * 0.7, y0, dz0 + front.nz * 0.7, 1.3, 1.9, 0.19, conc,
        { yaw: -front.yaw, noBottom: true });
    }

    // porch (the single most era-defining thing on an old Aylmer house)
    if (attrs.porch && spec.porch === 'full' && room(48)) {
      porch(mb, fw, front, y0, eave, Math.min(fw.len, 9), trimCol, roofCol, mt);
    } else if (attrs.porch && spec.porch === 'small' && room(30)) {
      porch(mb, { ...fw, cx: dx0, cz: dz0, len: 3.0 }, front, y0, Math.min(eave, 3.1),
        3.0, trimCol, roofCol, mt);
    }

    // windows, per storey, along every face longer than 3 m
    const storeys = Math.max(1, Math.round(attrs.storeys));
    const wBudget = Math.max(2, Math.floor((cap - 8 - spent()) / 2));
    let placed = windows(mb, main, L2M, y0, eave, storeys, spec, winCol, uvWin, front,
      Math.min(14, wBudget));
    for (const r of habitable) {
      if (r === main) continue;
      placed += windows(mb, r, L2M, y0, eave, storeys, spec, winCol, uvWin, front,
        Math.max(0, Math.min(4, wBudget - placed)));
    }

    // picture window (midcentury) / bay window (suburban). The wide 'window_bay'
    // decal is the right shape for a picture window; fall back to the sash one.
    if (spec.picture && room(2)) {
      const px = fw.cx - fw.tx * fw.len * 0.22, pz = fw.cz - fw.tz * fw.len * 0.22;
      const uvPic = mats.decalUV('window_bay') || uvWin;
      mb.panel(px, y0 + 1.75, pz, Math.min(3.0, fw.len * 0.42), 1.5,
        front.nx, front.nz, winCol, uvPic, OUT);
    }
    if (spec.bay && fw.len > 7.5 && room(12)) {
      // bay: local +X is the outward normal, so wBot is how far it projects
      const px = fw.cx - fw.tx * fw.len * 0.26, pz = fw.cz - fw.tz * fw.len * 0.26;
      mb.tower(px + front.nx * 0.28, y0 + 0.85, pz + front.nz * 0.28, 0.62, 2.5, 1.65,
        jitter(mats.color(spec.winTile), 1.1), { yaw: -front.yaw, noBottom: true, top: trimCol });
      // glazing on the front of the box, or it reads as a packing crate
      const uvBay = mats.decalUV('window_bay') || uvWin;
      mb.panel(px + front.nx * 0.59, y0 + 1.7, pz + front.nz * 0.59, 2.2, 1.35,
        front.nx, front.nz, winCol, uvBay, OUT);
    }

    // dormers on the street slope
    if (spec.dormers && room(12 * spec.dormers)) {
      dormers(mb, main, L2M, yaw, y0 + eave, roofRise, spec.dormers,
        front, wallCol, roofCol, winCol, uvWin, mt);
    }

    // chimney
    if (rng() < spec.chimney && room(10)) {
      const cu = (main.u0 + main.u1) / 2 + (main.u1 - main.u0) * 0.30;
      const cv = (main.v0 + main.v1) / 2 - (main.v1 - main.v0) * 0.18;
      const pm = L2M(cu, cv);
      const brickTile = spec.era === 'old' ? 'brick_red' : 'brick_brown';
      mt.named(brickTile);
      mb.tower(pm[0], y0 + eave - 0.6, pm[1], 0.78, 0.68, roofRise + 1.25,
        mats.tint(brickTile, 1), { yaw, noBottom: true, top: shade(0x2a2a2a, 1) });
      mt.off();
    }

    // detached shed / garage in the back yard
    if ((attrs.garage === 'detached' || spec.shed) && room(16)) {
      backShed(mb, ext, L2M, yaw, y0, front, wallCol, roofCol,
        attrs.garage === 'detached' ? 'garage' : 'shed', mats, rng, mt);
    }
  }

  // ---- garage door + driveway (kept at lod 1: they read from a long way off)
  if (garageRect) {
    const gf = faceOf(garageRect, L2M, front);
    const gdName = bays === 2 ? 'garage_door_2' : 'garage_door_1';
    const gdCol = mats.tint(gdName, 0.95 + rng() * 0.1);
    const gdUV = mats.decalUV(gdName);
    const gw = Math.min(bays === 2 ? 5.2 : 3.0, gf.len - 0.7);
    if (!carport && gw > 1.6 && detail) {
      mb.panel(gf.cx, y0 + 1.12, gf.cz, gw, 2.15, front.nx, front.nz, gdCol, gdUV, OUT);
    }
    if (carport && detail) {
      // two posts and a flat lid instead of a door
      for (const s of [-1, 1]) {
        const px = gf.cx + gf.tx * gf.len * 0.42 * s + front.nx * 2.2;
        const pz = gf.cz + gf.tz * gf.len * 0.42 * s + front.nz * 2.2;
        mb.post(px, y0, pz, 0.16, garageEave - 0.2, trimCol, yaw);
      }
    }
    driveway(mb, gf, front, y0, Math.max(3.0, Math.min(bays === 2 ? 6.0 : 3.4, gf.len)),
      (spec.setback || 7) + 2, asphalt);
  } else if (attrs.garage === 'detached' && detail) {
    driveway(mb, fw, front, y0, 3.2, (spec.setback || 7) + 2, asphalt);
  }

  // ---- row / semi: mirrored units with their own colour, door and windows
  if ((spec.row || spec.units) && detail) {
    rowUnits(mb, main, L2M, y0, eave, front, spec, mats, rng, room, mt);
  }

  // Never leave a material armed: the next thing in this chunk is somebody
  // else's road, and it has to come out of the white 'flat' tile untouched.
  mt.off();
  return { archetype: id, attrs, tris: (mb.i.length - t0) / 3, streetYaw, front: front.yaw };
}

// ---------------------------------------------------------------- sub-builders

// Walls from the real polygon; edges that cross the garage rect are split so the
// wing gets its own lower eave without needing a second footprint.
function emitWalls(mb, b, y0, eave, lowEave, rect, ox, oz, ca, sa, col, onEdge) {
  const p = b.p, n = p.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i], q = p[(i + 1) % n];
    s += a[0] * q[1] - q[0] * a[1];
  }
  const fwd = s < 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (onEdge) onEdge(p[i][0], p[i][1], p[j][0], p[j][1]);
    const ia = fwd ? i : j, ib = fwd ? j : i;
    const a = p[ia], q = p[ib];
    const iv = rect ? clipToRect(a[0], a[1], q[0], q[1], ox, oz, ca, sa, rect) : null;
    if (!iv) { wallQuad(mb, a, q, 0, 1, y0, eave, col); continue; }
    if (iv[0] > 0.002) wallQuad(mb, a, q, 0, iv[0], y0, eave, col);
    wallQuad(mb, a, q, iv[0], iv[1], y0, lowEave, col);
    if (iv[1] < 0.998) wallQuad(mb, a, q, iv[1], 1, y0, eave, col);
  }
}

function wallQuad(mb, a, q, t0, t1, y0, h, col) {
  const ax = a[0] + (q[0] - a[0]) * t0, az = a[1] + (q[1] - a[1]) * t0;
  const bx = a[0] + (q[0] - a[0]) * t1, bz = a[1] + (q[1] - a[1]) * t1;
  mb.quad([ax, y0, az], [bx, y0, bz], [bx, y0 + h, bz], [ax, y0 + h, az], col);
}

// Roof on one rect of the decomposition, in the requested form. `mt` arms the
// shingle before the slopes and swaps back to the wall material for the gable
// ends (which are siding or brick on a real house, not roofing).
function roofOn(mb, r, L2M, yaw, baseY, rise, form, spec, roofCol, mt) {
  const w = r.u1 - r.u0, d = r.v1 - r.v0;
  const cm = L2M((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2);
  const ov = spec.overhang;
  const h = clamp(rise * clamp(Math.min(w, d) / 9, 0.55, 1.5), 0.7, 5.0);
  if (mt) mt.roof();
  // Soffit. From a car the eave of a two-storey is above you, and a roof made of
  // two one-sided planes is see-through from underneath: you get sky between the
  // wall top and the ridge. Two triangles of dark underside close it.
  // (only where you can actually get under it — below ~4.6 m the wall hides the
  // slope from anyone sitting in a car, and 10 000 bungalows do not need it.)
  if (form !== 'flat' && baseY > 4.6) {
    mb.capRect(cm[0], cm[1], w + ov * 2, d + ov * 2, baseY + 0.02, yaw, roofCol, true);
  }
  switch (form) {
    case 'hip': mb.hip(cm[0], baseY, cm[1], w, d, h, roofCol, w >= d ? yaw : yaw - Math.PI / 2, ov); break;
    case 'flat': mb.capRect(cm[0], cm[1], w + ov, d + ov, baseY + 0.25, yaw, roofCol); break;
    case 'shed': mb.shedRoof(cm[0], baseY, cm[1], w, d, h, roofCol, yaw, ov); break;
    case 'mansard': mb.mansard(cm[0], baseY, cm[1], w, d, h * 1.25, roofCol, yaw, ov, Math.min(1.4, d * 0.16)); break;
    default:
      if (w >= d) mb.roof(cm[0], baseY, cm[1], w, d, h, roofCol, yaw, ov, mt ? mt.gable : null);
      else mb.roof(cm[0], baseY, cm[1], d, w, h, roofCol, yaw - Math.PI / 2, ov, mt ? mt.gable : null);
  }
}

// Of several rects, the street-facing face that actually presents to the road —
// i.e. the one furthest forward along the street normal. On an L-shaped plan the
// door and porch belong on the leg that reaches the sidewalk, not in the notch.
function frontFaceOf(rects, L2M, front) {
  let best = null, bestD = -1e9;
  for (const r of rects) {
    if (!r) continue;
    const f = faceOf(r, L2M, front);
    if (f.len < 2.5) continue;
    const d = f.cx * front.nx + f.cz * front.nz;
    if (d > bestD) { bestD = d; best = f; }
  }
  return best || faceOf(rects[0], L2M, front);
}

// The face of a rect that looks most nearly toward the street.
function faceOf(r, L2M, front) {
  const faces = rectFaces(r, L2M);
  let best = faces[0], bd = -2;
  for (const f of faces) {
    const c = Math.cos(f.yaw - front.yaw);
    if (c > bd) { bd = c; best = f; }
  }
  return best;
}

// Window bands. One per storey on each face longer than 3 m, the front getting
// one more than the sides. Fronts are laid out first so a tight budget spends
// itself where the driver is looking.
function windows(mb, r, L2M, y0, eave, storeys, spec, col, uv, front, maxWin) {
  const faces = rectFaces(r, L2M);
  faces.sort((a, b2) => Math.cos(b2.yaw - front.yaw) - Math.cos(a.yaw - front.yaw));
  const sh = eave / storeys;
  let placed = 0;
  for (const f of faces) {
    if (f.len < 3) continue;                    // skip party walls and stub returns
    const isFront = Math.cos(f.yaw - front.yaw) > 0.7;
    const n = clamp(Math.floor(f.len / (isFront ? 3.0 : 3.6)), 1, isFront ? 4 : 3);
    for (let s = 0; s < storeys && placed < maxWin; s++) {
      const cy = y0 + s * sh + sh * 0.58;
      if (cy + spec.winH / 2 > y0 + eave - 0.2) break;
      for (let i = 0; i < n && placed < maxWin; i++) {
        // the ground-floor front centre is the door's, so skip it
        const t = ((i + 0.5) / n - 0.5) * f.len * 0.88;
        if (isFront && s === 0 && Math.abs(t) < 1.2) continue;
        mb.panel(f.cx + f.tx * t, cy, f.cz + f.tz * t, spec.winW, spec.winH,
          f.nx, f.nz, col, uv, OUT);
        placed++;
      }
    }
  }
  return placed;
}

// Base-course / siding band around a rect (front + the two returns).
function faceBand(mb, r, L2M, cy, h, col, uv, front, frontOnly) {
  const faces = rectFaces(r, L2M);
  for (const f of faces) {
    if (f.len < 2) continue;
    const facing = Math.cos(f.yaw - front.yaw);
    if (frontOnly && facing < -0.2) continue;
    mb.panel(f.cx, cy, f.cz, f.len, h, f.nx, f.nz, col, uv, 0.03);
  }
}

// The four faces of a rect in the ridge frame, as map-space quads.
function rectFaces(r, L2M) {
  const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2;
  const w = r.u1 - r.u0, d = r.v1 - r.v0;
  const o = L2M(0, 0);
  const U = L2M(1, 0), V = L2M(0, 1);
  const ux = U[0] - o[0], uz = U[1] - o[1];
  const vx = V[0] - o[0], vz = V[1] - o[1];
  const mk = (mu, mv, nx, nz, tx, tz, len) => {
    const c = L2M(mu, mv);
    return { cx: c[0], cz: c[1], nx, nz, tx, tz, len, yaw: Math.atan2(nz, nx) };
  };
  return [
    mk(r.u1, cv, ux, uz, vx, vz, d),
    mk(r.u0, cv, -ux, -uz, -vx, -vz, d),
    mk(cu, r.v1, vx, vz, -ux, -uz, w),
    mk(cu, r.v0, -vx, -vz, ux, uz, w),
  ];
}

// Full-width (or stoop-sized) front porch: deck, posts, rail, shed roof.
// The deck projects PORCH_D metres past the front wall, which is outside the
// footprint — deliberate (Vieux-Aylmer porches sit right on the sidewalk), but
// it means the porch is not in world.js's collider set. See integrateNotes.md.
function porch(mb, f, front, y0, eave, width, trimCol, roofCol, mt) {
  const w = Math.max(2.4, Math.min(width, f.len));
  const uvRail = mt ? mt.dec('porch_rail') : null;
  const railCol = uvRail ? [1, 1, 1] : trimCol;
  const cx = f.cx + front.nx * (PORCH_D / 2), cz = f.cz + front.nz * (PORCH_D / 2);
  const mYaw = -front.yaw;                    // MeshBuilder yaw: local +X == outward
  mb.tower(cx, y0, cz, PORCH_D, w, 0.34, trimCol, { yaw: mYaw, noBottom: true });
  const top = y0 + Math.min(eave - 0.35, 2.9);
  const nPost = w > 6 ? 4 : 3;
  for (let i = 0; i < nPost; i++) {
    const t = ((i / (nPost - 1)) - 0.5) * (w - 0.5);
    const px = f.cx + f.tx * t + front.nx * (PORCH_D - 0.25);
    const pz = f.cz + f.tz * t + front.nz * (PORCH_D - 0.25);
    mb.post(px, y0 + 0.34, pz, 0.17, top - y0 - 0.34, trimCol, mYaw);
  }
  // rail across the front, split around the steps
  for (const s of [-1, 1]) {
    const t = s * (w * 0.25 + 0.5);
    const rx = f.cx + f.tx * t + front.nx * (PORCH_D - 0.2);
    const rz = f.cz + f.tz * t + front.nz * (PORCH_D - 0.2);
    mb.panel(rx, y0 + 0.75, rz, Math.max(0.8, w * 0.34), 0.75,
      front.nx, front.nz, railCol, uvRail, 0.02);
  }
  // Slope only: low at the outer edge, high against the house wall. Local +Z has
  // to point back at the wall, which is meshYaw = -front.yaw - PI/2.
  if (mt) mt.roof();
  mb.shedRoof(cx, top, cz, w, PORCH_D + 0.5, 0.42, roofCol,
    -front.yaw - Math.PI / 2, 0.22, { slopeOnly: true });
  if (mt) mt.off();
}

// Gable dormers poking through the street-facing slope.
function dormers(mb, r, L2M, yaw, eaveY, rise, count, front, wallCol, roofCol, winCol, uv, mt) {
  const w = r.u1 - r.u0, d = r.v1 - r.v0;
  if (Math.min(w, d) < 5) return;
  const faces = rectFaces(r, L2M);
  let best = faces[0], bd = -2;
  for (const f of faces) { const c = Math.cos(f.yaw - front.yaw); if (c > bd) { bd = c; best = f; } }
  const inset = Math.min(1.4, Math.min(w, d) * 0.2);
  const n = Math.max(1, count | 0);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * best.len * 0.5;
    const cx = best.cx + best.tx * t - best.nx * inset;
    const cz = best.cz + best.tz * t - best.nz * inset;
    const y = eaveY + rise * 0.18;
    // local +X is the slope normal, so wBot is the dormer's depth into the roof
    if (mt) mt.wall();
    mb.tower(cx, y, cz, 1.35, 1.55, 1.25, wallCol,
      { yaw: -best.yaw, noBottom: true, top: roofCol });
    if (mt) mt.off();
    mb.panel(cx + best.nx * 0.68, y + 0.68, cz + best.nz * 0.68, 0.85, 0.85,
      best.nx, best.nz, winCol, uv, 0.02);
  }
}

// Flat asphalt strip from the garage face out past the setback to the street.
function driveway(mb, f, front, y0, width, len, col) {
  const cx = f.cx + front.nx * (len / 2 + 0.4);
  const cz = f.cz + front.nz * (len / 2 + 0.4);
  mb.flatRot(cx, cz, width, len, y0 + Y_DRIVE, -front.yaw + Math.PI / 2, col);
}

// A shed or a single detached garage at the back of the lot.
function backShed(mb, ext, L2M, yaw, y0, front, wallCol, roofCol, kind, mats, rng, mt) {
  const w = kind === 'garage' ? 5.6 : 2.8, d = kind === 'garage' ? 6.0 : 2.4;
  const h = kind === 'garage' ? 2.5 : 2.1;
  const cu = (ext.u0 + ext.u1) / 2 + (ext.u1 - ext.u0) * 0.3;
  const cv = (ext.v0 + ext.v1) / 2;
  const p = L2M(cu, cv);
  const bx = p[0] - front.nx * ((ext.v1 - ext.v0) * 0.5 + d * 0.7 + 3);
  const bz = p[1] - front.nz * ((ext.v1 - ext.v0) * 0.5 + d * 0.7 + 3);
  const col = jitter(wallCol, 0.9);
  if (mt) mt.wall();
  mb.tower(bx, y0, bz, w, d, h, col, { yaw, noBottom: true, top: roofCol });
  if (mt) mt.roof();
  mb.roof(bx, y0 + h, bz, Math.max(w, d), Math.min(w, d), 0.85, roofCol,
    w >= d ? yaw : yaw - Math.PI / 2, 0.25, mt ? mt.gable : null);
  if (mt) mt.off();
}

// Row / semi: a colour band, a door and two windows per unit, mirrored in pairs.
function rowUnits(mb, r, L2M, y0, eave, front, spec, mats, rng, room, mt) {
  const faces = rectFaces(r, L2M);
  let f = faces[0], bd = -2;
  for (const q of faces) { const c = Math.cos(q.yaw - front.yaw); if (c > bd) { bd = c; f = q; } }
  const units = clamp(Math.round(f.len / 6.5), 2, 6);
  const uw = f.len / units;
  const doorCol = mats.tint(spec.door, 1), winCol = mats.tint(spec.winTile, 1);
  const uvD = mats.decalUV(spec.door), uvW = mats.decalUV(spec.winTile);
  for (let i = 0; i < units; i++) {
    if (!room(8)) break;
    const t = ((i + 0.5) / units - 0.5) * f.len;
    const mirror = i % 2 === 0 ? 1 : -1;
    const bandTile = pick(spec.wall, rng());
    const band = mats.tint(bandTile, 0.9 + rng() * 0.2);
    if (mt) mt.named(bandTile);
    mb.panel(f.cx + f.tx * t, y0 + eave / 2, f.cz + f.tz * t, uw * 0.94, eave * 0.94,
      f.nx, f.nz, band, null, 0.02);
    if (mt) mt.off();
    const dt = t + mirror * uw * 0.26;
    mb.panel(f.cx + f.tx * dt, y0 + 1.1, f.cz + f.tz * dt, 0.92, 2.1,
      f.nx, f.nz, doorCol, uvD, OUT);
    const wt = t - mirror * uw * 0.24;
    mb.panel(f.cx + f.tx * wt, y0 + 1.35, f.cz + f.tz * wt, spec.winW * 1.4, spec.winH,
      f.nx, f.nz, winCol, uvW, OUT);
    mb.panel(f.cx + f.tx * t, y0 + eave * 0.74, f.cz + f.tz * t, spec.winW * 1.5, spec.winH,
      f.nx, f.nz, winCol, uvW, OUT);
  }
}
