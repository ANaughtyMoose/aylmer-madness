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
// buildWorld(renderer, mats) returns:  (`mats` is the material provider from
// game/materials.js — the atlas — or materials_stub.js for the vertex-colour
// fallback; houses are the only geometry that uses it)
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
//   querySegments / roadAt / waterAt / groundAt / nearestRoad / bounds / distant
//   groundAt(x,z)  the terrain.js height field, baked into the chunk meshes here
//                  (section 5c) so the geometry and the physics cannot disagree
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
import { buildHouse, makeStreetYawIndex } from './houses.js';
import { buildTerrain } from './terrain.js';
import MATS from './materials_stub.js';

const CHUNK = 200;      // world chunk size (metres)
// How far the detailed (lod 0) house bake reaches, measured to the chunk CENTRE.
// Beyond it a chunk draws the lod 2 silhouette instead. 200 m is one chunk past
// the one you are in — windows and doors are a couple of pixels by then — and it
// keeps the per-frame triangle count within a few percent of what the old
// single-lod bake drew. Measured (world geometry only, medium quality):
//   Chemin Foley 22.8k, Rue Bancroft 28.3k, Denise-Friend 36.5k tris a frame.
export const HOUSE_NEAR = 200;
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
  gutter: 0x505055, shoulder: 0x827b6e,
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
const SHRUB = [0x416b35, 0x527d3d, 0x638b46, 0x355c38];
const BLOOM = [0xe4c34f, 0xd96b73, 0xb985c8, 0xe8e2d2];

const GABLE = { house: 1, terrace: 1, shed: 1 };
const MAJOR = { trunk: 1, primary: 1, secondary: 1 };
const PAVED = { trunk: 1, primary: 1, secondary: 1, tertiary: 1 };

// Caps — the whole scene has to stay well under 450k triangles.
const CAP = { woodTrees: 900, parkTrees: 500, roadTrees: 1800, shrubs: 950, poles: 2500 };

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
// Mean of a footprint's points — which side of a seam a building is on.
function polyCentre(p) {
  let x = 0, z = 0;
  for (let i = 0; i < p.length; i++) { x += p[i][0]; z += p[i][1]; }
  return [x / p.length, z / p.length];
}
// Where a terrain feature is, whatever shape it takes (terrain.js).
function featureCentre(f) {
  if (f.cx != null) return [f.cx, f.cz];
  if (f.x != null) return [f.x, f.z];
  if (f.pts && f.pts.length >= 2) {
    let x = 0, z = 0, n = 0;
    for (let i = 0; i + 1 < f.pts.length; i += 2) { x += f.pts[i]; z += f.pts[i + 1]; n++; }
    return [x / n, z / n];
  }
  return [0, 0];
}
// The roads of one slice: each way is cut into runs of consecutive segments
// whose midpoints are inside, so a road that crosses a seam is built up to the
// seam by one side and from it by the other, with the crossing segment drawn
// exactly once. `ids` (OSM node ids, the intersection finder's key) are sliced
// in step with `pts`.
export function clipRoads(roads, inside) {
  const out = [];
  for (const road of roads) {
    const pts = road.pts, n = pts.length;
    if (n < 2) continue;
    let run = null;
    for (let i = 0; i < n - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
      if (inside(mx, mz)) {
        if (!run) run = { from: i, to: i + 1 }; else run.to = i + 1;
      } else if (run) { out.push(cut(road, run)); run = null; }
    }
    if (run) out.push(run.from === 0 && run.to === n - 1 ? road : cut(road, run));
  }
  return out;
}
function cut(road, run) {
  const r = { ...road, pts: road.pts.slice(run.from, run.to + 1) };
  if (road.ids) r.ids = road.ids.slice(run.from, run.to + 1);
  return r;
}

function subsample(list, cap) {
  if (list.length <= cap) return list;
  const stride = list.length / cap;
  const out = [];
  for (let i = 0; out.length < cap && Math.floor(i) < list.length; i += stride) {
    out.push(list[Math.floor(i)]);
  }
  return out;
}

export function buildWorld(renderer, mats = MATS, opts = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const B = MAP.bounds;
  const NX = Math.ceil((B.maxX - B.minX) / CHUNK);
  const NZ = Math.ceil((B.maxZ - B.minZ) / CHUNK);

  // ------------------------------------------------------------ sector filter
  // sectors.js builds the map a slice at a time: `opts.inside(x, z)` says
  // whether a point belongs to the slice being baked, and everything the map
  // offers goes through it — roads clipped to the runs of segments whose
  // midpoints are in, buildings by centroid, landuse triangle by triangle,
  // ground chunk by centre — so a slice is a self-contained piece of the same
  // bake and two neighbours never lay the same asphalt twice. The chunk grid
  // itself stays global (B is the whole map), so a chunk on a seam simply ends
  // up with a mesh from each side. With no `inside` (every smoke test, the lab
  // pages) this is the whole map, exactly as before.
  const inside = opts.inside || null;
  const roads = inside ? clipRoads(MAP.roads, inside) : MAP.roads;
  const bldgs = inside
    ? MAP.buildings.filter((b) => { const c = polyCentre(b.p); return inside(c[0], c[1]); })
    : MAP.buildings;
  const areas = inside ? MAP.areas.filter((a) => a.p.some((q) => inside(q[0], q[1]))) : MAP.areas;
  const pois = inside ? (MAP.pois || []).filter((q) => inside(q.x, q.z)) : (MAP.pois || []);

  const builders = new Map();
  const waterB = new Map();     // river/pond triangles, drawn with the wobble shader
  const nightB = new Map();     // streetlight pools, drawn only after dark
  // Houses are baked TWICE, into their own per-chunk meshes: `houseNearB` at
  // lod 0 (windows, doors, porches, real materials) and `houseFarB` at lod 2
  // (the old extrude-and-cap silhouette, vertex colours only). draw() picks one
  // per chunk by distance, so the near geometry never leaves the block you are
  // driving through and the far mesh carries no UV/rect attributes at all.
  // Everything else in town stays in `builders`, untextured, exactly as before.
  const houseNearB = new Map();
  const houseFarB = new Map();
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
  function hnAt(x, z) { return pick(houseNearB, x, z); }
  function hfAt(x, z) { return pick(houseFarB, x, z); }
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

  // A footprint edge that lies across a carriageway is an invisible wall in the
  // middle of a road. OpenStreetMap genuinely has buildings drawn over roadways
  // — canopies, bridged blocks, and plain mapping errors — and downtown Ottawa
  // has enough of them to stop you dead on Wellington Street and on Kichi Zībī
  // Mīkan. Street furniture is already kept off the asphalt (see clearRuns);
  // this is the same rule for the walls.
  //
  // The test is deliberately mean. A building that merely meets the kerb is a
  // real building and its wall has to stay, so an edge is only dropped when it
  // is at least WALL_INSET *inside* the asphalt at its midpoint AND at one end
  // — one point clipping a corner is not enough.
  const WALL_INSET = -0.6;              // metres inside the road edge, so negative
  let wallsOffRoad = 0;
  function addWallSegment(ax, az, bx, bz) {
    if (pavedAt((ax + bx) / 2, (az + bz) / 2, -1, WALL_INSET)
      && (pavedAt(ax, az, -1, WALL_INSET) || pavedAt(bx, bz, -1, WALL_INSET))) {
      wallsOffRoad++;
      return -1;
    }
    return addSegment(ax, az, bx, bz);
  }

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
      const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[1] + b[1] + c[1]) / 3;
      if (inside && !inside(mx, mz)) continue;
      const bd = into(mx, mz);
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
      if (inside && !inside((x0 + x1) / 2, (z0 + z1) / 2)) continue;
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
  for (const a of areas) {
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

  // -------------------------------------------------- 4a. the road broadphase
  // Built BEFORE any geometry, because every piece of street furniture laid
  // beside a road — gutter, sidewalk slab, kerb corner, shoulder, streetlight,
  // park tree — has to be able to ask whether it is about to land in somebody
  // else's lane. It used to be filled inside the geometry loop below, so a way
  // could only ever see the ways ahead of it in MAP.roads, which is to say
  // almost none of them at the point where it laid its pavement.
  //
  // Seven slots a segment: ax, az, bx, bz, rad2 (roadAt's generous kerb + 0.8,
  // which is what the car's on-tarmac test has always used), hw (the honest
  // half width of the asphalt) and ri (the way it came from).
  const roadSegs = [];
  const roadGrid = new Map();
  const nearSegs = [];         // ax,az,bx,bz,roadIndex for nearestRoad (non-service)
  for (let ri = 0; ri < roads.length; ri++) {
    const road = roads[ri];
    const pts = road.pts, n = pts.length;
    if (n < 2) continue;
    const hw = road.w / 2;
    const rad = hw + 0.8;
    const service = road.cls === 'service';
    for (let i = 0; i < n - 1; i++) {
      const idx = roadSegs.length / 7;
      roadSegs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rad * rad, hw, ri);
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
      if (!service) nearSegs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ri);
    }
  }
  const roadSegArr = Float64Array.from(roadSegs);

  // "Is the car on tarmac?" — unchanged, kerb + 0.8 so a wheel on the gutter
  // still counts as on the road.
  function roadAt(x, z) {
    const arr = roadGrid.get(gkey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
    if (!arr) return false;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k] * 7;
      if (distPtSeg2(x, z, roadSegArr[o], roadSegArr[o + 1], roadSegArr[o + 2], roadSegArr[o + 3])
        <= roadSegArr[o + 4]) return true;
    }
    return false;
  }

  // "Would this piece of street furniture be standing in a lane?" — the honest
  // asphalt half width plus `margin`, ignoring the way the piece belongs to
  // (`skip` < 0 tests every way). The Hull sector brought five times as much
  // road with it, and with it a lot of parallel and shallow-angle duplicates: a
  // dual carriageway, or one street cut into two ways where its name changes.
  // Each of those used to lay its own pavement straight across the other's
  // asphalt, which is the sidewalk-in-the-road the owner keeps driving over.
  // `margin` must stay under 0.8 or it outruns the grid registration above.
  function pavedAt(x, z, skip, margin) {
    const arr = roadGrid.get(gkey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
    if (!arr) return false;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k] * 7;
      if (roadSegArr[o + 6] === skip) continue;
      const r = roadSegArr[o + 5] + margin;
      if (distPtSeg2(x, z, roadSegArr[o], roadSegArr[o + 1], roadSegArr[o + 2], roadSegArr[o + 3])
        <= r * r) return true;
    }
    return false;
  }

  // Every candidate piece of furniture, flattened, for tools/smoke_world.mjs:
  // where it was going, which way it belongs to (-1 = nobody's) and whether the
  // asphalt test threw it out. The test asserts nothing that survived is
  // standing in a lane, and reports how many were rejected.
  const furn = { x: [], z: [], kind: [], road: [], dropped: [] };
  function noteFurniture(x, z, kind, ri, dropped) {
    furn.x.push(x); furn.z.push(z); furn.kind.push(kind);
    furn.road.push(ri); furn.dropped.push(dropped ? 1 : 0);
  }
  let furnDropped = 0;         // pieces refused for sitting on drivable asphalt

  // Walk a stretch of one road segment and hand back the runs where a piece of
  // furniture clears every other way's asphalt at all of `offs` lateral offsets.
  // Clipping instead of dropping is what keeps the pavement running right up to
  // the kerb of the street that crosses it, rather than losing the whole block.
  // The returned array is reused; copy anything you keep.
  const runOut = [];
  function clearRuns(px, pz, dx, dz, nx, nz, s0, s1, offs, ci, skip, margin, step, kind, ri) {
    runOut.length = 0;
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    let open = -1, last = 0;
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * (i / n);
      const cx = px + dx * s, cz = pz + dz * s;
      let hit = false;
      for (let k = 0; k < offs.length && !hit; k++) {
        hit = pavedAt(cx + nx * offs[k], cz + nz * offs[k], skip, margin);
      }
      if (hit) {
        // Record where the band would have gone, so the smoke test can report
        // how much of it used to be laid across a lane.
        noteFurniture(cx + nx * offs[ci], cz + nz * offs[ci], kind, ri, true);
        furnDropped++;
        if (open >= 0 && last > open) runOut.push(open, last);
        open = -1;
      } else {
        if (open < 0) open = s;
        last = s;
      }
    }
    if (open >= 0 && last > open) runOut.push(open, last);
    return runOut;
  }

  let jointCount = 0, sidewalkCount = 0, dashCount = 0;
  let interCount = 0, cornerCount = 0, stopLineCount = 0;
  const LOFF = [0, 0, 0, 0];   // lateral offset scratch for clearRuns

  // -------------------------------------------------- 4b. intersections (W3)
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
        // `ext + 1.9` is where the two kerb lines meet when two equal streets
        // cross square, and wrong the moment they do not: `ext` is the WIDEST
        // branch's half width, so at a residential/secondary T the slab lands
        // inside the wide road's lane, and at a shallow fork the bisector runs
        // down the middle of both branches. Step out along the bisector until
        // the slab's centre is off the asphalt; if 4.8 m of it does not get
        // clear, the two arms are near enough parallel that there is no corner
        // there at all, and none is laid.
        let d = ext + 1.9, cx = 0, cz = 0, placed = false;
        for (let k = 0; k < 9; k++, d += 0.6) {
          cx = nd.x + ux * d; cz = nd.z + uz * d;
          if (!pavedAt(cx, cz, -1, 0.2)) { placed = true; break; }
        }
        noteFurniture(cx, cz, 'kerb', -1, !placed);
        if (!placed) { furnDropped++; continue; }
        bAt(cx, cz).tower(cx, 0, cz, 2.8, 2.8, 0.12, walkCol,
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
  // Stable street-level hash: all fragments with the same name get the same
  // sidewalk policy, avoiding a pavement that randomly swaps sides mid-block.
  function streetHash(name, fallback) {
    let h = 2166136261 ^ fallback;
    const s = name || '';
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const gutterCol = rgb(C.gutter), shoulderCol = rgb(C.shoulder);
  for (let ri = 0; ri < roads.length; ri++) {
    const road = roads[ri];
    const pts = road.pts, ids = road.ids, n = pts.length;
    if (n < 2) continue;
    const hw = road.w / 2;
    const isService = road.cls === 'service';
    const y = isService ? Y.service : Y.road;
    const col = roadCols[road.cls] || roadCols.residential;
    const major = MAJOR[road.cls] === 1;
    const paved = PAVED[road.cls] === 1;
    const rh = streetHash(road.name, ri);
    // Collectors have walks on both sides. Some residential streets get a walk
    // on one consistent side; the rest retain the soft
    // shoulder common in older Aylmer neighbourhoods.
    const residentialWalk = road.cls === 'residential' && (rh % 100) < 18;
    const walkSides = paved ? [1, -1]
      : residentialWalk ? [(rh & 1) ? 1 : -1] : [];

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

    // asphalt: one quad per segment, chunked by midpoint. A mitre can extend
    // beyond a very short neighbouring segment and fold the strip into a bow
    // tie. Fall back to the segment's own square corners in that case; the
    // joint disc (or intersection polygon) already covers the resulting seam.
    for (let i = 0; i < n - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
      let l0x = lx[i], l0z = lz[i], r0x = rx[i], r0z = rz[i];
      let l1x = lx[i + 1], l1z = lz[i + 1], r1x = rx[i + 1], r1z = rz[i + 1];
      const cross = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const a0 = cross(l0x, l0z, r0x, r0z, r1x, r1z);
      const a1 = cross(l0x, l0z, r1x, r1z, l1x, l1z);
      if (a0 >= -1e-6 || a1 >= -1e-6) {
        const nx = dzs[i] * hw, nz = -dxs[i] * hw;
        l0x = pts[i][0] + nx; l0z = pts[i][1] + nz;
        r0x = pts[i][0] - nx; r0z = pts[i][1] - nz;
        l1x = pts[i + 1][0] + nx; l1z = pts[i + 1][1] + nz;
        r1x = pts[i + 1][0] - nx; r1z = pts[i + 1][1] - nz;
      }
      bAt(mx, mz).quad(
        [l0x, y, l0z], [r0x, y, r0z],
        [r1x, y, r1z], [l1x, y, l1z], col, UP);
      // Streets without a concrete walk transition through a narrow compacted
      // shoulder, rather than ending in a perfectly sharp asphalt/grass seam.
      if (road.cls === 'residential' && walkSides.length === 0 && lens[i] > 2) {
        const yaw = Math.atan2(dxs[i], dzs[i]);
        const nx = dzs[i], nz = -dxs[i];
        for (const side of [1, -1]) {
          // The gravel edge is only 0.68 m wide, but it is still 0.68 m of
          // shoulder painted down the middle of whatever runs alongside.
          LOFF.length = 2;
          LOFF[0] = (hw + 0.34) * side; LOFF[1] = (hw + 0.68) * side;
          const runs = clearRuns(pts[i][0], pts[i][1], dxs[i], dzs[i],
            nx, nz, 0, lens[i], LOFF, 0, ri, 0.2, 2, 'shoulder', ri);
          for (let q = 0; q < runs.length; q += 2) {
            const L = runs[q + 1] - runs[q];
            if (L < 1.5) continue;
            const c = (runs[q] + runs[q + 1]) / 2;
            const bx = pts[i][0] + dxs[i] * c, bz = pts[i][1] + dzs[i] * c;
            const sx = bx + nx * (hw + 0.34) * side, sz = bz + nz * (hw + 0.34) * side;
            bAt(sx, sz).flatRot(sx, sz, 0.68, L, Y.service - 0.002, yaw, shoulderCol);
            noteFurniture(sx, sz, 'shoulder', ri, false);
          }
        }
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

    // Concrete sidewalks outside the asphalt, stopping at the kerb corners.
    // A dark gutter strip and a small height step make the road edge read as a
    // curb instead of two coplanar ribbons. Residential streets use the stable
    // one-/two-side policy above.
    if (walkSides.length) {
      for (let i = 0; i < n - 1; i++) {
        const s0 = cut[i] > 0 ? cut[i] + 1.4 : 0;
        const s1 = lens[i] - (cut[i + 1] > 0 ? cut[i + 1] + 1.4 : 0);
        if (s1 - s0 < 3) continue;
        const dx = dxs[i], dz = dzs[i];
        const yaw = Math.atan2(dx, dz);
        const nx = dz, nz = -dx;
        const off = hw + 1.075;
        for (const s of walkSides) {
          // Four samples across the band — the gutter, both edges of the 1.75 m
          // slab and its middle — so a way crossing at a shallow angle clips the
          // far edge long before it has reached the centreline. `cut` only knows
          // about junctions this way is noded into; two ways that merely lie on
          // top of each other, or cross without sharing a node, are invisible to
          // it and are exactly what this test catches.
          LOFF.length = 4;
          LOFF[0] = (hw + 0.11) * s; LOFF[1] = (hw + 0.3) * s;
          LOFF[2] = off * s; LOFF[3] = (hw + 1.85) * s;
          const runs = clearRuns(pts[i][0], pts[i][1], dx, dz, nx, nz, s0, s1,
            LOFF, 2, ri, 0.25, 1.5, 'walk', ri);
          for (let q = 0; q < runs.length; q += 2) {
            const L = runs[q + 1] - runs[q];
            if (L < 3) continue;      // too short to read as pavement
            const mid = (runs[q] + runs[q + 1]) / 2;
            const mx = pts[i][0] + dx * mid, mz = pts[i][1] + dz * mid;
            const gx = mx + nx * (hw + 0.11) * s, gz = mz + nz * (hw + 0.11) * s;
            bAt(gx, gz).flatRot(gx, gz, 0.28, L, Y.road + 0.008, yaw, gutterCol);
            const cx = mx + nx * off * s, cz = mz + nz * off * s;
            bAt(cx, cz).tower(cx, 0, cz, 1.75, L, 0.12, walkCol, { yaw, noBottom: true });
            // Both ends as well as the middle: a slab is a long thing and the
            // smoke test should be sampling all of it, not just its centre.
            noteFurniture(cx, cz, 'walk', ri, false);
            for (const e of [runs[q] + 0.2, runs[q + 1] - 0.2]) {
              noteFurniture(pts[i][0] + dx * e + nx * off * s,
                pts[i][1] + dz * e + nz * off * s, 'walk', ri, false);
            }
            sidewalkCount++;
          }
        }
      }
    }
  }

  // -------------------------------------------------- 4c. signals & stop signs
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
    // Planned over the whole road graph (signals.js has no idea about sectors);
    // only the ones standing in this slice get a post.
    const a0 = sig.approaches[0];
    if (inside && a0 && !inside(a0.poleX, a0.poleZ)) continue;
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
    if (inside && !inside(s.poleX, s.poleZ)) continue;
    const bd = bAt(s.poleX, s.poleZ);
    bd.cyl(s.poleX, 1.15, s.poleZ, 0.065, 2.3, 4, poleCol, 'y', false);
    octagon(bd, s.poleX, 2.34, s.poleZ, 0.47, s.faceYaw, stopRim, 0.0);
    octagon(bd, s.poleX, 2.34, s.poleZ, 0.40, s.faceYaw, stopRed, 0.03);
    poleCollider(s.poleX, s.poleZ, 'stopsign', 2.3);
    stopLine(s.x, s.z, s.dx, s.dz, s.hw, s.yaw);
  }

  // ------------------------------------------------------------ 5. buildings
  // Houses and terraces go through the parametric archetypes in houses.js
  // (era / storeys / roof form from Phase 1's `b.hs`, inferred where it is
  // missing); everything else keeps the extrude-and-cap below. Each house is
  // baked twice — lod 0 with windows, doors, porches and the real materials for
  // the chunk you are in, lod 2 for the rest of town (see docs/HOUSES.md).
  const streetYawAt = makeStreetYawIndex(roads);
  const HOUSEY = { house: 1, terrace: 1 };
  let houseCount = 0, houseTris = 0, houseFarTris = 0;
  let landmarkRoofs = 0;
  const buildings = bldgs;
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
    // Phase 1 gives 537 dwellings an `hs` blob while OSM still calls them
    // 'commercial' on footprint size alone, so the attributes decide too.
    if (HOUSEY[b.k] === 1 || b.hs) {
      const sy = streetYawAt(c[0], c[1], -b.a);
      const seed = (bi * 2654435761 + 0x9e3779b9) >>> 0;
      // Near: full detail, the real atlas, and the ONLY call that registers
      // colliders — the far copy is the same house, so it must not add them again.
      const hr = buildHouse(hnAt(c[0], c[1]), b, b.hs || null, mats, mulberry32(seed), {
        lod: 0, index: bi, streetYaw: sy,
        addSegment: addWallSegment, // one call per footprint edge, same order as before
      });
      // Far: same seed, so recipe() draws the same tiles and the silhouette
      // wears the same brick; the stub provider keeps it vertex-coloured.
      const fr = buildHouse(hfAt(c[0], c[1]), b, b.hs || null, MATS, mulberry32(seed), {
        lod: 2, index: bi, streetYaw: sy,
      });
      houseCount++; houseTris += hr.tris || 0; houseFarTris += fr.tris || 0;
      continue;
    }
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
      addWallSegment(p[i][0], p[i][1], p[(i + 1) % n][0], p[(i + 1) % n][1]);
    }

    const ang = b.a, ca = Math.cos(ang), sa = Math.sin(ang);
    const e = extents(p, c, ca, sa);
    const ew = e.u1 - e.u0, ed = e.v1 - e.v0;
    const cu = (e.u0 + e.u1) / 2, cv = (e.v0 + e.v1) / 2;
    const gx = c[0] + cu * ca - cv * sa, gz = c[1] + cu * sa + cv * ca;

    const isChurch = b.k === 'church';
    // OSM tags the golf clubhouse as a commercial footprint, which normally
    // gets the anonymous flat/parapet treatment. Its long articulated outline
    // then reads as three brown slabs from the job marker. Give this named
    // landmark the low dark roof the player expects to navigate toward.
    const isClubhouse = b.name === 'Club de Golf Gatineau';
    if (GABLE[b.k] === 1 || isChurch || isClubhouse) {
      // Gable: a flat cap at h (covers L-shapes) with a ridged prism over it,
      // rotated so the ridge runs along the footprint's longest edge.
      const roofCol = isChurch ? gableCols[2]
        : isClubhouse ? rgb(0x3f4938)
        : gableCols[(rnd() * 6) | 0];
      triTo(bd, p, b.t, h, roofCol);
      const rh = isClubhouse ? clamp(0.16 * ed, 1.5, 3.8) : clamp(0.35 * ed, 1.6, 3.2);
      bd.roof(gx, h, gz, ew, ed, rh, roofCol, -ang, 0.4);
      if (isClubhouse) landmarkRoofs++;
    } else {
      triTo(bd, p, b.t, h, flatRoofCol);
      // A parapet needs vertical faces. The previous inset cap floated 40 cm
      // above the roof with nothing beneath it, especially obvious against the
      // sky. Close it on buildings where roof detail matters; anonymous map
      // blocks keep the single clean roof cap and save a large amount of mesh.
      const properParapet = !!b.name || b.k === 'commercial' || b.k === 'apartments'
        || b.k === 'mall' || b.k === 'public' || b.k === 'school' || b.k === 'industrial';
      if (properParapet) {
        shrunk.length = 0;
        for (let i = 0; i < n; i++) {
          const dx = p[i][0] - c[0], dz = p[i][1] - c[1];
          const d = Math.hypot(dx, dz) || 1;
          const f = clamp(0.42 / d, 0, 0.32);
          shrunk.push([p[i][0] - dx * f, p[i][1] - dz * f]);
        }
        bd.prism(shrunk, h, 0.38, shade(C.flatRoof, 0.62));
        triTo(bd, shrunk, b.t, h + 0.38, shade(C.flatRoof, 0.78));
      }
    }

    if (isChurch) {
      const sx = c[0] + ca * ew * 0.4, sz = c[1] + sa * ew * 0.4;
      bd.tower(sx, 0, sz, 2.5, 2.5, h * 1.8, rgb(wallHex), { noBottom: true });
      bd.cone(sx, h * 1.8, sz, 1.9, 5.5, 6, gableCols[0]);
    }

    // Façade openings. Individual punched windows read as apartments/schools;
    // the old wall-wide dark strips made every tall building look like a glass
    // warehouse. Raw footprint edges are used directly, with generous corner
    // clearance, so panels cannot turn the corner and clip through one another.
    const hasPublicDoor = b.k === 'commercial' || b.k === 'apartments' || b.k === 'mall'
      || b.k === 'public' || b.k === 'school';
    if (h >= 5.2 || (hasPublicDoor && h >= 3.2)) {
      const floors = Math.max(1, Math.min(6, Math.floor((h - 0.35) / 3.05)));
      const streetYaw = streetYawAt(c[0], c[1], -b.a);
      const snx = Math.cos(streetYaw), snz = Math.sin(streetYaw);
      let frontEdge = -1, frontDot = -2;
      for (let i = 0; i < n; i++) {
        const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
        const a = p[ia], q = p[ib];
        const dx = q[0] - a[0], dz = q[1] - a[1], L = Math.hypot(dx, dz);
        if (L < 3) continue;
        const dot = (-dz / L) * snx + (dx / L) * snz;
        if (dot > frontDot) { frontDot = dot; frontEdge = i; }
      }
      let quads = 0;
      // Anonymous imported massing stays deliberately cheap. Important public,
      // retail and apartment buildings get enough openings to establish scale.
      const maxFacadeQuads = b.k === 'big' ? 4 : 18;
      for (let f = 0; f < floors && quads < maxFacadeQuads; f++) {
        const wh = f === 0 && b.k === 'commercial' ? 1.7 : 1.15;
        const y0 = 0.82 + f * 3.05, y1 = y0 + wh;
        if (y1 > h - 0.42) break;
        for (let i = 0; i < n && quads < maxFacadeQuads; i++) {
          const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
          const a = p[ia], q = p[ib];
          let dx = q[0] - a[0], dz = q[1] - a[1];
          const L = Math.hypot(dx, dz);
          if (L < 3.2) continue;
          dx /= L; dz /= L;
          const nx = -dz * 0.065, nz = dx * 0.065;
          const count = Math.max(1, Math.min(7, Math.floor((L - 1.2) / 2.7)));
          const ww = f === 0 && b.k === 'commercial'
            ? Math.min(2.15, (L - 1.1) / count * 0.72) : Math.min(1.25, (L - 1.1) / count * 0.46);
          for (let k = 0; k < count && quads < maxFacadeQuads; k++) {
            const t = 0.62 + ((k + 0.5) / count) * (L - 1.24);
            if (hasPublicDoor && f === 0 && i === frontEdge && Math.abs(t - L / 2) < 1.25) continue;
            const cx = a[0] + dx * t + nx, cz = a[1] + dz * t + nz;
            const tx = dx * ww / 2, tz = dz * ww / 2;
            bd.quad([cx - tx, y0, cz - tz], [cx + tx, y0, cz + tz],
              [cx + tx, y1, cz + tz], [cx - tx, y1, cz - tz], winCol);
            quads++; winQuads++;
          }
        }
      }
      if (hasPublicDoor && frontEdge >= 0) {
        const ia = fwd ? frontEdge : (frontEdge + 1) % n;
        const ib = fwd ? (frontEdge + 1) % n : frontEdge;
        const a = p[ia], q = p[ib];
        let dx = q[0] - a[0], dz = q[1] - a[1];
        const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        const nx = -dz * 0.075, nz = dx * 0.075;
        const cx = (a[0] + q[0]) / 2 + nx, cz = (a[1] + q[1]) / 2 + nz;
        const dw = Math.min(1.55, Math.max(0.9, L * 0.16));
        const tx = dx * dw / 2, tz = dz * dw / 2;
        bd.quad([cx - tx, 0.08, cz - tz], [cx + tx, 0.08, cz + tz],
          [cx + tx, 2.35, cz + tz], [cx - tx, 2.35, cz - tz], shade(C.win, 0.68));
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

  // ------------------------------------------------------------ nearestRoad
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
        bname = roads[nearArr[o + 4]].name || '';
      }
    }
    return { x: bx, z: bz, yaw: byaw, name: bname, dist: Math.sqrt(best) };
  }

  // ------------------------------------------------------------ water mask
  const wm = MAP.waterMask;
  const mask = Uint8Array.from(atob(wm.b64), (ch) => ch.charCodeAt(0));
  const extraWater = MAP.expansionWater || [];
  function waterAt(x, z) {
    const i = Math.floor((x - (wm.minX ?? B.minX)) / wm.cell);
    const j = Math.floor((z - (wm.minZ ?? B.minZ)) / wm.cell);
    if (i >= 0 && i < wm.w && j >= 0 && j < wm.h && mask[j * wm.w + i] === 1) return true;
    for (const p of extraWater) if (pointInPoly(p, x, z)) return true;
    return false;
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
        if (inside && !inside(mx, mz)) continue;
        if (mx < B.minX + 6 || mx > B.maxX - 6 || mz < B.minZ + 6 || mz > B.maxZ - 6) continue;
        edges.push([a, b, L, mx, mz]);
      }
    }
    for (const [a, b, L, mx, mz] of subsample(edges, CAP2.shoreEdges)) {
      let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      if (waterAt(mx + nx * 4, mz + nz * 4)) { nx = -nx; nz = -nz; }
      if (waterAt(mx + nx * 4, mz + nz * 4)) continue;      // both sides wet: skip
      const w = 3.2 + sr() * 1.8;
      // Where the road runs along the bank — the marina apron, Principale by
      // the Symmes — the land side of the edge is asphalt, and a 5 m ribbon of
      // beach used to be laid straight down it.
      {
        const bad = pavedAt(mx + nx * w * 0.5, mz + nz * w * 0.5, -1, 0.3)
          || pavedAt(mx + nx * w, mz + nz * w, -1, 0.3);
        noteFurniture(mx + nx * w * 0.5, mz + nz * w * 0.5, 'shore', -1, bad);
        if (bad) { furnDropped++; continue; }
      }
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

  // ------------------------------------------------------- 5c. the height field
  // Everything in town that is not at y = 0 (terrain.js). The physics query and
  // the geometry come from the SAME analytic functions, so the mesh under the
  // wheels is the mesh you can see — no sampling error, no floating cars.
  //
  // Each feature emits its own surface at the resolution its shape needs (a pad
  // is exact: nine planar regions; a mound is a small radial fan; a ridge is
  // cross-sections along its spine) and, where a side is a vertical face rather
  // than a slope, a wall quad and — only if the feature asks for it — a collider.
  // Ramp faces never get colliders: you are supposed to go up them.
  const terrain = buildTerrain();
  const groundAt = terrain.groundAt;
  const TC = {
    asphalt: 0x3f3f44, concrete: 0x9d9a92, gravel: 0x8a8276, grass: 0x6d8a4c,
    sand: 0xd9cba4, path: 0x928b7c, dirt: 0x7c6449, stair: 0xa8a49a,
  };
  const terrainStats = { features: 0, tris: 0, walls: 0, colliders: 0, decks: 0 };

  // Height + kind at a point, straight from the same evaluator the car uses.
  function tKind(f, x, z) {
    const g = groundAt(x, z);
    return g.kind || f.side || f.kind;
  }
  function tCol(kind, k) { return shade(TC[kind] || TC.grass, k); }

  // One surface triangle, normal taken from the height field so the lighting
  // agrees with the physics. `p` is [x,z] pairs; y comes from groundAt.
  function tTri(ax, az, bx, bz, cx2, cz2, kind, tint) {
    const bd = bAt((ax + bx + cx2) / 3, (az + bz + cz2) / 3);
    const ay = groundAt(ax, az).h;
    const by = groundAt(bx, bz).h;
    const g = groundAt(cx2, cz2);
    const cy = g.h;
    const mid = groundAt((ax + bx + cx2) / 3, (az + bz + cz2) / 3);
    const nx = mid.nx, ny = mid.ny, nz = mid.nz;
    const col = tCol(kind, tint);
    // Wind so the normal points up: negative shoelace in (x,z) is CCW from above.
    const cr = (bx - ax) * (cz2 - az) - (bz - az) * (cx2 - ax);
    const v0 = bd.vert(ax, ay, az, nx, ny, nz, col);
    if (cr > 0) {
      bd.vert(cx2, cy, cz2, nx, ny, nz, col);
      bd.vert(bx, by, bz, nx, ny, nz, col);
    } else {
      bd.vert(bx, by, bz, nx, ny, nz, col);
      bd.vert(cx2, cy, cz2, nx, ny, nz, col);
    }
    bd.tri(v0, v0 + 1, v0 + 2);
    terrainStats.tris++;
  }
  function tQuad(p0, p1, p2, p3, kind, tint) {
    tTri(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], kind, tint);
    tTri(p0[0], p0[1], p2[0], p2[1], p3[0], p3[1], kind, tint);
  }

  // A vertical face from grade up to the deck, with an optional collider. The
  // edge is walked in 1 m steps and any stretch where something else has already
  // filled the drop (a ramp, the kicker) is left open, so the ramps that lead on
  // to a dock are not walled off from it.
  function tWall(ax, az, bx, bz, ox, oz, H, kind, collide) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L));
    const dx = (bx - ax) / n, dz = (bz - az) / n;
    const col = tCol(kind, 0.72);
    for (let i = 0; i < n; i++) {
      const x0 = ax + dx * i, z0 = az + dz * i;
      const x1 = ax + dx * (i + 1), z1 = az + dz * (i + 1);
      const mx = (x0 + x1) / 2 + ox, mz = (z0 + z1) / 2 + oz;
      if (groundAt(mx, mz).h > H - 0.35) continue;       // a ramp lands here
      const base = groundAt(mx, mz).h;
      const bd = bAt(mx, mz);
      // Outward normal: (ox,oz) already points away from the deck.
      const l = Math.hypot(ox, oz) || 1;
      bd.quad([x0, base, z0], [x0, H, z0], [x1, H, z1], [x1, base, z1], col, [ox / l, 0, oz / l]);
      terrainStats.tris += 2; terrainStats.walls++;
      if (collide) { addSegment(x0, z0, x1, z1); terrainStats.colliders++; }
    }
  }

  // --- pad: nine planar regions (deck, four aprons, four hipped corners).
  function emitPad(f) {
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
    // local (u = driver's left, w = forward) -> world
    const P = (u, w) => [f.cx + u * c + w * s, f.cz - u * s + w * c];
    const ru0 = f.runs[0], ru1 = f.runs[1], rw0 = f.runs[2], rw1 = f.runs[3];
    const uEdge = [-f.hw - ru0, -f.hw, f.hw, f.hw + ru1];
    const wEdge = [-f.hl - rw0, -f.hl, f.hl, f.hl + rw1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const u0 = uEdge[i], u1 = uEdge[i + 1], w0 = wEdge[j], w1 = wEdge[j + 1];
        if (u1 - u0 < 1e-6 || w1 - w0 < 1e-6) continue;   // a cliff, not a slope
        const a = P(u0, w0), b = P(u0, w1), d = P(u1, w1), e = P(u1, w0);
        const kind = tKind(f, (a[0] + d[0]) / 2, (a[1] + d[1]) / 2);
        if (i !== 1 && j !== 1) {
          // Corner: min() folds it along the diagonal out of the deck corner.
          const inner = (i === 0) === (j === 0) ? [a, d] : [b, e];
          const other = (i === 0) === (j === 0) ? [b, e] : [a, d];
          tTri(inner[0][0], inner[0][1], other[0][0], other[0][1], inner[1][0], inner[1][1], kind, 0.98);
          tTri(inner[0][0], inner[0][1], inner[1][0], inner[1][1], other[1][0], other[1][1], kind, 0.98);
        } else {
          tQuad(a, b, d, e, kind, i === 1 && j === 1 ? 1 : 0.98);
        }
      }
    }
    // Vertical faces wherever a side has no slope at all.
    const wall = !!f.wall;
    const sides = [
      [ru0, P(-f.hw, -f.hl), P(-f.hw, f.hl), -c, s],
      [ru1, P(f.hw, f.hl), P(f.hw, -f.hl), c, -s],
      [rw0, P(f.hw, -f.hl), P(-f.hw, -f.hl), -s, -c],
      [rw1, P(-f.hw, f.hl), P(f.hw, f.hl), s, c],
    ];
    for (const [run, p0, p1, nx, nz] of sides) {
      if (run > 1e-6) continue;
      tWall(p0[0], p0[1], p1[0], p1[1], nx * 0.6, nz * 0.6, f.H, f.kind, wall);
    }
  }

  // --- mound: radial fan, 14 segments by 4 rings.
  function emitMound(f) {
    const NS = 14, NR = 4;
    const ring = (k) => {
      const out = [];
      for (let i = 0; i < NS; i++) {
        const a = (i / NS) * Math.PI * 2;
        out.push([f.cx + Math.cos(a) * f.rx * k, f.cz + Math.sin(a) * f.rz * k]);
      }
      return out;
    };
    let prev = null;
    for (let r = 0; r <= NR; r++) {
      const k = r / NR;
      const cur = r === 0 ? null : ring(0.999 * k);
      if (r === 0) { prev = null; continue; }
      for (let i = 0; i < NS; i++) {
        const j = (i + 1) % NS;
        const kind = tKind(f, (cur[i][0] + cur[j][0]) / 2, (cur[i][1] + cur[j][1]) / 2);
        if (!prev) tTri(f.cx, f.cz, cur[j][0], cur[j][1], cur[i][0], cur[i][1], kind, 1);
        else tQuad(prev[i], prev[j], cur[j], cur[i], kind, 1);
      }
      prev = cur;
    }
  }

  // --- ridge: cross-sections along the spine. H = 0 is a flat surface patch.
  function emitRidge(f, step) {
    const half = f.hw + f.run;
    for (let i = 0; i + 3 < f.pts.length; i += 2) {
      const ax = f.pts[i], az = f.pts[i + 1], bx = f.pts[i + 2], bz = f.pts[i + 3];
      const L = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      const nx = -uz, nz = ux;
      const n = Math.max(1, Math.round(L / step));
      const offs = f.H === 0 ? [-f.hw - f.run * 0.5, f.hw + f.run * 0.5] : [-half, -f.hw, f.hw, half];
      for (let k = 0; k < n; k++) {
        const s0 = (k / n) * L, s1 = ((k + 1) / n) * L;
        const p0x = ax + ux * s0, p0z = az + uz * s0;
        const p1x = ax + ux * s1, p1z = az + uz * s1;
        for (let o = 0; o + 1 < offs.length; o++) {
          const a = [p0x + nx * offs[o], p0z + nz * offs[o]];
          const b = [p1x + nx * offs[o], p1z + nz * offs[o]];
          const d = [p1x + nx * offs[o + 1], p1z + nz * offs[o + 1]];
          const e = [p0x + nx * offs[o + 1], p0z + nz * offs[o + 1]];
          const kind = tKind(f, (a[0] + d[0]) / 2, (a[1] + d[1]) / 2);
          if (f.H === 0) {
            // Flat patch: a plain decal a hair above the grass, no normals to win.
            flatQuad(bAt(a[0], a[1]), [a, b, d, e], kind === 'sand' ? Y.sand + 0.002 : Y.park + 0.004,
              tCol(kind, 1));
            terrainStats.tris += 2;
          } else {
            tQuad(a, b, d, e, kind, 1);
          }
        }
      }
    }
  }

  // --- prof: a strip cut at every profile breakpoint, three cells across.
  function emitProf(f) {
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
    const P = (u, w) => [f.cx + u * c + w * s, f.cz - u * s + w * c];
    const uEdge = [-f.hw - f.skirt, -f.hw, f.hw, f.hw + f.skirt];
    for (let i = 0; i + 3 < f.prof.length; i += 2) {
      const w0 = f.prof[i], w1 = f.prof[i + 2];
      // Long shallow runs get a couple of extra cuts so the fog and the lighting
      // do not band across a 20 m triangle.
      const n = Math.max(1, Math.round((w1 - w0) / 6));
      for (let q = 0; q < n; q++) {
        const wa = w0 + (w1 - w0) * (q / n), wb = w0 + (w1 - w0) * ((q + 1) / n);
        for (let u = 0; u < 3; u++) {
          const a = P(uEdge[u], wa), b = P(uEdge[u], wb);
          const d = P(uEdge[u + 1], wb), e = P(uEdge[u + 1], wa);
          const kind = tKind(f, (a[0] + d[0]) / 2, (a[1] + d[1]) / 2);
          tQuad(a, b, d, e, kind, 1);
        }
      }
    }
    // Stairs get their treads drawn on: thin dark lines across the flight.
    if (f.kind === 'stair') {
      const w0 = f.prof[0], w1 = f.prof[f.prof.length - 2];
      const col = tCol('stair', 0.74);
      for (let t = 1; t < 14; t++) {
        const w = w0 + (w1 - w0) * (t / 14);
        const a = P(-f.hw, w), b = P(f.hw, w);
        const ya = groundAt(a[0], a[1]).h + 0.02, yb = groundAt(b[0], b[1]).h + 0.02;
        const bd = bAt(f.cx, f.cz);
        bd.quad([a[0], ya, a[1]], [a[0] + s * 0.22, ya, a[1] + c * 0.22],
          [b[0] + s * 0.22, yb, b[1] + c * 0.22], [b[0], yb, b[1]], col, [0, 1, 0]);
        terrainStats.tris += 2;
      }
    }
  }

  for (const f of terrain.features) {
    if (inside) { const c = featureCentre(f); if (!inside(c[0], c[1])) continue; }
    terrainStats.features++;
    if (f.type === 'pad') emitPad(f);
    else if (f.type === 'mound') emitMound(f);
    else if (f.type === 'ridge') emitRidge(f, f.H === 0 ? 22 : 35);
    else emitProf(f);
  }

  // Level crossings. Where a street runs over the rail berm the road does not
  // stop at the toe of the fill — it climbs it. One asphalt deck per crossing,
  // laid on the berm surface and following the road's own bearing.
  {
    const rail = terrain.features.find((f) => f.id === 'rail');
    if (rail) {
      const half = rail.hw + rail.run;
      const asph = tCol('asphalt', 1.04);
      for (const road of roads) {
        for (let i = 0; i + 1 < road.pts.length; i++) {
          const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
          for (let j = 0; j + 3 < rail.pts.length; j += 2) {
            const cx2 = rail.pts[j], cz2 = rail.pts[j + 1];
            const dx2 = rail.pts[j + 2], dz2 = rail.pts[j + 3];
            const den = (bx - ax) * (dz2 - cz2) - (bz - az) * (dx2 - cx2);
            if (Math.abs(den) < 1e-9) continue;
            const t = ((cx2 - ax) * (dz2 - cz2) - (cz2 - az) * (dx2 - cx2)) / den;
            const u = ((cx2 - ax) * (bz - az) - (cz2 - az) * (bx - ax)) / den;
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            const hx = ax + (bx - ax) * t, hz = az + (bz - az) * t;
            let rx2 = bx - ax, rz2 = bz - az;
            const rl = Math.hypot(rx2, rz2) || 1;
            rx2 /= rl; rz2 /= rl;
            // How far the deck has to reach to cross the whole fill. A street
            // that only grazes the berm gets nothing: a 90 m ribbon of asphalt
            // laid down the flank would read as a plaza, not a crossing.
            const cross = Math.abs(rx2 * (dz2 - cz2) - rz2 * (dx2 - cx2)) / Math.hypot(dx2 - cx2, dz2 - cz2);
            if (cross < 0.4) continue;
            const reach = Math.min(26, half / cross + 3);
            const wHalf = (road.w || 8) / 2;
            const px = -rz2 * wHalf, pz = rx2 * wHalf;
            const N = 7;
            for (let k = 0; k < N; k++) {
              const s0 = -reach + (2 * reach) * (k / N), s1 = -reach + (2 * reach) * ((k + 1) / N);
              const q = (sx2, sz2, side) => {
                const x = hx + rx2 * sx2 + px * side, z = hz + rz2 * sz2 + pz * side;
                return [x, groundAt(x, z).h + 0.05, z];
              };
              const a = q(s0, s0, -1), b = q(s1, s1, -1), d = q(s1, s1, 1), e = q(s0, s0, 1);
              const bd = bAt(hx, hz);
              bd.quad(a, b, d, e, asph, [0, 1, 0]);
              terrainStats.tris += 2;
            }
            terrainStats.decks++;
          }
        }
      }
    }
  }

  // The Galeries service fence. It is 1.6 m of chain link with a collider, and
  // the whole point of the loading-dock kicker is to go over it.
  {
    const fenceCol = shade(0x8d9096, 0.9), postCol = shade(0x6f7276, 0.9);
    const x = -92;
    // Half of it stands across the mall's service aisle, and it is the ONLY
    // barrier in the bake that does so on purpose: the kicker at the east lip
    // of the dock exists to put you over it. Deliberately not run through the
    // asphalt gate the road-derived furniture below goes through.
    for (let z = -244; z < -216; z += 2) {
      const bd = bAt(x, z);
      // Both faces: you look at this fence from the dock side on the way in and
      // from the lot side on the way down.
      bd.quad([x, 0, z], [x, 1.6, z], [x, 1.6, z + 2], [x, 0, z + 2], fenceCol, [1, 0, 0]);
      bd.quad([x, 0, z + 2], [x, 1.6, z + 2], [x, 1.6, z], [x, 0, z], fenceCol, [-1, 0, 0]);
      addSegment(x, z, x, z + 2);
      terrainStats.tris += 4; terrainStats.colliders++;
      if (((z + 244) % 6) === 0) bd.post(x, 0, z, 0.12, 1.75, postCol);
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
      // A small off-centre crown breaks up the repeated hourglass silhouette.
      // Only some trees get one, keeping the extra geometry modest.
      if (tr() < 0.42) {
        const a = tr() * Math.PI * 2;
        bd.cone(x + Math.cos(a) * 1.35 * scale, th * 1.14, z + Math.sin(a) * 1.35 * scale,
          1.45 * scale, 2.1 * scale, 5, shade(leaf, 0.94 + tr() * 0.14));
      }
    }
  }

  // Low planting gives the town a second green layer instead of making every
  // bit of vegetation read as the same tree-on-a-stick. A few beds flower, but
  // most remain the clipped cedar and lilac shrubs common on front lawns.
  function shrub(x, z, scale, flowers) {
    const bd = bAt(x, z);
    const col = SHRUB[(tr() * SHRUB.length) | 0];
    const yaw = tr() * Math.PI;
    bd.tower(x, 0.02, z, 1.8 * scale, 1.15 * scale, 0.72 * scale, rgb(col), {
      yaw, wTop: 1.35 * scale, dTop: 0.9 * scale, noBottom: true, top: shade(col, 1.12),
    });
    if (!flowers) return;
    const bloom = BLOOM[(tr() * BLOOM.length) | 0];
    for (let i = 0; i < 3; i++) {
      const a = yaw + (i - 1) * 0.72;
      bd.cyl(x + Math.cos(a) * 0.42 * scale, 0.82 * scale,
        z + Math.sin(a) * 0.32 * scale, 0.10 * scale, 0.12 * scale, 5, rgb(bloom), 'y', true);
    }
  }

  const woodPts = [], parkPts = [];
  const pr = mulberry32(0x2b1a55);
  for (const a of areas) {
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
        if (inside && !inside(jx, jz)) continue;    // the neighbour's half of a wood
        // Landuse polygons are drawn over the streets that cross them, and a
        // 7 m spruce in the middle of chemin Vanier is worse than a gap in the
        // wood. Street trees already do this test; the park scatter never did.
        const bad = pavedAt(jx, jz, -1, 0.6);
        noteFurniture(jx, jz, 'tree', -1, bad);
        if (bad) { furnDropped++; continue; }
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
    for (const road of roads) {
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

  // Front-garden shrubs cluster around a subset of street trees, with loose
  // groups at parks. Offsets are deterministic and rejected if they stray onto
  // asphalt or through a building wall.
  const shrubPts = [];
  for (let i = 0; i < streetSel.length; i++) {
    if (tr() > 0.58) continue;
    const q = streetSel[i], a = tr() * Math.PI * 2, d = 2.0 + tr() * 2.6;
    const x = q[0] + Math.cos(a) * d, z = q[1] + Math.sin(a) * d;
    if (!roadAt(x, z) && !querySegments(x, z, 1.1).length) shrubPts.push([x, z]);
  }
  for (let i = 0; i < parkSel.length; i += 2) {
    const q = parkSel[i], a = tr() * Math.PI * 2, d = 2.5 + tr() * 3.5;
    shrubPts.push([q[0] + Math.cos(a) * d, q[1] + Math.sin(a) * d]);
  }
  const shrubSel = subsample(shrubPts, CAP.shrubs);
  for (let i = 0; i < shrubSel.length; i++) {
    const q = shrubSel[i];
    shrub(q[0], q[1], 0.7 + tr() * 0.65, tr() < (i % 5 === 0 ? 0.8 : 0.12));
  }
  const treeCount = woodSel.length + parkSel.length + streetSel.length;
  const plantingCount = shrubSel.length;

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
  for (const road of roads) {
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
        if (paved) flip = -flip;
        s += spacing;
        // 10 m of hydro pole in the fast lane of the way alongside. The offset
        // is measured from this way's own kerb and knows nothing about the
        // parallel carriageway it may be standing in.
        const bad = pavedAt(x, z, -1, 0.35);
        noteFurniture(x, z, 'pole', -1, bad);
        if (bad) { furnDropped++; continue; }
        (paved ? lights : hydros).push(x, z, -nx / off, -nz / off);
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
  // Shared by every slice, so sectors.js asks for it once and keeps it.
  if (opts.distant !== false) {
  const grassFar = shade(C.grassLo, 0.92);
  // apron: green everywhere outside the map except to the south, which is river
  // Well below the baked ground: this one quad spans 11 km, and on software /
  // low-precision GPUs its interpolated depth can beat a road 10 cm above it
  // (streets vanished into fog colour on SwiftShader at -0.05). At -0.6 nothing
  // in the town can lose to it, and it only ever shows through landuse gaps.
  distant.flat(B.minX - 3000, B.minZ - 3000, B.maxX + 3000, B.maxZ, -0.6, grassFar);
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
  }

  // ------------------------------------------------------------ 9. reactive world
  // Placement only. This section works out where the pavement actually runs and
  // picks the spots for the small knock-over furniture; peds.js, streetprops.js
  // and debris.js turn those lists into geometry and behaviour. Nothing here
  // builds a mesh or touches the renderer, so the merge surface between the
  // reactive world and the rest of the bake is exactly these two arrays.
  const REACT = {
    step: 5,        // metres between sidewalk nodes
    minRun: 20,     // a run shorter than this is not a block anybody walks
    trim: 7,        // metres of each road end left to the intersection
    pad: 0.9,       // clearance kept from a building wall
    cap: 1600,      // hard ceiling on knockable props
    dressed: 9,     // % of residential streets that are out for collection
  };
  // FNV-1a over the street name: same street, same answer, every build.
  function strHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // -- building footprints, indexed, so a spot can be rejected for being indoors
  const BLD_CELL = 48;
  const bldGrid = new Map();
  // Bounding box per footprint, so the sampler below rejects nearly everything
  // with four comparisons instead of a point-in-polygon over 14 vertices.
  const bldBox = new Float64Array(buildings.length * 4);
  {
    for (let i = 0; i < buildings.length; i++) {
      const p = buildings[i].p;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < p.length; k++) {
        if (p[k][0] < x0) x0 = p[k][0]; if (p[k][0] > x1) x1 = p[k][0];
        if (p[k][1] < z0) z0 = p[k][1]; if (p[k][1] > z1) z1 = p[k][1];
      }
      bldBox[i * 4] = x0; bldBox[i * 4 + 1] = z0;
      bldBox[i * 4 + 2] = x1; bldBox[i * 4 + 3] = z1;
      const i0 = Math.floor(x0 / BLD_CELL), i1 = Math.floor(x1 / BLD_CELL);
      const j0 = Math.floor(z0 / BLD_CELL), j1 = Math.floor(z1 / BLD_CELL);
      for (let a = i0; a <= i1; a++) {
        for (let b = j0; b <= j1; b++) {
          const key = gkey(a, b);
          const arr = bldGrid.get(key);
          if (arr) arr.push(i); else bldGrid.set(key, [i]);
        }
      }
    }
  }
  // True if (x, z) is inside a footprint, or within `pad` metres of one of its
  // walls. Exported: the smoke test asserts no pedestrian spawns indoors.
  function buildingAt(x, z, pad = 0) {
    const arr = bldGrid.get(gkey(Math.floor(x / BLD_CELL), Math.floor(z / BLD_CELL)));
    if (!arr) return false;
    const p2 = pad * pad;
    for (let k = 0; k < arr.length; k++) {
      const bi = arr[k], o = bi * 4;
      if (x < bldBox[o] - pad || x > bldBox[o + 2] + pad
        || z < bldBox[o + 1] - pad || z > bldBox[o + 3] + pad) continue;
      const p = buildings[bi].p;
      if (pointInPoly(p, x, z)) return true;
      if (pad <= 0) continue;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if (distPtSeg2(x, z, p[j][0], p[j][1], p[i][0], p[i][1]) < p2) return true;
      }
    }
    return false;
  }

  // -- sidewalk lines. Same offset the concrete band in section 4 uses
  // (road.w/2 + 1.1, band 2.2 m wide), pushed out to 1.4 so a walker is clear of
  // the roadAt radius, and resampled at a fixed 5 m so arc-length is an index.
  const walks = [];
  const WALK_CELL = 128;
  const walkGrid = new Map();
  const offPts = [];
  const cum = [0];
  // Somewhere a person could actually stand: inside the map, off the tarmac,
  // out of the river, clear of a wall.
  function walkable(x, z) {
    return x > B.minX + 8 && x < B.maxX - 8 && z > B.minZ + 8 && z < B.maxZ - 8
      && !roadAt(x, z) && !waterAt(x, z) && !buildingAt(x, z, REACT.pad);
  }
  function pushWalk(run, cls, name, side) {
    if (run.length < (REACT.minRun / REACT.step + 1) * 2) return;
    const pts = Float32Array.from(run);
    const w = {
      pts, n: pts.length >> 1, len: ((pts.length >> 1) - 1) * REACT.step,
      cls, name, side, cx: 0, cz: 0,
    };
    for (let i = 0; i < pts.length; i += 2) { w.cx += pts[i]; w.cz += pts[i + 1]; }
    w.cx /= w.n; w.cz /= w.n;
    const wi = walks.length;
    walks.push(w);
    let lastKey = -1;
    for (let i = 0; i < pts.length; i += 2) {
      const key = gkey(Math.floor(pts[i] / WALK_CELL), Math.floor(pts[i + 1] / WALK_CELL));
      if (key === lastKey) continue;
      lastKey = key;
      const arr = walkGrid.get(key);
      if (arr) { if (arr[arr.length - 1] !== wi) arr.push(wi); } else walkGrid.set(key, [wi]);
    }
  }

  for (const road of roads) {
    const paved = PAVED[road.cls] === 1;
    const res = road.cls === 'residential';
    if (!paved && !res) continue;
    const pts = road.pts, n = pts.length;
    if (n < 2) continue;
    const off = road.w / 2 + 1.4;
    for (const side of [1, -1]) {
      // Offset polyline: each vertex pushed out along its own segment's normal.
      offPts.length = 0;
      for (let i = 0; i < n; i++) {
        const a = i < n - 1 ? i : n - 2;
        let dx = pts[a + 1][0] - pts[a][0], dz = pts[a + 1][1] - pts[a][1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        offPts.push(pts[i][0] - dz * off * side, pts[i][1] + dx * off * side);
      }
      // Resample it every REACT.step metres, keeping runs of usable nodes.
      // cum[i] is the distance along the offset line to vertex i, so walking s
      // forward is one monotone index chase and every node comes out exactly
      // REACT.step from the last (which is what makes peds.at() a lerp).
      cum.length = 1; cum[0] = 0;
      for (let i = 0; i + 3 < offPts.length; i += 2) {
        cum.push(cum[cum.length - 1]
          + Math.hypot(offPts[i + 2] - offPts[i], offPts[i + 3] - offPts[i + 1]));
      }
      const total = cum[cum.length - 1];
      if (total < REACT.trim * 2 + REACT.minRun) continue;
      let seg = 0;
      const run = [];
      for (let s = REACT.trim; s <= total - REACT.trim; s += REACT.step) {
        while (seg + 2 < cum.length && cum[seg + 1] < s) seg++;
        const segLen = cum[seg + 1] - cum[seg];
        const t = segLen > 1e-6 ? clamp((s - cum[seg]) / segLen, 0, 1) : 0;
        const o = seg * 2;
        const x = offPts[o] + (offPts[o + 2] - offPts[o]) * t;
        const z = offPts[o + 1] + (offPts[o + 3] - offPts[o + 1]) * t;
        // A hairpin can fold the offset line back on itself, which would break
        // the "every node is step apart" invariant peds.at() leans on. Cut the
        // run there rather than carry a node that lies.
        const bad = !walkable(x, z)
          || (run.length >= 2
            && Math.abs(Math.hypot(x - run[run.length - 2], z - run[run.length - 1])
              - REACT.step) > 1.0);
        if (bad) {
          pushWalk(run, road.cls, road.name || '', side);
          run.length = 0;
          if (walkable(x, z)) run.push(x, z);
          continue;
        }
        run.push(x, z);
      }
      pushWalk(run, road.cls, road.name || '', side);
    }
  }

  const walkOut = [];
  // Every sidewalk run with a node inside `r` of (x, z). The array is reused.
  function queryWalks(x, z, r) {
    walkOut.length = 0;
    const i0 = Math.floor((x - r) / WALK_CELL), i1 = Math.floor((x + r) / WALK_CELL);
    const j0 = Math.floor((z - r) / WALK_CELL), j1 = Math.floor((z + r) / WALK_CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = walkGrid.get(gkey(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const wi = arr[k];
          if (walkOut.indexOf(wi) < 0) walkOut.push(wi);
        }
      }
    }
    return walkOut;
  }

  // -- knockable street furniture. Garbage day on the residential streets, post
  // and newspaper boxes on the commercial ones, café furniture on Principale,
  // carts in the Galeries lot, a fruit stand outside the dep.
  const propSpots = [];
  let specialFrom = 0;
  {
    const rnd = mulberry32(0x9e11ed);
    // Same test the pavement itself had to pass, with a smaller wall clearance:
    // furniture stands closer to a storefront than a person walks.
    const add = (x, z, yaw, kind) => {
      if (roadAt(x, z) || waterAt(x, z) || buildingAt(x, z, 0.35)) return;
      propSpots.push({ x, z, yaw, kind });
    };
    // A street is either garbage day or it is not, and both sides of it agree,
    // because the draw is a hash of the street NAME. That is what puts a row of
    // bins down one block and leaves the next one bare — 1,500 props spread
    // evenly over 250 km of pavement would be one bin every 160 m, which reads
    // as nothing at all. Commercial streets are always dressed.
    for (let wi = 0; wi < walks.length; wi++) {
      const w = walks[wi];
      const res = w.cls === 'residential';
      const principale = /Principale/i.test(w.name);
      const dressed = (strHash(w.name || ('w' + wi)) % 100) < REACT.dressed;
      // Principale is the shopping street, so it is always dressed and dense.
      // Other commercial streets get the odd box; a residential street is either
      // out for collection or empty.
      let gap;
      if (principale) gap = 20 + rnd() * 14;
      else if (!res) gap = 95 + rnd() * 90;
      else if (dressed) gap = 11 + rnd() * 10;
      else continue;
      let s = 6 + rnd() * 14;
      while (s < w.len - 4) {
        const i = Math.min(w.n - 2, Math.floor(s / REACT.step));
        const t = (s - i * REACT.step) / REACT.step;
        const o = i * 2;
        const x = w.pts[o] + (w.pts[o + 2] - w.pts[o]) * t;
        const z = w.pts[o + 1] + (w.pts[o + 3] - w.pts[o + 1]) * t;
        const dx = w.pts[o + 2] - w.pts[o], dz = w.pts[o + 3] - w.pts[o + 1];
        // face the road: the walk was pushed out along +normal*side
        const yaw = Math.atan2(dx, dz) + (w.side > 0 ? -Math.PI / 2 : Math.PI / 2);
        const nx = -dz / (Math.hypot(dx, dz) || 1) * w.side;
        const nz = dx / (Math.hypot(dx, dz) || 1) * w.side;
        const p = rnd();
        if (res) {
          if (p < 0.42) {                        // bins out at the end of a driveway
            add(x + nx * -0.35, z + nz * -0.35, yaw, 'garbage');
            if (rnd() < 0.75) add(x - dz * 0 + nx * -0.35 + dx * 0.14, z + nz * -0.35 + dz * 0.14, yaw, 'recyc');
          } else if (p < 0.60) add(x, z, yaw, 'mailbox');
          else if (p < 0.72) add(x, z, yaw, 'hydrant');
          else if (p < 0.78) add(x, z, yaw, 'relaybox');
          else if (p < 0.82) add(x, z, yaw, 'newsbox');
        } else {
          if (p < 0.22) add(x, z, yaw, 'newsbox');
          else if (p < 0.40) add(x, z, yaw, 'relaybox');
          else if (p < 0.54) add(x, z, yaw, 'mailbox');
          else if (p < 0.78) add(x, z, yaw, 'hydrant');
          else if (p < 0.84 && !principale) add(x, z, yaw, 'garbage');
          if (principale && rnd() < 0.34) {       // a terrasse, two chairs to a table
            add(x, z, yaw, 'cafetable');
            add(x + nx * 0.85 + dx * 0.10, z + nz * 0.85 + dz * 0.10, yaw + 2.7, 'cafechair');
            add(x + nx * 0.85 - dx * 0.10, z + nz * 0.85 - dz * 0.10, yaw - 2.7, 'cafechair');
          }
        }
        s += gap * (0.85 + rnd() * 0.3);
      }
    }
    // Hand-placed one-offs from here down: they go in `specials`, which skips
    // the subsample below, or the fruit stand at the dep would be a 1-in-5 shot.
    specialFrom = propSpots.length;
    // Shopping carts, loose in the Galeries d'Aylmer lot.
    const mall = pois.find((q) => /Galeries/i.test(q.name || '')) || { x: -18.9, z: -331.2 };
    // lotD < 0: the mall is in another slice, so no lot here can be its lot.
    let lot = null, lotD = inside && !inside(mall.x, mall.z) ? -1 : 1e9;
    for (const a of areas) {
      if (a.k !== 'parking') continue;
      let cx = 0, cz = 0;
      for (const q of a.p) { cx += q[0]; cz += q[1]; }
      cx /= a.p.length; cz /= a.p.length;
      const d = (cx - mall.x) ** 2 + (cz - mall.z) ** 2;
      if (d < lotD) { lotD = d; lot = a; }
    }
    if (lot) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const q of lot.p) {
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
        if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1];
      }
      for (let n = 0, tries = 0; n < 26 && tries < 400; tries++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (!pointInPoly(lot.p, x, z) || roadAt(x, z) || buildingAt(x, z, 1.4)) continue;
        add(x, z, rnd() * 6.28, 'cart');
        n++;
      }
    }
    // The fruit stand outside Dépanneur Palmyra, on the nearest bit of pavement.
    const dep = pois.find((q) => /Palmyra/i.test(q.name || ''));
    if (dep) {
      let best = null, bestD = 60 * 60;
      for (const wi of queryWalks(dep.x, dep.z, 60)) {
        const w = walks[wi];
        for (let i = 0; i < w.pts.length; i += 2) {
          const d = (w.pts[i] - dep.x) ** 2 + (w.pts[i + 1] - dep.z) ** 2;
          if (d < bestD) { bestD = d; best = [w.pts[i], w.pts[i + 1]]; }
        }
      }
      if (best) add(best[0], best[1], Math.atan2(dep.x - best[0], dep.z - best[1]), 'fruitstand');
    }
  }
  // The hand-placed one-offs skip the cap's subsample, so the fruit stand is not
  // a one-in-five chance of existing.
  const specials = propSpots.splice(specialFrom);
  const walkSpots = propSpots.length;
  const propSpotList = subsample(propSpots, Math.max(0, REACT.cap - specials.length))
    .concat(specials);
  const walkMetres = walks.reduce((a, w) => a + w.len, 0) | 0;
  console.log(`react: ${walks.length} sidewalk runs (${walkMetres} m), `
    + `${propSpotList.length} prop spots (${walkSpots} on pavement, `
    + `${specials.length} hand-placed)`);

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
  const fallen = opts.fallen || [];    // shared across slices by sectors.js
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
  // Land chunks carry three meshes: the town (roads, ground, trees, everything
  // that is not a house) plus the near and far house bakes. A chunk can exist
  // with only houses in it, so the record list is the union of the three keys.
  function uploadMap(map) {
    const out = new Map();
    for (const [k, b] of map) {
      if (b.empty) continue;
      tris += b.i.length / 3;
      out.set(k, renderer.upload(b));
    }
    return out;
  }
  const landMesh = uploadMap(builders);
  const nearMesh = uploadMap(houseNearB);
  const farMesh = uploadMap(houseFarB);
  for (const [k, m] of landMesh) meshByKey.set(k, m);
  let nearTris = 0, farTris = 0;
  for (const m of nearMesh.values()) nearTris += m.count / 3;
  for (const m of farMesh.values()) farTris += m.count / 3;
  const chunks = [];
  for (const k of new Set([...landMesh.keys(), ...nearMesh.keys(), ...farMesh.keys()])) {
    const mesh = landMesh.get(k) || null;
    const near = nearMesh.get(k) || null;
    const far = farMesh.get(k) || null;
    const any = mesh || near || far;
    chunks.push({
      mesh, near, far, min: any.min, max: any.max, fade: 0,
      cx: B.minX + ((k % NX) + 0.5) * CHUNK,
      cz: B.minZ + (Math.floor(k / NX) + 0.5) * CHUNK,
    });
  }
  const waterChunks = uploadSet(waterB);
  const nightChunks = uploadSet(nightB);
  for (let i = 0; i < poles.length; i++) poles[i].mesh = poles[i].k == null ? null : (meshByKey.get(poles[i].k) || null);
  const distantMesh = distant.empty ? null : renderer.upload(distant);
  tris += distant.i.length / 3;
  // The builders have done their job: every vertex is on the GPU now, and
  // nothing below reads them again. But bAt() and friends are closures over
  // these Maps, and the returned draw()/query functions keep the whole scope
  // alive, so without this the 3.8 M triangles stay resident TWICE — once as
  // GPU buffers and once as ~870 MB of boxed doubles that Safari eventually
  // kills the tab over. Measured: 1057 MB heap before, 182 MB after.
  builders.clear(); houseNearB.clear(); houseFarB.clear(); waterB.clear(); nightB.clear();
  distant.v.length = 0; distant.i.length = 0;
  const signage = opts.signage === false ? null : buildSignage(renderer);

  // Flatten the furniture log: a few hundred thousand samples as loose numbers
  // would be a megabyte of boxed doubles hanging off the world for the whole
  // session, and the only reader is the smoke test.
  const furniture = {
    n: furn.x.length,
    x: Float64Array.from(furn.x), z: Float64Array.from(furn.z),
    road: Int32Array.from(furn.road), dropped: Uint8Array.from(furn.dropped),
    kind: furn.kind,
    droppedCount: furnDropped,
  };
  furn.x.length = 0; furn.z.length = 0; furn.road.length = 0; furn.dropped.length = 0;

  const dt = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) | 0;
  console.log(`world: ${chunks.length} chunks (+${waterChunks.length} water, ${nightChunks.length} night), `
    + `${tris | 0} tris, ${buildings.length} buildings (${houseCount} archetype houses, `
    + `${houseTris | 0} near + ${houseFarTris | 0} far tris, atlas ${mats && mats.tex ? 'on' : 'OFF'}), `
    + `${roads.length} roads (${interCount} intersections, ${cornerCount} kerb corners, `
    + `${jointCount} joints, ${dashCount} dashes, ${sidewalkCount} walks, ${wallsOffRoad} walls off the asphalt, ${stopLineCount} stop lines, `
    + `${furnDropped} pieces kept off the asphalt), `
    + `${SIGNALS.length} signals, ${STOPS.length} stop signs, ${treeCount} trees, ${plantingCount} shrubs, ${poleCount} poles, `
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
  // Houses are drawn in a second pass with the atlas bound, so the texture is
  // switched on exactly once a frame instead of once a chunk.
  const houseTex = (mats && mats.tex) || null;
  const houseOpts = { tex: houseTex, fogMul: 1 };
  // Visible house meshes, queued during the chunk walk and drawn after it. 256
  // is four times the most chunks that survive the cull at drawDist 950; past
  // that the extra houses are dropped rather than growing the array mid-frame.
  const pendMesh = new Array(256).fill(null);
  const pendFade = new Float32Array(256);
  let firstFrame = true;
  let houseNear = HOUSE_NEAR;
  // Quality 'low' pulls the detailed houses in; everything else uses HOUSE_NEAR.
  function setHouseNear(m) { houseNear = Math.max(0, m || 0); }

  const stats = {
    resident: tris, residentNear: nearTris, residentFar: farTris,
    tris: 0, draws: 0, near: 0, far: 0, chunks: 0,
  };

  function draw(r, model, x, z, drawDist, dtSec) {
    const dd2 = drawDist * drawDist;
    const near2 = houseNear * houseNear;
    const step = firstFrame ? 1 : Math.min(1, (dtSec || 0) / FADE);
    let nH = 0;
    stats.tris = 0; stats.draws = 0; stats.near = 0; stats.far = 0; stats.chunks = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const dx = c.cx - x, dz = c.cz - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > dd2) { c.fade = 0; continue; }
      if (c.fade < 1) c.fade = Math.min(1, c.fade + step);
      if (c.mesh && r.visible(c.mesh)) {
        stats.chunks++;
        stats.tris += c.mesh.count / 3; stats.draws++;
        if (c.fade >= 1) r.draw(c.mesh, model, noOpts);
        else {
          // W2: a new chunk arrives buried in fog and thins out over FADE seconds,
          // which reads as a fade without paying for a transparent pass.
          fadeOpts.fogMul = 1 + (1 - c.fade) * 3.2;
          r.draw(c.mesh, model, fadeOpts);
        }
      }
      const isNear = d2 < near2;
      const hm = isNear ? c.near : c.far;
      if (hm && nH < pendMesh.length && r.visible(hm)) {
        pendMesh[nH] = hm; pendFade[nH] = c.fade; nH++;
        stats.tris += hm.count / 3; stats.draws++;
        if (isNear) stats.near += hm.count / 3; else stats.far += hm.count / 3;
      }
    }
    for (let i = 0; i < nH; i++) {
      houseOpts.fogMul = pendFade[i] >= 1 ? 1 : 1 + (1 - pendFade[i]) * 3.2;
      r.draw(pendMesh[i], model, houseOpts);
      pendMesh[i] = null;
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

  // Give this slice's GPU buffers back (sectors.js, once the player is far
  // enough away). The distant scenery and the signage are shared and stay.
  function free() {
    if (!renderer.free) return;
    for (const c of chunks) {
      if (c.mesh) renderer.free(c.mesh);
      if (c.near) renderer.free(c.near);
      if (c.far) renderer.free(c.far);
    }
    for (const c of waterChunks) renderer.free(c.mesh);
    for (const c of nightChunks) renderer.free(c.mesh);
    chunks.length = 0; waterChunks.length = 0; nightChunks.length = 0;
  }

  return {
    chunks,
    waterChunks,
    nightChunks,
    free,
    roads,                  // the slice's roads (clipped), MAP.roads for a full build
    setHouseNear,
    stats,
    mats,
    signage,
    distant: distantMesh,
    poles,
    signals: SIGNALS,
    stopSigns: STOPS,
    intersections: interCount,
    landmarkRoofs,
    draw,
    querySegments,
    roadAt,
    pavedAt,                // (x, z, skipRoadIndex, margin) — on somebody's lane?
    furniture,              // every candidate slab/pole/tree and its verdict
    waterAt,
    groundAt,               // terrain.js height field: { h, nx, ny, nz, kind }
    terrain,                // the field itself, if you want the feature list
    terrainStats,
    nearestRoad,
    queryPoles,
    snapPole,
    fallen,                 // poles on their way down / lying there
    poleCount,
    // 9. reactive world: where the pavement runs and what is standing on it
    walks,                  // sidewalk runs, nodes every 5 m
    queryWalks,             // (x, z, r) -> indices into walks
    walkStep: REACT.step,
    propSpots: propSpotList,   // [{x, z, yaw, kind}] for streetprops.js
    buildingAt,
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
