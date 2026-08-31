// Playful, fictional Québec names attached to real OpenStreetMap POIs.
// The source POI is kept for debugging/attribution; gameplay only shows label.
import { MAP } from './mapdata.js';

const COUNT = 120;
const CIVIC = new Set(['park', 'school', 'college', 'library', 'museum', 'monument',
  'place_of_worship', 'community_centre', 'sports_centre', 'ice_rink', 'playground',
  'swimming_pool', 'golf_course', 'marina', 'fire_station', 'bus_station', 'mall']);
const IGNORE = new Set(['parking', 'bicycle_parking', 'information', 'public_bookcase',
  'kindergarten', 'social_facility']);

const FIRST = [
  'Ti-Guy', 'Mononc’ Réjean', 'Ginette', 'Gilles', 'Carole', 'Normand', 'Manon',
  'Réjean', 'Diane', 'Yvon', 'Lise', 'Ti-Claude', 'Francine', 'Marcel', 'Johanne',
];
const LAST = [
  'du Coin', 'Chez Nous', 'Pas Pire', 'À Peu Près', 'Ben Correct', 'En Masse',
  'du Rang', 'du P’tit Change', 'de la Garnotte', 'des Bons Chums', 'du Gros Bon Sens',
];
const BUSINESS = {
  restaurant: 'Casse-croûte', fast_food: 'Pataterie', cafe: 'Café', coffee: 'Café',
  pub: 'Taverne', bar: 'Taverne', supermarket: 'Épicerie', convenience: 'Dépanneur',
  bakery: 'Beignerie', butcher: 'Boucherie', fuel: 'Gaz-O-Bar', car: 'Chars',
  car_repair: 'Garage', motorcycle: 'Bécanes', pharmacy: 'Pilules', clothes: 'Guénilles',
  hairdresser: 'Coupe Longueuil', beauty: 'Beauté', furniture: 'Meubles',
  hardware: 'Quincaillerie', motel: 'Motel', hotel: 'Auberge', florist: 'Bouquets',
  alcohol: 'Cabane à Vino', cannabis: 'Herbe Légale', ice_cream: 'Crèmerie',
  veterinary: 'Pitous & Minous', storage_rental: 'Cabanon', toys: 'Bébelles',
  craft: 'Bricolage', optician: 'Lunettes', fitness_centre: 'Gym de Sous-sol',
};
const LANDMARK = {
  park: 'Parc', school: 'École', college: 'Cégep', library: 'Bibliothèque',
  museum: 'Musée', monument: 'Gros Monument', place_of_worship: 'Chapelle',
  community_centre: 'Centre des Loisirs', sports_centre: 'Palais du Sport',
  ice_rink: 'Aréna', playground: 'Parc à Mômes', swimming_pool: 'Piscine',
  golf_course: 'Club de Golf', marina: 'Quai', fire_station: 'Caserne',
  bus_station: 'Terminus', mall: 'Galeries', dog_park: 'Parc à Pitous',
};

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function funnyName(p, ordinal = 0) {
  const h = hash(`${p.name}|${p.k}|${ordinal}`);
  const noun = LANDMARK[p.k] || BUSINESS[p.k] || (CIVIC.has(p.k) ? 'Place' : 'Boutique');
  return `${noun} ${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`;
}

function candidates() {
  return (MAP.pois || []).filter((p) => p.name && !IGNORE.has(p.k) &&
    Number.isFinite(p.x) && Number.isFinite(p.z) && (CIVIC.has(p.k) || BUSINESS[p.k]));
}

// Farthest-point sampling gives every part of the unusually tall map a fair shot,
// instead of filling all 120 slots with dense downtown storefronts.
export function buildQuebecPois(count = COUNT) {
  const pool = candidates();
  if (!pool.length) return [];
  const chosen = [];
  const used = new Set();
  const seeds = [
    [MAP.bounds.minX, MAP.bounds.minZ], [MAP.bounds.maxX, MAP.bounds.minZ],
    [MAP.bounds.minX, MAP.bounds.maxZ], [MAP.bounds.maxX, MAP.bounds.maxZ],
    [(MAP.bounds.minX + MAP.bounds.maxX) / 2, (MAP.bounds.minZ + MAP.bounds.maxZ) / 2],
  ];
  const addNearest = ([x, z]) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      const d = (pool[i].x - x) ** 2 + (pool[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) { used.add(best); chosen.push(pool[best]); }
  };
  seeds.forEach(addNearest);
  while (chosen.length < Math.min(count, pool.length)) {
    let best = -1, bestD = -1;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      let near = Infinity;
      for (const q of chosen) near = Math.min(near, (pool[i].x - q.x) ** 2 + (pool[i].z - q.z) ** 2);
      if (near > bestD) { bestD = near; best = i; }
    }
    if (best < 0) break;
    used.add(best); chosen.push(pool[best]);
  }
  return chosen.map((p, i) => ({
    x: p.x, z: p.z, k: p.k, label: funnyName(p, i), source: p.name,
    landmark: CIVIC.has(p.k),
  }));
}

export const QUEBEC_POIS = buildQuebecPois();
