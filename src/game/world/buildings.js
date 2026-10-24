// Section 5: the buildings. Houses through the archetypes in houses.js, every
// other footprint extruded here (the facade helpers are commercial.js).
import { makeStreetYawIndex, buildHouse } from '../houses.js';
import { fraserFootprint, FRASER, buildFraser } from '../fraser.js';
import { ROOF, C, SIDING, COMMERCIAL, GABLE } from './consts.js';
import { rgb, shade } from '../../core/mesh.js';
import { mulberry32, clamp } from '../../core/math.js';
import MATS from '../materials_stub.js';
import { mixHex, ringArea2 } from './geom.js';
import { FACADE_KIND, facadeQuad, facadeExtras } from './commercial.js';
import { tagGlass } from './glasstag.js';   // s5-reflect

export function buildBuildings(ctx) {
  const { roads, bldgs, baseAt, bAt, addWallSegment, PROTO_NATURE, PROTO_FACADES, hnAt, mats, hfAt, houses,
    triTo } = ctx;
  const cnt = ctx.count;
  const camera = ctx.cameraColliders;
  let cameraBuilder = null, cameraSource = '';
  // ------------------------------------------------------------ 5. buildings
  // Houses and terraces go through the parametric archetypes in houses.js
  // (era / storeys / roof form from Phase 1's `b.hs`, inferred where it is
  // missing); everything else keeps the extrude-and-cap below. Each house is
  // baked twice - lod 0 with windows, doors, porches and the real materials for
  // the chunk you are in, lod 2 for the rest of town (see docs/HOUSES.md).
  const streetYawNearest = makeStreetYawIndex(roads);
  // Per-building facing overrides (OSM id -> street name it fronts). The nearest
  // road is the right rule almost everywhere; these corner lots are the exception.
  // 1 rue Arial sits at the Fraser/Arial corner, 24.4 m from Fraser and 24.9 m
  // from Arial, but its front door faces Rue Arial (Tom, 5 Oct 2026).
  const FACING_OVERRIDE = { 460809162: 'Rue Arial' };
  const facingIndex = {};
  for (const nm of new Set(Object.values(FACING_OVERRIDE))) {
    facingIndex[nm] = makeStreetYawIndex(roads.filter((r) => r.name === nm));
  }
  const streetYawAt = (b, x, z, fb) => FACING_OVERRIDE[b.id]
    ? facingIndex[FACING_OVERRIDE[b.id]](x, z, fb) : streetYawNearest(x, z, fb);
  const HOUSEY = { house: 1, terrace: 1 };
  const buildings = bldgs.map(fraserFootprint);
  const gableCols = ROOF.map(rgb);
  const flatRoofCol = rgb(C.flatRoof);
  const winCol = rgb(C.win);

  const uv = { u0: 0, u1: 0, v0: 0, v1: 0 };
  function extents(p, c, ca, sa) {
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let i = 0; i < p.length; i++) {
      const dx = p[i][0] - c[0], dz = p[i][1] - c[1];
      const u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    uv.u0 = u0; uv.u1 = u1; uv.v0 = v0; uv.v1 = v1;
    return uv;
  }

  // Where a building's ground floor goes: the MEDIAN base height under its
  // footprint vertices. Not the mean, which a single corner hanging over a
  // ditch drags down half a metre, and not the centroid, which on an L-plan is
  // not under the building at all. `lo` is the lowest corner - where the skirt
  // has to reach so a house on a slope neither floats at the back nor sinks at
  // the front. A real one is dug in and has a foundation wall; this is that
  // wall, in the siding colour, and it is only emitted when there is a slope to
  // hide (which means nothing outside the raster ever pays for one).
  const footH = [];
  // Driveways drape on the same raster as the lawn they cross (D3).
  const groundH = (x, z) => baseAt(x, z).h;
  const foot = { y: 0, lo: 0 };
  function footing(p) {
    footH.length = 0;
    let lo = Infinity;
    for (let i = 0; i < p.length; i++) {
      const h = baseAt(p[i][0], p[i][1]).h;
      footH.push(h);
      if (h < lo) lo = h;
    }
    footH.sort((a, b) => a - b);
    const n = footH.length;
    foot.y = n % 2 ? footH[(n - 1) >> 1] : (footH[n / 2 - 1] + footH[n / 2]) / 2;
    foot.lo = lo;
    return foot;
  }
  const SKIRT_MIN = 0.08;      // below this the ground already hides the gap
  // The skirt goes in the TOWN builder, not either house builder: a chunk draws
  // its lod 0 houses or its lod 2 houses but always draws the town, so one copy
  // is enough and the house LOD budget stays where it was.
  function skirt(p, y, lo, col) {
    if (y - lo < SKIRT_MIN) return;
    const y0 = lo - 0.5;
    const bd = bAt(p[0][0], p[0][1]), from = bd.i.length;
    bd.prism(p, y0, y - y0, col);
    if (bd !== cameraBuilder) camera?.addMesh(bd, from, bd.i.length, cameraSource + ':foundation');
    cnt.skirtCount++;
  }

  const shrunk = [];
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi];
    cameraSource = `building:${b.id}`;
    const p = b.p, n = p.length, h = b.h, c = b.c;
    const rnd = mulberry32((bi * 2654435761 + 0x9e3779b9) >>> 0);
    const ft = footing(p);
    const by = ft.y, blo = ft.lo;
    if (b.k === 'fraser') {
      for (let i=0;i<p.length;i++) addWallSegment(p[i][0],p[i][1],p[(i+1)%p.length][0],p[(i+1)%p.length][1]);
      if (b.id === FRASER.ids[0]) {
        const bd = bAt(FRASER.x, FRASER.z), from = bd.i.length;
        buildFraser(bd, baseAt(FRASER.x, FRASER.z).h, (x,z)=>baseAt(x,z).h,
          { nature: PROTO_NATURE, proto: PROTO_FACADES, cameraEnd: (to) => camera?.addMesh(bd, from, to, 'building:fraser') });
      }
      continue;
    }
    // Phase 1 gives 537 dwellings an `hs` blob while OSM still calls them
    // 'commercial' on footprint size alone, so the attributes decide too.
    if (HOUSEY[b.k] === 1 || b.hs) {
      const sy = streetYawAt(b, c[0], c[1], -b.a);
      const seed = (bi * 2654435761 + 0x9e3779b9) >>> 0;
      // Near: full detail, the real atlas, and the ONLY call that registers
      // colliders - the far copy is the same house, so it must not add them again.
      // `y` was already houses.js's own hook (opts.y, threaded through every
      // wall, roof, porch and driveway in that file); it has simply never had
      // anything but zero to carry before.
      const nearBuilder = hnAt(c[0], c[1]), cameraFrom = nearBuilder.i.length;
      cameraBuilder = nearBuilder;
      const hr = buildHouse(nearBuilder, b, b.hs || null, mats, mulberry32(seed), {
        lod: 0, index: bi, streetYaw: sy, y: by, groundAt: groundH,
        addSegment: addWallSegment, // one call per footprint edge, same order as before
      });
      camera?.addMesh(nearBuilder, cameraFrom, nearBuilder.i.length, cameraSource);
      // Far: same seed, so recipe() draws the same tiles and the silhouette
      // wears the same brick; the stub provider keeps it vertex-coloured.
      const fr = buildHouse(hfAt(c[0], c[1]), b, b.hs || null, MATS, mulberry32(seed), {
        lod: 2, index: bi, streetYaw: sy, y: by,
      });
      skirt(p, by, blo, shade(SIDING[(rnd() * SIDING.length) | 0], 0.7));
      cnt.houseCount++; cnt.houseTris += hr.tris || 0; cnt.houseFarTris += fr.tris || 0;
      // The house and its lot, for later passes (yards, contact shadows).
      houses.push({ bi, id: b.id, p, c, y: by, lo: blo, yaw: sy,
        lot: { front: hr.front, archetype: hr.archetype, attrs: hr.attrs } });
      continue;
    }
    const bd = bAt(c[0], c[1]);
    const cameraFrom = bd.i.length;
    cameraBuilder = bd;

    // wall colour
    let wallHex;
    switch (b.k) {
      case 'house': wallHex = SIDING[(rnd() * SIDING.length) | 0]; break;
      case 'terrace': wallHex = SIDING[(rnd() * SIDING.length) | 0]; break;
      case 'apartments': wallHex = mixHex(0xb5b0a6, 0xc9c4b8, rnd()); break;
      case 'commercial': wallHex = COMMERCIAL[(rnd() * 3) | 0]; break;
      case 'industrial': wallHex = 0x9a9a9a; break;
      case 'church': wallHex = 0xe4dccb; break;
      case 'school': wallHex = 0xc7b58a; break;
      case 'shed': wallHex = 0x8f8375; break;
      case 'public': wallHex = 0xb8b2a4; break;
      case 'big': wallHex = 0xb0a898; break;
      case 'mall': wallHex = 0xc9bfae; break;
      default: wallHex = 0xbfb8aa;
    }
    const wall = b.k === 'terrace' ? shade(wallHex, 0.84) : rgb(wallHex);

    // Ring orientation: negative shoelace means walking p[i]->p[i+1] and building the
    // quad [bot_i, bot_j, top_j, top_i] gives an OUTWARD normal. Otherwise walk back.
    // Everything in this block is measured from `by`, the footing worked out
    // above: walls, roof cap, parapet, spire, window rows, door and sign board.
    const fwd = ringArea2(p) < 0;
    // Prototype renderer: the walls carry a façade code in atlasRect and the
    // shader draws storefronts, sign bands, sills and loading doors on them
    // (src/prototype/facade.js). No extra triangles; index.html is unchanged.
    const facKind = PROTO_FACADES ? (FACADE_KIND[b.k] || 0) : 0;
    let fsx = 0, fsz = 0;
    if (facKind) { const sy0 = streetYawAt(b, c[0], c[1], -b.a); fsx = Math.cos(sy0); fsz = Math.sin(sy0); }
    for (let i = 0; i < n; i++) {
      const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
      const a = p[ia], q = p[ib];
      if (facKind) {
        const L = Math.hypot(q[0] - a[0], q[1] - a[1]) || 1;
        const nx = (q[1] - a[1]) / L, nz = -(q[0] - a[0]) / L;
        const front = L >= 3 && -nx * fsx - nz * fsz > 0.55 ? 500 : 0;
        facadeQuad(bd, a, q, by, h, wall, facKind * 1000 + front + Math.min(49.9, h) * 10, L);
      } else {
        bd.quad([a[0], by, a[1]], [q[0], by, q[1]], [q[0], by + h, q[1]], [a[0], by + h, a[1]], wall);
      }
      addWallSegment(p[i][0], p[i][1], p[(i + 1) % n][0], p[(i + 1) % n][1]);
    }
    skirt(p, by, blo, shade(wallHex, 0.7));

    const ang = b.a, ca = Math.cos(ang), sa = Math.sin(ang);
    const e = extents(p, c, ca, sa);
    const ew = e.u1 - e.u0, ed = e.v1 - e.v0;
    const cu = (e.u0 + e.u1) / 2, cv = (e.v0 + e.v1) / 2;
    const gx = c[0] + cu * ca - cv * sa, gz = c[1] + cu * sa + cv * ca;

    const isChurch = b.k === 'church';
    // OSM tags the golf clubhouse as a commercial footprint, which normally
    // gets the anonymous flat/parapet treatment. Its long articulated outline
    // then reads as three brown slabs from the job marker. Give this named
    // landmark the low dark roof the player expects to navigate toward.
    const isClubhouse = b.name === 'Club de Golf Gatineau';
    if (GABLE[b.k] === 1 || isChurch || isClubhouse) {
      // Gable: a flat cap at h (covers L-shapes) with a ridged prism over it,
      // rotated so the ridge runs along the footprint's longest edge.
      const roofCol = isChurch ? gableCols[2]
        : isClubhouse ? rgb(0x3f4938)
        : gableCols[(rnd() * 6) | 0];
      triTo(bd, p, b.t, by + h, roofCol);
      const rh = isClubhouse ? clamp(0.16 * ed, 1.5, 3.8) : clamp(0.35 * ed, 1.6, 3.2);
      bd.roof(gx, by + h, gz, ew, ed, rh, roofCol, -ang, 0.4);
      if (isClubhouse) cnt.landmarkRoofs++;
    } else {
      triTo(bd, p, b.t, by + h, flatRoofCol);
      // A parapet needs vertical faces. The previous inset cap floated 40 cm
      // above the roof with nothing beneath it, especially obvious against the
      // sky. Close it on buildings where roof detail matters; anonymous map
      // blocks keep the single clean roof cap and save a large amount of mesh.
      const properParapet = !!b.name || b.k === 'commercial' || b.k === 'apartments'
        || b.k === 'mall' || b.k === 'public' || b.k === 'school' || b.k === 'industrial';
      if (properParapet) {
        shrunk.length = 0;
        for (let i = 0; i < n; i++) {
          const dx = p[i][0] - c[0], dz = p[i][1] - c[1];
          const d = Math.hypot(dx, dz) || 1;
          const f = clamp(0.42 / d, 0, 0.32);
          shrunk.push([p[i][0] - dx * f, p[i][1] - dz * f]);
        }
        bd.prism(shrunk, by + h, 0.38, shade(C.flatRoof, 0.62));
        triTo(bd, shrunk, b.t, by + h + 0.38, shade(C.flatRoof, 0.78));
      }
    }

    if (isChurch) {
      const sx = c[0] + ca * ew * 0.4, sz = c[1] + sa * ew * 0.4;
      bd.tower(sx, by, sz, 2.5, 2.5, h * 1.8, rgb(wallHex), { noBottom: true });
      bd.cone(sx, by + h * 1.8, sz, 1.9, 5.5, 6, gableCols[0]);
    }

    // Façade openings. Individual punched windows read as apartments/schools;
    // the old wall-wide dark strips made every tall building look like a glass
    // warehouse. Raw footprint edges are used directly, with generous corner
    // clearance, so panels cannot turn the corner and clip through one another.
    const hasPublicDoor = b.k === 'commercial' || b.k === 'apartments' || b.k === 'mall'
      || b.k === 'public' || b.k === 'school';
    if (facKind) facadeExtras(bd, b, p, n, fwd, by, h, fsx, fsz, rnd);
    else if (h >= 5.2 || (hasPublicDoor && h >= 3.2)) {
      const floors = Math.max(1, Math.min(6, Math.floor((h - 0.35) / 3.05)));
      const streetYaw = streetYawAt(b, c[0], c[1], -b.a);
      const snx = Math.cos(streetYaw), snz = Math.sin(streetYaw);
      let frontEdge = -1, frontDot = -2;
      for (let i = 0; i < n; i++) {
        const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
        const a = p[ia], q = p[ib];
        const dx = q[0] - a[0], dz = q[1] - a[1], L = Math.hypot(dx, dz);
        if (L < 3) continue;
        const dot = (-dz / L) * snx + (dx / L) * snz;
        if (dot > frontDot) { frontDot = dot; frontEdge = i; }
      }
      let quads = 0;
      // Anonymous imported massing stays deliberately cheap. Important public,
      // retail and apartment buildings get enough openings to establish scale.
      const maxFacadeQuads = b.k === 'big' ? 4 : 18;
      for (let f = 0; f < floors && quads < maxFacadeQuads; f++) {
        const wh = f === 0 && b.k === 'commercial' ? 1.7 : 1.15;
        const y0 = by + 0.82 + f * 3.05, y1 = y0 + wh;
        if (y1 > by + h - 0.42) break;
        for (let i = 0; i < n && quads < maxFacadeQuads; i++) {
          const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
          const a = p[ia], q = p[ib];
          let dx = q[0] - a[0], dz = q[1] - a[1];
          const L = Math.hypot(dx, dz);
          if (L < 3.2) continue;
          dx /= L; dz /= L;
          const nx = -dz * 0.065, nz = dx * 0.065;
          const count = Math.max(1, Math.min(7, Math.floor((L - 1.2) / 2.7)));
          const ww = f === 0 && b.k === 'commercial'
            ? Math.min(2.15, (L - 1.1) / count * 0.72) : Math.min(1.25, (L - 1.1) / count * 0.46);
          for (let k = 0; k < count && quads < maxFacadeQuads; k++) {
            const t = 0.62 + ((k + 0.5) / count) * (L - 1.24);
            if (hasPublicDoor && f === 0 && i === frontEdge && Math.abs(t - L / 2) < 1.25) continue;
            const cx = a[0] + dx * t + nx, cz = a[1] + dz * t + nz;
            const tx = dx * ww / 2, tz = dz * ww / 2;
            const g0 = bd.vertCount;   // s5-reflect
            bd.quad([cx - tx, y0, cz - tz], [cx + tx, y0, cz + tz],
              [cx + tx, y1, cz + tz], [cx - tx, y1, cz - tz], winCol);
            tagGlass(bd, g0);          // s5-reflect: glass.js reflection
            quads++; cnt.winQuads++;
          }
        }
      }
      if (hasPublicDoor && frontEdge >= 0) {
        const ia = fwd ? frontEdge : (frontEdge + 1) % n;
        const ib = fwd ? (frontEdge + 1) % n : frontEdge;
        const a = p[ia], q = p[ib];
        let dx = q[0] - a[0], dz = q[1] - a[1];
        const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        const nx = -dz * 0.075, nz = dx * 0.075;
        const cx = (a[0] + q[0]) / 2 + nx, cz = (a[1] + q[1]) / 2 + nz;
        const dw = Math.min(1.55, Math.max(0.9, L * 0.16));
        const tx = dx * dw / 2, tz = dz * dw / 2;
        bd.quad([cx - tx, by + 0.08, cz - tz], [cx + tx, by + 0.08, cz + tz],
          [cx + tx, by + 2.35, cz + tz], [cx - tx, by + 2.35, cz - tz], shade(C.win, 0.68));
      }
    }

    // landmark sign board on the longest wall
    if (b.name || b.k === 'mall' || b.k === 'church' || b.k === 'public' || b.k === 'school') {
      let best = 0, bix = 0;
      for (let i = 0; i < n; i++) {
        const a = p[i], q = p[(i + 1) % n];
        const L = Math.hypot(q[0] - a[0], q[1] - a[1]);
        if (L > best) { best = L; bix = i; }
      }
      if (best > 3.2) {
        const ia = fwd ? bix : (bix + 1) % n, ib = fwd ? (bix + 1) % n : bix;
        const a = p[ia], q = p[ib];
        let dx = q[0] - a[0], dz = q[1] - a[1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        const mx = (a[0] + q[0]) / 2 - dz * 0.25, mz = (a[1] + q[1]) / 2 + dx * 0.25;
        const nm = b.name || '';
        const hex = (nm.indexOf('Tim') >= 0 || nm.indexOf('McDo') >= 0) ? 0xd23c2a : 0x2a63c9;
        bd.box(mx, by + h + 0.6, mz, 3, 1.2, 0.35, rgb(hex), { yaw: Math.atan2(-dz, dx), noBottom: true });
        cnt.signCount++;
      }
    }
    camera?.addMesh(bd, cameraFrom, bd.i.length, cameraSource);
  }

  Object.assign(ctx, { streetYawAt, HOUSEY, buildings });
}
