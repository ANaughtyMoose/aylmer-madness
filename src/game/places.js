// Named spots in the real Aylmer, keyed the way missions refer to them.
// Coordinates are metres in the mapdata frame (+X east, +Z south); most come
// straight from OpenStreetMap building centroids / POIs in mapdata.js.
// `resolvePlaces(world)` snaps each spot onto the nearest street so markers and
// spawn points sit on asphalt instead of in someone's living room.
import { MAP } from './mapdata.js';

// How far a named POI may pull a place from its authored coordinate. Big enough
// to absorb an OSM centroid landing on the far corner of a mall parking lot,
// far too small to reach the next town over.
const POI_SNAP = 600;

export const PLACES = {
  // The four homes.
  home:      { x: 932.9, z: 143.9, label: '299 Chemin Fraser', snap: true },
  // The 'steph' key is historical; the person is Sayyad.
  steph:     { x: -720.5, z: -465.4, label: '75 Denise-Friend (Sayyad)', snap: true },
  margaret:  { x: 932.9, z: 143.9, label: '299 Chemin Fraser (Margaret)', snap: true },
  dave:      { x: 2389.2, z: 1384.6, label: '20 Chemin Vanier (Adam, Deschênes)', snap: true },
  // Landmarks.
  mall:      { x: -18.9, z: -331.2, label: 'Galeries d’Aylmer', snap: true, lot: true },
  beach:     { x: -1918.1, z: -451.5, label: 'Plage des Cèdres', snap: true, lot: true },
  marina:    { x: -1766, z: -88, label: 'Marina d’Aylmer', snap: true, lot: true },
  lookout:   { x: -1798, z: -22, label: 'Le phare de la marina', snap: true, lot: true },
  tims:      { x: -242.6, z: -180.7, label: 'Tim Hortons, Principale', snap: true, lot: true },
  mcdo:      { x: 318.4, z: -238.3, label: 'McDo, Chemin d’Aylmer', snap: true, lot: true },
  dep:       { x: -786.8, z: -339.4, label: 'Dépanneur Palmyra', snap: true, lot: true },
  arena:     { x: -605.6, z: 79, label: 'Aréna Frank-Robinson', snap: true, lot: true },
  church:    { x: -924.1, z: -408.2, label: 'Paroisse Saint-Paul', snap: true, lot: true },
  gas:       { poi: 'Petro-Canada', x: 2197.6, z: 887.4, label: 'La station', snap: true, lot: true },
  principale:{ x: -877, z: -102, label: 'Vieux-Aylmer, rue Principale', snap: true },
  symmes:    { x: -1517.5, z: -61.1, label: 'Auberge Symmes', snap: true, lot: true },
  deschenes: { x: 2369.5, z: 1133.3, label: 'Hôtel Deschênes', snap: true, lot: true },
  // Highway to Hull expansion: the old east-edge placeholder is now the seam,
  // and Heritage is a real destination beyond it.
  hullgate:  { x: 2734.8, z: -3245.4, label: 'Route 148 — entrée vers Hull' },
  heritage:  { poi: 'Heritage College', road: 'Boulevard de la Cité-des-Jeunes', x: 5521, z: -6836, label: 'Heritage College, secteur Hull', snap: true },
  hullmuseum:{ poi: "Musée canadien de l'histoire", x: 9827, z: -4016, label: 'Musée canadien de l’histoire, Hull', snap: true, lot: true },
  hulldowntown:{ poi: 'La Place du Portage', road: 'Promenade du Portage', x: 9510, z: -3364, label: 'Centre-ville de Hull', snap: true },
  hullcasino:{ poi: 'Casino du Lac-Leamy', x: 8622, z: -5768, label: 'Casino du Lac-Leamy, Hull', snap: true, lot: true },
  hullmall:  { poi: 'Les Galeries de Hull', x: 8101, z: -5251, label: 'Les Galeries de Hull', snap: true, lot: true },
  ottawa:    { poi: 'Parliament Hill', road: 'Wellington Street', x: 10668, z: -3330, label: 'Colline du Parlement, Ottawa', snap: true },
  chelsea:   { poi: 'Chelsea Town Hall', x: 3092, z: -12175, label: 'Hôtel de ville de Chelsea', snap: true, lot: true },

  // ---- side jobs -------------------------------------------------------
  // 225 chemin d'Aylmer. The footprint and the POI are both in mapdata.
  ctire:     { poi: 'Canadian Tire', x: 429.2, z: -242.8, label: 'Canadian Tire, chemin d’Aylmer', snap: true, lot: true },
  // The used lot: a gravel corner on chemin d'Aylmer beside the Canadian Tire.
  // Four beaters nose-to-tail and a plywood sign — see game/garage.js.
  usedlot:   { road: "Chemin d'Aylmer", x: 520, z: -246, label: 'Lot d’occasion, chemin d’Aylmer', snap: true },
  // The garage sale: 41 Promenade Wychwood, a real footprint on a real street.
  yardsale:  { road: 'Promenade Wychwood', x: -523.8, z: 219.8, label: '41 Promenade Wychwood', snap: true },
  // 'sayyad' is the same house as 'steph' (historical key) — same coordinates, and the
  // label keeps "Denise" in it so mapState()'s home-address filter still hides it.
  sayyad:    { x: -720.5, z: -465.4, label: '75 Denise-Friend (Sayyad)', snap: true },
  // 129 avenue Frank-Robinson, west side, just south of rue Smiley.
  mike:      { x: -428.3, z: 58.3, label: '129 Frank-Robinson (Mike)', snap: true },
  // Île Aylmer, out in Lac Deschênes. Deliberately NOT snapped to a road.
  island:    { x: -1227, z: 612, label: 'Île Aylmer' },
  // Club de Golf Gatineau: the clubhouse sits ~29 m south of the service loop
  // that OpenStreetMap calls Rue du Golf, which is what the marker snaps onto.
  // The golf cart is parked on the apron in front of the building (see
  // main.js homeParked / save.js apronSpot), far enough from the marker that
  // « prendre le cart » and « Le cart du Club » are two different prompts.
  aigle:     { x: 1593.8, z: -1262.8, label: 'École de l’Aigle', snap: true, lot: true },
  golf:      { road: 'Rue du Golf', x: 1256.8, z: -1320.9,
               label: 'Club de Golf Gatineau, rue du Golf', snap: true, lot: true },
};

// Closest point on a road with the given name, or (name=null) on any road
// including parking aisles — businesses get their marker in the lot.
function pointOnRoad(name, x, z) {
  let best = null, bd = Infinity;
  for (const r of MAP.roads) {
    if (name ? r.name !== name : false) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const px = ax + ex * t, pz = az + ez * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name }; }
    }
  }
  return best;
}

export function resolvePlaces(world) {
  for (const key of Object.keys(PLACES)) {
    const p = PLACES[key];
    if (p.poi) {
      // Nearest POI of that name to the coordinate written above, not the first
      // one in the array. Once Hull was merged in, "Petro-Canada" matched a
      // station 6.4 km east and took the dépanneur job and the repair point
      // with it; "Canadian Tire" now matches twice. The authored coordinate is
      // the intent, so the name only ever refines it — never relocates it.
      let hit = null, best = POI_SNAP * POI_SNAP;
      for (const q of MAP.pois) {
        if (q.name !== p.poi) continue;
        const d = (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z);
        if (d < best) { best = d; hit = q; }
      }
      if (hit) { p.x = hit.x; p.z = hit.z; }
    }
    p.bx = p.x; p.bz = p.z;                       // where the building actually is
    let r = p.road ? pointOnRoad(p.road, p.x, p.z) : null;
    if (!r && p.lot) r = pointOnRoad(null, p.x, p.z);
    if (!r && p.snap) r = world.nearestRoad(p.x, p.z);
    if (r) {
      p.x = r.x; p.z = r.z; p.a = r.yaw;
      // Face the car along the road, toward whichever way is longer to drive.
      p.street = r.name || p.road || '';
    } else {
      p.a = p.a || 0;
    }
  }
  return PLACES;
}

export function place(name) {
  const p = PLACES[name];
  if (!p) throw new Error('unknown place: ' + name);
  return p;
}
