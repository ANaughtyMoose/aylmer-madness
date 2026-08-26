// Turns mapdata.js (real OpenStreetMap Aylmer) into geometry and collision data.
//
// The map is baked once at load into:
//   * static meshes split into 200 m chunks so the renderer can frustum-cull blocks,
//   * a second set of chunks holding just the river, drawn with the wobble shader,
//   * a third set holding the streetlight pools, drawn only after dark,
//   * a `distant` mesh that is always drawn (apron, river, far shore, Gatineau hills),
//   * a uniform grid of wall segments (building footprint edges + poles) for physics,
//   * a uniform grid of road centrelines for the "am I on tarmac?" test.
//
// buildWorld(renderer) returns:
//   draw(r, model, x, z, drawDist, dt)  everything above in one call: distance +
//                                       frustum cull, the 0.4 s fog fade-in for
//                                       newly-arrived chunks (W2), the river, the
//                                       storefront signs, the lamp pools at night
//   chunks / waterChunks / nightChunks  the mesh lists, if you want them yourself
//   poles      [{x,z,kind,h}]  every upright post — streetlights, hydro poles,
//                              signal masts, stop signs. Collision/damage code
//                              can look one up here and swap in a fallen mesh.
//   signals / stopSigns        the plans signals.js drives (see that file)
//   intersections              how many junction polygons were built (W3)
//   querySegments / roadAt / waterAt / nearestRoad / bounds / distant / signage
//
// Also exported: nightAmount(env) (0 by day, 1 at night) and
// buildHeadlights(renderer, spec) (the player's night light cones).
//
// Coordinates are metres: +X east, +Z south, +Y up. Everything sits at y=0; the
// only vertical ordering that matters is the small ladder of decal heights below,
// which keeps coplanar quads from z-fighting.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { mulberry32, clamp, lerp } from '../core/math.js';
import { MAP } from './mapdata.js';
import { roadNodes, isJunction, planSignals, planStopSigns, LAMP_DY, HEAD_Y } from './signals.js';
import { buildSignage } from './signage.js';

const CHUNK = 200;      // world chunk size (metres)
const SEG_CELL = 32;    // broadphase cell for querySegments
const ROAD_CELL = 40;   // broadphase cell for roadAt
const FADE = 0.4;       // seconds a chunk takes to come out of the fog (W2)

// Decal ladder. Note the river sits slightly ABOVE the grass so the shoreline is
// exact; both are flat so it reads fine. `inter` is a hair over `road` so the
// intersection polygons win the coplanar fight with the road quads they cover.
const Y = {
  grass: 0.0, park: 0.01, wood: 0.012, sand: 0.015,
  water: 0.02, pitch: 0.02, parking: 0.03, pool: 0.04,
  service: 0.045, road: 0.05, inter: 0.058, mark: 0.085, pool2: 0.1,
};

const C = {
  grassLo: 0x6a8449, grassHi: 0x748e50,
  water: 0x2f5d78, sand: 0xd9cba4, wood: 0x4a6236, park: 0x668a4c,
  school: 0x6f8f52, cemetery: 0x688a57, parking: 0x46464c,
  pitch: 0x6a9a4a, pool: 0x7fc7e0,
  major: 0x36363b, minor: 0x3b3b40, service: 0x45454a,
  yellow: 0xd4be55, white: 0xdddddd, walk: 0xa9a49a,
  flatRoof: 0x74726c,
  win: 0x2e3742, pole: 0x6f6d68, lamp: 0xf0e6c0, hydro: 0x6b5a45,
  trunk: 0x5b4632, shore: 0x2a4032, dock: 0x8a6a48,
  rock: 0x7d7a72, signHead: 0x2c2e2c, lensOff: 0x14150f,
  stopRed: 0xa8261f, stopRim: 0xe8e4dc, pool: 0xffd9a0,
};

// Caps for the new furniture so the triangle budget stays where it was.
const CAP2 = { shoreEdges: 900, rocks: 420 };

// Real Aylmer housing stock, weighted: white vinyl and beige dominate, brick and
// dark brown are the odd one out on a street.
const SIDING = [
  0xe9e6de, 0xe9e6de, 0xe9e6de,   // white vinyl
  0xd9cdb5, 0xd9cdb5,             // beige
  0xb9bcc0, 0xb9bcc0,             // grey
  0xb7c2ad,                       // sage
  0x9a5a48,                       // brick red
  0xe8dcb0,                       // yellow-cream
  0xb9cdd8,                       // light blue
  0x6b5a4c,                       // dark brown
];
const COMMERCIAL = [0xb8a58f, 0xc8c3b8, 0x9a5a48];
// Gable roofs: asphalt shingle (black / charcoal) mostly, brown, dark green, and
// the odd red metal roof. Index 2 (charcoal) is what churches get.
const ROOF = [0x3a3a3c, 0x4b4a48, 0x4b4a48, 0x5c4a3c, 0x3d4f3a, 0x8a3a33];
const LEAF = [0x4f7a34, 0x5d8a3a, 0x6a944a];      // deciduous
const CONIFER = [0x2f4f2e, 0x36573a];             // spruce / pine

const GABLE = { house: 1, terrace: 1, shed: 1 };
const MAJOR = { trunk: 1, primary: 1, secondary: 1 };
const PAVED = { trunk: 1, primary: 1, secondary: 1, tertiary: 1 };

// Caps — the whole scene has to stay well under 450k triangles.
const CAP = { woodTrees: 900, parkTrees: 500, roadTrees: 1800, poles: 2500 };

// ---------------------------------------------------------------- small helpers

// Twice the signed area of a ring in (x,z). Negative == the ring, taken in order,
// winds CCW as seen from +Y, which is the winding the renderer wants for up-facing
// polygons (see MeshBuilder.flat).
function ringArea2(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

function pointInPoly(p, x, z) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Per-channel blend between two packed hex colours.
function mixHex(a, b, t) {
  const r = lerp((a >> 16) & 255, (b >> 16) & 255, t) | 0;
  const g = lerp((a >> 8) & 255, (b >> 8) & 255, t) | 0;
  const bl = lerp(a & 255, b & 255, t) | 0;
  return (r << 16) | (g << 8) | bl;
}

function distPtSeg2(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = ax + t * dx - x, pz = az + t * dz - z;
  return px * px + pz * pz;
}

// Take every `stride`-th entry so a capped population still spreads over the whole map.
function subsample(list, cap) {
  if (list.length <= cap) return list;
  const stride = list.length / cap;
  const out = [];
  for (let i = 0; out.length < cap && Math.floor(i) < list.length; i += stride) {
    out.push(list[Math.floor(i)]);
  }
  return out;
}

export function buildWorld(renderer) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const B = MAP.bounds;
  const NX = Math.ceil((B.maxX - B.minX) / CHUNK);
  const NZ = Math.ceil((B.maxZ - B.minZ) / CHUNK);

  const builders = new Map();
  const waterB = new Map();     // river/pond triangles, drawn with the wobble shader
  const nightB = new Map();     // streetlight pools, drawn only after dark
  const distant = new MeshBuilder();

  function chunkKey(x, z) {
    const cx = clamp(Math.floor((x - B.minX) / CHUNK), 0, NX - 1);
    const cz = clamp(Math.floor((z - B.minZ) / CHUNK), 0, NZ - 1);
    return cz * NX + cx;
  }
  function pick(map, x, z) {
    const k = chunkKey(x, z);
    let b = map.get(k);
    if (!b) { b = new MeshBuilder(); map.set(k, b); }
    return b;
  }
  function bAt(x, z) { return pick(builders, x, z); }
  const bKey = chunkKey;
  function wAt(x, z) { return pick(waterB, x, z); }
  function nAt(x, z) { return pick(nightB, x, z); }

  // Every upright post in town, in one list, so the collision/damage code can
  // find the one you just hit and swap in a fallen version of it.
  const poles = [];
  const poleGrid = new Map();
  let poolCount = 0;

  // ------------------------------------------------------------ collider grid
  // Segments live in one flat array (ax,az,bx,bz per 4 slots); the grid stores
  // indices into it. Segments are registered into every cell of their bounding
  // box, which is a conservative superset of the cells they cross.
  const segs = [];
  const segGrid = new Map();
  const gkey = (i, j) => (i + 256) * 512 + (j + 256);

  function addSegment(ax, az, bx, bz) {
    const idx = segs.length >> 2;
    segs.push(ax, az, bx, bz);
    const i0 = Math.floor(Math.min(ax, bx) / SEG_CELL), i1 = Math.floor(Math.max(ax, bx) / SEG_CELL);
    const j0 = Math.floor(Math.min(az, bz) / SEG_CELL), j1 = Math.floor(Math.max(az, bz) / SEG_CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = gkey(i, j);
        let a = segGrid.get(k);
        if (!a) { a = []; segGrid.set(k, a); }
        a.push(idx);
      }
    }
    return idx;
  }

  // ------------------------------------------------------------ triangle emit
  // Precomputed footprint triangles wind CCW in (x,z) shoelace terms, which faces
  // DOWN once lifted to y. Flip per triangle so every cap faces the sky.
  const UP = [0, 1, 0];
  function triTo(bd, p, t, y, col) {
    for (let i = 0; i < t.length; i += 3) {
      const a = p[t[i]], b = p[t[i + 1]], c = p[t[i + 2]];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const v0 = bd.vert(a[0], y, a[1], 0, 1, 0, col);
      if (cross > 0) {   // clockwise from above -> reverse so the normal is +Y
        bd.vert(c[0], y, c[1], 0, 1, 0, col);
        bd.vert(b[0], y, b[1], 0, 1, 0, col);
      } else {
        bd.vert(b[0], y, b[1], 0, 1, 0, col);
        bd.vert(c[0], y, c[1], 0, 1, 0, col);
      }
      bd.tri(v0, v0 + 1, v0 + 2);
    }
  }
  // Same, but each triangle lands in the chunk of its own centroid (big polygons).
  // `get` chooses which set of chunk builders (land, water, night) it lands in.
  function triScatter(p, t, y, col, get) {
    const into = get || bAt;
    for (let i = 0; i < t.length; i += 3) {
      const a = p[t[i]], b = p[t[i + 1]], c = p[t[i + 2]];
      const bd = into((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const v0 = bd.vert(a[0], y, a[1], 0, 1, 0, col);
      if (cross > 0) {
        bd.vert(c[0], y, c[1], 0, 1, 0, col);
        bd.vert(b[0], y, b[1], 0, 1, 0, col);
      } else {
        bd.vert(b[0], y, b[1], 0, 1, 0, col);
        bd.vert(c[0], y, c[1], 0, 1, 0, col);
      }
      bd.tri(v0, v0 + 1, v0 + 2);
    }
  }

  // ------------------------------------------------------------ 1. ground
  const gr = mulberry32(0x51ee7);
  for (let cz = 0; cz < NZ; cz++) {
    for (let cx = 0; cx < NX; cx++) {
      const x0 = B.minX + cx * CHUNK, x1 = Math.min(x0 + CHUNK, B.maxX);
      const z0 = B.minZ + cz * CHUNK, z1 = Math.min(z0 + CHUNK, B.maxZ);
      if (x1 <= x0 || z1 <= z0) continue;
      const g = shade(C.grassLo, 1 + gr() * 0.16);
      bAt((x0 + x1) / 2, (z0 + z1) / 2).flat(x0, z0, x1, z1, Y.grass, g);
    }
  }

  // ------------------------------------------------------------ 2. water
  // Water goes into its OWN chunk meshes so the whole draw can carry the wobble
  // flag (see gl.js `opts.water`) without every land vertex paying for it.
  const waterCol = rgb(C.water);
  for (const w of MAP.water) triScatter(w.p, w.t, Y.water, waterCol, wAt);

  // ------------------------------------------------------------ 3. areas
  const AREA = {
    park: [C.park, Y.park], school: [C.school, Y.park], cemetery: [C.cemetery, Y.park],
    sand: [C.sand, Y.sand], wood: [C.wood, Y.wood], parking: [C.parking, Y.parking],
    pitch: [C.pitch, Y.pitch], pool: [C.pool, Y.pool], water: [C.water, Y.water],
  };
  for (const a of MAP.areas) {
    const spec = AREA[a.k];
    if (!spec) continue;
    triScatter(a.p, a.t, spec[1], rgb(spec[0]), a.k === 'water' ? wAt : bAt);
  }

  // ------------------------------------------------------------ 4. roads
  const roadCols = {
    trunk: rgb(C.major), primary: rgb(C.major), secondary: rgb(C.major),
    tertiary: rgb(C.minor), residential: rgb(C.minor), service: rgb(C.service),
  };
  const yellow = rgb(C.yellow), white = rgb(C.white), walkCol = rgb(C.walk);
  const DISC = 10;
  const discCos = new Float32Array(DISC), discSin = new Float32Array(DISC);
  for (let i = 0; i < DISC; i++) {
    const a = (i / DISC) * Math.PI * 2;
    discCos[i] = Math.cos(a); discSin[i] = Math.sin(a);
  }
  // 10-gon disc, +Y facing. Ring order must be clockwise in (x,z) terms... see triTo:
  // negative shoelace == CCW from above, so walk the ring with decreasing angle.
  function disc(x, z, r, y, col) {
    const bd = bAt(x, z);
    const c0 = bd.vert(x, y, z, 0, 1, 0, col);
    for (let i = 0; i < DISC; i++) bd.vert(x + discCos[i] * r, y, z + discSin[i] * r, 0, 1, 0, col);
    for (let i = 0; i < DISC; i++) {
      const a = c0 + 1 + i, b = c0 + 1 + ((i + 1) % DISC);
      bd.tri(c0, b, a);
    }
  }

  const roadSegs = [];         // ax,az,bx,bz,rad2 per 5 slots
  const roadGrid = new Map();
  const nearSegs = [];         // {ax,az,bx,bz,name} for nearestRoad (non-service)
  let jointCount = 0, sidewalkCount = 0, dashCount = 0;
  let interCount = 0, cornerCount = 0, stopLineCount = 0;

  // -------------------------------------------------- 4a. intersections (W3)
  // Every node where three or more road ends meet becomes one convex polygon:
  // take each branch out to `ext` and both its kerb corners there, hull the lot.
  // That single shape covers the mitre seams, so no joint disc is needed and the
  // markings can simply be clipped to `ext` from the node.
  const NODES = roadNodes();
  const interExt = new Map();      // osm node id -> how far the polygon reaches

  function convexHull(pts) {
    pts.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
      up.push(p);
    }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  const hullPts = [], hullIdx = [];
  for (const nd of NODES.values()) {
    if (!isJunction(nd)) continue;
    const ext = nd.ext;
    hullPts.length = 0;
    let rank = 0;
    for (const b of nd.br) {
      const px = -b.dz, pz = b.dx;
      const cx = nd.x + b.dx * ext, cz = nd.z + b.dz * ext;
      hullPts.push([cx + px * b.hw, cz + pz * b.hw], [cx - px * b.hw, cz - pz * b.hw]);
      if (b.rank > rank) rank = b.rank;
    }
    const ring = convexHull(hullPts.slice());
    if (ring.length < 3) continue;
    hullIdx.length = 0;
    for (let i = 1; i + 1 < ring.length; i++) hullIdx.push(0, i, i + 1);
    const col = rank >= 3 ? roadCols.trunk : rank >= 2 ? roadCols.tertiary : roadCols.residential;
    triTo(bAt(nd.x, nd.z), ring, hullIdx, Y.inter, col);
    interExt.set(nd.id, ext);
    interCount++;

    // Sidewalk corners: the kerb radius between two paved branches. Without
    // these the two straight bands leave a notch at every junction.
    const paved = nd.br.filter((b) => PAVED[b.cls] === 1);
    if (paved.length >= 2) {
      paved.sort((a, b) => Math.atan2(a.dx, a.dz) - Math.atan2(b.dx, b.dz));
      for (let i = 0; i < paved.length; i++) {
        const a = paved[i], b = paved[(i + 1) % paved.length];
        let ux = a.dx + b.dx, uz = a.dz + b.dz;
        const ul = Math.hypot(ux, uz);
        if (ul < 0.25) continue;                 // straight-through pair: no corner
        ux /= ul; uz /= ul;
        const d = ext + 1.9;
        const cx = nd.x + ux * d, cz = nd.z + uz * d;
        bAt(cx, cz).tower(cx, 0, cz, 3.6, 3.6, 0.15, walkCol,
          { yaw: Math.atan2(ux, uz), noBottom: true });
        cornerCount++;
      }
    }
  }
  const clearAt = (id) => interExt.get(id) || 0;

  // A white bar across the approach lane, from the centreline to the kerb.
  function stopLine(x, z, dx, dz, hw, yaw) {
    const rxx = -dz, rzz = dx;
    const cx = x + rxx * hw * 0.5, cz = z + rzz * hw * 0.5;
    bAt(cx, cz).flatRot(cx, cz, hw * 0.9, 0.55, Y.mark, yaw, white);
    stopLineCount++;
  }

  const lx = [], lz = [], rx = [], rz = [];   // offset polyline scratch
  for (let ri = 0; ri < MAP.roads.length; ri++) {
    const road = MAP.roads[ri];
    const pts = road.pts, ids = road.ids, n = pts.length;
    if (n < 2) continue;
    const hw = road.w / 2;
    const isService = road.cls === 'service';
    const y = isService ? Y.service : Y.road;
    const col = roadCols[road.cls] || roadCols.residential;

    // per-segment unit direction + right-hand normal
    const dxs = new Float64Array(n - 1), dzs = new Float64Array(n - 1), lens = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const l = Math.hypot(dx, dz) || 1;
      dxs[i] = dx / l; dzs[i] = dz / l; lens[i] = l;
    }

    // mitred offsets at each vertex
    lx.length = 0; lz.length = 0; rx.length = 0; rz.length = 0;
    const maxMitre = hw * 2.5;
    for (let i = 0; i < n; i++) {
      let ox, oz;
      if (i === 0) { ox = dzs[0]; oz = -dxs[0]; }
      else if (i === n - 1) { ox = dzs[n - 2]; oz = -dxs[n - 2]; }
      else {
        const n0x = dzs[i - 1], n0z = -dxs[i - 1];
        const n1x = dzs[i], n1z = -dxs[i];
        let mx = n0x + n1x, mz = n0z + n1z;
        const ml = Math.hypot(mx, mz);
        if (ml < 1e-4) { ox = n1x; oz = n1z; }
        else {
          mx /= ml; mz /= ml;
          const d = mx * n1x + mz * n1z;
          let scale = d > 0.2 ? 1 / d : 1 / 0.2;
          if (hw * scale > maxMitre) scale = maxMitre / hw;
          ox = mx * scale; oz = mz * scale;
        }
      }
      lx.push(pts[i][0] + ox * hw); lz.push(pts[i][1] + oz * hw);
      rx.push(pts[i][0] - ox * hw); rz.push(pts[i][1] - oz * hw);
    }

    // asphalt: one quad per segment, chunked by midpoint
    for (let i = 0; i < n - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
      bAt(mx, mz).quad(
        [lx[i], y, lz[i]], [rx[i], y, rz[i]],
        [rx[i + 1], y, rz[i + 1]], [lx[i + 1], y, lz[i + 1]], col, UP);
      // road broadphase
      const idx = roadSegs.length / 5;
      const rad = hw + 0.8;
      roadSegs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rad * rad);
      const i0 = Math.floor((Math.min(pts[i][0], pts[i + 1][0]) - rad) / ROAD_CELL);
      const i1 = Math.floor((Math.max(pts[i][0], pts[i + 1][0]) + rad) / ROAD_CELL);
      const j0 = Math.floor((Math.min(pts[i][1], pts[i + 1][1]) - rad) / ROAD_CELL);
      const j1 = Math.floor((Math.max(pts[i][1], pts[i + 1][1]) + rad) / ROAD_CELL);
      for (let a = i0; a <= i1; a++) {
        for (let b = j0; b <= j1; b++) {
          const k = gkey(a, b);
          let arr = roadGrid.get(k);
          if (!arr) { arr = []; roadGrid.set(k, arr); }
          arr.push(idx);
        }
      }
      if (!isService) {
        nearSegs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ri);
      }
    }

    if (isService) continue;   // service roads: no discs, markings or sidewalks

    // How far into each end of a segment the intersection polygon reaches. Every
    // marking and sidewalk below is clipped to the gap between the two, which is
    // what stops the dashes crossing the junction (W3).
    const cut = new Float64Array(n);
    for (let i = 0; i < n; i++) cut[i] = clearAt(ids ? ids[i] : -1);

    // Joint discs hide the seams where ways meet and where a sharp mitre was
    // clamped. Skipped at near-collinear interior vertices, where the mitre is
    // already exact, and at junctions, where the intersection polygon covers it.
    for (let i = 0; i < n; i++) {
      if (cut[i] > 0) continue;               // a real junction: polygon does the job
      if (i > 0 && i < n - 1) {
        const d = dxs[i - 1] * dxs[i] + dzs[i - 1] * dzs[i];
        if (d > 0.99) continue;               // < ~8 degrees of bend
      }
      disc(pts[i][0], pts[i][1], hw, y, col);
      jointCount++;
    }

    const major = MAJOR[road.cls] === 1;
    const paved = PAVED[road.cls] === 1;

    // dashed yellow centre line
    if (paved && !road.oneway) {
      let carry = 2;
      for (let i = 0; i < n - 1; i++) {
        const L = lens[i], dx = dxs[i], dz = dzs[i];
        const s0 = cut[i] > 0 ? cut[i] + 0.8 : 0;
        const s1 = L - (cut[i + 1] > 0 ? cut[i + 1] + 0.8 : 0);
        const yaw = Math.atan2(dx, dz);
        let s = Math.max(carry, s0);
        while (s + 4 <= s1) {
          const cx = pts[i][0] + dx * (s + 2), cz = pts[i][1] + dz * (s + 2);
          bAt(cx, cz).flatRot(cx, cz, 0.35, 4, Y.mark, yaw, yellow);
          dashCount++;
          s += 10;
        }
        carry = Math.max(0, s - L);
      }
    }

    // solid white edge lines, inset 0.5 m from the asphalt edge
    if (major) {
      for (let i = 0; i < n - 1; i++) {
        const s0 = cut[i] > 0 ? cut[i] + 0.8 : 0;
        const s1 = lens[i] - (cut[i + 1] > 0 ? cut[i + 1] + 0.8 : 0);
        const L = s1 - s0;
        if (L < 1.5) continue;
        const dx = dxs[i], dz = dzs[i];
        const yaw = Math.atan2(dx, dz);
        const nx = dz, nz = -dx;
        const mid = (s0 + s1) / 2;
        const mx = pts[i][0] + dx * mid, mz = pts[i][1] + dz * mid;
        const off = hw - 0.5;
        for (const s of [1, -1]) {
          const cx = mx + nx * off * s, cz = mz + nz * off * s;
          bAt(cx, cz).flatRot(cx, cz, 0.25, L, Y.mark, yaw, white);
        }
      }
    }

    // concrete sidewalk bands outside the asphalt, stopping at the kerb corners
    if (paved) {
      for (let i = 0; i < n - 1; i++) {
        const s0 = cut[i] > 0 ? cut[i] + 1.4 : 0;
        const s1 = lens[i] - (cut[i + 1] > 0 ? cut[i + 1] + 1.4 : 0);
        const L = s1 - s0;
        if (L < 3) continue;
        const dx = dxs[i], dz = dzs[i];
        const yaw = Math.atan2(dx, dz);
        const nx = dz, nz = -dx;
        const mid = (s0 + s1) / 2;
        const mx = pts[i][0] + dx * mid, mz = pts[i][1] + dz * mid;
        const off = hw + 1.1;
        for (const s of [1, -1]) {
          const cx = mx + nx * off * s, cz = mz + nz * off * s;
          bAt(cx, cz).tower(cx, 0, cz, 2.2, L, 0.15, walkCol, { yaw, noBottom: true });
          sidewalkCount++;
        }
      }
    }
  }

  // -------------------------------------------------- 4b. signals & stop signs
  // Only the *lamp that is lit* moves, so everything else — post, mast arm, the
  // dark housing, the octagons — is baked into the chunks like any other prop.
  // signals.js draws one small box per approach on top. (W4)
  const poleCol = rgb(C.pole), lampCol = rgb(C.lamp), hydroCol = rgb(C.hydro);
  const headCol = rgb(C.signHead), lensOff = rgb(C.lensOff);
  const stopRed = rgb(C.stopRed), stopRim = rgb(C.stopRim);

  // A flat octagon standing on its edge, facing `yaw`, drawn from both sides.
  function octagon(bd, x, y, z, r, yaw, col, off) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const px = [], py = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      px.push(Math.cos(a) * r); py.push(Math.sin(a) * r);
    }
    for (const sg of [1, -1]) {
      const ox = s * (off + (sg > 0 ? 0.012 : -0.012)), oz = co * (off + (sg > 0 ? 0.012 : -0.012));
      const c0 = bd.vert(x + ox, y, z + oz, s * sg, 0, co * sg, col);
      for (let i = 0; i < 8; i++) {
        bd.vert(x + px[i] * co + ox, y + py[i], z - px[i] * s + oz, s * sg, 0, co * sg, col);
      }
      for (let i = 0; i < 8; i++) {
        const a = c0 + 1 + i, b = c0 + 1 + ((i + 1) % 8);
        if (sg > 0) bd.tri(c0, a, b); else bd.tri(c0, b, a);
      }
    }
  }

  const SIGNALS = planSignals();
  for (const sig of SIGNALS) {
    for (const a of sig.approaches) {
      const bd = bAt(a.poleX, a.poleZ);
      bd.cyl(a.poleX, 3.1, a.poleZ, 0.13, 6.2, 6, poleCol, 'y', false);
      const mx = (a.poleX + a.headX) / 2, mz = (a.poleZ + a.headZ) / 2;
      bd.box(mx, 6.18, mz, 0.13, 0.13, a.arm * 0.95, poleCol,
        { yaw: Math.atan2(a.armX, a.armZ), noBottom: true });
      bd.box(a.headX, HEAD_Y, a.headZ, 0.52, 1.52, 0.34, headCol, { yaw: a.headYaw });
      const fx = Math.sin(a.headYaw), fz = Math.cos(a.headYaw);
      for (let k = 0; k < 3; k++) {
        bd.box(a.headX + fx * 0.1, HEAD_Y + LAMP_DY[k], a.headZ + fz * 0.1,
          0.3, 0.3, 0.14, lensOff, { yaw: a.headYaw });
      }
      poleCollider(a.poleX, a.poleZ, 'signal', 6.2);
      stopLine(a.x, a.z, a.dx, a.dz, a.hw, a.yaw);
    }
  }

  const STOPS = planStopSigns();
  for (const s of STOPS) {
    const bd = bAt(s.poleX, s.poleZ);
    bd.cyl(s.poleX, 1.15, s.poleZ, 0.065, 2.3, 4, poleCol, 'y', false);
    octagon(bd, s.poleX, 2.34, s.poleZ, 0.47, s.faceYaw, stopRim, 0.0);
    octagon(bd, s.poleX, 2.34, s.poleZ, 0.40, s.faceYaw, stopRed, 0.03);
    poleCollider(s.poleX, s.poleZ, 'stopsign', 2.3);
    stopLine(s.x, s.z, s.dx, s.dz, s.hw, s.yaw);
  }

  // ------------------------------------------------------------ 5. buildings
  const buildings = MAP.buildings;
  const gableCols = ROOF.map(rgb);
  const flatRoofCol = rgb(C.flatRoof);
  const winCol = rgb(C.win);

  const uv = { u0: 0, u1: 0, v0: 0, v1: 0 };
  function extents(p, c, ca, sa) {
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let i = 0; i < p.length; i++) {
      const dx = p[i][0] - c[0], dz = p[i][1] - c[1];
      const u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    uv.u0 = u0; uv.u1 = u1; uv.v0 = v0; uv.v1 = v1;
    return uv;
  }

  let signCount = 0, winQuads = 0;
  const shrunk = [];
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi];
    const p = b.p, n = p.length, h = b.h, c = b.c;
    const rnd = mulberry32((bi * 2654435761 + 0x9e3779b9) >>> 0);
    const bd = bAt(c[0], c[1]);

    // wall colour
    let wallHex;
    switch (b.k) {
      case 'house': wallHex = SIDING[(rnd() * SIDING.length) | 0]; break;
      case 'terrace': wallHex = SIDING[(rnd() * SIDING.length) | 0]; break;
      case 'apartments': wallHex = mixHex(0xb5b0a6, 0xc9c4b8, rnd()); break;
      case 'commercial': wallHex = COMMERCIAL[(rnd() * 3) | 0]; break;
      case 'industrial': wallHex = 0x9a9a9a; break;
      case 'church': wallHex = 0xe4dccb; break;
      case 'school': wallHex = 0xc7b58a; break;
      case 'shed': wallHex = 0x8f8375; break;
      case 'public': wallHex = 0xb8b2a4; break;
      case 'big': wallHex = 0xb0a898; break;
      case 'mall': wallHex = 0xc9bfae; break;
      default: wallHex = 0xbfb8aa;
    }
    const wall = b.k === 'terrace' ? shade(wallHex, 0.84) : rgb(wallHex);

    // Ring orientation: negative shoelace means walking p[i]->p[i+1] and building the
    // quad [bot_i, bot_j, top_j, top_i] gives an OUTWARD normal. Otherwise walk back.
    const fwd = ringArea2(p) < 0;
    for (let i = 0; i < n; i++) {
      const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
      const a = p[ia], q = p[ib];
      bd.quad([a[0], 0, a[1]], [q[0], 0, q[1]], [q[0], h, q[1]], [a[0], h, a[1]], wall);
      addSegment(p[i][0], p[i][1], p[(i + 1) % n][0], p[(i + 1) % n][1]);
    }

    const ang = b.a, ca = Math.cos(ang), sa = Math.sin(ang);
    const e = extents(p, c, ca, sa);
    const ew = e.u1 - e.u0, ed = e.v1 - e.v0;
    const cu = (e.u0 + e.u1) / 2, cv = (e.v0 + e.v1) / 2;
    const gx = c[0] + cu * ca - cv * sa, gz = c[1] + cu * sa + cv * ca;

    const isChurch = b.k === 'church';
    if (GABLE[b.k] === 1 || isChurch) {
      // Gable: a flat cap at h (covers L-shapes) with a ridged prism over it,
      // rotated so the ridge runs along the footprint's longest edge.
      const roofCol = isChurch ? gableCols[2] : gableCols[(rnd() * 6) | 0];
      triTo(bd, p, b.t, h, roofCol);
      const rh = clamp(0.35 * ed, 1.6, 3.2);
      bd.roof(gx, h, gz, ew, ed, rh, roofCol, -ang, 0.4);
    } else {
      triTo(bd, p, b.t, h, flatRoofCol);
      // inset parapet: same cap 0.4 m higher, pulled ~0.6 m toward the centroid
      shrunk.length = 0;
      for (let i = 0; i < n; i++) {
        const dx = p[i][0] - c[0], dz = p[i][1] - c[1];
        const d = Math.hypot(dx, dz) || 1;
        const f = clamp(0.6 / d, 0, 0.4);
        shrunk.push([p[i][0] - dx * f, p[i][1] - dz * f]);
      }
      triTo(bd, shrunk, b.t, h + 0.4, shade(C.flatRoof, 0.78));
    }

    if (isChurch) {
      const sx = c[0] + ca * ew * 0.4, sz = c[1] + sa * ew * 0.4;
      bd.tower(sx, 0, sz, 2.5, 2.5, h * 1.8, rgb(wallHex), { noBottom: true });
      bd.cone(sx, h * 1.8, sz, 1.9, 5.5, 6, gableCols[0]);
    }

    // window bands, one per storey, hugging each wall
    if (h >= 8) {
      const floors = Math.max(1, Math.min(6, Math.floor(h / 3.2)));
      let quads = 0;
      for (let f = 0; f < floors && quads < 40; f++) {
        const y0 = 1.3 + f * 3.2, y1 = y0 + 1.1;
        if (y1 > h - 0.4) break;
        for (let i = 0; i < n && quads < 40; i++) {
          const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
          const a = p[ia], q = p[ib];
          let dx = q[0] - a[0], dz = q[1] - a[1];
          const L = Math.hypot(dx, dz);
          if (L < 3) continue;
          dx /= L; dz /= L;
          const nx = -dz * 0.05, nz = dx * 0.05;      // outward, 5 cm proud
          const ax = a[0] + dx * L * 0.1 + nx, az = a[1] + dz * L * 0.1 + nz;
          const bx = a[0] + dx * L * 0.9 + nx, bz = a[1] + dz * L * 0.9 + nz;
          bd.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], winCol);
          quads++; winQuads++;
        }
      }
    }

    // landmark sign board on the longest wall
    if (b.name || b.k === 'mall' || b.k === 'church' || b.k === 'public' || b.k === 'school') {
      let best = 0, bix = 0;
      for (let i = 0; i < n; i++) {
        const a = p[i], q = p[(i + 1) % n];
        const L = Math.hypot(q[0] - a[0], q[1] - a[1]);
        if (L > best) { best = L; bix = i; }
      }
      if (best > 3.2) {
        const ia = fwd ? bix : (bix + 1) % n, ib = fwd ? (bix + 1) % n : bix;
        const a = p[ia], q = p[ib];
        let dx = q[0] - a[0], dz = q[1] - a[1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        const mx = (a[0] + q[0]) / 2 - dz * 0.25, mz = (a[1] + q[1]) / 2 + dx * 0.25;
        const nm = b.name || '';
        const hex = (nm.indexOf('Tim') >= 0 || nm.indexOf('McDo') >= 0) ? 0xd23c2a : 0x2a63c9;
        bd.box(mx, h + 0.6, mz, 3, 1.2, 0.35, rgb(hex), { yaw: Math.atan2(-dz, dx), noBottom: true });
        signCount++;
      }
    }
  }

  // ------------------------------------------------------------ segment query
  const segCount = segs.length >> 2;
  let seen = new Int32Array(segCount + 12000);
  let segDead = null;          // allocated once the pole count is known
  let stamp = 0;
  const outArr = [];
  const pool = [];
  function querySegments(x, z, r) {
    stamp++;
    outArr.length = 0;
    const i0 = Math.floor((x - r) / SEG_CELL), i1 = Math.floor((x + r) / SEG_CELL);
    const j0 = Math.floor((z - r) / SEG_CELL), j1 = Math.floor((z + r) / SEG_CELL);
    const r2 = r * r;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = segGrid.get(gkey(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const idx = arr[k];
          if (seen[idx] === stamp) continue;
          seen[idx] = stamp;
          if (segDead !== null && segDead[idx]) continue;   // a snapped pole
          const o = idx * 4;
          const ax = segs[o], az = segs[o + 1], bx = segs[o + 2], bz = segs[o + 3];
          if (distPtSeg2(x, z, ax, az, bx, bz) > r2) continue;
          const m = outArr.length;
          let s = pool[m];
          if (!s) { s = { ax: 0, az: 0, bx: 0, bz: 0 }; pool[m] = s; }
          s.ax = ax; s.az = az; s.bx = bx; s.bz = bz;
          outArr.push(s);
        }
      }
    }
    return outArr;
  }

  // ------------------------------------------------------------ roadAt / nearestRoad
  const roadSegArr = Float64Array.from(roadSegs);
  function roadAt(x, z) {
    const arr = roadGrid.get(gkey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
    if (!arr) return false;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k] * 5;
      if (distPtSeg2(x, z, roadSegArr[o], roadSegArr[o + 1], roadSegArr[o + 2], roadSegArr[o + 3])
        <= roadSegArr[o + 4]) return true;
    }
    return false;
  }

  const nearArr = Float64Array.from(nearSegs);
  function nearestRoad(x, z) {
    let best = Infinity, bx = x, bz = z, byaw = 0, bname = '';
    for (let o = 0; o < nearArr.length; o += 5) {
      const ax = nearArr[o], az = nearArr[o + 1], qx = nearArr[o + 2], qz = nearArr[o + 3];
      const dx = qx - ax, dz = qz - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = ax + t * dx, pz = az + t * dz;
      const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d2 < best) {
        best = d2; bx = px; bz = pz;
        byaw = Math.atan2(dx, dz);
        bname = MAP.roads[nearArr[o + 4]].name || '';
      }
    }
    return { x: bx, z: bz, yaw: byaw, name: bname, dist: Math.sqrt(best) };
  }

  // ------------------------------------------------------------ water mask
  const wm = MAP.waterMask;
  const mask = Uint8Array.from(atob(wm.b64), (ch) => ch.charCodeAt(0));
  function waterAt(x, z) {
    const i = Math.floor((x - B.minX) / wm.cell);
    if (i < 0 || i >= wm.w) return false;
    const j = Math.floor((z - B.minZ) / wm.cell);
    if (j < 0 || j >= wm.h) return false;
    return mask[j * wm.w + i] === 1;
  }

  // ------------------------------------------------------------ 5b. shoreline
  // A sand/gravel strip on the LAND side of every river edge, a scatter of
  // boulders, and the marina's docks. The land side is found by asking the water
  // mask, which is exact and saves worrying about ring winding. (W6)
  const sandCol = rgb(C.sand), dockCol = rgb(C.dock);
  let shoreCount = 0, rockCount = 0, dockCount = 0;
  const sr = mulberry32(0x5ea17e);

  function flatQuad(bd, q, y, col) {
    const cr = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]);
    const o = cr > 0 ? [q[0], q[3], q[2], q[1]] : q;
    bd.quad([o[0][0], y, o[0][1]], [o[1][0], y, o[1][1]],
      [o[2][0], y, o[2][1]], [o[3][0], y, o[3][1]], col, UP);
  }

  {
    const rings = [];
    for (const w of MAP.water) rings.push(w.p);
    for (const a of MAP.areas) if (a.k === 'water') rings.push(a.p);
    const edges = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1 || L > 150) continue;             // 150 m+ edges are the map border
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (mx < B.minX + 6 || mx > B.maxX - 6 || mz < B.minZ + 6 || mz > B.maxZ - 6) continue;
        edges.push([a, b, L, mx, mz]);
      }
    }
    for (const [a, b, L, mx, mz] of subsample(edges, CAP2.shoreEdges)) {
      let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      if (waterAt(mx + nx * 4, mz + nz * 4)) { nx = -nx; nz = -nz; }
      if (waterAt(mx + nx * 4, mz + nz * 4)) continue;      // both sides wet: skip
      const w = 3.2 + sr() * 1.8;
      flatQuad(bAt(mx, mz), [
        [a[0], a[1]], [b[0], b[1]],
        [b[0] + nx * w, b[1] + nz * w], [a[0] + nx * w, a[1] + nz * w],
      ], Y.sand, sandCol);
      shoreCount++;
      if (rockCount < CAP2.rocks && sr() < 0.34) {
        const t = 0.2 + sr() * 0.6;
        const rxp = a[0] + (b[0] - a[0]) * t + nx * (0.4 + sr() * 1.6);
        const rzp = a[1] + (b[1] - a[1]) * t + nz * (0.4 + sr() * 1.6);
        const s = 0.5 + sr() * 0.9;
        bAt(rxp, rzp).box(rxp, s * 0.28, rzp, s, s * 0.75, s * 0.85,
          shade(C.rock, 0.85 + sr() * 0.3), { yaw: sr() * 3.1, noBottom: true });
        rockCount++;
      }
    }

    // Marina docks: walk south (+Z) from the parking apron until the mask says
    // water, then run a finger pier out from there. PLACES.marina is (-1766,-88).
    for (const [sx, sz] of [[-1806, -260], [-1782, -246], [-1756, -232]]) {
      let z = sz;
      while (z < sz + 140 && !waterAt(sx, z)) z += 1;
      if (z >= sz + 140) continue;
      const len = 26;
      const bd = bAt(sx, z + len / 2);
      bd.tower(sx, -0.05, z + len / 2, 2.6, len, 0.5, dockCol, { noBottom: true });
      for (let t = 2; t < len; t += 6) {
        for (const s of [-1, 1]) {
          bd.cyl(sx + s * 1.15, 0.45, z + t, 0.13, 1.5, 5, shade(C.dock, 0.7), 'y', false);
        }
      }
      dockCount++;
    }
  }

  // ------------------------------------------------------------ 6. trees
  const tr = mulberry32(0x7ee5);
  function tree(x, z, scale, conifer) {
    const bd = bAt(x, z);
    const th = 3.0 * scale;
    const pick = tr();
    const leaf = conifer ? CONIFER[(pick * CONIFER.length) | 0] : LEAF[(pick * LEAF.length) | 0];
    bd.cyl(x, th / 2, z, 0.34 * scale, th, 4, rgb(C.trunk), 'y', false);
    if (conifer) {
      // taller, narrower than the deciduous pair
      bd.cone(x, th * 0.45, z, 1.9 * scale, 7.0 * scale, 5, rgb(leaf));
      bd.cone(x, th * 1.5, z, 1.4 * scale, 5.0 * scale, 5, shade(leaf, 1.12));
    } else {
      bd.cone(x, th * 0.7, z, 3.1 * scale, 4.0 * scale, 5, rgb(leaf));
      bd.cone(x, th * 1.5, z, 2.3 * scale, 3.2 * scale, 5, shade(leaf, 1.1));
    }
  }

  const woodPts = [], parkPts = [];
  const pr = mulberry32(0x2b1a55);
  for (const a of MAP.areas) {
    const target = a.k === 'wood' ? woodPts : a.k === 'park' ? parkPts : null;
    if (!target) continue;
    const step = a.k === 'wood' ? 14 : 24;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of a.p) {
      if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
      if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1];
    }
    for (let x = x0 + step * 0.5; x < x1; x += step) {
      for (let z = z0 + step * 0.5; z < z1; z += step) {
        const jx = x + (pr() - 0.5) * step * 0.7, jz = z + (pr() - 0.5) * step * 0.7;
        if (!pointInPoly(a.p, jx, jz)) continue;
        target.push(jx, jz);
      }
    }
  }
  const woodSel = subsample(pairs(woodPts), CAP.woodTrees);
  const parkSel = subsample(pairs(parkPts), CAP.parkTrees);
  for (const q of woodSel) tree(q[0], q[1], 0.85 + tr() * 0.6, tr() < 0.45);
  for (const q of parkSel) tree(q[0], q[1], 1.0 + tr() * 0.7, tr() < 0.15);

  // street trees along residential roads
  const streetTrees = [];
  {
    let flip = 1;
    for (const road of MAP.roads) {
      if (road.cls !== 'residential') continue;
      const pts = road.pts;
      let carry = 13;
      for (let i = 0; i < pts.length - 1; i++) {
        let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        let s = carry;
        while (s < L) {
          const nx = -dz * 6.5 * flip, nz = dx * 6.5 * flip;
          const x = pts[i][0] + dx * s + nx, z = pts[i][1] + dz * s + nz;
          flip = -flip;
          s += 26;
          if (roadAt(x, z)) continue;
          const near = querySegments(x, z, 3);
          if (near.length) continue;
          streetTrees.push(x, z);
        }
        carry = s - L;
      }
    }
  }
  const streetSel = subsample(pairs(streetTrees), CAP.roadTrees);
  for (const q of streetSel) tree(q[0], q[1], 0.9 + tr() * 0.5, tr() < 0.2);
  const treeCount = woodSel.length + parkSel.length + streetSel.length;

  // ------------------------------------------------------------ 7. street furniture
  // R3 — poles are still baked into the chunk mesh (2500 of them as separate
  // draws would cost more than the whole rest of the frame), but each one now
  // remembers which chunk it went into, which slice of that chunk's index
  // buffer it occupies, and which four collider segments are its. Snapping one
  // is then two O(1) writes: blank those indices on the GPU, mark the segments
  // dead. No per-frame cost at all for the ones still standing.
  // (`poles` / `poleGrid` are declared up top so the signal and stop-sign poles,
  // which are built earlier, can register through poleCollider().)
  function poleSegs(x, z) {
    const base = addSegment(x - 0.15, z - 0.15, x + 0.15, z - 0.15);
    addSegment(x + 0.15, z - 0.15, x + 0.15, z + 0.15);
    addSegment(x + 0.15, z + 0.15, x - 0.15, z + 0.15);
    addSegment(x - 0.15, z + 0.15, x - 0.15, z - 0.15);
    return base;
  }
  // Signal / stop-sign poles are built before the chunk bookkeeping exists and
  // aren't snappable: register them with no mesh slice (k = null, n = 0).
  function poleCollider(x, z, kind, h) { addPole(x, z, kind || 'pole', h || 8.4, null, 0, 0); }
  function addPole(x, z, kind, h, k, i0, i1) {
    const p = { x, z, kind, h, k, i0, n: i1 - i0, seg: poleSegs(x, z), dead: false, mesh: null };
    poles.push(p);
    const key = gkey(Math.floor(x / SEG_CELL), Math.floor(z / SEG_CELL));
    const bucket = poleGrid.get(key);
    if (bucket) bucket.push(p); else poleGrid.set(key, [p]);
  }
  // Pool of warm light on the tarmac under the lamp head. Unlit, alpha-blended,
  // and only ever drawn after dark — the cheapest streetlight there is. (W7)
  const poolCol = rgb(C.pool);
  function lightPool(x, z, r) {
    const bd = nAt(x, z);
    const c0 = bd.vert(x, Y.pool2, z, 0, 1, 0, poolCol);
    for (let i = 0; i < DISC; i++) bd.vert(x + discCos[i] * r, Y.pool2, z + discSin[i] * r, 0, 1, 0, poolCol);
    for (let i = 0; i < DISC; i++) {
      const a = c0 + 1 + i, b = c0 + 1 + ((i + 1) % DISC);
      bd.tri(c0, b, a);
    }
    poolCount++;
  }
  function streetlight(x, z, dx, dz) {
    const k = bKey(x, z), bd = bAt(x, z);
    const i0 = bd.i.length;
    bd.cyl(x, 4.2, z, 0.2, 8.4, 4, poleCol, 'y', false);
    bd.box(x + dx * 1.5, 8.2, z + dz * 1.5, 3.0, 0.22, 0.22, poleCol,
      { yaw: Math.atan2(-dz, dx), noBottom: true });
    bd.box(x + dx * 3.0, 7.85, z + dz * 3.0, 1.2, 0.4, 1.0, lampCol, { noBottom: true });
    addPole(x, z, 'streetlight', 8.4, k, i0, bd.i.length);
    lightPool(x + dx * 3.0, z + dz * 3.0, 7.4);
  }
  function hydroPole(x, z, dx, dz) {
    const k = bKey(x, z), bd = bAt(x, z);
    const i0 = bd.i.length;
    bd.cyl(x, 5.4, z, 0.3, 10.8, 4, hydroCol, 'y', false);
    bd.box(x, 10.0, z, 4.0, 0.28, 0.32, hydroCol, { yaw: Math.atan2(-dz, dx), noBottom: true });
    addPole(x, z, 'hydro', 10.8, k, i0, bd.i.length);
  }

  // gather candidate positions first so the cap spreads across the whole map
  const lights = [], hydros = [];
  for (const road of MAP.roads) {
    const paved = PAVED[road.cls] === 1;
    const res = road.cls === 'residential';
    if (!paved && !res) continue;
    const spacing = paved ? 45 : 40;
    const off = road.w / 2 + (paved ? 1.2 : 1.5);
    const pts = road.pts;
    let carry = spacing * 0.5, flip = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      let s = carry;
      while (s < L) {
        const side = paved ? flip : 1;
        const nx = -dz * off * side, nz = dx * off * side;
        const x = pts[i][0] + dx * s + nx, z = pts[i][1] + dz * s + nz;
        (paved ? lights : hydros).push(x, z, -nx / off, -nz / off);
        if (paved) flip = -flip;
        s += spacing;
      }
      carry = s - L;
    }
  }
  const lightSel = subsample(quads4(lights), CAP.poles);
  for (const q of lightSel) streetlight(q[0], q[1], q[2], q[3]);
  const hydroSel = subsample(quads4(hydros), Math.max(0, CAP.poles - lightSel.length));
  for (const q of hydroSel) hydroPole(q[0], q[1], q[2], q[3]);
  const poleCount = lightSel.length + hydroSel.length;

  // grow the dedupe stamp array now that poles have added their colliders
  if (seen.length < (segs.length >> 2)) seen = new Int32Array(segs.length >> 2);

  // ------------------------------------------------------------ 8. distant scenery
  const grassFar = shade(C.grassLo, 0.92);
  // apron: green everywhere outside the map except to the south, which is river
  distant.flat(B.minX - 3000, B.minZ - 3000, B.maxX + 3000, B.maxZ, -0.05, grassFar);
  // the Ottawa River continuing south past the map edge
  distant.flat(-6000, B.maxZ, 6000, 6000, -0.6, waterCol);
  // the Ontario shore: a far tree line read as one dark green block
  distant.tower(0, 0, B.maxZ + 1800, 12000, 90, 40, rgb(C.shore), { noBottom: true });

  // Gatineau hills to the north: four ridges of low-poly cones, hazier further back
  const RIDGES = [
    [B.minZ - 700, 140, 70, 0x3d5a4a],
    [B.minZ - 1100, 190, 80, 0x44614f],
    [B.minZ - 1500, 240, 90, 0x506a5b],
    [B.minZ - 2000, 300, 100, 0x5a7364],
  ];
  for (let r = 0; r < RIDGES.length; r++) {
    const [rz, base, amp, hex] = RIDGES[r];
    const rnd = mulberry32(0x1d0e + r * 977);
    const col = rgb(hex);
    for (let x = -6000; x <= 6000; x += 420) {
      const hh = base + amp * rnd();
      distant.cone(x + (rnd() - 0.5) * 200, -20, rz + (rnd() - 0.5) * 300,
        420 + rnd() * 260, hh, 5, col);
    }
  }

  // ------------------------------------------------------------ pole queries
  segDead = new Uint8Array(segs.length >> 2);
  const poleOut = [];
  function queryPoles(x, z, r) {
    poleOut.length = 0;
    const i0 = Math.floor((x - r) / SEG_CELL), i1 = Math.floor((x + r) / SEG_CELL);
    const j0 = Math.floor((z - r) / SEG_CELL), j1 = Math.floor((z + r) / SEG_CELL);
    const r2 = r * r;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = poleGrid.get(gkey(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const p = arr[k];
          if (p.dead || p.k == null) continue;   // meshless (signal/stop) poles are solid
          const dx = p.x - x, dz = p.z - z;
          if (dx * dx + dz * dz <= r2) poleOut.push(p);
        }
      }
    }
    return poleOut;
  }

  // Snap one. (ux, uz) is the direction the car was travelling, so it goes over
  // that way. Everything after this is one animation entry the game draws.
  const fallen = [];
  function snapPole(p, ux, uz) {
    if (p.dead) return null;
    p.dead = true;
    for (let k = 0; k < 4; k++) segDead[p.seg + k] = 1;
    if (p.mesh && renderer.blankIndices) renderer.blankIndices(p.mesh, p.i0, p.n);
    const f = {
      x: p.x, z: p.z, kind: p.kind, h: p.h,
      yaw: Math.atan2(ux, uz),    // fall away from the bumper
      t: 0,                        // 0 -> 1 over half a second
    };
    fallen.push(f);
    if (fallen.length > 40) fallen.shift();   // the town only has so many
    return f;
  }

  // ------------------------------------------------------------ upload
  let tris = 0;
  const meshByKey = new Map();
  function uploadSet(map, record) {
    const out = [];
    for (const [k, b] of map) {
      if (b.empty) continue;
      tris += b.i.length / 3;
      const mesh = renderer.upload(b);
      if (record) meshByKey.set(k, mesh);
      const cx = B.minX + ((k % NX) + 0.5) * CHUNK;
      const cz = B.minZ + (Math.floor(k / NX) + 0.5) * CHUNK;
      out.push({ mesh, min: mesh.min, max: mesh.max, cx, cz, fade: 0 });
    }
    return out;
  }
  const chunks = uploadSet(builders, true);
  const waterChunks = uploadSet(waterB);
  const nightChunks = uploadSet(nightB);
  for (let i = 0; i < poles.length; i++) poles[i].mesh = poles[i].k == null ? null : (meshByKey.get(poles[i].k) || null);
  const distantMesh = renderer.upload(distant);
  tris += distant.i.length / 3;
  const signage = buildSignage(renderer);

  const dt = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) | 0;
  console.log(`world: ${chunks.length} chunks (+${waterChunks.length} water, ${nightChunks.length} night), `
    + `${tris | 0} tris, ${buildings.length} buildings, `
    + `${MAP.roads.length} roads (${interCount} intersections, ${cornerCount} kerb corners, `
    + `${jointCount} joints, ${dashCount} dashes, ${sidewalkCount} walks, ${stopLineCount} stop lines), `
    + `${SIGNALS.length} signals, ${STOPS.length} stop signs, ${treeCount} trees, ${poleCount} poles, `
    + `${shoreCount} shore, ${rockCount} rocks, ${dockCount} docks, ${poolCount} lamp pools, `
    + `${segs.length >> 2} collider segments, ${signCount} boards, `
    + `${signage ? signage.names.length : 0} storefronts, ${winQuads} windows — ${dt} ms`);

  // ------------------------------------------------------------ draw
  // One call from main.js render(): chunk cull + fade-in, the river, the
  // storefront signs, and the lamp pools after dark. Nothing allocates.
  const noOpts = {};
  const fadeOpts = { fogMul: 1 };
  const waterOpts = { water: true };
  const poolOpts = { alpha: 0.3, unlit: true, colorMul: new Float32Array([1, 0.86, 0.63]) };
  const signOpts = { tex: null };
  let firstFrame = true;

  function draw(r, model, x, z, drawDist, dtSec) {
    const dd2 = drawDist * drawDist;
    const step = firstFrame ? 1 : Math.min(1, (dtSec || 0) / FADE);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const dx = c.cx - x, dz = c.cz - z;
      if (dx * dx + dz * dz > dd2) { c.fade = 0; continue; }
      if (c.fade < 1) c.fade = Math.min(1, c.fade + step);
      if (!r.visible(c.mesh)) continue;
      if (c.fade >= 1) r.draw(c.mesh, model, noOpts);
      else {
        // W2: a new chunk arrives buried in fog and thins out over FADE seconds,
        // which reads as a fade without paying for a transparent pass.
        fadeOpts.fogMul = 1 + (1 - c.fade) * 3.2;
        r.draw(c.mesh, model, fadeOpts);
      }
    }
    for (let i = 0; i < waterChunks.length; i++) {
      const c = waterChunks[i];
      const dx = c.cx - x, dz = c.cz - z;
      if (dx * dx + dz * dz > dd2 * 2.6) continue;      // the river reads from far off
      if (r.visible(c.mesh)) r.draw(c.mesh, model, waterOpts);
    }
    if (signage) {
      signOpts.tex = signage.tex;
      if (r.visible(signage.mesh)) r.draw(signage.mesh, model, signOpts);
    }
    const night = nightAmount(r.env);
    if (night > 0.02) {
      poolOpts.alpha = 0.34 * night;
      for (let i = 0; i < nightChunks.length; i++) {
        const c = nightChunks[i];
        const dx = c.cx - x, dz = c.cz - z;
        if (dx * dx + dz * dz > 330 * 330) continue;
        if (r.visible(c.mesh)) r.draw(c.mesh, model, poolOpts);
      }
    }
    firstFrame = false;
  }

  return {
    chunks,
    waterChunks,
    nightChunks,
    signage,
    distant: distantMesh,
    poles,
    signals: SIGNALS,
    stopSigns: STOPS,
    intersections: interCount,
    draw,
    querySegments,
    roadAt,
    waterAt,
    nearestRoad,
    queryPoles,
    snapPole,
    fallen,                 // poles on their way down / lying there
    poleCount,
    bounds: B,
  };
}

// How dark it is, 0 by day and 1 at night, from the ambient sky colour — so it
// follows the environment blend instead of needing a flag threaded through.
export function nightAmount(env) {
  if (!env) return 0;
  const s = env.sky;
  const lum = 0.3 * s[0] + 0.59 * s[1] + 0.11 * s[2];
  return clamp((0.36 - lum) / 0.2, 0, 1);
}

// Two translucent wedges in car-local space (nose at +Z), drawn unlit in front
// of the player at night. One mesh, one draw. (W7)
export function buildHeadlights(renderer, spec) {
  const b = new MeshBuilder();
  const col = [1, 0.95, 0.78];
  const zf = (spec ? spec.len : 4.4) * 0.5;
  for (const s of [-1, 1]) {
    const ox = s * 0.62;
    // near edge at the lamp, far edge 15 m out and wide, sloping down to the road
    const p0 = [ox - 0.16, 0.62, zf], p1 = [ox + 0.16, 0.62, zf];
    const p2 = [ox * 0.4 + 2.6, 0.06, zf + 15], p3 = [ox * 0.4 - 2.6, 0.06, zf + 15];
    b.quad(p1, p0, p3, p2, col, [0, 1, 0]);
  }
  return renderer.upload(b);
}

// flat [x,z,x,z,...] -> [[x,z],...]
function pairs(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}
// flat [x,z,dx,dz,...] -> [[x,z,dx,dz],...]
function quads4(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 4) out.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3]]);
  return out;
}
