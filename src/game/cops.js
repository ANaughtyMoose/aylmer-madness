// The police (BACKLOG G4).
//
// 2004 Aylmer has been part of Gatineau since the 2002 merger, so it is the
// Ville de Gatineau police, not the Sûreté and not the old Aylmer force: a white Crown
// Victoria with a blue stripe down the cladding and a light bar on the roof.
// The car is built here rather than in cars.js because you never get to drive
// it and it has no business turning up on the menu.
//
// The wanted meter is 0-3 stars and it fills from the four things a sixteen
// year old actually does:
//
//   running a red over 40 km/h                              +1.00  (a star)
//   ploughing into traffic, >30 km/h closing                +0.90
//   more than three near-misses on the street furniture in 20 s   +0.70
//   sitting over 90 km/h in front of a cruiser              +0.35 / s
//
// One star puts a cruiser on the road ~110 m (of driving) behind you; two
// sends the second one at you from ~120 m up the road ahead, so the chase is
// on screen and not only in the mirror; three parks two more across the road
// at the next set of lights. Lose them —
// nothing within 300 m for twelve seconds — and it bleeds off at 0.22 / s.
// Get boxed in and stopped for four seconds (or, from two stars, stop
// anywhere a cruiser can see you) and it costs you 150 $ and, if you were on
// a job, the job.
//
// Cops are off during a race. Chasing three friends and a cruiser at once is
// not a driving game, it is a headache. A roadblock you have already earned
// stays where it is.
import { MeshBuilder, rgb } from '../core/mesh.js';
import { m4, clamp } from '../core/math.js';
import { pl, buildCarBody, buildWheel, tToZ } from './cars.js';
import { asBody, collideCars, driftBody, contact } from './collide.js';
import { Rival, SKILL, collideRivals } from './race.js';
// Story agent: the megaphone.
import { heckle } from './heckle.js';
// The radio. Sixty written dispatch and cruiser lines (assets/text/ambient.json,
// `police`), tagged by the state they belong to, with a hardcoded handful behind
// them so a build without the copy still gets chased properly.
import { policeLine, line as textLine } from './racingtext.js';
import { sirenLevel, SIREN_NEAR } from '../core/audio.js';

// AUD-02: when a cruiser honks. Within `near` metres and closing faster than
// `closing` m/s; then nothing for gap[0]..gap[1] s. `vol` is the old 0.05 near,
// down with distance by the siren's own law.
export const HONK = { near: 25, closing: 2, gap: [5, 11], hz: [300, 380], dur: [0.25, 0.45], vol: 0.05 };
export function honkCue(d, closing, rnd = Math.random) {
  if (!(d < HONK.near) || !(closing > HONK.closing)) return null;
  return {
    freq: HONK.hz[0] + rnd() * (HONK.hz[1] - HONK.hz[0]),
    dur: HONK.dur[0] + rnd() * (HONK.dur[1] - HONK.dur[0]),
    vol: HONK.vol * sirenLevel(d) / SIREN_NEAR,
    next: HONK.gap[0] + rnd() * (HONK.gap[1] - HONK.gap[0]),
  };
}

// ---------------------------------------------------------------- the car

// A 1998 Crown Victoria, near enough. Same profile grammar as cars.js: `t` runs
// 0 (rear bumper) to 1 (front bumper), y and half-width in metres.
export const CRUISER = {
  id: 'police_cruiser', name: 'Police de Gatineau', who: 'Police', style: 'sedan',
  body: 0xf2f4f6, seats: 3,
  flavour: 'Crown Victoria, moteur 4.6, gyrophare pis un projecteur sur le pilier.',
  len: 5.40, wid: 1.98, h: 1.45, wheelbase: 2.91, overhangF: 1.06, wheelR: 0.36,
  topSpeed: 47.0, accel: 5.0, brake: 9.4, grip: 0.95, steerMax: 0.52, mass: 1780,
  seatY: 1.08, seatZ: 0.06, seatX: 0.44, clearance: 0.22,
  top: [[0, 0.95], [0.02, 1.00], [0.06, 1.03], [0.20, 1.04], [0.25, 1.06], [0.30, 1.19],
        [0.36, 1.34], [0.42, 1.43], [0.48, 1.45], [0.56, 1.45], [0.62, 1.43], [0.68, 1.31],
        [0.74, 1.14], [0.79, 1.05], [0.84, 1.03], [0.92, 0.99], [0.965, 0.92],
        [0.985, 0.84], [1, 0.60]],
  belt: [[0, 0.95], [0.18, 0.99], [0.28, 1.05], [0.66, 1.05], [0.78, 1.02], [1, 1.02]],
  plan: [[0, 0.80], [0.03, 0.90], [0.10, 0.955], [0.82, 0.955], [0.90, 0.93],
         [0.96, 0.88], [1, 0.78]],
  roofK: 0.84, tuck: 0.03,
  glassTop: [[0.30, 0.42], [0.62, 0.755]], glassSide: [0.30, 0.66],
  cladding: { rocker: 0.09, bumper: 0.38, tRear: 0.03, tFront: 0.962, color: 0x17356f },
  hbGrip: 0.44, hbYaw: 1.36,
  sound: { f0: 40, span: 190, sub: 0.5, o2g: 0.5, cut0: 320, cutSpan: 2000, gain: 1.05,
           type1: 'sawtooth', type2: 'square', rattle: 0, rattleFrom: 0 },
  // The 4.6 modular and the AOD-E behind it. Nothing in the audio path reads
  // this — the cruiser is still on the two-oscillator synth above, not the
  // pulse-train one the cars use — but the FEEL block below needs a gearbox of
  // its own to read an rpm off, and leaving it out would have handed a police
  // Crown Victoria the Ranger's five-speed and a 2.3 Lima's shift points.
  // 169 km/h is 2894 rpm in fourth, which is what an overdriven P71 does.
  drive: { gears: [2.84, 1.55, 1.00, 0.70], reverse: 2.32, final: 3.27, tyre: 0.710,
           idle: 600, redline: 5000, limiter: 5100,
           shiftUp: 4600, shiftUpLight: 2300, shiftDown: 1300, launch: 1800, shiftTime: 0.28 },
  // How it drives, in the grammar of the FEEL table in cars.js — declared here
  // and not there because this car is not in CARS at all (you never get to buy
  // it) and because the key `cruiser` in that table is already spoken for by the
  // Schwinn in game/bikes.js, which must stay blank.
  //
  // It is the Crown Vic on the used lot (FEEL.crownvic) with the municipal
  // package on it: the same flat 5.0 torque, the same body-on-frame float, but
  // a quicker box, a firmer bar and tyres somebody bought to be driven on. It
  // still steps out under power — further than the civilian car, because it has
  // more of everything to step out with — it just does not wallow about
  // afterwards. That is the difference you are meant to feel in a chase.
  feel: {
    layout: 'rwd', powerYaw: 0.48, wheelspin: 0.46,
    torque: [[0, 0.84], [0.16, 0.96], [0.34, 1], [1, 1]],
    shiftCut: 0.14, steerRate: 10, rackSpeed: 11, bite: 8.4, wallow: 0.28,
    counterSteer: 0.042,
  },
};
{
  const c = CRUISER;
  c.axleZ = c.wheelbase / 2;
  const rear = c.len - c.wheelbase - c.overhangF;
  const hwAxle = Math.max(pl(c.plan, rear / c.len), pl(c.plan, (rear + c.wheelbase) / c.len));
  // Same rule cars.js uses: the tyre's outer face stands 70 mm proud of the body.
  c.track = Math.round(2 * (hwAxle + 0.07 - 0.20 / 2) * 100) / 100;
}

const barZ = () => tToZ(CRUISER, 0.50);
const barY = () => pl(CRUISER.top, 0.50);

/**
 * Body mesh, plus the two light-bar pods as their own white meshes so the
 * draw-time colour multiplier is the whole lighting model: red on, blue on,
 * both off, at 5 Hz.
 */
export function buildCruiser() {
  const mb = buildCarBody(CRUISER);
  const s = CRUISER;
  const dark = rgb(0x1b1d20);
  const z = (t) => tToZ(s, t);
  const hw = (t) => pl(s.plan, t);
  // Lamps and grille — the shared details in cars.js stop at door handles.
  for (const sx of [1, -1]) {
    mb.box(sx * 0.52, 0.80, z(0.965), 0.46, 0.15, 0.08, rgb(0xfff3c4));
    mb.box(sx * (hw(0.955) - 0.06), 0.79, z(0.952), 0.12, 0.11, 0.08, rgb(0xf0a030));
    mb.box(sx * (hw(0.012) - 0.30), 0.86, z(0) + 0.006, 0.46, 0.20, 0.03, rgb(0xc0332a));
  }
  mb.box(0, 0.86, z(0.972), 0.90, 0.16, 0.06, dark);                 // grille
  mb.box(0, 0.55, z(0.98), 1.30, 0.10, 0.05, dark);                  // bumper slot
  mb.box(0, 0.86, z(0) - 0.004, 0.40, 0.14, 0.03, rgb(0xe8e6dc));    // plate
  // Push bar: two uprights and a rail, the bit that does the ramming.
  for (const sx of [1, -1]) mb.box(sx * 0.62, 0.62, z(1) + 0.05, 0.09, 0.62, 0.09, dark);
  mb.box(0, 0.86, z(1) + 0.05, 1.34, 0.09, 0.09, dark);
  mb.box(0, 0.50, z(1) + 0.05, 1.34, 0.09, 0.09, dark);
  // Light-bar base on the roof, and the spotlight on the A-pillar.
  mb.box(0, barY() + 0.045, barZ(), 1.10, 0.09, 0.24, dark);
  mb.box(0.80, 1.12, z(0.60), 0.16, 0.16, 0.16, rgb(0xd4d6d8));
  // « POLICE » is a dark band on the doors; at 200 m it is a blue car with a
  // white stripe, which is all anybody ever sees of one.
  for (const sx of [1, -1]) {
    mb.box(sx * (hw(0.5) + 0.008), 0.72, z(0.5), 0.012, 0.14, 1.70, rgb(0x17356f));
  }

  const pod = (side) => {
    const b = new MeshBuilder();
    b.box(side * 0.28, barY() + 0.13, barZ(), 0.50, 0.13, 0.20, rgb(0xffffff));
    return b;
  };
  return { body: mb, wheel: buildWheel(CRUISER), podL: pod(1), podR: pod(-1) };
}

/**
 * main.js hook: fold the cruiser into the mesh tables the car renderer already
 * walks, so drawCar('cruiser') just works.
 */
export function installCopMeshes(renderer, meshes) {
  const m = buildCruiser();
  meshes.cars[CRUISER.id] = renderer.upload(m.body);
  meshes.wheels[CRUISER.id] = renderer.upload(m.wheel);
  meshes.copPodL = renderer.upload(m.podL);
  meshes.copPodR = renderer.upload(m.podR);
  return meshes;
}

// ---------------------------------------------------------------- tuning

export const HEAT = {
  red: 1.00,           // ran a red over RED_KMH — one is a star, on its own
  redKmh: 40,
  crash: 0.90,         // hit a traffic car over CRASH_MS closing
  crashMs: 8.33,       // 30 km/h
  props: 0.70,         // more than PROP_N near-misses inside PROP_WINDOW
  propN: 3,
  propWindow: 20,
  speed: 0.35,         // per second over SPEED_KMH within SPEED_D of a cruiser
  speedKmh: 90,
  speedD: 70,
  decay: 0.22,         // per second, once they have lost you
  max: 3.0,
};
export const LOSE_D = 300;      // no cruiser inside this...
export const LOSE_T = 12;       // ...for this long, and they have lost you
export const BUST_T = 4;        // seconds stopped, boxed in, before the ticket
export const BUST_D = 12;       // how close a cruiser has to be to write it
// Panel, 6 Oct 2026 (Max): « you can never be busted ». The cruisers lift off
// inside 12 m so they never ram you, which also meant they almost never sat
// inside BUST_D long enough to write the ticket. From two stars up, stopping
// anywhere a cruiser can see you is giving up: four seconds and it is over.
export const BUST_STARS = 2;    // stars from which stopping in view is a bust
export const BUST_SEEN = 150;   // "in view": a cruiser or roadblock this close
export const BUST_KMH = 6;      // under this, the truck counts as stopped
export const TICKET = 150;      // dollars
// B-07: « Tu les as semés » pays, by the most stars the chase reached. Three
// stars is worth more than the 150 $ ticket, so a clean escape is the clever
// way out, not just the lucky one. Paid through money.js's Wallet.add. Not
// scaled by difficulty (the plan's table is exact). A scripted escape stage
// (verbs.js loseThem) pays through its job instead, so it is not paid twice.
export const ESCAPE_PAY = Object.freeze({ 1: 20, 2: 60, 3: 180 });
/** Dollars for losing a chase that peaked at `stars` (0 for none). */
export function escapePay(stars) {
  const n = Math.max(0, Math.min(3, Math.floor(Number(stars) || 0)));
  return ESCAPE_PAY[n] || 0;
}
export const SPAWN_BACK = 110;  // where a cruiser joins in, metres of road behind you
export const SPAWN_AHEAD = 120; // where the second one comes from, metres of road ahead
// S3-COPS (feel.md finding 3, Tom 20 Oct « police may ram you, lightly »): the
// second unit comes from up the road only while you are under this; any faster
// and a cruiser coming at you is a closing speed of 200 km/h and a blur, so it
// joins in behind, nearer than the first, and both work your mirror and flanks.
export const SPAWN_AHEAD_KMH = 60;
export const SPAWN_BACK2 = 70;  // the second unit, when it comes from behind
// How a cruiser closes. Past `bandFar` metres it runs a little over its own
// cruise (a 90 km/h truck is not simply faster than the police); inside
// `closeD`, once it is on your own line (the breadcrumb trail of where you
// drove), it follows that line instead of the GPS and its speed is a ceiling on
// how fast it may close on you: it sits `shadow` metres off (centre to centre,
// so a car length off your bumper, in the bottom of the chase cam), the second
// one `side` metres out to your left, alongside.
export const CHASE = {
  bandFar: 1.12, floor: 0.65, liftNear: 4, liftFar: 20,
  closeD: 45, onLine: 12, capD: 70, lineEvery: 0.2,
  trailStep: 3, trailN: 70,
  shadow: [7.5, 6.5], side: 2.4, hold: 6.5,
};
// The rams, light: from `stars` up a unit that is due comes in at `close` m/s
// closing; the shove on the truck is held to `maxDv` m/s of velocity change and
// the damage to a `maxClosing` impact (knockDamage(4.8) is 2.7, under 3 at the
// default damage setting); then nothing from that unit for gap[0]..gap[1] s.
// Never at a truck under `slowMs` (that one gets boxed in and written up, not
// pushed into a wall). At `pitStars` the alongside unit aims for your rear
// quarter instead and may leave `pitSpin` rad/s of yaw: a nudge, not a spin-out.
export const BUMP = {
  stars: 2, close: 3.5, maxClosing: 4.8, maxDv: 2.6, gap: [10, 15], first: [3, 6],
  spin: 0.15, pitStars: 3, pitSpin: 0.9, pitSide: 1.3, slowMs: 3, backT: 0.8, log: 40,
};
// Review 5 Oct 2026: at three stars the HUD said « chasing » and no cruiser was
// ever in a shot. The units spawned where the player had been (a heat set, a
// tow, a teleport) and drove at him from kilometres away, or spawned « 150 m
// behind » as the crow flies on whatever street was there, and the chase cam
// only ever looks forward. A player who moves this far in one tick has been
// moved, not driven, and the units are sent again from where he is now.
export const JUMP_D = 120;
export const RETARGET = 1.5;    // seconds between re-plans, per cruiser
export const MAX_UNITS = 2;     // driving cruisers; the third star is the roadblock
export const BLOCK_MIN = 70, BLOCK_MAX = 420;   // roadblock hunt range
// Heat at which somebody says something before anybody has been dispatched, and
// how long before they will say it again.
export const WARN_AT = 0.45, WARN_AGAIN = 22;

// ---------------------------------------------------------------- the force

export class Cops {
  constructor() {
    this.reset();
  }

  reset() {
    this.heat = 0;
    this.stars = 0;
    this.units = [];
    this.blocks = [];
    this.unseen = 0;
    this.stopT = 0;
    this.warnT = 0;             // seconds before the next "smarten up" line
    this.sirenOn = false;
    this.honkT = 0;
    this.prevUnitM = NaN;       // AUD-02: last nearest-cruiser distance, for honkCue
    this.blink = 0;
    this.busted = false;
    this.chasing = false;       // has anyone actually turned up this time?
    this.peak = 0;              // B-07: most stars this chase reached (the escape pay)
    this.lastEscape = null;     // B-07: { stars, pay } of the last escape, for the harness
    this._propBase = null;
    this._propT = 0;
    this._lastStars = 0;
    this._px = null; this._pz = null;   // where the player was last tick
    this.sirenT = 0;
    this.trail = [];            // S3-COPS: where the truck drove, oldest first
    this.bumpLog = [];          // S3-COPS: every cruiser contact { t, unit, closing, dmg, by, pit }
    this.clock = 0;
  }

  get wanted() { return this.stars; }

  /** Add heat, clamped, and remember what for (the toast reads it). */
  add(amount, why) {
    if (amount <= 0) return this.heat;
    this.heat = clamp(this.heat + amount, 0, HEAT.max);
    this.why = why || this.why;
    return this.heat;
  }

  clear() {
    this.heat = 0;
    this.stars = 0;
    this.units.length = 0;
    this.blocks.length = 0;
    this.unseen = 0;
    this.stopT = 0;
    this.chasing = false;
    this.peak = 0;
    this.trail.length = 0;
  }

  // ---- accrual ---------------------------------------------------------

  _accrue(dt, G) {
    const v = G.veh;
    if (G.ranRed) {
      G.ranRed = false;
      if (v.speedKmh > HEAT.redKmh) this.add(HEAT.red, 'un feu rouge');
    }
    const crash = G.traffic ? (G.traffic.crash || 0) : 0;
    if (crash > HEAT.crashMs) this.add(HEAT.crash, 'un accrochage');

    // The street-furniture counter belongs to the props/peds agent; read it if
    // it is there and say nothing if it is not.
    const n = G.stats && (G.stats.nearMiss ?? G.stats.nearHits);
    if (typeof n === 'number') {
      if (this._propBase == null) { this._propBase = n; this._propT = 0; }
      this._propT += dt;
      if (n - this._propBase > HEAT.propN) {
        this.add(HEAT.props, 'de la conduite dangereuse');
        this._propBase = n; this._propT = 0;
      } else if (this._propT > HEAT.propWindow) {
        this._propBase = n; this._propT = 0;
      }
    }

    if (v.speedKmh > HEAT.speedKmh) {
      for (const u of this.units) {
        if (Math.hypot(u.x - v.x, u.z - v.z) < HEAT.speedD) {
          this.add(HEAT.speed * dt, 'de la vitesse');
          break;
        }
      }
    }

    // The word before the star. Between WARN_AT and one full star nobody has
    // been dispatched yet, and that is exactly the window where a constable
    // leans out and tells you to smarten up — once every WARN_AGAIN seconds, so
    // it stays a warning and does not become a nag.
    this.warnT = Math.max(0, this.warnT - dt);
    if (this.heat > WARN_AT && this.heat < 1 && !this.warnT && G.hud) {
      this.warnT = WARN_AGAIN;
      const said = textLine(policeLine('warning'));
      if (said) G.hud.toast('« ' + said + ' »', 2800);
    }
    if (this.heat <= 0.02) this.warnT = 0;
  }

  // ---- units -----------------------------------------------------------

  /**
   * A node of the road graph about `want` metres of DRIVING short of the
   * player, on the side of him `side` says (-1 behind, +1 ahead of where he is
   * pointed), facing the way it would drive to reach him. The walk runs the
   * edges backwards, so a one-way street or a divided road never puts a
   * cruiser on the carriageway that leads away from him; and it returns a
   * graph node, not a point between two, so the GPS route the unit is handed
   * starts where it is standing instead of at the nearest node of some other
   * street. Null if nothing on the graph is that far.
   */
  roadPoint(G, want, side) {
    const v = G.veh, nav = G.nav;
    const s = nav && nav.nearest ? nav.nearest(v.x, v.z) : null;
    if (!s || !nav.nodes) return null;
    if (!nav._into) {
      // Every edge, filed under the node it arrives at. Built once per Nav.
      nav._into = nav.nodes.map(() => []);
      for (const n of nav.nodes) for (const e of n.edges) nav._into[e.to.i].push({ from: n, len: e.len, cls: e.cls });
    }
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const d0 = Math.hypot(s.x - v.x, s.z - v.z);
    const dist = new Map([[s.i, d0]]);
    const open = [[d0, s, null, '']];
    const lo = want * 0.6, hi = want * 1.4;
    let best = null, bestScore = -Infinity, guard = 0;
    while (open.length && guard++ < 6000) {
      let k = 0;
      for (let j = 1; j < open.length; j++) if (open[j][0] < open[k][0]) k = j;
      const [d, n, next, cls] = open.splice(k, 1)[0];
      if (d > (dist.get(n.i) ?? Infinity)) continue;
      if (next && d >= lo) {
        const r = Math.hypot(n.x - v.x, n.z - v.z) || 1;
        // Which side of him first; then the straighter the run in, the nearer
        // to `want`, and a real street over a parking aisle.
        const score = side * ((n.x - v.x) * fx + (n.z - v.z) * fz) / r
          + 0.5 * r / want - Math.abs(d - want) / want - (cls === 'service' ? 0.8 : 0);
        if (score > bestScore) { bestScore = score; best = { x: n.x, z: n.z, yaw: Math.atan2(next.x - n.x, next.z - n.z) }; }
      }
      if (d >= hi) continue;
      for (const e of nav._into[n.i]) {
        const m = e.from, nd = d + e.len;
        if (nd < (dist.get(m.i) ?? Infinity)) { dist.set(m.i, nd); open.push([nd, m, n, e.cls]); }
      }
    }
    return best;
  }

  // Unit 0 comes up behind you, so it arrives in the mirror; unit 1 comes at
  // you from up the road, so you see it through the windscreen.
  spawnPoint(G, i = this.units.length) {
    const v = G.veh;
    // S3-COPS: from up the road only while the truck is slow (SPAWN_AHEAD_KMH).
    const side = i % 2 && Math.abs(v.speedKmh || 0) < SPAWN_AHEAD_KMH ? 1 : -1;
    const p = this.roadPoint(G, side > 0 ? SPAWN_AHEAD : i % 2 ? SPAWN_BACK2 : SPAWN_BACK, side);
    if (p) return p;
    const bx = v.x + side * Math.sin(v.yaw) * SPAWN_BACK;
    const bz = v.z + side * Math.cos(v.yaw) * SPAWN_BACK;
    const n = G.nav ? G.nav.nearest(bx, bz) : null;
    const q = n || { x: bx, z: bz };
    return { x: q.x, z: q.z, yaw: Math.atan2(v.x - q.x, v.z - q.z) };
  }

  // Put unit `u` (the i-th) back on the road near the player and re-plan now.
  _dispatch(G, u, i) {
    const p = this.spawnPoint(G, i);
    u.place(p.x, p.z, p.yaw);
    u.active = true;
    u.routeT = 0.2 * i;
  }

  spawn(G) {
    const i = this.units.length;
    const p = this.spawnPoint(G, i);
    const u = new Rival(CRUISER, {
      id: 'cop' + i, name: 'Police', skill: SKILL.cop, phys: G.phys,
    });
    u.place(p.x, p.z, p.yaw);
    u.active = true;
    u.routeT = 0.2 * this.units.length;
    u.ctx = { traffic: null, band: 1, cap: null };
    u.bumpT = BUMP.first[0] + Math.random() * (BUMP.first[1] - BUMP.first[0]);
    u.lineT = 0; u.backT = 0; u.onLine = false;
    this.units.push(u);
    this.chasing = true;
    return u;
  }

  // Two cruisers side by side across the road at the next set of lights. The
  // candidate has to be genuinely straight ahead (not the lights on the cross
  // street 200 m off your shoulder) and both cars have to land on tarmac, or
  // the barricade is two Crown Vics parked in somebody's front lawn.
  roadblock(G) {
    if (this.blocks.length || !G.signals || !G.signals.list) return false;
    const v = G.veh;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const rx = -fz, rz = fx;                                     // across the road
    const onRoad = (G.phys && G.phys.roadAt) ? G.phys.roadAt : null;
    const near = [];
    for (const s of G.signals.list) {
      const dx = s.x - v.x, dz = s.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d < BLOCK_MIN || d > BLOCK_MAX) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.90) continue;       // straight ahead
      near.push([d, s]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, s] of near) {
      const back = (s.ext || 12) + 7;
      const cx = s.x - fx * back, cz = s.z - fz * back;
      // `y` because the barricade is parked, not driven: nothing steps these
      // two, so the height of the road under them is sampled once, here, or
      // they sit at sea level under the hill the lights are on.
      const gy = (G.phys && G.phys.groundY) ? G.phys.groundY : null;
      const spots = [-1, 1].map((side) => ({
        x: cx + rx * side * 2.3, z: cz + rz * side * 2.3,
        yaw: Math.atan2(rx, rz), spin: 0,
        y: gy ? gy(cx + rx * side * 2.3, cz + rz * side * 2.3) : 0,
      }));
      if (onRoad && !spots.every((q) => onRoad(q.x, q.z))) continue;
      for (const q of spots) { asBody(q, CRUISER); this.blocks.push(q); }
      return true;
    }
    return false;
  }

  // ---- the tick --------------------------------------------------------

  update(dt, G) {
    const v = G.veh;
    if (!v) return null;
    this.blink += dt;
    this.clock += dt;
    const racing = !!(G.mission && G.mission.def && G.mission.def.race);
    // PLAN « Playable characters »: Zahra is fifteen, on a bicycle, and « no
    // police interest whatsoever ». A two-wheeler accrues nothing, and anything
    // already following you loses interest the moment you are on one — a
    // constable who would not chase a bike would not keep chasing one either.
    if (G.veh.spec && G.veh.spec.twoWheel) {
      if (this.heat || this.units.length || this.blocks.length) this.clear();
      this._lastStars = 0;
      return null;
    }

    if (!racing) this._accrue(dt, G);
    else G.ranRed = false;

    // Moved, not driven (a teleport, a tow, a free reset, a loaded save): send
    // the units again from where the player is now, and take down a roadblock
    // that is guarding a street he is no longer on.
    if (this._px != null && Math.hypot(v.x - this._px, v.z - this._pz) > JUMP_D) {
      this.units.forEach((u, i) => this._dispatch(G, u, i));
      this.blocks.length = 0;
      this.trail.length = 0;
    }
    this._px = v.x; this._pz = v.z;
    this._track(v);

    const stars = clamp(Math.floor(this.heat), 0, 3);
    if (stars > this._lastStars) heckle.say('Police', 'cop');
    if (stars > this._lastStars && G.hud) {
      // The star toast says what is happening; the radio underneath it says it
      // the way a bored constable on the 42 would. `spotted` at one star, and
      // `pursuit` once they have decided you are not stopping.
      const radio = textLine(policeLine(stars === 1 ? 'spotted' : 'pursuit'));
      G.hud.toast((stars === 1
        ? 'UNE AUTO-PATROUILLE\nÇa commence, ' + (this.why || 'ça') + '.'
        : stars === 2 ? 'DEUX AUTOS-PATROUILLES\nIls se parlent à radio, là.'
          : 'TROIS ÉTOILES\nY ont bloqué la rue en avant.')
        + (radio ? '\n« ' + radio + ' »' : ''), 2600);
    }
    this._lastStars = stars;
    this.stars = stars;
    if (stars > this.peak) this.peak = stars;

    // Spawn / despawn to match the stars. Nothing new turns up during a race.
    const want = racing ? Math.min(this.units.length, MAX_UNITS) : Math.min(stars, MAX_UNITS);
    while (this.units.length > want) this.units.pop();
    if (!racing) {
      while (this.units.length < want) this.spawn(G);
      if (stars >= 3) this.roadblock(G);
    }
    if (stars <= 0 && this.blocks.length) this.blocks.length = 0;

    // Drive them.
    const traffic = G.traffic ? G.traffic.cars : null;
    let nearest = Infinity, nearestUnit = Infinity;
    const vpx = v.vx || 0, vpz = v.vz || 0, vp = Math.hypot(vpx, vpz);
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      // S3-COPS: on your own line inside CHASE.closeD (and behind you), the
      // cruiser drives the trail you left, not the GPS; off it, the GPS.
      const du0 = Math.hypot(u.x - v.x, u.z - v.z);
      const behind = (u.x - v.x) * Math.sin(v.yaw) + (u.z - v.z) * Math.cos(v.yaw) < 2;
      const k = du0 < CHASE.closeD && behind ? this._trailNear(u) : -1;
      if (k >= 0) {
        u.lineT -= dt;
        if (!u.onLine || u.lineT <= 0) { u.lineT = CHASE.lineEvery; this._linePath(u, i, v, k, stars); }
        u.onLine = true;
      } else if (u.onLine) { u.onLine = false; u.routeT = 0; }
      u.routeT -= dt;
      if (!u.onLine && u.routeT <= 0 && G.nav) {
        u.routeT = RETARGET;
        const path = G.nav.route(u.x, u.z, v.x, v.z);
        // Off the road (a lawn, a yard, nose in a porch) the route's last leg
        // is a straight line to the truck, and it goes through whatever house
        // is in the way: the review pack's three-star cruisers sat wedged
        // behind a wall, out of every shot. End it at the kerb instead, where
        // the cruiser stays on the street and in view.
        if (path && path.length > 2 && G.phys && G.phys.roadAt && !G.phys.roadAt(v.x, v.z)) {
          const kerb = G.world && G.world.nearestRoad ? G.world.nearestRoad(v.x, v.z) : null;
          if (kerb && Number.isFinite(kerb.x) && kerb.dist < 40) path[path.length - 1] = [kerb.x, kerb.z];
          else path.pop();
        }
        if (path && path.length > 1) u.setPath(path);
      }
      u.ctx.traffic = traffic;
      // Lift on the way in. S3-COPS: a little over cruise past 60 m, full
      // cruise down to CHASE.liftFar, CHASE.floor at liftNear (was a third of
      // it inside 12 m, which kept every cruiser out of the shot). What stops
      // the head-on is the closing ceiling below, not a lift.
      const du = du0;
      u.ctx.band = du > 60 ? CHASE.bandFar
        : du > CHASE.liftFar ? 1 + (CHASE.bandFar - 1) * (du - CHASE.liftFar) / (60 - CHASE.liftFar)
          : clamp(CHASE.floor + (1 - CHASE.floor) * (du - CHASE.liftNear) / (CHASE.liftFar - CHASE.liftNear), CHASE.floor, 1);
      u.bumpT -= dt; u.backT -= dt;
      const ready = this._ready(u, stars, vp);
      u.ctx.cap = this._cap(u, i, v, du, vp, ready);
      // A cruiser holding station on purpose is not stuck (race.js would hop it up the road).
      if (u.ctx.cap != null && u.ctx.cap < 2) u.stuckT = 0;
      u.finished = false;                       // a cruiser is never done
      u.update(dt, G.phys, u.ctx);
      this._contact(G, v, u, i, stars, ready);
      if (G.traffic && G.traffic.collideBody) G.traffic.collideBody(u.veh);
      for (let j = i + 1; j < this.units.length; j++) collideRivals(u.veh, this.units[j].veh);
      const dn = Math.hypot(u.x - v.x, u.z - v.z);
      nearest = Math.min(nearest, dn);
      nearestUnit = Math.min(nearestUnit, dn);
    }

    // The roadblock is two parked cars with the handbrake on: shove them and
    // they stay shoved, exactly like the friends' cars in main.js.
    for (const b of this.blocks) {
      driftBody(b, dt, 4.0, 3.6);
      const closing = collideCars(v, b, 0.22, 0.70);
      if (closing > 0) {
        v.hit(closing, contact.nx, contact.nz);
        v.syncFrame();
        if (G.audio) G.audio.crash(Math.min(1, closing / 18));
      }
      nearest = Math.min(nearest, Math.hypot(b.x - v.x, b.z - v.z));
    }

    // Siren and the odd blast of the horn.
    const on = this.units.length > 0;
    // Said again once a second while it is on: audio.siren() is a no-op until
    // the AudioContext exists, and a chase that started before the first key
    // press used to latch sirenOn and stay silent for good. A repeat call on a
    // running siren only re-sets its gain.
    // AUD-01: the siren's level follows the nearest driving cruiser (the
    // roadblock has no siren). Told every frame, before any rebuild below.
    if (G.audio && G.audio.sirenRange) G.audio.sirenRange(nearestUnit);
    this.sirenT = (this.sirenT || 0) - dt;
    if (on !== this.sirenOn || (on && this.sirenT <= 0)) {
      this.sirenOn = on;
      this.sirenT = 1;
      if (G.audio && G.audio.siren) G.audio.siren(on);
    }
    // AUD-02: the horn is an event, not a metronome (it was every 2.6 s at one
    // pitch while anything was within 40 m). Now only a driving cruiser that is
    // close and closing on you leans on it, never twice within HONK.gap[0] s,
    // pitch and length vary, and the level follows the siren's distance law.
    const closingU = Number.isFinite(this.prevUnitM) && Number.isFinite(nearestUnit) && dt > 0
      ? (this.prevUnitM - nearestUnit) / dt : 0;
    this.prevUnitM = nearestUnit;
    this.honkT -= dt;
    if (on && this.honkT <= 0) {
      const h = honkCue(nearestUnit, closingU);
      if (h) { this.honkT = h.next; if (G.audio) G.audio.honk(h.freq, h.dur, h.vol); }
    }

    // Busted: stopped for four seconds with one of them right there (boxed
    // in), or, from two stars, with one of them anywhere in view.
    let out = null;
    const law = this.units.length || this.blocks.length;
    const reach = !racing && stars >= BUST_STARS ? BUST_SEEN : BUST_D;
    if (law && nearest < reach && Math.abs(v.speedKmh) < BUST_KMH) {
      this.stopT += dt;
      if (G.hud) G.hud.prompt(`Décrisse ! ${Math.max(1, Math.ceil(BUST_T - this.stopT))}`);
      if (this.stopT >= BUST_T) out = this.bust(G);
    } else {
      if (this.stopT > 0 && G.hud) G.hud.prompt(null);
      this.stopT = 0;
    }

    // Lost them?
    if (!this.units.length || nearest > LOSE_D) this.unseen += dt;
    else this.unseen = 0;
    if (this.unseen > LOSE_T && this.heat > 0) {
      this.heat = Math.max(0, this.heat - HEAT.decay * dt);
      if (this.heat < 0.02) {
        this.heat = 0;
        // The units thin out as the stars drop, so "did anybody ever turn up"
        // is its own flag rather than "is anybody still here".
        if (this.chasing) out = this.escaped(G);
        this.chasing = false;
        this.peak = 0;
        this.units.length = 0;
        this.blocks.length = 0;
        if (this.sirenOn && G.audio && G.audio.siren) { G.audio.siren(false); this.sirenOn = false; }
      }
    }
    if (G.hud && G.hud.setStars) G.hud.setStars(this.stars);
    return out;
  }

  // ---- S3-COPS: the chase has a body ------------------------------------

  /** Breadcrumb the truck's line every CHASE.trailStep metres. */
  _track(v) {
    const T = this.trail, last = T[T.length - 1];
    if (!last || Math.hypot(v.x - last[0], v.z - last[1]) >= CHASE.trailStep) {
      T.push([v.x, v.z]);
      if (T.length > CHASE.trailN) T.shift();
    }
  }

  /** Index of the trail point nearest the cruiser, or -1 if it is not on your line. */
  _trailNear(u) {
    const T = this.trail;
    if (!this.units.length || T.length < 2) return -1;
    let k = -1, bd = CHASE.onLine;
    for (let j = 0; j < T.length; j++) {
      const d = Math.hypot(T[j][0] - u.x, T[j][1] - u.z);
      if (d < bd) { bd = d; k = j; }
    }
    return k;
  }

  /** How far out to your left this unit runs: alongside, or at your rear quarter for a PIT. */
  _side(u, i, stars) {
    if (!(i % 2)) return 0;
    return stars >= BUMP.pitStars && u.bumpT <= 0 ? BUMP.pitSide : CHASE.side;
  }

  /** The trail from the cruiser up to the truck, then on past it along its nose. */
  _linePath(u, i, v, k, stars) {
    const T = this.trail, pts = [[u.x, u.z]];
    for (let j = k + 1; j < T.length; j++) pts.push(T[j]);
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);   // the driver's left
    const off = this._side(u, i, stars);
    const ext = 12 + Math.hypot(v.vx || 0, v.vz || 0) * 1.2;
    pts.push([v.x + lx * off * 0.6, v.z + lz * off * 0.6]);
    pts.push([v.x + fx * ext + lx * off, v.z + fz * ext + lz * off]);
    u.setPath(pts);
  }

  /** Is this unit due a bump? */
  _ready(u, stars, vp) {
    return stars >= BUMP.stars && u.bumpT <= 0 && u.backT <= 0 && vp > BUMP.slowMs;
  }

  /**
   * The ceiling on the cruiser's speed (m/s), so its closing speed on the truck
   * is what this unit wants: hold station, or come in for the bump. Null when
   * it is far enough off to just drive. The closing speed along n (cruiser to
   * truck) is s * (h . n) - (truck velocity . n); solve for s.
   */
  _cap(u, i, v, du, vp, ready) {
    if (du > CHASE.capD) return null;
    const nx = (v.x - u.x) / (du || 1), nz = (v.z - u.z) / (du || 1);
    const hn = Math.sin(u.yaw) * nx + Math.cos(u.yaw) * nz;
    const vpn = (v.vx || 0) * nx + (v.vz || 0) * nz;
    const shadow = CHASE.shadow[i % 2];
    let want;
    if (vp < BUMP.slowMs) want = (du - CHASE.hold) * 0.6;           // never a pin: roll up and stop
    else if (u.backT > 0) want = -3;                                 // just touched: back off
    else if (ready) want = BUMP.close + Math.max(0, du - shadow) * 0.6;
    else want = (du - shadow) * 0.7;
    // In front of the truck and facing it: no station to keep, it waits in the
    // road (a cruiser closing at your speed plus its own is the head-on).
    const ahead = (u.x - v.x) * Math.sin(v.yaw) + (u.z - v.z) * Math.cos(v.yaw) > 2;
    if (ahead && hn > 0.3) want = Math.min(want, 1);
    want = clamp(want, -4, 30);
    return Math.max(0, (want + vpn) / Math.max(hn, 0.35));
  }

  /**
   * Cruiser against truck. If you drove into it, it is an ordinary crash. If it
   * came into you, the shove is held to BUMP.maxDv and the yaw it leaves to
   * BUMP.spin (BUMP.pitSpin for the alongside unit at three stars), and only a
   * unit that was due a bump costs damage, at most a BUMP.maxClosing impact.
   */
  _contact(G, v, u, i, stars, ready) {
    const c = u.veh;
    const pvx = v.vx, pvz = v.vz, pspin = v.yawSpin || 0;
    const cvx = c.vx, cvz = c.vz;
    const closing = collideCars(v, c);
    if (closing <= 0) return 0;
    const nx = contact.nx, nz = contact.nz;          // from the cruiser toward the truck
    const fresh = u.backT <= 0;                       // first frame of this contact (for the log)
    const copPush = Math.max(0, cvx * nx + cvz * nz);
    const youPush = Math.max(0, -(pvx * nx + pvz * nz));
    let dmg = 0, by = 'cop', pit = false;
    if (youPush > copPush) {
      by = 'you';
      dmg = v.hit(closing, nx, nz); v.syncFrame();
      if (c.hit) { c.hit(closing, -nx, -nz); c.syncFrame(); }
      if (G.audio && closing > 0.9) G.audio.crash(Math.min(1, closing / 18));
      u.backT = Math.max(u.backT, BUMP.backT);
    } else {
      const dvx = v.vx - pvx, dvz = v.vz - pvz, dv = Math.hypot(dvx, dvz);
      if (dv > BUMP.maxDv) { const k = BUMP.maxDv / dv; v.vx = pvx + dvx * k; v.vz = pvz + dvz * k; }
      pit = ready && !!(i % 2) && stars >= BUMP.pitStars;
      const sc = pit ? BUMP.pitSpin : BUMP.spin;
      v.yawSpin = pspin + clamp((v.yawSpin || 0) - pspin, -sc, sc);
      v.syncFrame(); c.syncFrame();
      if (!ready || closing < 3 / 3.6) {
        // Not its turn (or only a touch): no damage, and it drops back.
        by = 'touch'; pit = false;
        u.backT = Math.max(u.backT, BUMP.backT);
      } else {
        dmg = v.hit(Math.min(closing, BUMP.maxClosing), nx, nz);
        u.bumpT = BUMP.gap[0] + Math.random() * (BUMP.gap[1] - BUMP.gap[0]);
        u.backT = BUMP.backT;
        if (G.audio) G.audio.crash(Math.min(1, Math.min(closing, BUMP.maxClosing) / 18));
      }
    }
    const L = this.bumpLog;
    if (by !== 'cop' && !fresh) return closing;
    L.push({ t: +this.clock.toFixed(1), unit: i, closing: +closing.toFixed(2), dmg: +dmg.toFixed(2), by, pit, stars });
    if (L.length > BUMP.log) L.shift();
    return closing;
  }

  /**
   * B-07: they lost you. Pays escapePay(peak) into G.wallet (Wallet.add), says
   * so on the toast and leaves { stars, pay } on this.lastEscape. A scripted
   * escape stage (the job is the reward) pays 0. Returns 'escaped'.
   */
  escaped(G) {
    const st = G.mission && G.mission.stages ? G.mission.stages[G.mission.idx] : null;
    const scripted = !!(st && st.kind === 'escape');
    const stars = Math.max(0, Math.min(3, this.peak | 0));
    const pay = scripted ? 0 : escapePay(stars);
    if (pay > 0 && G.wallet && G.wallet.add) G.wallet.add(pay);
    this.lastEscape = { stars, pay };
    if (G.hud && G.hud.toast) {
      const radio = textLine(policeLine('lost'));
      G.hud.toast('Tu les as semés.' + (pay > 0 ? ` +${pay} $` : '') + '\nRoule normal deux minutes.'
        + (radio ? '\n« ' + radio + ' »' : ''), 2400);
    }
    this.peak = 0;
    return 'escaped';
  }

  // 150 $ and, if you were working, the job.
  bust(G) {
    this.busted = true;
    // Easy 40, normal 75, hard 120 (calendar.js DIFF); the constant is the
    // pre-calendar value and what the node suites still see.
    const TICKET = G.ticket || 150;
    if (G.wallet) {
      const paid = Math.min(TICKET, G.wallet.value);
      G.wallet.spend(paid);
      if (G.hud) {
        // A ticket is the only time the constable is standing at your window, so
        // it is the only time a `caught` line gets said instead of broadcast.
        const said = textLine(policeLine('caught'));
        G.hud.toast(paid < TICKET
          ? `Ticket: ${TICKET} $\nT’avais ${Math.round(paid)} $. Le reste, tes parents vont l’apprendre.`
          : `Ticket: ${TICKET} $\n« ${said || 'Tu diras à ton père de m’appeler.'} »`, 3400);
      }
    } else if (G.hud) {
      G.hud.toast(`Ticket: ${TICKET} $`, 3200);
    }
    if (G.audio) { G.audio.chime(false); if (G.audio.siren) G.audio.siren(false); }
    this.clear();
    this.sirenOn = false;
    if (G.hud) G.hud.prompt(null);
    if (G.hud && G.hud.setStars) G.hud.setStars(0);
    if (G.mission && G.failMission) G.failMission('Ramassé par la police de Gatineau.');
    return 'busted';
  }

  // ---- drawing ---------------------------------------------------------

  /** Every cruiser body, then the light bars on top. `drawCar` is main.js's. */
  draw(G, drawCar) {
    if (!this.units.length && !this.blocks.length) return;
    const v = G.veh;
    for (const u of this.units) {
      if (Math.hypot(u.x - v.x, u.z - v.z) > 400) continue;
      const c = u.veh;
      drawCar(CRUISER, c.x, c.z, c.yaw, c.pitch, c.roll, c.spin, c.steer, null, 1, c.y, c.gh);
    }
    for (const b of this.blocks) {
      if (Math.hypot(b.x - v.x, b.z - v.z) > 400) continue;
      drawCar(CRUISER, b.x, b.z, b.yaw, 0, 0, 0, 0, null, 1, b.y || 0, b.y || 0);
    }
    const r = G.renderer, mesh = G.meshes;
    if (!r || !mesh || !mesh.copPodL) return;
    // 5 Hz alternation, red then blue, both unlit so they read at any hour.
    const red = (this.blink * 5) % 2 < 1;
    for (const list of [this.units, this.blocks]) {
      for (const u of list) {
        const x = u.x, z = u.z, yaw = u.yaw;
        if (Math.hypot(x - v.x, z - v.z) > 400) continue;
        m4.compose(MM, x, u.veh ? u.veh.y : (u.y || 0), z, yaw, 0, 0);
        r.draw(mesh.copPodL, MM, red ? OPT_RED : OPT_DIM);
        r.draw(mesh.copPodR, MM, red ? OPT_DIM : OPT_BLUE);
      }
    }
  }

  /** Minimap / big map dots. */
  dots() { return this.units; }
}

const MM = m4.create();
const OPT_RED = { unlit: true, colorMul: new Float32Array([1, 0.12, 0.10]) };
const OPT_BLUE = { unlit: true, colorMul: new Float32Array([0.18, 0.34, 1]) };
const OPT_DIM = { unlit: true, colorMul: new Float32Array([0.16, 0.16, 0.18]) };
