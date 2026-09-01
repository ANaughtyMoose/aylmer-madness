// The mechanic. What money buys you, and what it does to the car.
//
// Nothing in here edits a spec. `tuned()` builds a throwaway object whose
// PROTOTYPE is the real spec out of cars.js and whose own properties are only
// the handful of numbers the driving model actually reads — accel, topSpeed,
// grip, brake, steerMax, suspension, hbYaw, body. The loft profiles, the lamp
// boxes, the seat positions, the id and the name all still come from the car
// itself, and taking a part back off is a `delete`. That matters because
// game/cars.js belongs to somebody else and because CARS holds one shared spec
// object per car: mutating it would tune the ambient traffic too.
//
// Everything here is arithmetic against a spec and a wallet-shaped object, so
// tools/smoke_upgrades.mjs runs the whole shop in node with no browser at all.
import { Vehicle, carById } from './cars.js';
// Namespace import on purpose. The cars.js agent is adding finalizeCar(), which
// solves a car's terminal speed from its own drag figure; it does not exist on
// this branch yet, and an optional call through the namespace is the one form
// that works both before and after that merge. See tuned() at the bottom.
import * as CARSMOD from './cars.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------- the tree

// `mul` entries are multipliers on the base spec, `set` entries are absolute.
// Levels are cumulative: level 3 is the level-3 row, not the three of them
// multiplied together, so the numbers you read here are the numbers you get.
export const PARTS = [
  {
    id: 'moteur', name: 'Moteur', nameEn: 'Engine',
    blurb: 'Ça part au quart de tour pis ça pousse.',
    levels: [
      { price: 90, label: 'Bougies Bosch Platinum pis des fils à haute tension',
        labelEn: 'Bosch Platinum plugs and new leads',
        mul: { accel: 1.10, topSpeed: 1.04 } },
      { price: 240, label: 'Filtre à air performance K&N nettoyable',
        labelEn: 'Washable K&N performance filter',
        mul: { accel: 1.22, topSpeed: 1.09 } },
      { price: 520, label: 'Ligne directe 2 pouces, silencieux Cherry Bomb, moteur refait',
        labelEn: 'Two-inch straight pipe, Cherry Bomb muffler, engine rebuilt',
        mul: { accel: 1.36, topSpeed: 1.15 } },
    ],
  },
  {
    id: 'pneus', name: 'Pneus', nameEn: 'Tyres',
    blurb: 'Ceux que t’as datent de 1997 pis ça paraît.',
    levels: [
      { price: 60, label: 'Quatre bons pneus d’été d’occasion, tous pareils',
        labelEn: 'Four decent secondhand summer tyres, all matching',
        mul: { grip: 1.09 } },
      { price: 150, label: 'Pneus tout-terrain à crampons Cooper Discoverer',
        labelEn: 'Cooper Discoverer all-terrains',
        mul: { grip: 1.19 } },
      { price: 320, label: 'BFGoodrich Radial T/A directionnels pis l’alignement quatre roues',
        labelEn: 'Directional BFGoodrich Radial T/As and a four-wheel alignment',
        mul: { grip: 1.30 } },
    ],
  },
  {
    id: 'suspension', name: 'Suspension', nameEn: 'Suspension',
    blurb: 'Ça arrête de plonger dans les courbes de la Vanier.',
    levels: [
      { price: 85, label: 'Amortisseurs à gaz Monroe Gas-Magnum aux quatre coins',
        labelEn: 'Monroe Gas-Magnum shocks all round',
        mul: { steerMax: 1.05, grip: 1.03, hbYaw: 1.06 }, set: { suspension: 0.105 } },
      { price: 210, label: 'Barre stabilisatrice surdimensionnée pis une lame de plus en arrière',
        labelEn: 'Oversize anti-roll bar and an extra rear leaf',
        mul: { steerMax: 1.10, grip: 1.06, hbYaw: 1.12 }, set: { suspension: 0.085 } },
    ],
  },
  {
    id: 'freins', name: 'Freins', nameEn: 'Brakes',
    blurb: 'Pour arrêter avant l’intersection, pas dedans.',
    levels: [
      { price: 75, label: 'Plaquettes semi-métalliques NAPA Ultra',
        labelEn: 'NAPA Ultra semi-metallic pads',
        mul: { brake: 1.14 } },
      { price: 190, label: 'Disques avant ventilés et rainurés',
        labelEn: 'Vented and slotted front rotors',
        mul: { brake: 1.28 } },
    ],
  },
  {
    // The one part you feel with your right foot rather than in a corner: it is
    // what stops the launch from bogging and what lets the back end come round
    // on purpose instead of by accident.
    id: 'transmission', name: 'Transmission', nameEn: 'Driveline',
    blurb: 'Ça patine au départ pis ça se sauve dans le gravier.',
    levels: [
      { price: 110, label: 'Embrayage renforcé à friction céramique',
        labelEn: 'Ceramic-friction heavy-duty clutch',
        mul: { accel: 1.07 } },
      { price: 300, label: 'Différentiel arrière à glissement limité (Posi-traction)',
        labelEn: 'Limited-slip (Posi-traction) rear end',
        mul: { accel: 1.12, hbYaw: 1.10, hbGrip: 1.12 } },
    ],
  },
];

// Work Norm will do that the driving model has nothing to say about. Printed on
// the wall of the shop rather than sold, because selling a customer a trailer
// hitch that changes no number in the game would be a lie with a price on it.
export const BOARD = [
  'Phares antibrouillard ronds Hella 500 su’ l’bumper',
  'Alternateur haute puissance 130 ampères',
  'Radiateur en aluminium à trois rangs',
  'Volant sport trois branches Grant, gaine en cuir',
  'Attache-remorque classe III, boule deux pouces',
  'Doublure de boîte Duraliner',
  'Pare-chocs tubulaire en acier soudé sur mesure',
];

export const PART_IDS = PARTS.map((p) => p.id);
const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export const maxLevel = (partId) => (PART_BY_ID[partId] ? PART_BY_ID[partId].levels.length : 0);
export const partById = (id) => PART_BY_ID[id] || null;

// ---------------------------------------------------------------- prices

// Parts are priced off the car. A bus needs bus brakes and a golf cart needs
// four tyres the size of a dinner plate, so the quote scales with what the
// thing weighs — which is also, roughly, how a real parts counter works.
export function partsMul(spec) {
  const m = spec && spec.mass ? spec.mass : 1200;
  return Math.round(Math.min(2.4, Math.max(0.5, m / 1200)) * 100) / 100;
}

// What the next level of `partId` costs on this car, or 0 if it is maxed.
// `level` is what you have now; the price is for level + 1.
export function priceOf(spec, partId, level) {
  const p = PART_BY_ID[partId];
  if (!p || level >= p.levels.length) return 0;
  return Math.round(p.levels[level].price * partsMul(spec) / 5) * 5;
}

// The body shop. Straightening a car properly costs more than the four-minute
// job at the Petro-Canada (damage.js REPAIR.RATE is 0.20/point) because they
// pull the fender back out instead of bending it flat with a knee.
export const PAINT_PRICE = 150;
export const PAINT_LABEL = 'Apprêt antirouille pis peinture émail deux tons';
export const BODY_LABEL = 'Redressage au tracteur, à la chaîne pis au miracle';
export const BODY_MIN = 40;
export function bodyPrice(spec, damage) {
  const d = Math.max(0, Math.min(100, damage || 0));
  return Math.round((BODY_MIN + d * 0.55) * partsMul(spec) / 5) * 5;
}

// Rattle-can period colours. Names are what the guy at the counter calls them.
export const PAINT = [
  { hex: 0xb01d1d, name: 'Rouge pompier' },
  { hex: 0x14406e, name: 'Bleu nuit' },
  { hex: 0x0f6b3a, name: 'Vert forêt' },
  { hex: 0xe4e2d8, name: 'Blanc cassé' },
  { hex: 0x1b1c1f, name: 'Noir mat' },
  { hex: 0xc8a03c, name: 'Or 1979' },
  { hex: 0x7a4a1e, name: 'Brun catalogue' },
  { hex: 0x9d3f8f, name: 'Mauve — c’est ton char' },
];

// ---------------------------------------------------------------- the layer

// Empty mods, and the shape everything below is allowed to assume.
export function emptyMods() {
  const m = {};
  for (const p of PARTS) m[p.id] = 0;
  m.paint = null;
  return m;
}

// Anything out of a save file — or out of somebody's hand-edited localStorage —
// goes through here before the driving model is allowed to see it.
export function normalizeMods(raw) {
  const out = emptyMods();
  if (!raw || typeof raw !== 'object') return out;
  for (const p of PARTS) {
    const v = raw[p.id];
    if (typeof v === 'number' && isFinite(v)) out[p.id] = Math.max(0, Math.min(p.levels.length, Math.floor(v)));
  }
  const paint = raw.paint;
  if (typeof paint === 'number' && isFinite(paint) && paint >= 0 && paint <= 0xffffff) {
    out.paint = Math.floor(paint);
  }
  return out;
}

export const isStock = (mods) => PARTS.every((p) => !(mods && mods[p.id])) && !(mods && mods.paint != null);

/**
 * The car you actually drive. `spec` is the one out of CARS; the return is a
 * derived object that IS that spec everywhere it is not tuned. Handing back the
 * spec itself when nothing is fitted keeps a stock car byte-for-byte what it
 * was, which is what makes tools/smoke_driving.mjs's numbers still true.
 */
export function tuned(spec, mods) {
  const m = normalizeMods(mods);
  if (isStock(m)) return spec;
  const out = Object.create(spec);
  const mul = {}, set = {};
  for (const p of PARTS) {
    const lv = m[p.id];
    if (!lv) continue;
    const row = p.levels[lv - 1];
    for (const k of Object.keys(row.mul || {})) mul[k] = (mul[k] || 1) * row.mul[k];
    Object.assign(set, row.set || {});
  }
  for (const k of Object.keys(mul)) out[k] = spec[k] * mul[k];
  for (const k of Object.keys(set)) out[k] = set[k];
  if (m.paint != null) out.body = m.paint;
  // Once cars.js lands finalizeCar(), a car's terminal speed is SOLVED from its
  // drag rather than written down, so a tuned copy has to be re-solved or the
  // engine work would be thrown away. If it moves the number, the engine
  // multiplier goes back on top of whatever it decided.
  if (typeof CARSMOD.finalizeCar === 'function') {
    const wasTop = out.topSpeed;
    CARSMOD.finalizeCar(out);
    if (mul.topSpeed && out.topSpeed !== wasTop) out.topSpeed *= mul.topSpeed;
  }
  // `tune` is what the shop UI and the HUD read to know this is not a stock
  // car; nothing in the driving model looks at it.
  out.tune = m;
  return out;
}

/** The engine note after the exhaust work. Plain object — audio.js reads fields. */
export function tunedSound(sound, mods) {
  const m = normalizeMods(mods);
  const lv = m.moteur;
  if (!sound || !lv) return sound;
  return {
    ...sound,
    exhG: sound.exhG * (1 + 0.14 * lv),
    raspG: sound.raspG * (1 + 0.38 * lv),
    raspFrom: Math.max(1400, sound.raspFrom - 420 * lv),
    rasp: Math.min(0.95, sound.rasp + 0.10 * lv),
    pop: (sound.pop || 0) + 0.25 * lv,
    gain: Math.min(1.7, sound.gain * (1 + 0.07 * lv)),
  };
}

// ---------------------------------------------------------------- the quote

// A flat, empty, dry Aylmer with no walls in it. Enough world for Vehicle to
// integrate against, and nothing else — the shop is quoting you numbers, not
// simulating a lap of the Vieux-Aylmer.
const GROUND = { h: 0, nx: 0, ny: 1, nz: 0, kind: 'asphalt' };
const TEST_WORLD = {
  roadAt: () => true,
  waterAt: () => false,
  groundAt: () => GROUND,
  querySegments: () => [],
  bounds: { minX: -1e6, maxX: 1e6, minZ: -1e6, maxZ: 1e6 },
};
const GO = { steer: 0, throttle: 1, brake: 0, handbrake: false };
const COAST = { steer: 0, throttle: 0, brake: 0, handbrake: false };
const STOP = { steer: 0, throttle: 0, brake: 1, handbrake: false };
const DT = 1 / 120;
const SKIDPAD_R = 40;      // metres, the circle the cornering figure is quoted on

function fresh(spec) {
  const v = new Vehicle(spec);
  v.assist = true;
  v.reset(0, 0, 0);
  return v;
}

/** Seconds from a standstill to `kmh`, or null if it never gets there. */
export function accelTime(spec, kmh = 100, cap = 60) {
  const v = fresh(spec);
  for (let t = 0; t < cap; t += DT) {
    v.update(DT, GO, TEST_WORLD);
    if (v.speedKmh >= kmh) return t + DT;
  }
  return null;
}

/** Flat-out km/h after a long enough run for the aero to catch up. */
export function topKmh(spec, seconds = 90) {
  const v = fresh(spec);
  for (let t = 0; t < seconds; t += DT) v.update(DT, GO, TEST_WORLD);
  return v.speedKmh;
}

/** Metres from 100 km/h to a stop, on the pedal, going straight. */
export function brakeDist(spec) {
  const v = fresh(spec);
  for (let t = 0; t < 90 && v.speedKmh < 100; t += DT) v.update(DT, GO, TEST_WORLD);
  const z0 = v.z;
  for (let t = 0; t < 20 && v.speedKmh > 1; t += DT) v.update(DT, STOP, TEST_WORLD);
  return Math.hypot(v.x, v.z - z0);
}

/**
 * Steady-state cornering: full lock at a held 60 km/h, measured off the rate the
 * VELOCITY vector turns — not the yaw rate, which in a bicycle model is just
 * geometry and would report the same number on ice. Returns both the lateral g
 * and the radius of the circle the car is actually driving, which is the one a
 * work order can print without a customer arguing about it.
 */
export function cornering(spec, kmh = 60) {
  const v = fresh(spec);
  for (let t = 0; t < 90 && v.speedKmh < kmh; t += DT) v.update(DT, GO, TEST_WORLD);
  // Held AT the target speed rather than at a fixed pedal: a bigger engine would
  // otherwise carry more speed into the corner and the number would read as grip
  // when it is really power.
  const hold = { steer: 1, throttle: 0, brake: 0, handbrake: false };
  const trim = () => {
    const err = (kmh - v.speedKmh) / kmh;
    hold.throttle = clamp01(err * 6);
    hold.brake = clamp01(-err * 6);
  };
  for (let t = 0; t < 3; t += DT) { trim(); v.update(DT, hold, TEST_WORLD); }
  let a0 = Math.atan2(v.vx, v.vz), turned = 0, secs = 0, speed = 0;
  for (let t = 0; t < 2; t += DT) {
    trim();
    v.update(DT, hold, TEST_WORLD);
    const a1 = Math.atan2(v.vx, v.vz);
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turned += Math.abs(d);
    a0 = a1;
    secs += DT;
    speed += Math.hypot(v.vx, v.vz) * DT;
  }
  const rate = turned / secs;                 // rad/s the car's path is bending
  const vAvg = speed / secs;
  const g = (vAvg * rate) / 9.81;
  // The steering in this game is a Midtown Madness arcade rack — it will turn a
  // Ranger inside nine metres at sixty — so the RADIUS it drives is a true fact
  // about the game and a silly-looking one on a work order. The lateral g it
  // pulls is the honest comparable, and SKIDPAD is that g expressed the way a
  // magazine would: how fast the car holds a 40 m circle.
  return { g, radius: rate > 1e-6 ? vAvg / rate : Infinity, skidpad: Math.sqrt(g * 9.81 * SKIDPAD_R) * 3.6 };
}
export const corneringG = (spec, kmh = 60) => cornering(spec, kmh).g;

/**
 * The work order's before/after block. Four numbers, measured the way a
 * magazine would measure them, so « 9,8 s → 8,6 s » on the screen is a promise
 * the physics keeps.
 */
export function measure(spec) {
  const c = cornering(spec);
  return {
    zeroTo100: accelTime(spec, 100),
    top: topKmh(spec),
    brake: brakeDist(spec),
    grip: c.g,
    corner: c.skidpad,
    radius: c.radius,
  };
}

/** measure() for stock and for the same car with `mods`, side by side. */
export function compare(specOrId, mods) {
  const base = typeof specOrId === 'string' ? carById(specOrId) : specOrId;
  return { before: measure(base), after: measure(tuned(base, mods)) };
}

// ---------------------------------------------------------------- the till

/**
 * Can this car have the next level of `partId` fitted right now? Returns
 * { ok, why, price, level } and spends nothing — the shop's buttons are built
 * out of exactly this.
 */
export function canFit(spec, mods, partId, wallet) {
  const p = PART_BY_ID[partId];
  const m = normalizeMods(mods);
  if (!p) return { ok: false, why: 'On fait pas ça ici', price: 0, level: 0 };
  const level = m[partId];
  if (level >= p.levels.length) return { ok: false, why: 'Déjà au boutte', price: 0, level };
  const price = priceOf(spec, partId, level);
  if (!wallet || !wallet.can(price)) {
    const short = Math.max(0, price - (wallet ? wallet.value : 0));
    return { ok: false, why: `il te manque ${Math.round(short)} $`, price, level };
  }
  return { ok: true, why: null, price, level };
}

/** Fit it. Same answer as canFit(), and when it says yes `mods` is one better. */
export function fit(spec, mods, partId, wallet) {
  const r = canFit(spec, mods, partId, wallet);
  if (!r.ok) return r;
  wallet.spend(r.price);
  mods[partId] = r.level + 1;
  return { ...r, level: r.level + 1 };
}

// ---------------------------------------------------------------- Norm

// Normand « Norm » Lafleur, 52 ans, Garage Norm Lafleur & Fils on chemin
// d'Aylmer — the sons have not spoken to him since 1996 but the plywood sign is
// still up. Grease-stained blue overalls, an unlit Export « A » behind the ear.
// He thinks the Ranger is a rolling death trap and he likes you anyway, because
// you have never once complained about a part that came out of the scrapyard.
//
// The lines live in assets/text/mechanic.json. What is below is the fallback —
// enough of him to run the shop with the file missing, not a second copy of it.
export const MECHANIC_URL = 'assets/text/mechanic.json';
export const NORM = {
  name: 'Normand « Norm » Lafleur',
  shop: 'Garage Norm Lafleur & Fils',
  greetings: [
    'Qu’est-ce que t’as encore pété su’ ton tas de ferraille?',
    'Éteins ton moteur avant qui saute dans ma cour.',
    'Ouvre le capot qu’on rigole un peu.',
  ],
  // Keyed the way the file keys them, so a merge is a concat and not a rewrite.
  work: [
    { part: 'engine', line: 'J’t’ai posé des bougies neuves pis ajusté le timing.' },
    { part: 'tyres', line: 'T’avais deux pneus lisses comme des fesses de bébé.' },
    { part: 'suspension', line: 'Tes amortisseurs coulaient l’huile comme un panier.' },
    { part: 'brakes', line: 'T’étais su’l fer en avant, mon gars!' },
    { part: 'transmission', line: 'Ton embrayage patinait à chaque départ. Pu maintenant.' },
    { part: 'paint', line: 'Deux tons, comme t’as demandé. Touche pas avant à soir.' },
    { part: 'bodywork', line: 'C’est droit. Regarde-le pas de trop proche.' },
  ],
  broke: [
    'Le garage c’est pas l’Armée du Salut, mon grand. Pas d’argent, pas d’outils.',
    'Regarde la pancarte su’ l’mur : « En Dieu nous croyons, les autres payent comptant. »',
  ],
  wrecked: [
    'C’est pu un camion, c’est un accordéon à quatre roues.',
    'Qu’est-ce que t’as fait là, calvaire?',
  ],
};

// Which PARTS id maps onto which `part` tag in the writers' file.
const WORK_TAG = {
  moteur: 'engine', pneus: 'tyres', suspension: 'suspension',
  freins: 'brakes', transmission: 'transmission',
  peinture: 'paint', carrosserie: 'bodywork',
};

let mechLoaded = null;
/**
 * Merge assets/text/mechanic.json over the fallback. Idempotent, and it never
 * rejects: with no file, no fetch and no network, Norm still talks.
 */
export function loadMechanic(fetchFn) {
  if (mechLoaded) return mechLoaded;
  const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!f) return Promise.resolve(NORM);
  mechLoaded = f(MECHANIC_URL, { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const m = j && j.mechanic;
      if (!m) return NORM;
      // The file is written with typewriter apostrophes; everything the player
      // reads in this game uses the curly one.
      const fix = (t) => String(t).replace(/'/g, '\u2019');
      if (typeof m.name === 'string') {
        NORM.name = fix(m.name).replace(/\u2019([^\u2019]+)\u2019/, '\u00ab\u00a0$1\u00a0\u00bb');
      }
      for (const k of ['greetings', 'broke', 'wrecked']) {
        if (Array.isArray(m[k]) && m[k].length) NORM[k] = m[k].map(fix);
      }
      if (Array.isArray(m.work) && m.work.length) {
        NORM.work = m.work.map((w) => ({ part: w.part, line: fix(w.line) }));
      }
      return NORM;
    })
    .catch(() => NORM);
  return mechLoaded;
}

// Deterministic pick, so one visit to the shop is one greeting rather than a
// new one every time the panel repaints.
function pick(list, seed) {
  if (!list || !list.length) return '';
  const n = Math.abs(Math.floor(seed)) % list.length;
  return typeof list[n] === 'string' ? list[n] : list[n].line;
}

/**
 * Something for Norm to say. `kind` is 'greetings' | 'broke' | 'wrecked', or
 * 'work' with a PARTS id in `partId` — in which case only the lines the writers
 * tagged for that part are in the running.
 */
export function normSay(kind, seed = 0, partId = null) {
  if (kind !== 'work') return pick(NORM[kind], seed);
  const tag = WORK_TAG[partId];
  const matching = NORM.work.filter((w) => w.part === tag);
  return pick(matching.length ? matching : NORM.work, seed);
}
