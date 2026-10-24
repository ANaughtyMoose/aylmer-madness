// Section 4 roads: the road broadphase (4a), the intersection decks (4b), the
// asphalt, joints, shoulders and markings, and the nearestRoad query. The
// sidewalks and kerb corners are walks.js, called from inside the same loops
// so everything is emitted in the order it always was.
import { rgb } from '../../core/mesh.js';
import { C, ROAD_CELL, Y, MAJOR, PAVED } from './consts.js';
import { distPtSeg2 } from './geom.js';
import { buildCemeteryFences } from '../cemetery.js';
import { roadNodes, isJunction } from '../signals.js';
import { kerbCorners, roadWalks } from './walks.js';

export function buildRoads(ctx) {
  const { cover, roads, gkey, areas, baseAt, bAt, addSegment, inside, noteFurniture, interDeck, stripe,
    overBase } = ctx;
  const cnt = ctx.count;
  // ------------------------------------------------------------ 4. roads
  const roadCols = {
    trunk: rgb(C.major), primary: rgb(C.major), secondary: rgb(C.major),
    tertiary: rgb(C.minor), residential: rgb(C.minor), service: rgb(C.service),
  };
  const yellow = rgb(C.yellow), white = rgb(C.white), walkCol = rgb(C.walk);
  const DISC = 10;
  const discCos = new Float32Array(DISC), discSin = new Float32Array(DISC);
  for (let i = 0; i < DISC; i++) {
    const a = (i / DISC) * Math.PI * 2;
    discCos[i] = Math.cos(a); discSin[i] = Math.sin(a);
  }
  // 10-gon disc, +Y facing. Ring order must be clockwise in (x,z) terms... see triTo:
  // negative shoelace == CCW from above, so walk the ring with decreasing angle.
  // Draped: a joint disc is never wider than a carriageway, so it stays one
  // fan, but every point on it rides the hill under the road it patches.
  function disc(x,z,r,y,col) {
    const ring=[];for(let i=0;i<DISC;i++)ring.push([x+discCos[i]*r,z+discSin[i]*r]);
    cover(ring,y,col);
  }

  // -------------------------------------------------- 4a. the road broadphase
  // Built BEFORE any geometry, because every piece of street furniture laid
  // beside a road - gutter, sidewalk slab, kerb corner, shoulder, streetlight,
  // park tree - has to be able to ask whether it is about to land in somebody
  // else's lane. It used to be filled inside the geometry loop below, so a way
  // could only ever see the ways ahead of it in MAP.roads, which is to say
  // almost none of them at the point where it laid its pavement.
  //
  // Seven slots a segment: ax, az, bx, bz, rad2 (roadAt's generous kerb + 0.8,
  // which is what the car's on-tarmac test has always used), hw (the honest
  // half width of the asphalt) and ri (the way it came from).
  const roadSegs = [];
  const roadGrid = new Map();
  const nearSegs = [];         // ax,az,bx,bz,roadIndex for nearestRoad (non-service)
  for (let ri = 0; ri < roads.length; ri++) {
    const road = roads[ri];
    const pts = road.pts, n = pts.length;
    if (n < 2) continue;
    const hw = road.w / 2;
    const rad = hw + 0.8;
    const service = road.cls === 'service';
    for (let i = 0; i < n - 1; i++) {
      const idx = roadSegs.length / 7;
      roadSegs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rad * rad, hw, ri);
      const i0 = Math.floor((Math.min(pts[i][0], pts[i + 1][0]) - rad) / ROAD_CELL);
      const i1 = Math.floor((Math.max(pts[i][0], pts[i + 1][0]) + rad) / ROAD_CELL);
      const j0 = Math.floor((Math.min(pts[i][1], pts[i + 1][1]) - rad) / ROAD_CELL);
      const j1 = Math.floor((Math.max(pts[i][1], pts[i + 1][1]) + rad) / ROAD_CELL);
      for (let a = i0; a <= i1; a++) {
        for (let b = j0; b <= j1; b++) {
          const k = gkey(a, b);
          let arr = roadGrid.get(k);
          if (!arr) { arr = []; roadGrid.set(k, arr); }
          arr.push(idx);
        }
      }
      if (!service) nearSegs.push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ri);
    }
  }
  const roadSegArr = Float64Array.from(roadSegs);
  // Walks continue across driveways and lot aisles, but stop for streets.
  const segSvc = new Uint8Array(roadSegs.length / 7);
  for (let k = 0; k < segSvc.length; k++) segSvc[k] = roads[roadSegArr[k * 7 + 6]].cls === 'service' ? 1 : 0;
  function streetClear(x,z,margin=2.6) {
    const ix=Math.floor(x/ROAD_CELL),iz=Math.floor(z/ROAD_CELL);
    for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++) {
      for(const id of roadGrid.get(gkey(i,j)) || []) {
        const o=id*7,r=roadSegArr[o+5]+margin;
        if(distPtSeg2(x,z,roadSegArr[o],roadSegArr[o+1],roadSegArr[o+2],roadSegArr[o+3])<r*r)return false;
      }
    }
    return true;
  }
  const cemeteryFences=buildCemeteryFences(areas,{clear:streetClear,baseAt,bAt,addSegment,inside,cameraColliders:ctx.cameraColliders});

  // "Is the car on tarmac?" - unchanged, kerb + 0.8 so a wheel on the gutter
  // still counts as on the road.
  function roadAt(x, z) {
    const arr = roadGrid.get(gkey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
    if (!arr) return false;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k] * 7;
      if (distPtSeg2(x, z, roadSegArr[o], roadSegArr[o + 1], roadSegArr[o + 2], roadSegArr[o + 3])
        <= roadSegArr[o + 4]) return true;
    }
    return false;
  }

  // "Would this piece of street furniture be standing in a lane?" - the honest
  // asphalt half width plus `margin`, ignoring the way the piece belongs to
  // (`skip` < 0 tests every way). The Hull sector brought five times as much
  // road with it, and with it a lot of parallel and shallow-angle duplicates: a
  // dual carriageway, or one street cut into two ways where its name changes.
  // Each of those used to lay its own pavement straight across the other's
  // asphalt, which is the sidewalk-in-the-road the owner keeps driving over.
  // `margin` must stay under 0.8 or it outruns the grid registration above.
  function pavedAt(x, z, skip, margin, streetsOnly = false) {
    const arr = roadGrid.get(gkey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
    if (!arr) return false;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k] * 7;
      if (roadSegArr[o + 6] === skip) continue;
      if (streetsOnly && segSvc[arr[k]]) continue;
      const r = roadSegArr[o + 5] + margin;
      if (distPtSeg2(x, z, roadSegArr[o], roadSegArr[o + 1], roadSegArr[o + 2], roadSegArr[o + 3])
        <= r * r) return true;
    }
    return false;
  }

  // Walk a stretch of one road segment and hand back the runs where a piece of
  // furniture clears every other way's asphalt at all of `offs` lateral offsets.
  // Clipping instead of dropping is what keeps the pavement running right up to
  // the kerb of the street that crosses it, rather than losing the whole block.
  // The returned array is reused; copy anything you keep.
  const runOut = [];
  function clearRuns(px, pz, dx, dz, nx, nz, s0, s1, offs, ci, skip, margin, step, kind, ri) {
    runOut.length = 0;
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    let open = -1, last = 0;
    const streetsOnly = kind === 'walk';
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * (i / n);
      const cx = px + dx * s, cz = pz + dz * s;
      let hit = false;
      for (let k = 0; k < offs.length && !hit; k++) {
        hit = pavedAt(cx + nx * offs[k], cz + nz * offs[k], skip, margin, streetsOnly);
      }
      if (hit) {
        // Record where the band would have gone, so the smoke test can report
        // how much of it used to be laid across a lane.
        noteFurniture(cx + nx * offs[ci], cz + nz * offs[ci], kind, ri, true);
        cnt.furnDropped++;
        if (open >= 0 && last > open) runOut.push(open, last);
        open = -1;
      } else {
        if (open < 0) open = s;
        last = s;
      }
    }
    if (open >= 0 && last > open) runOut.push(open, last);
    return runOut;
  }

  const LOFF = [0, 0, 0, 0];   // lateral offset scratch for clearRuns
  // A name has one sidewalk policy across all of its ways. The preferred side
  // is a world direction, so reversed ways still put the walk on the same side.
  const WALK_OVERRIDE = {};
  const policyCache = new Map();
  function walkPolicy(road) {
    const key = road.name || road;
    if (policyCache.has(key)) return policyCache.get(key);
    const h = streetHash(road.name || '', road.name ? 0 : (road.pts[0][0] * 7 + road.pts[0][1] * 13) | 0);
    const ov = WALK_OVERRIDE[road.name || ''];
    const r = h % 100;
    const mode = ov ? ov.mode : r < 22 ? 0 : r < 82 ? 1 : 2;
    const ang = ov ? ov.ang : ((h >>> 8) % 4) * (Math.PI / 2) + Math.PI / 4;
    const policy = { mode, px: Math.cos(ang), pz: Math.sin(ang) };
    policyCache.set(key, policy);
    return policy;
  }
  // walks.js reads these while the loops below run.
  Object.assign(ctx, { roadCols, walkCol, DISC, discCos, discSin, roadGrid, roadSegArr, streetClear,
    cemeteryFences, roadAt, pavedAt, clearRuns, LOFF, walkPolicy });

  // -------------------------------------------------- 4b. intersections (W3)
  // Every node where three or more road ends meet becomes one convex polygon:
  // take each branch out to `ext` and both its kerb corners there, hull the lot.
  // That single shape covers the mitre seams, so no joint disc is needed and the
  // markings can simply be clipped to `ext` from the node.
  const NODES = roadNodes();
  const interExt = new Map();      // osm node id -> how far the polygon reaches

  function convexHull(pts) {
    pts.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
      up.push(p);
    }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  const hullPts = [];
  for (const nd of NODES.values()) {
    if (!isJunction(nd)) continue;
    const ext = nd.ext;
    hullPts.length = 0;
    let rank = 0;
    for (const b of nd.br) {
      const px = -b.dz, pz = b.dx;
      const cx = nd.x + b.dx * ext, cz = nd.z + b.dz * ext;
      hullPts.push([cx + px * b.hw, cz + pz * b.hw], [cx - px * b.hw, cz - pz * b.hw]);
      if (b.rank > rank) rank = b.rank;
    }
    const ring = convexHull(hullPts.slice());
    if (ring.length < 3) continue;
    const col = rank >= 3 ? roadCols.trunk : rank >= 2 ? roadCols.tertiary : roadCols.residential;
    interDeck(bAt(nd.x, nd.z), ring, Y.inter, col);
    interExt.set(nd.id, ext);
    cnt.interCount++;

    // Sidewalk corners (walks.js): the kerb radius between two paved branches.
    kerbCorners(ctx, nd, ext);
  }
  const clearAt = (id) => interExt.get(id) || 0;

  // A white bar across the approach lane, from the centreline to the kerb.
  function stopLine(x, z, dx, dz, hw, yaw) {
    const rxx = -dz, rzz = dx;
    const cx = x + rxx * hw * 0.5, cz = z + rzz * hw * 0.5;
    stripe(cx, cz, hw * 0.9, 0.55, Y.mark, yaw, white);
    cnt.stopLineCount++;
  }

  const lx = [], lz = [], rx = [], rz = [];   // offset polyline scratch
  // Stable street-level hash: all fragments with the same name get the same
  // sidewalk policy, avoiding a pavement that randomly swaps sides mid-block.
  function streetHash(name, fallback) {
    let h = 2166136261 ^ fallback;
    const s = name || '';
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const gutterCol = rgb(C.gutter), shoulderCol = rgb(C.shoulder);
  // walks.js reads these while the loops below run.
  Object.assign(ctx, { gutterCol });
  for (let ri = 0; ri < roads.length; ri++) {
    const road = roads[ri];
    const pts = road.pts, ids = road.ids, n = pts.length;
    if (n < 2) continue;
    const hw = road.w / 2;
    const isService = road.cls === 'service';
    const y = isService ? Y.service : Y.road;
    const age = streetHash(road.name, road.name ? 0 : ri) % 5;
    const col = (roadCols[road.cls] || roadCols.residential).map(v => Math.min(1,v*(age===0?0.94:1.12+age*0.09)));
    const major = MAJOR[road.cls] === 1;
    const paved = PAVED[road.cls] === 1;
    const rh = streetHash(road.name, ri);
    // Collectors keep both walks. Residential streets have zero, one or two.
    const residentialWalk = road.cls === 'residential';
    const policy = residentialWalk ? walkPolicy(road) : null;
    const walkSides = paved || (residentialWalk && policy.mode > 0) ? [1, -1] : [];

    // per-segment unit direction + right-hand normal
    const dxs = new Float64Array(n - 1), dzs = new Float64Array(n - 1), lens = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const l = Math.hypot(dx, dz) || 1;
      dxs[i] = dx / l; dzs[i] = dz / l; lens[i] = l;
    }

    // mitred offsets at each vertex
    lx.length = 0; lz.length = 0; rx.length = 0; rz.length = 0;
    const maxMitre = hw * 2.5;
    for (let i = 0; i < n; i++) {
      let ox, oz;
      if (i === 0) { ox = dzs[0]; oz = -dxs[0]; }
      else if (i === n - 1) { ox = dzs[n - 2]; oz = -dxs[n - 2]; }
      else {
        const n0x = dzs[i - 1], n0z = -dxs[i - 1];
        const n1x = dzs[i], n1z = -dxs[i];
        let mx = n0x + n1x, mz = n0z + n1z;
        const ml = Math.hypot(mx, mz);
        if (ml < 1e-4) { ox = n1x; oz = n1z; }
        else {
          mx /= ml; mz /= ml;
          const d = mx * n1x + mz * n1z;
          let scale = d > 0.2 ? 1 / d : 1 / 0.2;
          if (hw * scale > maxMitre) scale = maxMitre / hw;
          ox = mx * scale; oz = mz * scale;
        }
      }
      lx.push(pts[i][0] + ox * hw); lz.push(pts[i][1] + oz * hw);
      rx.push(pts[i][0] - ox * hw); rz.push(pts[i][1] - oz * hw);
    }

    // asphalt: one quad per segment, chunked by midpoint. A mitre can extend
    // beyond a very short neighbouring segment and fold the strip into a bow
    // tie. Fall back to the segment's own square corners in that case; the
    // joint disc (or intersection polygon) already covers the resulting seam.
    for (let i = 0; i < n - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
      let l0x = lx[i], l0z = lz[i], r0x = rx[i], r0z = rz[i];
      let l1x = lx[i + 1], l1z = lz[i + 1], r1x = rx[i + 1], r1z = rz[i + 1];
      const cross = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const a0 = cross(l0x, l0z, r0x, r0z, r1x, r1z);
      const a1 = cross(l0x, l0z, r1x, r1z, l1x, l1z);
      if (a0 >= -1e-6 || a1 >= -1e-6) {
        const nx = dzs[i] * hw, nz = -dxs[i] * hw;
        l0x = pts[i][0] + nx; l0z = pts[i][1] + nz;
        r0x = pts[i][0] - nx; r0z = pts[i][1] - nz;
        l1x = pts[i + 1][0] + nx; l1z = pts[i + 1][1] + nz;
        r1x = pts[i + 1][0] - nx; r1z = pts[i + 1][1] - nz;
      }
      cover([[l0x,l0z],[r0x,r0z],[r1x,r1z],[l1x,l1z]],y,col);
      // Square utility cuts, trench patches, iron manholes and gutter grates.
      // Repairs are visual decals, with the original port's subtle green tint.
      const wear=(rh+Math.imul(i+1,2654435761))>>>0;
      if(!isService && lens[i]>18 && overBase(mx,mz,mx,mz)) {
        const yaw=Math.atan2(dxs[i],dzs[i]),nx=dzs[i],nz=-dxs[i];
        const tone=age===0?0.86:(wear>>>9)%3===0?1.1:0.9;
        const patchCol=[col[0]*tone,col[1]*tone*1.09,col[2]*tone];
        const along=((wear>>>4)%100)/100-0.5;
        if(wear%4===0) {
          const side=(wear>>>12)&1?1:-1;
          const px=mx+dxs[i]*along*lens[i]*0.6+nx*hw*0.5*side,pz=mz+dzs[i]*along*lens[i]*0.6+nz*hw*0.5*side;
          stripe(px,pz,hw*0.92,1.2+((wear>>>14)%15)/10,Y.inter+0.007,yaw,patchCol);
        } else if(wear%4===1 && age>1) {
          const side=(wear>>>12)&1?1:-1, L=Math.min(lens[i]*0.7,5+((wear>>>14)%9));
          const px=mx+nx*hw*0.62*side,pz=mz+nz*hw*0.62*side;
          stripe(px,pz,0.9+((wear>>>18)%4)/10,L,Y.inter+0.007,yaw,patchCol);
        }
        if(wear%7===0) {
          const side=(wear>>>13)&1?1:-1;
          disc(mx+nx*hw*0.4*side,mz+nz*hw*0.4*side,0.33,Y.inter+0.01,rgb(0x2e2d2b));
        }
        if(wear%5===2 && walkSides.length) {
          const side=(wear>>>15)&1?1:-1;
          stripe(mx+nx*(hw-0.25)*side,mz+nz*(hw-0.25)*side,0.42,0.75,Y.inter+0.012,yaw,rgb(0x262624));
        }
      }
      // Streets without a concrete walk transition through a narrow compacted
      // shoulder, rather than ending in a perfectly sharp asphalt/grass seam.
      if (road.cls === 'residential' && walkSides.length === 0 && lens[i] > 2) {
        const yaw = Math.atan2(dxs[i], dzs[i]);
        const nx = dzs[i], nz = -dxs[i];
        for (const side of [1, -1]) {
          // The gravel edge is only 0.68 m wide, but it is still 0.68 m of
          // shoulder painted down the middle of whatever runs alongside.
          LOFF.length = 2;
          LOFF[0] = (hw + 0.34) * side; LOFF[1] = (hw + 0.68) * side;
          const runs = clearRuns(pts[i][0], pts[i][1], dxs[i], dzs[i],
            nx, nz, 0, lens[i], LOFF, 0, ri, 0.2, 2, 'shoulder', ri);
          for (let q = 0; q < runs.length; q += 2) {
            const L = runs[q + 1] - runs[q];
            if (L < 1.5) continue;
            const c = (runs[q] + runs[q + 1]) / 2;
            const bx = pts[i][0] + dxs[i] * c, bz = pts[i][1] + dzs[i] * c;
            const sx = bx + nx * (hw + 0.34) * side, sz = bz + nz * (hw + 0.34) * side;
            stripe(sx, sz, 0.68, L, Y.service - 0.002, yaw, shoulderCol);
            noteFurniture(sx, sz, 'shoulder', ri, false);
          }
        }
      }
    }

    if (isService) continue;   // service roads: no discs, markings or sidewalks

    // How far into each end of a segment the intersection polygon reaches. Every
    // marking and sidewalk below is clipped to the gap between the two, which is
    // what stops the dashes crossing the junction (W3).
    const cut = new Float64Array(n);
    for (let i = 0; i < n; i++) cut[i] = clearAt(ids ? ids[i] : -1);

    // Joint discs hide the seams where ways meet and where a sharp mitre was
    // clamped. Skipped at near-collinear interior vertices, where the mitre is
    // already exact, and at junctions, where the intersection polygon covers it.
    for (let i = 0; i < n; i++) {
      if (cut[i] > 0) continue;               // a real junction: polygon does the job
      if (i > 0 && i < n - 1) {
        const d = dxs[i - 1] * dxs[i] + dzs[i - 1] * dzs[i];
        if (d > 0.99) continue;               // < ~8 degrees of bend
      }
      disc(pts[i][0], pts[i][1], hw, y, col);
      cnt.jointCount++;
    }

    // dashed yellow centre line
    // Vieux-Aylmer's Rue Principale has no painted centre line in the 2009 refs.
    const noCentre = road.name === 'Rue Principale' && pts.every((q) => q[0] < -200);
    if (paved && !road.oneway && !noCentre) {
      let carry = 2;
      for (let i = 0; i < n - 1; i++) {
        const L = lens[i], dx = dxs[i], dz = dzs[i];
        const s0 = cut[i] > 0 ? cut[i] + 0.8 : 0;
        const s1 = L - (cut[i + 1] > 0 ? cut[i + 1] + 0.8 : 0);
        const yaw = Math.atan2(dx, dz);
        let s = Math.max(carry, s0);
        while (s + 4 <= s1) {
          const cx = pts[i][0] + dx * (s + 2), cz = pts[i][1] + dz * (s + 2);
          stripe(cx, cz, 0.17, age===0?4:3.7, Y.mark, yaw, yellow.map((v,k)=>v*(age===0?1:0.76)+col[k]*(age===0?0:0.24)));
          cnt.dashCount++;
          s += 10;
        }
        carry = Math.max(0, s - L);
      }
    }

    // solid white edge lines, inset 0.5 m from the asphalt edge
    if (major) {
      for (let i = 0; i < n - 1; i++) {
        const s0 = cut[i] > 0 ? cut[i] + 0.8 : 0;
        const s1 = lens[i] - (cut[i + 1] > 0 ? cut[i + 1] + 0.8 : 0);
        const L = s1 - s0;
        if (L < 1.5) continue;
        const dx = dxs[i], dz = dzs[i];
        const yaw = Math.atan2(dx, dz);
        const nx = dz, nz = -dx;
        const mid = (s0 + s1) / 2;
        const mx = pts[i][0] + dx * mid, mz = pts[i][1] + dz * mid;
        const off = hw - 0.5;
        for (const s of [1, -1]) {
          const cx = mx + nx * off * s, cz = mz + nz * off * s;
          stripe(cx, cz, 0.16, L, Y.mark, yaw, white.map((v,k)=>v*0.72+col[k]*0.28));
        }
      }
    }

    // Concrete sidewalks outside the asphalt (walks.js).
    if (walkSides.length) roadWalks(ctx, ri, pts, n, hw, dxs, dzs, lens, cut, walkSides, policy);
  }

  // ------------------------------------------------------------ nearestRoad
  const nearArr = Float64Array.from(nearSegs);
  function nearestRoad(x, z) {
    let best = Infinity, bx = x, bz = z, byaw = 0, bname = '';
    for (let o = 0; o < nearArr.length; o += 5) {
      const ax = nearArr[o], az = nearArr[o + 1], qx = nearArr[o + 2], qz = nearArr[o + 3];
      const dx = qx - ax, dz = qz - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = ax + t * dx, pz = az + t * dz;
      const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d2 < best) {
        best = d2; bx = px; bz = pz;
        byaw = Math.atan2(dx, dz);
        bname = roads[nearArr[o + 4]].name || '';
      }
    }
    return { x: bx, z: bz, yaw: byaw, name: bname, dist: Math.sqrt(best) };
  }

  Object.assign(ctx, { stopLine, nearestRoad, nearArr });
}
