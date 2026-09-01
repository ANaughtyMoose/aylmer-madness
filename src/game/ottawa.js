// Downtown Ottawa merger — the sector east of the Hull seam.
//
// The Highway to Hull extract stops at lon -75.690, a line that runs straight
// through the Rideau Centre and clips the ByWard Market's eastern blocks. This
// carries the strip from that seam east to Nicholas and King Edward: Parliament
// Hill's east flank, Confederation Square, the canal locks, the Château, the
// market and the National Gallery. The geometry is generated from OpenStreetMap
// by tools/build_ottawa.py into ottawa_mapdata.js.
//
// Merging is the same trick highway_to_hull.js uses and works for the same
// reason: one projection, one set of OSM node ids, so the road graph stays a
// single connected component and nav.js routes over the Champlain Bridge from
// Aylmer to Parliament without a loading gate or a hand-authored connector.
//
// This module is also where the map stops being 2026. rollBackTo2004() runs
// over the WHOLE merged map, not just this sector, which is why the rollback
// lives here and not in the build script — it has to reach Aylmer and Hull, and
// their generated modules are not ours to rewrite.
import { MAP } from './mapdata.js';
import { OTTAWA_MAP } from './ottawa_mapdata.js';
import { PLACES } from './places.js';
import { rollBackTo2004 } from './period2004.js';
import { HERO, clearHeroFootprints } from './ottawa_landmarks.js';

function merge(map) {
  if (map.expansions?.ottawaDowntown) return map;

  // Buildings whose footprint straddles the seam were dropped by BOTH extracts'
  // all-points-inside test, so build_ottawa.py reaches ~600 m west of the seam
  // to recover them. Anything already carried by Hull is dropped here by OSM
  // way id rather than being drawn twice.
  const haveId = new Set();
  for (const b of map.buildings) if (b.id != null) haveId.add(b.id);
  for (const b of OTTAWA_MAP.buildings) {
    if (b.id != null && haveId.has(b.id)) continue;
    map.buildings.push(b);
  }

  map.roads.push(...OTTAWA_MAP.roads);
  map.areas.push(...OTTAWA_MAP.areas);

  // POIs are not id-keyed, and the same shop name legitimately repeats across
  // the map (four Tim Hortons, two Canadian Tires). Only a same-named POI
  // within 300 m is the same place; anything further away is a different one.
  for (const p of OTTAWA_MAP.pois) {
    let dupe = false;
    for (const q of map.pois) {
      if (q.name !== p.name) continue;
      if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 300 * 300) { dupe = true; break; }
    }
    if (!dupe) map.pois.push(p);
  }

  map.expansionWater = [
    ...(map.expansionWater || []),
    ...OTTAWA_MAP.areas.filter((a) => a.k === 'water').map((a) => a.p),
  ];
  map.bounds.minX = Math.min(map.bounds.minX, OTTAWA_MAP.bounds.minX);
  map.bounds.maxX = Math.max(map.bounds.maxX, OTTAWA_MAP.bounds.maxX);
  map.bounds.minZ = Math.min(map.bounds.minZ, OTTAWA_MAP.bounds.minZ);
  map.bounds.maxZ = Math.max(map.bounds.maxZ, OTTAWA_MAP.bounds.maxZ);
  map.expansions = {
    ...(map.expansions || {}),
    ottawaDowntown: true,
    ottawaDowntownSource: 'OpenStreetMap',
    period2004: true,
  };
  return map;
}

merge(MAP);
export const PERIOD = rollBackTo2004(MAP);
// The six hero buildings are rebuilt properly in ottawa_landmarks.js. Their OSM
// footprints stay in the map as low, inset collision stubs so a car still hits
// the Peace Tower, but they no longer draw the grey box the hero mesh replaces.
export const HERO_CLEARED = clearHeroFootprints(MAP);

// ---------------------------------------------------------------- destinations

// Named spots, same schema as places.js. `poi` refines the authored coordinate
// against a real OSM POI of that name; `road` picks which street the marker
// snaps onto. Player-facing labels are Québécois French — this is a Québec game
// looking across the river at Ontario, and the point of view is the joke.
export const OTTAWA_PLACES = {
  parlement:  { poi: 'Parliament Hill', road: 'Wellington Street',
                x: 10668, z: -3330, label: 'La Colline du Parlement', snap: true },
  chateau:    { poi: 'Fairmont Château Laurier', road: 'Rideau Street',
                x: 10966, z: -3492, label: 'Le Château Laurier', snap: true, lot: true },
  rideau:     { poi: 'Rideau Centre', road: 'Rideau Street',
                x: 11276, z: -3465, label: 'Le Centre Rideau', snap: true, lot: true },
  byward:     { poi: 'Byward Market Building', road: 'York Street',
                x: 11187, z: -3722, label: 'Le marché By', snap: true, lot: true },
  // St. Patrick Street, not Sussex Drive. The Hull extract leaves a 1,600-node
  // fragment of Sussex stranded north of the Gallery — it predates this sector
  // and is not ours to fix — and snapping to the nearest Sussex point drops the
  // marker onto it, where nothing can drive. St. Patrick runs along the
  // Gallery's south side, is fully connected, and is the way you would actually
  // arrive from the Alexandra Bridge.
  gallery:    { poi: 'National Gallery of Canada', road: 'St. Patrick Street',
                x: 10695, z: -3928, label: 'Le Musée des beaux-arts', snap: true },
  stvincent:  { poi: 'Élisabeth Bruyère Hospital', road: 'Bruyère Street',
                x: 10828, z: -4227, label: 'L’hôpital Saint-Vincent', snap: true, lot: true },
};

for (const [k, v] of Object.entries(OTTAWA_PLACES)) PLACES[k] = v;

// What main.js offers in the start-point picker, and the short label the picker
// map draws beside the pin. Keep these short: the picker lays the boxes out by
// hand and a long one shoves its neighbours off the canvas.
export const OTTAWA_STARTS = ['parlement', 'chateau', 'rideau', 'byward', 'gallery'];
export const OTTAWA_START_LABELS = {
  parlement: 'Le Parlement', chateau: 'Château Laurier', rideau: 'Centre Rideau',
  byward: 'Marché By', gallery: 'Beaux-arts',
};

export { HERO };
export { addOttawaLandmarks } from './ottawa_landmarks.js';
