// Section 6: trees, shrubs and the prototype hedges.
import { mulberry32 } from '../../core/math.js';
import { CONIFER, LEAF, C, SHRUB, BLOOM, CAP } from './consts.js';
import { protoTree, protoShrub, protoHedge } from '../vegetation.js';
import { rgb, shade } from '../../core/mesh.js';
import { pointInPoly, subsample, pairs, polyCentre } from './geom.js';

export function buildTrees(ctx) {
  const { bAt, baseAt, trees, PROTO_NATURE, addPole, bKey, areas, inside, pavedAt, noteFurniture, roads,
    roadAt, querySegments, bldgs, HOUSEY, streetYawAt } = ctx;
  const cnt = ctx.count;
  // ------------------------------------------------------------ 6. trees
  const tr = mulberry32(0x7ee5);
  // One `baseAt` sample per trunk, and everything above it is measured from
  // there. Same rule for every scatter below: a tree, a shrub, a pole and a
  // hydrant are points, so a point sample is the whole of what draping means
  // for them.
  function tree(x, z, scale, conifer) {
    const bd = bAt(x, z);
    const first = bd.i.length;
    const g = baseAt(x, z).h;
    const th = 3.0 * scale;
    const pick = tr();
    const leaf = conifer ? CONIFER[(pick * CONIFER.length) | 0] : LEAF[(pick * LEAF.length) | 0];
    // Every tree, for later passes (canopy shadows, contact). Height and crown
    // are the classic mesh's; the leaf-card trees are about the same size.
    trees.push({ x, z, y: g, scale, conifer, kind: conifer ? 'conifer' : 'deciduous',
      height: (conifer ? 9.5 : 7.7) * scale, crown: (conifer ? 1.9 : 3.1) * scale });
    if (PROTO_NATURE) {
      // Lit prototype: leaf-card maples, elms, birches, spruces, pines and
      // cedars (vegetation.js). Same draws of `tr` as below, so the rest of
      // the scatter lands where it always did.
      if (!conifer && tr() < 0.42) { tr(); tr(); }
      protoTree(bd, x, g, z, scale, conifer);
      if (scale <= 1.25) addPole(x, z, 'tree', 9.5 * scale, bKey(x, z), first, bd.i.length);
      return;
    }
    bd.cyl(x, g + th / 2, z, 0.34 * scale, th, 4, rgb(C.trunk), 'y', false);
    if (conifer) {
      // taller, narrower than the deciduous pair
      bd.cone(x, g + th * 0.45, z, 1.9 * scale, 7.0 * scale, 5, rgb(leaf));
      bd.cone(x, g + th * 1.5, z, 1.4 * scale, 5.0 * scale, 5, shade(leaf, 1.12));
    } else {
      bd.cone(x, g + th * 0.7, z, 3.1 * scale, 4.0 * scale, 5, rgb(leaf));
      bd.cone(x, g + th * 1.5, z, 2.3 * scale, 3.2 * scale, 5, shade(leaf, 1.1));
      // A small off-centre crown breaks up the repeated hourglass silhouette.
      // Only some trees get one, keeping the extra geometry modest.
      if (tr() < 0.42) {
        const a = tr() * Math.PI * 2;
        bd.cone(x + Math.cos(a) * 1.35 * scale, g + th * 1.14, z + Math.sin(a) * 1.35 * scale,
          1.45 * scale, 2.1 * scale, 5, shade(leaf, 0.94 + tr() * 0.14));
      }
    }
    if (scale <= 1.25) addPole(x, z, 'tree', 9.5 * scale, bKey(x, z), first, bd.i.length);
  }

  // Low planting gives the town a second green layer instead of making every
  // bit of vegetation read as the same tree-on-a-stick. A few beds flower, but
  // most remain the clipped cedar and lilac shrubs common on front lawns.
  function shrub(x, z, scale, flowers) {
    const bd = bAt(x, z);
    const g = baseAt(x, z).h;
    const col = SHRUB[(tr() * SHRUB.length) | 0];
    const yaw = tr() * Math.PI;
    if (PROTO_NATURE) { if (flowers) tr(); protoShrub(bd, x, g, z, scale, flowers); return; }
    bd.tower(x, g + 0.02, z, 1.8 * scale, 1.15 * scale, 0.72 * scale, rgb(col), {
      yaw, wTop: 1.35 * scale, dTop: 0.9 * scale, noBottom: true, top: shade(col, 1.12),
    });
    if (!flowers) return;
    const bloom = BLOOM[(tr() * BLOOM.length) | 0];
    for (let i = 0; i < 3; i++) {
      const a = yaw + (i - 1) * 0.72;
      bd.cyl(x + Math.cos(a) * 0.42 * scale, g + 0.82 * scale,
        z + Math.sin(a) * 0.32 * scale, 0.10 * scale, 0.12 * scale, 5, rgb(bloom), 'y', true);
    }
  }

  const woodPts = [], parkPts = [];
  const pr = mulberry32(0x2b1a55);
  for (const a of areas) {
    const target = a.k === 'wood' ? woodPts : a.k === 'park' ? parkPts : null;
    if (!target) continue;
    const step = a.k === 'wood' ? 14 : 24;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of a.p) {
      if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
      if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1];
    }
    for (let x = x0 + step * 0.5; x < x1; x += step) {
      for (let z = z0 + step * 0.5; z < z1; z += step) {
        const jx = x + (pr() - 0.5) * step * 0.7, jz = z + (pr() - 0.5) * step * 0.7;
        if (!pointInPoly(a.p, jx, jz)) continue;
        if (inside && !inside(jx, jz)) continue;    // the neighbour's half of a wood
        // Landuse polygons are drawn over the streets that cross them, and a
        // 7 m spruce in the middle of chemin Vanier is worse than a gap in the
        // wood. Street trees already do this test; the park scatter never did.
        const bad = pavedAt(jx, jz, -1, 0.6);
        noteFurniture(jx, jz, 'tree', -1, bad);
        if (bad) { cnt.furnDropped++; continue; }
        target.push(jx, jz);
      }
    }
  }
  const woodSel = subsample(pairs(woodPts), CAP.woodTrees);
  const parkSel = subsample(pairs(parkPts), CAP.parkTrees);
  for (const q of woodSel) tree(q[0], q[1], 0.85 + tr() * 0.6, tr() < 0.45);
  for (const q of parkSel) tree(q[0], q[1], 1.0 + tr() * 0.7, tr() < 0.15);

  // street trees along residential roads
  const streetTrees = [];
  {
    let flip = 1;
    for (const road of roads) {
      if (road.cls !== 'residential') continue;
      const pts = road.pts;
      let carry = 13;
      for (let i = 0; i < pts.length - 1; i++) {
        let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        let s = carry;
        while (s < L) {
          const nx = -dz * 6.5 * flip, nz = dx * 6.5 * flip;
          const x = pts[i][0] + dx * s + nx, z = pts[i][1] + dz * s + nz;
          flip = -flip;
          s += 26;
          if (roadAt(x, z)) continue;
          const near = querySegments(x, z, 3);
          if (near.length) continue;
          streetTrees.push(x, z);
        }
        carry = s - L;
      }
    }
  }
  const streetSel = subsample(pairs(streetTrees), CAP.roadTrees);
  for (const q of streetSel) tree(q[0], q[1], 0.9 + tr() * 0.5, tr() < 0.2);

  // Street trees on the two main commercial streets (Principale, Chemin d'Aylmer).
  // Own rng and list so the residential trees above are untouched. Kept 3 m off
  // any wall (storefront doors) and 4.5 m clear of side streets and driveways.
  const mainTrees = [];
  const tr2 = mulberry32(0x7a11e5);
  {
    let flip = 1;
    for (const road of roads) {
      if (road.cls !== 'secondary' && road.cls !== 'tertiary') continue;
      if (road.name !== 'Rue Principale' && road.name !== "Chemin d'Aylmer") continue;
      const pts = road.pts, off = road.w / 2 + 2.4;
      let carry = 9;
      for (let i = 0; i < pts.length - 1; i++) {
        let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        let s = carry;
        while (s < L) {
          const nx = -dz * off * flip, nz = dx * off * flip;
          const x = pts[i][0] + dx * s + nx, z = pts[i][1] + dz * s + nz;
          flip = -flip;
          s += 34 + tr2() * 8;
          if (roadAt(x, z) || querySegments(x, z, 3).length) continue;
          if (roadAt(x + dx * 4.5, z + dz * 4.5) || roadAt(x - dx * 4.5, z - dz * 4.5)) continue;
          mainTrees.push(x, z);
        }
        carry = s - L;
      }
    }
  }
  const mainSel = subsample(pairs(mainTrees), 450);
  for (const q of mainSel) tree(q[0], q[1], 0.9 + tr2() * 0.5, tr2() < 0.1);

  // Front-garden shrubs cluster around a subset of street trees, with loose
  // groups at parks. Offsets are deterministic and rejected if they stray onto
  // asphalt or through a building wall.
  const shrubPts = [];
  for (let i = 0; i < streetSel.length; i++) {
    if (tr() > 0.58) continue;
    const q = streetSel[i], a = tr() * Math.PI * 2, d = 2.0 + tr() * 2.6;
    const x = q[0] + Math.cos(a) * d, z = q[1] + Math.sin(a) * d;
    if (!roadAt(x, z) && !querySegments(x, z, 1.1).length) shrubPts.push([x, z]);
  }
  for (let i = 0; i < parkSel.length; i += 2) {
    const q = parkSel[i], a = tr() * Math.PI * 2, d = 2.5 + tr() * 3.5;
    shrubPts.push([q[0] + Math.cos(a) * d, q[1] + Math.sin(a) * d]);
  }
  const shrubSel = subsample(shrubPts, CAP.shrubs);
  for (let i = 0; i < shrubSel.length; i++) {
    const q = shrubSel[i];
    shrub(q[0], q[1], 0.7 + tr() * 0.65, tr() < (i % 5 === 0 ? 0.8 : 0.12));
  }
  // Lit prototype only: cedar hedges on lot lines, so a street of houses reads
  // as separate yards instead of one open lawn. One side per house (so a
  // boundary never gets two), about half the houses, back yard to just past
  // the front wall; any stretch that would touch a wall, a road or pavement is
  // left out. Deterministic per building.
  if (PROTO_NATURE) {
    for (let bi = 0; bi < bldgs.length && cnt.hedgeCount < CAP.hedges; bi++) {
      const b = bldgs[bi];
      if (!(HOUSEY[b.k] === 1 || b.hs) || b.k === 'fraser') continue;
      const hr = mulberry32((bi * 2246822519 + 0x4ed9) >>> 0);
      if (hr() > 0.5) continue;
      const c = polyCentre(b.p);
      const a = streetYawAt(b, c[0], c[1], -b.a);
      const fx = Math.cos(a), fz = Math.sin(a), tx = -fz, tz = fx;
      let t1 = -1e9, f0 = 1e9, f1 = -1e9;
      for (const q of b.p) {
        const dx = q[0] - c[0], dz = q[1] - c[1];
        const t = dx * tx + dz * tz, f = dx * fx + dz * fz;
        if (t > t1) t1 = t; if (f < f0) f0 = f; if (f > f1) f1 = f;
      }
      const side = hr() < 0.5 ? 1 : -1;
      if (side < 0) {
        t1 = -1e9;
        for (const q of b.p) { const t = -((q[0] - c[0]) * tx + (q[1] - c[1]) * tz); if (t > t1) t1 = t; }
      }
      const off = (t1 + 2.6 + hr() * 1.6) * side;
      const h = 1.3 + hr() * 0.9;
      const step = 1.4;
      let run = null;
      const flush = () => {
        if (run && run.n >= 3) {
          protoHedge(bAt(run.x0, run.z0), run.x0, run.z0, run.x1, run.z1, 1.0, h, (x, z) => baseAt(x, z).h);
          cnt.hedgeCount++;
        }
        run = null;
      };
      for (let f = f0 - 5; f <= f1 + 1; f += step) {
        const x = c[0] + tx * off + fx * f, z = c[1] + tz * off + fz * f;
        const bad = roadAt(x, z) || pavedAt(x, z, -1, 1.0) || querySegments(x, z, 1.0).length > 0;
        if (bad) { flush(); continue; }
        if (!run) run = { x0: x, z0: z, x1: x, z1: z, n: 1 };
        else { run.x1 = x; run.z1 = z; run.n++; }
      }
      flush();
    }
  }
  cnt.treeCount = woodSel.length + parkSel.length + streetSel.length;
  cnt.plantingCount = shrubSel.length + cnt.hedgeCount;

  Object.assign(ctx, { streetTrees, mainTrees });
}
