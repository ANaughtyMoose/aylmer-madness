// Section 5c: the terrain features (pads, mounds, ridges, profiles) and the
// Galeries service fence.
import { shade } from '../../core/mesh.js';
import { clipHalf } from '../surface.js';
import { ROAD_CELL, PAVED, Y } from './consts.js';
import { featureCentre } from './geom.js';

export function buildHeightField(ctx) {
  const { groundAt, bAt, pavedAt, roadGrid, gkey, roadSegArr, roads, roadCols, walkCol, overBase, DRAPE,
    baseAt, addSegment, drapeQuad, terrain, inside } = ctx;
  // ------------------------------------------------------- 5c. the height field
  // Everything in town that is not at y = 0 (terrain.js). The physics query and
  // the geometry come from the SAME analytic functions, so the mesh under the
  // wheels is the mesh you can see - no sampling error, no floating cars.
  //
  // Each feature emits its own surface at the resolution its shape needs (a pad
  // is exact: nine planar regions; a mound is a small radial fan; a ridge is
  // cross-sections along its spine) and, where a side is a vertical face rather
  // than a slope, a wall quad and - only if the feature asks for it - a collider.
  // Ramp faces never get colliders: you are supposed to go up them.
  //
  // The field itself was built at the top of the file (section 0) - everything
  // in between needed it. What is left here is the geometry.
  const TC = {
    asphalt: 0x3f3f44, concrete: 0x9d9a92, gravel: 0x8a8276, grass: 0x6d8a4c,
    sand: 0xd9cba4, path: 0x928b7c, dirt: 0x7c6449, stair: 0xa8a49a,
  };
  const terrainStats = { features: 0, tris: 0, walls: 0, colliders: 0, decks: 0 };

  // Height + kind at a point, straight from the same evaluator the car uses.
  function tKind(f, x, z) {
    const g = groundAt(x, z);
    return g.kind || f.side || f.kind;
  }
  function tCol(kind, k) { return shade(TC[kind] || TC.grass, k); }

  // One surface triangle, normal taken from the height field so the lighting
  // agrees with the physics. `p` is [x,z] pairs; y comes from groundAt.
  function tTri(ax, az, bx, bz, cx2, cz2, kind, tint) {
    const bd = bAt((ax + bx + cx2) / 3, (az + bz + cz2) / 3);
    const ay = groundAt(ax, az).h;
    const by = groundAt(bx, bz).h;
    const g = groundAt(cx2, cz2);
    const cy = g.h;
    const mid = groundAt((ax + bx + cx2) / 3, (az + bz + cz2) / 3);
    const nx = mid.nx, ny = mid.ny, nz = mid.nz;
    const col = tCol(kind, tint);
    // Wind so the normal points up: negative shoelace in (x,z) is CCW from above.
    const cr = (bx - ax) * (cz2 - az) - (bz - az) * (cx2 - ax);
    const v0 = bd.vert(ax, ay, az, nx, ny, nz, col);
    if (cr > 0) {
      bd.vert(cx2, cy, cz2, nx, ny, nz, col);
      bd.vert(bx, by, bz, nx, ny, nz, col);
    } else {
      bd.vert(bx, by, bz, nx, ny, nz, col);
      bd.vert(cx2, cy, cz2, nx, ny, nz, col);
    }
    bd.tri(v0, v0 + 1, v0 + 2);
    terrainStats.tris++;
    // Paint crossing streets on the actual feature triangle. Independent
    // crossing decks cut through the rail berm between sample points.
    const triangle=[[ax,az],[bx,bz],[cx2,cz2]], seen=new Set();
    const minX=Math.min(ax,bx,cx2),maxX=Math.max(ax,bx,cx2);
    const minZ=Math.min(az,bz,cz2),maxZ=Math.max(az,bz,cz2);
    const denom=(bz-cz2)*(ax-cx2)+(cx2-bx)*(az-cz2);
    if(Math.abs(denom)<1e-9)return;
    const height=(x,z)=>{
      const u=((bz-cz2)*(x-cx2)+(cx2-bx)*(z-cz2))/denom;
      const v=((cz2-az)*(x-cx2)+(ax-cx2)*(z-cz2))/denom;
      return u*ay+v*by+(1-u-v)*cy;
    };
    function overlay(a,b,c,d,col,offset,roadId,walk=false) {
      let p=triangle;
      for(const distance of [a,b,c,d])p=clipHalf(p,distance);
      if(p.length<3)return;
      if(walk && p.some(q=>pavedAt(q[0],q[1],roadId,0.15)))return;
      const ids=p.map(q=>bd.vert(q[0],height(q[0],q[1])+offset,q[1],nx,ny,nz,col));
      let area=0;for(let k=0;k<p.length;k++){const q=p[(k+1)%p.length];area+=p[k][0]*q[1]-p[k][1]*q[0];}
      terrainStats.decks++;
      for(let k=1;k+1<ids.length;k++) {
        if(area<0)bd.tri(ids[0],ids[k],ids[k+1]);else bd.tri(ids[0],ids[k+1],ids[k]);
      }
    }
    for(let ix=Math.floor(minX/ROAD_CELL)-1;ix<=Math.floor(maxX/ROAD_CELL)+1;ix++)
      for(let iz=Math.floor(minZ/ROAD_CELL)-1;iz<=Math.floor(maxZ/ROAD_CELL)+1;iz++)
        for(const id of roadGrid.get(gkey(ix,iz))||[]) {
          if(seen.has(id))continue;seen.add(id);
          const o=id*7,x=roadSegArr[o],z=roadSegArr[o+1],dx=roadSegArr[o+2]-x,dz=roadSegArr[o+3]-z;
          const len=Math.hypot(dx,dz);if(len<0.01)continue;
          const hw=roadSegArr[o+5],ri=roadSegArr[o+6],road=roads[ri];
          const along=p=>((p[0]-x)*dx+(p[1]-z)*dz)/len;
          const across=p=>((p[0]-x)*dz-(p[1]-z)*dx)/len;
          const end=p=>len-along(p);
          overlay(along,end,p=>across(p)+hw,p=>hw-across(p),roadCols[road.cls]||roadCols.residential,0.055,ri);
          if(PAVED[road.cls]===1||road.cls==='residential')for(const side of [-1,1])
            overlay(along,end,p=>side*across(p)-hw,p=>hw+2.2-side*across(p),walkCol,0.125,ri,true);
        }
  }
  // A feature's surface patch. The emitters below choose their own resolution
  // from the shape they are drawing - a pad's deck is one region however long
  // it is, a berm cross-section is cut every 35 m - and that was exactly right
  // while the ground beneath was a plane. It is not any more: the mall's 32 m
  // loading dock and the rail berm's long runs have a hillside under them now,
  // and a patch that spans it draws the chord. So the quad is cut to the raster
  // cell first, on both axes, wherever there is a hill to follow.
  function tQuad(p0, p1, p2, p3, kind, tint) {
    const over = overBase(
      Math.min(p0[0], p1[0], p2[0], p3[0]), Math.min(p0[1], p1[1], p2[1], p3[1]),
      Math.max(p0[0], p1[0], p2[0], p3[0]), Math.max(p0[1], p1[1], p2[1], p3[1]));
    const nu = !over ? 1 : Math.max(1, Math.ceil(Math.max(
      Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
      Math.hypot(p2[0] - p3[0], p2[1] - p3[1])) / DRAPE));
    const nv = !over ? 1 : Math.max(1, Math.ceil(Math.max(
      Math.hypot(p3[0] - p0[0], p3[1] - p0[1]),
      Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) / DRAPE));
    if (nu === 1 && nv === 1) {
      tTri(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], kind, tint);
      tTri(p0[0], p0[1], p2[0], p2[1], p3[0], p3[1], kind, tint);
      return;
    }
    // Bilinear in (u along p0->p1, v along p0->p3).
    const P = (u, v) => {
      const lx = p0[0] + (p3[0] - p0[0]) * v, lz = p0[1] + (p3[1] - p0[1]) * v;
      const rx2 = p1[0] + (p2[0] - p1[0]) * v, rz2 = p1[1] + (p2[1] - p1[1]) * v;
      return [lx + (rx2 - lx) * u, lz + (rz2 - lz) * u];
    };
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
        const a = P(u0, v0), b = P(u1, v0), c2 = P(u1, v1), d = P(u0, v1);
        tTri(a[0], a[1], b[0], b[1], c2[0], c2[1], kind, tint);
        tTri(a[0], a[1], c2[0], c2[1], d[0], d[1], kind, tint);
      }
    }
  }

  // A vertical face from grade up to the deck, with an optional collider. The
  // edge is walked in 1 m steps and any stretch where something else has already
  // filled the drop (a ramp, the kicker) is left open, so the ramps that lead on
  // to a dock are not walled off from it.
  function tWall(ax, az, bx, bz, ox, oz, H, kind, collide, abs = false) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L));
    const dx = (bx - ax) / n, dz = (bz - az) / n;
    const col = tCol(kind, 0.72);
    for (let i = 0; i < n; i++) {
      const x0 = ax + dx * i, z0 = az + dz * i;
      const x1 = ax + dx * (i + 1), z1 = az + dz * (i + 1);
      const mx = (x0 + x1) / 2 + ox, mz = (z0 + z1) / 2 + oz;
      const deckMid = abs ? H : baseAt((x0 + x1) / 2, (z0 + z1) / 2).h + H;
      const base = groundAt(mx, mz).h;
      if (base > deckMid - 0.35) continue;       // a ramp lands here
      const top0 = abs ? H : baseAt(x0, z0).h + H, top1 = abs ? H : baseAt(x1, z1).h + H;
      const bottom0 = groundAt(x0 + ox, z0 + oz).h;
      const bottom1 = groundAt(x1 + ox, z1 + oz).h;
      const bd = bAt(mx, mz);
      const cameraFrom = bd.i.length;
      // Outward normal: (ox,oz) already points away from the deck.
      const l = Math.hypot(ox, oz) || 1;
      bd.quad([x0, bottom0, z0], [x0, top0, z0], [x1, top1, z1], [x1, bottom1, z1], col, [ox / l, 0, oz / l]);
      ctx.cameraColliders?.addMesh(bd, cameraFrom, bd.i.length, 'terrain-wall');
      terrainStats.tris += 2; terrainStats.walls++;
      if (collide) { addSegment(x0, z0, x1, z1); terrainStats.colliders++; }
    }
  }

  // --- pad: nine planar regions (deck, four aprons, four hipped corners).
  function emitPad(f) {
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
    // local (u = driver's left, w = forward) -> world
    const P = (u, w) => [f.cx + u * c + w * s, f.cz - u * s + w * c];
    const ru0 = f.runs[0], ru1 = f.runs[1], rw0 = f.runs[2], rw1 = f.runs[3];
    const uEdge = [-f.hw - ru0, -f.hw, f.hw, f.hw + ru1];
    const wEdge = [-f.hl - rw0, -f.hl, f.hl, f.hl + rw1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const u0 = uEdge[i], u1 = uEdge[i + 1], w0 = wEdge[j], w1 = wEdge[j + 1];
        if (u1 - u0 < 1e-6 || w1 - w0 < 1e-6) continue;   // a cliff, not a slope
        const a = P(u0, w0), b = P(u0, w1), d = P(u1, w1), e = P(u1, w0);
        const kind = tKind(f, (a[0] + d[0]) / 2, (a[1] + d[1]) / 2);
        if (i !== 1 && j !== 1) {
          // Corner: min() folds it along the diagonal out of the deck corner.
          const inner = (i === 0) === (j === 0) ? [a, d] : [b, e];
          const other = (i === 0) === (j === 0) ? [b, e] : [a, d];
          tTri(inner[0][0], inner[0][1], other[0][0], other[0][1], inner[1][0], inner[1][1], kind, 0.98);
          tTri(inner[0][0], inner[0][1], inner[1][0], inner[1][1], other[1][0], other[1][1], kind, 0.98);
        } else {
          tQuad(a, b, d, e, kind, i === 1 && j === 1 ? 1 : 0.98);
        }
      }
    }
    // Vertical faces wherever a side has no slope at all.
    const wall = !!f.wall;
    const sides = [
      [ru0, P(-f.hw, -f.hl), P(-f.hw, f.hl), -c, s],
      [ru1, P(f.hw, f.hl), P(f.hw, -f.hl), c, -s],
      [rw0, P(f.hw, -f.hl), P(-f.hw, -f.hl), -s, -c],
      [rw1, P(-f.hw, f.hl), P(f.hw, f.hl), s, c],
    ];
    for (const [run, p0, p1, nx, nz] of sides) {
      if (run > 1e-6) continue;
      tWall(p0[0], p0[1], p1[0], p1[1], nx * 0.6, nz * 0.6, f.H, f.kind, wall, !!f.abs);
    }
  }

  // --- mound: radial fan, 14 segments by 4 rings.
  function emitMound(f) {
    const NS = 14, NR = 4;
    const ring = (k) => {
      const out = [];
      for (let i = 0; i < NS; i++) {
        const a = (i / NS) * Math.PI * 2;
        out.push([f.cx + Math.cos(a) * f.rx * k, f.cz + Math.sin(a) * f.rz * k]);
      }
      return out;
    };
    let prev = null;
    for (let r = 0; r <= NR; r++) {
      const k = r / NR;
      const cur = r === 0 ? null : ring(0.999 * k);
      if (r === 0) { prev = null; continue; }
      for (let i = 0; i < NS; i++) {
        const j = (i + 1) % NS;
        const kind = tKind(f, (cur[i][0] + cur[j][0]) / 2, (cur[i][1] + cur[j][1]) / 2);
        if (!prev) tTri(f.cx, f.cz, cur[j][0], cur[j][1], cur[i][0], cur[i][1], kind, 1);
        else tQuad(prev[i], prev[j], cur[j], cur[i], kind, 1);
      }
      prev = cur;
    }
  }

  // --- ridge: cross-sections along the spine. H = 0 is a flat surface patch.
  function emitRidge(f, step) {
    const half = f.hw + f.run;
    for (let i = 0; i + 3 < f.pts.length; i += 2) {
      const ax = f.pts[i], az = f.pts[i + 1], bx = f.pts[i + 2], bz = f.pts[i + 3];
      const L = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      const nx = -uz, nz = ux;
      const n = Math.max(1, Math.round(L / step));
      const offs = f.H === 0 ? [-f.hw - f.run * 0.5, f.hw + f.run * 0.5] : [-half, -f.hw, f.hw, half];
      for (let k = 0; k < n; k++) {
        const s0 = (k / n) * L, s1 = ((k + 1) / n) * L;
        const p0x = ax + ux * s0, p0z = az + uz * s0;
        const p1x = ax + ux * s1, p1z = az + uz * s1;
        for (let o = 0; o + 1 < offs.length; o++) {
          const a = [p0x + nx * offs[o], p0z + nz * offs[o]];
          const b = [p1x + nx * offs[o], p1z + nz * offs[o]];
          const d = [p1x + nx * offs[o + 1], p1z + nz * offs[o + 1]];
          const e = [p0x + nx * offs[o + 1], p0z + nz * offs[o + 1]];
          const kind = tKind(f, (a[0] + d[0]) / 2, (a[1] + d[1]) / 2);
          if (f.H === 0) {
            // Flat patch: a plain decal a hair above the grass, no normals to
            // win - but "flat" now means flat ON the ground, not at sea level,
            // so the beach follows the bank it is drawn on.
            drapeQuad([a, b, d, e], kind === 'sand' ? Y.sand + 0.002 : Y.park + 0.004,
              tCol(kind, 1));
            terrainStats.tris += 2;
          } else {
            tQuad(a, b, d, e, kind, 1);
          }
        }
      }
    }
  }

  // --- prof: a strip cut at every profile breakpoint, three cells across.
  function emitProf(f) {
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
    const P = (u, w) => [f.cx + u * c + w * s, f.cz - u * s + w * c];
    const uEdge = [-f.hw - f.skirt, -f.hw, f.hw, f.hw + f.skirt];
    for (let i = 0; i + 3 < f.prof.length; i += 2) {
      const w0 = f.prof[i], w1 = f.prof[i + 2];
      // Long shallow runs get a couple of extra cuts so the fog and the lighting
      // do not band across a 20 m triangle.
      const n = Math.max(1, Math.round((w1 - w0) / 6));
      for (let q = 0; q < n; q++) {
        const wa = w0 + (w1 - w0) * (q / n), wb = w0 + (w1 - w0) * ((q + 1) / n);
        for (let u = 0; u < 3; u++) {
          const a = P(uEdge[u], wa), b = P(uEdge[u], wb);
          const d = P(uEdge[u + 1], wb), e = P(uEdge[u + 1], wa);
          const kind = tKind(f, (a[0] + d[0]) / 2, (a[1] + d[1]) / 2);
          tQuad(a, b, d, e, kind, 1);
        }
      }
    }
    // Stairs get their treads drawn on: thin dark lines across the flight.
    if (f.kind === 'stair') {
      const w0 = f.prof[0], w1 = f.prof[f.prof.length - 2];
      const col = tCol('stair', 0.74);
      for (let t = 1; t < 14; t++) {
        const w = w0 + (w1 - w0) * (t / 14);
        const a = P(-f.hw, w), b = P(f.hw, w);
        const ya = groundAt(a[0], a[1]).h + 0.02, yb = groundAt(b[0], b[1]).h + 0.02;
        const bd = bAt(f.cx, f.cz);
        bd.quad([a[0], ya, a[1]], [a[0] + s * 0.22, ya, a[1] + c * 0.22],
          [b[0] + s * 0.22, yb, b[1] + c * 0.22], [b[0], yb, b[1]], col, [0, 1, 0]);
        terrainStats.tris += 2;
      }
    }
  }

  for (const f of terrain.features) {
    if (inside) { const c = featureCentre(f); if (!inside(c[0], c[1])) continue; }
    terrainStats.features++;
    if (f.type === 'pad') emitPad(f);
    else if (f.type === 'mound') emitMound(f);
    else if (f.type === 'ridge') emitRidge(f, f.H === 0 ? 22 : 35);
    else emitProf(f);
  }

  // The Galeries service fence. It is 1.6 m of chain link with a collider, and
  // the whole point of the loading-dock kicker is to go over it.
  {
    const fenceCol = shade(0x8d9096, 0.9), postCol = shade(0x6f7276, 0.9);
    const x = -92;
    // Half of it stands across the mall's service aisle, and it is the ONLY
    // barrier in the bake that does so on purpose: the kicker at the east lip
    // of the dock exists to put you over it. Deliberately not run through the
    // asphalt gate the road-derived furniture below goes through.
    for (let z = -444; z < -416; z += 2) {
      const bd = bAt(x, z);
      const cameraFrom = bd.i.length;
      // Panel by panel on the ground under it - `groundAt`, not `baseAt`,
      // because half of this fence stands on the loading-dock pad and it is the
      // deck it has to be 1.6 m above, not the car park the deck sits on.
      const g0 = groundAt(x, z).h, g1 = groundAt(x, z + 2).h;
      // Both faces: you look at this fence from the dock side on the way in and
      // from the lot side on the way down.
      bd.quad([x, g0, z], [x, g0 + 1.6, z], [x, g1 + 1.6, z + 2], [x, g1, z + 2], fenceCol, [1, 0, 0]);
      bd.quad([x, g1, z + 2], [x, g1 + 1.6, z + 2], [x, g0 + 1.6, z], [x, g0, z], fenceCol, [-1, 0, 0]);
      addSegment(x, z, x, z + 2);
      terrainStats.tris += 4; terrainStats.colliders++;
      if (((z + 444) % 6) === 0) bd.post(x, g0, z, 0.12, 1.75, postCol);
      ctx.cameraColliders?.addMesh(bd, cameraFrom, bd.i.length, 'galeries-fence');
    }
  }

  Object.assign(ctx, { terrainStats });
}
