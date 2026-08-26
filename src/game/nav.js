// Routing over the real road graph: shortest path for the GPS line, plus
// "what street am I on". Built once from MAP.roads; a few ms.
import { MAP } from './mapdata.js';

const DRIVABLE = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service']);
const PENALTY = { service: 2.6, residential: 1.25, tertiary: 1.0, secondary: 0.9, primary: 0.85, trunk: 0.8 };

export class Nav {
  constructor() {
    this.nodes = [];              // {x, z, edges: [{to, cost, len, name, cls}]}
    const byId = new Map();
    const node = (id, x, z) => {
      let n = byId.get(id);
      if (!n) { n = { i: this.nodes.length, x, z, edges: [] }; byId.set(id, n); this.nodes.push(n); }
      return n;
    };
    for (const r of MAP.roads) {
      if (!DRIVABLE.has(r.cls)) continue;
      const pen = PENALTY[r.cls] || 1;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = node(r.ids[i], r.pts[i][0], r.pts[i][1]);
        const b = node(r.ids[i + 1], r.pts[i + 1][0], r.pts[i + 1][1]);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        a.edges.push({ to: b, cost: len * pen, len, name: r.name, cls: r.cls });
        if (!r.oneway) b.edges.push({ to: a, cost: len * pen, len, name: r.name, cls: r.cls });
      }
    }
    // Spatial hash of nodes for nearest lookups.
    this.cell = 60;
    this.grid = new Map();
    for (const n of this.nodes) {
      const k = this._key(n.x, n.z);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(n);
    }
  }

  _key(x, z) { return ((x / this.cell) | 0) * 100000 + ((z / this.cell) | 0); }

  nearest(x, z) {
    let best = null, bd = Infinity;
    for (let ring = 0; ring < 6 && !best; ring++) {
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const list = this.grid.get(((x / this.cell | 0) + i) * 100000 + ((z / this.cell | 0) + j));
        if (!list) continue;
        for (const n of list) {
          const d = (n.x - x) ** 2 + (n.z - z) ** 2;
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    return best;
  }

  // Dijkstra with a binary heap. Returns [[x,z], ...] from (x0,z0) to (x1,z1).
  route(x0, z0, x1, z1) {
    const s = this.nearest(x0, z0), t = this.nearest(x1, z1);
    if (!s || !t) return null;
    const N = this.nodes.length;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = [[0, s.i]];
    dist[s.i] = 0;
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, i] = pop();
      if (i === t.i) break;
      if (d > dist[i]) continue;
      for (const e of this.nodes[i].edges) {
        const nd = d + e.cost;
        if (nd < dist[e.to.i]) { dist[e.to.i] = nd; prev[e.to.i] = i; push([nd, e.to.i]); }
      }
    }
    if (dist[t.i] === Infinity) return null;
    const path = [];
    for (let i = t.i; i !== -1; i = prev[i]) path.push([this.nodes[i].x, this.nodes[i].z]);
    path.reverse();
    path.push([x1, z1]);
    return path;
  }

  // Name of the street nearest to a point (excludes parking aisles/driveways).
  streetName(x, z) {
    let best = '', bd = 45 * 45;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.grid.get(((x / this.cell | 0) + i) * 100000 + ((z / this.cell | 0) + j));
      if (!list) continue;
      for (const n of list) for (const e of n.edges) {
        if (e.cls === 'service' || !e.name) continue;
        const ex = e.to.x - n.x, ez = e.to.z - n.z, l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - n.x) * ex + (z - n.z) * ez) / l2));
        const d = (n.x + ex * t - x) ** 2 + (n.z + ez * t - z) ** 2;
        if (d < bd) { bd = d; best = e.name; }
      }
    }
    return best;
  }
}

// Remaining length of a route from the point nearest to (x,z).
export function routeLength(path, x, z) {
  if (!path || path.length < 2) return 0;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = (path[i][0] - x) ** 2 + (path[i][1] - z) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  let L = Math.sqrt(bd);
  for (let i = bi; i + 1 < path.length; i++) L += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return L;
}
