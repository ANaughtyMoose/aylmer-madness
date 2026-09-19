// Glenwood bungalows: three late-50s variants from Rue Glenwood / Chemin Fraser
// street-level reference (docs/GLENWOOD-HANDOFF.md). Called from houses.js's
// buildHouse(), never directly by the world — houses.js owns attributes, street
// facing and the footprint decomposition, and hands this file a finished frame.
//
//   glenwood_carport   wide, shallow front gable; open carport carved out of one
//                      end of the footprint; white siding over a grey lower
//                      facade; exposed foundation with basement windows
//   glenwood_picture   asymmetric shallow gable peaking over the entry; carport;
//                      big picture window over a stone band; raised entrance
//                      with four steps and a railing each side
//   glenwood_porch     smaller; the entry corner is inset under the main roof as
//                      a covered porch on posts; exposed basement; modest chimney
//
// What all three share, and what makes them read as Glenwood rather than as the
// generic hip bungalow: the ridge runs front-to-back, so the street sees a very
// low triangle of siding with a thick fascia, and one slope simply carries on
// past the wall to cover the carport or porch.
//
// FRAME. Local x runs along the street face (fw.tx, fw.tz), local z is the
// outward street normal (fw.nx, fw.nz) with z = 0 on the front wall and z = -D
// on the back wall, y is height above the house's own ground (opts.y). Every
// quad goes through face(), which picks the winding from the intended map-space
// normal, so nothing here depends on the handedness of that frame.
//
// Everything structural stays inside the footprint's largest rectangle: the
// carport and porch are carved out of it, not added to it. Only the things
// houses.js already lets stand proud of a footprint leave it — eave overhang,
// front steps, walks and the driveway decal.

import {buildPhotoGlenwood} from '../prototype/glenwood-houses.js';
import { rgb, shade } from '../core/mesh.js';
import { clamp } from '../core/math.js';

export const GLENWOOD_VARIANTS = ['glenwood_carport', 'glenwood_picture', 'glenwood_porch'];

// Streets whose detached one-storey houses get a Glenwood variant when the
// caller does not say otherwise. Deliberately one street: the three references
// are from here, and the neighbours (Nelson, King, Montgomery) have not been
// looked at. Extend it after comparing them, not before.
export const GLENWOOD_STREETS = /\bRue Glenwood\b/i;

// Minimum street frontage / depth (m) of the footprint's main rectangle.
const MIN_FRONT = { glenwood_carport: 12.0, glenwood_picture: 10.5, glenwood_porch: 6.5 };
const MIN_DEPTH = 6.0;
const T = 0.2;           // roof slab thickness: the fascia you see from the street
const OUT = 0.045;       // decal stand-off, same as houses.js
const Y_DRIVE = 0.042;   // decal ladder, same as houses.js

export function glenwoodFits(variant, frontage, depth) {
  return depth >= MIN_DEPTH && frontage >= (MIN_FRONT[variant] || 1e9);
}

// Decide whether a house is a Glenwood bungalow and which one.
//   opt === false | 'off'         never
//   opt === '<variant id>'        that variant (a smaller one if it cannot fit)
//   opt === true | 'auto'         any detached one-storey house, variant by seed
//   opt === undefined             'auto', but only on GLENWOOD_STREETS
// Returns { variant, side } or null. Deterministic in `seed`.
export function chooseGlenwood(b, attrs, opt, seed, frontage, depth) {
  if (opt === false || opt === 'off' || opt === null) return null;
  const forced = typeof opt === 'string' && GLENWOOD_VARIANTS.indexOf(opt) >= 0 ? opt : null;
  const side = (seed >>> 5) & 1 ? 1 : -1;
  if (forced) {
    if (glenwoodFits(forced, frontage, depth)) return { variant: forced, side };
    const smaller = GLENWOOD_VARIANTS.slice(GLENWOOD_VARIANTS.indexOf(forced) + 1)
      .concat(['glenwood_porch']);
    for (const v of smaller) if (glenwoodFits(v, frontage, depth)) return { variant: v, side };
    return null;
  }
  const auto = opt === true || opt === 'auto'
    || (opt === undefined && !!b.addr && GLENWOOD_STREETS.test(b.addr));
  if (!auto) return null;
  if (attrs.link !== 'detached' || attrs.storeys !== 1) return null;
  if (b.k !== 'house' && !b.hs) return null;
  const fit = GLENWOOD_VARIANTS.filter((v) => glenwoodFits(v, frontage, depth));
  if (!fit.length) return null;
  return { variant: fit[(seed >>> 11) % fit.length], side };
}

// ------------------------------------------------------------------ helpers

// Quad with its winding chosen so the face looks along `n` (map space).
function face(mb, a, b, c, d, col, n) {
  const ex = c[0] - a[0], ey = c[1] - a[1], ez = c[2] - a[2];
  const fx = d[0] - b[0], fy = d[1] - b[1], fz = d[2] - b[2];
  const gx = ey * fz - ez * fy, gy = ez * fx - ex * fz, gz = ex * fy - ey * fx;
  if (gx * n[0] + gy * n[1] + gz * n[2] < 0) mb.quad(a, d, c, b, col, n);
  else mb.quad(a, b, c, d, col, n);
}

function tri(mb, a, b, c, col, n) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
  const flip = gx * n[0] + gy * n[1] + gz * n[2] < 0;
  const i0 = mb.vert(a[0], a[1], a[2], n[0], n[1], n[2], col);
  const q = flip ? c : b, r = flip ? b : c;
  mb.vert(q[0], q[1], q[2], n[0], n[1], n[2], col);
  mb.vert(r[0], r[1], r[2], n[0], n[1], n[2], col);
  mb.tri(i0, i0 + 1, i0 + 2);
}

// Per-variant proportions. Heights are metres above grade; fractions along the
// body are measured from the carport / porch side toward the far end.
const SPEC = {
  glenwood_carport: {
    F: 0.7, wallH: 2.5, peakF: 0.5, riseK: 0.17, rise: [0.75, 1.3],
    siding: 'vinyl_white', lower: 'stone_grey', roof: 'shingle_grey',
    fascia: 0xb9c4ca, found: 0xb3afa6, rail: 0x2b2b2b,
    stairs: { n: 3, landing: 0.8, run: 0.28, w: 1.3, rails: 1 }, doorF: 0.43,
    win: [[0.18, 1.7], [0.63, 1.0], [0.84, 1.6]], basement: [0.24, 0.7, 0.88],
    chimney: 0.55,
  },
  glenwood_picture: {
    F: 1.0, wallH: 2.45, peakF: 0.62, riseK: 0.1, rise: [0.7, 1.15],
    siding: 'vinyl_beige', band: 'stone_beige', roof: 'shingle_dark',
    fascia: 0xf0eee8, found: 0xe6e4de, rail: 0xf2f0ea,
    stairs: { n: 4, landing: 1.0, run: 0.3, w: 1.5, rails: 2 }, doorF: 0.6,
    win: [[0.87, 1.1]], basement: [], picture: 0.3, chimney: 0,
  },
  glenwood_porch: {
    F: 0.6, wallH: 2.4, peakF: 0.45, riseK: 0.15, rise: [0.6, 1.1],
    siding: 'clapboard_white', roof: 'shingle_brown',
    fascia: 0x5b4a3a, found: 0x8e8b84, rail: 0xf2efe7,
    stairs: { n: 2, landing: 0, run: 0.3, w: 1.2, rails: 0 },
    win: [], basement: [], chimney: 0.7,
  },
};

// ------------------------------------------------------------------ builder
//
// ctx = { b, fw, D, side, lod, y0, mats, seed, cap, meshYaw }
//   fw    houses.js faceOf() of the main rect's street face {cx,cz,nx,nz,tx,tz,len}
//   D     depth of that rect behind the street face
//   side  -1 / +1: which end (local x) gets the carport or porch
// Returns { height, ridgeHeight, clearance, garage, porch }.
export function buildGlenwood(mb, variant, ctx) {
  if(ctx.mats?.prototypeStyle && (!Number.isFinite(ctx.cap)||ctx.cap>=[160,80,48][Math.min(ctx.lod,2)]))return buildPhotoGlenwood(mb,variant,ctx);
  const S = SPEC[variant];
  const { fw, D, side: s, lod, mats, seed } = ctx;
  const y0 = ctx.y0 || 0;
  const W = fw.len;
  const t0 = mb.i.length;
  const cap = Number.isFinite(ctx.cap) ? ctx.cap : 160;
  const room = (n) => (mb.i.length - t0) / 3 + n <= cap;
  const detail = lod === 0;

  const P = (x, y, z) => [fw.cx + fw.tx * x + fw.nx * z, y0 + y, fw.cz + fw.tz * x + fw.nz * z];
  const N = (a, y, c) => {
    const X = fw.tx * a + fw.nx * c, Z = fw.tz * a + fw.nz * c;
    const l = Math.hypot(X, y, Z) || 1;
    return [X / l, y / l, Z / l];
  };
  const nF = N(0, 0, 1), nB = N(0, 0, -1), nUp = [0, 1, 0];
  const frontYaw = Math.atan2(fw.nz, fw.nx);
  const tanYaw = -Math.atan2(fw.tz, fw.tx);          // MeshBuilder yaw: local X == tangent

  // Seeded colour jitter, independent of houses.js's rng so near/far bakes agree.
  const j = (k) => 0.93 + (((seed >>> k) & 63) / 63) * 0.14;
  const M = { ox: fw.cx, oy: y0, oz: fw.cz, uOffset: ((seed >>> 3) & 7) };
  const arm = (name) => mats.tile(mb, name, M);
  const off = () => mats.end(mb);
  const sidingCol = mats.tint(S.siding, j(2));
  const roofCol = mats.tint(S.roof, j(8));
  const fasciaCol = rgb(S.fascia), foundCol = rgb(S.found);
  const under = shade(0x7d7a74, 1);
  const conc = mats.color('concrete'), asphalt = mats.color('asphalt');
  const trim = mats.color('trim');
  const winCol = mats.tint('window_2pane', 1), uvWin = mats.decalUV('window_2pane');
  const uvPic = mats.decalUV('window_bay') || uvWin;
  const uvBase = mats.decalUV('window_small') || uvWin;
  const doorCol = mats.tint('door_white', 1), uvDoor = mats.decalUV('door_white');

  // ---- plan along local x
  const hasCarport = variant !== 'glenwood_porch';
  const cw = hasCarport ? clamp(W * 0.24, 3.0, 3.8) : 0;
  const outer = s * W / 2;                                  // carport / porch end
  const bNear = outer - s * cw;                             // body edge on that side
  const bFar = -outer;
  const bw = W - cw;
  const bx = (f) => bNear - s * f * bw;                     // fraction from the near side

  const F = S.F, E = F + S.wallH;
  let rise = clamp(S.riseK * bw * 0.5, S.rise[0], S.rise[1]);
  const xp = bx(S.peakF);
  let sNear = rise / Math.max(0.5, Math.abs(xp - bNear));
  let sFar = rise / Math.max(0.5, Math.abs(bFar - xp));
  // Carport clearance: the underside over the outer posts must clear a pickup.
  const postX = outer - s * 0.22;
  if (hasCarport) {
    const maxS = (E - 2.35) / Math.max(0.5, cw - 0.22);
    if (sNear > maxS) {
      sNear = maxS; rise = sNear * Math.abs(xp - bNear); sFar = rise / Math.max(0.5, Math.abs(bFar - xp));
    }
  }
  // underside height at local x (the top surface is T above it)
  const uAt = (x) => E + rise - (Math.sign(x - xp) === s ? sNear : sFar) * Math.abs(x - xp);
  const clearance = hasCarport ? uAt(postX) : Infinity;

  // ---- porch recess (glenwood_porch only)
  const porch = variant === 'glenwood_porch';
  const pw = porch ? clamp(W * 0.38, 2.4, 3.6) : 0;
  const PD = porch ? clamp(D * 0.22, 1.6, 2.0) : 0;
  const xi = outer - s * pw;                                // porch inner edge

  // ---- walls: foundation band + siding band (one band past lod 0)
  const wall = (x0, z0, x1, z1, n) => {
    if (detail) {
      off();
      face(mb, P(x0, 0, z0), P(x1, 0, z1), P(x1, F, z1), P(x0, F, z0), foundCol, n);
      arm(S.siding);
      face(mb, P(x0, F, z0), P(x1, F, z1), P(x1, E, z1), P(x0, E, z0), sidingCol, n);
    } else {
      arm(S.siding);
      face(mb, P(x0, 0, z0), P(x1, 0, z1), P(x1, E, z1), P(x0, E, z0), sidingCol, n);
    }
  };
  const nNear = N(s, 0, 0), nFar = N(-s, 0, 0);
  if (porch) {
    wall(bFar, 0, xi, 0, nF);                 // front, beside the porch
    wall(xi, -PD, outer, -PD, nF);            // recessed wall with the door
    wall(xi, 0, xi, -PD, nNear);              // return into the porch
    wall(outer, -PD, outer, -D, nNear);
  } else {
    wall(bNear, 0, bFar, 0, nF);
    wall(bNear, 0, bNear, -D, nNear);         // carport-side wall, under the roof
  }
  wall(bFar, 0, bFar, -D, nFar);
  wall(bNear, -D, bFar, -D, nB);

  // gable triangles front and back (siding, the low triangle that reads Glenwood)
  const gx0 = porch ? outer : bNear;
  tri(mb, P(gx0, E, 0), P(bFar, E, 0), P(xp, E + rise, 0), sidingCol, nF);
  tri(mb, P(gx0, E, -D), P(bFar, E, -D), P(xp, E + rise, -D), sidingCol, nB);
  off();

  // ---- roof: two slabs meeting at a front-to-back ridge
  const ov = 0.55;
  const xl = Math.min(outer, bFar) - ov, xr = Math.max(outer, bFar) + ov;
  const z0 = ov, z1 = -D - ov;
  const yP = E + rise;
  const nearIsLeft = s < 0;
  const sL = nearIsLeft ? sNear : sFar, sR = nearIsLeft ? sFar : sNear;
  const yl = yP - sL * (xp - xl), yr = yP - sR * (xr - xp);
  const nL = N(-sL, 1, 0), nR = N(sR, 1, 0);
  arm(S.roof);
  face(mb, P(xl, yl + T, z0), P(xp, yP + T, z0), P(xp, yP + T, z1), P(xl, yl + T, z1), roofCol, nL);
  face(mb, P(xp, yP + T, z0), P(xr, yr + T, z0), P(xr, yr + T, z1), P(xp, yP + T, z1), roofCol, nR);
  off();
  // underside: you stand under it in the carport and see it from the street
  face(mb, P(xl, yl, z0), P(xp, yP, z0), P(xp, yP, z1), P(xl, yl, z1), under, [-nL[0], -nL[1], -nL[2]]);
  face(mb, P(xp, yP, z0), P(xr, yr, z0), P(xr, yr, z1), P(xp, yP, z1), under, [-nR[0], -nR[1], -nR[2]]);
  if (lod <= 1) {
    // thick fascia on all four edges — the single strongest cue in all three photos
    for (const [z, n] of [[z0, nF], [z1, nB]]) {
      face(mb, P(xl, yl, z), P(xp, yP, z), P(xp, yP + T, z), P(xl, yl + T, z), fasciaCol, n);
      face(mb, P(xp, yP, z), P(xr, yr, z), P(xr, yr + T, z), P(xp, yP + T, z), fasciaCol, n);
    }
    face(mb, P(xl, yl, z1), P(xl, yl, z0), P(xl, yl + T, z0), P(xl, yl + T, z1), fasciaCol, N(-1, 0, 0));
    face(mb, P(xr, yr, z0), P(xr, yr, z1), P(xr, yr + T, z1), P(xr, yr + T, z0), fasciaCol, N(1, 0, 0));
  }

  if (lod >= 2) {
    return { height: E, ridgeHeight: yP + T, clearance, garage: hasCarport ? 'carport' : 'none', porch };
  }

  // ---- carport: posts, floor and driveway
  const setback = 7;
  if (hasCarport) {
    const cx = outer - s * cw / 2;
    for (const z of [-0.25, -D + 0.25]) {
      const p = P(postX, 0, z);
      mb.post(p[0], y0, p[2], 0.16, uAt(postX), trim, tanYaw);
    }
    const dc = P(cx, 0, (setback + 2 - D + 0.3) / 2);
    mb.flatRot(dc[0], dc[2], cw - 0.3, setback + 2 + D - 0.3, y0 + Y_DRIVE, -frontYaw + Math.PI / 2, asphalt);
    if (variant === 'glenwood_picture' && detail && room(4)) {
      // the privacy screen at the back of the carport in the reference
      const zc = -D * 0.5, pc = shade(0xd2d3cf, 1);
      const a = [bNear, 0.1, zc], b = [outer - s * 0.3, 1.95, zc];
      face(mb, P(a[0], a[1], zc), P(b[0], a[1], zc), P(b[0], b[1], zc), P(a[0], b[1], zc), pc, nF);
      face(mb, P(a[0], a[1], zc), P(b[0], a[1], zc), P(b[0], b[1], zc), P(a[0], b[1], zc), pc, nB);
    }
  } else if (room(2)) {
    const dx = bFar - s * 1.9;
    const dc = P(dx, 0, (setback + 2 - D * 0.6) / 2);
    mb.flatRot(dc[0], dc[2], 3.0, setback + 2 + D * 0.6, y0 + Y_DRIVE, -frontYaw + Math.PI / 2, asphalt);
  }

  // ---- entrance: door, steps, railings, walk
  const St = S.stairs;
  const doorX = porch ? outer - s * pw / 2 : bx(S.doorF);
  const doorZ = porch ? -PD : 0;
  let stepH = F, stepZ = doorZ;
  if (porch) {
    // porch deck one step below the floor, then two steps down to the lawn
    const deckH = F - 0.18;
    const dp = P(outer - s * pw / 2, 0, -PD / 2);
    mb.tower(dp[0], y0, dp[2], pw, PD, deckH, conc, { yaw: tanYaw, noBottom: true });
    stepH = deckH; stepZ = 0;
    // posts up to a header beam across the porch opening
    const hb = E - 0.28;
    for (const x of [outer - s * 0.15, xi + s * 0.15]) {
      const p = P(x, 0, -0.18);
      mb.post(p[0], y0 + deckH, p[2], 0.15, hb - deckH, trim, tanYaw);
    }
    face(mb, P(xi, hb, 0), P(outer, hb, 0), P(outer, E, 0), P(xi, E, 0), sidingCol, nF);
    face(mb, P(xi, hb, 0), P(outer, hb, 0), P(outer, E, 0), P(xi, E, 0), sidingCol, nB);
  }
  if (detail) {
    const dp = P(doorX, F + 1.07, doorZ);
    mb.panel(dp[0], dp[1], dp[2], 0.95, 2.1, nF[0], nF[2], doorCol, uvDoor, OUT);
  }

  // Stairs: step 0 is the landing at the door (floor height), each later step
  // one riser lower and one run further out toward the street.
  const sx = doorX;
  const hw = St.w / 2;
  const first = Math.max(St.landing, St.run);
  let zEnd = stepZ;
  if (detail) {
    const rh = stepH / St.n;
    for (let k = 0; k < St.n; k++) {
      const top = stepH - k * rh;
      const za = k === 0 ? stepZ : stepZ + first + (k - 1) * St.run;
      const zb = k === 0 ? stepZ + first : za + St.run;
      face(mb, P(sx - hw, top, za), P(sx + hw, top, za), P(sx + hw, top, zb), P(sx - hw, top, zb), conc, nUp);
      face(mb, P(sx - hw, top - rh, zb), P(sx + hw, top - rh, zb), P(sx + hw, top, zb), P(sx - hw, top, zb), conc, nF);
      face(mb, P(sx - hw, 0, za), P(sx - hw, 0, zb), P(sx - hw, top, zb), P(sx - hw, top, za), conc, N(-1, 0, 0));
      face(mb, P(sx + hw, 0, zb), P(sx + hw, 0, za), P(sx + hw, top, za), P(sx + hw, top, zb), conc, N(1, 0, 0));
      zEnd = zb;
    }
    const railCol = rgb(S.rail);
    const sides = St.rails === 2 ? [-1, 1] : St.rails === 1 ? [s] : [];
    for (const rs of sides) {
      if (!room(8)) break;
      const x = sx + rs * (hw - 0.04);
      const ta = [x, stepH + 0.9, stepZ + 0.15], tb = [x, 0.95, zEnd - 0.08];
      const n = N(rs, 0, 0), m = N(-rs, 0, 0);
      const q = [P(ta[0], ta[1] - 0.07, ta[2]), P(tb[0], tb[1] - 0.07, tb[2]), P(tb[0], tb[1], tb[2]), P(ta[0], ta[1], ta[2])];
      face(mb, q[0], q[1], q[2], q[3], railCol, n);
      face(mb, q[0], q[1], q[2], q[3], railCol, m);
      const v = [P(x, 0, tb[2] - 0.03), P(x, 0, tb[2] + 0.05), P(x, 0.95, tb[2] + 0.05), P(x, 0.95, tb[2] - 0.03)];
      face(mb, v[0], v[1], v[2], v[3], railCol, n);
      face(mb, v[0], v[1], v[2], v[3], railCol, m);
    }
    if (room(2)) {
      const len = Math.max(1.5, setback - (zEnd - stepZ));
      const wc = P(sx, 0, zEnd + len / 2);
      mb.flatRot(wc[0], wc[2], 1.05, len, y0 + Y_DRIVE - 0.004, -frontYaw + Math.PI / 2, conc);
    }
  } else {
    const sc = P(sx, 0, stepZ + 0.6);
    mb.tower(sc[0], y0, sc[2], St.w, 1.2, stepH, conc, { yaw: tanYaw, noBottom: true });
  }

  if (!detail) {
    off();
    return { height: E, ridgeHeight: yP + T, clearance, garage: hasCarport ? 'carport' : 'none', porch };
  }

  // ---- façade bands
  if (S.lower && room(2)) {
    // grey lower facade on the far side of the door, floor to window sill
    const a = doorX - s * 0.75, len = Math.abs(bFar - a);
    const c = P((a + bFar) / 2, F + 0.575, 0);
    arm(S.lower);
    mb.panel(c[0], c[1], c[2], len, 1.15, nF[0], nF[2], mats.tint(S.lower, j(14)), null, 0.03);
    off();
  }
  if (S.band && room(2)) {
    // stone accent band under the picture window, carport side of the door
    const a = bNear, b2 = doorX + s * 0.7, len = Math.abs(b2 - a);
    const c = P((a + b2) / 2, F + 0.17, 0);
    arm(S.band);
    mb.panel(c[0], c[1], c[2], len, 0.66, nF[0], nF[2], mats.tint(S.band, j(14)), null, 0.03);
    off();
  }

  // ---- windows
  const winAt = (x, cy, z, w, h, n, uv) => {
    const p = P(x, cy, z);
    mb.panel(p[0], p[1], p[2], w, h, n[0], n[2], winCol, uv, OUT + 0.012);
  };
  if (S.picture !== undefined && room(4)) {
    const w = Math.min(3.4, bw * 0.42);
    winAt(bx(S.picture), F + 1.3, 0, w, 1.45, nF, uvPic);
    winAt(doorX - s * 0.78, F + 1.07, 0, 0.5, 2.0, nF, uvWin);   // sidelight
  }
  for (const [f, w] of S.win) if (room(2)) winAt(bx(f), F + 1.47, 0, w, 1.05, nF, uvWin);
  for (const f of S.basement) if (room(2)) winAt(bx(f), F - 0.33, 0, 0.75, 0.38, nF, uvBase);
  if (porch) {
    const segC = (bFar + xi) / 2, seg = Math.abs(bFar - xi);
    if (room(4)) {
      winAt(segC, F + 1.47, 0, Math.min(1.9, seg - 1.0), 1.05, nF, uvWin);
      winAt(segC, F - 0.3, 0, 0.8, 0.36, nF, uvBase);
    }
  }
  // sides and back: one per side, two at the back
  if (room(2)) winAt(bFar, F + 1.47, -D * 0.5, 1.2, 1.0, nFar, uvWin);
  if (room(2)) winAt(porch ? outer : bNear, F + 1.47, -D * (porch ? 0.62 : 0.5), 1.0, 1.0, nNear, uvWin);
  if (room(4)) {
    winAt(bx(0.28), F + 1.47, -D, 1.2, 1.0, nB, uvWin);
    winAt(bx(0.74), F + 1.47, -D, 1.2, 1.0, nB, uvWin);
  }
  if (room(2)) winAt(bx(0.5), F - 0.33, -D, 0.75, 0.38, nB, uvBase);

  // ---- chimney: modest, just behind the ridge on the far slope
  if (S.chimney && room(10)) {
    const cx = xp - s * 0.9, cz = -D * 0.42;
    const p = P(cx, 0, cz);
    const top = uAt(cx) + T + S.chimney;
    const tile = variant === 'glenwood_porch' ? 'stone_grey' : 'brick_brown';
    arm(tile);
    mb.tower(p[0], y0 + E - 0.3, p[2], 0.62, 0.62, top - (E - 0.3),
      variant === 'glenwood_porch' ? mats.tint(tile, 1) : shade(0x3a3836, 1),
      { yaw: tanYaw, noBottom: true, top: shade(0x2a2a2a, 1) });
    off();
  }

  off();
  return { height: E, ridgeHeight: yP + T, clearance, garage: hasCarport ? 'carport' : 'none', porch };
}
