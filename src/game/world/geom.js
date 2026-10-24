// Small geometry helpers of the world bake (moved out of world.js unchanged, V0-02).
import { lerp } from '../../core/math.js';

// ---------------------------------------------------------------- small helpers

// Twice the signed area of a ring in (x,z). Negative == the ring, taken in order,
// winds CCW as seen from +Y, which is the winding the renderer wants for up-facing
// polygons (see MeshBuilder.flat).
export function ringArea2(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

export function pointInPoly(p, x, z) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Per-channel blend between two packed hex colours.
export function mixHex(a, b, t) {
  const r = lerp((a >> 16) & 255, (b >> 16) & 255, t) | 0;
  const g = lerp((a >> 8) & 255, (b >> 8) & 255, t) | 0;
  const bl = lerp(a & 255, b & 255, t) | 0;
  return (r << 16) | (g << 8) | bl;
}

export function distPtSeg2(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = ax + t * dx - x, pz = az + t * dz - z;
  return px * px + pz * pz;
}

// Take every `stride`-th entry so a capped population still spreads over the whole map.
// Mean of a footprint's points - which side of a seam a building is on.
export function polyCentre(p) {
  let x = 0, z = 0;
  for (let i = 0; i < p.length; i++) { x += p[i][0]; z += p[i][1]; }
  return [x / p.length, z / p.length];
}
// Where a terrain feature is, whatever shape it takes (terrain.js).
export function featureCentre(f) {
  if (f.cx != null) return [f.cx, f.cz];
  if (f.x != null) return [f.x, f.z];
  if (f.pts && f.pts.length >= 2) {
    let x = 0, z = 0, n = 0;
    for (let i = 0; i + 1 < f.pts.length; i += 2) { x += f.pts[i]; z += f.pts[i + 1]; n++; }
    return [x / n, z / n];
  }
  return [0, 0];
}
// The roads of one slice: each way is cut into runs of consecutive segments
// whose midpoints are inside, so a road that crosses a seam is built up to the
// seam by one side and from it by the other, with the crossing segment drawn
// exactly once. `ids` (OSM node ids, the intersection finder's key) are sliced
// in step with `pts`.
export function clipRoads(roads, inside) {
  const out = [];
  for (const road of roads) {
    const pts = road.pts, n = pts.length;
    if (n < 2) continue;
    let run = null;
    for (let i = 0; i < n - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
      if (inside(mx, mz)) {
        if (!run) run = { from: i, to: i + 1 }; else run.to = i + 1;
      } else if (run) { out.push(cut(road, run)); run = null; }
    }
    if (run) out.push(run.from === 0 && run.to === n - 1 ? road : cut(road, run));
  }
  return out;
}
export function cut(road, run) {
  const r = { ...road, pts: road.pts.slice(run.from, run.to + 1) };
  if (road.ids) r.ids = road.ids.slice(run.from, run.to + 1);
  return r;
}

export function subsample(list, cap) {
  if (list.length <= cap) return list;
  const stride = list.length / cap;
  const out = [];
  for (let i = 0; out.length < cap && Math.floor(i) < list.length; i += stride) {
    out.push(list[Math.floor(i)]);
  }
  return out;
}

// flat [x,z,x,z,...] -> [[x,z],...]
export function pairs(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}
// flat [x,z,dx,dz,...] -> [[x,z,dx,dz],...]
export function quads4(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 4) out.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3]]);
  return out;
}
