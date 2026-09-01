// The police (BACKLOG G4).
//
// 2004 Aylmer is policed by the municipality, not the Sûreté: a white Crown
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
// One star puts a cruiser on the graph ~150 m behind you; two puts two there;
// three parks two more across the road at the next set of lights. Lose them —
// nothing within 300 m for twelve seconds — and it bleeds off at 0.22 / s.
// Get boxed in and stopped for four seconds and it costs you 150 $ and,
// if you were on a job, the job.
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

// ---------------------------------------------------------------- the car

// A 1998 Crown Victoria, near enough. Same profile grammar as cars.js: `t` runs
// 0 (rear bumper) to 1 (front bumper), y and half-width in metres.
export const CRUISER = {
  id: 'cruiser', name: 'Police d’Aylmer', who: 'Police', style: 'sedan',
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
export const TICKET = 150;      // dollars
export const SPAWN_BACK = 150;  // where a cruiser joins in, metres behind you
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
    this.blink = 0;
    this.busted = false;
    this.chasing = false;       // has anyone actually turned up this time?
    this._propBase = null;
    this._propT = 0;
    this._lastStars = 0;
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

  // A road node ~150 m behind the player, so they arrive in the mirror.
  spawnPoint(G) {
    const v = G.veh;
    const bx = v.x - Math.sin(v.yaw) * SPAWN_BACK;
    const bz = v.z - Math.cos(v.yaw) * SPAWN_BACK;
    if (!G.nav) return { x: bx, z: bz };
    const n = G.nav.nearest(bx, bz);
    return n ? { x: n.x, z: n.z } : { x: bx, z: bz };
  }

  spawn(G) {
    const p = this.spawnPoint(G);
    const v = G.veh;
    const u = new Rival(CRUISER, { id: 'cop' + this.units.length, name: 'Police', skill: SKILL.cop });
    u.place(p.x, p.z, Math.atan2(v.x - p.x, v.z - p.z));
    u.active = true;
    u.routeT = 0.2 * this.units.length;
    u.ctx = { traffic: null, band: 1 };
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
      const spots = [-1, 1].map((side) => ({
        x: cx + rx * side * 2.3, z: cz + rz * side * 2.3,
        yaw: Math.atan2(rx, rz), spin: 0,
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
    const racing = !!(G.mission && G.mission.def && G.mission.def.race);

    if (!racing) this._accrue(dt, G);
    else G.ranRed = false;

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
    let nearest = Infinity;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      u.routeT -= dt;
      if (u.routeT <= 0 && G.nav) {
        u.routeT = RETARGET;
        const path = G.nav.route(u.x, u.z, v.x, v.z);
        if (path && path.length > 1) u.setPath(path);
      }
      u.ctx.traffic = traffic;
      u.ctx.band = 1;
      u.finished = false;                       // a cruiser is never done
      u.update(dt, G.phys, u.ctx);
      collideRivals(v, u.veh);
      if (G.traffic && G.traffic.collideBody) G.traffic.collideBody(u.veh);
      for (let j = i + 1; j < this.units.length; j++) collideRivals(u.veh, this.units[j].veh);
      nearest = Math.min(nearest, Math.hypot(u.x - v.x, u.z - v.z));
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
    if (on !== this.sirenOn) {
      this.sirenOn = on;
      if (G.audio && G.audio.siren) G.audio.siren(on);
    }
    if (on && nearest < 40) {
      this.honkT -= dt;
      if (this.honkT <= 0) { this.honkT = 2.6; if (G.audio) G.audio.honk(340, 0.35, 0.05); }
    }

    // Busted: stopped, with one of them right there, for four seconds.
    let out = null;
    if (this.units.length && nearest < BUST_D && v.speedKmh < 6) {
      this.stopT += dt;
      if (G.hud) {
        G.hud.prompt(`Décrisse — ${Math.ceil(BUST_T - this.stopT)}`);
      }
      if (this.stopT >= BUST_T) out = this.bust(G);
    } else this.stopT = 0;

    // Lost them?
    if (!this.units.length || nearest > LOSE_D) this.unseen += dt;
    else this.unseen = 0;
    if (this.unseen > LOSE_T && this.heat > 0) {
      this.heat = Math.max(0, this.heat - HEAT.decay * dt);
      if (this.heat < 0.02) {
        this.heat = 0;
        // The units thin out as the stars drop, so "did anybody ever turn up"
        // is its own flag rather than "is anybody still here".
        if (this.chasing && G.hud) {
          const radio = textLine(policeLine('lost'));
          G.hud.toast('Tu les as semés.\nRoule normal deux minutes.'
            + (radio ? '\n« ' + radio + ' »' : ''), 2400);
        }
        this.chasing = false;
        this.units.length = 0;
        this.blocks.length = 0;
        if (this.sirenOn && G.audio && G.audio.siren) { G.audio.siren(false); this.sirenOn = false; }
      }
    }
    if (G.hud && G.hud.setStars) G.hud.setStars(this.stars);
    return out;
  }

  // 150 $ and, if you were working, the job.
  bust(G) {
    this.busted = true;
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
    if (G.mission && G.failMission) G.failMission('Ramassé par la police d’Aylmer.');
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
      drawCar(CRUISER, c.x, c.z, c.yaw, c.pitch, c.roll, c.spin, c.steer, null, 1, c.y);
    }
    for (const b of this.blocks) {
      if (Math.hypot(b.x - v.x, b.z - v.z) > 400) continue;
      drawCar(CRUISER, b.x, b.z, b.yaw, 0, 0, 0, 0, null, 1, 0);
    }
    const r = G.renderer, mesh = G.meshes;
    if (!r || !mesh || !mesh.copPodL) return;
    // 5 Hz alternation, red then blue, both unlit so they read at any hour.
    const red = (this.blink * 5) % 2 < 1;
    for (const list of [this.units, this.blocks]) {
      for (const u of list) {
        const x = u.x, z = u.z, yaw = u.yaw;
        if (Math.hypot(x - v.x, z - v.z) > 400) continue;
        m4.compose(MM, x, u.veh ? u.veh.y : 0, z, yaw, 0, 0);
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
