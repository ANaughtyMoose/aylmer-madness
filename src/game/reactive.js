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
import { style, FRIEND_LINES, LABEL, laneSide } from './style.js';
import { styleTipsPaying } from './missionkit.js';
import { friendLines } from './story.js';
import { heckle } from './heckle.js';
import { missionNotificationAllowed } from './mission-notifications.js';

const IDENT = m4.identity(m4.create());

// One step's tips as one line: « +12 $ FRÔLÉ x3 », or, when two land in the
// same step, « +21 $ FRÔLÉ + CONTRESENS x3 ».
export function tipText(r) {
  const t = r.toasts;
  if (t.length === 1) return t[0].text;
  const kinds = [];
  for (const x of t) { const l = LABEL[x.kind]; if (l && kinds.indexOf(l) < 0) kinds.push(l); }
  const mult = t[t.length - 1].text.match(/x(\d)$/);
  return `+${r.pay} $ ${kinds.join(' + ')}${mult ? ' x' + mult[1] : ''}`;
}

const STREAK_HOLD = 4.0;      // seconds before a run of smashed props lapses
const STREAK_AT = [5, 10, 20, 35];
const SMOKE_EVERY = 0.045;    // seconds between tyre puffs while sliding
const SMOKE_FROM = 0.30;      // the `squeal` the smoke starts at (S3-RANGER)
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
    // The world goes to debris.js too: bins and glass land on the ground, and
    // the ground is not at zero any more.
    this.debris = new Debris(renderer, this.props.meshes, world);
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
    // B-03: the style chain (style.js) rides on this tick, after traffic.js
    // has logged this step's near misses. One instance for the session.
    this.style = style;
    this._friendFor = null; this._friend = null;
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
    // Set once, not every frame, so a check that lends the HUD a stand-in
    // chain for a moment (the B-06 beat) is not overwritten under it.
    if (!G.style) G.style = this.style;
    // The wrong-side lookup keeps one list of long edges per road graph; build
    // it on the first drive frame, not the first time you cross the line at 50.
    if (G.traffic && this._laneNet !== G.traffic) { this._laneNet = G.traffic; laneSide(G.traffic, 0, 0, 1, 0); }
  }

  // ---------------------------------------------------------------- style (B-03)

  // Who rides along on this job and has chain lines: the first main-cast
  // speaker of the job's own start lines (story.js FRIEND_LINES) with a pool
  // in style.js, and only while somebody is actually in the passenger seat.
  friendFor(G) {
    const m = G.mission;
    const id = m && m.def ? m.def.id : null;
    if (id !== this._friendFor) {
      this._friendFor = id;
      this._friend = null;
      if (id) for (const [who] of friendLines(id, 'start')) if (FRIEND_LINES[who]) { this._friend = who; break; }
    }
    return this._friend && G.veh && G.veh.passengers > 0 ? this._friend : null;
  }

  // Sense, score, pay and show one step of the chain. Tips go straight into the
  // wallet and, on a job, onto the job's own ledger as `m.styleTips` (never
  // `m.paid`: a failed job hands back its pay, not the tips you earned on it).
  styleStep(dt, G, v) {
    const traffic = G.traffic;
    this.style.attach(this.stats);
    const hb = G.input && typeof G.input.handbrake === 'boolean' ? G.input.handbrake : undefined;
    const ev = this.style.sense(dt, v, traffic && traffic.nearMisses, traffic && traffic.cars, hb, traffic);
    const paying = styleTipsPaying(G);
    const r = this.style.tick(dt, ev, { paying, friend: G.mission ? this.friendFor(G) : null });
    // Traffic near misses are counted on the chain (G.stats.styleNear), never on
    // G.stats.nearMiss: that counter is pedestrian grazes, and cops.js reads it
    // as dangerous driving (code review B-03, major 2). Threading traffic well
    // must not draw police heat; jumps.js's « frôlé en l'air » keeps its old input.
    if (r.pay > 0 && G.wallet) {
      G.wallet.add(r.pay);
      if (G.mission) G.mission.styleTips = (G.mission.styleTips || 0) + r.pay;
    }
    // One toast for the step, in the chain's own slot under the readout
    // (hud.styleTip, B-06), never the one shared toast slot: a run of near
    // misses must not queue seconds of tips ahead of stage toasts and the FINI
    // card (code review B-03, major 1). A tip that pays nothing is not shown;
    // the readout still says STYLE xN.
    if (r.pay > 0 && r.toasts.length && missionNotificationAllowed(G, 'stunt')) {
      const hud = G.hud;
      if (hud && typeof hud.styleTip === 'function') hud.styleTip(tipText(r), 1100);
      if (G.audio && G.audio.blip) G.audio.blip(660 + 110 * this.style.mult, 0.06, 'triangle', 0.08);
    }
    if (r.friend) heckle.line(r.friend.who, r.friend.line, 3000, { group: 'friend' });
    this.style.statsInto(this.stats);
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
    this.styleStep(dt, G, v);

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
      const wy = this.debris.groundY(it.x, it.z) + 0.5;
      for (let i = 0; i < 5; i++) this.debris.puff(it.x, wy, it.z, 0, 0, true);
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
  // (`squeal`, 0..1, S3-RANGER; `skid` for anything that has no squeal), so
  // this only has to put it on the ground behind the rears.
  tyres(dt, v) {
    const sq = v.squeal != null ? v.squeal : v.skid;
    if (sq < SMOKE_FROM || Math.hypot(v.vLong, v.vLat || 0) < 3) { this.smokeT = 0; return; }
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

  // S3-CRASH: the head-on that fires the crash slow-mo (main.js) is the show.
  // Sixteen shards off the nose and three or four parts of the car itself (a
  // panel in its own paint, the bumper, a hubcap or two), thrown sideways and
  // back off the impact so they tumble in front of the side camera rather
  // than into the wall. `speed` is the road speed before the hit (m/s): after
  // it the truck is nearly stopped. Pools are fixed (debris.js), so a show
  // costs at most 4 bodies and 16 glass slots and allocates nothing.
  crashShow(v, speed) {
    if (!v || !v.spec) return 0;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);   // local +X, the driver's left
    const nose = v.spec.len * 0.45, y = v.y || 0;
    const px = v.x + fx * nose, pz = v.z + fz * nose;
    const sp = Math.min(30, Math.max(8, speed || 0));
    this.debris.glassBurst(px, y + 0.75, pz, fx * sp * 0.6, fz * sp * 0.6, 16);
    const hex = v.spec.body;
    if (hex !== undefined) {
      if (!this.paint3) this.paint3 = new Float32Array(3);
      this.paint3[0] = ((hex >> 16) & 255) / 255; this.paint3[1] = ((hex >> 8) & 255) / 255; this.paint3[2] = (hex & 255) / 255;
    }
    const parts = Math.random() < 0.5 ? 3 : 4;
    const kinds = ['panel', 'bumper', 'hubcap', 'hubcap'];
    let n = 0;
    for (let i = 0; i < parts; i++) {
      const k = i % 2 ? -1 : 1;                           // alternate sides
      const out = 0.55 + Math.random() * 0.35, back = 0.15 + Math.random() * 0.25;
      const vx = (lx * k * out - fx * back) * sp, vz = (lz * k * out - fz * back) * sp;
      const b = this.debris.spawn(kinds[i], px + lx * k * 0.6, pz + lz * k * 0.6, vx, vz, y + 0.3);
      if (!b) continue;
      if (kinds[i] === 'panel' && hex !== undefined) b.tint = this.paint3;
      n++;
    }
    this.showFrame = this.frame;
    // Not G.stats (that one is saved): a tally for AYLMER.feel() and the checks.
    if (!this.show) this.show = { count: 0, parts: 0, glass: 16 };
    this.show.count++; this.show.parts = n;
    return n;
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
      // S3-CRASH: a crash show already threw its glass this frame.
      if (rise > 2.2 && this.showFrame !== this.frame) this.debris.glassBurst(px, (v.y || 0) + 0.7, pz, v.vx, v.vz, 7);
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
    // W8-FIRST15: not while the first-control HUD is calm (ui.js hudCalm).
    const on = !!G.mission && !G.hudCalm;
    this.el.style.display = on ? 'block' : 'none';
    if (!on) return;
    const s = this.stats;
    const st = this.style.hudState();
    const tips = (G.mission && G.mission.styleTips) || 0;
    // FRÔLÉS on the panel is every near miss you see: pedestrian grazes
    // (G.stats.nearMiss) plus the chain's traffic ones (styleNear). Display only.
    const txt = `FRÔLÉS ${(s.nearMiss || 0) + (s.styleNear || 0)}\nCASSÉS ${s.propsSmashed}`
      + (this.streak > 1 ? `  ×${this.streak}` : '')
      // On a job: what the chain paid on it. In free roam the tip line under
      // the readout shows each payment; the panel keeps only the chain.
      + (G.mission ? (st.on || tips ? `\nSTYLE ${tips} $${st.on ? `  x${st.mult}` : ''}` : '')
        : (st.on ? `\nSTYLE x${st.mult}` : ''));
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
