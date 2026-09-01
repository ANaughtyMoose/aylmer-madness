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
//   from    a run-up point on the pavement, ~230 m short
//   kmh     the speed it is built for
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
    // pointing east down the straightest, fastest road in Aylmer. The big one.
    type: 'ramp', x: 952.7, z: -279.3, yaw: 1.6795,
    H: 2.9, run: 7, hw: 8, hl: 1.0, kind: 'gravel', side: 'dirt',
    entry: [845.1, -264.9], from: [725.5, -240.2], kmh: 100,
    // ...and the spoil they dug out of it, sitting on the same line.
    extras: [{
      id: 'jChantierPile', type: 'mound', kind: 'dirt', side: 'grass',
      cx: 905, cz: -275.6, rx: 8, rz: 6.5, H: 1.3, flat: 0.12,
    }],
  },
  {
    id: 'buttesymmes', name: 'La butte du bord de l’eau',
    where: 'rue Principale, le Vieux-Aylmer',
    // The lump of fill left over from the 1990s riverbank work, on the strip of
    // grass between Principale and the water. Everybody drives Principale and it
    // is sixteen metres off the centreline, so you see it on every single lap.
    type: 'crest', x: -1603.9, z: -133.7, yaw: -2.5168,
    H: 2.4, rx: 10, rz: 10, kind: 'grass', side: 'grass',
    entry: [-1553.6, -37.1], from: [-1466.7, 52.1], kmh: 80,
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
    entry: [-1584.5, -134.2], from: [-1500.2, -30.8], kmh: 75,
  },
  {
    id: 'dunecedres', text: 5, name: 'L’Envolée des Cèdres',
    where: 'Plage des Cèdres',
    // The sand the town pushes off the beach every spring, sitting square on the
    // path down from the Raoul-Roy lot. The crown is packed hard by everyone who
    // has already done this; either side of it is loose sand — slow, slidey and
    // soft to land on. The only jump in Aylmer that forgives you for getting it
    // wrong, and the only one with Lac Deschênes sixty metres past the landing.
    type: 'crest', x: -1910, z: -426, yaw: -1.4289,
    H: 2.7, rx: 12, rz: 11, kind: 'dirt', side: 'sand',
    entry: [-1799.1, -441.7], from: [-1681.4, -448.3], kmh: 70, runout: 48,
  },
  {
    id: 'cineparc', name: 'Le vieux ciné-parc',
    where: 'boulevard de Lucerne',
    // The drive-in closed in '98 and nobody levelled the field. Three rows of
    // berm left where the cars used to park, square on to the boulevard and
    // getting taller: take the first one at speed and you can string all three.
    type: 'ramp', x: -161.8, z: 678.6, yaw: 1.1563,
    H: 1.8, run: 5.2, hw: 11, hl: 0.9, kind: 'grass', side: 'grass',
    entry: [-257.2, 622.3], from: [-367.5, 574.3], kmh: 85, chain: 3,
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
    entry: [2234.1, -1095.6], from: [2245.6, -976.0], kmh: 95,
  },
  {
    id: 'eardley', text: 14, name: 'Le Saut du Ponceau',
    where: 'chemin Eardley',
    // Where the road crosses the old drumlin. The city shaved the road flat and
    // left both ends of the hill standing in the ditch. Two-way, and Eardley is
    // the fastest road out of town.
    type: 'crest', x: -1849.8, z: -1135.5, yaw: -2.2485,
    H: 2.7, rx: 11, rz: 11, kind: 'grass', side: 'grass',
    entry: [-1773.2, -1054.9], from: [-1680.9, -979.4], kmh: 90,
  },
  {
    id: 'lavigne', name: 'Le remblai de Wilfrid-Lavigne',
    where: 'boulevard Wilfrid-Lavigne',
    // The sound berm along the east side of Lavigne, with a gap in it where the
    // service road was going to go. The gap is a ramp now.
    type: 'ramp', x: -145.5, z: -550.7, yaw: -0.1320,
    H: 2.6, run: 7, hw: 7, hl: 1.0, kind: 'dirt', side: 'grass',
    entry: [-130.5, -655.0], from: [-82.5, -781.9], kmh: 90,
  },
  {
    id: 'arena', name: 'Le tremplin de terre',
    where: 'le champ de la rue Lord-Aylmer',
    // terrain.js already has the little dirt jump some kid dug in the field
    // behind the aréna. This is the one his older brother dug in the next field
    // over with the neighbour's bobcat, and it is a different sport.
    type: 'ramp', x: -922.0, z: 336.8, yaw: 1.2245,
    H: 2.6, run: 6.5, hw: 7, hl: 1.0, kind: 'dirt', side: 'dirt',
    entry: [-1037.0, 316.8], from: [-1124.0, 257.5], kmh: 80,
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
    entry: [1341, -478], from: [1242, -461], kmh: 100, noTrack: true,
  },
  {
    id: 'hull', text: 17, name: 'Le Tremplin de Chantier',
    where: 'la 148, secteur Hull',
    // The 148 was still being widened in 2004 and the contractor's haul ramp is
    // parked on the north shoulder east of the Casino turnoff. Fifteen metres of
    // trunk road to line it up on, and nothing whatsoever in the way after.
    type: 'ramp', x: 7959.3, z: -4232.4, yaw: 1.3826,
    H: 3.2, run: 7.5, hw: 8, hl: 1.2, kind: 'gravel', side: 'dirt',
    entry: [7839.4, -4255.3], from: [7724.0, -4282.8], kmh: 110,
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

// The beaten track: `path` is a full-power surface with a little rattle in it,
// so the line reads as worn ground and costs you nothing to be on. hw is
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
      id: 'j_' + j.id + 'Track', type: 'ridge', kind: 'path', side: 'path',
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
  minAir: 0.55,        // seconds before a hop counts as a jump at all
  bigAir: 1.6,         // ...and before the board shouts about it
  comboWindow: 6.0,    // seconds after a landing to still be on a chain
  comboMax: 3,         // multiplier ceiling
  perSecond: 7,        // dollars per second of air
  perMetre: 0.20,      // ...per metre of it
  cleanBonus: 6,       // ...for putting it down straight
  nearMissBonus: 3,    // ...per thing you nearly hit on the way over
  // A ramp pays less the third time you hit it inside a minute. The town is not
  // a cash machine and the Ranger is not a rental.
  repeatDecay: [1, 0.6, 0.4, 0.25],
  repeatForget: 60,
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
    this.repeat = new Map();   // jump id -> { n, t }
  }

  /**
   * @param dt   fixed step
   * @param v    the Vehicle, already updated this tick
   * @param ctx  { nearMiss, siteId, steer } — the running near-miss counter,
   *             which ramp we are nearest (for the repeat decay), and the stick
   * @returns    a score record on the tick a flight lands, else null
   */
  update(dt, v, ctx = {}) {
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    for (const [k, r] of this.repeat) {
      r.t -= dt;
      if (r.t <= 0) this.repeat.delete(k);
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
    this.combo = Math.min(this.combo + 1, 99);
    this.comboT = c.comboWindow;
    const mult = Math.min(c.comboMax, 1 + (this.combo - 1) * 0.5);

    // The same ramp over and over pays less each time, for a minute.
    let decay = 1;
    if (ctx.siteId) {
      const r = this.repeat.get(ctx.siteId) || { n: 0, t: 0 };
      decay = c.repeatDecay[Math.min(r.n, c.repeatDecay.length - 1)];
      this.repeat.set(ctx.siteId, { n: r.n + 1, t: c.repeatForget });
    }

    let pay = air * c.perSecond + this.dist * c.perMetre + near * c.nearMissBonus;
    if (grade !== 'crooked') pay += c.cleanBonus;
    else pay *= 0.5;
    pay = Math.max(1, Math.round(pay * mult * decay));

    const rec = {
      air, dist: this.dist, peak: this.peak, entryKmh: this.entryKmh,
      grade, slip, drop, near, combo: this.combo, mult, pay,
      big: air >= c.bigAir,
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

function board() {
  if (typeof document === 'undefined' || !document.getElementById) return null;
  let el = document.getElementById('airboard');
  if (el) return el;
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
  const siteId = near && near.d < SITE_D ? near.jump.id : null;
  const rec = sc.update(dt, v, {
    nearMiss: G.stats ? G.stats.nearMiss || 0 : 0,
    siteId,
    steer: G.input ? G.input.steer : 0,
  });

  if (rec) {
    if (G.wallet) G.wallet.add(rec.pay);
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
  } else if (sc.flying && sc.t > 0.35) {
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
