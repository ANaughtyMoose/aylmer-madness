// Factories for synchronous gameplay queries backed by transferred data.
// Integration will use these on both build paths; no MAP or renderer import.
import { ROAD_CELL } from './consts.js';
import { distPtSeg2 } from './geom.js';
import { installSegmentQuery } from './colliders.js';
import { packIndexGrid, unpackIndexGrid } from './worker-packet.js';

export const worldGridKey = (i, j) => (i + 256) * 512 + (j + 256);

export function packSegmentQueries({ segs, segGrid }) {
  return { segs: Float64Array.from(segs), grid: packIndexGrid(segGrid) };
}

export function restoreSegmentQueries(packet) {
  const ctx = { segs: packet.segs, segGrid: unpackIndexGrid(packet.grid), gkey: worldGridKey };
  installSegmentQuery(ctx);
  return ctx;
}

export function packRoadQueries({ roadSegArr, roadGrid, nearArr, roads }) {
  const service = new Uint8Array(roadSegArr.length / 7);
  for (let i = 0; i < service.length; i++) {
    service[i] = roads[roadSegArr[i * 7 + 6]].cls === 'service' ? 1 : 0;
  }
  return {
    segments: Float64Array.from(roadSegArr), grid: packIndexGrid(roadGrid),
    nearest: Float64Array.from(nearArr), names: roads.map((r) => r.name || ''), service,
  };
}

export function restoreRoadQueries(packet) {
  const roadSegArr = packet.segments, nearArr = packet.nearest;
  const roadGrid = unpackIndexGrid(packet.grid);
  function roadAt(x, z) {
    const arr = roadGrid.get(worldGridKey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
    if (!arr) return false;
    for (const id of arr) {
      const o = id * 7;
      if (distPtSeg2(x, z, roadSegArr[o], roadSegArr[o + 1], roadSegArr[o + 2], roadSegArr[o + 3])
        <= roadSegArr[o + 4]) return true;
    }
    return false;
  }
  function pavedAt(x, z, skip, margin, streetsOnly = false) {
    const arr = roadGrid.get(worldGridKey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
    if (!arr) return false;
    for (const id of arr) {
      const o = id * 7;
      if (roadSegArr[o + 6] === skip) continue;
      if (streetsOnly && packet.service[id]) continue;
      const r = roadSegArr[o + 5] + margin;
      if (distPtSeg2(x, z, roadSegArr[o], roadSegArr[o + 1], roadSegArr[o + 2], roadSegArr[o + 3])
        <= r * r) return true;
    }
    return false;
  }
  function streetClear(x, z, margin = 2.6) {
    const ix = Math.floor(x / ROAD_CELL), iz = Math.floor(z / ROAD_CELL);
    for (let i = ix - 1; i <= ix + 1; i++) for (let j = iz - 1; j <= iz + 1; j++) {
      for (const id of roadGrid.get(worldGridKey(i, j)) || []) {
        const o = id * 7, r = roadSegArr[o + 5] + margin;
        if (distPtSeg2(x, z, roadSegArr[o], roadSegArr[o + 1], roadSegArr[o + 2], roadSegArr[o + 3])
          < r * r) return false;
      }
    }
    return true;
  }
  function nearestRoad(x, z) {
    let best = Infinity, bx = x, bz = z, byaw = 0, bname = '';
    for (let o = 0; o < nearArr.length; o += 5) {
      const ax = nearArr[o], az = nearArr[o + 1], qx = nearArr[o + 2], qz = nearArr[o + 3];
      const dx = qx - ax, dz = qz - az, l2 = dx * dx + dz * dz;
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const px = ax + t * dx, pz = az + t * dz;
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      if (d2 < best) {
        best = d2; bx = px; bz = pz; byaw = Math.atan2(dx, dz);
        bname = packet.names[nearArr[o + 4]];
      }
    }
    return { x: bx, z: bz, yaw: byaw, name: bname, dist: Math.sqrt(best) };
  }
  return { roadAt, pavedAt, streetClear, nearestRoad };
}

// Flatten actual post-override footprints. Do not recover them from MAP on the
// main thread, where that would lose corrections such as fraserFootprint().
export function packBuildingQueries({ buildings, bldBox, bldGrid }) {
  const offsets = new Uint32Array(buildings.length + 1);
  let count = 0;
  for (let i = 0; i < buildings.length; i++) { offsets[i] = count; count += buildings[i].p.length; }
  offsets[buildings.length] = count;
  const points = new Float64Array(count * 2);
  let at = 0;
  for (const b of buildings) for (const p of b.p) { points[at++] = p[0]; points[at++] = p[1]; }
  return { offsets, points, boxes: Float64Array.from(bldBox), grid: packIndexGrid(bldGrid) };
}

export function restoreBuildingQueries(packet) {
  const grid = unpackIndexGrid(packet.grid), { points, offsets, boxes } = packet;
  function buildingAt(x, z, pad = 0) {
    const arr = grid.get(worldGridKey(Math.floor(x / 48), Math.floor(z / 48)));
    if (!arr) return false;
    const p2 = pad * pad;
    for (const bi of arr) {
      const o = bi * 4;
      if (x < boxes[o] - pad || x > boxes[o + 2] + pad
        || z < boxes[o + 1] - pad || z > boxes[o + 3] + pad) continue;
      const first = offsets[bi] * 2, end = offsets[bi + 1] * 2;
      let inside = false;
      for (let i = first, j = end - 2; i < end; j = i, i += 2) {
        const xi = points[i], zi = points[i + 1], xj = points[j], zj = points[j + 1];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
        if (pad > 0 && distPtSeg2(x, z, xj, zj, xi, zi) < p2) return true;
      }
      if (inside) return true;
    }
    return false;
  }
  return { buildingAt };
}

export function restoreWalkQueries(packet) {
  const grid = unpackIndexGrid(packet), out = [];
  function queryWalks(x, z, r) {
    out.length = 0;
    const i0 = Math.floor((x - r) / 128), i1 = Math.floor((x + r) / 128);
    const j0 = Math.floor((z - r) / 128), j1 = Math.floor((z + r) / 128);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      for (const wi of grid.get(worldGridKey(i, j)) || []) if (out.indexOf(wi) < 0) out.push(wi);
    }
    return out;
  }
  return { queryWalks };
}
