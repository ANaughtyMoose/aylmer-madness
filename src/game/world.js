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
// game/materials.js (the atlas) or materials_stub.js for the vertex-colour
// fallback; houses are the only geometry that uses it)
//   draw(r, model, x, z, drawDist, dt)  everything above in one call: distance +
//                                       frustum cull, the 0.4 s fog fade-in for
//                                       newly-arrived chunks (W2), the river, the
//                                       storefront signs, the lamp pools at night
//   chunks / waterChunks / nightChunks  the mesh lists, if you want them yourself
//   poles      [{x,z,kind,h}]  every upright post: streetlights, hydro poles,
//                              signal masts, stop signs. Collision/damage code
//                              can look one up here and swap in a fallen mesh.
//   signals / stopSigns        the plans signals.js drives (see that file)
//   intersections              how many junction polygons were built (W3)
//   querySegments / roadAt / waterAt / groundAt / nearestRoad / bounds / distant
//   groundAt(x,z)  the terrain.js height field, baked into the chunk meshes
//                  (section 5c) so the geometry and the physics cannot disagree
//
// Also exported: nightAmount(env) (0 by day, 1 at night) and
// buildHeadlights(renderer, spec) (the player's night light cones).
//
// Coordinates are metres: +X east, +Z south, +Y up.
//
// Nothing sits at y = 0 any more. Under old Aylmer there is a LiDAR height
// raster (ground_data.js, 8 m, 33 m of relief between the river and the high
// ground north of chemin d'Aylmer), and every quad this file lays (lawn,
// asphalt, kerb, house, hydro pole) is DRAPED on it: the absolute `y` it used
// to be given is now a height ABOVE the ground under that vertex. The small
// ladder of decal heights in world/consts.js is what that offset is measured
// in, and it still does the only job it ever did, which is to keep coplanar
// quads from z-fighting.
//
// Outside the raster (Hull, Ottawa, the 148 corridor) the base is exactly zero,
// and everything below gates on that: a piece of geometry with no hill under it
// takes the same code path it always took and comes out vertex for vertex the
// same as it did when the whole town was flat.
//
// Layout (V0-02). This file is the orchestrator. Every section of the bake is
// a function over one shared build context (world/ctx.js) in src/game/world/,
// run below in the order the single 2,700-line function used to run them, so
// every random stream draws in the same order and the output is identical:
//
//   ctx.js         the context: slice filter, chunk builders, colliders, poles,
//                  furniture log, counters, records (trees, houses), postBuild
//   drape.js       0   the height field and the drape helpers
//   landcover.js   0   ground quads; 3 landuse areas
//   water.js       2   water; the water mask; 5b shoreline and marina
//   roads.js       4   roads, 4a broadphase, 4b intersections, markings
//   walks.js           sidewalks and kerb corners (called from roads.js)
//   signposts.js   4c  signal masts, stop signs, stop lines
//   buildings.js   5   buildings (houses.js archetypes, extruded blocks)
//   commercial.js      the commercial facade helpers buildings.js uses
//   colliders.js       querySegments
//   heightfield.js 5c  terrain feature meshes, the Galeries fence
//   trees.js       6   trees, shrubs, hedges
//   furniture.js   7   streetlights, lamp pools, hydro poles
//   distant.js     8   distant scenery
//   emitters.js        later emitters (yards, wires, contact, shadowdecals)
//   reactive.js    9   sidewalk runs, prop spots, buildingAt; pole queries
//   upload.js          builders to the GPU, the log line
//   draw.js            draw() and free()
//   headlights.js      nightAmount, buildHeadlights
//   consts.js, geom.js, groundgrid.js  constants, helpers, the LiDAR grid
import MATS from './materials_stub.js';
import { createCtx } from './world/ctx.js';
import { installDrape } from './world/drape.js';
import { buildGround, buildAreas } from './world/landcover.js';
import { buildWater, installWaterMask, buildShore } from './world/water.js';
import { buildRoads } from './world/roads.js';
import { buildSignposts } from './world/signposts.js';
import { buildBuildings } from './world/buildings.js';
import { installSegmentQuery } from './world/colliders.js';
import { buildHeightField } from './world/heightfield.js';
import { buildTrees } from './world/trees.js';
import { buildFurniture } from './world/furniture.js';
import { buildDistant } from './world/distant.js';
import { runEmitters } from './world/emitters.js';
import { buildReactive, installPoleQueries } from './world/reactive.js';
import { uploadWorld } from './world/upload.js';
import { makeDraw } from './world/draw.js';
import { makeCameraColliders } from './camera-colliders.js';
import { packSegmentQueries, packRoadQueries, packBuildingQueries, restoreSegmentQueries,
  restoreRoadQueries, restoreBuildingQueries, restoreWalkQueries } from './world/worker-queries.js';
import { packIndexGrid, packPoles, restorePoles } from './world/worker-packet.js';
import { planSignals, planStopSigns } from './signals.js';
import { buildTerrain, FEATURES } from './terrain.js';
import { groundGrid } from './world/groundgrid.js';

export { HOUSE_NEAR } from './world/consts.js';
export { clipRoads } from './world/geom.js';
export { MARINA_QUAYS, MARINA_BOX, baseHeightAt } from './world/groundgrid.js';
export { nightAmount, buildHeadlights } from './world/headlights.js';

export function bakeWorld(renderer, mats = MATS, opts = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ctx = createCtx(renderer, mats, opts);
  ctx.t0 = t0;
  ctx.cameraColliders = makeCameraColliders();

  installDrape(ctx);          // 0. the height field: everything below drapes on it
  buildGround(ctx);           // 0. the ground quads
  buildWater(ctx);            // 2. water
  buildAreas(ctx);            // 3. areas
  buildRoads(ctx);            // 4, 4a, 4b. roads (and walks.js inside its loops)
  buildSignposts(ctx);        // 4c. signals and stop signs
  buildBuildings(ctx);        // 5. buildings
  installSegmentQuery(ctx);   // the collider query, sized from the walls so far
  installWaterMask(ctx);      // waterAt
  buildShore(ctx);            // 5b. shoreline and the marina
  buildHeightField(ctx);      // 5c. the terrain features
  buildTrees(ctx);            // 6. trees
  buildFurniture(ctx);        // 7. street furniture
  buildDistant(ctx);          // 8. distant scenery
  runEmitters(ctx);           // later tasks' emitters (emit nothing today)
  buildReactive(ctx);         // 9. reactive world
  installPoleQueries(ctx);    // queryPoles, snapPole
  ctx.runPostBuild();         // bake passes: every builder filled, nothing uploaded
  return ctx;
}

export function buildWorld(renderer, mats = MATS, opts = {}) {
  const ctx = bakeWorld(renderer, mats, opts);
  uploadWorld(ctx);           // upload, then the builders are released
  return finishWorld(ctx);
}

export function finishWorld(ctx) {
  makeDraw(ctx);              // draw(), free(), setHouseNear()

  const cnt = ctx.count;
  return {
    chunks: ctx.chunks,
    waterChunks: ctx.waterChunks,
    nightChunks: ctx.nightChunks,
    free: ctx.free,
    roads: ctx.roads,       // the slice's roads (clipped), MAP.roads for a full build
    setHouseNear: ctx.setHouseNear,
    stats: ctx.stats,
    mats: ctx.mats,
    signage: ctx.signage,
    distant: ctx.distantMesh,
    poles: ctx.poles,
    signals: ctx.SIGNALS,
    stopSigns: ctx.STOPS,
    intersections: cnt.interCount,
    landmarkRoofs: cnt.landmarkRoofs,
    draw: ctx.draw,
    querySegments: ctx.querySegments,
    cameraColliders: ctx.cameraColliders,
    queryCameraBlocks: ctx.cameraColliders.query,
    cameraStats: ctx.cameraColliders.stats,
    roadAt: ctx.roadAt,
    pavedAt: ctx.pavedAt,   // (x, z, skipRoadIndex, margin): on somebody's lane?
    furniture: ctx.furniture,   // every candidate slab/pole/tree and its verdict
    waterAt: ctx.waterAt,
    groundAt: ctx.groundAt, // terrain.js height field: { h, nx, ny, nz, kind }
    baseAt: ctx.baseAt,     // the LiDAR base alone, no features: { h, nx, ny, nz }
    terrain: ctx.terrain,   // the field itself, if you want the feature list
    terrainStats: ctx.terrainStats,
    groundMeshStats: ctx.groundMeshStats,
    nearestRoad: ctx.nearestRoad,
    queryPoles: ctx.queryPoles,
    snapPole: ctx.snapPole,
    fallen: ctx.fallen,     // poles on their way down / lying there
    poleCount: cnt.poleCount,
    // 9. reactive world: where the pavement runs and what is standing on it
    cemeteryFences: ctx.cemeteryFences, streetClear: ctx.streetClear,
    walks: ctx.walks,       // sidewalk runs, nodes every 5 m
    queryWalks: ctx.queryWalks,   // (x, z, r) -> indices into walks
    walkStep: ctx.REACT.step,
    propSpots: ctx.propSpotList,  // [{x, z, yaw, kind}] for streetprops.js
    buildingAt: ctx.buildingAt,
    bounds: ctx.B,
  };
}

// The final packet contains queries and small runtime records, never builders,
// renderer handles or functions. Camera buffers retain their exact ordering.
export function packWorldQueries(ctx) {
  const { furn, count } = ctx;
  return {
    bounds: ctx.B, NX: ctx.NX, count, roads: ctx.roads,
    terrainStats: ctx.terrainStats, groundMeshStats: ctx.groundMeshStats,
    cemeteryFences: ctx.cemeteryFences,
    segments: packSegmentQueries(ctx), roadsQuery: packRoadQueries(ctx),
    buildings: packBuildingQueries(ctx), walkGrid: packIndexGrid(ctx.walkGrid),
    walks: ctx.walks, propSpotList: ctx.propSpotList, REACT: ctx.REACT,
    poles: packPoles(ctx.poles, ctx.poleGrid, ctx.SIGNALS),
    camera: ctx.cameraColliders.toPacket(),
    furniture: { n: furn.x.length, x: Float64Array.from(furn.x), z: Float64Array.from(furn.z),
      road: Int32Array.from(furn.road), dropped: Uint8Array.from(furn.dropped),
      kind: furn.kind, droppedCount: count.furnDropped },
  };
}

let sharedTerrain = null;
export async function restoreWorldQueries(ctx, packet, yieldTask = async () => {}) {
  Object.assign(ctx, { B: packet.bounds, NX: packet.NX, count: packet.count, roads: packet.roads,
    terrainStats: packet.terrainStats, groundMeshStats: packet.groundMeshStats,
    cemeteryFences: packet.cemeteryFences, walks: packet.walks, propSpotList: packet.propSpotList,
    REACT: packet.REACT, furniture: packet.furniture, SIGNALS: planSignals(), STOPS: planStopSigns() });
  Object.assign(ctx, restoreSegmentQueries(packet.segments));
  await yieldTask('segments');
  Object.assign(ctx, restoreRoadQueries(packet.roadsQuery));
  await yieldTask('roads');
  Object.assign(ctx, restoreBuildingQueries(packet.buildings), restoreWalkQueries(packet.walkGrid));
  await yieldTask('buildings-walks');
  ctx.cameraColliders = makeCameraColliders(packet.camera);
  await yieldTask('camera');
  Object.assign(ctx, restorePoles(packet.poles, ctx.SIGNALS, ctx.landMesh));
  installPoleQueries(ctx);
  // Query factory only: no terrain mesh or world generator runs on restoration.
  sharedTerrain ||= buildTerrain(FEATURES, groundGrid());
  ctx.terrain = sharedTerrain; ctx.groundAt = sharedTerrain.groundAt; ctx.baseAt = sharedTerrain.baseAt;
  installWaterMask(ctx);
  await yieldTask('poles-ground-water');
}
