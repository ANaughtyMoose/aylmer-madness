// Pedestrians. Aylmer walks its dogs and its groceries up and down the same
// sidewalks you are about to drive on, and — this being Midtown Madness and not
// the other game — it always, always gets out of the way.
//
// A ped is a parametric position on one sidewalk run (world.js section 9):
// `wi` picks the run, `s` is arc length along it, `off` is how far sideways it
// has strayed from the line. That makes everything cheap: walking is `s +=`,
// diving is `off +=`, getting back up is `off` decaying, and there is never a
// path to re-find. The pool is fixed at 60 records built once; nothing in
// update() or draw() allocates.
//
// Behaviour:
//   WALK   1.2-1.6 m/s, turn around at the end of the block, stop for a bit
//   DIVE   a car (yours or traffic's) is inside 12 m, doing more than 15 km/h,
//          and pointed at them: half a second of sideways jump, arms up, yell
//   DOWN   flat on the grass for about a second
//   GETUP  up, shake a fist at you, walk on
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { m4, clamp, mulberry32 } from '../core/math.js';
// Story agent: the dive already plays heille(); this is what the man actually
// said. Rate-limited inside heckle.js, so calling it on every dive is fine.
import { heckle } from './heckle.js';

const POOL = 60;            // records built once, alive or not
const TARGET = 52;          // how many we try to keep alive around you
const SPAWN_R = 115;        // spawn ring (metres) — tight enough that a street
const SPAWN_MIN = 24;       // has a dozen people on it, not one every 300 m
const KEEP_R = 200;         // beyond this they are recycled
const DRAW_R = 180;         // distance cull
const MAX_DRAWN = 40;       // hard ceiling on peds in a frame...
const MAX_DRAWS = 56;       // ...and on the draw calls they are allowed
const NEAR_LOD = 30;        // inside this the legs are their own two draws

const WALK = 0, STAND = 1, DIVE = 2, DOWN = 3, GETUP = 4;

const SEE = 12;             // how far ahead of a car a ped notices it
const SEE_KMH = 15;         // ...and how fast it has to be going
const SEE_LAT = 2.6;        // half-width of the lane they consider lethal
const SEE_TTC = 1.7;        // seconds to impact that trigger the dive
const GRAZE = 1.2;          // inside this it counts as a near miss
const OFF_MAX = 3.4, OFF_MIN = -1.0;

// Three people, roughly: a tuque-and-parka, a hoodie, a hi-vis jacket.
const OUTFITS = [
  { shirt: 0x8f3b32, pants: 0x2f3a4a, skin: 0xc79a72, hair: 0x2e2620 },
  { shirt: 0x3d5a7a, pants: 0x3b3f45, skin: 0x8a5f3f, hair: 0x1c1815 },
  { shirt: 0xc9b23c, pants: 0x44484d, skin: 0xe0b892, hair: 0x6a4a2c },
];

const HIP = 0.86, HEAD_Y = 1.58, TOP = 1.76;
const mm = m4.create();

// ---------------------------------------------------------------- meshes

function torsoInto(b, o, armsUp) {
  const skin = rgb(o.skin), shirt = rgb(o.shirt);
  b.box(0, 1.16, 0, 0.40, 0.60, 0.24, shirt, { noBottom: true });     // body
  b.box(0, HEAD_Y, 0, 0.22, 0.24, 0.22, skin, { noBottom: true });    // head
  b.box(0, TOP - 0.05, 0, 0.24, 0.08, 0.24, rgb(o.hair));             // hair
  for (const sx of [-0.26, 0.26]) {
    if (armsUp) {
      b.box(sx * 1.05, 1.44, 0, 0.12, 0.52, 0.12, shade(o.shirt, 1.08), { noBottom: true });
      b.box(sx * 1.12, 1.72, 0, 0.11, 0.11, 0.11, skin, { noBottom: true });
    } else {
      b.box(sx, 1.14, 0, 0.12, 0.54, 0.12, shade(o.shirt, 1.08), { noBottom: true });
      b.box(sx, 0.84, 0, 0.11, 0.11, 0.11, skin, { noBottom: true });
    }
  }
}

function legsInto(b, o) {
  const pants = rgb(o.pants);
  for (const sx of [-0.11, 0.11]) {
    b.box(sx, HIP / 2, 0, 0.16, HIP, 0.18, pants, { noBottom: true });
  }
  for (const sx of [-0.11, 0.11]) b.box(sx, 0.04, 0.03, 0.17, 0.08, 0.26, rgb(0x241f1c));
}

// One leg, origin at the hip so a pitch swings it from the top.
function buildLeg(o) {
  const b = new MeshBuilder();
  b.box(0, -HIP / 2, 0, 0.16, HIP, 0.18, rgb(o.pants), { noBottom: true });
  b.box(0, -HIP + 0.04, 0.03, 0.17, 0.08, 0.26, rgb(0x241f1c));
  return b;
}

function buildTorso(o, armsUp) {
  const b = new MeshBuilder();
  torsoInto(b, o, armsUp);
  return b;
}

function buildWhole(o, armsUp) {
  const b = new MeshBuilder();
  torsoInto(b, o, armsUp);
  legsInto(b, o);
  return b;
}

// ---------------------------------------------------------------- the crowd

export class Peds {
  constructor(renderer, world, seed = 0x5eed17) {
    this.r = renderer;
    this.world = world;
    this.rnd = mulberry32(seed);
    this.time = 0;
    this.spawnT = 0;
    this.yellT = 0;
    this.onDive = null;        // (ped, car, isPlayer) — set by reactive.js
    this.onGraze = null;

    this.mesh = { torso: [], torsoUp: [], leg: [], whole: [], wholeUp: [] };
    for (const o of OUTFITS) {
      this.mesh.torso.push(renderer.upload(buildTorso(o, false)));
      this.mesh.torsoUp.push(renderer.upload(buildTorso(o, true)));
      this.mesh.leg.push(renderer.upload(buildLeg(o)));
      this.mesh.whole.push(renderer.upload(buildWhole(o, false)));
      this.mesh.wholeUp.push(renderer.upload(buildWhole(o, true)));
    }

    this.list = [];
    for (let i = 0; i < POOL; i++) {
      this.list.push({
        live: false, wi: -1, s: 0, dir: 1, spd: 1.35, off: 0.55, base: 0.55,
        x: 0, z: 0, yaw: 0, y: 0, vy: 0, lean: 0,
        state: WALK, t: 0, phase: 0, outfit: 0, grazed: false, grazeT: 0, diveSign: 1,
      });
    }
    this.alive = 0;
    // Threat list, rebuilt each frame into the same 16 records.
    this.threats = [];
    for (let i = 0; i < 16; i++) {
      this.threats.push({ x: 0, z: 0, fx: 0, fz: 1, rx: 1, rz: 0, spd: 0, player: false, ref: null });
    }
    this.nThreat = 0;
    this.wgt = new Float32Array(512);
    this.stats = { alive: 0, drawn: 0, shown: 0, diving: 0 };
  }

  // ------------------------------------------------------------- placement

  // World position of `s` along walk `wi`, plus `off` along its outward normal.
  // Writes into `p` (x, z, yaw, nx, nz) — no allocation.
  at(wi, s, off, p) {
    const w = this.world.walks[wi];
    const step = this.world.walkStep;
    const i = clamp(Math.floor(s / step), 0, w.n - 2);
    const t = clamp((s - i * step) / step, 0, 1);
    const o = i * 2;
    const ax = w.pts[o], az = w.pts[o + 1], bx = w.pts[o + 2], bz = w.pts[o + 3];
    let dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    // The run was pushed out along (-dz, dx) * side, so that is "away from the road".
    p.nx = -dz * w.side; p.nz = dx * w.side;
    p.x = ax + (bx - ax) * t + p.nx * off;
    p.z = az + (bz - az) * t + p.nz * off;
    p.dx = dx; p.dz = dz;
    return p;
  }

  spawn(px, pz) {
    const list = this.world.queryWalks(px, pz, SPAWN_R);
    if (!list.length) return false;
    // Weighted pick, 1/(20+d)^2 on the distance to the run's midpoint. Uniform
    // over every run inside 115 m puts one person on each of sixty streets,
    // which from the driver's seat is an empty town; this puts a dozen on the
    // one you are looking down and a scattering on the rest.
    const n = Math.min(list.length, this.wgt.length);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const w = this.world.walks[list[i]];
      const dx = w.cx - px, dz = w.cz - pz;
      const k = 20 + Math.sqrt(dx * dx + dz * dz);
      total += (this.wgt[i] = 1 / (k * k));
    }
    for (let tries = 0; tries < 8; tries++) {
      let t = this.rnd() * total, k = 0;
      while (k < n - 1 && (t -= this.wgt[k]) > 0) k++;
      const wi = list[k];
      const w = this.world.walks[wi];
      if (!w || w.len < 12) continue;
      const s = 2 + this.rnd() * (w.len - 4);
      const base = 0.35 + this.rnd() * 0.5;
      this.at(wi, s, base, SC);
      const d2 = (SC.x - px) ** 2 + (SC.z - pz) ** 2;
      if (d2 < SPAWN_MIN * SPAWN_MIN || d2 > SPAWN_R * SPAWN_R) continue;
      const p = this.free();
      if (!p) return false;
      p.live = true; p.wi = wi; p.s = s; p.dir = this.rnd() < 0.5 ? 1 : -1;
      p.spd = 1.2 + this.rnd() * 0.4;
      p.off = base; p.base = base;
      p.state = this.rnd() < 0.12 ? STAND : WALK;
      p.t = p.state === STAND ? 1 + this.rnd() * 3 : 0;
      p.phase = this.rnd() * 6.28;
      p.outfit = (this.rnd() * OUTFITS.length) | 0;
      p.y = 0; p.vy = 0; p.lean = 0; p.grazed = false; p.grazeT = 0;
      p.x = SC.x; p.z = SC.z;
      p.yaw = Math.atan2(SC.dx * p.dir, SC.dz * p.dir);
      this.alive++;
      return true;
    }
    return false;
  }

  free() {
    for (let i = 0; i < POOL; i++) if (!this.list[i].live) return this.list[i];
    return null;
  }

  // ------------------------------------------------------------- update

  update(dt, G) {
    const w = this.world;
    if (!w || !w.walks || !w.walks.length) return;
    const v = G.veh;
    if (!v) return;
    this.time += dt;
    if (this.yellT > 0) this.yellT -= dt;

    // --- who is dangerous this frame: you, plus the traffic near you
    let n = 0;
    this.pushThreat(n++, v, true);
    const cars = (G.traffic && G.traffic.cars) || null;
    if (cars) {
      for (let i = 0; i < cars.length && n < this.threats.length; i++) {
        const c = cars[i];
        const dx = c.x - v.x, dz = c.z - v.z;
        if (dx * dx + dz * dz > 160 * 160) continue;
        this.pushThreat(n++, c, false);
      }
    }
    this.nThreat = n;

    // --- top the crowd up, a few at a time, a few times a second
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.25;
      for (let i = 0; i < POOL; i++) {
        const p = this.list[i];
        if (!p.live) continue;
        const dx = p.x - v.x, dz = p.z - v.z;
        if (dx * dx + dz * dz > KEEP_R * KEEP_R) { p.live = false; this.alive--; }
      }
      for (let k = 0; k < 6 && this.alive < TARGET; k++) if (!this.spawn(v.x, v.z)) break;
    }

    // --- behaviour
    let diving = 0;
    for (let i = 0; i < POOL; i++) {
      const p = this.list[i];
      if (!p.live) continue;
      const walk = w.walks[p.wi];
      if (!walk) { p.live = false; this.alive--; continue; }

      if (p.state === WALK || p.state === STAND) {
        if (p.state === WALK) {
          p.s += p.dir * p.spd * dt;
          p.phase += p.spd * dt * 3.1;
          if (p.s > walk.len - 1.2) { p.s = walk.len - 1.2; p.dir = -1; }
          else if (p.s < 1.2) { p.s = 1.2; p.dir = 1; }
          if (this.rnd() < dt * 0.06) { p.state = STAND; p.t = 1.2 + this.rnd() * 3.2; }
        } else {
          p.t -= dt;
          if (p.t <= 0) { p.state = WALK; p.dir = this.rnd() < 0.5 ? 1 : -1; }
        }
        // drift back to their side of the pavement
        if (p.off !== p.base) {
          const d = p.base - p.off;
          const step = 1.1 * dt;
          p.off += Math.abs(d) < step ? d : Math.sign(d) * step;
        }
        this.threatCheck(p, dt, G);
      } else if (p.state === DIVE) {
        diving++;
        p.t += dt;
        p.off = clamp(p.off + p.diveSign * 6.5 * dt, OFF_MIN, OFF_MAX);
        p.s += p.dir * 1.2 * dt;
        p.vy -= 15 * dt;
        p.y += p.vy * dt;
        p.lean = Math.min(1.35, p.lean + dt * 3.6);
        if (p.y <= 0) { p.y = 0; p.vy = 0; p.state = DOWN; p.t = 0.55 + this.rnd() * 0.5; }
      } else if (p.state === DOWN) {
        p.t -= dt;
        p.lean = 1.45;
        if (p.t <= 0) { p.state = GETUP; p.t = 0.95; }
      } else if (p.state === GETUP) {
        p.t -= dt;
        p.lean = Math.max(0, p.lean - dt * 1.7);
        p.phase += dt * 14;              // the fist
        if (p.t <= 0) { p.state = WALK; p.lean = 0; }
      }

      p.s = clamp(p.s, 0.5, walk.len - 0.5);
      this.at(p.wi, p.s, p.off, SC);
      p.x = SC.x; p.z = SC.z;
      if (p.state === WALK) p.yaw = Math.atan2(SC.dx * p.dir, SC.dz * p.dir);
      // A near miss counts wherever they are in the sequence — the dive can put
      // them clear before the bumper arrives, and that is still « frôlé ».
      if (p.grazeT > 0) { p.grazeT -= dt; if (p.grazeT <= 0) p.grazed = false; }
      else this.grazeCheck(p, G);
    }
    this.stats.alive = this.alive;
    this.stats.diving = diving;
  }

  pushThreat(i, c, player) {
    const t = this.threats[i];
    t.x = c.x; t.z = c.z;
    t.fx = Math.sin(c.yaw); t.fz = Math.cos(c.yaw);
    t.rx = Math.cos(c.yaw); t.rz = -Math.sin(c.yaw);
    t.spd = player ? Math.abs(c.vLong) : Math.abs(c.speed || 0);
    t.player = player;
    t.ref = c;
  }

  // Is anything pointed at this ped fast enough to be worth jumping for?
  threatCheck(p, dt, G) {
    const min = SEE_KMH / 3.6;
    this.at(p.wi, p.s, p.off, SC);        // SC.nx/nz: which way is away from the road
    for (let i = 0; i < this.nThreat; i++) {
      const t = this.threats[i];
      if (t.spd < min) continue;
      const dx = p.x - t.x, dz = p.z - t.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > SEE * SEE) continue;
      const fd = dx * t.fx + dz * t.fz;
      if (fd < -1) continue;
      const lat = dx * t.rx + dz * t.rz;
      if (lat > SEE_LAT || lat < -SEE_LAT) continue;
      if (fd / t.spd > SEE_TTC) continue;
      // Off the car's line, and by preference away from the road — a Midtown
      // ped ends up on the lawn, not under the oncoming lane. Only a car that
      // is clearly coming AT them from the lawn side sends them the other way,
      // and OFF_MIN keeps even that inside a metre of the kerb.
      const sg = lat >= 0 ? 1 : -1;
      const dot = (t.rx * sg) * SC.nx + (t.rz * sg) * SC.nz;
      p.diveSign = dot < -0.6 ? -1 : 1;
      p.state = DIVE; p.t = 0; p.vy = 2.4; p.y = 0.01; p.lean = 0;
      // face away from what is about to hit them
      p.yaw = Math.atan2(dx, dz);
      if (this.yellT <= 0 && G.audio && G.audio.heille) {
        this.yellT = 0.32;
        G.audio.heille();
      }
      if (this.onDive) this.onDive(p, t.ref, t.player);
      if (t.player) heckle.say('Piéton', 'dive');
      return;
    }
  }

  // Inside 1.2 m of a moving car's centre: « tu l'as frôlé ». One per ped per
  // three seconds, so a car sitting on top of somebody is not a slot machine.
  grazeCheck(p, G) {
    for (let i = 0; i < this.nThreat; i++) {
      const t = this.threats[i];
      if (t.spd < 2) continue;
      const dx = p.x - t.x, dz = p.z - t.z;
      if (dx * dx + dz * dz > GRAZE * GRAZE) continue;
      p.grazed = true; p.grazeT = 3;
      if (this.onGraze) this.onGraze(p, t.ref, t.player);
      return;
    }
  }

  // ------------------------------------------------------------- draw

  draw(r, focus) {
    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
    const near2 = NEAR_LOD * NEAR_LOD, far2 = DRAW_R * DRAW_R;
    let drawn = 0, shown = 0;
    for (let i = 0; i < POOL && shown < MAX_DRAWN && drawn < MAX_DRAWS; i++) {
      const p = this.list[i];
      if (!p.live) continue;
      const dx = p.x - fx, dz = p.z - fz;
      const d2 = dx * dx + dz * dz;
      if (d2 > far2) continue;
      const down = p.state !== WALK && p.state !== STAND;
      const M = this.mesh;
      if (down) {
        // One draw: arms up, tipped over on its own feet.
        m4.compose(mm, p.x, p.y, p.z, p.yaw, -p.lean, 0);
        r.draw(M.wholeUp[p.outfit], mm);
        drawn++; shown++;
        continue;
      }
      const bob = p.state === WALK ? Math.abs(Math.sin(p.phase)) * 0.035 : 0;
      if (d2 > near2) {
        m4.compose(mm, p.x, bob, p.z, p.yaw, 0, 0);
        r.draw(M.whole[p.outfit], mm);
        drawn++; shown++;
        continue;
      }
      m4.compose(mm, p.x, bob, p.z, p.yaw, 0, 0);
      r.draw(M.torso[p.outfit], mm);
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      const swing = p.state === WALK ? Math.sin(p.phase) * 0.55 : 0;
      for (let k = 0; k < 2; k++) {
        const lx = k === 0 ? -0.11 : 0.11;
        m4.compose(mm, p.x + lx * cy, bob + HIP, p.z - lx * sy, p.yaw,
          k === 0 ? swing : -swing, 0);
        r.draw(M.leg[p.outfit], mm);
      }
      drawn += 3; shown++;
    }
    this.stats.drawn = drawn;
    this.stats.shown = shown;
    return drawn;
  }
}

// Scratch for at() — one record, reused everywhere.
const SC = { x: 0, z: 0, nx: 0, nz: 0, dx: 0, dz: 1 };

export { WALK, STAND, DIVE, DOWN, GETUP, POOL, TARGET, SEE, SEE_KMH, GRAZE };
