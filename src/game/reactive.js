// The reactive world, in one object: pedestrians (peds.js), knock-over street
// furniture (streetprops.js) and the debris / smoke / sparks it all throws
// (debris.js), plus the Midtown-style feedback that makes any of it read —
// « Tu l'as frôlé! », « 5 poubelles d'affilée », and the counters that only
// come up while you are on a job.
//
// main.js knows four lines about all of this: build it, update it, draw it, and
// a G.stats object. Everything else lives in these four files.
import { buildStreetProps, KINDS } from './streetprops.js';
import { Debris } from './debris.js';
import { Peds } from './peds.js';
import { m4 } from '../core/math.js';

const IDENT = m4.identity(m4.create());

const STREAK_HOLD = 4.0;      // seconds before a run of smashed props lapses
const STREAK_AT = [5, 10, 20, 35];
const SMOKE_EVERY = 0.045;    // seconds between tyre puffs while sliding
const SCRAPE_EVERY = 3;       // frames between wall-scrape probes
// The tailpipe. `SOOT_IDLE` is the interval between wisps off a diesel sitting
// at a light, `SOOT_LOAD` the interval under full load, and both are divided by
// the car's own `smokes` rate — so a restored 240D at 0.15 puffs at a seventh
// of the rate without this file knowing the restoration exists. `SOOT_TIP` is
// how far the pedal has to move in one frame to count as a tip-in, which is the
// black cloud everybody remembers these cars by: the fuel arrives before the
// air does and what does not burn goes out the back.
const SOOT_IDLE = 0.60;
const SOOT_LOAD = 0.085;
const SOOT_TIP = 0.30;

const NOUN = {
  garbage: 'poubelles', recyc: 'bacs bleus', mailbox: 'boîtes aux lettres',
  relaybox: 'boîtes de Postes Canada', newsbox: 'boîtes à journaux',
  hydrant: 'bornes-fontaines', cafetable: 'tables de terrasse',
  cafechair: 'chaises', cart: 'paniers', fruitstand: 'kiosques',
};

export class Reactive {
  constructor(renderer, world) {
    this.r = renderer;
    this.world = world;
    this.props = buildStreetProps(renderer, world);
    this.debris = new Debris(renderer, this.props.meshes);
    this.peds = new Peds(renderer, world);
    this.peds.onDive = (p, car, player) => this.onDive(p, car, player);
    this.peds.onGraze = (p, car, player) => this.onGraze(p, car, player);

    this.streak = 0;
    this.streakT = 0;
    this.streakKind = '';
    this.streakStep = 0;
    this.smokeT = 0;
    this.sootT = 0;
    this.sootThr = 0;
    this.prevDamage = 0;
    this.frame = 0;
    this.hudT = 0;
    this.el = null;
    this.G = null;
    this.stats = null;
  }

  // The one place G.stats is filled in, so nothing else has to know it exists.
  bind(G) {
    this.G = G;
    if (!G.stats) G.stats = {};
    const s = G.stats;
    if (s.nearMiss === undefined) s.nearMiss = 0;
    if (s.pedsDived === undefined) s.pedsDived = 0;
    if (s.propsSmashed === undefined) s.propsSmashed = 0;
    if (s.bestStreak === undefined) s.bestStreak = 0;
    s.streak = this.streak;
    s.pedsAlive = this.peds.stats.alive;
    s.debris = this.debris.stats.bodies;
    this.stats = s;
  }

  // ---------------------------------------------------------------- callbacks

  onDive(p, car, player) {
    if (this.stats) this.stats.pedsDived++;
  }

  onGraze(p, car, player) {
    if (!player) return;
    const G = this.G;
    if (this.stats) this.stats.nearMiss++;
    if (G && G.hud) G.hud.toast('Tu l’as frôlé!', 1300);
    if (G && G.audio && G.audio.blip) G.audio.blip(880, 0.07, 'triangle', 0.10);
  }

  // ---------------------------------------------------------------- update

  update(dt, G) {
    if (!G || G.mode !== 'drive' || !G.veh) return;
    this.bind(G);
    this.frame++;
    const v = G.veh;

    this.hitProps(dt, G, v);
    this.tyres(dt, v);
    this.exhaust(dt, v);
    this.scrapes(dt, G, v);
    this.peds.update(dt, G);
    this.debris.update(dt);

    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) { this.streak = 0; this.streakStep = 0; this.streakKind = ''; }
    }
    this.stats.streak = this.streak;
    this.stats.pedsAlive = this.peds.stats.alive;
    this.stats.debris = this.debris.stats.bodies;

    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.25; this.paint(G); }
  }

  // Two circles down the car, exactly the body collide.js uses, against every
  // prop still standing within a car length.
  hitProps(dt, G, v) {
    const props = this.props;
    const s = v.spec;
    const speed = Math.hypot(v.vx, v.vz);
    if (speed < 0.9) return;
    const r = s.wid * 0.5;
    const off = Math.max(0.05, s.len * 0.5 - r);
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const list = props.query(v.x, v.z, s.len * 0.5 + 1.6);
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.dead) continue;
      const K = KINDS[it.kind];
      const reach = r + K.r;
      for (let k = 1; k >= -1; k -= 2) {
        const cx = v.x + fx * off * k, cz = v.z + fz * off * k;
        const dx = it.x - cx, dz = it.z - cz;
        if (dx * dx + dz * dz > reach * reach) continue;
        this.smash(it, K, v, G, speed);
        break;
      }
    }
  }

  smash(it, K, v, G, speed) {
    if (!this.props.knock(it)) return;
    const y = v.y || 0;
    this.debris.spawn(it.kind, it.x, it.z, v.vx, v.vz, y);
    if (K.spill > 0) {
      const kinds = this.props.spillOf(it.kind);
      for (let i = 0; i < K.spill; i++) {
        this.debris.spawn(kinds[i % kinds.length],
          it.x + (Math.random() - 0.5) * 0.6, it.z + (Math.random() - 0.5) * 0.6,
          v.vx * 0.7, v.vz * 0.7, y);
      }
    }
    if (K.water) {
      for (let i = 0; i < 5; i++) this.debris.puff(it.x, 0.5, it.z, 0, 0, true);
    }
    // A little damage and a shove of the nose — enough to feel, never enough to
    // end a job on its own.
    const d = Math.hypot(it.x - v.x, it.z - v.z) || 1;
    const nx = (v.x - it.x) / d, nz = (v.z - it.z) / d;
    v.hit(Math.min(2.6, speed * 0.13 * K.dmg), nx, nz);
    if (G.audio && G.audio.thud) G.audio.thud(K.snd);
    this.stats.propsSmashed++;
    this.bumpStreak(it.kind, G);
  }

  bumpStreak(kind, G) {
    this.streak++;
    this.streakT = STREAK_HOLD;
    if (!this.streakKind || Math.random() < 0.4) this.streakKind = kind;
    if (this.streak > this.stats.bestStreak) this.stats.bestStreak = this.streak;
    while (this.streakStep < STREAK_AT.length && this.streak >= STREAK_AT[this.streakStep]) {
      const n = STREAK_AT[this.streakStep];
      this.streakStep++;
      const noun = NOUN[this.streakKind] || 'cochonneries';
      if (G.hud) G.hud.toast(`${n} ${noun} d’affilée`, 1700);
      if (G.audio && G.audio.blip) G.audio.blip(520 + this.streakStep * 130, 0.10, 'square', 0.13);
    }
  }

  // Tyre smoke: the car already works out how much the tyres are giving up
  // (`skid`, 0..1), so this only has to put it on the ground behind the rears.
  tyres(dt, v) {
    if (v.skid < 0.30 || Math.abs(v.vLong) < 3) { this.smokeT = 0; return; }
    this.smokeT -= dt;
    if (this.smokeT > 0) return;
    this.smokeT = SMOKE_EVERY;
    const s = v.spec;
    const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
    const lz = -s.axleZ;
    for (let k = -1; k <= 1; k += 2) {
      const lx = k * s.track * 0.5;
      this.debris.puff(v.x + lx * cy + lz * sy, (v.y || 0) + 0.12, v.z - lx * sy + lz * cy,
        v.vx * 0.3, v.vz * 0.3, false);
    }
  }

  // The tailpipe, and the only thing in this file that is about one car.
  //
  // `spec.smokes` is a rate, 0..1, and no other vehicle declares one — so for
  // everything else this is a property read and a return, every frame, the same
  // cost the tyre check above already pays. The 240D declares 1: an OM616 with
  // three hundred thousand kilometres on it and the rings it left the factory
  // with. Three behaviours, and each of them is something a real one does:
  //
  //   the wisp    it never stops. A diesel at idle hazes, and a tired one
  //               hazes visibly, which is why you can find a W115 in a parking
  //               lot by looking for the blue-grey.
  //   the plume   under load. `load` is the pedal weighted DOWN with speed,
  //               because black smoke is unburnt fuel and the engine makes far
  //               more of it hauling 1450 kg away from a light than it does at
  //               a cruise, where the same pedal is asking for much less.
  //   the cloud   the tip-in. Open the throttle and the pump delivers before
  //               the air catches up: three puffs at once, immediately.
  //
  // `v.throttle` is the pedal this frame (cars.js Vehicle.update writes it for
  // every vehicle and the physics never reads it), and `this.sootThr` is the
  // pedal last frame — the difference between the two IS the tip-in.
  exhaust(dt, v) {
    const rate = v.spec.smokes || 0;
    if (!(rate > 0)) { this.sootT = 0; this.sootThr = 0; return; }
    const thr = v.throttle || 0;
    const tipIn = thr > 0.25 && thr - this.sootThr > SOOT_TIP;
    this.sootThr = thr;
    const load = thr * (1 - 0.55 * Math.min(1, Math.abs(v.vLong) / 22));
    const every = (load > 0.05 ? SOOT_LOAD / (0.35 + load) : SOOT_IDLE) / rate;
    this.sootT -= dt;
    if (tipIn) this.sootT = 0;
    if (this.sootT > 0) return;
    this.sootT = every;
    const s = v.spec;
    const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
    // Under the rear valance and out to the car's RIGHT: local +X is the
    // driver's left, so the single pipe a W115 has is at negative x.
    const lz = -(s.len * 0.5 - 0.08), lx = -(s.wid * 0.5 - 0.32);
    const x = v.x + lx * cy + lz * sy, z = v.z - lx * sy + lz * cy;
    const n = tipIn ? 3 : 1;
    for (let i = 0; i < n; i++) {
      this.debris.puff(x, (v.y || 0) + 0.26, z, v.vx * 0.6, v.vz * 0.6, false, true);
    }
  }

  // Sparks: a jump in the damage number is a bang (glass with it if it was a
  // big one), and a wall you are still grinding along keeps throwing them.
  scrapes(dt, G, v) {
    const dmg = v.damage;
    const rise = dmg - this.prevDamage;
    this.prevDamage = dmg;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    if (rise > 0.4) {
      const nose = v.spec.len * 0.42;
      const px = v.x + fx * nose, pz = v.z + fz * nose;
      const n = Math.min(10, 3 + (rise | 0));
      for (let i = 0; i < n; i++) this.debris.spark(px, (v.y || 0) + 0.45, pz, v.vx, v.vz);
      if (rise > 2.2) this.debris.glassBurst(px, (v.y || 0) + 0.7, pz, v.vx, v.vz, 7);
    }
    if (this.frame % SCRAPE_EVERY) return;
    if (v.speedKmh < 22 || !G.world || !G.world.querySegments) return;
    const s = v.spec;
    const r = s.wid * 0.52;
    const segs = G.world.querySegments(v.x, v.z, s.len * 0.6 + 1.2);
    if (!segs.length) return;
    for (let k = 1; k >= -1; k -= 2) {
      const o = k * s.len * 0.28;
      const px = v.x + fx * o, pz = v.z + fz * o;
      for (let i = 0; i < segs.length; i++) {
        const g = segs[i];
        const ex = g.bx - g.ax, ez = g.bz - g.az;
        const l2 = ex * ex + ez * ez || 1e-6;
        let t = ((px - g.ax) * ex + (pz - g.az) * ez) / l2;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = g.ax + ex * t, qz = g.az + ez * t;
        const dx = px - qx, dz = pz - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 > (r + 0.10) * (r + 0.10)) continue;
        this.debris.spark(qx, (v.y || 0) + 0.42, qz, v.vx, v.vz);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- feedback

  // A two-line counter, bottom-left, only while a job is running: free roam
  // stays clean, which is the whole point of putting it behind G.mission.
  paint(G) {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc || !doc.body) return;
    if (!this.el) {
      const el = doc.createElement('div');
      el.id = 'reactstats';
      el.style.cssText = 'position:fixed;left:18px;bottom:96px;z-index:6;'
        + 'font:600 13px/1.45 system-ui,sans-serif;color:#f2ede0;'
        + 'text-shadow:0 1px 3px rgba(0,0,0,.85);letter-spacing:.04em;'
        + 'pointer-events:none;display:none;white-space:pre';
      doc.body.appendChild(el);
      this.el = el;
    }
    const on = !!G.mission;
    this.el.style.display = on ? 'block' : 'none';
    if (!on) return;
    const s = this.stats;
    const txt = `FRÔLÉS ${s.nearMiss}\nCASSÉS ${s.propsSmashed}`
      + (this.streak > 1 ? `  ×${this.streak}` : '');
    if (txt !== this._txt) { this.el.textContent = txt; this._txt = txt; }
  }

  // ---------------------------------------------------------------- draw

  draw(r, focus, drawDist) {
    // Everything here is placed in world space, so the model matrix is identity
    // — main.js's scratch matrix is mid-flight by the time we are called.
    this.props.draw(r, IDENT, focus.x, focus.z, drawDist);
    this.peds.draw(r, focus);
    this.debris.draw(r, focus);
  }
}
