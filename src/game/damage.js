// R4 — what damage looks like, sounds like and costs you, plus the aftermath of
// R3: the poles you took out on the way. Nothing here is on the critical path
// of the physics; it is all bookkeeping and a handful of extra draws.
import { MeshBuilder, rgb } from '../core/mesh.js';
import { m4, clamp } from '../core/math.js';
import { DAMAGE, buildCarLamps, buildCrumple, buildPuff, CARS } from './cars.js';

export { DAMAGE };

// Lamp colours, as multipliers on the white lens meshes.
const C_HEAD = new Float32Array([1.0, 0.97, 0.84]);
const C_TAIL_DIM = new Float32Array([0.46, 0.07, 0.05]);
const C_TAIL_HOT = new Float32Array([1.0, 0.16, 0.10]);
const C_REV = new Float32Array([0.95, 0.98, 1.0]);
const C_STEAM = new Float32Array([0.86, 0.89, 0.93]);

const POLE_FALL = 0.5;        // seconds from upright to flat on the sidewalk
const PUFFS = 8;              // hard ceiling on steam, so it can never cost a frame
const REPAIR_SECONDS = 5;
const REPAIR_RADIUS = 24;

// ---------------------------------------------------------------- repairs

/**
 * The primitive: sit at ONE spot with the engine off the boil and count. `state`
 * is a plain object the caller keeps ({ t: 0 }); returns 'start', 'done' or null
 * so the caller owns all the toasts. `opts` can move the radius and the clock.
 */
export function updateRepair(state, dt, veh, gas, opts = {}) {
  if (!gas) return null;
  const rad = opts.radius != null ? opts.radius : REPAIR_RADIUS;
  const secs = opts.seconds != null ? opts.seconds : REPAIR_SECONDS;
  const dx = veh.x - gas.x, dz = veh.z - gas.z;
  const ok = dx * dx + dz * dz < rad * rad
    && Math.abs(veh.vLong) < 1.2 && veh.damage > 0;
  if (!ok) { state.t = 0; return null; }
  const first = state.t === 0;
  state.t += dt;
  if (state.t >= secs) { state.t = 0; return 'done'; }
  return first ? 'start' : null;
}

// Seconds still to wait, for a prompt.
export const repairLeft = (state, secs = REPAIR_SECONDS) => Math.max(0, secs - state.t);

// ---------------------------------------------------------------- FEEL: where you get it fixed
//
// The complaint was that nobody could find the one garage in town, so there are
// three now and the HUD points at them. `place` is a key into game/places.js.
//
//   home        your own driveway. Free, and slow, because you are doing it.
//   gas/ctire   somebody else does it in four seconds and charges you for it.
//
// Everything here is pure arithmetic against a places table and a wallet-shaped
// object, so tools/smoke_repair.mjs runs it in node with no browser at all.
export const REPAIR = {
  RATE: 0.20,          // dollars per point of damage at a real garage
  MIN: 5,              // ...but never less than this
  TOW: 60,             // what the flatbed charges when the car is finished
  HOME_RADIUS: 14,     // "in the driveway", metres
  SHOP_RADIUS: 24,     // "on the forecourt", metres
  HOME_SECONDS: 10,
  SHOP_SECONDS: 4,
};

export const REPAIR_SPOTS = [
  { key: 'home',  place: 'home',  radius: REPAIR.HOME_RADIUS, seconds: REPAIR.HOME_SECONDS,
    free: true,  short: 'chez vous',      label: 'ton entrée' },
  { key: 'gas',   place: 'gas',   radius: REPAIR.SHOP_RADIUS, seconds: REPAIR.SHOP_SECONDS,
    free: false, short: 'Petro-Can',      label: 'la Petro-Canada' },
  { key: 'ctire', place: 'ctire', radius: REPAIR.SHOP_RADIUS, seconds: REPAIR.SHOP_SECONDS,
    free: false, short: 'Canadian Tire',  label: 'le Canadian Tire' },
];

/** 20 % of the damage in dollars, never under $5, always a round number. */
export function repairCost(damage) {
  if (!(damage > 0)) return 0;
  return Math.max(REPAIR.MIN, Math.round(damage * REPAIR.RATE));
}

const spotXZ = (spot, places) => places && places[spot.place];

/** The repair spot the car is actually parked at, or null. */
export function repairSpotAt(veh, places) {
  if (!veh || !(veh.damage > 0) || Math.abs(veh.vLong) > 1.2) return null;
  for (const s of REPAIR_SPOTS) {
    const p = spotXZ(s, places);
    if (!p) continue;
    const dx = veh.x - p.x, dz = veh.z - p.z;
    if (dx * dx + dz * dz < s.radius * s.radius) return s;
  }
  return null;
}

/** The nearest one anywhere in town — what the map puts a wrench on. */
export function nearestRepair(veh, places) {
  let best = null, bd = Infinity;
  for (const s of REPAIR_SPOTS) {
    const p = spotXZ(s, places);
    if (!p) continue;
    const d = Math.hypot(veh.x - p.x, veh.z - p.z);
    if (d < bd) { bd = d; best = { key: s.key, x: p.x, z: p.z, label: s.short, dist: d }; }
  }
  return best;
}

/**
 * One tick of "am I getting this thing fixed". `state` is { t, key }; `opts` is
 * { places, press (E this tick), wallet }. The money comes off at the END, so
 * driving away half-repaired costs you nothing but the time.
 *
 * Returns a plain record — no DOM, no audio — and main.js turns it into a
 * prompt, a toast and the wrench taps.
 */
export function updateRepairs(state, dt, veh, opts = {}) {
  const res = { spot: null, prompt: null, toast: null, done: false, cost: 0, working: false, left: 0 };
  const places = opts.places;
  if (!veh || !(veh.damage > 0)) { state.t = 0; state.key = null; return res; }
  const spot = repairSpotAt(veh, places);
  if (!spot) { state.t = 0; state.key = null; return res; }
  res.spot = spot;

  const wallet = opts.wallet || null;
  const cost = spot.free ? 0 : repairCost(veh.damage);
  res.cost = cost;

  // Already under way here.
  if (state.key === spot.key) {
    state.t += dt;
    res.working = true;
    res.left = Math.max(0, spot.seconds - state.t);
    res.prompt = `Réparation…  ${Math.ceil(res.left)} s`;
    if (state.t >= spot.seconds) {
      const paid = cost > 0 && wallet ? (wallet.spend(cost) ? cost : 0) : 0;
      state.t = 0; state.key = null;
      res.working = false; res.done = true; res.prompt = null; res.cost = paid;
      res.toast = spot.free
        ? 'Comme neuf.\nTon père a rien vu.'
        : `Comme neuf.\n${paid} $ — fais attention à c’t’heure`;
    }
    return res;
  }

  // Not started. Broke? Say so, and point at the driveway.
  if (cost > 0 && wallet && !wallet.can(cost)) {
    res.prompt = `${cost} $ pour réparer — t’as pas l’argent. Chez vous c’est gratuit (E)`;
    return res;
  }
  res.prompt = spot.free
    ? `E  —  réparer dans l’entrée (gratuit, ${spot.seconds} s)`
    : `E  —  réparer (${cost} $)`;
  if (opts.press) {
    state.key = spot.key; state.t = 0;
    res.working = true;
    res.left = spot.seconds;
    res.prompt = `Réparation…  ${spot.seconds} s`;
  }
  return res;
}

/**
 * Discoverability. `state` is { h25, h60 }; returns the one-time toast for a
 * threshold you have just crossed, plus the standing line for the HUD's damage
 * bar. Both flags clear once the car is straight again, so the next time you
 * wreck it you get told again.
 */
export function repairHint(state, damage) {
  const out = { toast: null, hint: null };
  if (!(damage > 0)) { state.h25 = false; state.h60 = false; return out; }
  if (damage >= DAMAGE.COSMETIC && !state.h25) {
    state.h25 = true;
    out.toast = 'Ton char est magané — Petro-Can, Canadian Tire, ou ton entrée (E)';
  }
  if (damage >= DAMAGE.PERF && !state.h60) {
    state.h60 = true;
    out.toast = 'Ça tire à gauche pis ça pétarade — va le faire réparer';
  }
  if (damage >= DAMAGE.COSMETIC) out.hint = 'réparer: Petro-Can · Canadian Tire · chez vous';
  return out;
}

// ---------------------------------------------------------------- steam

class Puffs {
  constructor() {
    this.p = [];
    for (let i = 0; i < PUFFS; i++) this.p.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0 });
    this.next = 0;
    this.cool = 0;
  }
  emit(x, y, z, vx, vz) {
    const q = this.p[this.next];
    this.next = (this.next + 1) % PUFFS;
    q.life = 1;
    q.x = x; q.y = y; q.z = z;
    q.vx = vx * 0.25 + (Math.random() - 0.5) * 0.5;
    q.vz = vz * 0.25 + (Math.random() - 0.5) * 0.5;
    q.vy = 1.1 + Math.random() * 0.7;
    q.s = 0.22 + Math.random() * 0.12;
  }
  update(dt) {
    for (let i = 0; i < PUFFS; i++) {
      const q = this.p[i];
      if (q.life <= 0) continue;
      q.life -= dt * 0.65;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vy *= 1 - 0.6 * dt;
      q.s += dt * 0.55;
    }
  }
}

// ---------------------------------------------------------------- the fx pack

const mm = m4.create();

export class DriveFx {
  constructor(renderer) {
    this.r = renderer;
    this.puffs = new Puffs();
    this.lamps = {};
    for (const c of CARS) {
      const L = buildCarLamps(c);
      const up = {};
      for (const k of Object.keys(L)) up[k] = renderer.upload(L[k]);
      this.lamps[c.id] = up;
    }
    // One opts object per puff: the renderer defers transparent draws to end(),
    // so they cannot share a mutable one — and re-allocating them every frame
    // is exactly the kind of garbage a 60 fps budget does not have room for.
    this.puffOpts = [];
    for (let i = 0; i < PUFFS; i++) this.puffOpts.push({ unlit: true, alpha: 1, colorMul: C_STEAM });
    // Two reusable lamp-state records, mutated in place: render() runs 60 times
    // a second and has no business making garbage.
    this.stMine = lampState();
    this.stTheirs = lampState();
    this.crumple = renderer.upload(buildCrumple());
    this.puff = renderer.upload(buildPuff());
    this.poleMesh = {
      light: renderer.upload(fallenPole(0.20, 8.4, 0x6f6d68, 3.0, 0.22)),
      hydro: renderer.upload(fallenPole(0.30, 10.8, 0x6b5a45, 4.0, 0.30)),
    };
  }

  /** Called from tick(). Advances the poles that are falling and the steam. */
  tick(dt, veh, world) {
    const fallen = world && world.fallen;
    if (fallen) {
      for (let i = 0; i < fallen.length; i++) {
        if (fallen[i].t < 1) fallen[i].t = Math.min(1, fallen[i].t + dt / POLE_FALL);
      }
    }
    this.puffs.update(dt);
    // Landing dust. `veh.landed` is the vertical speed the springs killed, set
    // for one tick only — a puff off each end of the car, biggest for the worst
    // landings. Nothing else in here has to know what a jump is.
    if (veh.landed > 1.8) {
      const s = veh.spec;
      const fx = Math.sin(veh.yaw), fz = Math.cos(veh.yaw);
      const n = veh.landed > 6 ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const off = (i % 2 ? 1 : -1) * s.len * 0.34;
        const lat = (i < 2 ? -1 : 1) * s.wid * 0.42;
        this.puffs.emit(veh.x + fx * off + Math.cos(veh.yaw) * lat,
          (veh.gh || 0) + 0.18,
          veh.z + fz * off - Math.sin(veh.yaw) * lat,
          veh.vx * 0.4, veh.vz * 0.4);
      }
    }
    if (veh.damage > DAMAGE.COSMETIC) {
      // Faster once it is really unwell, and a burst right after a bang.
      const rate = veh.steamT > 0 ? 0.10 : (veh.damage > DAMAGE.PERF ? 0.26 : 0.5);
      this.puffs.cool -= dt;
      if (this.puffs.cool <= 0) {
        this.puffs.cool = rate;
        const s = veh.spec;
        const fx = Math.sin(veh.yaw), fz = Math.cos(veh.yaw);
        const off = s.len * 0.34;
        this.puffs.emit(veh.x + fx * off + (Math.random() - 0.5) * 0.5,
          (veh.bodyY != null ? veh.bodyY : veh.y) + s.h * 0.62,
          veh.z + fz * off + (Math.random() - 0.5) * 0.5,
          veh.vx, veh.vz);
      }
    }
  }

  /**
   * Called from render(), after the cars are drawn. `night` turns the lamps on;
   * `traffic` may be null. Everything is distance-culled: at most a couple of
   * dozen extra draws even in the middle of town.
   */
  render(veh, world, night, traffic) {
    const r = this.r;
    // --- poles you have snapped
    const fallen = world && world.fallen;
    if (fallen) {
      for (let i = 0; i < fallen.length; i++) {
        const f = fallen[i];
        const dx = f.x - veh.x, dz = f.z - veh.z;
        if (dx * dx + dz * dz > 400 * 400) continue;
        // ease-out so it accelerates over and then thumps down
        const e = 1 - (1 - f.t) * (1 - f.t);
        m4.compose(mm, f.x, 0, f.z, f.yaw, e * (Math.PI / 2 - 0.06), 0);
        r.draw(this.poleMesh[f.kind] || this.poleMesh.light, mm);
      }
    }

    // --- your lights and your dents
    const me = this.stMine;
    me.head = night; me.headOut = veh.headOut;
    me.tail = night; me.brake = veh.braking; me.rev = veh.reversing;
    me.glow = night; me.deformF = veh.deformF; me.deformR = veh.deformR;
    this.drawCarFx(veh.spec, veh.x, veh.bodyY != null ? veh.bodyY : veh.y, veh.z, veh.yaw, veh.pitch, veh.roll, me);

    // --- everyone else's, after dark only, and only the near ones
    if (night && traffic) {
      let n = 0;
      for (let i = 0; i < traffic.length && n < 8; i++) {
        const t = traffic[i];
        const dx = t.x - veh.x, dz = t.z - veh.z;
        if (dx * dx + dz * dz > 130 * 130) continue;
        n++;
        const o = this.stTheirs;
        o.head = true; o.headOut = 0;
        o.tail = true; o.brake = t.stunT > 0; o.rev = false; o.glow = false;
        this.drawCarFx(t.spec, t.x, 0, t.z, t.yaw, 0, 0, o);
      }
    }

    // --- steam
    const P = this.puffs.p;
    for (let i = 0; i < PUFFS; i++) {
      const q = P[i];
      if (q.life <= 0) continue;
      const s = q.s;
      m4.compose(mm, q.x, q.y, q.z, i * 0.7, 0, 0, s, s, s);
      const o = this.puffOpts[i];
      o.alpha = 0.30 * q.life;
      r.draw(this.puff, mm, o);
    }
  }

  // One car's lamps and crumpled ends.
  drawCarFx(spec, x, y, z, yaw, pitch, roll, st) {
    const r = this.r, L = this.lamps[spec.id];
    if (!L) return;
    if (st.head) {
      if (st.headOut !== 1) r.draw(L.headL, place(x, y, z, yaw, pitch, roll), HEAD_OPTS);
      if (st.headOut !== -1) r.draw(L.headR, place(x, y, z, yaw, pitch, roll), HEAD_OPTS);
    }
    if (st.tail || st.brake) {
      r.draw(L.tail, place(x, y, z, yaw, pitch, roll),
        st.brake ? TAIL_HOT_OPTS : TAIL_DIM_OPTS);
    }
    if (st.rev) r.draw(L.rev, place(x, y, z, yaw, pitch, roll), REV_OPTS);
    if (st.glow) {
      const g = place(x, y, z, yaw, pitch, roll);
      if (st.headOut !== 1) r.draw(L.glowHeadL, g, GLOW_HEAD_OPTS);
      if (st.headOut !== -1) r.draw(L.glowHeadR, g, GLOW_HEAD_OPTS);
      if (st.tail || st.brake) r.draw(L.glowTail, g, st.brake ? GLOW_TAIL_HOT : GLOW_TAIL_OPTS);
    }
    // Crumple: a folded bumper cap over whichever end took it.
    if (st.deformF > 0.12) this.drawCrumple(spec, x, y, z, yaw, pitch, roll, 1, st.deformF);
    if (st.deformR > 0.12) this.drawCrumple(spec, x, y, z, yaw, pitch, roll, -1, st.deformR);
  }

  drawCrumple(spec, x, y, z, yaw, pitch, roll, dir, k) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // Local (0, 0, ±len/2) pulled in toward the cabin as the fold deepens.
    const lz = dir * (spec.len * 0.5 - 0.10 - k * 0.16);
    m4.compose(mm, x + lz * sy, y, z + lz * cy, yaw + dir * 0.06 * k, pitch, roll,
      spec.wid * 0.46, 0.8 + k * 0.3, 1);
    this.r.draw(this.crumple, mm);
  }
}

// Shared draw options — one object each, so the renderer's uniform cache works.
const HEAD_OPTS = { unlit: true, colorMul: C_HEAD };
const TAIL_DIM_OPTS = { unlit: true, colorMul: C_TAIL_DIM };
const TAIL_HOT_OPTS = { unlit: true, colorMul: C_TAIL_HOT };
const REV_OPTS = { unlit: true, colorMul: C_REV };
const GLOW_HEAD_OPTS = { unlit: true, alpha: 0.22, colorMul: C_HEAD };
const GLOW_TAIL_OPTS = { unlit: true, alpha: 0.16, colorMul: C_TAIL_DIM };
const GLOW_TAIL_HOT = { unlit: true, alpha: 0.30, colorMul: C_TAIL_HOT };

const lampState = () => ({
  head: false, headOut: 0, tail: false, brake: false, rev: false, glow: false,
  deformF: 0, deformR: 0,
});

const pm = m4.create();
function place(x, y, z, yaw, pitch, roll) {
  return m4.compose(pm, x, y, z, yaw, pitch, roll);
}

// A pole lying where it landed: the mast plus its arm, built with the base at
// the origin so pitching the model about X drops it over its own foot.
function fallenPole(rad, h, hex, armLen, armY) {
  const mb = new MeshBuilder();
  const c = rgb(hex);
  mb.cyl(0, h / 2, 0, rad, h, 5, c, 'y', false);
  mb.box(0, h - armY * 0.1 - 0.2, 0, armLen, 0.26, 0.28, c, { noBottom: true });
  return mb;
}

// Convenience for the HUD: 0..1 across the bar.
export const damagePct = (veh) => clamp(veh.damage / DAMAGE.DEAD, 0, 1);

// Put a car back the way you left it when you swap into it. G.health only keeps
// the number, so the cosmetic state is re-derived from it.
export function restoreDamage(veh, amount) {
  veh.repair();
  const d = clamp(amount || 0, 0, DAMAGE.DEAD);
  if (d <= 0) return;
  veh.damage = d;
  veh.deformF = Math.min(1, d / 90);
  if (d > DAMAGE.COSMETIC) veh.headOut = 1;
  if (d > DAMAGE.PERF) veh.pull = 1;
}
