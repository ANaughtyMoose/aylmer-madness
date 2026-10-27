// Service ways cut back from hero walls (w7-walls, 27 Oct 2026).
//
// OSM draws school loops and lot aisles straight through buildings that the hero
// sites (landmarks.js) rebuild bigger or in a different plan. The asphalt then
// promises a route that a wall takes away. tools/smoke_landmark_roads.mjs lists
// every such crossing (SERVICE_KNOWN) and the lead ruled on each one
// (references/review/redteam-2026-10-20/SERVICE-WALLS.md). Where the ruling was
// CUT, this runs over the merged map once, at import, from mapdata.js:
//
//   cut     the way stops CLEAR metres of verge short of the wall (its asphalt
//           edge, not its centreline), so a lane that ran into a building now
//           ends at the door; pieces shut inside a building are dropped;
//   detour  the way leaves the wall at the same distance and goes round the
//           corner instead, so a lot loop that clipped a store corner stays a
//           loop.
//
// The rings repeat the hero walls by hand: this module is imported by
// mapdata.js, which landmarks.js imports, so it cannot import landmarks.js. If
// a hero wall moves, the roads smoke fails until the ring here moves with it.
// Ways are found by their first OSM node id (the generated data carries node
// ids, not way ids). New end points get negative ids, so they never join
// anything else in the road graph. Pure data, a few ms.

const CLEAR = 0.4;          // m of verge between a cut way's asphalt and the wall
const ROUND = 0.15;         // m extra a detour keeps off the corner itself
const STEP = 0.2;           // m between samples along a way
const MIN_PIECE = 3;        // m: a shorter leftover is not worth paving

function rect(cx, cz, w, d, yaw = 0) {
  const co = Math.cos(yaw), si = Math.sin(yaw), hw = w / 2, hd = d / 2;
  const P = (u, v) => [cx + u * co - v * si, cz + u * si + v * co];
  return [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)];
}

// The PWHS comb (landmarks.js buildPWHS): blocks, gym, auditorium, the five
// links and the lobby. All axis aligned.
const PWHS = [
  [6800, -8012, 84, 24], [6706, -8062, 22, 88], [6790, -8146, 172, 20], [6896, -8130, 44, 30],
  [6890, -8012, 34, 36], [6884, -8074, 30, 26],
  [6857, -8012, 32, 12], [6890, -8046, 22, 34], [6738, -8010, 46, 12], [6706, -8122, 20, 40],
  [6800, -8080, 12, 120], [6800, -7996.4, 26, 7.5],
].map(([x, z, w, d]) => rect(x, z, w, d));

export const SERVICE_CUTS = [
  // Philemon Wright High: four school lanes ran in one face and out the other.
  { site: 'pwhs', mode: 'cut', ways: [1317513374, 13508458957, 13250029554, 5557762803], rings: PWHS },
  // Loblaws: the lot loop clipped the north-east corner of the small-shops parade
  // (historicstrip.js, shop(K,1003,-339,24,65,..,-.205)); it now goes round it.
  { site: 'loblaws', mode: 'detour', ways: [1025191749], rings: [rect(1003, -339, 24, 65, -0.205)] },
];

// Signed-ish distance from a point to a convex ring: 0 inside, else to the edge.
function inside(ring, x, z) {
  let pos = 0, neg = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c > 0) pos++; else if (c < 0) neg++;
  }
  return !(pos && neg);
}
function distRing(ring, x, z) {
  if (inside(ring, x, z)) return 0;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l));
    best = Math.min(best, Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z));
  }
  return best;
}

// The ring pushed out by e, corners kept sharp (always further than e).
function grow(ring, e) {
  const n = ring.length, N = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = s > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    N.push([sgn * (b[1] - a[1]) / L, -sgn * (b[0] - a[0]) / L]);
  }
  return ring.map((v, i) => {
    const n1 = N[(i + n - 1) % n], n2 = N[i], k = e / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [v[0] + (n1[0] + n2[0]) * k, v[1] + (n1[1] + n2[1]) * k];
  });
}

// Walk a way and split it into the stretches that keep `clear` off every ring.
// Each stretch: { pts, ids, from, to } where from/to say whether it starts or
// ends at a cut (true) or at the way's own end (false).
function stretches(road, rings, clear, newId) {
  const blocked = (x, z) => rings.some((r) => distRing(r, x, z) < clear);
  const out = [];
  let cur = null;
  const p0 = road.pts[0];
  let prev = blocked(p0[0], p0[1]);
  if (!prev) cur = { pts: [[p0[0], p0[1]]], ids: [road.ids[0]], from: false, to: false, hitFrom: null };
  for (let j = 0; j + 1 < road.pts.length; j++) {
    const a = road.pts[j], b = road.pts[j + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / STEP));
    let t0 = 0;
    for (let i = 1; i <= n; i++) {
      const t1 = i / n, x = a[0] + (b[0] - a[0]) * t1, z = a[1] + (b[1] - a[1]) * t1;
      const now = blocked(x, z);
      if (now !== prev) {
        let lo = t0, hi = t1;
        for (let k = 0; k < 24; k++) {
          const m = (lo + hi) / 2;
          if (blocked(a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m) === prev) lo = m; else hi = m;
        }
        const t = prev ? hi : lo;          // stay on the clear side
        const q = [Math.round((a[0] + (b[0] - a[0]) * t) * 100) / 100,
          Math.round((a[1] + (b[1] - a[1]) * t) * 100) / 100];
        if (prev) {
          cur = { pts: [q], ids: [newId()], from: true, to: false, seg: j };
        } else {
          cur.pts.push(q); cur.ids.push(newId()); cur.to = true; cur.segTo = j;
          out.push(cur); cur = null;
        }
        prev = now;
      }
      t0 = t1;
    }
    if (cur) { cur.pts.push([b[0], b[1]]); cur.ids.push(road.ids[j + 1]); }
  }
  if (cur) out.push(cur);
  // A cut that lands within half a metre of a clear OSM vertex gives way to it:
  // no slivers of segment, and the vertex keeps its id (it may be a junction).
  for (const p of out) {
    const near = (i, j) => Math.hypot(p.pts[i][0] - p.pts[j][0], p.pts[i][1] - p.pts[j][1]) < 0.5;
    if (p.from && p.pts.length > 2 && near(0, 1)) { p.pts.shift(); p.ids.shift(); }
    const n = p.pts.length;
    if (p.to && n > 2 && near(n - 1, n - 2)) { p.pts.pop(); p.ids.pop(); }
  }
  return out;
}

const lengthOf = (pts) => {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return s;
};

// The way round a ring from p to q along its grown outline, the short way.
function around(ring, p, q) {
  const n = ring.length;
  const where = (pt) => {               // edge index and position along the outline
    let best = Infinity, at = 0;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1];
      const l = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * ex + (pt[1] - a[1]) * ez) / l));
      const d = Math.hypot(a[0] + ex * t - pt[0], a[1] + ez * t - pt[1]);
      if (d < best) { best = d; at = i + t; }
    }
    return at;
  };
  const s = where(p), e = where(q);
  const fwd = [], back = [];
  for (let k = Math.floor(s) + 1, g = 0; g < n; k++, g++) {     // forward: vertices after s up to e
    const idx = k % n;
    if (((idx - s + n) % n) > ((e - s + n) % n)) break;
    fwd.push(ring[idx]);
  }
  for (let k = Math.ceil(s) - 1 + n, g = 0; g < n; k--, g++) {   // backward
    const idx = ((k % n) + n) % n;
    if (((s - idx + n) % n) > ((s - e + n) % n)) break;
    back.push(ring[idx]);
  }
  return lengthOf([p, ...fwd, q]) <= lengthOf([p, ...back, q]) ? fwd : back;
}

export function applyServiceCuts(map) {
  if (!map || map.expansions?.serviceCuts) return map;
  let next = -1e12;
  const newId = () => next--;
  const extra = [], drop = new Set();
  const want = new Map();
  for (const c of SERVICE_CUTS) for (const id of c.ways) want.set(id, c);
  for (const road of map.roads) {
    if (road.cls !== 'service' || !road.ids || !want.has(road.ids[0])) continue;
    const c = want.get(road.ids[0]), clear = road.w / 2 + CLEAR;
    const parts = stretches(road, c.rings, clear, newId);
    const cut = parts.some((p) => p.from || p.to) || !parts.length;
    if (!cut) continue;
    if (c.mode === 'detour' && parts.length >= 2 && !parts[0].from && !parts[parts.length - 1].to) {
      // Stitch every gap round the ring that caused it.
      const pts = [...parts[0].pts], ids = [...parts[0].ids];
      for (let k = 1; k < parts.length; k++) {
        const p = pts[pts.length - 1], q = parts[k].pts[0];
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        let ring = c.rings[0], bd = Infinity;
        for (const r of c.rings) { const d = distRing(r, mid[0], mid[1]); if (d < bd) { bd = d; ring = r; } }
        for (const v of around(grow(ring, clear + ROUND), p, q)) {
          pts.push([Math.round(v[0] * 100) / 100, Math.round(v[1] * 100) / 100]); ids.push(newId());
        }
        pts.push(...parts[k].pts); ids.push(...parts[k].ids);
      }
      road.pts = pts; road.ids = ids;
      continue;
    }
    const keep = parts.filter((p) => p.pts.length >= 2 && lengthOf(p.pts) >= MIN_PIECE);
    if (!keep.length) { drop.add(road); continue; }
    road.pts = keep[0].pts; road.ids = keep[0].ids;
    for (const p of keep.slice(1)) extra.push({ ...road, pts: p.pts, ids: p.ids });
  }
  if (drop.size) map.roads = map.roads.filter((r) => !drop.has(r));
  map.roads.push(...extra);
  map.expansions = { ...(map.expansions || {}), serviceCuts: true };
  return map;
}
