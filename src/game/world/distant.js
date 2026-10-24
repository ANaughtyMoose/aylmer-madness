// Section 8: the distant scenery shared by every slice.
import { shade, rgb } from '../../core/mesh.js';
import { C } from './consts.js';
import { buildIsland } from '../marina.js';
import { mulberry32 } from '../../core/math.js';

export function buildDistant(ctx) {
  const { opts, distant, B, waterCol } = ctx;
  // ------------------------------------------------------------ 8. distant scenery
  // Shared by every slice, so sectors.js asks for it once and keeps it.
  if (opts.distant !== false) {
  const grassFar = shade(C.grassLo, 0.92);
  // apron: green everywhere outside the map except to the south, which is river
  // Well below the baked ground: this one quad spans 11 km, and on software /
  // low-precision GPUs its interpolated depth can beat a road 10 cm above it
  // (streets vanished into fog colour on SwiftShader at -0.05). At -0.6 nothing
  // in the town can lose to it, and it only ever shows through landuse gaps.
  // West of the map the river is Lac Deschênes, not lawn: the clip's own water
  // reaches its west edge from z -680 south, so the far apron does too (and
  // Aylmer Island, marina.js, stands in it).
  distant.flat(B.minX, B.minZ - 3000, B.maxX + 3000, B.maxZ, -0.6, grassFar);
  distant.flat(B.minX - 3000, B.minZ - 3000, B.minX, -700, -0.6, grassFar);
  distant.flat(B.minX - 3000, -700, B.minX, B.maxZ, -0.6, waterCol);
  buildIsland(distant);
  // the Ottawa River continuing south past the map edge
  distant.flat(-6000, B.maxZ, 6000, 6000, -0.6, waterCol);
  // the Ontario shore: a far tree line read as one dark green block
  distant.tower(0, 0, B.maxZ + 1800, 12000, 90, 40, rgb(C.shore), { noBottom: true });

  // Gatineau hills to the north: four ridges of low-poly cones, hazier further back
  const RIDGES = [
    [B.minZ - 700, 140, 70, 0x3d5a4a],
    [B.minZ - 1100, 190, 80, 0x44614f],
    [B.minZ - 1500, 240, 90, 0x506a5b],
    [B.minZ - 2000, 300, 100, 0x5a7364],
  ];
  for (let r = 0; r < RIDGES.length; r++) {
    const [rz, base, amp, hex] = RIDGES[r];
    const rnd = mulberry32(0x1d0e + r * 977);
    const col = rgb(hex);
    for (let x = -6000; x <= 6000; x += 420) {
      const hh = base + amp * rnd();
      distant.cone(x + (rnd() - 0.5) * 200, -20, rz + (rnd() - 0.5) * 300,
        420 + rnd() * 260, hh, 5, col);
    }
  }
  }
}
