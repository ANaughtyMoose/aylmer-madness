// Sector gating — which slice of the map is resident, and when it changes.
//
// The merged map (Aylmer + Highway to Hull + downtown Ottawa) is 3.8 M
// triangles and 390 MB of GPU buffers built up front, and Safari kills the tab
// for it. So the map is cut into four sectors and buildWorld() bakes one slice
// at a time (its `opts.inside` filter): the sector you start in is built
// before you drive, the next one is built when you come within APPROACH of
// anything in it, and a sector you have driven LEAVE metres away from is freed.
// Two neighbours are resident at most — Aylmer + Hull, or Hull + Ottawa —
// never all four.
//
// Seams are allowed, and are an event: main.js puts the sector card up before
// the bake and holds the sim under it. What a seam must never do is touch the
// clock or the weather, and it does not — nothing here knows they exist.
//
// The sectors are spatial, not the data modules. The Hull extract carries the
// Ottawa south bank and Chelsea as well, and the thing a player feels as
// "arriving in Ottawa" is crossing the river, so Ottawa is everything south of
// the river centreline and Chelsea everything north of CHELSEA_Z; the seam at
// SEAM_X is the Aylmer extract's own east edge (lon -75.803).
import { MAP } from './mapdata.js';
import { buildWorld, HOUSE_NEAR } from './world.js';
import { buildSignage } from './signage.js';

export const SEAM_X = 2540.6;
export const CHELSEA_Z = -8500;
export const APPROACH = 1200;    // metres from a sector's nearest road before it is built
export const LEAVE = 2600;       // metres from all of it before it is freed (> APPROACH: hysteresis)
const CELL = 500;                // the approach index's cell size

// The Ottawa shoreline, x ascending: Ottawa is the land SOUTH of the river,
// so the seam hugs the far bank (the river itself, and every bridge deck, is
// Hull's). West of the Champlain Bridge there is no Ottawa land in the map at
// all — the Hull extract carries Deschênes (north bank, z up to +1460) on that
// side of the Aylmer seam and nothing across the water — so the seam starts
// far south of everything and only meets the river at x ≈ 5750. Points to x = 10250
// are the southernmost water edge of the Ottawa River polygons sampled every
// 250 m; from Nepean Point east the polygons no longer carry the channel, so
// the last points are the shore from the map itself (Parliament's cliff,
// Nepean Point, Earnscliffe, Rideau Falls, Rockcliffe), a few tens of metres
// out in the water.
const RIVER = [
  [2540, 2500], [5550, 2500], [5750, -520], [6000, -950], [6250, -1200],
  [6500, -1250], [6750, -1450], [7000, -1650], [7250, -1880], [7500, -1920],
  [7750, -2040], [8000, -1980], [8250, -2050], [8500, -1980], [8750, -2020],
  [9000, -2160], [9250, -2700], [9500, -2760], [9750, -2900], [10000, -3120],
  [10250, -3300], [10500, -3700], [10600, -4100], [10800, -4500], [11000, -5150],
  [11374, -5800], [12200, -6500],
];
export function riverZ(x) {
  if (x <= RIVER[0][0]) return RIVER[0][1];
  for (let i = 1; i < RIVER.length; i++) {
    if (x <= RIVER[i][0]) {
      const [x0, z0] = RIVER[i - 1], [x1, z1] = RIVER[i];
      return z0 + (z1 - z0) * (x - x0) / (x1 - x0);
    }
  }
  return RIVER[RIVER.length - 1][1];
}

export const SECTOR_IDS = ['aylmer', 'hull', 'chelsea', 'ottawa'];
export function sectorAt(x, z) {
  if (x < SEAM_X) return 'aylmer';
  if (z > riverZ(x)) return 'ottawa';      // +z is south; the far bank is Ontario
  if (z < CHELSEA_Z) return 'chelsea';
  return 'hull';
}
const insideOf = (id) => (x, z) => sectorAt(x, z) === id;

// ------------------------------------------------------------ approach index
// Which sectors have a road within a cell. "Near sector S" then means "any
// cell within R holds S", which is cheap enough to ask twice a second and
// honest about a sector like Ottawa whose bounding box overlaps Hull's.
let cells = null;
const ckey = (i, j) => (i + 4096) * 8192 + (j + 4096);
function index() {
  if (cells) return cells;
  cells = new Map();
  for (const road of MAP.roads) {
    for (const p of road.pts) {
      const k = ckey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
      let set = cells.get(k);
      if (!set) { set = new Set(); cells.set(k, set); }
      set.add(sectorAt(p[0], p[1]));
    }
  }
  return cells;
}
export function nearSectors(x, z, r) {
  const c = index();
  const out = new Set([sectorAt(x, z)]);   // wherever you stand is always near
  const n = Math.ceil(r / CELL);
  const i0 = Math.floor(x / CELL), j0 = Math.floor(z / CELL);
  for (let i = i0 - n; i <= i0 + n; i++) {
    for (let j = j0 - n; j <= j0 + n; j++) {
      const set = c.get(ckey(i, j));
      if (!set) continue;
      // Distance to the cell, not its centre, so a road just over the line counts.
      const dx = Math.max(0, Math.abs(x - (i + 0.5) * CELL) - CELL / 2);
      const dz = Math.max(0, Math.abs(z - (j + 0.5) * CELL) - CELL / 2);
      if (dx * dx + dz * dz > r * r) continue;
      for (const id of set) out.add(id);
    }
  }
  return out;
}

// ------------------------------------------------------------ the aggregate
// Same surface as buildWorld()'s return, so main.js, the physics closures,
// landmarks.js (which wraps draw and querySegments) and the reactive world
// cannot tell the difference. Queries fan out over the loaded slices.
export function buildSectors(renderer, mats, home = { x: 932.9, z: 143.9 }) {
  const loaded = new Map();               // id -> slice
  const fallen = [];                      // poles on their way down, all slices
  let houseNear = HOUSE_NEAR;
  const B = MAP.bounds;

  const W = {
    bounds: B,
    roads: MAP.roads,
    chunks: [], waterChunks: [], nightChunks: [],
    walks: [], propSpots: [], poles: [],
    walkStep: 5,
    fallen,
    distant: null,
    signage: buildSignage(renderer),
    signals: null, stopSigns: null,
    terrain: null, terrainStats: null, furniture: null,
    intersections: 0, poleCount: 0, landmarkRoofs: 0,
    mats,
    stats: { resident: 0, residentNear: 0, residentFar: 0, tris: 0, draws: 0, near: 0, far: 0, chunks: 0 },
    version: 0,                           // bumps on every load/unload
  };

  // Rebuild the flat views after a load or unload. The arrays keep their
  // identity (peds.js holds `world.walks`), and every slice remembers where
  // its walks begin so queryWalks can hand back indices into the joined list.
  function refresh() {
    W.chunks.length = 0; W.waterChunks.length = 0; W.nightChunks.length = 0;
    W.walks.length = 0; W.propSpots.length = 0; W.poles.length = 0;
    W.stats.resident = 0; W.stats.residentNear = 0; W.stats.residentFar = 0;
    W.intersections = 0; W.poleCount = 0; W.landmarkRoofs = 0;
    let first = null;
    for (const w of loaded.values()) {
      if (!first) first = w;
      for (const c of w.chunks) W.chunks.push(c);
      for (const c of w.waterChunks) W.waterChunks.push(c);
      for (const c of w.nightChunks) W.nightChunks.push(c);
      w.walkBase = W.walks.length;
      for (const k of w.walks) W.walks.push(k);
      for (const p of w.propSpots) W.propSpots.push(p);
      for (const p of w.poles) W.poles.push(p);
      W.stats.resident += w.stats.resident;
      W.stats.residentNear += w.stats.residentNear;
      W.stats.residentFar += w.stats.residentFar;
      W.intersections += w.intersections;
      W.poleCount += w.poleCount;
      W.landmarkRoofs += w.landmarkRoofs;
    }
    W.signals = first ? first.signals : [];
    W.stopSigns = first ? first.stopSigns : [];
    W.terrain = first ? first.terrain : null;
    W.terrainStats = first ? first.terrainStats : null;
    W.furniture = first ? first.furniture : null;
    W.version++;
  }

  function load(id) {
    if (loaded.has(id)) return loaded.get(id);
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const w = buildWorld(renderer, mats, {
      inside: insideOf(id), distant: !W.distant, signage: false, fallen,
    });
    w.id = id;
    w.setHouseNear(houseNear);
    if (!W.distant && w.distant) W.distant = w.distant;
    loaded.set(id, w);
    refresh();
    const ms = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) | 0;
    console.log(`sector: ${id} built in ${ms} ms (${w.chunks.length} chunks, ${w.stats.resident | 0} tris); resident: ${[...loaded.keys()].join('+')}`);
    return w;
  }
  function unload(id) {
    const w = loaded.get(id);
    if (!w) return;
    loaded.delete(id);
    w.free();
    refresh();
    console.log(`sector: ${id} freed; resident: ${[...loaded.keys()].join('+') || 'nothing'}`);
  }
  // What should change for a player standing at (x, z): sectors within
  // APPROACH that are not built, and built ones with nothing inside LEAVE.
  function plan(x, z) {
    const near = nearSectors(x, z, APPROACH);
    const keep = nearSectors(x, z, LEAVE);
    const out = { load: [], unload: [] };
    for (const id of SECTOR_IDS) if (near.has(id) && !loaded.has(id)) out.load.push(id);
    for (const id of loaded.keys()) if (!keep.has(id)) out.unload.push(id);
    return out;
  }
  function update(x, z) {
    const p = plan(x, z);
    for (const id of p.unload) unload(id);
    for (const id of p.load) load(id);
    return p;
  }

  // ---- queries: fan out over the loaded slices ----------------------------
  const segOut = [];
  W.querySegments = (x, z, r) => {
    segOut.length = 0;
    for (const w of loaded.values()) {
      const list = w.querySegments(x, z, r);
      for (let i = 0; i < list.length; i++) segOut.push(list[i]);
    }
    return segOut;
  };
  const poleOut = [];
  W.queryPoles = (x, z, r) => {
    poleOut.length = 0;
    for (const w of loaded.values()) {
      const list = w.queryPoles(x, z, r);
      for (let i = 0; i < list.length; i++) poleOut.push(list[i]);
    }
    return poleOut;
  };
  W.snapPole = (p, ux, uz) => {
    for (const w of loaded.values()) if (w.poles.includes(p)) return w.snapPole(p, ux, uz);
    return null;
  };
  W.roadAt = (x, z) => { for (const w of loaded.values()) if (w.roadAt(x, z)) return true; return false; };
  W.pavedAt = (x, z, skip, margin) => {
    for (const w of loaded.values()) if (w.pavedAt(x, z, skip, margin)) return true;
    return false;
  };
  W.buildingAt = (x, z, pad) => {
    for (const w of loaded.values()) { const b = w.buildingAt(x, z, pad); if (b) return b; }
    return null;
  };
  // The water mask and the height field are the same in every slice.
  const any = () => loaded.values().next().value;
  W.waterAt = (x, z) => { const w = any(); return w ? w.waterAt(x, z) : false; };
  const flat = { h: 0, nx: 0, ny: 1, nz: 0, kind: 'grass' };
  W.groundAt = (x, z) => { const w = any(); return w ? w.groundAt(x, z) : flat; };
  const walkOut = [];
  W.queryWalks = (x, z, r) => {
    walkOut.length = 0;
    for (const w of loaded.values()) {
      const list = w.queryWalks(x, z, r);
      for (let i = 0; i < list.length; i++) walkOut.push(list[i] + w.walkBase);
    }
    return walkOut;
  };
  // Nearest non-service road. A loaded slice answers from its index; a place
  // in a slice that is not built yet (places.js snaps every destination at
  // boot, Ottawa's included) is answered from the raw road list instead.
  W.nearestRoad = (x, z) => {
    let best = null;
    for (const w of loaded.values()) {
      const r = w.nearestRoad(x, z);
      if (!best || r.dist < best.dist) best = r;
    }
    if (best && loaded.has(sectorAt(x, z))) return best;
    const raw = nearestRoadRaw(x, z);
    return best && best.dist <= raw.dist ? best : raw;
  };
  W.setHouseNear = (m) => { houseNear = m; for (const w of loaded.values()) w.setHouseNear(m); };

  const signOpts = { tex: null };
  W.draw = (r, model, x, z, drawDist, dtSec) => {
    const s = W.stats;
    s.tris = 0; s.draws = 0; s.near = 0; s.far = 0; s.chunks = 0;
    for (const w of loaded.values()) {
      w.draw(r, model, x, z, drawDist, dtSec);
      s.tris += w.stats.tris; s.draws += w.stats.draws; s.near += w.stats.near;
      s.far += w.stats.far; s.chunks += w.stats.chunks;
    }
    if (W.signage) {
      signOpts.tex = W.signage.tex;
      if (r.visible(W.signage.mesh)) r.draw(W.signage.mesh, model, signOpts);
    }
  };

  W.sectors = {
    load, unload, plan, update,
    at: sectorAt,
    has: (id) => loaded.has(id),
    loaded: () => [...loaded.keys()].join('+'),
    slice: (id) => loaded.get(id) || null,
  };

  load(sectorAt(home.x, home.z));
  return W;
}

function nearestRoadRaw(x, z) {
  let best = Infinity, bx = x, bz = z, byaw = 0, bname = '';
  for (const road of MAP.roads) {
    if (road.cls === 'service') continue;
    const pts = road.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = ax + t * dx, pz = az + t * dz;
      const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d2 < best) { best = d2; bx = px; bz = pz; byaw = Math.atan2(dx, dz); bname = road.name || ''; }
    }
  }
  return { x: bx, z: bz, yaw: byaw, name: bname, dist: Math.sqrt(best) };
}
