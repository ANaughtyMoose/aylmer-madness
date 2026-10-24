// The shared build context for buildWorld (V0-02). Every section module in
// src/game/world/ is a function over this one object: it reads what the
// sections before it put here and adds what it makes. The order the sections
// run in is set by world.js and is the order the old single function ran in,
// so every random stream draws in the same order and every prop lands where it
// always did.
//
// What later tasks can read instead of re-deriving it:
//   ctx.trees     [{x, z, y, height, crown, kind, conifer, scale}] every tree baked (section 6)
//   ctx.poles     [{x, y, z, kind, h, ...}] every upright post (signals, stops, lamps, hydro, trees)
//   ctx.houses    [{bi, id, p, c, y, lo, yaw, lot}] archetype house footprints and their lots (section 5)
//   ctx.buildings the slice's footprints after fraserFootprint (section 5)
//   ctx.roadSegArr / ctx.roadGrid  the road broadphase, 7 slots a segment:
//                 ax, az, bx, bz, rad2, hw, road index (section 4a)
//   ctx.roads     the slice's roads (clipped)
// and the helpers: bAt / hnAt / hfAt / wAt / nAt (chunk builders by point),
// baseAt / groundAt, cover / stripe / slab / drapeQuad, pavedAt / roadAt,
// addSegment / addWallSegment / addPole, noteFurniture, querySegments.
//
// ctx.postBuild(fn) queues fn(ctx) to run once every builder is filled and
// before anything is uploaded: the hook for bake passes (AO, prelight).
import { MeshBuilder } from '../../core/mesh.js';
import { clamp } from '../../core/math.js';
import { MAP } from '../mapdata.js';
import { captureFragment } from '../breakables.js';
import { CHUNK, SEG_CELL } from './consts.js';
import { clipRoads, polyCentre } from './geom.js';

export function createCtx(renderer, mats, opts) {
  const B = MAP.bounds;
  const NX = Math.ceil((B.maxX - B.minX) / CHUNK);
  const NZ = Math.ceil((B.maxZ - B.minZ) / CHUNK);

  // ------------------------------------------------------------ sector filter
  // sectors.js builds the map a slice at a time: `opts.inside(x, z)` says
  // whether a point belongs to the slice being baked, and everything the map
  // offers goes through it: roads clipped to the runs of segments whose
  // midpoints are in, buildings by centroid, landuse triangle by triangle,
  // ground chunk by centre, so a slice is a self-contained piece of the same
  // bake and two neighbours never lay the same asphalt twice. The chunk grid
  // itself stays global (B is the whole map), so a chunk on a seam simply ends
  // up with a mesh from each side. With no `inside` (every smoke test, the lab
  // pages) this is the whole map, exactly as before.
  const inside = opts.inside || null;
  // The lit prototype renderer gets the leaf-card vegetation (vegetation.js).
  const PROTO_NATURE = !!renderer?.isPrototype && opts.nature !== false;
  const PROTO_FACADES = !!(mats && mats.prototypeStyle);
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

  // Every counter the bake keeps for its log line and its stats, in one place,
  // because more than one section adds to most of them.
  const count = {
    poolCount: 0, wallsOffRoad: 0, furnDropped: 0, groundQuads: 0,
    jointCount: 0, sidewalkCount: 0, dashCount: 0, interCount: 0, cornerCount: 0, stopLineCount: 0,
    houseCount: 0, houseTris: 0, houseFarTris: 0, landmarkRoofs: 0, skirtCount: 0, signCount: 0, winQuads: 0,
    shoreCount: 0, rockCount: 0, dockCount: 0, marinaBoats: 0,
    hedgeCount: 0, treeCount: 0, plantingCount: 0, poleCount: 0,
  };

  // ------------------------------------------------------------ collider grid
  // Segments live in one flat array (ax,az,bx,bz per 4 slots); the grid stores
  // indices into it. Segments are registered into every cell of their bounding
  // box, which is a conservative superset of the cells they cross.
  const segs = [];
  const segGrid = new Map();
  const gkey = (i, j) => (i + 256) * 512 + (j + 256);

  // A footprint edge that lies across a carriageway is an invisible wall in the
  // middle of a road. OpenStreetMap genuinely has buildings drawn over roadways
  // (canopies, bridged blocks, and plain mapping errors), and downtown Ottawa
  // has enough of them to stop you dead on Wellington Street and on Kichi Zībī
  // Mīkan. Street furniture is already kept off the asphalt (see clearRuns);
  // this is the same rule for the walls.
  //
  // The test is deliberately mean. A building that merely meets the kerb is a
  // real building and its wall has to stay, so an edge is only dropped when it
  // is at least WALL_INSET *inside* the asphalt at its midpoint AND at one end:
  // one point clipping a corner is not enough. `pavedAt` is the road
  // broadphase (roads.js), which exists by the time the first wall is added.
  const WALL_INSET = -0.6;              // metres inside the road edge, so negative
  function addWallSegment(ax, az, bx, bz) {
    const pavedAt = ctx.pavedAt;
    if (pavedAt((ax + bx) / 2, (az + bz) / 2, -1, WALL_INSET)
      && (pavedAt(ax, az, -1, WALL_INSET) || pavedAt(bx, bz, -1, WALL_INSET))) {
      count.wallsOffRoad++;
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

  // ------------------------------------------------------------ poles
  // R3: poles are baked into the chunk mesh (2500 of them as separate draws
  // would cost more than the whole rest of the frame), but each one remembers
  // which chunk it went into, which slice of that chunk's index buffer it
  // occupies, and which four collider segments are its. Snapping one is then
  // two O(1) writes: blank those indices on the GPU, mark the segments dead.
  // No per-frame cost at all for the ones still standing. Here rather than in
  // furniture.js because the signal masts, stop signs and trees, built before
  // the street furniture, register through it too.
  function poleSegs(x, z) {
    const base = addSegment(x - 0.15, z - 0.15, x + 0.15, z - 0.15);
    addSegment(x + 0.15, z - 0.15, x + 0.15, z + 0.15);
    addSegment(x + 0.15, z + 0.15, x - 0.15, z + 0.15);
    addSegment(x - 0.15, z + 0.15, x - 0.15, z - 0.15);
    return base;
  }
  function addPole(x, z, kind, h, k, i0, i1) {
    const y = ctx.baseAt(x, z).h;
    const p = { x, y, z, kind, h, k, i0, n: i1 - i0, seg: poleSegs(x, z), dead: false, mesh: null,
      fragment: captureFragment(builders.get(k), i0, i1, x, y, z) };
    poles.push(p);
    const key = gkey(Math.floor(x / SEG_CELL), Math.floor(z / SEG_CELL));
    const bucket = poleGrid.get(key);
    if (bucket) bucket.push(p); else poleGrid.set(key, [p]);
    return p;
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

  // ------------------------------------------------------------ triangle emit
  // Precomputed footprint triangles wind CCW in (x,z) shoelace terms, which faces
  // DOWN once lifted to y. Flip per triangle so every cap faces the sky.
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

  // ------------------------------------------------------------ bake hooks
  const postHooks = [];
  function postBuild(fn) { postHooks.push(fn); }
  function runPostBuild() {
    for (let i = 0; i < postHooks.length; i++) postHooks[i](ctx);
  }

  const ctx = {
    renderer, mats, opts, inside, PROTO_NATURE, PROTO_FACADES,
    B, NX, NZ, roads, bldgs, areas, pois,
    builders, waterB, nightB, houseNearB, houseFarB, distant,
    chunkKey, pick, bAt, hnAt, hfAt, bKey, wAt, nAt,
    poles, poleGrid, poleSegs, addPole,
    count,
    segs, segGrid, gkey, addSegment, addWallSegment,
    furn, noteFurniture,
    triTo, triScatter,
    postBuild, runPostBuild,
    // Records for later passes, filled as the sections run.
    trees: [], houses: [],
  };
  return ctx;
}
