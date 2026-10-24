// Section 7: street furniture. Streetlights and their pools, hydro poles.
import { rgb } from '../../core/mesh.js';
import { C, Y, PAVED, CAP } from './consts.js';
import { subsample, quads4 } from './geom.js';

export function buildFurniture(ctx) {
  const { nAt, DISC, discCos, discSin, baseAt, PROTO_NATURE, bKey, bAt, poleCol, lampCol, addPole, hydroCol,
    roads, pavedAt, noteFurniture, roadAt, querySegments, mainTrees, streetTrees } = ctx;
  const cnt = ctx.count;
  // ------------------------------------------------------------ 7. street furniture
  // R3 - poles are still baked into the chunk mesh (2500 of them as separate
  // draws would cost more than the whole rest of the frame), but each one now
  // remembers which chunk it went into, which slice of that chunk's index
  // buffer it occupies, and which four collider segments are its. Snapping one
  // is then two O(1) writes: blank those indices on the GPU, mark the segments
  // dead. No per-frame cost at all for the ones still standing.
  // (`addPole` lives in ctx.js so the signal and stop-sign poles and the
  // trees, which are built earlier, can register through it.)
  // Pool of warm light on the tarmac under the lamp head. Unlit, alpha-blended,
  // and only ever drawn after dark - the cheapest streetlight there is. (W7)
  const poolCol = rgb(C.pool);
  // Lit prototype: a sodium gradient drawn additively, brightest under the head
  // and fading over twice the radius, instead of a hard-edged octagon.
  const POOL_RINGS = [[0, 1.0], [0.3, 0.72], [0.7, 0.34], [1.2, 0.1], [1.9, 0]];
  const poolSodium = [0.62, 0.38, 0.12];
  function lightPoolSoft(x, z, r) {
    const bd = nAt(x, z);
    const base = bd.vertCount;
    for (let k = 0; k < POOL_RINGS.length; k++) {
      const [f, a] = POOL_RINGS[k], col = [poolSodium[0] * a, poolSodium[1] * a, poolSodium[2] * a];
      const n = k === 0 ? 1 : DISC;
      for (let i = 0; i < n; i++) {
        const px = x + (k ? discCos[i] : 0) * r * f, pz = z + (k ? discSin[i] : 0) * r * f * 1.25;
        bd.vert(px, baseAt(px, pz).h + Y.pool2, pz, 0, 1, 0, col);
      }
    }
    for (let i = 0; i < DISC; i++) bd.tri(base, base + 1 + ((i + 1) % DISC), base + 1 + i);
    for (let k = 1; k < POOL_RINGS.length - 1; k++) {
      const r0 = base + 1 + (k - 1) * DISC, r1 = r0 + DISC;
      for (let i = 0; i < DISC; i++) {
        const j = (i + 1) % DISC;
        bd.tri(r0 + i, r0 + j, r1 + j); bd.tri(r0 + i, r1 + j, r1 + i);
      }
    }
    cnt.poolCount++;
  }
  function lightPool(x, z, r) {
    if (PROTO_NATURE) { lightPoolSoft(x, z, r); return; }
    const bd = nAt(x, z);
    // 7.4 m across, so the ring gets its own heights: a pool laid flat on a
    // hill is a disc of light hanging in the air on its downhill side.
    const c0 = bd.vert(x, baseAt(x, z).h + Y.pool2, z, 0, 1, 0, poolCol);
    for (let i = 0; i < DISC; i++) {
      const px = x + discCos[i] * r, pz = z + discSin[i] * r;
      bd.vert(px, baseAt(px, pz).h + Y.pool2, pz, 0, 1, 0, poolCol);
    }
    for (let i = 0; i < DISC; i++) {
      const a = c0 + 1 + i, b = c0 + 1 + ((i + 1) % DISC);
      bd.tri(c0, b, a);
    }
    cnt.poolCount++;
  }
  function streetlight(x, z, dx, dz) {
    const k = bKey(x, z), bd = bAt(x, z);
    const i0 = bd.i.length;
    const g = baseAt(x, z).h;
    bd.cyl(x, g + 4.2, z, 0.2, 8.4, 4, poleCol, 'y', false);
    bd.box(x + dx * 1.5, g + 8.2, z + dz * 1.5, 3.0, 0.22, 0.22, poleCol,
      { yaw: Math.atan2(-dz, dx), noBottom: true });
    bd.box(x + dx * 3.0, g + 7.85, z + dz * 3.0, 1.2, 0.4, 1.0, lampCol, { noBottom: true });
    addPole(x, z, 'streetlight', 8.4, k, i0, bd.i.length);
    lightPool(x + dx * 3.0, z + dz * 3.0, 7.4);
  }
  function hydroPole(x, z, dx, dz) {
    const k = bKey(x, z), bd = bAt(x, z);
    const i0 = bd.i.length;
    const g = baseAt(x, z).h;
    bd.cyl(x, g + 5.4, z, 0.3, 10.8, 4, hydroCol, 'y', false);
    bd.box(x, g + 10.0, z, 4.0, 0.28, 0.32, hydroCol, { yaw: Math.atan2(-dz, dx), noBottom: true });
    addPole(x, z, 'hydro', 10.8, k, i0, bd.i.length);
  }

  // gather candidate positions first so the cap spreads across the whole map
  const lights = [], hydros = [];
  for (const road of roads) {
    const paved = PAVED[road.cls] === 1;
    const res = road.cls === 'residential';
    if (!paved && !res) continue;
    const spacing = paved ? 45 : 40;
    const off = road.w / 2 + (paved ? 1.2 : 1.5);
    const pts = road.pts;
    let carry = spacing * 0.5, flip = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      let s = carry;
      while (s < L) {
        const side = paved ? flip : 1;
        const nx = -dz * off * side, nz = dx * off * side;
        const x = pts[i][0] + dx * s + nx, z = pts[i][1] + dz * s + nz;
        if (paved) flip = -flip;
        s += spacing;
        // 10 m of hydro pole in the fast lane of the way alongside. The offset
        // is measured from this way's own kerb and knows nothing about the
        // parallel carriageway it may be standing in.
        const bad = pavedAt(x, z, -1, 0.35);
        noteFurniture(x, z, 'pole', -1, bad);
        if (bad) { cnt.furnDropped++; continue; }
        (paved ? lights : hydros).push(x, z, -nx / off, -nz / off);
      }
      carry = s - L;
    }
  }
  const lightSel = subsample(quads4(lights), CAP.poles);
  for (const q of lightSel) streetlight(q[0], q[1], q[2], q[3]);
  const hydroSel = subsample(quads4(hydros), Math.max(0, CAP.poles - lightSel.length));
  for (const q of hydroSel) hydroPole(q[0], q[1], q[2], q[3]);
  // Wooden hydro poles along the paved streets too (the lamps stay, the poles
  // stand between them). One side per way, 110 m apart, kept 6 m off any lamp
  // and 4 m off a street tree. Capped at 110.
  const pavedHydroSel = [];
  {
    const near = (arr, step, x, z, r) => {
      for (let j = 0; j < arr.length; j += step) if (Math.hypot(arr[j] - x, arr[j + 1] - z) < r) return true;
      return false;
    };
    let side = 1;
    for (const road of roads) {
      if (PAVED[road.cls] !== 1) continue;
      const pts = road.pts, off = road.w / 2 + 1.6;
      let carry = 27;
      side = -side;
      for (let i = 0; i < pts.length - 1; i++) {
        let dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        let s = carry;
        while (s < L) {
          const nx = -dz * off * side, nz = dx * off * side;
          const x = pts[i][0] + dx * s + nx, z = pts[i][1] + dz * s + nz;
          s += 110;
          if (pavedAt(x, z, -1, 0.35) || roadAt(x, z) || querySegments(x, z, 1.5).length) continue;
          if (near(lights, 4, x, z, 6) || near(mainTrees, 2, x, z, 4) || near(streetTrees, 2, x, z, 4)) continue;
          pavedHydroSel.push([x, z, -nx / off, -nz / off]);
        }
        carry = s - L;
      }
    }
  }
  const pavedHydroPick = subsample(pavedHydroSel, 110);
  for (const q of pavedHydroPick) hydroPole(q[0], q[1], q[2], q[3]);
  cnt.poleCount = lightSel.length + hydroSel.length + pavedHydroPick.length;

  // grow the dedupe stamp array now that poles have added their colliders
  ctx.growSegQuery();
}
