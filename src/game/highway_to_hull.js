// Highway to Hull expansion merger.
// The geometry itself is generated from OpenStreetMap by tools/build_hull.py.
import { HULL_MAP } from './hull_mapdata.js';

export function applyHighwayToHull(map) {
  if (!map || map.expansions?.highwayToHull) return map;

  // The original raster is anchored to the original Aylmer bounds. Preserve
  // that origin before enlarging MAP.bounds; Hull water is carried as polygons.
  map.waterMask.minX ??= map.bounds.minX;
  map.waterMask.minZ ??= map.bounds.minZ;

  // Both extracts use the same OSM node ids and the same Aylmer projection.
  // Roads crossing the -75.803 seam therefore remain one routable graph: no
  // teleport, loading gate, or hand-authored connector is needed.
  map.roads.push(...HULL_MAP.roads);
  map.buildings.push(...HULL_MAP.buildings);
  map.areas.push(...HULL_MAP.areas);
  map.pois.push(...HULL_MAP.pois);
  map.expansionWater = HULL_MAP.areas.filter((a) => a.k === 'water').map((a) => a.p);
  map.bounds.minX = Math.min(map.bounds.minX, HULL_MAP.bounds.minX);
  map.bounds.maxX = Math.max(map.bounds.maxX, HULL_MAP.bounds.maxX);
  map.bounds.minZ = Math.min(map.bounds.minZ, HULL_MAP.bounds.minZ);
  map.bounds.maxZ = Math.max(map.bounds.maxZ, HULL_MAP.bounds.maxZ);
  map.expansions = {
    ...(map.expansions || {}),
    highwayToHull: true,
    highwayToHullSource: 'OpenStreetMap',
  };
  return map;
}
