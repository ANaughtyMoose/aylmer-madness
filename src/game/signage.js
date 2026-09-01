// Storefront signage. Real OpenStreetMap POIs supply the locations; the names
// come from assets/text/storefronts.json — 120 hand-written Québec small-town
// business names, ten in each of twelve trades. Each POI gets a lit fascia on a
// nearby building or a freestanding roadside board when no wall suits.
//
// One canvas atlas, one mesh, one draw call for the whole town.
//
// Three rules decide what a given sign says, in order:
//   1. a genuine name (Tim Hortons, Canadian Tire, la SAQ) beats any invention —
//      the real ones are half of why somebody from Aylmer recognises the street,
//   2. a park, a school or a church keeps its own civic label; a bowling-alley
//      name on a playground is not a joke, it is a bug,
//   3. everything else draws a hand-written name whose TRADE matches the POI
//      kind, and where the map data gives no usable kind, one picked by where
//      the sign stands: casse-croûtes and deps out in the streets, taverns and
//      pizzerias on the two shopping strips.
// Nothing is ever used twice.
//
// API
//   planSigns()                     -> [{name,x,z,yaw,w,h,y,slot}]  pure, node-safe
//   loadStorefronts(base)           -> Promise<[{type,name}]>       fetch + cache
//   setStorefronts(list)            install a name list, invalidate the plan
//   buildSignage(renderer)          -> { mesh, tex, names } | null  (null: no DOM)
//   primeSignage(renderer, existing) load the JSON, then rebuild in place
import { MAP } from './mapdata.js';
import { QUEBEC_POIS } from './quebec_pois.js';
import { MeshBuilder } from '../core/mesh.js';

const MAX_SIGNS = 120;
const NEAR_BUILDING = 25;     // metres: no footprint this close, no sign
const ATLAS_W = 2048, ATLAS_H = 1024;
const COLS = 8, ROWS = 16;    // 128 cells of 256 x 64 — 4:1, same as the boards
const CW = ATLAS_W / COLS, CH = ATLAS_H / ROWS;

// Anything residential or civic is not a storefront.
const SKIP = new Set(['house', 'apartments', 'industrial', 'school', 'church',
  'bicycle_parking', 'public_bookcase', 'information', 'photo_booth', 'big', 'public']);

// The two shopping streets. Signs closest to these get the 60 slots.
const HIGH_STREETS = ['Rue Principale', "Chemin d'Aylmer"];

// Awning colours — a strip of Québec storefronts is never one colour.
const BOARDS = ['#1d3f6e', '#7a2230', '#20563a', '#3a3540', '#6a4a1c', '#243a4a'];

function ringArea2(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

function d2seg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = ax + t * dx - x, pz = az + t * dz - z;
  return px * px + pz * pz;
}

// Squared distance from (x,z) to the nearest point of the named high streets.
function highStreetD2(x, z) {
  let best = Infinity;
  for (const r of MAP.roads) {
    if (HIGH_STREETS.indexOf(r.name) < 0) continue;
    const p = r.pts;
    for (let i = 0; i + 1 < p.length; i++) {
      const d = d2seg(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

// Nearest road point of any class — the wall we want is the one facing it.
function nearestRoadPoint(x, z) {
  let best = Infinity, bx = x, bz = z - 1;
  for (const r of MAP.roads) {
    const p = r.pts;
    for (let i = 0; i + 1 < p.length; i++) {
      const ax = p[i][0], az = p[i][1], qx = p[i + 1][0], qz = p[i + 1][1];
      const dx = qx - ax, dz = qz - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = ax + t * dx, pz = az + t * dz;
      const d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
  }
  return [bx, bz, best];
}

// ---------------------------------------------------------------- the names
//
// assets/text/storefronts.json is authored content, not generated, so it is
// fetched rather than compiled in. The fallback below is one name per trade: if
// the file is missing the town still gets signs, just a repetitive dozen of
// them, and nothing throws in the middle of buildWorld.
export const STOREFRONT_URL = 'assets/text/storefronts.json';
const FALLBACK = [
  { type: 'casse-croûte', name: 'Le Roi de la Poutine d’Aylmer' },
  { type: 'dépanneur', name: 'Dépanneur Chez Ti-Guy' },
  { type: 'garage', name: 'Garage Norm Lafleur & Fils' },
  { type: 'coiffure', name: 'Salon Coupe Longueuil' },
  { type: 'quincaillerie', name: 'Quincaillerie du Coin' },
  { type: 'pharmacie', name: 'Pharmacie du Village' },
  { type: 'fleuriste', name: 'Fleuriste Chez Ginette' },
  { type: 'taverne', name: 'Taverne du Vieux Pont' },
  { type: 'pizzeria', name: 'Pizzeria Napolitaine 2 pour 1' },
  { type: 'club vidéo', name: 'Vidéo Plus 2004' },
  { type: 'salon de quilles', name: 'Salon de Quilles Bowl-O-Rama' },
  { type: 'vente de chars usagés', name: 'Les Chars à Ti-Guy' },
];
let _fronts = FALLBACK;
let _loaded = null;

/** Install a storefront list (from the JSON, or a test's own). Clears the plan. */
export function setStorefronts(list) {
  if (Array.isArray(list) && list.length) { _fronts = list; _plan = null; }
  return _fronts;
}
export function storefronts() { return _fronts; }

/** Fetch assets/text/storefronts.json once. Resolves to FALLBACK if it is gone. */
export function loadStorefronts(base = '') {
  if (_loaded) return _loaded;
  _loaded = (typeof fetch === 'function'
    ? fetch(base + STOREFRONT_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    : Promise.resolve(null))
    .then((j) => {
      const list = j && (Array.isArray(j) ? j : j.storefronts);
      return setStorefronts(list && list.filter((s) => s && s.name && s.type));
    });
  return _loaded;
}

// POI kind -> trade. A garage sign belongs on a garage.
const TRADE = {
  car_repair: 'garage', fuel: 'garage', motorcycle: 'garage', tyres: 'garage',
  car: 'vente de chars usagés', car_parts: 'vente de chars usagés',
  convenience: 'dépanneur', supermarket: 'dépanneur', alcohol: 'dépanneur',
  greengrocer: 'dépanneur', butcher: 'dépanneur', deli: 'dépanneur',
  fast_food: 'casse-croûte', ice_cream: 'casse-croûte', bakery: 'casse-croûte',
  cafe: 'casse-croûte', coffee: 'casse-croûte',
  restaurant: 'pizzeria',
  pub: 'taverne', bar: 'taverne', nightclub: 'taverne',
  hairdresser: 'coiffure', beauty: 'coiffure', tattoo: 'coiffure',
  hardware: 'quincaillerie', doityourself: 'quincaillerie', craft: 'quincaillerie',
  garden_centre: 'quincaillerie', paint: 'quincaillerie',
  pharmacy: 'pharmacie', optician: 'pharmacie', chemist: 'pharmacie',
  florist: 'fleuriste',
  video: 'club vidéo', video_games: 'club vidéo', books: 'club vidéo',
  electronics: 'club vidéo', mobile_phone: 'club vidéo',
  bowling_alley: 'salon de quilles', amusement_arcade: 'salon de quilles',
};
// What a sign gets when the map data has no usable kind, by where it stands:
// the strips get places you go out to, the side streets get places you walk to.
const STRIP_TRADES = ['taverne', 'pizzeria', 'club vidéo', 'salon de quilles',
  'vente de chars usagés', 'coiffure'];
const STREET_TRADES = ['casse-croûte', 'dépanneur', 'garage', 'quincaillerie',
  'pharmacie', 'fleuriste'];
const STRIP_D2 = 90 * 90;      // "on the strip" means within 90 m of it

// Civic POIs a town actually navigates by. These keep their REAL OpenStreetMap
// name — Polyvalente Le Carrefour, not "Parc Gilles Pas Pire".
// Civic POIs keep their own label. A park is not a business.
const CIVIC = new Set(['park', 'school', 'college', 'university', 'library', 'museum',
  'monument', 'place_of_worship', 'community_centre', 'sports_centre', 'ice_rink',
  'playground', 'swimming_pool', 'golf_course', 'marina', 'fire_station',
  'bus_station', 'dog_park', 'townhall', 'hospital', 'theatre', 'attraction']);

// Genuine businesses whose real name beats anything invented. These are the ones
// a person from Aylmer navigates by, and several of them are already mission
// destinations (see places.js: tims, mcdo, ctire, gas).
const REAL = /Tim Hortons|Canadian Tire|McDonald|Petro-?Canada|Ultramar|Shell|Esso|Couche-Tard|Jean Coutu|Pharmaprix|Uniprix|Familiprix|Brunet|Metro|IGA|Provigo|Maxi|Super ?C|Loblaws|Walmart|Dollarama|Rossy|Giant Tiger|SAQ|Subway|Harvey|St-?Hubert|A&W|Pizza Hut|KFC|Dairy Queen|Boston Pizza|Mikes|Scores|Blockbuster|Vidéotron|Bell |Desjardins|Banque Nationale|Home Hardware|Réno-?Dépôt|RONA|Bureau en Gros|Sports Experts|Pneus|Midas|Monsieur Muffler|NAPA|Beau-?Bec|Second Cup|Starbucks|Burger King|Wendy/i;

// Assign a name to every planned sign. Real names first, then civic labels, then
// the hand-written list — matched on trade where the POI kind gives one, and
// never repeated.
// A park with a 118 m2 footprint does not have a sign, and if it did nobody
// would read it. Every filler civic POI in the 120 hands its slot to the nearest
// unclaimed commercial POI within 700 m — same neighbourhood, same geographic
// spread, but the sign now says something a driver would actually see.
const FILLER = new Set(['park', 'playground', 'dog_park', 'swimming_pool',
  'monument', 'attraction', 'picnic_site', 'garden']);

function retarget(list) {
  const taken = new Set();
  const key = (q) => (q.name || '?') + '@' + q.x.toFixed(0) + ',' + q.z.toFixed(0);
  const out = [];
  for (const p of list) {
    if (!FILLER.has(p.k)) { out.push(p); continue; }
    let best = null, bd = 700 * 700;
    for (const q of MAP.pois) {
      if (!TRADE[q.k] || taken.has(key(q))) continue;
      const d = (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) { out.push(p); continue; }
    taken.add(key(best));
    out.push({ x: best.x, z: best.z, k: best.k, source: best.name || '',
      label: best.name || p.label, landmark: false });
  }
  return out;
}

function nameSigns(plan) {
  const byTrade = new Map();
  for (const s of _fronts) {
    if (!byTrade.has(s.type)) byTrade.set(s.type, []);
    byTrade.get(s.type).push(s.name);
  }
  // Two names cross-reference other agents' work (the mechanic Normand 'Norm'
  // Lafleur, and Ti-Guy's used-car lot), so they go out first in their trade.
  for (const [pin, trade] of [['Garage Norm Lafleur & Fils', 'garage'],
    ['Les Chars à Ti-Guy', 'vente de chars usagés'], ['Dépanneur Chez Ti-Guy', 'dépanneur']]) {
    const a = byTrade.get(trade);
    const i = a ? a.indexOf(pin) : -1;
    if (i > 0) { a.splice(i, 1); a.unshift(pin); }
  }
  const used = new Set();
  const take = (trade) => {
    const a = byTrade.get(trade);
    while (a && a.length) { const n = a.shift(); if (!used.has(n)) { used.add(n); return n; } }
    return null;
  };
  // Pass 1: the ones whose trade the map data actually knows.
  const leftover = [];
  for (const s of plan) {
    const src = s.poi.source || '';
    if (REAL.test(src)) { s.name = src; continue; }
    // A kept civic POI wears its real name, never a generated one.
    if (CIVIC.has(s.poi.k) || s.poi.landmark) { s.name = src || s.poi.label; continue; }
    const trade = TRADE[s.poi.k];
    const n = trade && take(trade);
    if (n) s.name = n; else leftover.push(s);
  }
  // Pass 2: no usable kind. Distribute by where the sign stands.
  for (const s of leftover) {
    const strip = highStreetD2(s.x, s.z) < STRIP_D2;
    const order = strip ? STRIP_TRADES : STREET_TRADES;
    let n = null;
    for (const t of order) { n = take(t); if (n) break; }
    if (!n) for (const t of byTrade.keys()) { n = take(t); if (n) break; }
    s.name = n || s.poi.label;
  }
  return plan;
}

let _plan = null;

export function planSigns() {
  if (_plan) return _plan;

  // All 120 geographically distributed businesses and landmarks get a sign.
  const cand = retarget(QUEBEC_POIS).map((p) => ({ p: { ...p, name: p.label } }));

  // 2. hang each on the street-facing wall of the nearest footprint
  const out = [];
  const usedWall = new Set();
  const roadside = (p) => {
    const road = nearestRoadPoint(p.x, p.z);
    let ux = p.x - road[0], uz = p.z - road[1];
    const d = Math.hypot(ux, uz);
    if (d < 0.1) { ux = 0; uz = 1; } else { ux /= d; uz /= d; }
    // Stand just off the asphalt, facing traffic. The board extends down to a
    // low plinth so it cannot look like floating text from the driver's seat.
    const nx = -ux, nz = -uz, dx = -nz, dz = nx;
    out.push({
      poi: p, name: p.name, slot: out.length, freestanding: true,
      x: road[0] + ux * 4, z: road[1] + uz * 4,
      dx, dz, nx, nz, w: p.landmark ? 4.6 : 3.8, h: 1.15, y: 0.35,
      board: out.length % BOARDS.length,
    });
  };
  for (const c of cand) {
    if (out.length >= MAX_SIGNS) break;
    const p = c.p;
    let bi = -1, bd = NEAR_BUILDING * NEAR_BUILDING;
    for (let i = 0; i < MAP.buildings.length; i++) {
      const b = MAP.buildings[i];
      if (b.k === 'shed') continue;
      const dx = b.c[0] - p.x, dz = b.c[1] - p.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) { roadside(p); continue; }
    const b = MAP.buildings[bi];
    const ring = b.p, n = ring.length;
    const fwd = ringArea2(ring) < 0;
    const road = nearestRoadPoint(b.c[0], b.c[1]);

    // Best wall: long enough, facing the road, not already carrying a sign.
    let bestI = -1, bestScore = -1e9, bestGeom = null;
    for (let i = 0; i < n; i++) {
      if (usedWall.has(bi * 64 + i)) continue;
      const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
      const a = ring[ia], q = ring[ib];
      let dx = q[0] - a[0], dz = q[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (L < 3.0) continue;
      dx /= L; dz /= L;
      const nx = -dz, nz = dx;                  // outward (see world.js wall winding)
      const mx = (a[0] + q[0]) / 2, mz = (a[1] + q[1]) / 2;
      let tx = road[0] - mx, tz = road[1] - mz;
      const tl = Math.hypot(tx, tz) || 1;
      const facing = (tx / tl) * nx + (tz / tl) * nz;
      const score = facing * 3 + Math.min(L, 10) * 0.12;
      if (score > bestScore) {
        bestScore = score; bestI = i;
        bestGeom = { mx, mz, dx, dz, nx, nz, L };
      }
    }
    if (bestI < 0 || bestScore < 0.1) { roadside(p); continue; }
    usedWall.add(bi * 64 + bestI);
    const g = bestGeom;
    const w = Math.min(3.8, g.L * 0.78);
    const h = w / 4;
    const y = Math.min(Math.max(b.h - h - 0.35, 2.6), 3.6);   // above door height
    if (y + h > b.h) { roadside(p); continue; }
    out.push({
      poi: p, name: p.name, slot: out.length,
      x: g.mx + g.nx * 0.14, z: g.mz + g.nz * 0.14,
      dx: g.dx, dz: g.dz, nx: g.nx, nz: g.nz,
      w, h, y, board: out.length % BOARDS.length,
    });
  }
  _plan = nameSigns(out);
  return _plan;
}

// Reset hook for tests that want to re-plan.
export function _resetSigns() { _plan = null; }

/**
 * Load the storefront names and rebuild the signage in place.
 *
 * buildSignage() runs inside buildWorld, which is synchronous and is not this
 * agent's file, so the first bake gets the fallback names. This is called right
 * after, from main.js's landmarks hook: it fetches the JSON, re-plans, rebuilds
 * the atlas and swaps mesh/tex/names into the object world.draw already holds a
 * reference to. Two bakes of a 120-quad mesh and one 2048x1024 canvas; the
 * proper fix is for world.js to await the names before it builds at all.
 */
export function primeSignage(renderer, existing, base = '') {
  return loadStorefronts(base).then(() => {
    _plan = null;
    const rebuilt = buildSignage(renderer);
    if (!rebuilt) return existing;
    if (existing) {
      existing.mesh = rebuilt.mesh; existing.tex = rebuilt.tex; existing.names = rebuilt.names;
      return existing;
    }
    return rebuilt;
  }).catch(() => existing);
}

export function buildSignage(renderer) {
  const plan = planSigns();
  if (!plan.length) return null;
  if (typeof document === 'undefined' || !document.createElement) return null;

  const cv = document.createElement('canvas');
  cv.width = ATLAS_W; cv.height = ATLAS_H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const names = [];
  const mb = new MeshBuilder();
  mb.textured = true;
  const white = [1, 1, 1];

  for (const s of plan) {
    const col = s.slot % COLS, row = (s.slot / COLS) | 0;
    if (row >= ROWS) break;
    const px = col * CW, py = row * CH;
    ctx.fillStyle = BOARDS[s.board];
    ctx.fillRect(px, py, CW, CH);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(px, py, CW, 3);
    ctx.fillStyle = '#f3ead6';
    ctx.font = '600 40px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(s.name, px + CW / 2, py + CH / 2 + 2, CW - 18);
    names.push(s.name);

    const u0 = (px + 1) / ATLAS_W, u1 = (px + CW - 1) / ATLAS_W;
    const v0 = (py + 1) / ATLAS_H, v1 = (py + CH - 1) / ATLAS_H;
    const hw = s.w / 2, y0 = s.y, y1 = s.y + s.h;
    const ax = s.x - s.dx * hw, az = s.z - s.dz * hw;
    const bx = s.x + s.dx * hw, bz = s.z + s.dz * hw;
    const i0 = mb.vert(ax, y0, az, s.nx, 0, s.nz, white, u0, v1);
    mb.vert(bx, y0, bz, s.nx, 0, s.nz, white, u1, v1);
    mb.vert(bx, y1, bz, s.nx, 0, s.nz, white, u1, v0);
    mb.vert(ax, y1, az, s.nx, 0, s.nz, white, u0, v0);
    mb.tri(i0, i0 + 1, i0 + 2);
    mb.tri(i0, i0 + 2, i0 + 3);
  }
  if (mb.empty) return null;
  return { mesh: renderer.upload(mb), tex: renderer.texture(cv), names };
}
