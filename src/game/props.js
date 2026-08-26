// Hand-placed props: the handful of things the side jobs need that OpenStreetMap
// has no idea about — a canoe, a couch, a garage-sale table, Île Aylmer, the big
// maple on Mike's lawn, the light that comes on at Sayyad's.
//
// Everything here follows the engine's rules: meshes are built ONCE at load and
// uploaded ONCE (see buildPropMeshes), and per frame a prop is nothing but a
// m4.compose + a draw call. Props can be pinned to the world or attached to the
// car / the canoe, and can carry an `anim(dt, p, G)` for the couch's flight.
//
// Coordinates are the usual metres: +X east, +Z south, +Y up.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { m4 } from '../core/math.js';

// ---------------------------------------------------------------- placements

// Île Aylmer, for real: lat 45.3885, lon -75.8512 through the mapdata projection
// (x = (lon + 75.8355) * 78168, z = (45.394 - lat) * 111320). world.waterAt() is
// true here and there is open water for 60 m in every direction — checked.
// It is 1216 m from PADDLE_LAUNCH, which is about four minutes of paddling flat
// out at PADDLE.top. If that is too much of the job, ISLAND_CLOSE is the same
// island 450 m out on the same bearing — also open water, also 40 m of clearance,
// also a clear straight line — and swapping which one this file exports is the
// whole change (PLACES.island in places.js has to move with it).
export const ISLAND = { x: -1227, z: 612, rx: 30, rz: 17.5, yaw: 0.42 };
export const ISLAND_CLOSE = { x: -1742, z: 45, rx: 30, rz: 17.5, yaw: 0.42 };

// Where you put the canoe in the water at Parc des Cèdres. 206 m along the shore
// from PLACES.beach, picked because the straight line from here to the island is
// unbroken water — from the beach itself the marina headland is in the way.
export const PADDLE_LAUNCH = { x: -2044, z: -288 };

// 41 Promenade Wychwood — real address, real footprint at (-523.8, 219.8). The
// road runs at x ≈ -545.6 here, so the sale is on the lawn between the two.
export const YARD_SALE = { x: -534.5, z: 220.5, yaw: 1.62 };

// The big maple in front of 129 Avenue Frank-Robinson (Mike's; footprint at
// (-428.3, 58.3)). Frank-Robinson's centreline is at x ≈ -406.6 at this z, so
// the tree is on the front lawn with a clear run at it from the street.
export const MIKE_TREE = { x: -417.5, z: 57.0, crownY: 6.4, crownR: 4.6, trunkR: 0.55 };

// True inside Île Aylmer's shoreline (plus `pad` metres). This is the "land"
// test the canoe uses, and the arrival test the mission uses.
export function islandLandAt(x, z, pad = 0, isle = ISLAND) {
  const s = Math.sin(isle.yaw), c = Math.cos(isle.yaw);
  const dx = x - isle.x, dz = z - isle.z;
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  const a = isle.rx + pad, b = isle.rz + pad;
  return (lx * lx) / (a * a) + (lz * lz) / (b * b) <= 1;
}

// ---------------------------------------------------------------- mesh builders

const C = {
  hull: 0x5f7a4e, hullWorn: 0x768c62, gunwale: 0x8a7048, seat: 0x9a7f52,
  bondo: 0xc9b4a2, patch: 0xb0a08e,
  couch: 0x8a5f3a, couchDark: 0x6d4a2c, cushion: 0xa0764a, couchLeg: 0x3b2a1c,
  table: 0xd8d4c8, tableLeg: 0x8f9298, box: 0xbfa079, boxDark: 0xa88a63,
  sign: 0xe8e2cc, signPost: 0x6f6455, junk: 0x6b6f74, lamp: 0xf2e2b0,
  sand: 0xd9cba4, grass: 0x6a8449, trunk: 0x5b4632, leaf: 0x4f7a34,
  leaf2: 0x5d8a3a, rock: 0x807a70, log: 0x74624a, wake: 0xdfeaf0,
  win: 0xffd98a, winFrame: 0x3a3630,
};

// A canoe, lofted from stations along its length. Sixteen feet of very tired
// fibreglass: the hull is sun-bleached, and there is a lighter patch amidships
// where somebody's Bondo went on.
export function buildCanoe(len = 4.8, beam = 0.92, depth = 0.44) {
  const b = new MeshBuilder();
  const N = 13;
  const hull = rgb(C.hull), worn = rgb(C.hullWorn), gun = rgb(C.gunwale);
  // station(i) -> { z, halfBeam, keelY, sheerY }
  const st = [];
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * 2 - 1;              // -1 stern .. +1 bow
    const f = Math.pow(Math.max(0, 1 - t * t), 0.62);
    st.push({
      z: (t * len) / 2,
      w: (beam / 2) * f,
      keel: 0.05 + t * t * 0.20,                   // rocker: ends lift out of the water
      sheer: depth + t * t * 0.20,
    });
  }
  // Outer skin: two bands per side (keel->chine, chine->sheer).
  const P = (s, side, band) => {
    if (band === 0) return [side * 0, s.keel, s.z];
    if (band === 1) return [side * s.w * 0.88, s.keel + (s.sheer - s.keel) * 0.42, s.z];
    return [side * s.w, s.sheer, s.z];
  };
  for (let i = 0; i + 1 < N; i++) {
    const a = st[i], d = st[i + 1];
    for (const side of [1, -1]) {
      for (let band = 0; band < 2; band++) {
        const col = band === 1 && i > 4 && i < 8 ? worn : hull;
        const p0 = P(a, side, band), p1 = P(a, side, band + 1);
        const p2 = P(d, side, band + 1), p3 = P(d, side, band);
        if (side > 0) b.quad(p0, p1, p2, p3, col);
        else b.quad(p3, p2, p1, p0, col);
      }
    }
  }
  // Gunwale: a thin rim following the sheer line, and the inside floor so you
  // cannot see straight through the boat.
  for (let i = 0; i + 1 < N; i++) {
    const a = st[i], d = st[i + 1];
    for (const side of [1, -1]) {
      const o0 = [side * a.w, a.sheer, a.z], o1 = [side * d.w, d.sheer, d.z];
      const i0 = [side * a.w * 0.86, a.sheer - 0.02, a.z], i1 = [side * d.w * 0.86, d.sheer - 0.02, d.z];
      if (side > 0) b.quad(o0, i0, i1, o1, gun, [0, 1, 0]);
      else b.quad(o1, i1, i0, o0, gun, [0, 1, 0]);
    }
    // wound so the floor faces UP — the renderer culls by winding, not by normal
    b.quad([-d.w * 0.86, d.keel + 0.04, d.z], [d.w * 0.86, d.keel + 0.04, d.z],
      [a.w * 0.86, a.keel + 0.04, a.z], [-a.w * 0.86, a.keel + 0.04, a.z],
      shade(C.hull, 0.62), [0, 1, 0]);
  }
  // Two thwarts and the Bondo patch on the port side.
  b.box(0, depth - 0.02, -0.55, beam * 0.72, 0.05, 0.10, rgb(C.seat));
  b.box(0, depth - 0.02, 0.75, beam * 0.60, 0.05, 0.10, rgb(C.seat));
  b.box(-beam / 2 - 0.015, depth * 0.55, -0.15, 0.03, 0.20, 0.55, rgb(C.bondo));
  return b;
}

// Mike's couch. Plaid brown, 1977, weighs as much as the Ranger.
export function buildCouch() {
  const b = new MeshBuilder();
  const base = rgb(C.couch), dark = rgb(C.couchDark), cush = rgb(C.cushion);
  b.box(0, 0.42, 0, 1.95, 0.34, 0.86, base);                      // frame
  b.box(0, 0.78, -0.34, 1.95, 0.52, 0.18, dark);                  // back
  for (const sx of [-0.94, 0.94]) b.box(sx, 0.66, 0.02, 0.20, 0.46, 0.86, dark);   // arms
  for (const sx of [-0.55, 0, 0.55]) b.box(sx, 0.66, 0.05, 0.52, 0.16, 0.72, cush);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.34, 0.34]) {
    b.box(sx, 0.12, sz, 0.09, 0.24, 0.09, rgb(C.couchLeg));
  }
  return b;
}

// A folding table, three boxes of somebody's life, and a hand-lettered sign.
export function buildYardSale() {
  const b = new MeshBuilder();
  b.box(0, 0.74, 0, 1.80, 0.05, 0.72, rgb(C.table));
  for (const sx of [-0.82, 0.82]) for (const sz of [-0.30, 0.30]) {
    b.box(sx, 0.36, sz, 0.05, 0.72, 0.05, rgb(C.tableLeg));
  }
  // Tat on the table: a toaster, a stack of somethings, a lamp base.
  b.box(-0.50, 0.86, 0.02, 0.28, 0.19, 0.20, rgb(C.junk));
  b.box(0.10, 0.83, -0.05, 0.34, 0.12, 0.26, rgb(C.boxDark));
  b.cyl(0.62, 0.87, 0.04, 0.09, 0.21, 8, rgb(C.lamp), 'y', true);
  // Boxes on the grass.
  b.box(-1.55, 0.22, 0.55, 0.52, 0.44, 0.44, rgb(C.box));
  b.box(-1.10, 0.18, 0.95, 0.44, 0.36, 0.40, rgb(C.boxDark));
  b.box(1.45, 0.20, 0.70, 0.48, 0.40, 0.42, rgb(C.box));
  // VENTE DE GARAGE, in crayon, on a hydro-pole stake.
  b.cyl(2.25, 0.55, -0.10, 0.04, 1.10, 6, rgb(C.signPost), 'y', false);
  b.box(2.25, 1.05, -0.10, 0.66, 0.42, 0.03, rgb(C.sign));
  return b;
}

// Île Aylmer: a sand rim, a low grass cap, a few trees and a fire ring. Small
// enough (about 500 tris) to just sit in the prop list all game.
export function buildIsland(isle = ISLAND) {
  const b = new MeshBuilder();
  const SEG = 26;
  const sand = rgb(C.sand), grass = rgb(C.grass);
  const ring = (k, y) => {
    const out = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      // A little noise so it is not a perfect ellipse.
      const wob = 1 + Math.sin(a * 3.0) * 0.07 + Math.sin(a * 5.0 + 1.1) * 0.045;
      out.push([Math.cos(a) * isle.rx * k * wob, y, Math.sin(a) * isle.rz * k * wob]);
    }
    return out;
  };
  const r0 = ring(1.00, 0.02);      // waterline
  const r1 = ring(0.86, 0.42);      // top of the sand
  const r2 = ring(0.62, 0.78);      // grass cap
  for (let i = 0; i < SEG; i++) {
    const j = (i + 1) % SEG;
    b.quad(r0[i], r1[i], r1[j], r0[j], sand);
    b.quad(r1[i], r2[i], r2[j], r1[j], shade(C.sand, 0.94));
  }
  // Grass cap as a fan.
  const ctr = b.vert(0, 0.82, 0, 0, 1, 0, grass);
  const first = b.vertCount;
  for (const p of r2) b.vert(p[0], 0.80, p[2], 0, 1, 0, grass);
  for (let i = 0; i < SEG; i++) b.tri(ctr, first + ((i + 1) % SEG), first + i);

  // Eight trees, a driftwood log, a fire ring, and two rocks on the rim.
  const spots = [
    [-14, -3, 1.05, false], [-7, 5, 0.90, false], [1, -6, 1.15, true],
    [7, 4, 0.95, false], [13, -2, 1.00, true], [-2, 7, 0.85, false],
    [16, 5, 0.80, false], [-16, 4, 0.75, true],
  ];
  for (const [tx, tz, sc, conifer] of spots) islandTree(b, tx, 0.78, tz, sc, conifer);
  b.cyl(4, 0.95, 8, 0.22, 3.2, 6, rgb(C.log), 'y', false);       // driftwood, on its side-ish
  b.cyl(0, 0.86, 9.5, 1.05, 0.22, 10, rgb(C.rock), 'y', true);   // fire ring
  b.box(-22, 0.30, 8, 2.2, 0.7, 1.8, rgb(C.rock));
  b.box(21, 0.26, -6, 1.8, 0.6, 1.6, rgb(C.rock));
  return b;
}

function islandTree(b, x, y, z, scale, conifer) {
  const th = 3.0 * scale;
  const leaf = conifer ? 0x2f4f2e : (scale > 0.95 ? C.leaf2 : C.leaf);
  b.cyl(x, y + th / 2, z, 0.30 * scale, th, 4, rgb(C.trunk), 'y', false);
  if (conifer) {
    b.cone(x, y + th * 0.45, z, 1.7 * scale, 6.2 * scale, 5, rgb(leaf));
    b.cone(x, y + th * 1.45, z, 1.25 * scale, 4.4 * scale, 5, shade(leaf, 1.12));
  } else {
    b.cone(x, y + th * 0.70, z, 2.8 * scale, 3.6 * scale, 5, rgb(leaf));
    b.cone(x, y + th * 1.50, z, 2.1 * scale, 2.9 * scale, 5, shade(leaf, 1.1));
  }
}

// The maple on Mike's lawn. Same look as world.js's street trees, just bigger,
// and it exists as its own mesh so the couch has something specific to aim at.
export function buildBigTree(t = MIKE_TREE) {
  const b = new MeshBuilder();
  const trunkH = t.crownY - 2.6;
  b.cyl(0, trunkH / 2, 0, t.trunkR, trunkH, 6, rgb(C.trunk), 'y', false);
  // two low limbs, so the couch has somewhere to sit
  b.box(-0.9, trunkH * 0.82, 0, 1.9, 0.22, 0.22, rgb(C.trunk), { yaw: 0.4 });
  b.box(0.9, trunkH * 0.86, 0.2, 1.7, 0.20, 0.20, rgb(C.trunk), { yaw: -0.5 });
  b.cone(0, t.crownY - 3.1, 0, t.crownR, 4.6, 7, rgb(C.leaf));
  b.cone(0, t.crownY - 0.6, 0, t.crownR * 0.72, 3.6, 7, shade(C.leaf2, 1.06));
  b.cone(0, t.crownY + 1.5, 0, t.crownR * 0.42, 2.4, 6, shade(C.leaf2, 1.14));
  return b;
}

// Four warm windows and a porch light, drawn unlit so they glow at night.
// Local space: the facade faces -Z, the prop's yaw turns it to the street.
export function buildLitWindows() {
  const b = new MeshBuilder();
  const win = rgb(C.win), frame = rgb(C.winFrame);
  const pane = (x, y, w, h) => {
    b.box(x, y, -0.06, w + 0.16, h + 0.16, 0.04, frame);
    b.box(x, y, -0.10, w, h, 0.04, win);
  };
  pane(-2.1, 1.75, 1.15, 1.30);
  pane(0.6, 1.70, 1.35, 1.20);
  pane(-1.4, 4.35, 0.95, 1.00);
  pane(1.9, 4.30, 0.95, 1.00);
  b.box(2.9, 2.30, -0.14, 0.24, 0.34, 0.20, win);          // porch light
  return b;
}

// A soft blob under the canoe. One quad; the hull rides on it.
export function buildWake() {
  const b = new MeshBuilder();
  b.flat(-1.6, -3.4, 1.6, 3.4, 0, rgb(C.wake));
  return b;
}

// A cardboard "SOLD" sticker of a canoe sitting on grass at the sale — reuses
// the canoe mesh, so nothing extra to build.

// ---------------------------------------------------------------- upload

// Called once from main.js's loadWorld(). Nothing here is ever rebuilt.
export function buildPropMeshes(renderer) {
  return {
    canoe: renderer.upload(buildCanoe()),
    couch: renderer.upload(buildCouch()),
    yardsale: renderer.upload(buildYardSale()),
    island: renderer.upload(buildIsland()),
    bigtree: renderer.upload(buildBigTree()),
    litwin: renderer.upload(buildLitWindows()),
    wake: renderer.upload(buildWake()),
  };
}

// ---------------------------------------------------------------- prop system

const WARM = new Float32Array([1, 0.92, 0.66]);

// A prop is a mesh plus a transform, optionally pinned to the car or the canoe.
//   { id, mesh, x, y, z, yaw, pitch, roll, sx, sy, sz,
//     attach: 'car' | 'boat' | null,   off: [x, y, z] in the host's local frame,
//     opts,                            passed straight to renderer.draw
//     far,                             cull distance in metres (default 420)
//     anim(dt, prop, G) }              per-frame hook; return false to remove
export class Props {
  constructor(renderer, meshes) {
    this.renderer = renderer;
    this.meshes = meshes || {};
    this.list = [];
    this.byId = new Map();
    this._m = m4.create();
  }

  add(p) {
    const prop = {
      id: p.id || 'p' + this.list.length,
      mesh: typeof p.mesh === 'string' ? this.meshes[p.mesh] : p.mesh,
      x: p.x || 0, y: p.y || 0, z: p.z || 0,
      yaw: p.yaw || 0, pitch: p.pitch || 0, roll: p.roll || 0,
      sx: p.sx == null ? 1 : p.sx, sy: p.sy == null ? 1 : p.sy, sz: p.sz == null ? 1 : p.sz,
      attach: p.attach || null,
      off: p.off || [0, 0, 0],
      opts: p.opts || undefined,
      far: p.far || 420,
      visible: p.visible !== false,
      anim: p.anim || null,
      data: p.data || {},
    };
    this.remove(prop.id);
    this.list.push(prop);
    this.byId.set(prop.id, prop);
    return prop;
  }

  get(id) { return this.byId.get(id) || null; }
  has(id) { return this.byId.has(id); }

  set(id, patch) {
    const p = this.byId.get(id);
    if (p) Object.assign(p, patch);
    return p;
  }

  remove(id) {
    const p = this.byId.get(id);
    if (!p) return false;
    this.byId.delete(id);
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    return true;
  }

  // Missions namespace their props ("job:canoe"), so tearing a job down is one call.
  removePrefix(prefix) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].id.startsWith(prefix)) { this.byId.delete(this.list[i].id); this.list.splice(i, 1); n++; }
    }
    return n;
  }

  clear() { this.list.length = 0; this.byId.clear(); }

  // Hosts is { car, boat } — anything with x/z/yaw(/pitch/roll).
  update(dt, G) {
    const hosts = { car: G && G.veh, boat: G && G.boat };
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.anim && p.anim(dt, p, G) === false) { this.remove(p.id); continue; }
      const h = p.attach ? hosts[p.attach] : null;
      if (!h) continue;
      const cy = Math.cos(h.yaw), sy = Math.sin(h.yaw);
      const [lx, ly, lz] = p.off;
      p.x = h.x + lx * cy + lz * sy;
      p.z = h.z - lx * sy + lz * cy;
      // Ride with the host: over a jump the couch goes up with the truck.
      p.y = ly + (h.bodyY != null ? h.bodyY : (h.y || 0));
      p.yaw = h.yaw;
      p.pitch = h.pitch || 0;
      p.roll = h.roll || 0;
    }
  }

  draw(renderer, focus) {
    const mm = this._m;
    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
    for (const p of this.list) {
      if (!p.visible || !p.mesh) continue;
      const dx = p.x - fx, dz = p.z - fz;
      if (dx * dx + dz * dz > p.far * p.far) continue;
      m4.compose(mm, p.x, p.y, p.z, p.yaw, p.pitch, p.roll, p.sx, p.sy, p.sz);
      renderer.draw(p.mesh, mm, p.opts);
    }
  }
}

export const LIT_OPTS = { unlit: true, colorMul: WARM };
