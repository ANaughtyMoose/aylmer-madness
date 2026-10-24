// Section 2 water, the water mask query and section 5b, the shoreline and the marina.
import { rgb, shade } from '../../core/mesh.js';
import { C, Y, CAP2 } from './consts.js';
import { MAP } from '../mapdata.js';
import { MARINA_BOX, MARINA_BASIN_WIDE } from './groundgrid.js';
import { pointInPoly, subsample } from './geom.js';
import { mulberry32 } from '../../core/math.js';
import { buildMarinaScene } from '../marina.js';
import { FEATURES } from '../terrain.js';

export function buildWater(ctx) {
  const { triScatter, wAt } = ctx;
  // ------------------------------------------------------------ 2. water
  // Water goes into its OWN chunk meshes so the whole draw can carry the wobble
  // flag (see gl.js `opts.water`) without every land vertex paying for it.
  const waterCol = rgb(C.water);
  for (const w of MAP.water) triScatter(w.p, w.t, Y.water, waterCol, wAt);

  Object.assign(ctx, { waterCol });
}

export function installWaterMask(ctx) {
  const { groundAt, B } = ctx;
  // ------------------------------------------------------------ water mask
  const wm = MAP.waterMask;
  const mask = Uint8Array.from(atob(wm.b64), (ch) => ch.charCodeAt(0));
  const extraWater = MAP.expansionWater || [];
  function waterAt(x, z) {
    // The quays and breakwaters stand out over cells the 8 m mask calls wet.
    if (x > MARINA_BOX.x0 && x < MARINA_BOX.x1 && z > MARINA_BOX.z0 && z < MARINA_BOX.z1
      && groundAt(x, z).h > 0.6) return false;
    const i = Math.floor((x - (wm.minX ?? B.minX)) / wm.cell);
    const j = Math.floor((z - (wm.minZ ?? B.minZ)) / wm.cell);
    if (i >= 0 && i < wm.w && j >= 0 && j < wm.h && mask[j * wm.w + i] === 1) return true;
    for (const p of extraWater) if (pointInPoly(p, x, z)) return true;
    return false;
  }

  Object.assign(ctx, { waterAt });
}

export function buildShore(ctx) {
  const { inside, B, waterAt, pavedAt, noteFurniture, drapeQuad, bAt, baseAt, groundAt, PROTO_NATURE } = ctx;
  const cnt = ctx.count;
  // ------------------------------------------------------------ 5b. shoreline
  // A sand/gravel strip on the LAND side of every river edge, a scatter of
  // boulders, and the marina's docks. The land side is found by asking the water
  // mask, which is exact and saves worrying about ring winding. (W6)
  const sandCol = rgb(C.sand), dockCol = rgb(C.dock);
  const sr = mulberry32(0x5ea17e);

  {
    const rings = [];
    for (const w of MAP.water) rings.push(w.p);
    for (const a of MAP.areas) if (a.k === 'water') rings.push(a.p);
    const edges = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1 || L > 150) continue;             // 150 m+ edges are the map border
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (inside && !inside(mx, mz)) continue;
        if (mx < B.minX + 6 || mx > B.maxX - 6 || mz < B.minZ + 6 || mz > B.maxZ - 6) continue;
        // The marina basin has quays and riprap instead (marina.js).
        if (mx > MARINA_BOX.x0 && mx < MARINA_BOX.x1 && mz > MARINA_BOX.z0 && mz < MARINA_BOX.z1
          && pointInPoly(MARINA_BASIN_WIDE, mx, mz)) continue;
        edges.push([a, b, L, mx, mz]);
      }
    }
    for (const [a, b, L, mx, mz] of subsample(edges, CAP2.shoreEdges)) {
      let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      if (waterAt(mx + nx * 4, mz + nz * 4)) { nx = -nx; nz = -nz; }
      if (waterAt(mx + nx * 4, mz + nz * 4)) continue;      // both sides wet: skip
      const w = 3.2 + sr() * 1.8;
      // Where the road runs along the bank - the marina apron, Principale by
      // the Symmes - the land side of the edge is asphalt, and a 5 m ribbon of
      // beach used to be laid straight down it.
      {
        const bad = pavedAt(mx + nx * w * 0.5, mz + nz * w * 0.5, -1, 0.3)
          || pavedAt(mx + nx * w, mz + nz * w, -1, 0.3);
        noteFurniture(mx + nx * w * 0.5, mz + nz * w * 0.5, 'shore', -1, bad);
        if (bad) { cnt.furnDropped++; continue; }
      }
      drapeQuad([
        [a[0], a[1]], [b[0], b[1]],
        [b[0] + nx * w, b[1] + nz * w], [a[0] + nx * w, a[1] + nz * w],
      ], Y.sand, sandCol);
      cnt.shoreCount++;
      if (cnt.rockCount < CAP2.rocks && sr() < 0.34) {
        const t = 0.2 + sr() * 0.6;
        const rxp = a[0] + (b[0] - a[0]) * t + nx * (0.4 + sr() * 1.6);
        const rzp = a[1] + (b[1] - a[1]) * t + nz * (0.4 + sr() * 1.6);
        const s = 0.5 + sr() * 0.9;
        bAt(rxp, rzp).box(rxp, baseAt(rxp, rzp).h + s * 0.28, rzp, s, s * 0.75, s * 0.85,
          shade(C.rock, 0.85 + sr() * 0.3), { yaw: sr() * 3.1, noBottom: true });
        cnt.rockCount++;
      }
    }

    // The marina (marina.js): riprap on the breakwaters, the quay coping and
    // bollards, five finger docks and a guest dock full of boats. The three
    // plank piers that used to walk out of the north lawn are gone with it.
    {
      const m = buildMarinaScene({ bAt, groundAt, features: FEATURES, proto: PROTO_NATURE });
      cnt.rockCount += m.rocks; cnt.dockCount += m.docks; cnt.marinaBoats = m.boats;
    }
  }
}
