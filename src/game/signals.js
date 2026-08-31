// Traffic lights and stop signs, and the shared road-graph node index that
// world.js also uses to build intersection polygons.
//
// Everything here is *planned* once from MAP.roads (pure data, no GL, works
// under node) and then either baked into the static world (poles, mast arms,
// dark lamp housings, octagon signs — world.js does that) or drawn per frame
// (the single lit lamp per approach — the Signals class below).
//
// API
//   roadNodes()        -> Map(osmId -> node)   memoised; see NODE SHAPE below
//   planSignals()      -> [signal]             memoised, 6-8 major junctions
//   planStopSigns()    -> [sign]               memoised, residential approaches
//   new Signals()      -> { update(dt), stateAt(x,z,heading), playerRanRed(veh),
//                           build(renderer), draw(renderer, camX, camZ) }
//
// NODE SHAPE  { id, x, z, br:[{dx,dz,hw,cls,name,rank}], maxHw, ext, paved }
//   `br` are unit directions pointing AWAY from the node along each branch, so a
//   car arriving on that branch travels along (-dx,-dz). `ext` is how far the
//   intersection polygon reaches along every branch — stop lines and marking
//   clipping both key off it, which is why it lives here and not in world.js.
import { MAP } from './mapdata.js';
import { MeshBuilder, rgb } from '../core/mesh.js';
import { m4, angleDelta } from '../core/math.js';

export const RANK = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1, service: 0 };

// OSM commonly splits a street into two ways at a change of lanes, speed, or
// name. Both ways then contribute the same geometric branch at their shared
// node. Treating those records as separate arms creates phantom T-junctions,
// duplicate signal heads and oversized intersection polygons. Directions this
// close (about 2.6 degrees) describe the same physical arm; retain the widest
// and highest-ranked description for geometry and traffic planning.
const SAME_BRANCH_DOT = 0.999;

function addBranch(nd, branch) {
  const old = nd.br.find((b) => b.dx * branch.dx + b.dz * branch.dz >= SAME_BRANCH_DOT);
  if (!old) { nd.br.push(branch); return; }
  if (branch.hw > old.hw) old.hw = branch.hw;
  if (branch.rank > old.rank) {
    old.cls = branch.cls;
    old.rank = branch.rank;
    old.ri = branch.ri;
  }
  // Preserve a useful name when one half of a split way is unnamed.
  if (!old.name && branch.name) old.name = branch.name;
}

// One axis is green 12 s, amber 3 s, then red while the other axis runs.
export const GREEN = 12, AMBER = 3;
const HALF = GREEN + AMBER;          // 15 s per axis
const PERIOD = HALF * 2;             // 30 s full cycle

// Lamp heights on the head, red at the top like everywhere else on earth.
export const LAMP_DY = [0.44, 0, -0.44];
export const LAMP_COL = [
  new Float32Array([1.0, 0.16, 0.12]),
  new Float32Array([1.0, 0.66, 0.10]),
  new Float32Array([0.32, 1.0, 0.36]),
];
export const HEAD_Y = 5.75;

// ---------------------------------------------------------------- node index

let _nodes = null;

export function roadNodes() {
  if (_nodes) return _nodes;
  const map = new Map();
  for (let ri = 0; ri < MAP.roads.length; ri++) {
    const road = MAP.roads[ri];
    if (road.cls === 'service') continue;
    const pts = road.pts, ids = road.ids, n = pts.length;
    if (!ids || ids.length !== n) continue;
    const hw = road.w / 2, rank = RANK[road.cls] || 1;
    for (let i = 0; i < n; i++) {
      const id = ids[i];
      let nd = map.get(id);
      if (!nd) {
        nd = { id, x: pts[i][0], z: pts[i][1], br: [], maxHw: 0, ext: 0, paved: false, rank: 0 };
        map.set(id, nd);
      }
      // Branch toward the previous point, and toward the next.
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= n) continue;
        let dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1];
        const l = Math.hypot(dx, dz);
        if (l < 0.05) continue;
        addBranch(nd, { dx: dx / l, dz: dz / l, hw, cls: road.cls, name: road.name || '', rank, ri });
      }
      if (hw > nd.maxHw) nd.maxHw = hw;
      if (rank > nd.rank) nd.rank = rank;
      if (rank >= 2) nd.paved = true;
    }
  }
  for (const nd of map.values()) nd.ext = nd.maxHw * 1.05;
  _nodes = map;
  return map;
}

// True where three or more road ends meet: the ones that get a polygon.
export function isJunction(nd) { return nd.br.length >= 3; }

// ---------------------------------------------------------------- signals

// The junctions a local would actually name. Order is priority: the first eight
// that resolve to a real shared node in MAP.roads get lights.
const PAIRS = [
  ['Rue Principale', 'Boulevard Wilfrid-Lavigne'],
  ["Chemin d'Aylmer", 'Rue Principale'],
  ['Rue Principale', 'Avenue Frank-Robinson'],
  ["Chemin d'Aylmer", 'Chemin Fraser'],
  ["Chemin d'Aylmer", 'Rue Samuel-Edey'],
  ["Chemin d'Aylmer", 'Chemin Vanier'],
  ['Rue Principale', 'Rue Park'],
  ['Boulevard de Lucerne', 'Chemin Vanier'],
  ['Rue Front', 'Chemin Eardley'],
  ['Boulevard de Lucerne', 'Chemin Fraser'],
];
const MAX_SIGNALS = 8;

// Where a driver on this branch stops, where the pole goes, where the head hangs.
function approachOf(nd, b, axis) {
  const ext = nd.ext;
  // Direction of travel is INTO the node.
  const fx = -b.dx, fz = -b.dz;
  const stopX = nd.x + b.dx * (ext + 1.3), stopZ = nd.z + b.dz * (ext + 1.3);
  // Driver's right of (fx,fz) is (-fz,fx).
  const rx = -fz, rz = fx;
  const poleX = stopX + rx * (b.hw + 1.6), poleZ = stopZ + rz * (b.hw + 1.6);
  const arm = b.hw + 1.2;
  return {
    axis,
    hw: b.hw,
    x: stopX, z: stopZ,          // stop line centre-of-approach point
    dx: fx, dz: fz,              // direction of travel
    yaw: Math.atan2(fx, fz),
    poleX, poleZ,
    armX: -rx, armZ: -rz, arm,   // mast arm direction (out over the road) + length
    headX: poleX - rx * arm * 0.86,
    headZ: poleZ - rz * arm * 0.86,
    headY: HEAD_Y,
    headYaw: Math.atan2(-fx, -fz),   // lenses face back at the driver
  };
}

let _signals = null;

export function planSignals() {
  if (_signals) return _signals;
  const nodes = roadNodes();
  const out = [];
  const used = new Set();
  for (const [A, B] of PAIRS) {
    if (out.length >= MAX_SIGNALS) break;
    let best = null;
    for (const nd of nodes.values()) {
      if (used.has(nd.id) || nd.br.length < 3) continue;
      let hasA = false, hasB = false;
      for (const b of nd.br) { if (b.name === A) hasA = true; else if (b.name === B) hasB = true; }
      if (!hasA || !hasB) continue;
      if (!best || nd.br.length > best.br.length
        || (nd.br.length === best.br.length && nd.maxHw > best.maxHw)) best = nd;
    }
    if (!best) continue;
    used.add(best.id);
    const approaches = [];
    for (const b of best.br) {
      approaches.push(approachOf(best, b, b.name === A ? 0 : 1));
    }
    // Mean heading of each axis, for stateAt().
    const axisYaw = [0, 0];
    for (const a of [0, 1]) {
      const list = approaches.filter((q) => q.axis === a);
      axisYaw[a] = list.length ? Math.atan2(list[0].dx, list[0].dz) : 0;
    }
    out.push({
      name: `${A} × ${B}`, x: best.x, z: best.z, ext: best.ext,
      approaches, axisYaw, phase: (out.length % 2) * HALF,
    });
  }
  _signals = out;
  return out;
}

// ---------------------------------------------------------------- stop signs

let _stops = null;
const MAX_STOPS = 140;

// A residential street arriving at something bigger gets an octagon. That is
// exactly the rule in Aylmer: the through road never stops, you do.
export function planStopSigns() {
  if (_stops) return _stops;
  const nodes = roadNodes();
  const all = [];
  for (const nd of nodes.values()) {
    if (nd.br.length < 3) continue;
    let bigger = 0;
    for (const b of nd.br) if (b.rank >= 2) bigger++;
    if (bigger < 2) continue;                       // the through road must go both ways
    for (const b of nd.br) {
      if (b.rank !== 1) continue;                   // only residential approaches stop
      const a = approachOf(nd, b, 0);
      all.push({
        x: a.x, z: a.z, dx: a.dx, dz: a.dz, yaw: a.yaw, hw: b.hw,
        poleX: a.poleX, poleZ: a.poleZ,
        faceYaw: Math.atan2(-a.dx, -a.dz),
      });
    }
  }
  // Spread the cap over the whole town rather than taking the first N.
  if (all.length > MAX_STOPS) {
    const step = all.length / MAX_STOPS, keep = [];
    for (let i = 0; keep.length < MAX_STOPS && Math.floor(i) < all.length; i += step) {
      keep.push(all[Math.floor(i)]);
    }
    _stops = keep;
  } else _stops = all;
  return _stops;
}

// ---------------------------------------------------------------- runtime

const QUERY_R2 = 46 * 46;      // how close a query has to be to belong to a junction
const DRAW_R2 = 210 * 210;
const ARM_R2 = 34 * 34;        // player must get this far away to re-arm a red

export class Signals {
  constructor() {
    this.list = planSignals();
    this.t = 0;
    this.lamp = null;
    this._mm = m4.create();
    this._armed = new Uint8Array(this.list.length).fill(1);
    this._ran = -1;
    // Pre-built so the draw loop never allocates.
    this._opts = LAMP_COL.map((c) => ({ unlit: true, colorMul: c }));
  }

  update(dt) {
    this.t += dt;
    if (this.t > 1e6) this.t -= 1e6 - (1e6 % PERIOD);
  }

  // 0 green, 1 amber, 2 red — for one axis of one signal.
  _phase(sig, axis) {
    let u = (this.t + sig.phase + (axis ? HALF : 0)) % PERIOD;
    if (u < 0) u += PERIOD;
    if (u < GREEN) return 0;
    if (u < HALF) return 1;
    return 2;
  }

  stateName(sig, axis) { return ['green', 'amber', 'red'][this._phase(sig, axis)]; }

  // Which axis a heading belongs to: whichever axis yaw it is more parallel to,
  // ignoring direction (a car going either way down Principale is on that axis).
  _axisFor(sig, heading) {
    const par = (y) => Math.abs(Math.cos(angleDelta(heading, y)));
    return par(sig.axisYaw[0]) >= par(sig.axisYaw[1]) ? 0 : 1;
  }

  nearest(x, z) {
    let best = null, bd = QUERY_R2;
    for (const s of this.list) {
      const dx = s.x - x, dz = s.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = s; }
    }
    return best;
  }

  // 'red' | 'amber' | 'green' | null — null means "no light here, carry on".
  stateAt(x, z, heading) {
    const s = this.nearest(x, z);
    if (!s) return null;
    return this.stateName(s, this._axisFor(s, heading));
  }

  // True exactly once per pass: the player entered the box on a red, moving.
  playerRanRed(veh) {
    let ran = false;
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i];
      const dx = veh.x - s.x, dz = veh.z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > ARM_R2) { this._armed[i] = 1; continue; }
      if (!this._armed[i]) continue;
      const box = s.ext + 3;
      if (d2 > box * box) continue;
      const sp = Math.abs(veh.vLong !== undefined ? veh.vLong : 0);
      if (sp < 4) continue;                                  // crawling through is not running it
      if (this._phase(s, this._axisFor(s, veh.yaw)) !== 2) continue;
      this._armed[i] = 0;
      this._ran = i;
      ran = true;
    }
    return ran;
  }

  // One small box, reused for every lit lamp.
  build(renderer) {
    const b = new MeshBuilder();
    b.box(0, 0, 0, 0.34, 0.34, 0.16, rgb(0xffffff), { noBottom: false });
    this.lamp = renderer.upload(b);
    return this;
  }

  // One draw per visible approach — a town centre shows four, most of the map none.
  draw(renderer, camX, camZ) {
    if (!this.lamp) return 0;
    let n = 0;
    for (const s of this.list) {
      const dx = s.x - camX, dz = s.z - camZ;
      if (dx * dx + dz * dz > DRAW_R2) continue;
      for (const a of s.approaches) {
        const ph = this._phase(s, a.axis);
        m4.compose(this._mm, a.headX, a.headY + LAMP_DY[ph], a.headZ, a.headYaw, 0, 0);
        // Nudge the lit lens proud of the baked housing so it never z-fights.
        this._mm[12] += Math.sin(a.headYaw) * 0.13;
        this._mm[14] += Math.cos(a.headYaw) * 0.13;
        renderer.draw(this.lamp, this._mm, this._opts[ph]);
        n++;
      }
    }
    return n;
  }
}
