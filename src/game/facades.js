// Photographic facades on the houses that matter.
//
// Every house in town is parametric (houses.js): an archetype, an atlas
// material and a grid of window decals. That is the right trade for 57 680
// footprints and the wrong one for the three or four addresses a player already
// knows — the house you start the summer in front of, and your friends'.
//
// This module hangs ONE textured quad, 6 cm proud, on the street-facing wall of
// a named OSM footprint. The quad covers that wall exactly (base to eave, the
// full length of the edge), so the procedural brick and windows underneath it
// simply stop being visible; nothing in houses.js changes and nothing has to
// know a photo exists.
//
// WHY ITS OWN MESH AND ITS OWN TEXTURE. core/gl.js has exactly one sampler
// (`uTex`, unit 0) and `renderer.draw(mesh, model, { tex })` swaps it per draw.
// A facade photo therefore cannot ride in the shared 2048² material atlas
// without rebuilding the atlas, and it does not need to: one quad and one
// texture bind per house is the same deal signage.js already takes for the 120
// storefront boards, and there are two of these.
//
// The images are the rectified, shadow-free elevations in
// gemini-inbox/look/facades/, downscaled to <=1024 px wide and re-encoded as
// JPEG (the originals are 52 MB of PNG for 20 buildings; only the faces that
// are actually wired are copied into assets/facades/).
//
// THE FACTS ARE CHECKED, NOT TAKEN. Every entry below names an OSM way id, and
// tools/smoke_facades.mjs asserts that the id exists in mapdata, that its `addr`
// is the address on the label, and that the street-facing edge this module picks
// is the one the game's own street index points at. Gemini's metric width for
// 75 Denise-Friend (8.12 m) is 30 % wider than the footprint's street edge
// (6.22 m), so the photo is fitted to the FOOTPRINT, never to its own claimed
// metres — docs/VERIFY.md §4.
import { MeshBuilder } from '../core/mesh.js';
import { MAP } from './mapdata.js';
import { normalizeAttrs } from './houses.js';

export const FACADE_DIR = 'assets/facades/';

// How far a facade quad is drawn. Two chunks: past that the wall is a couple of
// pixels wide and the sector it stands in may not even be resident.
export const FACADE_FAR = 260;

// `crop` is the part of the image that is WALL, as [u0, v0, u1, v1] with v0 at
// the top — the photographs are rectified elevations, so they carry sky or
// pavement outside the building's silhouette and a little roof above the
// soffit. The crop is stretched onto the wall rectangle; it is deliberately not
// aspect-preserved, because the footprint and the eave are measured (OSM +
// Québec LiDAR, docs/HOUSES.md) and the photograph's own metres are not.
export const FACADES = [
  {
    key: 'fraser299',
    id: 460808559,
    addr: '299 Chemin Fraser',
    img: 'fraser-299-front.jpg',
    crop: [0.030, 0.140, 0.982, 1.0],
  },
  {
    key: 'denise75',
    id: 473653776,
    addr: '75 Rue Denise-Friend',
    img: 'denise-75-front.jpg',
    crop: [0.024, 0.060, 0.977, 0.950],
  },
];

// The footprints a photograph covers. world.js reads this to leave the
// PROCEDURAL porch off those houses: the photograph already has one, and two
// porches with the picture behind the wooden one is worse than neither.
export const FACADE_IDS = new Set(FACADES.map((f) => f.id));

// ---------------------------------------------------------------- placement

function pointInPoly(p, x, z) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The ring edge whose OUTWARD normal points most nearly along `streetYaw` (a
 * mapdata angle, atan2(dz, dx)). Which side is outward is decided by testing a
 * point 0.4 m off the midpoint against the ring itself rather than by trusting
 * the ring's winding, because mapdata does not promise one.
 *
 * Returns { i, len, mx, mz, nx, nz } or null for a degenerate ring.
 */
export function frontEdge(ring, streetYaw) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length];
    const dx = c[0] - a[0], dz = c[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    let nx = dz / len, nz = -dx / len;
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    if (pointInPoly(ring, mx + nx * 0.4, mz + nz * 0.4)) { nx = -nx; nz = -nz; }
    const score = Math.cos(Math.atan2(nz, nx) - streetYaw) * Math.min(1, len / 6);
    if (!best || score > best.score) best = { i, len, mx, mz, nx, nz, score };
  }
  return best;
}

/**
 * Turn the table above into world-space wall rectangles.
 *
 * `streetYawAt(x, z, fallback)` is houses.js's own index — the same function
 * world.js uses to decide which way a house faces — so the wall a photo lands
 * on is by construction the wall the front door was already put on. Without one
 * the footprint's principal axis is used, which is what houses.js falls back to.
 *
 * Returns [{ key, addr, img, crop, x, z, eave, len, nx, nz }]; entries whose
 * OSM id is not in mapdata are dropped (with a warning — a facade that silently
 * stops being placed is worse than a missing one).
 */
export function facadePlacements(streetYawAt = null, list = FACADES) {
  const out = [];
  for (const f of list) {
    const b = MAP.buildings.find((q) => q.id === f.id);
    if (!b) { console.warn(`facades: ${f.addr} (way ${f.id}) is not in mapdata`); continue; }
    const sy = streetYawAt ? streetYawAt(b.c[0], b.c[1], -b.a) : -b.a;
    const e = frontEdge(b.p, sy);
    if (!e) continue;
    // The eave houses.js will actually build this house to, from the same
    // Phase 1 attributes — not b.h, which for a house is a random 4.8-6.2.
    const attrs = normalizeAttrs(b, b.hs, 0);
    out.push({
      key: f.key, addr: f.addr, img: f.img, crop: f.crop,
      x: e.mx, z: e.mz, len: e.len, nx: e.nx, nz: e.nz,
      eave: attrs.height, cx: b.c[0], cz: b.c[1],
    });
  }
  return out;
}

/**
 * One quad on one wall. `p` is a placement from facadePlacements().
 *
 * Wound so the outward normal comes out as (nx, 0, nz): with tangent
 * t = (nz, -nx) the triangle (a0, b0, b1) has normal t x up = (nx, 0, nz), and
 * that same tangent is the viewer's own left-to-right when they stand outside
 * looking at the wall — so the photograph is not mirrored.
 */
export function facadeMesh(p, mb = new MeshBuilder()) {
  const [u0, v0, u1, v1] = p.crop;
  // 4 cm short at each end so the quad cannot poke out past the house corner,
  // and 6 cm proud of the wall — clear of houses.js's own OUT (4.5 cm) decals,
  // which this is meant to hide.
  const half = Math.max(0.2, p.len / 2 - 0.04);
  const tx = p.nz, tz = -p.nx;
  const ox = p.x + p.nx * 0.06, oz = p.z + p.nz * 0.06;
  const ax = ox - tx * half, az = oz - tz * half;
  const bx = ox + tx * half, bz = oz + tz * half;
  const y0 = 0.02, y1 = Math.max(y0 + 1, p.eave);
  const white = [1, 1, 1];
  const i0 = mb.vert(ax, y0, az, p.nx, 0, p.nz, white, u0, v1);
  mb.vert(bx, y0, bz, p.nx, 0, p.nz, white, u1, v1);
  mb.vert(bx, y1, bz, p.nx, 0, p.nz, white, u1, v0);
  mb.vert(ax, y1, az, p.nx, 0, p.nz, white, u0, v0);
  mb.tri(i0, i0 + 1, i0 + 2);
  mb.tri(i0, i0 + 2, i0 + 3);
  return mb;
}

// ---------------------------------------------------------------- loading

// Resolves to null rather than rejecting: assets/facades/ is an OPTIONAL asset
// directory, exactly like assets/cars/ and assets/models/. A checkout without
// it draws the parametric houses and says nothing.
function loadImage(url) {
  return new Promise((res) => {
    if (typeof Image === 'undefined') { res(null); return; }
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}

/**
 * Fetch the photographs, upload one texture and one two-triangle mesh each.
 *
 * @param {object} renderer  core/gl.js Renderer
 * @param {function} streetYawAt  houses.js makeStreetYawIndex()'s closure, or null
 * @param {object} [opts]  { base, list }
 * @returns {Promise<Array>} [{ key, addr, mesh, tex, cx, cz }]
 */
export async function loadFacades(renderer, streetYawAt = null, opts = {}) {
  const base = opts.base || FACADE_DIR;
  const places = facadePlacements(streetYawAt, opts.list || FACADES);
  const imgs = await Promise.all(places.map((p) => loadImage(base + p.img)));
  const out = [];
  for (let i = 0; i < places.length; i++) {
    const p = places[i], im = imgs[i];
    if (!im) continue;
    const mb = facadeMesh(p);
    mb.textured = true;
    out.push({
      key: p.key, addr: p.addr, cx: p.cx, cz: p.cz,
      mesh: renderer.upload(mb),
      tex: renderer.texture(im, { aniso: 8 }),
    });
  }
  if (out.length) {
    console.log(`facades: ${out.map((f) => f.addr).join(', ')}`);
  }
  return out;
}

/**
 * Draw them after the world, the way landmarks.js hangs the hero meshes and the
 * storefront signs on the same call. Idempotent-ish: a second install replaces
 * the list rather than stacking another wrapper, because the sector loader can
 * finish after the facades do.
 */
export function installFacades(world, facades) {
  if (!world || !facades || !facades.length) return world;
  if (world._facades) { world._facades.list = facades; return world; }
  const state = { list: facades };
  world._facades = state;
  const baseDraw = world.draw;
  const opts = { tex: null };
  const far2 = FACADE_FAR * FACADE_FAR;
  world.draw = (r, model, x, z, drawDist, dtSec) => {
    baseDraw(r, model, x, z, drawDist, dtSec);
    for (let i = 0; i < state.list.length; i++) {
      const f = state.list[i];
      const dx = f.cx - x, dz = f.cz - z;
      if (dx * dx + dz * dz > far2) continue;
      if (!r.visible(f.mesh)) continue;
      opts.tex = f.tex;
      r.draw(f.mesh, model, opts);
    }
  };
  return world;
}
