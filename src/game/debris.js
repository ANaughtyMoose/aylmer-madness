// Debris and driving juice: the bin you just launched, the tyre smoke off a
// handbrake slide, the sparks off a wall and the glass off a hard one.
//
// Two things live here, both pooled and both allocation-free once built:
//
//   * BODIES — a knocked-over street prop that has left the baked chunk mesh
//     (streetprops.js blanked its indices) and is now a rigid-ish thing with a
//     velocity and a tumble. It flies with the car, bounces once, and settles
//     on its side. 48 of them at most; the oldest is recycled.
//   * PARTICLES — three fixed pools of unlit billboards-ish boxes: smoke,
//     sparks, glass. Same shape as DriveFx's steam in damage.js: fixed size,
//     one opts object per slot (the renderer defers transparent draws, so they
//     cannot share a mutable one), no garbage per frame.
import { MeshBuilder, rgb } from '../core/mesh.js';
import { m4 } from '../core/math.js';
import { KINDS } from './streetprops.js';

const MAX_BODIES = 48;
const SMOKE = 24, SPARKS = 28, GLASS = 24;
const GRAV = 16;              // arcade gravity: things come down where you can see them
const BOUNCE = 0.34;

const C_SMOKE = new Float32Array([0.80, 0.79, 0.76]);
const C_WATER = new Float32Array([0.74, 0.86, 0.95]);
const C_SPARK = new Float32Array([1.0, 0.78, 0.28]);
const C_GLASS = new Float32Array([0.80, 0.92, 0.96]);

const mm = m4.create();

class Pool {
  constructor(n, fields) {
    this.n = n;
    this.next = 0;
    this.p = [];
    for (let i = 0; i < n; i++) this.p.push({ ...fields });
    this.opts = [];
    for (let i = 0; i < n; i++) this.opts.push({ unlit: true, alpha: 1, colorMul: C_SMOKE });
  }
  take() {
    const q = this.p[this.next];
    this.next = (this.next + 1) % this.n;
    return q;
  }
}

export class Debris {
  constructor(renderer, kindMeshes) {
    this.r = renderer;
    this.kindMeshes = kindMeshes || {};
    this.bodies = [];
    for (let i = 0; i < MAX_BODIES; i++) {
      this.bodies.push({
        live: false, kind: '', mesh: null, cy: 0.4, rest: 0.3,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0,
        bounced: 0, settled: false, age: 0,
      });
    }
    this.nextBody = 0;
    this.smokePool = new Pool(SMOKE, { life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, spin: 0, water: 0 });
    this.sparkPool = new Pool(SPARKS, { life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, spin: 0 });
    this.glassPool = new Pool(GLASS, { life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, spin: 0 });
    this.puffMesh = renderer.upload(unitBox(0.5, 0xffffff));
    this.sparkMesh = renderer.upload(unitBox(0.5, 0xffffff));
    this.glassMesh = renderer.upload(unitBox(0.5, 0xffffff));
    this.stats = { bodies: 0, particles: 0, draws: 0 };
  }

  // --------------------------------------------------------------- spawning

  /**
   * A prop has just left the baked mesh. (vx, vz) is the car's velocity; the
   * kick and the tumble come off the kind's mass, so a bin flies and a hydrant
   * barely shifts. `y` is where the car's body was, for the JUMPS agent's
   * airborne cars.
   */
  spawn(kind, x, z, vx, vz, y = 0) {
    const K = KINDS[kind];
    if (!K) return null;
    const b = this.bodies[this.nextBody];
    this.nextBody = (this.nextBody + 1) % MAX_BODIES;
    const speed = Math.hypot(vx, vz) || 0.001;
    const k = K.kick;
    b.live = true; b.kind = kind; b.mesh = this.kindMeshes[kind] || null;
    b.cy = K.cy; b.rest = Math.min(K.cy, K.r);
    b.x = x; b.y = y + K.cy; b.z = z;
    b.vx = vx * k + (Math.random() - 0.5) * 1.4;
    b.vz = vz * k + (Math.random() - 0.5) * 1.4;
    b.vy = 1.6 + Math.min(5.5, speed * 0.30);
    b.rx = 0; b.ry = Math.random() * 6.28; b.rz = 0;
    const spin = Math.min(9, 1.2 + speed * 0.42);
    b.wx = (Math.random() - 0.5) * spin * 2;
    b.wy = (Math.random() - 0.5) * spin;
    b.wz = (Math.random() - 0.5) * spin * 2;
    b.bounced = 0; b.settled = false; b.age = 0;
    return b;
  }

  /** Tyre smoke, and (with water = true) the plume off a sheared hydrant. */
  puff(x, y, z, vx, vz, water = false) {
    const q = this.smokePool.take();
    q.life = 1;
    q.x = x; q.y = y; q.z = z;
    q.vx = vx * 0.18 + (Math.random() - 0.5) * 0.9;
    q.vz = vz * 0.18 + (Math.random() - 0.5) * 0.9;
    q.vy = water ? 3.4 + Math.random() * 1.6 : 0.55 + Math.random() * 0.55;
    q.s = water ? 0.22 : 0.30 + Math.random() * 0.22;
    q.spin = Math.random() * 3;
    q.water = water ? 1 : 0;
  }

  /** A scrape along a wall: a short-lived orange streak thrown backwards. */
  spark(x, y, z, vx, vz) {
    const q = this.sparkPool.take();
    q.life = 1;
    q.x = x; q.y = y; q.z = z;
    const sp = 2.5 + Math.random() * 4;
    const a = Math.atan2(-vx, -vz) + (Math.random() - 0.5) * 1.1;
    q.vx = Math.sin(a) * sp; q.vz = Math.cos(a) * sp;
    q.vy = 1.4 + Math.random() * 2.4;
    q.s = 0.05 + Math.random() * 0.05;
    q.spin = Math.random() * 6;
  }

  /** Broken glass off a hard impact: falls, does not bounce, fades on the road. */
  glassBurst(x, y, z, vx, vz, n = 6) {
    for (let i = 0; i < n; i++) {
      const q = this.glassPool.take();
      q.life = 1;
      q.x = x; q.y = y; q.z = z;
      q.vx = vx * 0.25 + (Math.random() - 0.5) * 5;
      q.vz = vz * 0.25 + (Math.random() - 0.5) * 5;
      q.vy = 1.8 + Math.random() * 2.6;
      q.s = 0.05 + Math.random() * 0.06;
      q.spin = Math.random() * 6;
    }
  }

  // --------------------------------------------------------------- update

  update(dt) {
    let live = 0;
    for (let i = 0; i < MAX_BODIES; i++) {
      const b = this.bodies[i];
      if (!b.live) continue;
      live++;
      b.age += dt;
      if (b.settled) {
        // Ease onto its side and stop asking questions.
        const t = Math.min(1, dt * 6);
        const want = b.rx >= 0 ? Math.PI / 2 : -Math.PI / 2;
        b.rx += (want - b.rx) * t;
        b.rz += (0 - b.rz) * t;
        b.y += (b.rest - b.y) * t;
        continue;
      }
      b.vy -= GRAV * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
      const floor = b.cy;
      if (b.y <= floor) {
        b.y = floor;
        if (b.vy < -1.6 && b.bounced < 1) {
          b.bounced++;
          b.vy = -b.vy * BOUNCE;
          b.vx *= 0.6; b.vz *= 0.6;
          b.wx *= 0.6; b.wy *= 0.6; b.wz *= 0.6;
        } else {
          b.vy = 0;
          const k = Math.exp(-5.5 * dt);
          b.vx *= k; b.vz *= k;
          b.wx *= k; b.wy *= k; b.wz *= k;
          if (Math.hypot(b.vx, b.vz) < 0.30) {
            b.vx = 0; b.vz = 0; b.wx = 0; b.wy = 0; b.wz = 0;
            b.settled = true;
          }
        }
      }
    }
    this.stats.bodies = live;

    let parts = 0;
    const S = this.smokePool.p;
    for (let i = 0; i < SMOKE; i++) {
      const q = S[i];
      if (q.life <= 0) continue;
      parts++;
      q.life -= dt * (q.water ? 1.5 : 0.85);
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vy *= 1 - 1.1 * dt;
      q.s += dt * (q.water ? 0.5 : 0.85);
    }
    const K = this.sparkPool.p;
    for (let i = 0; i < SPARKS; i++) {
      const q = K[i];
      if (q.life <= 0) continue;
      parts++;
      q.life -= dt * 3.4;
      q.vy -= 22 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.03) { q.y = 0.03; q.vy = -q.vy * 0.3; q.vx *= 0.5; q.vz *= 0.5; }
    }
    const GL = this.glassPool.p;
    for (let i = 0; i < GLASS; i++) {
      const q = GL[i];
      if (q.life <= 0) continue;
      parts++;
      q.life -= dt * 0.5;
      q.vy -= GRAV * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.04) {
        q.y = 0.04; q.vy = 0;
        q.vx *= Math.exp(-6 * dt); q.vz *= Math.exp(-6 * dt);
      }
    }
    this.stats.particles = parts;
  }

  // --------------------------------------------------------------- draw

  draw(r, focus) {
    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
    let draws = 0;
    for (let i = 0; i < MAX_BODIES; i++) {
      const b = this.bodies[i];
      if (!b.live || !b.mesh) continue;
      const dx = b.x - fx, dz = b.z - fz;
      if (dx * dx + dz * dz > 260 * 260) continue;
      m4.compose(mm, b.x, b.y, b.z, b.ry, b.rx, b.rz);
      r.draw(b.mesh, mm);
      draws++;
    }
    draws += this.drawPool(r, this.smokePool, SMOKE, this.puffMesh, fx, fz, 0.34, null);
    draws += this.drawPool(r, this.sparkPool, SPARKS, this.sparkMesh, fx, fz, 0.95, C_SPARK);
    draws += this.drawPool(r, this.glassPool, GLASS, this.glassMesh, fx, fz, 0.55, C_GLASS);
    this.stats.draws = draws;
    return draws;
  }

  drawPool(r, pool, n, mesh, fx, fz, alphaK, col) {
    let draws = 0;
    for (let i = 0; i < n; i++) {
      const q = pool.p[i];
      if (q.life <= 0) continue;
      const dx = q.x - fx, dz = q.z - fz;
      if (dx * dx + dz * dz > 190 * 190) continue;
      const s = q.s;
      m4.compose(mm, q.x, q.y, q.z, q.spin, q.spin * 0.7, 0, s, s, s);
      const o = pool.opts[i];
      o.alpha = alphaK * Math.min(1, q.life);
      o.colorMul = col || (q.water ? C_WATER : C_SMOKE);
      r.draw(mesh, mm, o);
      draws++;
    }
    return draws;
  }

  /** Test hook: how many bodies are still moving. */
  moving() {
    let n = 0;
    for (let i = 0; i < MAX_BODIES; i++) {
      const b = this.bodies[i];
      if (b.live && !b.settled) n++;
    }
    return n;
  }
}

function unitBox(s, hex) {
  const b = new MeshBuilder();
  b.box(0, 0, 0, s, s, s, rgb(hex));
  return b;
}

export { MAX_BODIES };
