// Storefront signage. Real OpenStreetMap POIs supply the locations; the featured
// shops get fictional Québec-flavoured names. Each sign hangs as a lit fascia
// board on the street-facing wall of the nearest building footprint.
//
// One canvas atlas, one mesh, one draw call for the whole town.
//
// API
//   planSigns()             -> [{name,x,z,yaw,w,h,y,slot}]  pure, runs under node
//   buildSignage(renderer)  -> { mesh, tex, names } | null  (null with no DOM)
import { MAP } from './mapdata.js';
import { QUEBEC_POIS } from './quebec_pois.js';
import { MeshBuilder } from '../core/mesh.js';

const MAX_SIGNS = 120;
const NEAR_BUILDING = 25;     // metres: no footprint this close, no sign
const ATLAS_W = 2048, ATLAS_H = 1024;
const COLS = 8, ROWS = 16;    // 128 cells of 256 x 64 — 4:1, same as the boards
const CW = ATLAS_W / COLS, CH = ATLAS_H / ROWS;

// Anything residential or civic is not a storefront.
const SKIP = new Set(['house', 'apartments', 'industrial', 'school', 'church',
  'bicycle_parking', 'public_bookcase', 'information', 'photo_booth', 'big', 'public']);

// The two shopping streets. Signs closest to these get the 60 slots.
const HIGH_STREETS = ['Rue Principale', "Chemin d'Aylmer"];

// Awning colours — a strip of Québec storefronts is never one colour.
const BOARDS = ['#1d3f6e', '#7a2230', '#20563a', '#3a3540', '#6a4a1c', '#243a4a'];

function ringArea2(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

function d2seg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = ax + t * dx - x, pz = az + t * dz - z;
  return px * px + pz * pz;
}

// Squared distance from (x,z) to the nearest point of the named high streets.
function highStreetD2(x, z) {
  let best = Infinity;
  for (const r of MAP.roads) {
    if (HIGH_STREETS.indexOf(r.name) < 0) continue;
    const p = r.pts;
    for (let i = 0; i + 1 < p.length; i++) {
      const d = d2seg(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

// Nearest road point of any class — the wall we want is the one facing it.
function nearestRoadPoint(x, z) {
  let best = Infinity, bx = x, bz = z - 1;
  for (const r of MAP.roads) {
    const p = r.pts;
    for (let i = 0; i + 1 < p.length; i++) {
      const ax = p[i][0], az = p[i][1], qx = p[i + 1][0], qz = p[i + 1][1];
      const dx = qx - ax, dz = qz - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = ax + t * dx, pz = az + t * dz;
      const d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
  }
  return [bx, bz, best];
}

let _plan = null;

export function planSigns() {
  if (_plan) return _plan;

  // 1. geographically distributed fictional businesses first, then OSM names.
  const selected = QUEBEC_POIS.filter((p) => !p.landmark)
    .map((p) => ({ ...p, name: p.label }));
  const selectedSources = new Set(QUEBEC_POIS.map((p) => p.source));
  const extras = MAP.pois.filter((p) => p.name && !selectedSources.has(p.name) &&
    !SKIP.has(p.k) && p.name.length <= 26);
  const cand = [...selected, ...extras].map((p) => ({ p, d: highStreetD2(p.x, p.z) }));

  // 2. hang each on the street-facing wall of the nearest footprint
  const out = [];
  const usedWall = new Set();
  for (const c of cand) {
    if (out.length >= MAX_SIGNS) break;
    const p = c.p;
    let bi = -1, bd = NEAR_BUILDING * NEAR_BUILDING;
    for (let i = 0; i < MAP.buildings.length; i++) {
      const b = MAP.buildings[i];
      if (b.k === 'shed') continue;
      const dx = b.c[0] - p.x, dz = b.c[1] - p.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) continue;                       // W5: skip if no building within 25 m
    const b = MAP.buildings[bi];
    const ring = b.p, n = ring.length;
    const fwd = ringArea2(ring) < 0;
    const road = nearestRoadPoint(b.c[0], b.c[1]);

    // Best wall: long enough, facing the road, not already carrying a sign.
    let bestI = -1, bestScore = -1e9, bestGeom = null;
    for (let i = 0; i < n; i++) {
      if (usedWall.has(bi * 64 + i)) continue;
      const ia = fwd ? i : (i + 1) % n, ib = fwd ? (i + 1) % n : i;
      const a = ring[ia], q = ring[ib];
      let dx = q[0] - a[0], dz = q[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (L < 3.0) continue;
      dx /= L; dz /= L;
      const nx = -dz, nz = dx;                  // outward (see world.js wall winding)
      const mx = (a[0] + q[0]) / 2, mz = (a[1] + q[1]) / 2;
      let tx = road[0] - mx, tz = road[1] - mz;
      const tl = Math.hypot(tx, tz) || 1;
      const facing = (tx / tl) * nx + (tz / tl) * nz;
      const score = facing * 3 + Math.min(L, 10) * 0.12;
      if (score > bestScore) {
        bestScore = score; bestI = i;
        bestGeom = { mx, mz, dx, dz, nx, nz, L };
      }
    }
    if (bestI < 0 || bestScore < 0.1) continue;   // no wall actually faces the street
    usedWall.add(bi * 64 + bestI);
    const g = bestGeom;
    const w = Math.min(3.8, g.L * 0.78);
    const h = w / 4;
    const y = Math.min(Math.max(b.h - h - 0.35, 2.6), 3.6);   // above door height
    if (y + h > b.h) continue;
    out.push({
      name: p.name, slot: out.length,
      x: g.mx + g.nx * 0.14, z: g.mz + g.nz * 0.14,
      dx: g.dx, dz: g.dz, nx: g.nx, nz: g.nz,
      w, h, y, board: out.length % BOARDS.length,
    });
  }
  _plan = out;
  return out;
}

// Reset hook for tests that want to re-plan.
export function _resetSigns() { _plan = null; }

export function buildSignage(renderer) {
  const plan = planSigns();
  if (!plan.length) return null;
  if (typeof document === 'undefined' || !document.createElement) return null;

  const cv = document.createElement('canvas');
  cv.width = ATLAS_W; cv.height = ATLAS_H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const names = [];
  const mb = new MeshBuilder();
  mb.textured = true;
  const white = [1, 1, 1];

  for (const s of plan) {
    const col = s.slot % COLS, row = (s.slot / COLS) | 0;
    if (row >= ROWS) break;
    const px = col * CW, py = row * CH;
    ctx.fillStyle = BOARDS[s.board];
    ctx.fillRect(px, py, CW, CH);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(px, py, CW, 3);
    ctx.fillStyle = '#f3ead6';
    ctx.font = '600 40px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(s.name, px + CW / 2, py + CH / 2 + 2, CW - 18);
    names.push(s.name);

    const u0 = (px + 1) / ATLAS_W, u1 = (px + CW - 1) / ATLAS_W;
    const v0 = (py + 1) / ATLAS_H, v1 = (py + CH - 1) / ATLAS_H;
    const hw = s.w / 2, y0 = s.y, y1 = s.y + s.h;
    const ax = s.x - s.dx * hw, az = s.z - s.dz * hw;
    const bx = s.x + s.dx * hw, bz = s.z + s.dz * hw;
    const i0 = mb.vert(ax, y0, az, s.nx, 0, s.nz, white, u0, v1);
    mb.vert(bx, y0, bz, s.nx, 0, s.nz, white, u1, v1);
    mb.vert(bx, y1, bz, s.nx, 0, s.nz, white, u1, v0);
    mb.vert(ax, y1, az, s.nx, 0, s.nz, white, u0, v0);
    mb.tri(i0, i0 + 1, i0 + 2);
    mb.tri(i0, i0 + 2, i0 + 3);
  }
  if (mb.empty) return null;
  return { mesh: renderer.upload(mb), tex: renderer.texture(cv), names };
}
