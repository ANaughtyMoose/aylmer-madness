// The cars everybody in Aylmer would recognise, and the one beater on Kijiji.
//
// TEMPORARY HOME. Every spec below belongs in game/cars.js next to the other
// nine — it is here because cars.js is another agent's file this wave. The
// module registers itself into CARS and UNLOCKS at import time, which is why
// main.js only has to import it once for the menu, the loft, the lamps, the
// turntable and the garage to all know these cars exist. When this is folded
// into cars.js the `derive()` profiles should be replaced with hand-authored
// ones; see the note on derive().
//
// The four famous cars cannot be bought. There is no price on them anywhere in
// this file: garage.canBuy() refuses `kind: 'famous'` outright and the only way
// into your driveway is Garage.earn(), which this module calls when what you
// have actually DONE says you deserve it.
import { CARS, carById, pl } from './cars.js';
// Optional, and namespaced for that reason: cars.js is gaining finalizeCar(),
// which solves terminal speed out of a car's own drag figure. It is not on this
// branch yet, and this is the call shape that works before and after the merge.
import * as CARSMOD from './cars.js';
import { UNLOCKS } from './garage.js';
import { FEATURES } from './terrain.js';
import { MISSIONS } from './missions.js';

// ---------------------------------------------------------------- profiles

// A body lofted from another car's profiles, stretched to this car's height and
// width. The profiles in cars.js are absolute metres, not fractions, so a
// borrowed `top` has to be scaled or the roof lands at the donor's height.
//
// This is a shortcut and it reads like one: a Crown Victoria is not a tall
// Cutlass Ciera. It gets the silhouette family right — three-box sedan, notch
// coupe, one-box wagon — which is enough for a car seen from behind at 80 km/h,
// and it is the first thing to replace when these move into cars.js.
const scale = (pts, k) => pts.map(([t, v]) => [t, Math.round(v * k * 1000) / 1000]);
const scaleGlass = (ranges, k) =>
  ranges.map((r) => (r.length > 2 ? [r[0], r[1], Math.round(r[2] * k * 1000) / 1000] : [r[0], r[1]]));

function derive(baseId, over) {
  const b = carById(baseId);
  const topMax = Math.max(...b.top.map((p) => p[1]));
  const planMax = Math.max(...b.plan.map((p) => p[1]));
  const ky = over.h / topMax;
  const kx = (over.wid / 2) / planMax;
  const cl = b.cladding;
  return {
    style: b.style, seats: b.seats,
    top: scale(b.top, ky), belt: scale(b.belt, ky), plan: scale(b.plan, kx),
    roofK: b.roofK, tuck: b.tuck,
    glassTop: scaleGlass(b.glassTop, ky), glassSide: b.glassSide.slice(),
    cladding: { ...cl, rocker: cl.rocker * ky, bumper: cl.bumper * ky },
    ...over,
  };
}

// Track, the way the cars.js loop computes it: the tyre's outer face stands
// 70 mm proud of the widest axle station.
const WHEEL_W = (style) => (style === 'truck' || style === 'van' ? 0.24 : 0.20);
function finish(c, sound, drive, hb) {
  c.axleZ = c.wheelbase / 2;
  const rearOverhang = c.len - c.wheelbase - c.overhangF;
  const hwAxle = Math.max(pl(c.plan, rearOverhang / c.len), pl(c.plan, (rearOverhang + c.wheelbase) / c.len));
  c.track = Math.round(2 * (hwAxle + 0.07 - WHEEL_W(c.style) / 2) * 100) / 100;
  c.sound = sound;
  c.drive = drive;
  Object.assign(c, hb);
  // Nobody else in town has one of these, so ambient traffic never spawns as
  // one — TRAFFIC_CARS is frozen at cars.js load anyway, this says why.
  c.noTraffic = true;
  // When cars.js lands finalizeCar(), these five go through the same solver the
  // other nine do instead of trusting the topSpeed written above.
  if (typeof CARSMOD.finalizeCar === 'function') CARSMOD.finalizeCar(c);
  CARS.push(c);
  return c;
}

// ---------------------------------------------------------------- the cars

// The one thing on Kijiji nobody has to earn: a Tempo for less than the cheapest
// car on the lot, so the first thing you can afford is a whole car and not a set
// of brake pads.
export const TEMPO = finish(derive('saturn', {
  id: 'tempo', name: '1991 Ford Tempo GL', who: 'Kijiji', lot: true,
  body: 0x99a2a8, seats: 4,
  flavour: 'Le char de ta tante. Deux cent mille kilomètres, une porte d’une autre couleur, pis le chauffage marche juste au boutte.',
  len: 4.60, wid: 1.72, h: 1.37, wheelbase: 2.63, overhangF: 0.93, wheelR: 0.32,
  topSpeed: 37.5, accel: 3.3, brake: 7.6, grip: 0.75, steerMax: 0.48, mass: 1210,
  seatY: 1.04, seatZ: 0.05, seatX: 0.41, clearance: 0.20,
}),
// 2.3 HSC four. Coarse, lazy, and the exhaust has a hole in it somewhere.
{ cyl: 4, idle: 760, redline: 5000, limiter: 5100,
  decay: 6.2, uneven: 0.20, tilt: 0.26, harm: 204,
  exhQ: 0.82, exhG: 1.12, intF0: 800, intSpan: 1600, intQ: 1.0, intG: 0.42,
  hissG: 0.16, raspG: 0.28, raspFrom: 3400, rasp: 0.52, raspK: 2.8,
  boomF: 138, boomQ: 5.0, boomDb: 9, tickF: 3400, tickG: 0.042,
  lumpy: 0.016, pop: 1.05, gain: 1.06, rattle: 0.20, rattleFrom: 50 },
{ gears: [2.79, 1.61, 1.00], reverse: 2.07, final: 3.31, tyre: 0.620,
  idle: 760, redline: 5000, limiter: 5100,
  shiftUp: 4500, shiftUpLight: 2500, shiftDown: 1400, launch: 1900, shiftTime: 0.38 },
{ hbGrip: 0.60, hbYaw: 1.14, revTop: 6.94, revEngage: 0.26 });

// « La Si à Sayyad ». The one under the tarp at 75 Denise-Friend — the same car
// he lends you after la poutine, in the state the whole town remembers it: Rio
// Red gone matte on the roof, an open B16 out of Montréal, and no back seat. It
// out-ran an RCMP cruiser across the Portage in 2001 and went down a gravel
// driveway in Deschênes before anybody read the plate.
export const SICIVIC = finish(derive('civic', {
  id: 'sicivic', name: '1988 Honda Civic Si — « la Si »', who: 'Sayyad',
  body: 0xc0141e, seats: 2,
  flavour: 'Rouge Rio délavé su’ l’toit, un B16 ouvert venu de Montréal, pas de banquette en arrière. Tout le monde en ville connaît le sifflet quand le VTEC embarque proche des Galeries.',
  len: 3.99, wid: 1.67, h: 1.30, wheelbase: 2.50, overhangF: 0.83, wheelR: 0.29,
  topSpeed: 49.5, accel: 6.4, brake: 10.6, grip: 1.16, steerMax: 0.66, mass: 880,
  seatY: 0.96, seatZ: 0.0, seatX: 0.38, clearance: 0.15,
  spoiler: true, sunroof: [0.40, 0.52],
}),
{ cyl: 4, idle: 900, redline: 7600, limiter: 7700,
  decay: 9.4, uneven: 0.09, tilt: 0.60, harm: 176,
  exhQ: 1.05, exhG: 1.05, intF0: 1150, intSpan: 3400, intQ: 1.5, intG: 1.05,
  hissG: 0.30, raspG: 0.30, raspFrom: 4600, rasp: 0.48, raspK: 2.6,
  boomF: 215, boomQ: 3.0, boomDb: 4, tickF: 4300, tickG: 0.022,
  lumpy: 0.006, pop: 1.05, gain: 1.02, rattle: 0, rattleFrom: 0 },
{ gears: [3.25, 1.89, 1.25, 0.90, 0.71], reverse: 3.15, final: 4.40, tyre: 0.577,
  idle: 900, redline: 7600, limiter: 7700,
  shiftUp: 7200, shiftUpLight: 3800, shiftDown: 2300, launch: 3200, shiftTime: 0.16 },
{ hbGrip: 0.22, hbYaw: 1.90, revTop: 6.94, revEngage: 0.18 });

// The retired municipal car. It sat behind the aréna with the decals sanded off
// and the spotlight still bolted to the A-pillar until the auction.
export const CROWNVIC = finish(derive('cutlass', {
  id: 'crownvic', name: '1991 Ford LTD Crown Victoria P71', who: 'La Ville',
  body: 0xe6e5df, seats: 4,
  flavour: 'L’ancienne auto de police d’Aylmer. Décalques sablées, spotlight encore là, pis un 5.0 qui pousse en arrière.',
  len: 5.41, wid: 1.97, h: 1.44, wheelbase: 2.98, overhangF: 1.15, wheelR: 0.36,
  topSpeed: 48.0, accel: 4.6, brake: 9.4, grip: 0.94, steerMax: 0.50, mass: 1810,
  seatY: 1.08, seatZ: 0.05, seatX: 0.44, clearance: 0.22,
}),
// 5.0 Windsor V8: eight pulses a cycle, so it fires at rpm/15. Low and lazy.
{ cyl: 8, idle: 600, redline: 4600, limiter: 4700,
  decay: 5.0, uneven: 0.08, tilt: 0.30, harm: 224,
  exhQ: 0.72, exhG: 1.35, intF0: 560, intSpan: 1200, intQ: 0.9, intG: 0.40,
  hissG: 0.14, raspG: 0.30, raspFrom: 3000, rasp: 0.55, raspK: 3.0,
  boomF: 98, boomQ: 4.5, boomDb: 11, tickF: 2800, tickG: 0.022,
  lumpy: 0.012, pop: 1.20, gain: 1.14, rattle: 0, rattleFrom: 0 },
{ gears: [2.40, 1.47, 1.00, 0.67], reverse: 2.00, final: 3.08, tyre: 0.720,
  idle: 600, redline: 4600, limiter: 4700,
  shiftUp: 4200, shiftUpLight: 2200, shiftDown: 1200, launch: 1700, shiftTime: 0.34 },
{ hbGrip: 0.40, hbYaw: 1.58, revTop: 6.94, revEngage: 0.26 });

// Steve « Mullet » Boucher's GTA. Gunmetal grey on gold snowflake wheels,
// T-tops, and a cassette deck jammed shut on Moving Pictures since about 1994.
// He went to Calgary for the oil patch and left it with his little brother, who
// is too scared of it to turn the key — which is where you come in.
export const FIREBIRD = finish(derive('cavalier', {
  id: 'firebird', name: '1988 Pontiac Firebird Trans Am GTA', who: 'Le p’tit frère à Boucher',
  body: 0x5a6068, seats: 3,
  flavour: 'Gris gunmetal, mags flocon dorés, T-tops dans valise, pis une cassette de Rush jammée dans deck depuis 1994. Ça tourne mal, ça arrête mal, pis tout le monde se retourne pareil.',
  len: 4.90, wid: 1.85, h: 1.27, wheelbase: 2.57, overhangF: 1.08, wheelR: 0.34,
  topSpeed: 47.0, accel: 5.2, brake: 8.6, grip: 0.90, steerMax: 0.54, mass: 1580,
  seatY: 0.96, seatZ: 0.05, seatX: 0.42, clearance: 0.15,
  spoiler: true,
}),
// 5.7 TPI V8: eight pulses a cycle, so it fires at rpm/15. Deep, and the
// T-tops let all of it into the cabin.
{ cyl: 8, idle: 680, redline: 5000, limiter: 5100,
  decay: 4.8, uneven: 0.09, tilt: 0.26, harm: 228,
  exhQ: 0.70, exhG: 1.40, intF0: 560, intSpan: 1200, intQ: 0.85, intG: 0.50,
  hissG: 0.20, raspG: 0.38, raspFrom: 2800, rasp: 0.62, raspK: 3.1,
  boomF: 92, boomQ: 4.0, boomDb: 12, tickF: 2750, tickG: 0.026,
  lumpy: 0.012, pop: 1.40, gain: 1.18, rattle: 0.22, rattleFrom: 60 },
{ gears: [2.95, 1.94, 1.34, 1.00, 0.73], reverse: 2.76, final: 3.27, tyre: 0.680,
  idle: 680, redline: 5000, limiter: 5100,
  shiftUp: 4600, shiftUpLight: 2400, shiftDown: 1400, launch: 2000, shiftTime: 0.22 },
{ hbGrip: 0.26, hbYaw: 1.95, revTop: 6.94, revEngage: 0.22 });

// Monsieur Henderson's Leone. In the ice storm of 1998 he ran bread and
// generator gas across the whole Outaouais in it while the cruisers could not
// get out of the station lot. Twenty years of cottage road in the paint, and it
// is still the only thing in town that would rather be in the field than on
// chemin d'Aylmer — `turf` is the golf cart's trick, used honestly for once.
export const LEONE = finish(derive('saturn', {
  id: 'leone', name: '1987 Subaru Leone RX Turbo 4WD', who: 'M. Henderson',
  body: 0xe8e6e0, seats: 4, turf: 1.5,
  flavour: 'Blanc, carré, garde-boue d’usine, quatre roues motrices à deux gammes. A livré le pain pendant la crise du verglas quand les autos de police sortaient même pas du stationnement.',
  len: 4.35, wid: 1.66, h: 1.38, wheelbase: 2.47, overhangF: 0.86, wheelR: 0.32,
  topSpeed: 40.0, accel: 4.4, brake: 8.8, grip: 0.98, steerMax: 0.60, mass: 1180,
  seatY: 1.04, seatZ: 0.05, seatX: 0.40, clearance: 0.26,
}),
// 1.8 turbo flat-four. Uneven firing, a whistle, and a wastegate that chuffs.
{ cyl: 4, idle: 850, redline: 6000, limiter: 6100,
  decay: 6.4, uneven: 0.30, tilt: 0.34, harm: 200,
  exhQ: 0.86, exhG: 1.10, intF0: 880, intSpan: 2200, intQ: 1.1, intG: 0.72,
  hissG: 0.42, raspG: 0.22, raspFrom: 3600, rasp: 0.44, raspK: 2.6,
  boomF: 142, boomQ: 5.0, boomDb: 8, tickF: 3500, tickG: 0.034,
  lumpy: 0.014, pop: 1.00, gain: 1.06, rattle: 0.18, rattleFrom: 40 },
{ gears: [3.54, 2.06, 1.45, 1.03, 0.78], reverse: 3.58, final: 3.90, tyre: 0.620,
  idle: 850, redline: 6000, limiter: 6100,
  shiftUp: 5500, shiftUpLight: 2900, shiftDown: 1800, launch: 2400, shiftTime: 0.22 },
{ hbGrip: 0.58, hbYaw: 1.20, revTop: 6.94, revEngage: 0.24 });

// ---------------------------------------------------------------- the jumps

// Eight launches everybody who ever had a car in this town knows about. The
// coordinates are not written here: they are the terrain features themselves,
// so a jump that moves in terrain.js moves here too.
export const JUMP_IDS = [
  'dirtJump', 'ctireBerm', 'marinaBerm', 'arenaPile',
  'deschenesLook', 'cedresMound', 'symmesRamp', 'apronDenise',
];
const JUMP_LABEL = {
  dirtJump: 'La bosse en arrière de l’aréna',
  ctireBerm: 'Le banc de neige d’été du Canadian Tire',
  marinaBerm: 'Le monticule de la marina',
  arenaPile: 'Le tas de gravier de l’aréna',
  deschenesLook: 'Le remblai des rapides Deschênes',
  cedresMound: 'La butte de la plage des Cèdres',
  symmesRamp: 'La rampe de l’Auberge Symmes',
  apronDenise: 'L’entrée de Sayyad, rue Denise-Friend',
};
export const JUMPS = JUMP_IDS.map((id) => {
  const f = FEATURES.find((q) => q.id === id);
  if (!f) throw new Error('famouscars: no terrain feature ' + id);
  return { id, feat: 'jump:' + id, label: JUMP_LABEL[id], x: f.cx, z: f.cz };
});

const JUMP_RADIUS = 32;        // metres from the feature's centre
const JUMP_CLEAR = 0.22;       // ...and this far off the deck, so a kerb hop is not a jump

/**
 * One tick of "did that count". Returns the jump you have just landed for the
 * first time, or null. `garage.addFeat` is what remembers it, and it is what
 * makes this idempotent — you can bounce off the same berm all afternoon.
 */
export function watchJumps(veh, garage) {
  if (!veh || !garage || !veh.inAir) return null;
  if (veh.y - veh.gh < JUMP_CLEAR || veh.speedKmh < 22) return null;
  for (const j of JUMPS) {
    if (garage.hasFeat(j.feat)) continue;
    const dx = veh.x - j.x, dz = veh.z - j.z;
    if (dx * dx + dz * dz > JUMP_RADIUS * JUMP_RADIUS) continue;
    garage.addFeat(j.feat);
    return j;
  }
  return null;
}

export const jumpsFound = (garage) => JUMPS.filter((j) => garage.hasFeat(j.feat)).length;

// ---------------------------------------------------------------- the moment

const RACES = ['racedave', 'racecivic', 'circuit', 'blitz'];
const SAYYAD_CHAIN = ['poutine', 'sayyad', 'racecivic'];
const all = (done, ids) => ids.every((id) => done.has(id));

// Each famous car, what you have to have done, and what is said when you have.
// `need` is the line the locked card in the menu shows; `card` is the two lines
// of the full-screen moment.
//
// The legends come from assets/text/mechanic.json. Their `howToEarn` conditions
// did NOT survive contact with the build: they ask for a three-leg midnight
// sprint, a 50 000-point stunt combo, a wet dirt circuit at Deschênes and five
// consecutive Blitz wins, and this game has none of those. Rather than ship a
// car nobody can earn, each one is bound to the nearest thing that exists and
// keeps the spirit — the Si still ends with beating Sayyad, the GTA is still
// paid for in stunts, the Leone is still the car that served the whole town.
export const FAMOUS = [
  {
    id: 'sicivic', who: 'Sayyad', at: 'steph',
    need: 'Fais toute la gang de jobs à Sayyad',
    needEn: 'Finish everything Sayyad asks of you',
    hint: 'Poutine express · La commission à Sayyad · La course contre Sayyad',
    earned: (done) => all(done, SAYYAD_CHAIN),
    title: 'SAYYAD T\u2019A DONNÉ LA SI',
    card: 'Trois jobs pour lui, pis tu l\u2019as battu à sa propre course.\n'
      + 'Il a tiré la toile dans le garage du 75 Denise-Friend. La rouge.\n'
      + 'Celle qui a semé la GRC su\u2019 l\u2019pont Portage en 2001.\n\n'
      + '« Tu la ramènes propre. Pis touche pas au radio. »',
  },
  {
    id: 'crownvic', who: 'La Ville', at: 'arena',
    need: 'Gagne les quatre courses',
    needEn: 'Win all four races',
    hint: 'La course à Adam · La course à Sayyad · Le circuit · Le blitz',
    earned: (done) => all(done, RACES),
    title: 'L\u2019ANCIENNE AUTO DE POLICE EST À TOI',
    card: 'Quatre courses. Personne t\u2019a rattrapé une seule fois.\n'
      + 'La Ville liquidait la vieille Crown Vic à l\u2019encan municipal en arrière de l\u2019aréna.\n\n'
      + '« On peut pas te battre. Autant que tu l\u2019aies. »',
  },
  {
    id: 'firebird', who: 'Le p\u2019tit frère à Boucher', at: 'principale',
    need: 'Trouve les huit sauts de la ville',
    needEn: 'Find all eight jumps in town',
    hint: JUMP_IDS.map((id) => JUMP_LABEL[id]).join(' · '),
    earned: (done, feats) => JUMPS.every((j) => feats.has(j.feat)),
    title: 'LE GTA À MULLET BOUCHER',
    card: 'Huit sauts. Le dernier devant la Principale au complet.\n'
      + 'Boucher est parti dans l\u2019Ouest pis son p\u2019tit frère a jamais osé tourner la clé.\n'
      + 'Il te l\u2019a lancée à place. La cassette de Rush est encore jammée dedans.\n\n'
      + '« Fais pas ça avec, par exemple. »',
  },
  {
    id: 'leone', who: 'M. Henderson', at: 'dep',
    need: 'Finis toutes les jobs',
    needEn: 'Finish every job',
    hint: 'Les ' + MISSIONS.length + ' jobs, au complet',
    earned: (done) => done.size >= MISSIONS.length,
    title: 'LA LEONE À HENDERSON',
    card: 'Toutes les jobs. Toute la ville te doit quelque chose.\n'
      + 'En 1998 le vieux Henderson a livré le pain pis le gaz à génératrice dans tout l\u2019Outaouais\n'
      + 'avec ce char-là, pendant que les autos de police sortaient même pas du stationnement.\n\n'
      + '« Elle a jamais manqué un hiver. Elle te manquera pas non plus. »',
  },
];

// The legends the writers gave us that this build has no model for. Nobody can
// earn these and nobody should be told they can — they are what Norm talks
// about while he has your car on the hoist, which is exactly the right place
// for a car that only exists as a story.
export const RUMOURS = [
  'Le Monte Carlo SS à Big Dan Beaulieu — noir, filets rouges, deux Flowmaster. '
    + 'Y\u2019a passé quatre ans dans grange de son grand-père à gosser le 350.',
  'Le GTI 16V du prof Roy — rouge Tornado su\u2019 des BBS. Il l\u2019a barré dans un entrepôt '
    + 'chauffé en arrière d\u2019la Principale avant de partir en France, immatriculation pas signée.',
  'Le Mustang 5.0 notchback à Pato Gagnon — blanc, pas de décalque, straight pipes. '
    + 'Il courait le quart de mille su\u2019 les Allumettières avant même que ça ouvre.',
  'Le 4Runner de l\u2019oncle Marcel — douze chars sortis d\u2019la bouette du bord de l\u2019Outaouais, '
    + 'trois tonneaux dans gravière, pis le frame est encore droit.',
  'L\u2019Omni GLH à Éric « Le Rat » Lévesque — une boîte à pain noire avec un turbo pis '
    + 'un contrôleur de boost fait avec une valve de quincaillerie. Il a perdu son permis en 2002.',
];

export const FAMOUS_IDS = FAMOUS.map((f) => f.id);

/**
 * Everything you have deserved and do not have yet, handed over. Returns the
 * FAMOUS records that just changed hands so the caller can put a card on the
 * screen; calling it every frame is fine and calling it twice is a no-op.
 */
export function claimFamous(garage, done) {
  const out = [];
  const d = done instanceof Set ? done : new Set(done || []);
  for (const f of FAMOUS) {
    if (garage.has(f.id)) continue;
    if (!f.earned(d, garage.feats)) continue;
    if (garage.earn(f.id)) out.push(f);
  }
  return out;
}

/** How close you are, for the menu card and the pause screen. */
export function famousProgress(garage, done) {
  const d = done instanceof Set ? done : new Set(done || []);
  return FAMOUS.map((f) => ({
    id: f.id, need: f.need, hint: f.hint,
    got: garage.has(f.id), ready: f.earned(d, garage.feats),
  }));
}

// ---------------------------------------------------------------- the rules

// Where each of these lives when nobody has moved it. main.js keeps its own
// OWNER table; the economy hook copies this into it.
export const OWNERS = {
  tempo: 'home', sicivic: 'steph', crownvic: 'arena', firebird: 'principale', leone: 'dep',
};

UNLOCKS.tempo = {
  kind: 'buy', cost: 180,
  need: '180 $ sur Kijiji',
  needEn: '$180 on Kijiji',
};
for (const f of FAMOUS) {
  UNLOCKS[f.id] = {
    kind: 'famous', who: f.who, need: f.need, needEn: f.needEn,
    // The full-screen card is the moment; the toast is only what the HUD shows
    // afterwards, so it stays short.
    toast: f.title + '\n' + f.who,
  };
}
