// The decoded LiDAR grid, the river shaping and the marina basin (moved out of
// world.js unchanged, V0-02).
import { decodeGround } from '../ground.js';
import { GROUND } from '../ground_data.js';
import { MAP } from '../mapdata.js';
import { pointInPoly } from './geom.js';
import { buildTerrain } from '../terrain.js';

// The decoded LiDAR grid, one copy for the whole process. sectors.js calls
// buildWorld() once per slice and each call would otherwise spend 16 ms and
// 3.4 MB of typed array decoding the same 283k nodes. Lazy, so a page that
// never builds a world never pays for it.
let GROUND_GRID = null;
export function groundGrid() {
  if (GROUND_GRID === null) GROUND_GRID = shapeRiver(decodeGround(GROUND));
  return GROUND_GRID;
}

// The raster is LiDAR, and LiDAR over open water is noise: a boat, a swell, a
// bad return. Two of those made "mountains in the river" - 10-14 m cones west
// of the marina breakwater at about (-1874, -114) and (-1976, -156). Any node
// the water mask calls wet, with every node within 16 m wet too, is held a
// metre under the water quad. Shore nodes are left alone, so beaches and banks
// keep their LiDAR shape.
//
// The marina basin is also cut: the water in it goes to -1.8 (a harbour, not a
// pond), and so does the land within 4.5 m of the basin's quay lines, under
// the abs quay pads (terrain.js marinaPads) whose vertical face stands 1.5 m
// out in the water. Without that, the raster's 8 m bank pokes out in front of
// the quay wall as a grass wedge.
export const MARINA_QUAYS = [
  [-1779, -202.5, -1727, -137], [-1727, -137, -1677, -63], [-1846, -173, -1824, -186.5],
];
export const MARINA_BOX = { x0: -1880, x1: -1650, z0: -235, z1: -5 };
// The basin inside its breakwaters, a little generous on the outer faces.
export const MARINA_BASIN = [[-1862, -164], [-1800, -18], [-1766, -16], [-1664, -28],
  [-1677, -63], [-1727, -137], [-1785, -212], [-1846, -176]];
// ...and with the breakwaters' outer faces, for skipping the beach strip.
export const MARINA_BASIN_WIDE = [[-1872, -168], [-1804, -12], [-1766, -10], [-1660, -22],
  [-1672, -63], [-1722, -137], [-1782, -218], [-1850, -184]];
export function shapeRiver(G) {
  const wm = MAP.waterMask;
  if (!wm) return G;
  const mask = Uint8Array.from(atob(wm.b64), (ch) => ch.charCodeAt(0));
  const mx0 = wm.minX ?? MAP.bounds.minX, mz0 = wm.minZ ?? MAP.bounds.minZ;
  const { w, h, x0, z0, cell, hgt } = G;
  const wetAt = (x, z) => {
    const i = Math.floor((x - mx0) / wm.cell), j = Math.floor((z - mz0) / wm.cell);
    return i >= 0 && i < wm.w && j >= 0 && j < wm.h && mask[j * wm.w + i] === 1;
  };
  const wet = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) wet[j * w + i] = wetAt(x0 + i * cell + 0.5, z0 + j * cell + 0.5) ? 1 : 0;
  const touched = [];
  for (let j = 2; j < h - 2; j++) {
    for (let i = 2; i < w - 2; i++) {
      const k = j * w + i;
      if (!wet[k] || hgt[k] <= -0.3) continue;
      let all = true;
      for (let b = -2; b <= 2 && all; b++) for (let a = -2; a <= 2; a++) if (!wet[k + b * w + a]) { all = false; break; }
      if (all) { hgt[k] = -1; touched.push(k); }
    }
  }
  const river = MAP.water && MAP.water[0] && MAP.water[0].p;
  const B = MARINA_BOX;
  for (let j = Math.floor((B.z0 - z0) / cell); j <= Math.ceil((B.z1 - z0) / cell); j++) {
    for (let i = Math.floor((B.x0 - x0) / cell); i <= Math.ceil((B.x1 - x0) / cell); i++) {
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const k = j * w + i, x = x0 + i * cell, z = z0 + j * cell;
      // the basin, and the spit's old raster at the breakwater tips (the pads
      // carry the breakwaters now; left alone it showed as lawn in the water)
      let cut = river && pointInPoly(MARINA_BASIN, x, z) && pointInPoly(river, x, z);
      if (!cut && z > -60 && x < -1750 && pointInPoly(MARINA_BASIN_WIDE, x, z)) cut = true;
      if (!cut) {
        for (const [ax, az, bx, bz] of MARINA_QUAYS) {
          const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
          const t = (x - ax) * dx + (z - az) * dz, u = (x - ax) * dz - (z - az) * dx;
          if (t > -2 && t < L + 2 && u > -1 && u < 4.5) { cut = true; break; }
        }
      }
      if (cut && hgt[k] > -1.8) { hgt[k] = -1.8; touched.push(k); }
    }
  }
  // Gradients around every node that moved (central differences, as decoded).
  const inv2 = 1 / (2 * cell);
  const redo = new Set();
  for (const k of touched) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) redo.add(k + b * w + a);
  for (const k of redo) {
    const i = k % w, j = (k - i) / w;
    if (i < 1 || j < 1 || i >= w - 1 || j >= h - 1) continue;
    G.gx[k] = (hgt[k + 1] - hgt[k - 1]) * inv2;
    G.gz[k] = (hgt[k + w] - hgt[k - w]) * inv2;
  }
  G.shaped = touched.length;
  return G;
}

// The base height at a point, for anything that has to know where the ground is
// without having a world to ask. sectors.js bakes the storefront signage ONCE
// for the whole town, before any slice exists, and a sign board hangs off a wall
// that is now thirty metres up a hill. Featureless on purpose: this is the
// raster, not the terrain, and it costs one small closure the first time it is
// called and nothing after.
let BASE_FIELD = null;
export function baseHeightAt(x, z) {
  if (BASE_FIELD === null) BASE_FIELD = buildTerrain([], groundGrid());
  return BASE_FIELD.baseAt(x, z).h;
}
