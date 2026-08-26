// Ambient traffic. Not a physics sim — these cars drive the real Aylmer road
// graph from OpenStreetMap, one lane-width right of the centreline, and brake
// for whatever is in front of them, which is all you can see at 50 km/h.
import { MAP } from './mapdata.js';
import { CARS } from './cars.js';
import { clamp, angleDelta, mulberry32 } from '../core/math.js';

const TINTS = [
  [1, 1, 1], [0.72, 0.74, 0.8], [0.55, 0.6, 0.68], [0.9, 0.82, 0.66],
  [0.62, 0.72, 0.6], [0.85, 0.6, 0.55], [0.45, 0.48, 0.52], [0.78, 0.78, 0.72],
];

// Classes the AI is allowed on. Service roads are driveways and parking aisles.
const DRIVABLE = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential']);
const WANT = { trunk: 16, primary: 13, secondary: 13, tertiary: 11, residential: 9 };

const ARRIVE = 4;        // metres from the lane end point before we pick the next edge
const CULL = 420;        // beyond this from the player, teleport back into view
const NEAR_MIN = 120;    // respawn ring around the player
const NEAR_MAX = 300;
const KEEP_CLEAR = 25;   // never pop in this close to the player
const RESPAWN_COOL = 2;  // seconds between teleports for one car
const STOP_HOLD = 1.2;   // fake stop sign dwell
const CELL = 100;        // spatial hash cell for the respawn query

// Right-hand side of a heading (dx,dz) is (-dz,dx): east (1,0) → south (0,1).
// Québec drives on the right, so that is the side of the centreline we want.
const laneOffset = (w) => Math.max(1.6, w * 0.25);

export class Traffic {
  constructor(count = 12, seed = 7) {
    const rnd = mulberry32(seed);
    this.rnd = rnd;
    this.time = 0;
    // Set by main.js to a Signals instance; null means "no lights in this town".
    this.signals = null;

    // ------------------------------------------------------------ road graph
    // Nodes are OSM node ids, so ways that share an id are joined there.
    const index = new Map();         // osm id -> node array index
    const nodes = [];                // { x, z, out:[edge idx], names:Set, stop }
    const edges = [];                // directed segments
    const nodeAt = (id, x, z) => {
      let i = index.get(id);
      if (i === undefined) {
        i = nodes.length;
        index.set(id, i);
        nodes.push({ x, z, out: [], names: null, nbrs: null, stop: false });
      }
      return i;
    };
    const link = (a, b, road) => {
      const A = nodes[a], B = nodes[b];
      const dx = B.x - A.x, dz = B.z - A.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) return;
      edges.push({
        a, b, len, dx: dx / len, dz: dz / len,
        off: laneOffset(road.w), cls: road.cls, want: WANT[road.cls] || 10,
      });
      A.out.push(edges.length - 1);
      // What meets at a node tells us whether it deserves a stop sign: three
      // or more branches, carrying more than one street name.
      const nm = road.name || road.cls;
      if (!A.names) { A.names = new Set(); A.nbrs = new Set(); }
      if (!B.names) { B.names = new Set(); B.nbrs = new Set(); }
      A.names.add(nm); B.names.add(nm);
      A.nbrs.add(b); B.nbrs.add(a);
    };

    for (const road of MAP.roads) {
      if (!DRIVABLE.has(road.cls)) continue;
      const pts = road.pts, ids = road.ids;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = nodeAt(ids[i], pts[i][0], pts[i][1]);
        const b = nodeAt(ids[i + 1], pts[i + 1][0], pts[i + 1][1]);
        if (a === b) continue;
        link(a, b, road);
        if (!road.oneway) link(b, a, road);
      }
    }
    for (const n of nodes) {
      n.stop = !!n.nbrs && n.nbrs.size >= 3 && n.names.size >= 2;
      n.names = null; n.nbrs = null;
    }
    this.nodes = nodes;
    this.edges = edges;

    // ------------------------------------------------- spatial hash of edges
    // Bucketed by midpoint; only used to find somewhere to respawn near you.
    const b = MAP.bounds;
    this.gx0 = b.minX; this.gz0 = b.minZ;
    this.gw = Math.max(1, Math.ceil((b.maxX - b.minX) / CELL) + 1);
    this.gh = Math.max(1, Math.ceil((b.maxZ - b.minZ) / CELL) + 1);
    this.grid = new Map();
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i], A = nodes[e.a], B = nodes[e.b];
      const k = this.cellKey((A.x + B.x) * 0.5, (A.z + B.z) * 0.5);
      const bucket = this.grid.get(k);
      if (bucket) bucket.push(i); else this.grid.set(k, [i]);
    }

    // ---------------------------------------------------------------- spawns
    // Prefer the bigger roads for most cars so the town feels like it has a
    // main drag; the rest get dropped on side streets.
    const big = [], small = [];
    for (let i = 0; i < edges.length; i++) {
      (edges[i].cls === 'residential' ? small : big).push(i);
    }
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const pool = (rnd() < 0.6 && big.length) ? big : (small.length ? small : big);
      const ei = pool[Math.floor(rnd() * pool.length) % pool.length];
      const car = {
        x: 0, z: 0, yaw: 0, spin: 0, speed: 0, horn: 0,
        spec: CARS[Math.floor(rnd() * CARS.length)],
        tint: TINTS[Math.floor(rnd() * TINTS.length)],
        edge: ei,
        want: 10,
        pace: 0.88 + rnd() * 0.24,
        stopT: 0,
        respawnT: 0,   // cooldown, so a car cannot ping-pong across the map
      };
      this.place(car, ei, rnd());
      car.speed = car.want * 0.7;
      this.cars.push(car);
    }
  }

  cellKey(x, z) {
    const ix = clamp(Math.floor((x - this.gx0) / CELL), 0, this.gw - 1);
    const iz = clamp(Math.floor((z - this.gz0) / CELL), 0, this.gh - 1);
    return iz * this.gw + ix;
  }

  // Lane point t along an edge (0 = start, 1 = end), offset to the right.
  laneAt(e, t, out) {
    const A = this.nodes[e.a], B = this.nodes[e.b];
    const rx = -e.dz * e.off, rz = e.dx * e.off;
    out[0] = A.x + (B.x - A.x) * t + rx;
    out[1] = A.z + (B.z - A.z) * t + rz;
    return out;
  }

  place(car, ei, t) {
    const e = this.edges[ei];
    const p = this.laneAt(e, t, [0, 0]);
    car.edge = ei;
    car.x = p[0]; car.z = p[1];
    car.yaw = Math.atan2(e.dx, e.dz);
    car.want = e.want * car.pace;
    car.stopT = 0;
  }

  // Next edge out of the node we just reached. Mostly carry straight on.
  nextEdge(car) {
    const e = this.edges[car.edge];
    const out = this.nodes[e.b].out;
    if (!out.length) return -1;
    let best = -1, bestDot = -2, pick = -1, n = 0;
    for (let i = 0; i < out.length; i++) {
      const c = this.edges[out[i]];
      if (c.b === e.a) continue;               // no U-turns unless it's a dead end
      const dot = c.dx * e.dx + c.dz * e.dz;
      if (dot > bestDot) { bestDot = dot; best = out[i]; }
      n++;
      if (this.rnd() < 1 / n) pick = out[i];   // reservoir pick, for variety
    }
    if (best < 0) return out[Math.floor(this.rnd() * out.length) % out.length];
    return this.rnd() < 0.7 ? best : pick;
  }

  // Drop a car back onto a road in the 120–300 m ring around the player.
  respawn(car, player) {
    const lo = NEAR_MIN * NEAR_MIN, hi = NEAR_MAX * NEAR_MAX;
    const r = Math.ceil(NEAR_MAX / CELL) + 1;
    const cx = Math.floor((player.x - this.gx0) / CELL);
    const cz = Math.floor((player.z - this.gz0) / CELL);
    const p = [0, 0];
    let chosen = -1, chosenT = 0, seen = 0;
    for (let iz = cz - r; iz <= cz + r; iz++) {
      if (iz < 0 || iz >= this.gh) continue;
      for (let ix = cx - r; ix <= cx + r; ix++) {
        if (ix < 0 || ix >= this.gw) continue;
        const bucket = this.grid.get(iz * this.gw + ix);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = this.edges[bucket[i]];
          const A = this.nodes[e.a], B = this.nodes[e.b];
          const mx = (A.x + B.x) * 0.5 - player.x, mz = (A.z + B.z) * 0.5 - player.z;
          const d2 = mx * mx + mz * mz;
          if (d2 < lo || d2 > hi) continue;
          const t = 0.15 + this.rnd() * 0.7;
          this.laneAt(e, t, p);
          const px = p[0] - player.x, pz = p[1] - player.z;
          if (px * px + pz * pz < KEEP_CLEAR * KEEP_CLEAR) continue;
          seen++;
          if (this.rnd() < 1 / seen) { chosen = bucket[i]; chosenT = t; }
        }
      }
    }
    if (chosen < 0) { car.respawnT = RESPAWN_COOL; return false; }
    this.place(car, chosen, chosenT);
    car.speed = car.want * 0.8;
    car.horn = 0;
    car.respawnT = RESPAWN_COOL;
    return true;
  }

  update(dt, player) {
    this.time += dt;
    const tgt = [0, 0];
    for (const c of this.cars) {
      if (c.respawnT > 0) c.respawnT -= dt;

      // Keep the traffic where you can see it: a 5 km map is mostly elsewhere.
      const away = Math.hypot(c.x - player.x, c.z - player.z);
      if (away > CULL && c.respawnT <= 0) this.respawn(c, player);

      let e = this.edges[c.edge];
      this.laneAt(e, 1, tgt);
      let dx = tgt[0] - c.x, dz = tgt[1] - c.z;
      if (Math.hypot(dx, dz) < ARRIVE) {
        // Fake stop sign: three or more differently-named roads meeting here.
        if (this.nodes[e.b].stop && (e.cls === 'residential' || e.cls === 'tertiary')) {
          c.stopT = STOP_HOLD;
        }
        const nx = this.nextEdge(c);
        if (nx < 0) {
          if (c.respawnT <= 0 && this.respawn(c, player)) { /* rescued */ }
          else { c.speed = 0; }
        } else {
          c.edge = nx;
          c.want = this.edges[nx].want * c.pace;
        }
        e = this.edges[c.edge];
        this.laneAt(e, 1, tgt);
        dx = tgt[0] - c.x; dz = tgt[1] - c.z;
      }

      const want = Math.atan2(dx, dz);
      const err = angleDelta(want, c.yaw);
      // Turn rate falls off with speed so corners look like corners, not pivots.
      c.yaw += clamp(err, -1.6, 1.6) * Math.min(1, dt * (1.4 + 6 / (1 + c.speed)));

      // Brake for the player or another car sitting in our lane ahead.
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      let block = 0;
      const check = (ox, oz, rad) => {
        const rx = ox - c.x, rz = oz - c.z;
        const ahead = rx * fx + rz * fz;
        if (ahead < 0.5 || ahead > 22) return;
        const side = Math.abs(rx * fz - rz * fx);
        if (side < rad) block = Math.max(block, 1 - ahead / 22);
      };
      check(player.x, player.z, 3.2);
      for (const o of this.cars) if (o !== c) check(o.x, o.z, 2.6);

      // Traffic lights: brake into the stop bar while our axis is red or amber.
      if (this.signals) {
        const st = this.signals.stateAt(tgt[0], tgt[1], Math.atan2(e.dx, e.dz));
        if (st === 'red' || st === 'amber') {
          const gap = Math.hypot(dx, dz);
          if (gap < 26) block = Math.max(block, clamp(1.05 - gap / 26, 0, 1));
        }
      }

      if (c.stopT > 0) { c.stopT -= dt; block = Math.max(block, 0.94); }

      // Slow into corners: the sharper the heading error, the slower we go.
      const corner = 1 - Math.min(0.75, Math.abs(err) * 0.9);
      const target = c.want * corner * (1 - block);
      c.speed += clamp(target - c.speed, -14 * dt, 5 * dt);
      c.speed = Math.max(0, c.speed);
      c.x += fx * c.speed * dt;
      c.z += fz * c.speed * dt;
      c.spin += (c.speed / c.spec.wheelR) * dt;

      // Shove the player if they park in a lane; they shove back harder.
      const px = player.x - c.x, pz = player.z - c.z;
      const pd = Math.hypot(px, pz);
      const minD = (player.spec.wid + c.spec.wid) * 0.5 + 1.4;
      if (pd < minD && pd > 0.001) {
        const nx = px / pd, nz = pz / pd, pen = minD - pd;
        c.x -= nx * pen * 0.35; c.z -= nz * pen * 0.35;
        player.nudge(nx, nz, pen * 0.65);
        c.speed *= 0.5;
        c.horn = 1;
      }
      c.horn = Math.max(0, c.horn - dt);
    }
  }
}
