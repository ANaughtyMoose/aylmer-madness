// The concrete sidewalks along a road and the kerb corners at a junction.
// roads.js calls both from inside its own loops, at the exact point the old
// single function laid them, so the vertex order is unchanged.
import { PAVED, Y } from './consts.js';
import { rgb } from '../../core/mesh.js';
import { MAP } from '../mapdata.js';

const WALK_POS = [1], WALK_NEG = [-1];

function walkToward(ctx, branch, nx, nz) {
  // Junction branch indices refer to the full map, even during a sector bake.
  const road = MAP.roads[branch.ri];
  if (!road) return false;
  if (PAVED[road.cls] === 1) return true;
  if (road.cls !== 'residential') return false;
  const policy = ctx.walkPolicy(road);
  return policy.mode === 2 || (policy.mode === 1 && nx * policy.px + nz * policy.pz >= 0);
}

export function kerbCorners(ctx, nd, ext) {
  const { rectPoints, pavedAt, noteFurniture, slab, walkCol } = ctx;
  const cnt = ctx.count;
    // Sidewalk corners: the kerb radius between two paved branches. Without
    // these the two straight bands leave a notch at every junction.
    const paved = nd.br.filter((b) => PAVED[b.cls] === 1 || b.cls === 'residential');
    if (paved.length >= 2) {
      paved.sort((a, b) => Math.atan2(a.dx, a.dz) - Math.atan2(b.dx, b.dz));
      for (let i = 0; i < paved.length; i++) {
        const a = paved[i], b = paved[(i + 1) % paved.length];
        let ux = a.dx + b.dx, uz = a.dz + b.dz;
        const ul = Math.hypot(ux, uz);
        if (ul < 0.25) continue;                 // straight-through pair: no corner
        ux /= ul; uz /= ul;
        const ad = ux * a.dx + uz * a.dz, bd = ux * b.dx + uz * b.dz;
        if (!walkToward(ctx, a, ux - ad * a.dx, uz - ad * a.dz)
          || !walkToward(ctx, b, ux - bd * b.dx, uz - bd * b.dz)) continue;
        // `ext + 1.9` is where the two kerb lines meet when two equal streets
        // cross square, and wrong the moment they do not: `ext` is the WIDEST
        // branch's half width, so at a residential/secondary T the slab lands
        // inside the wide road's lane, and at a shallow fork the bisector runs
        // down the middle of both branches. Step out along the bisector until
        // the slab's centre is off the asphalt; if 4.8 m of it does not get
        // clear, the two arms are near enough parallel that there is no corner
        // there at all, and none is laid.
        let d = ext + 1.9, cx = 0, cz = 0, placed = false;
        for (let k = 0; k < 9; k++, d += 0.6) {
          cx = nd.x + ux * d; cz = nd.z + uz * d;
          if (rectPoints(cx,cz,2.8,2.8,Math.atan2(ux,uz)).every(p=>!pavedAt(p[0],p[1],-1,0.25)) && !pavedAt(cx,cz,-1,0.2)) { placed = true; break; }
        }
        noteFurniture(cx, cz, 'kerb', -1, !placed);
        if (!placed) { cnt.furnDropped++; continue; }
        // 2.8 m square: smaller than a raster cell, so it is simply stood on
        // the ground under its centre rather than cut up. On a 5 % corner the
        // far edge is 7 cm out, which is half the slab's own thickness.
        slab(cx, cz, 2.8, 2.8, 0.12, Math.atan2(ux, uz), walkCol);
        cnt.cornerCount++;
      }
    }
}

export function roadWalks(ctx, ri, pts, n, hw, dxs, dzs, lens, cut, walkSides, policy = null) {
  const { LOFF, clearRuns, stripe, gutterCol, slab, walkCol, noteFurniture, overBase, pavedAt } = ctx;
  const cnt = ctx.count;
    // Concrete sidewalks outside the asphalt, stopping at the kerb corners.
    // A dark gutter strip and a small height step make the road edge read as a
    // curb instead of two coplanar ribbons.
      let sideHold = 0;
      for (let i = 0; i < n - 1; i++) {
        const s0 = cut[i] > 0 ? cut[i] + 1.4 : 0;
        const s1 = lens[i] - (cut[i + 1] > 0 ? cut[i + 1] + 1.4 : 0);
        if (s1 - s0 < 0.4) continue;
        const dx = dxs[i], dz = dzs[i];
        const yaw = Math.atan2(dx, dz);
        const nx = dz, nz = -dx;
        const off = hw + 1.075;
        let sides = walkSides;
        if (policy && policy.mode === 1) {
          const d = nx * policy.px + nz * policy.pz;
          if (Math.abs(d) > 0.3 || sideHold === 0) sideHold = d >= 0 ? 1 : -1;
          sides = sideHold > 0 ? WALK_POS : WALK_NEG;
        }
        // Close the wedge between straight slabs at an uncut bend.
        if (i > 0 && cut[i] <= 0) {
          const bend = dxs[i - 1] * dz - dzs[i - 1] * dx;
          for (const s of sides) {
            if (Math.abs(bend) < 0.05) continue;
            const vx = pts[i][0] + nx * off * s, vz = pts[i][1] + nz * off * s;
            if (pavedAt(vx, vz, ri, 0.25, true)) continue;
            slab(vx, vz, 1.75, 1.75, 0.12, Math.atan2(dxs[i - 1] + dx, dzs[i - 1] + dz), walkCol);
            noteFurniture(vx, vz, 'walk', ri, false);
          }
        }
        for (const s of sides) {
          // Four samples across the band - the gutter, both edges of the 1.75 m
          // slab and its middle - so a way crossing at a shallow angle clips the
          // far edge long before it has reached the centreline. `cut` only knows
          // about junctions this way is noded into; two ways that merely lie on
          // top of each other, or cross without sharing a node, are invisible to
          // it and are exactly what this test catches.
          LOFF.length = 4;
          LOFF[0] = (hw + 0.11) * s; LOFF[1] = (hw + 0.3) * s;
          LOFF[2] = off * s; LOFF[3] = (hw + 1.85) * s;
          const runs = clearRuns(pts[i][0], pts[i][1], dx, dz, nx, nz, s0, s1,
            LOFF, 2, ri, 0.25, 1.5, 'walk', ri);
          for (let q = 0; q < runs.length; q += 2) {
            const L = runs[q + 1] - runs[q];
            if (L < 0.4) continue;
            const mid = (runs[q] + runs[q + 1]) / 2;
            const mx = pts[i][0] + dx * mid, mz = pts[i][1] + dz * mid;
            const gx = mx + nx * (hw + 0.11) * s, gz = mz + nz * (hw + 0.11) * s;
            stripe(gx, gz, 0.28, L, Y.road + 0.008, yaw, gutterCol);
            const cx = mx + nx * off * s, cz = mz + nz * off * s;
            slab(cx, cz, 1.75, L, 0.12, yaw, walkCol);
            // Both ends as well as the middle: a slab is a long thing and the
            // smoke test should be sampling all of it, not just its centre.
            noteFurniture(cx, cz, 'walk', ri, false);
            for (const e of [runs[q] + 0.2, runs[q + 1] - 0.2]) {
              noteFurniture(pts[i][0] + dx * e + nx * off * s,
                pts[i][1] + dz * e + nz * off * s, 'walk', ri, false);
            }
            if(overBase(cx,cz,cx,cz)) {
              // Slab joints every few metres; enough to read at driving speed.
              for(let u=-L/2+3;u<L/2-0.5;u+=3.4)
                stripe(cx+dx*u,cz+dz*u,1.65,0.022,0.124,yaw,rgb(0x817e75));
            }
            cnt.sidewalkCount++;
          }
        }
        // A one-walk street still has a narrow concrete curb on its other side.
        if (policy && policy.mode === 1) {
          const s = -sides[0];
          LOFF.length = 2;
          LOFF[0] = (hw + 0.11) * s; LOFF[1] = (hw + 0.4) * s;
          const runs = clearRuns(pts[i][0], pts[i][1], dx, dz, nx, nz, s0, s1,
            LOFF, 1, ri, 0.2, 1.5, 'curb', ri);
          for (let q = 0; q < runs.length; q += 2) {
            const L = runs[q + 1] - runs[q];
            if (L < 0.4) continue;
            const mid = (runs[q] + runs[q + 1]) / 2;
            const mx = pts[i][0] + dx * mid, mz = pts[i][1] + dz * mid;
            stripe(mx + nx * (hw + 0.11) * s, mz + nz * (hw + 0.11) * s, 0.28, L, Y.road + 0.008, yaw, gutterCol);
            const cx = mx + nx * (hw + 0.33) * s, cz = mz + nz * (hw + 0.33) * s;
            slab(cx, cz, 0.16, L, 0.12, yaw, walkCol);
            noteFurniture(cx, cz, 'curb', ri, false);
          }
        }
      }
}
