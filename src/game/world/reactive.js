// Section 9: the reactive world (sidewalk runs, prop spots, building lookup)
// and the pole queries (queryPoles, snapPole).
import { pointInPoly, distPtSeg2, subsample } from './geom.js';
import { PAVED, SEG_CELL } from './consts.js';
import { clamp, mulberry32 } from '../../core/math.js';
import { launchFragment, fragmentBuilder } from '../breakables.js';

export function buildReactive(ctx) {
  const { buildings, gkey, B, roadAt, waterAt, roads, baseAt, pois, inside, areas, walkPolicy } = ctx;
  // ------------------------------------------------------------ 9. reactive world
  // Placement only. This section works out where the pavement actually runs and
  // picks the spots for the small knock-over furniture; peds.js, streetprops.js
  // and debris.js turn those lists into geometry and behaviour. Nothing here
  // builds a mesh or touches the renderer, so the merge surface between the
  // reactive world and the rest of the bake is exactly these two arrays.
  // Gatineau hydrants stand on the grass behind a curb-side sidewalk (city
  // standard drawings, 1.5 m clear all round), not in the middle of the walk.
  const HYD_BACK = 1.45;
  const REACT = {
    step: 5,        // metres between sidewalk nodes
    minRun: 20,     // a run shorter than this is not a block anybody walks
    trim: 7,        // metres of each road end left to the intersection
    pad: 0.9,       // clearance kept from a building wall
    cap: 1600,      // hard ceiling on knockable props
    dressed: 9,     // % of residential streets that are out for collection
  };
  // FNV-1a over the street name: same street, same answer, every build.
  function strHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // -- building footprints, indexed, so a spot can be rejected for being indoors
  const BLD_CELL = 48;
  const bldGrid = new Map();
  // Bounding box per footprint, so the sampler below rejects nearly everything
  // with four comparisons instead of a point-in-polygon over 14 vertices.
  const bldBox = new Float64Array(buildings.length * 4);
  {
    for (let i = 0; i < buildings.length; i++) {
      const p = buildings[i].p;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < p.length; k++) {
        if (p[k][0] < x0) x0 = p[k][0]; if (p[k][0] > x1) x1 = p[k][0];
        if (p[k][1] < z0) z0 = p[k][1]; if (p[k][1] > z1) z1 = p[k][1];
      }
      bldBox[i * 4] = x0; bldBox[i * 4 + 1] = z0;
      bldBox[i * 4 + 2] = x1; bldBox[i * 4 + 3] = z1;
      const i0 = Math.floor(x0 / BLD_CELL), i1 = Math.floor(x1 / BLD_CELL);
      const j0 = Math.floor(z0 / BLD_CELL), j1 = Math.floor(z1 / BLD_CELL);
      for (let a = i0; a <= i1; a++) {
        for (let b = j0; b <= j1; b++) {
          const key = gkey(a, b);
          const arr = bldGrid.get(key);
          if (arr) arr.push(i); else bldGrid.set(key, [i]);
        }
      }
    }
  }
  // True if (x, z) is inside a footprint, or within `pad` metres of one of its
  // walls. Exported: the smoke test asserts no pedestrian spawns indoors.
  function buildingAt(x, z, pad = 0) {
    const arr = bldGrid.get(gkey(Math.floor(x / BLD_CELL), Math.floor(z / BLD_CELL)));
    if (!arr) return false;
    const p2 = pad * pad;
    for (let k = 0; k < arr.length; k++) {
      const bi = arr[k], o = bi * 4;
      if (x < bldBox[o] - pad || x > bldBox[o + 2] + pad
        || z < bldBox[o + 1] - pad || z > bldBox[o + 3] + pad) continue;
      const p = buildings[bi].p;
      if (pointInPoly(p, x, z)) return true;
      if (pad <= 0) continue;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if (distPtSeg2(x, z, p[j][0], p[j][1], p[i][0], p[i][1]) < p2) return true;
      }
    }
    return false;
  }

  // -- sidewalk lines. Same offset the concrete band in section 4 uses
  // (road.w/2 + 1.1, band 2.2 m wide), pushed out to 1.4 so a walker is clear of
  // the roadAt radius, and resampled at a fixed 5 m so arc-length is an index.
  const walks = [];
  const WALK_CELL = 128;
  const walkGrid = new Map();
  const offPts = [];
  const cum = [0];
  // Somewhere a person could actually stand: inside the map, off the tarmac,
  // out of the river, clear of a wall.
  function walkable(x, z) {
    return x > B.minX + 8 && x < B.maxX - 8 && z > B.minZ + 8 && z < B.maxZ - 8
      && !roadAt(x, z) && !waterAt(x, z) && !buildingAt(x, z, REACT.pad);
  }
  function pushWalk(run, cls, name, side) {
    if (run.length < (REACT.minRun / REACT.step + 1) * 2) return;
    const pts = Float32Array.from(run);
    const w = {
      pts, n: pts.length >> 1, len: ((pts.length >> 1) - 1) * REACT.step,
      cls, name, side, cx: 0, cz: 0,
    };
    for (let i = 0; i < pts.length; i += 2) { w.cx += pts[i]; w.cz += pts[i + 1]; }
    w.cx /= w.n; w.cz /= w.n;
    const wi = walks.length;
    walks.push(w);
    let lastKey = -1;
    for (let i = 0; i < pts.length; i += 2) {
      const key = gkey(Math.floor(pts[i] / WALK_CELL), Math.floor(pts[i + 1] / WALK_CELL));
      if (key === lastKey) continue;
      lastKey = key;
      const arr = walkGrid.get(key);
      if (arr) { if (arr[arr.length - 1] !== wi) arr.push(wi); } else walkGrid.set(key, [wi]);
    }
  }

  const PED_BOTH = [1, -1], PED_POS = [1], PED_NEG = [-1];
  for (const road of roads) {
    const paved = PAVED[road.cls] === 1;
    const res = road.cls === 'residential';
    if (!paved && !res) continue;
    const pts = road.pts, n = pts.length;
    if (n < 2) continue;
    const off = road.w / 2 + 1.4;
    // People use the sidewalk side, or one shoulder if the street has no walk.
    let pedSides = PED_BOTH;
    if (res) {
      const policy = walkPolicy(road);
      if (policy.mode < 2) {
        let ax = 0, az = 0;
        for (let i = 0; i < n - 1; i++) { ax += pts[i + 1][1] - pts[i][1]; az -= pts[i + 1][0] - pts[i][0]; }
        pedSides = ax * policy.px + az * policy.pz >= 0 ? PED_NEG : PED_POS;
      }
    }
    for (const side of pedSides) {
      // Offset polyline: each vertex pushed out along its own segment's normal.
      offPts.length = 0;
      for (let i = 0; i < n; i++) {
        const a = i < n - 1 ? i : n - 2;
        let dx = pts[a + 1][0] - pts[a][0], dz = pts[a + 1][1] - pts[a][1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        offPts.push(pts[i][0] - dz * off * side, pts[i][1] + dx * off * side);
      }
      // Resample it every REACT.step metres, keeping runs of usable nodes.
      // cum[i] is the distance along the offset line to vertex i, so walking s
      // forward is one monotone index chase and every node comes out exactly
      // REACT.step from the last (which is what makes peds.at() a lerp).
      cum.length = 1; cum[0] = 0;
      for (let i = 0; i + 3 < offPts.length; i += 2) {
        cum.push(cum[cum.length - 1]
          + Math.hypot(offPts[i + 2] - offPts[i], offPts[i + 3] - offPts[i + 1]));
      }
      const total = cum[cum.length - 1];
      if (total < REACT.trim * 2 + REACT.minRun) continue;
      let seg = 0;
      const run = [];
      for (let s = REACT.trim; s <= total - REACT.trim; s += REACT.step) {
        while (seg + 2 < cum.length && cum[seg + 1] < s) seg++;
        const segLen = cum[seg + 1] - cum[seg];
        const t = segLen > 1e-6 ? clamp((s - cum[seg]) / segLen, 0, 1) : 0;
        const o = seg * 2;
        const x = offPts[o] + (offPts[o + 2] - offPts[o]) * t;
        const z = offPts[o + 1] + (offPts[o + 3] - offPts[o + 1]) * t;
        // A hairpin can fold the offset line back on itself, which would break
        // the "every node is step apart" invariant peds.at() leans on. Cut the
        // run there rather than carry a node that lies.
        const bad = !walkable(x, z)
          || (run.length >= 2
            && Math.abs(Math.hypot(x - run[run.length - 2], z - run[run.length - 1])
              - REACT.step) > 1.0);
        if (bad) {
          pushWalk(run, road.cls, road.name || '', side);
          run.length = 0;
          if (walkable(x, z)) run.push(x, z);
          continue;
        }
        run.push(x, z);
      }
      pushWalk(run, road.cls, road.name || '', side);
    }
  }

  const walkOut = [];
  // Every sidewalk run with a node inside `r` of (x, z). The array is reused.
  function queryWalks(x, z, r) {
    walkOut.length = 0;
    const i0 = Math.floor((x - r) / WALK_CELL), i1 = Math.floor((x + r) / WALK_CELL);
    const j0 = Math.floor((z - r) / WALK_CELL), j1 = Math.floor((z + r) / WALK_CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = walkGrid.get(gkey(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const wi = arr[k];
          if (walkOut.indexOf(wi) < 0) walkOut.push(wi);
        }
      }
    }
    return walkOut;
  }

  // -- knockable street furniture. Garbage day on the residential streets, post
  // and newspaper boxes on the commercial ones, café furniture on Principale,
  // carts in the Galeries lot, a fruit stand outside the dep.
  const propSpots = [];
  let specialFrom = 0;
  {
    const rnd = mulberry32(0x9e11ed);
    // Same test the pavement itself had to pass, with a smaller wall clearance:
    // furniture stands closer to a storefront than a person walks.
    // `y` is the pavement under the bin, sampled once here rather than once per
    // prop per frame: streetprops.js bakes every spot into a chunk mesh and
    // never moves it again, so this is the only place that needs to know.
    const add = (x, z, yaw, kind) => {
      if (roadAt(x, z) || waterAt(x, z) || buildingAt(x, z, 0.35)) return;
      propSpots.push({ x, z, y: baseAt(x, z).h, yaw, kind });
    };
    // A street is either garbage day or it is not, and both sides of it agree,
    // because the draw is a hash of the street NAME. That is what puts a row of
    // bins down one block and leaves the next one bare - 1,500 props spread
    // evenly over 250 km of pavement would be one bin every 160 m, which reads
    // as nothing at all. Commercial streets are always dressed.
    for (let wi = 0; wi < walks.length; wi++) {
      const w = walks[wi];
      const res = w.cls === 'residential';
      const principale = /Principale/i.test(w.name);
      const dressed = (strHash(w.name || ('w' + wi)) % 100) < REACT.dressed;
      // Principale is the shopping street, so it is always dressed and dense.
      // Other commercial streets get the odd box; a residential street is either
      // out for collection or empty.
      let gap;
      if (principale) gap = 20 + rnd() * 14;
      else if (!res) gap = 95 + rnd() * 90;
      else if (dressed) gap = 11 + rnd() * 10;
      else continue;
      let s = 6 + rnd() * 14;
      while (s < w.len - 4) {
        const i = Math.min(w.n - 2, Math.floor(s / REACT.step));
        const t = (s - i * REACT.step) / REACT.step;
        const o = i * 2;
        const x = w.pts[o] + (w.pts[o + 2] - w.pts[o]) * t;
        const z = w.pts[o + 1] + (w.pts[o + 3] - w.pts[o + 1]) * t;
        const dx = w.pts[o + 2] - w.pts[o], dz = w.pts[o + 3] - w.pts[o + 1];
        // face the road: the walk was pushed out along +normal*side
        const yaw = Math.atan2(dx, dz) + (w.side > 0 ? -Math.PI / 2 : Math.PI / 2);
        const nx = -dz / (Math.hypot(dx, dz) || 1) * w.side;
        const nz = dx / (Math.hypot(dx, dz) || 1) * w.side;
        const p = rnd();
        if (res) {
          if (p < 0.42) {                        // bins out at the end of a driveway
            add(x + nx * -0.35, z + nz * -0.35, yaw, 'garbage');
            if (rnd() < 0.75) add(x - dz * 0 + nx * -0.35 + dx * 0.14, z + nz * -0.35 + dz * 0.14, yaw, 'recyc');
          } else if (p < 0.60) add(x, z, yaw, 'mailbox');
          else if (p < 0.72) add(x + nx * HYD_BACK, z + nz * HYD_BACK, yaw, 'hydrant');
          else if (p < 0.78) add(x, z, yaw, 'relaybox');
          else if (p < 0.82) add(x, z, yaw, 'newsbox');
        } else {
          if (p < 0.22) add(x, z, yaw, 'newsbox');
          else if (p < 0.40) add(x, z, yaw, 'relaybox');
          else if (p < 0.54) add(x, z, yaw, 'mailbox');
          else if (p < 0.78) add(x + nx * HYD_BACK, z + nz * HYD_BACK, yaw, 'hydrant');
          else if (p < 0.84 && !principale) add(x, z, yaw, 'garbage');
          if (principale && rnd() < 0.34) {       // a terrasse, two chairs to a table
            add(x, z, yaw, 'cafetable');
            add(x + nx * 0.85 + dx * 0.10, z + nz * 0.85 + dz * 0.10, yaw + 2.7, 'cafechair');
            add(x + nx * 0.85 - dx * 0.10, z + nz * 0.85 - dz * 0.10, yaw - 2.7, 'cafechair');
          }
        }
        s += gap * (0.85 + rnd() * 0.3);
      }
    }
    // Hand-placed one-offs from here down: they go in `specials`, which skips
    // the subsample below, or the fruit stand at the dep would be a 1-in-5 shot.
    specialFrom = propSpots.length;
    // Shopping carts, loose in the Galeries d'Aylmer lot.
    const mall = pois.find((q) => /Galeries/i.test(q.name || '')) || { x: -18.9, z: -331.2 };
    // lotD < 0: the mall is in another slice, so no lot here can be its lot.
    let lot = null, lotD = inside && !inside(mall.x, mall.z) ? -1 : 1e9;
    for (const a of areas) {
      if (a.k !== 'parking') continue;
      let cx = 0, cz = 0;
      for (const q of a.p) { cx += q[0]; cz += q[1]; }
      cx /= a.p.length; cz /= a.p.length;
      const d = (cx - mall.x) ** 2 + (cz - mall.z) ** 2;
      if (d < lotD) { lotD = d; lot = a; }
    }
    if (lot) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const q of lot.p) {
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
        if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1];
      }
      for (let n = 0, tries = 0; n < 26 && tries < 400; tries++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (!pointInPoly(lot.p, x, z) || roadAt(x, z) || buildingAt(x, z, 1.4)) continue;
        add(x, z, rnd() * 6.28, 'cart');
        n++;
      }
    }
    // The fruit stand outside Dépanneur Palmyra, on the nearest bit of pavement.
    const dep = pois.find((q) => /Palmyra/i.test(q.name || ''));
    if (dep) {
      let best = null, bestD = 60 * 60;
      for (const wi of queryWalks(dep.x, dep.z, 60)) {
        const w = walks[wi];
        for (let i = 0; i < w.pts.length; i += 2) {
          const d = (w.pts[i] - dep.x) ** 2 + (w.pts[i + 1] - dep.z) ** 2;
          if (d < bestD) { bestD = d; best = [w.pts[i], w.pts[i + 1]]; }
        }
      }
      if (best) add(best[0], best[1], Math.atan2(dep.x - best[0], dep.z - best[1]), 'fruitstand');
    }
  }
  // The hand-placed one-offs skip the cap's subsample, so the fruit stand is not
  // a one-in-five chance of existing.
  const specials = propSpots.splice(specialFrom);
  const walkSpots = propSpots.length;
  const propSpotList = subsample(propSpots, Math.max(0, REACT.cap - specials.length))
    .concat(specials);
  const walkMetres = walks.reduce((a, w) => a + w.len, 0) | 0;
  console.log(`react: ${walks.length} sidewalk runs (${walkMetres} m), `
    + `${propSpotList.length} prop spots (${walkSpots} on pavement, `
    + `${specials.length} hand-placed)`);

  Object.assign(ctx, { REACT, buildingAt, walks, queryWalks, propSpotList, bldBox, bldGrid, walkGrid });
}

export function installPoleQueries(ctx) {
  const { poleGrid, gkey, opts, renderer } = ctx;
  // ------------------------------------------------------------ pole queries
  const segDead = ctx.allocSegDead();
  const poleOut = [];
  function queryPoles(x, z, r) {
    poleOut.length = 0;
    const i0 = Math.floor((x - r) / SEG_CELL), i1 = Math.floor((x + r) / SEG_CELL);
    const j0 = Math.floor((z - r) / SEG_CELL), j1 = Math.floor((z + r) / SEG_CELL);
    const r2 = r * r;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = poleGrid.get(gkey(i, j));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const p = arr[k];
          if (p.dead) continue;
          const dx = p.x - x, dz = p.z - z;
          if (dx * dx + dz * dz <= r2) poleOut.push(p);
        }
      }
    }
    return poleOut;
  }

  // Snap one. (ux, uz) is the direction the car was travelling, so it goes over
  // that way. Everything after this is one animation entry the game draws.
  const fallen = opts.fallen || [];    // shared across slices by sectors.js
  function snapPole(p, ux, uz, speed) {
    if (p.dead) return null;
    p.dead = true;
    if (p.signal) p.signal.broken = true;
    for (let k = 0; k < 4; k++) segDead[p.seg + k] = 1;
    if (p.mesh && renderer.blankIndices) renderer.blankIndices(p.mesh, p.i0, p.n);
    const f = launchFragment(p, ux, uz, speed);
    f.mesh = renderer.upload(fragmentBuilder(p.fragment));
    f.min = f.mesh.min; f.max = f.mesh.max;
    f.owner = ctx.free;   // draw.js: set once the slice can be freed
    p.fragment = null;
    fallen.push(f);
    if (fallen.length > 40) {
      const old = fallen.shift();
      if (old.mesh && renderer.free) renderer.free(old.mesh);
    }
    return f;
  }

  Object.assign(ctx, { queryPoles, fallen, snapPole });
}
