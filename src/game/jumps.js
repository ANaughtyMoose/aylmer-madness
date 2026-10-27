// Jumps: where the ramps are, what the air is worth, and what a bad landing costs.
//
// terrain.js owns the height field and the twenty features the town was built
// with, and it is not this file's to rewrite — so the ramps below are pushed
// into that same FEATURES array by installJumps(), once, at module load and
// long before buildWorld() bakes it. Every ramp here is therefore real baked
// geometry on the real analytic evaluator, exactly like the rail berm and the
// Galeries dock. Nothing here is a special case inside the car.
//
// The physics of a ramp, as cars.js actually implements it (the vertical step):
// while the wheels are on a rising surface the car's vy is FORCED to the rate
// that surface climbs, which is `slope * speed`. The instant the surface stops
// rising — the lip of a wedge, the crown of a mound — the car keeps that vy and
// gravity has it. So a jump is two numbers and nothing else:
//
//     vy = slope * speed        air = (vy + sqrt(vy^2 + 2*g*drop)) / g
//
// A 1-in-2.5 ramp taken at 100 km/h is about two and a half seconds of air.
// That is the whole design language of the table below: the slope sets the
// loft, the approach speed sets the distance, the height sets the way down.
//
// Two things make a ramp findable, and they matter as much as the ramp:
//   * every one of them has a TRACK — a beaten `path` scar that leaves the
//     pavement a hundred metres early, straightens onto the jump's own axis
//     sixty metres short of the lip, and carries on past the landing. It reads
//     from the driver's seat as a line somebody else has already taken; because
//     `path` is a full-power surface it is also what stops the grass eating the
//     run-up; and the straight section is what lets you line the thing up,
//     because you cannot aim a ramp while you are still turning.
//   * the game says the name out loud when you are pointed at one.
//
// The rest of the file is what makes the air worth flying: a sliver of yaw
// authority in flight so a bad take-off can be saved, a landing grade that
// refunds the spring damage when you get the truck straight and scrubs your
// speed when you do not, and money for air, distance, near misses and chains.
import { FEATURES } from './terrain.js';
import { clamp, angleDelta } from '../core/math.js';
// The written copy: jump names by index into assets/text/racing.json's `jumps`
// list, and the stunt callouts. See racingtext.js.
import { writtenName, callout, line as textLine } from './racingtext.js';
import { missionNotificationAllowed, crashShowQuiet } from './mission-notifications.js';

const G_ACC = 9.81;

/** The airtime a slope gives at this speed, from `drop` metres up. */
export function predictAir(slope, speed, drop = 0) {
  const vy = slope * speed;
  return (vy + Math.sqrt(vy * vy + 2 * G_ACC * Math.max(0, drop))) / G_ACC;
}

// ---------------------------------------------------------------- the table
//
// One row per jump, and it is the only place any of this is written down: the
// terrain features, the smoke test's bot, the "there is a ramp here" callout and
// the stunt board all read this array.
//
//   type    'ramp'  a wedge you climb from behind and leave off the lip
//           'crest' a two-way mound — no wrong side to come at it from
//           'pier'  a deck with a ramp on and a kicker off
//   x,z,yaw the LIP, and the heading through it (forward = sin/cos yaw)
//   H,run   the lip height and the length of the climb: slope = H / run
//   rx,rz   crest radii instead
//   entry   where the beaten track leaves the pavement, ~110 m short
//   from    a run-up point on the pavement, 160 to 340 m short, with a clear
//           line to `entry` (or along `path`)
//   path    optional: the bot's run-up after `from`, ending on the ramp's own
//           line, when the straight line to `entry` is blocked (harness, probe)
//   kmh     the speed it is built for, and since S3-JUMPS (20 Oct) the speed
//           a fresh Ranger really reaches from `from` at full throttle, so the
//           air jumpAir() promises is the air it gets, within 15 %
//           (tools/probe_jumps.mjs; docs/qa/rf/S3-JUMPS.md). The old values
//           (80 to 110) were 20 to 40 km/h above anything the truck reaches.
//   text    its index in assets/text/racing.json's `jumps`, where the written
//           list has a name for the thing that is actually here. Six of the
//           eleven have no such entry — a name off a list that describes a
//           different piece of ground is worse than the local one.
export const JUMPS = [
  {
    id: 'chantier', name: 'Le tremplin du chantier',
    where: 'chemin d’Aylmer, le 950',
    // Somebody is rebuilding the culvert at the 950 block and the fill ramp is
    // still up on the north verge: seven metres of gravel to a 2.9 m lip,
    // pointing east down the straightest, fastest road in Aylmer.
    type: 'ramp', x: 952.7, z: -279.3, yaw: 1.6795,
    H: 2.9, run: 7, hw: 8, hl: 1.0, kind: 'gravel', side: 'dirt',
    entry: [845.1, -264.9], from: [725.5, -240.2], kmh: 70,
    // ...and the spoil they dug out of it, sitting on the same line.
    extras: [{
      id: 'jChantierPile', type: 'mound', kind: 'dirt', side: 'grass',
      cx: 905, cz: -275.6, rx: 8, rz: 6.5, H: 1.3, flat: 0.12,
    }],
  },
  {
    id: 'garnotte', name: 'La rampe de garnotte',
    where: 'chemin d’Aylmer, à l’ouest de Fraser',
    // The culvert crew at the 950 block dumps its spare gravel a little west of
    // Fraser, and this summer the pile is a hump right across chemin d’Aylmer,
    // both lanes, steep on the east face. It is the first ramp of the summer on
    // purpose (refine A-07): L'alternateur's GPS line runs straight over the
    // lip (B-04: it sat 14 m off the line on the verge and the bot never hit
    // it), 63 m past the corner off Fraser, so a new driver who follows blue at
    // 60 to 70 km/h flies inside forty seconds of the driveway. It is not
    // further west because a ramp between x 655 and 802 sits on smoke_jumps'
    // two-minute washboard drive, which has to stay 70 m from every ramp.
    //
    // It sits on a two-way road, so it has no cliffs, and it is a `prof` (a
    // piecewise profile along the jump's axis) rather than the usual wedge:
    //   * the foot is curved in three steps (slope 0.17, 0.34, 0.50). A plain
    //     wedge this steep is a 8.7 m/s jolt at its foot at 60 km/h: cars.js
    //     reads it as a landing (drop over LAND_SAFE costs damage, impact over
    //     0.6 fires main.js's crash slow-mo), and the crash slow-mo's cooldown
    //     then swallows the jump slow-mo in the air. Each step here is under
    //     3.4 m/s at 70 km/h: no damage, impact under 0.25.
    //   * a metre of flat top, then a 15 m west face: an eastbound truck on
    //     the way home rides up it and hops off the steep side, which is when
    //     the box on the bench falls.
    //   * the sides feather over a 2.5 m skirt.
    // The road itself is the run-up, so no beaten track is painted over the
    // asphalt (noTrack). Invented fill like the chantier; C-03 replaces it if
    // Tom names a real spot (D27).
    // S3-JUMPS re-land (20 Oct): `from` is 74 m short, where a fresh Ranger
    // reaches the 70 it is built for (from the old 119 m it took off at 87).
    // Proof: tools/review/beats/B-04.mjs, a placed truck on the GPS line.
    type: 'ramp', x: 806.0, z: -248.5, yaw: -1.4677,
    H: 2.6, run: 5.2, hw: 8, hl: 1.0, kind: 'gravel', side: 'gravel',
    prof: [-6.7, 0, -5.2, 0.255, -3.6, 0.8, 0, 2.6, 1.0, 2.6, 16, 0], skirt: 2.5,
    entry: [865.7, -255.1], from: [880.0, -256.6], kmh: 70, noTrack: true,
  },
  {
    id: 'buttesymmes', name: 'La butte du bord de l’eau',
    where: 'rue Principale, le Vieux-Aylmer',
    // The lump of fill left over from the 1990s riverbank work, on the strip of
    // grass between Principale and the water. Everybody drives Principale and it
    // is sixteen metres off the centreline, so you see it on every single lap.
    type: 'crest', x: -1603.9, z: -133.7, yaw: -2.5168,
    H: 2.4, rx: 10, rz: 10, kind: 'grass', side: 'grass',
    entry: [-1553.6, -37.1], from: [-1473.7, -33.6], kmh: 65,
  },
  {
    id: 'quaimarina', text: 27, name: 'Le Talus du Canot',
    where: 'l’entrée de la marina, rue Principale',
    // The yard blocks boats up here all winter and runs the trailers up a short
    // gravel ramp to get them onto the hardstanding. It is the steepest thing in
    // Aylmer. terrain.js's boat launch is 130 m west and puts you in the
    // Outaouais; this is the version of the same idea you can actually land.
    type: 'ramp', x: -1660.6, z: -213.7, yaw: -2.3815,
    H: 2.9, run: 6, hw: 7, hl: 1.0, kind: 'gravel', side: 'gravel',
    entry: [-1584.5, -134.2], from: [-1487.7, -63.2], kmh: 70,
  },
  {
    id: 'dunecedres', text: 5, name: 'L’Envolée des Cèdres',
    where: 'Plage des Cèdres',
    // The sand the town pushes off the beach every spring, sitting square on the
    // path down from the Raoul-Roy lot. The crown is packed hard by everyone who
    // has already done this; either side of it is loose sand — slow, slidey and
    // soft to land on. The only jump in Aylmer that forgives you for getting it
    // wrong, and the only one with Lac Deschênes sixty metres past the landing.
    type: 'crest', x: -1904.1, z: -426.8, yaw: -1.4289, // [w6-ramps2] 6 m inland on its axis (was -1910, -426; 12 m put it on the falling hillside and it stopped flying at 70)
    H: 2.7, rx: 12, rz: 11, kind: 'dirt', side: 'sand',
    entry: [-1799.1, -441.7], from: [-1754.0, -444.0], kmh: 70, runout: 48,
  },
  {
    id: 'cineparc', name: 'Le vieux ciné-parc',
    where: 'boulevard de Lucerne',
    // The drive-in closed in '98 and nobody levelled the field. Three rows of
    // berm left where the cars used to park, square on to the boulevard and
    // getting taller: take the first one at speed and you can string all three.
    type: 'ramp', x: -161.8, z: 678.6, yaw: 1.1563,
    H: 1.8, run: 5.2, hw: 11, hl: 0.9, kind: 'grass', side: 'grass',
    entry: [-257.2, 622.3], from: [-367.5, 574.3], kmh: 70, chain: 3,
    extras: [
      {
        id: 'jCineB', type: 'pad', kind: 'grass', side: 'grass',
        cx: -132.4, cz: 691.2, yaw: 1.1563, hw: 11, hl: 0.9, H: 2.0, runs: [0, 0, 5.2, 0],
      },
      {
        id: 'jCineC', type: 'pad', kind: 'grass', side: 'grass',
        cx: -103.0, cz: 703.8, yaw: 1.1563, hw: 11, hl: 0.9, H: 2.2, runs: [0, 0, 5.2, 0],
      },
    ],
  },
  {
    id: 'vanier', name: 'Le dépôt de sable',
    where: 'chemin Vanier, Deschênes',
    // The highway department's winter sand depot: a gravel ramp up to where the
    // salt shed door used to be. Southbound Vanier is two kilometres of run-up.
    type: 'ramp', x: 2207.2, z: -1203.4, yaw: -3.0443,
    H: 2.7, run: 7.5, hw: 8, hl: 1.2, kind: 'gravel', side: 'gravel',
    entry: [2234.1, -1095.6], from: [2249.5, -876.1], kmh: 95,
  },
  {
    id: 'eardley', text: 14, name: 'Le Saut du Ponceau',
    where: 'chemin Eardley',
    // Where the road crosses the old drumlin. The city shaved the road flat and
    // left both ends of the hill standing in the ditch. Two-way, and Eardley is
    // the fastest road out of town. S3-JUMPS: 3.3 m (was 2.7), so the 80 the
    // truck brings over it is still a flight and not a hop.
    type: 'crest', x: -1849.8, z: -1135.5, yaw: -2.2485,
    H: 3.3, rx: 11, rz: 11, kind: 'grass', side: 'grass',
    entry: [-1773.2, -1054.9], from: [-1630.8, -929.1], kmh: 80,
  },
  {
    id: 'lavigne', name: 'Le remblai de Wilfrid-Lavigne',
    where: 'boulevard Wilfrid-Lavigne',
    // The sound berm along the east side of Lavigne, with a gap in it where the
    // service road was going to go. The gap is a ramp now.
    type: 'ramp', x: -145.5, z: -550.7, yaw: -0.1320,
    H: 2.6, run: 7, hw: 7, hl: 1.0, kind: 'dirt', side: 'grass',
    entry: [-130.5, -655.0], from: [-185.5, -836.9], kmh: 70,
  },
  {
    id: 'arena', name: 'Le tremplin de terre',
    where: 'le champ de la rue Lord-Aylmer',
    // terrain.js already has the little dirt jump some kid dug in the field
    // behind the aréna. This is the one his older brother dug in the next field
    // over with the neighbour's bobcat, and it is a different sport.
    type: 'ramp', x: -922.0, z: 336.8, yaw: 1.2245,
    H: 2.6, run: 6.5, hw: 7, hl: 1.0, kind: 'dirt', side: 'dirt',
    entry: [-1037.0, 310.8] /* [w6-ramps2] 6 m south (was 316.8): track clears the corner at (-1029, 318) */, from: [-1129.4, 234.8], path: [[-1030, 302], [-990, 312]], kmh: 80,
  },
  {
    id: 'railkick', text: 1, name: 'Le Talus du CP',
    where: 'l’ancienne voie ferrée, bout est',
    // terrain.js's `rail` berm is 1.4 km of gravel spine you can run end to end
    // at full noise — the best shortcut in town, and nothing was ever on it. Now
    // there is a heap of ballast a hundred metres short of the east end that
    // nobody ever spread, and it throws you the rest of the way. The approach is
    // the berm itself, which is why `entry` and `from` are up on it and there is
    // no track: the spine IS the track.
    type: 'ramp', x: 1400, z: -488, yaw: 1.740,
    H: 3.3, run: 9, hw: 6.5, hl: 1.0, kind: 'gravel', side: 'grass',
    entry: [1341, -478], from: [1150, -445.1], kmh: 75, noTrack: true,
  },
  {
    id: 'hull', text: 17, name: 'Le Tremplin de Chantier',
    where: 'la 148, secteur Hull',
    // The 148 was still being widened in 2004 and the contractor's haul ramp is
    // parked on the north shoulder east of the Casino turnoff. Fifteen metres of
    // trunk road to line it up on, and nothing whatsoever in the way after.
    // The big one: S3-JUMPS made it 4.4 m on 8.2 (was 3.2 on 7.5) so it still
    // gives the set its two-second-plus flight at the 75 the truck really has.
    type: 'ramp', x: 7959.3, z: -4232.4, yaw: 1.3826,
    H: 4.4, run: 8.2, hw: 8, hl: 1.2, kind: 'gravel', side: 'dirt',
    entry: [7839.4, -4255.3], from: [7622.2, -4220.2], kmh: 75,
  },
];

/** What this ramp is called: the written name if there is one, else the local one. */
export const jumpName = (j) => writtenName('jumps', j.text, j.name);

/** Slope of a jump: what actually decides the loft. */
export function jumpSlope(j) {
  // A mound's steepest point is at half height; see evalMound in terrain.js.
  if (j.type === 'crest') return (j.H * Math.PI) / (2 * j.rx * (1 - 0.10));
  return j.H / j.run;
}

/** What the table says this jump is worth, at the speed it was built for. */
export function jumpAir(j) {
  const drop = j.type === 'crest' ? j.H * 0.5 : j.H;
  return predictAir(jumpSlope(j), j.kmh / 3.6, drop);
}

// The beaten track: `track` is a full-power surface with a little rattle in it,
// so the line reads as worn ground and costs you nothing to be on. It is its
// own SURF row and not `path`, which is a municipal footpath and now costs a
// car real speed — see the note over SURF in terrain.js. hw is
// generous — six metres — because you are arriving at it sideways at 90.
// Sixteen metres of packed track with a three-metre feather either side, and the
// last fifty-eight of it dead straight. Wide, because you arrive at it sideways.
const TRACK_HW = 8, TRACK_RUN = 3, TRACK_STRAIGHT = 58;

function buildFeatures(list = JUMPS) {
  const out = [];
  for (const j of list) {
    const s = Math.sin(j.yaw), c = Math.cos(j.yaw);
    if (j.type === 'crest') {
      out.push({
        id: 'j_' + j.id, type: 'mound', kind: j.kind, side: j.side,
        cx: j.x, cz: j.z, rx: j.rx, rz: j.rz, H: j.H, flat: 0.10,
      });
    } else if (j.prof) {
      // A ramp with its own profile along the axis (w metres from the lip,
      // height), as terrain.js's `prof`: garnotte's curved foot.
      out.push({
        id: 'j_' + j.id, type: 'prof', kind: j.kind, side: j.side,
        cx: j.x, cz: j.z, yaw: j.yaw, hw: j.hw, skirt: j.skirt || 0, prof: j.prof,
      });
    } else {
      out.push({
        id: 'j_' + j.id, type: 'pad', kind: j.kind, side: j.side,
        cx: j.x, cz: j.z, yaw: j.yaw, hw: j.hw, hl: j.hl, H: j.H,
        runs: [0, 0, j.run, 0],
      });
    }
    if (j.extras) out.push(...j.extras);
    if (j.noTrack || !j.entry) continue;
    // Three points: in off the pavement, onto the jump's own axis a good sixty
    // metres short of it, and then dead straight through the lip and out as far
    // as the jump throws you plus somewhere to slow down. The straight section
    // is the point — you cannot line a ramp up while you are still turning.
    // How far past the lip the track runs. Usually as far as the jump throws you
    // plus room to slow down; the beach one says so itself, because thirty more
    // metres of it would be a tan stripe painted across the Outaouais.
    const runout = j.runout != null ? j.runout : jumpAir(j) * (j.kmh / 3.6) + 30;
    out.push({
      id: 'j_' + j.id + 'Track', type: 'ridge', kind: 'track', side: 'track',
      // Above every other flat patch: a track worn across the beach at the Plage
      // des Cèdres is packed ground, not the loose sand either side of it, and a
      // truck that cannot move is not a jump.
      H: 0, pri: 3, hw: TRACK_HW, run: TRACK_RUN, taper: 0,
      pts: [
        j.entry[0], j.entry[1],
        j.x - s * TRACK_STRAIGHT, j.z - c * TRACK_STRAIGHT,
        j.x + s * runout, j.z + c * runout,
      ],
    });
  }
  return out;
}

/** The terrain features these jumps are made of, in terrain.js's own schema. */
export const JUMP_FEATURES = buildFeatures();

let installed = false;

/**
 * Add the ramps to terrain.js's feature list. Idempotent, and it has to run
 * before buildWorld() — main.js calls it at module scope for exactly that
 * reason. Returns the number of features in the field afterwards.
 */
export function installJumps(list = FEATURES) {
  if (installed) return list.length;
  installed = true;
  for (const f of JUMP_FEATURES) list.push(f);
  return list.length;
}

// ---------------------------------------------------------------- the numbers

// Mirrors of cars.js's private landing constants. They are not exported there,
// and copying two numbers is cheaper than reaching into the module — but if the
// truck ever gets softer springs, these move with them.
const LAND_SAFE = 4.0, LAND_DMG = 0.75;

export const AIR = {
  minAir: 0.75,        // seconds before a hop counts as a jump at all
  bigAir: 1.6,         // ...and before the board shouts about it
  comboWindow: 6.0,    // seconds after a landing to still be on a chain
  comboMin: 1.0,       // ...and the air a flight needs to be a link in one
  comboMax: 3,         // multiplier ceiling
  // The money is a CURVE and not a rate, and that is the whole point of it.
  // A rate pays by the second, so five kerb hops of half a second each pay
  // what one two-and-a-half-second flight pays — except you can do the five in
  // the time it takes to line the one up, so the town turns into a cash
  // machine and the eleven ramps turn into scenery. A fourth-power curve
  // prices a jump by how big it IS: `airBase` is what one flat second of air
  // is worth, and every doubling of the airtime is worth sixteen times more.
  //
  // 29 Sept (progression review P4): at 2.44 a clean chantier paid $84 and the
  // eleven ramps $520, so one ramp a minute out-earned the whole campaign. At
  // 0.5, with full pay once per ramp per game day (below), a clean chantier is
  // about $25 and the most the eleven can pay in one day is about $230.
  airBase: 0.5,
  airPow: 4,
  perMetre: 0.20,      // ...per metre of it
  cleanBonus: 6,       // ...for putting it down straight
  floorAir: 1.5,       // a clean ramp landing after this much air...
  floorPay: 10,        // ...pays at least this, before the chain and the decay
  nearMissBonus: 3,    // ...per thing you nearly hit on the way over
  // Distance, the clean bonus and the near misses are all scaled by `bigness`
  // below. A kerb hop past a hydro pole is not worth three dollars for the
  // pole, and it is not worth six for landing the way a kerb hop always lands.
  //
  // A ramp pays in full ONCE per game day (ctx.day), then a quarter, then
  // less. Without a day in the context — a node test — it forgets after
  // `repeatForget` seconds, which is one prototype day at the default 24 min.
  repeatDecay: [1, 0.25, 0.1, 0.05],
  repeatForget: 24 * 60,
  // Air that is NOT off one of the eleven ramps: kerbs, washboard, the crown of
  // a bumpy road. Tom's report (29 Sept): « the car racks up a bunch of
  // sequential $1 prizes, quickly adding up to $100+ ». Every flight over
  // 0.75 s used to pay at least $1, and the repeat decay keyed on a 40 m cell,
  // so a bumpy road crossed a new cell every hop and never decayed. Now:
  // under `offRampMin` seconds it pays nothing at all, and everything it does
  // pay comes out of a rolling budget of `offRampCap` dollars per
  // `offRampWindow` seconds. A dollar here or there, never a leak.
  offRampMin: 1.0,
  offRampCap: 3,
  offRampWindow: 60,
  // Landing grades: radians of slip between where the nose points and where the
  // truck is actually going. Everything else is decoration.
  perfect: 0.18, clean: 0.40,
  scrubMax: 0.34,      // a crooked landing costs this much of your speed
  crookedDmg: 5,       // ...and this much damage on top of the springs'
  // Yaw authority in flight, rad/s at full stick. cars.js freezes the heading
  // deliberately ("the stick only leans the body, Midtown Madness style"); this
  // is the modes agent handing a sliver of it back, to the player's truck only.
  // Enough to straighten a bad take-off, nowhere near enough to aim the thing.
  airYaw: 0.85,
};

// ---------------------------------------------------------------- the scorer

/**
 * How much of a jump this was: 0 at the floor where a flight starts counting
 * at all, 1 once it is big air. Everything that is not the airtime curve
 * itself is scaled by this, so the small stuff pays pennies of the small stuff
 * rather than full price for being airborne at all.
 */
export function bigness(air, c = AIR) {
  return clamp((air - c.minAir) / (c.bigAir - c.minAir), 0, 1);
}

/**
 * One flight, start to finish. Pure logic on a car-shaped object — no DOM, no
 * WebGL — so tools/smoke_jumps.mjs scores exactly what the game scores.
 *
 * Feed it the car every tick AFTER its own update(). It reads `airT`, `inAir`,
 * `landed` and `lastAir`, which cars.js maintains, and nothing else.
 */
export class AirScorer {
  constructor(cfg = {}) {
    this.cfg = { ...AIR, ...cfg };
    this.flying = false;
    this.t = 0;                // seconds into the current flight
    this.peak = 0;             // highest the wheels got, metres
    this.dist = 0;             // metres between take-off and touchdown
    this.entryKmh = 0;
    this.x0 = 0; this.z0 = 0;
    this.nearMiss0 = 0;
    this.combo = 0;            // jumps on the current chain
    this.comboT = 0;           // seconds left to keep it
    this.last = null;          // the last scored flight
    this.total = 0;            // dollars paid out this session
    this.best = { air: 0, dist: 0, pay: 0 };
    this.repeat = new Map();   // jump id -> { n, t, day }
    this.clock = 0;            // seconds this scorer has run, for the budget
    this.small = [];           // [{ t, pay }] off-ramp payouts inside the window
    this.site0 = null;         // where the current flight took off
    this.ramp0 = false;        // ...and whether that was one of the ramps
  }

  /** Dollars of off-ramp air paid inside the rolling window. */
  smallPaid() {
    const c = this.cfg;
    while (this.small.length && this.clock - this.small[0].t > c.offRampWindow) this.small.shift();
    let n = 0;
    for (const s of this.small) n += s.pay;
    return n;
  }

  /**
   * @param dt   fixed step
   * @param v    the Vehicle, already updated this tick
   * @param ctx  { nearMiss, siteId, ramp, day, steer } — the running
   *             near-miss counter, which ramp (or patch of town) we are over,
   *             whether that is one of the eleven ramps, the game day (for
   *             the once-a-day full pay), and the stick. `ramp` defaults to
   *             "there is a siteId", which is what the older callers meant.
   * @returns    a score record on the tick a flight lands, else null
   */
  update(dt, v, ctx = {}) {
    this.clock += dt;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    for (const [k, r] of this.repeat) {
      r.t -= dt;
      const newDay = ctx.day != null && r.day != null && Math.floor(ctx.day) !== r.day;
      if (newDay || (r.day == null && r.t <= 0)) this.repeat.delete(k);
    }

    // ---- take-off
    if (v.airT > 0 && !this.flying) {
      this.flying = true;
      this.t = 0;
      this.peak = 0;
      this.dist = 0;
      this.x0 = v.x; this.z0 = v.z;
      this.entryKmh = v.speedKmh;
      this.nearMiss0 = ctx.nearMiss || 0;
      // Which ground it left from. The landing can be sixty metres down the
      // road from a ramp, so the take-off is what decides whose air this was.
      this.site0 = ctx.siteId || null;
      this.ramp0 = ctx.ramp != null ? !!ctx.ramp : !!ctx.siteId;
    }

    if (this.flying) {
      this.t += dt;
      const lift = v.y - v.gh;
      if (lift > this.peak) this.peak = lift;
      this.dist = Math.hypot(v.x - this.x0, v.z - this.z0);
      // The sliver of heading authority. Only while genuinely off the ground —
      // v.inAir wants 8 cm of clearance, so kerbs and washboard get nothing.
      if (v.inAir && ctx.steer) v.yaw -= ctx.steer * this.cfg.airYaw * dt;
    }

    // ---- touchdown. cars.js zeroes airT and fills `landed` for one tick.
    if (this.flying && v.airT === 0) {
      const air = v.lastAir || this.t;
      const rec = this._score(v, air, ctx);
      this.flying = false;
      this.t = 0;
      return rec;
    }
    return null;
  }

  _score(v, air, ctx) {
    const c = this.cfg;
    const drop = v.landed || 0;
    // How straight it went down: the angle between where the nose points and
    // where the truck is actually travelling.
    const speed = Math.hypot(v.vx, v.vz);
    const slip = speed > 1.5
      ? Math.abs(angleDelta(Math.atan2(v.vx, v.vz), v.yaw)) : 0;
    const tilt = Math.abs(v.roll) + Math.abs(v.pitch);
    const grade = slip < c.perfect && tilt < 0.45 ? 'perfect'
      : slip < c.clean && tilt < 0.8 ? 'clean' : 'crooked';

    if (air < c.minAir) {
      // Not a jump. Still a crooked landing off a kerb, though, so it still bites.
      if (grade === 'crooked' && drop > LAND_SAFE) this._punish(v, slip, 0.4);
      return null;
    }

    // The landing damage cars.js has just applied, recomputed the same way. A
    // straight landing gets it back: that is what "reward getting it straight"
    // has to mean when the springs are not ours to soften.
    const landDmg = Math.max(0, (drop - LAND_SAFE) * LAND_DMG);
    if (grade === 'crooked') this._punish(v, slip, 1);
    else if (landDmg > 0) {
      const back = grade === 'perfect' ? landDmg : landDmg * 0.6;
      v.damage = Math.max(0, v.damage - Math.min(back, landDmg));
    }

    const near = Math.max(0, (ctx.nearMiss || 0) - this.nearMiss0);
    // Only a real flight is a link in a chain. A kerb every four seconds used
    // to hold a x3 open indefinitely, which is where most of the money was
    // actually coming from: the multiplier, not the jumps.
    if (air >= c.comboMin) {
      this.combo = Math.min(this.combo + 1, 99);
      this.comboT = c.comboWindow;
    }
    // ...and with the gate, `combo` can now be 0 here, which the old
    // 1 + (combo - 1) * 0.5 would have turned into a HALF-price payout.
    const mult = this.combo > 0
      ? Math.min(c.comboMax, 1 + (this.combo - 1) * 0.5) : 1;

    // The same ramp over and over: full pay once a game day, then less.
    // S3-JUMPS: a hop shorter than a chain link (the kerb onto the track, the
    // spoil pile) keys its own decay, so it no longer spends the ramp's one
    // full pay of the day before the truck has even reached the lip.
    const site0 = this.site0 || ctx.siteId || null;
    const site = site0 && air < c.comboMin ? site0 + ':hop' : site0;
    const ramp = this.ramp0;
    let decay = 1;
    if (site) {
      const r = this.repeat.get(site) || { n: 0, t: 0 };
      decay = c.repeatDecay[Math.min(r.n, c.repeatDecay.length - 1)];
      this.repeat.set(site, {
        n: r.n + 1, t: c.repeatForget,
        day: ctx.day != null ? Math.floor(ctx.day) : null,
      });
    }

    const size = bigness(air, c);
    let pay = c.airBase * Math.pow(air, c.airPow)
      + (this.dist * c.perMetre + near * c.nearMissBonus) * size;
    if (grade !== 'crooked') pay += c.cleanBonus * size;
    else pay *= 0.5;
    // S3-JUMPS: a clean landing off a ramp after `floorAir` seconds is worth
    // at least `floorPay` (feel review: a 1.8 s perfect landing paid 2 $).
    // Before the chain and the repeat decay, so the second go the same day
    // still pays a quarter of it, as every ramp does.
    if (ramp && grade !== 'crooked' && air >= c.floorAir) pay = Math.max(pay, c.floorPay);
    pay *= mult * decay;
    if (ramp) {
      pay = Math.max(1, Math.round(pay));
    } else {
      // Off-ramp: nothing for a hop, and never more than the rolling budget.
      pay = air < c.offRampMin ? 0 : Math.round(pay);
      pay = Math.max(0, Math.min(pay, c.offRampCap - this.smallPaid()));
      if (pay > 0) this.small.push({ t: this.clock, pay });
    }

    const rec = {
      air, dist: this.dist, peak: this.peak, entryKmh: this.entryKmh,
      grade, slip, drop, near, combo: this.combo, mult, pay, size,
      big: air >= c.bigAir, ramp, site: site0,
    };
    this.total += pay;
    if (air > this.best.air) this.best.air = air;
    if (this.dist > this.best.dist) this.best.dist = this.dist;
    if (pay > this.best.pay) this.best.pay = pay;
    this.last = rec;
    return rec;
  }

  // A crooked landing: the tyres point one way, the truck goes another. It
  // scrubs speed off and it bends something.
  _punish(v, slip, k) {
    const c = this.cfg;
    const f = 1 - clamp(slip / 1.2, 0, 1) * c.scrubMax * k;
    v.vx *= f; v.vz *= f;
    v.vLong *= f;
    if (v.hit) v.hit(clamp(slip, 0, 1.6) * c.crookedDmg * k * 0.5);
  }
}

// ---------------------------------------------------------------- the board

// Its own element, appended to the HUD, because style.css and hud.js belong to
// other people. Big, centred, and gone in two seconds.
const BOARD_CSS = 'position:fixed;left:50%;top:21%;transform:translateX(-50%);' +
  'z-index:40;pointer-events:none;text-align:center;font:700 15px/1.35 Helvetica,Arial,sans-serif;' +
  'color:#ffe08a;text-shadow:0 2px 10px rgba(0,0,0,.85),0 0 3px rgba(0,0,0,.9);' +
  'letter-spacing:.04em;opacity:0;transition:opacity .18s;white-space:pre-line';

function board(create = true) {
  if (typeof document === 'undefined' || !document.getElementById) return null;
  let el = document.getElementById('airboard');
  if (el) return el;
  if (!create) return null;
  if (!document.createElement) return null;
  const host = document.getElementById('hud') || document.body;
  if (!host || !host.appendChild) return null;
  el = document.createElement('div');
  el.id = 'airboard';
  el.style.cssText = BOARD_CSS;
  host.appendChild(el);
  return el;
}

const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * The board's text for a landed jump. The last line is a written callout
 * (assets/text/racing.json) chosen by what actually happened: a chain gets a
 * `combo` line, a bad one gets `crash`, a big one gets `air`, and anything else
 * gets `landing`. Pure, so the test can read it.
 */
export function scoreText(rec) {
  const head = rec.grade === 'perfect' ? 'ATTERRISSAGE PARFAIT'
    : rec.grade === 'clean' ? 'BIEN POSÉ' : 'CROCHE';
  const bits = [`${fmt1(rec.air)} s dans les airs`, `${Math.round(rec.dist)} m`];
  if (rec.near) bits.push(`${rec.near} frôlement${rec.near > 1 ? 's' : ''}`);
  if (rec.combo > 1) bits.push(`CHAÎNE ×${rec.combo}`);
  const said = textLine(callout(
    rec.grade === 'crooked' ? 'crash' : rec.combo > 1 ? 'combo' : rec.big ? 'air' : 'landing'));
  return `${head}\n${bits.join('   ·   ')}\n+${rec.pay} $` + (said ? `\n${said}` : '');
}

// ---------------------------------------------------------------- the hook

// How near a ramp you have to be, and how well lined up, before the game tells
// you it is there. Generous on the cone: the whole point is to be found.
const CALL_D = 110, CALL_COS = 0.55, CALL_KMH = 25, CALL_AGAIN = 25;
// ...and how near counts as "that was THIS ramp" when the money is worked out.
const SITE_D = 70;
// Away from the eleven ramps, the repeat decay keys on a cell of the town this
// big instead. Forty metres is one kerb, one driveway apron, one kicker.
const SITE_CELL = 40;

const state = { scorer: null, called: new Map(), hideAt: 0 };

/** Nearest jump in the table to a point, with its distance. */
export function nearestJump(x, z, list = JUMPS) {
  let best = null, bd = Infinity;
  for (const j of list) {
    const d = Math.hypot(j.x - x, j.z - z);
    if (d < bd) { bd = d; best = j; }
  }
  return best ? { jump: best, d: bd } : null;
}

/**
 * main.js hook, by way of race.js's per-tick entry point. Scores the flight the
 * player is in, pays for it, and points out a ramp he is driving at.
 */
export function updateJumps(G, dt) {
  const v = G.veh;
  if (!v) return;
  if (!state.scorer) state.scorer = new AirScorer();
  const sc = state.scorer;
  G.air = sc;

  const near = nearestJump(v.x, v.z);
  // The decay needs a name for the ground you just left. Near a real ramp that
  // is the ramp; anywhere else it is the cell you are standing in, so the same
  // kerb taken over and over falls off exactly the way the same ramp does.
  // Before this the decay only existed within seventy metres of eleven places
  // and the other forty square kilometres of Aylmer paid full price forever.
  const siteId = near && near.d < SITE_D ? near.jump.id
    : `g${Math.round(v.x / SITE_CELL)},${Math.round(v.z / SITE_CELL)}`;
  const rec = sc.update(dt, v, {
    nearMiss: G.stats ? G.stats.nearMiss || 0 : 0,
    siteId,
    ramp: !!(near && near.d < SITE_D),
    day: Number.isFinite(G.day) ? G.day : undefined,
    steer: G.input ? G.input.steer : 0,
  });

  // A hop that paid nothing is not worth a board, a blip and a shout. It still
  // counted (the stats and the landing grade saw it); it just is not news.
  // S3-CRASH: a bounce off a crash is not news either, and it does not pay.
  const crashy = crashShowQuiet(G);
  const quiet = rec && (crashy || (rec.pay <= 0 && !rec.big));
  if (rec && !quiet && G.wallet && rec.pay > 0) G.wallet.add(rec.pay);
  // Golf night keeps its own dialogue. Continue scoring and paying, but hide
  // any old board and skip generic stunt boards, blips and ramp callouts.
  if (!missionNotificationAllowed(G, 'stunt') || crashy) {
    const el = board(false);
    if (el) el.style.opacity = '0';
    state.hideAt = 0;
    return;
  }
  if (rec && !quiet) {
    const el = board();
    if (el) {
      el.textContent = scoreText(rec);
      el.style.fontSize = rec.big ? '22px' : '15px';
      el.style.color = rec.grade === 'crooked' ? '#ffb0a0' : '#ffe08a';
      el.style.opacity = '1';
      state.hideAt = G.time + (rec.big ? 2.6 : 1.9);
    }
    if (G.audio) {
      if (rec.grade === 'crooked') G.audio.blip(190, 0.16, 'square', 0.18);
      else G.audio.blip(rec.combo > 1 ? 720 + rec.combo * 90 : 720, 0.14, 'triangle', 0.20);
    }
  } else if (!rec && sc.flying && sc.t > 0.35) {
    // Live, while it is still up there: the number that tells you whether to
    // keep the throttle in on the next one.
    const el = board();
    if (el) {
      el.textContent = `${fmt1(sc.t)} s\n${Math.round(sc.dist)} m`;
      el.style.fontSize = '22px';
      el.style.color = '#ffffff';
      el.style.opacity = '1';
      state.hideAt = G.time + 0.6;
    }
  } else if (state.hideAt && G.time > state.hideAt) {
    const el = board();
    if (el) el.style.opacity = '0';
    state.hideAt = 0;
  }

  // ---- "there is a ramp here" -------------------------------------------
  if (!near || near.d > CALL_D || v.speedKmh < CALL_KMH || sc.flying) return;
  const j = near.jump;
  const dx = j.x - v.x, dz = j.z - v.z;
  const l = Math.hypot(dx, dz) || 1;
  const cos = (dx / l) * Math.sin(v.yaw) + (dz / l) * Math.cos(v.yaw);
  if (cos < CALL_COS) return;
  const was = state.called.get(j.id);
  if (was != null && G.time - was < CALL_AGAIN) return;
  state.called.set(j.id, G.time);
  if (G.hud) G.hud.toast(`${jumpName(j).toUpperCase()}\n${j.kmh} km/h, pis lâche pas`, 1800);
}

/** Tests and a fresh game: forget the session's chains, payouts and callouts. */
export function resetJumps() {
  state.scorer = null;
  state.called.clear();
  state.hideAt = 0;
}
