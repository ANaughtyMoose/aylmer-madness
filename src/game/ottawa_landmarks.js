// Hero geometry for the six Ottawa landmarks you can drive to.
//
// OpenStreetMap gives a footprint and, if you are lucky, a storey count. That is
// enough for the anonymous massing world.js extrudes, and nowhere near enough
// for a building anyone would recognise through a windscreen. These six get
// built properly: real OSM footprints — every ring here is the surveyed one,
// fetched out of MAP by its OSM way id — carrying hand-authored vertical
// language. Nepean sandstone and green copper on the Hill, château roofs and
// turrets on the Laurier, pink granite and glass at the Gallery.
//
// The rules are world.js's rules, one level up:
//   * geometry is built ONCE at load and uploaded ONCE, never per frame;
//   * each landmark has a near mesh and a far mesh, and beyond NEAR the far
//     one — massing and roofline only — takes over. That is the same trade
//     houses.js makes at HOUSE_NEAR = 200 m, scaled up because a 92 m tower
//     still reads as a tower from two kilometres away;
//   * the footprint stays in MAP as a low, inset collision stub so a car still
//     hits the Peace Tower, but stops drawing the grey box this replaces.
//
// Everything is authored in world metres and then shifted so the prop's own
// origin is the building centre, because props.js culls on the prop's x/z.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';

// Beyond this the far mesh draws instead of the near one.
const NEAR = 480;

// ---------------------------------------------------------------- palette
//
// Nepean sandstone is a warm buff-grey and reads almost white in flat summer
// light; the Gothic trim on the Hill is a colder olive-grey Ohio stone. Copper
// on both Parliament and the Château went green long before 2004.
const C = {
  stone: 0xd6cdb8, stoneDim: 0xc2b9a4, stoneBase: 0xa79e8c,
  trim: 0xa9a794, gothic: 0x9d9c8a,
  copper: 0x6aa78f, copperDim: 0x548f79, copperLit: 0x7fbba3,
  slate: 0x4a5058,
  glass: 0x35505e, glassLit: 0x54808f, glassPale: 0x7ea8b6,
  brick: 0x9c5a46, brickDim: 0x864b3a, brickLite: 0xb0705a,
  granite: 0xb0918c, graniteDim: 0x9a7c78,
  precast: 0xc6bca8, precastDim: 0xaea48f,
  mullion: 0x3d4348, awning: 0x2f5f43, awningB: 0x7a2f2c,
  clock: 0xe8e2d0, gold: 0xc9a24e, flag: 0xb8352c,
  roofTile: 0x53585c, chimney: 0x8d7f6e,
};

// ---------------------------------------------------------------- ring maths

function centroid(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}

function ringArea2(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

// Inward offset by d metres along each vertex's angle bisector. A centroid-wards
// shrink is much simpler and wrong for anything long and thin — Centre Block is
// 163 m by 137 m and its ends would pull in twice as far as its sides. The miter
// is clamped so a sharp re-entrant corner cannot fling a vertex across the ring.
function offsetRing(ring, d) {
  const n = ring.length;
  const ccw = ringArea2(ring) > 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i], a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n];
    let ax = p[0] - a[0], az = p[1] - a[1];
    let bx = b[0] - p[0], bz = b[1] - p[1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    // Inward normal of each edge, then the bisector between them. The sign
    // follows the ring's winding, so a positive d always pulls IN and a
    // negative d pushes out, whichever way the footprint happens to be wound.
    const s = ccw ? -1 : 1;
    let nx = (az * s + bz * s) * 0.5, nz = (-ax * s - bx * s) * 0.5;
    const l = Math.hypot(nx, nz);
    if (l < 1e-4) { out.push([p[0], p[1]]); continue; }
    nx /= l; nz /= l;
    // 1/sin(half-angle) is the true miter; clamp it at 2.4 so spikes stay put.
    const cosHalf = Math.max(0.28, l);
    const k = Math.min(2.4, 1 / cosHalf) * d;
    out.push([p[0] + nx * k, p[1] + nz * k]);
  }
  return out;
}

// MeshBuilder wants a [r,g,b] triple; the palette above is hex, and shade()
// hands back a triple. Take either, so a call site can say what reads best.
const COL = (c) => (typeof c === 'number' ? rgb(c) : c);

// Sloped band between two rings of equal length — the workhorse for every roof
// here. A copper roof on an arbitrary footprint is this plus a deck cap.
function skirt(mb, lo, hi, y0, y1, col0) {
  const col = COL(col0);
  const n = lo.length;
  const fwd = ringArea2(lo) < 0;      // see world.js: negative shoelace == outward
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ia = fwd ? i : j, ib = fwd ? j : i;
    mb.quad([lo[ia][0], y0, lo[ia][1]], [lo[ib][0], y0, lo[ib][1]],
      [hi[ib][0], y1, hi[ib][1]], [hi[ia][0], y1, hi[ia][1]], col);
  }
  return n * 2;
}

// Straight extrusion; same winding rule.
function walls(mb, ring, y0, y1, col) {
  return skirt(mb, ring, ring, y0, y1, col);
}

// Flat cap over a ring, fan-triangulated from the centroid. Good enough for the
// convex-ish roof decks here and it never needs mapdata's index arrays.
function cap(mb, ring, y, col0) {
  const col = COL(col0);
  const c = centroid(ring);
  const n = ring.length;
  const ccw = ringArea2(ring) > 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const v = mb.vert(c[0], y, c[1], 0, 1, 0, col);
    if (ccw) {
      mb.vert(b[0], y, b[1], 0, 1, 0, col);
      mb.vert(a[0], y, a[1], 0, 1, 0, col);
    } else {
      mb.vert(a[0], y, a[1], 0, 1, 0, col);
      mb.vert(b[0], y, b[1], 0, 1, 0, col);
    }
    mb.tri(v, v + 1, v + 2);
  }
  return n;
}

// A proud horizontal band around a ring — string course, cornice, plinth.
function band(mb, ring, y0, y1, out, col) {
  const o = offsetRing(ring, -out);
  walls(mb, o, y0, y1, col);
  cap(mb, o, y1, shade(col, 1.06));
  return o.length * 2 + o.length;
}

// Punched openings along every edge of a ring, `rows` high. This is what makes
// a 30 m wall read as a building rather than a slab; it is also where the
// triangles go, so every caller passes a cap.
function windows(mb, ring, y0, rowH, rows, pitch, w, h, col0, budget, opts = {}) {
  const col = COL(col0);
  const n = ring.length;
  const fwd = ringArea2(ring) < 0;
  const arch = opts.arch ? h * 0.42 : 0;
  let used = 0;
  for (let r = 0; r < rows && used < budget; r++) {
    const yb = y0 + r * rowH;
    for (let i = 0; i < n && used < budget; i++) {
      const j = (i + 1) % n;
      const a = ring[fwd ? i : j], b = ring[fwd ? j : i];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (L < pitch * 1.4) continue;
      dx /= L; dz /= L;
      // Outward normal, so the glass sits just proud of the wall it is cut into.
      const nx = -dz * 0.08, nz = dx * 0.08;
      const count = Math.max(1, Math.floor((L - pitch * 0.7) / pitch));
      for (let k = 0; k < count && used < budget; k++) {
        const t = (L - (count - 1) * pitch) / 2 + k * pitch;
        const cx = a[0] + dx * t + nx, cz = a[1] + dz * t + nz;
        const tx = dx * w / 2, tz = dz * w / 2;
        mb.quad([cx - tx, yb, cz - tz], [cx + tx, yb, cz + tz],
          [cx + tx, yb + h, cz + tz], [cx - tx, yb + h, cz - tz], col);
        used += 2;
        if (arch) {   // a lancet head: one triangle, and it changes everything
          const v = mb.vert(cx - tx, yb + h, cz - tz, -nz * 12, 0, nx * 12, col);
          mb.vert(cx + tx, yb + h, cz + tz, -nz * 12, 0, nx * 12, col);
          mb.vert(cx, yb + h + arch, cz, -nz * 12, 0, nx * 12, col);
          mb.tri(v, v + 1, v + 2);
          used += 1;
        }
      }
    }
  }
  return used;
}

// Dormers along the two longest edges of a ring, sitting on a roof slope.
function dormers(mb, ring, y, count, w, h, roofCol, faceCol) {
  // Longest edges first — a dormer belongs on a long slope, not on a corner nib.
  const edges = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    edges.push({ a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  }
  edges.sort((p, q) => q.L - p.L);
  let made = 0;
  for (const e of edges.slice(0, 4)) {
    const per = Math.max(1, Math.min(count, Math.floor(e.L / (w * 3.2))));
    for (let k = 0; k < per && made < count; k++) {
      const t = (k + 0.5) / per;
      const cx = e.a[0] + (e.b[0] - e.a[0]) * t, cz = e.a[1] + (e.b[1] - e.a[1]) * t;
      const yaw = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      mb.tower(cx, y, cz, w, w * 0.8, h, faceCol, { yaw: -yaw, noBottom: true });
      mb.roof(cx, y + h, cz, w, w * 0.8, w * 0.42, roofCol, -yaw, 0.18);
      made++;
    }
  }
  return made * 16;
}

// An octagonal turret: stone shaft, copper cone, finial. The single cheapest
// thing that says "château" or "Gothic Revival" from a moving car.
function turret(mb, x, z, r, y0, h, coneH, shaftCol, coneCol, segs = 8) {
  mb.cyl(x, y0 + h / 2, z, r, h, segs, shaftCol, 'y', false);
  mb.cone(x, y0 + h, z, r * 1.14, coneH, segs, coneCol);
  mb.cyl(x, y0 + h + coneH + 0.6, z, 0.16, 1.2, 4, C.gold, 'y', false);
  return segs * 4 + segs + 6;
}

// ---------------------------------------------------------------- the six
//
// Each entry names the OSM way ids it consumes, where the prop sits, and the
// two builders. `budget` is the near-mesh triangle ceiling the smoke test holds
// them to; if a builder grows past it, that is a bug to fix, not a number to
// raise without thinking.
export const HERO = [
  { key: 'parliament', label: 'Colline du Parlement',
    ids: [68588665, 128127767, 128127770, 68588556, 1117689261, 849263955],
    name: { 68588665: 'Centre Block', 128127767: 'Peace Tower' },
    at: [10609, -3426], far: 5200, budget: 11000, farBudget: 1600,
    build: buildParliament, buildFar: buildParliamentFar },
  { key: 'chateau', label: 'Château Laurier', ids: [68588409],
    at: [10987, -3479], far: 3200, budget: 5200, farBudget: 800,
    build: buildChateau, buildFar: buildChateauFar },
  { key: 'rideau', label: 'Centre Rideau', ids: [68588424],
    at: [11284, -3454], far: 2400, budget: 2600, farBudget: 500,
    build: buildRideau, buildFar: buildRideauFar },
  { key: 'byward', label: 'Marché By', ids: [128147952],
    at: [11181, -3727], far: 1800, budget: 2000, farBudget: 350,
    build: buildByward, buildFar: buildBywardFar },
  { key: 'gallery', label: 'Musée des beaux-arts', ids: [39036376],
    at: [10701, -3925], far: 3600, budget: 3600, farBudget: 700,
    build: buildGallery, buildFar: buildGalleryFar },
  { key: 'stvincent', label: 'Hôpital Saint-Vincent', ids: [68588557],
    name: { 68588557: 'Saint-Vincent Hospital' },
    at: [9895, -2140], far: 2200, budget: 2600, farBudget: 450,
    build: buildStVincent, buildFar: buildStVincentFar },
];

// Footprints, keyed by OSM way id, filled in by clearHeroFootprints().
const RINGS = new Map();

function ring(id, origin) {
  const r = RINGS.get(id);
  if (!r) return null;
  return r.map((p) => [p[0] - origin[0], p[1] - origin[1]]);
}

// Longest-edge angle of a ring: which way the building actually faces.
function longAxis(r) {
  let best = 0, ang = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  return { ang, len: best };
}

function bbox(r) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of r) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1];
  }
  return { x0, x1, z0, z1, w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

// The four ring vertices closest to the bbox corners — where turrets go.
function corners(r) {
  const b = bbox(r);
  const want = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]];
  return want.map((w) => {
    let best = r[0], bd = Infinity;
    for (const p of r) {
      const d = (p[0] - w[0]) ** 2 + (p[1] - w[1]) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  });
}

// ---------------------------------------------------------------- Parliament

function buildParliament(mb, o) {
  const centre = ring(68588665, o);
  const tower = ring(128127767, o);
  const lib = ring(128127770, o);
  const west = ring(68588556, o);
  if (!centre || !tower || !lib) return;

  // ---- Centre Block. Nepean sandstone to a 21 m eaves line, then a steep
  // copper roof. The 1916 fire took the original; what stands is Pearson and
  // Marchand's, and it is taller and steeper than what it replaced.
  const EAVE = 21.5;
  walls(mb, offsetRing(centre, -0.55), 0, 1.6, C.stoneBase);   // plinth
  walls(mb, centre, 1.6, EAVE, C.stone);
  band(mb, centre, 8.4, 9.1, 0.34, C.trim);                   // string course
  band(mb, centre, EAVE - 0.9, EAVE, 0.42, C.stoneDim);       // cornice
  // Two ranges of lancet windows. Gothic Revival is vertical before it is
  // anything else, so these are tall, narrow and closely pitched.
  windows(mb, centre, 3.0, 8.0, 2, 4.6, 1.5, 4.4, rgb(C.glass), 320, { arch: true });

  const cLo = offsetRing(centre, 0.35);
  const cHi = offsetRing(centre, 12.0);
  skirt(mb, cLo, cHi, EAVE, EAVE + 14.5, rgb(C.copper));
  cap(mb, cHi, EAVE + 14.5, rgb(C.copperDim));
  // A ridge lantern down the middle: the deck is 137 m across and without
  // something standing on it the roof reads as a chamfered box from the street.
  const cRidge = offsetRing(centre, 17.0);
  walls(mb, cRidge, EAVE + 14.5, EAVE + 17.6, C.copperDim);
  cap(mb, cRidge, EAVE + 17.6, rgb(C.copperLit));
  dormers(mb, offsetRing(centre, 2.4), EAVE + 4.2, 18, 3.4, 3.2,
    rgb(C.copperLit), rgb(C.stone));
  // Corner pavilions: the roofline is the silhouette, and four stone turrets
  // with copper cones are what stop it reading as an extruded polygon.
  for (const c of corners(centre)) {
    turret(mb, c[0], c[1], 3.0, 0, EAVE + 4.5, 7.5, rgb(C.stone), rgb(C.copper));
  }

  // ---- The Peace Tower. 92.2 m in OSM and 92.2 m here; it is the one thing on
  // this map you can see from the far side of the river, so it gets the budget.
  const tb = bbox(tower);
  const tx = tb.cx, tz = tb.cz;
  const tw = Math.max(tb.w, tb.d) * 0.5;      // half-width of the shaft
  const SHAFT = 58, BELF = 70, CLOCK = 49.0;
  const ta = longAxis(tower).ang;
  mb.tower(tx, 0, tz, tw * 2, tw * 2, SHAFT, rgb(C.stone),
    { yaw: -ta, wTop: tw * 1.86, dTop: tw * 1.86, noBottom: true });
  // Corner buttresses, stepped back twice — the tower's whole character.
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const co = Math.cos(-ta), si = Math.sin(-ta);
    const px = tx + (sx * tw * 0.92) * co + (sz * tw * 0.92) * si;
    const pz = tz - (sx * tw * 0.92) * si + (sz * tw * 0.92) * co;
    mb.tower(px, 0, pz, 2.2, 2.2, SHAFT + 3.5, rgb(C.stoneDim), { yaw: -ta, noBottom: true });
    mb.cone(px, SHAFT + 3.5, pz, 1.6, 3.4, 6, rgb(C.copper));
  }
  // Four clock faces, then the belfry arcade above them.
  for (let f = 0; f < 4; f++) {
    const a = -ta + f * Math.PI / 2;
    const nx = Math.cos(a), nz = -Math.sin(a);
    mb.panel(tx + nx * (tw * 1.0), CLOCK, tz + nz * (tw * 1.0), 5.2, 5.2,
      nx, nz, rgb(C.clock), null, 0.12);
    mb.panel(tx + nx * (tw * 1.02), CLOCK, tz + nz * (tw * 1.02), 0.34, 3.4,
      nx, nz, rgb(0x2a2a2a), null, 0.14);
  }
  mb.tower(tx, SHAFT, tz, tw * 1.9, tw * 1.9, BELF - SHAFT, rgb(C.stone),
    { yaw: -ta, noBottom: true });
  windows(mb, [[tx - tw, tz - tw], [tx + tw, tz - tw], [tx + tw, tz + tw], [tx - tw, tz + tw]]
    .map((p) => p), SHAFT + 1.5, 6, 1, 3.0, 1.9, 7.0, rgb(0x1d2a30), 40, { arch: true });
  // The spire: an octagonal drum, a long copper cone to 92.2 m, and the mast.
  mb.cyl(tx, BELF + 1.4, tz, tw * 1.20, 2.8, 8, rgb(C.copperDim), 'y', false);
  mb.cone(tx, BELF + 2.8, tz, tw * 1.14, 92.2 - (BELF + 2.8), 8, rgb(C.copper));
  mb.cyl(tx, 90.0, tz, 0.22, 6.0, 4, rgb(C.gold), 'y', false);
  mb.box(tx + 1.5, 92.0, tz, 3.0, 1.7, 0.14, rgb(C.flag), { yaw: -ta });

  // The entrance pavilion at the foot of the tower. Its OSM stub is cleared
  // above precisely so it stops drawing as a red brick shop front.
  // Offset along the tower's own local +Z, which is (sin yaw, cos yaw) in world
  // axes — not cos alone, or the porch slides off the tower on a rotated
  // footprint. Centre Block faces the lawn, so this is the south front.
  const pd = tw + 7.5, ps = Math.sin(-ta), pc = Math.cos(-ta);
  const px0 = tx + pd * ps, pz0 = tz + pd * pc;
  mb.tower(px0, 0, pz0, tw * 3.4, 15.0, 15.5, rgb(C.stone), { yaw: -ta, noBottom: true });
  mb.roof(px0, 15.5, pz0, tw * 3.4, 15.0, 5.5, rgb(C.copper), -ta, 0.6);

  // ---- The Library of Parliament. Sixteen sides, flying buttresses, a conical
  // copper roof and a lantern: the only part of the 1859 building the 1916 fire
  // did not take, because a librarian shut the iron doors.
  const lb = bbox(lib);
  const lr = Math.max(lb.w, lb.d) * 0.5;
  walls(mb, offsetRing(lib, -0.4), 0, 1.6, C.stoneBase);
  walls(mb, lib, 1.6, 15.0, C.stone);
  windows(mb, lib, 4.0, 0, 1, 3.4, 1.5, 6.4, rgb(C.glass), 60, { arch: true });
  band(mb, lib, 15.0, 15.9, 0.5, C.stoneDim);
  // Buttresses at every second vertex, which is what the real bay rhythm is.
  for (let i = 0; i < lib.length; i += 2) {
    const p = lib[i];
    const dx = p[0] - lb.cx, dz = p[1] - lb.cz;
    const l = Math.hypot(dx, dz) || 1;
    mb.tower(p[0] + dx / l * 0.7, 0, p[1] + dz / l * 0.7, 1.5, 1.5, 17.5,
      rgb(C.gothic), { yaw: -Math.atan2(dz, dx), noBottom: true });
    mb.cone(p[0] + dx / l * 0.7, 17.5, p[1] + dz / l * 0.7, 1.15, 2.6, 6, rgb(C.copper));
  }
  mb.cone(lb.cx, 15.9, lb.cz, lr * 1.06, 15.0, 16, rgb(C.copper));
  mb.cyl(lb.cx, 32.4, lb.cz, lr * 0.24, 3.6, 8, rgb(C.copperDim), 'y', false);
  mb.cone(lb.cx, 34.2, lb.cz, lr * 0.30, 4.6, 8, rgb(C.copperLit));
  mb.cyl(lb.cx, 40.2, lb.cz, 0.18, 3.0, 4, rgb(C.gold), 'y', false);

  // ---- West Block: the same stone, a lower roof, and its own square tower.
  if (west) {
    const wb = bbox(west);
    walls(mb, offsetRing(west, -0.45), 0, 1.4, C.stoneBase);
    walls(mb, west, 1.4, 17.0, C.stone);
    band(mb, west, 17.0, 17.8, 0.4, C.stoneDim);
    windows(mb, west, 3.2, 6.4, 2, 4.8, 1.4, 3.6, rgb(C.glass), 190, { arch: true });
    const wLo = offsetRing(west, 0.3), wHi = offsetRing(west, 8.0);
    skirt(mb, wLo, wHi, 17.0, 17.0 + 10.0, rgb(C.copper));
    cap(mb, wHi, 27.0, rgb(C.copperDim));
    dormers(mb, offsetRing(west, 2.0), 20.4, 12, 3.0, 2.8, rgb(C.copperLit), rgb(C.stone));
    // The Mackenzie Tower, on the north-west corner.
    const cw = corners(west)[0];
    mb.tower(cw[0], 0, cw[1], 7.6, 7.6, 26.0, rgb(C.stone), { noBottom: true });
    mb.tower(cw[0], 26.0, cw[1], 8.4, 8.4, 1.2, rgb(C.stoneDim), { noBottom: true });
    mb.cone(cw[0], 27.2, cw[1], 6.0, 11.0, 8, rgb(C.copper));
    mb.cyl(cw[0], 39.5, cw[1], 0.16, 2.4, 4, rgb(C.gold), 'y', false);
    void wb;
  }
}

// Far LOD: the silhouette and nothing else. From 500 m what you can actually
// see is the copper roofline, the Peace Tower and the Library's cone.
function buildParliamentFar(mb, o) {
  const centre = ring(68588665, o), tower = ring(128127767, o);
  const lib = ring(128127770, o), west = ring(68588556, o);
  if (!centre || !tower || !lib) return;
  const EAVE = 21.5;
  walls(mb, centre, 0, EAVE, C.stone);
  const cHi = offsetRing(centre, 4.6);
  skirt(mb, centre, cHi, EAVE, EAVE + 8.4, rgb(C.copper));
  cap(mb, cHi, EAVE + 8.4, rgb(C.copperDim));
  const tb = bbox(tower), tw = Math.max(tb.w, tb.d) * 0.5;
  mb.tower(tb.cx, 0, tb.cz, tw * 2, tw * 2, 70, rgb(C.stone),
    { wTop: tw * 1.9, dTop: tw * 1.9, noBottom: true });
  mb.cone(tb.cx, 70.0, tb.cz, tw * 1.14, 22.2, 8, rgb(C.copper));
  const lb = bbox(lib), lr = Math.max(lb.w, lb.d) * 0.5;
  walls(mb, lib, 0, 15.9, C.stone);
  mb.cone(lb.cx, 15.9, lb.cz, lr * 1.06, 15.0, 10, rgb(C.copper));
  if (west) {
    walls(mb, west, 0, 17.0, C.stone);
    const wHi = offsetRing(west, 3.6);
    skirt(mb, west, wHi, 17.0, 23.2, rgb(C.copper));
    cap(mb, wHi, 23.2, rgb(C.copperDim));
    const cw = corners(west)[0];
    mb.tower(cw[0], 0, cw[1], 7.6, 7.6, 26.0, rgb(C.stone), { noBottom: true });
    mb.cone(cw[0], 26.0, cw[1], 6.0, 11.0, 8, rgb(C.copper));
  }
}

// ---------------------------------------------------------------- Château Laurier

function buildChateau(mb, o) {
  const r = ring(68588409, o);
  if (!r) return;
  const b = bbox(r);
  // Indiana limestone, eight storeys to the eaves, then the roof that is most of
  // the building. Bradford Lee Gilbert's château style: the roof is not a hat,
  // it is a third of the elevation.
  const EAVE = 29.0, ROOF = 19.0;
  walls(mb, offsetRing(r, -0.5), 0, 2.2, C.stoneBase);
  walls(mb, r, 2.2, EAVE, C.stone);
  band(mb, r, 6.6, 7.2, 0.32, C.trim);
  band(mb, r, EAVE - 1.0, EAVE, 0.5, C.stoneDim);
  windows(mb, r, 3.4, 3.3, 7, 3.3, 1.35, 2.15, rgb(C.glass), 620);

  const lo = offsetRing(r, 0.2), hi = offsetRing(r, 10.5);
  skirt(mb, lo, hi, EAVE, EAVE + ROOF, rgb(C.copper));
  cap(mb, hi, EAVE + ROOF, rgb(C.copperDim));
  // Three tiers of dormers up the slope is what a château roof actually has.
  dormers(mb, offsetRing(r, 2.0), EAVE + 3.4, 16, 3.0, 3.0, rgb(C.copperLit), rgb(C.stone));
  dormers(mb, offsetRing(r, 5.6), EAVE + 11.0, 10, 2.2, 2.2, rgb(C.copperLit), rgb(C.stone));

  // Round corner turrets with tall conical caps — the Château's signature.
  for (const c of corners(r)) {
    turret(mb, c[0], c[1], 4.2, 0, EAVE + 3.0, 15.0, rgb(C.stone), rgb(C.copper), 10);
  }
  // The central pavilion over the Rideau Street entrance, a storey taller.
  const pw = Math.min(b.w, b.d) * 0.44;
  mb.tower(b.cx, EAVE - 1.0, b.cz, pw, pw, 7.0, rgb(C.stone),
    { yaw: -longAxis(r).ang, noBottom: true });
  mb.hip(b.cx, EAVE + 6.0, b.cz, pw, pw, 11.0, rgb(C.copper), -longAxis(r).ang, 0.9);
  mb.cyl(b.cx, EAVE + 17.5, b.cz, 0.2, 4.0, 4, rgb(C.gold), 'y', false);
  // Chimneys. A hotel this size had a lot of them and they break the ridge.
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    const p = hi[Math.floor(t * hi.length) % hi.length];
    mb.box(p[0], EAVE + ROOF + 1.6, p[1], 1.5, 3.2, 1.1, rgb(C.chimney));
  }
}

function buildChateauFar(mb, o) {
  const r = ring(68588409, o);
  if (!r) return;
  const b = bbox(r);
  const EAVE = 29.0, ROOF = 19.0;
  walls(mb, r, 0, EAVE, C.stone);
  const hi = offsetRing(r, 10.5);
  skirt(mb, r, hi, EAVE, EAVE + ROOF, rgb(C.copper));
  cap(mb, hi, EAVE + ROOF, rgb(C.copperDim));
  for (const c of corners(r)) {
    mb.cyl(c[0], (EAVE + 3.0) / 2, c[1], 4.2, EAVE + 3.0, 8, rgb(C.stone), 'y', false);
    mb.cone(c[0], EAVE + 3.0, c[1], 4.8, 15.0, 8, rgb(C.copper));
  }
  const pw = Math.min(b.w, b.d) * 0.44;
  mb.hip(b.cx, EAVE + 6.0, b.cz, pw, pw, 11.0, rgb(C.copper), -longAxis(r).ang, 0.9);
}

// ---------------------------------------------------------------- Rideau Centre

// The mall as it stood in 2004: the 1983 building, three retail levels of beige
// precast over a parking podium, a long ribbon of dark glazing, and the glass
// bridge over Rideau Street. The 2016 expansion — the glass curtain wall on
// Nicholas and the raised roofline — is deliberately absent; so is the
// Confederation Line entrance under it.
function buildRideau(mb, o) {
  const r = ring(68588424, o);
  if (!r) return;
  const b = bbox(r);
  const H = 16.5;
  walls(mb, r, 0, 2.6, C.precastDim);
  walls(mb, r, 2.6, H, C.precast);
  // Precast panel joints: one shallow band per level reads as the real thing.
  band(mb, r, 6.2, 6.7, 0.22, C.precastDim);
  band(mb, r, 10.6, 11.1, 0.22, C.precastDim);
  band(mb, r, H - 1.1, H, 0.45, C.precastDim);
  // The 1983 mall's glazing is horizontal ribbon, not punched windows.
  windows(mb, r, 7.4, 4.4, 2, 3.0, 2.4, 2.6, rgb(C.glass), 300);
  windows(mb, r, 0.9, 0, 1, 5.0, 3.6, 4.2, rgb(C.glassLit), 90);
  cap(mb, r, H, rgb(C.roofTile));
  // Rooftop mechanical — a shopping centre roof is mostly plant.
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const p = offsetRing(r, 10)[Math.floor(t * r.length) % r.length];
    mb.box(p[0], H + 1.5, p[1], 6.5, 3.0, 4.5, rgb(0x8d9095));
  }
  // The glass bridge over Rideau Street, on the long axis.
  const la = longAxis(r);
  mb.tower(b.cx, 8.4, b.cz + b.d * 0.42, 26, 5.0, 5.0, rgb(C.glassLit),
    { yaw: -la.ang, noBottom: true });
  // The entrance canopy on the long street frontage.
  mb.box(b.cx, 5.4, b.cz - b.d * 0.40, 22, 0.7, 5.0, rgb(C.mullion), { yaw: -la.ang });
}

function buildRideauFar(mb, o) {
  const r = ring(68588424, o);
  if (!r) return;
  const H = 16.5;
  walls(mb, r, 0, H, C.precast);
  cap(mb, r, H, rgb(C.roofTile));
}

// ---------------------------------------------------------------- ByWard Market

// The 1926 market building: two storeys of red brick, a long gabled roof with a
// clerestory down the ridge, arched openings at street level, and the stalls
// under awnings all round it. William Street is closed to traffic in summer and
// the produce tables come out into it.
function buildByward(mb, o) {
  const r = ring(128147952, o);
  if (!r) return;
  const b = bbox(r);
  const la = longAxis(r);
  const EAVE = 8.4;
  walls(mb, offsetRing(r, -0.35), 0, 0.9, C.brickDim);
  walls(mb, r, 0.9, EAVE, C.brick);
  band(mb, r, 4.4, 4.8, 0.2, C.brickLite);
  band(mb, r, EAVE - 0.7, EAVE, 0.35, C.brickDim);
  // Arched ground-floor openings, then square windows above.
  windows(mb, r, 1.2, 0, 1, 4.2, 2.4, 3.0, rgb(C.glass), 90, { arch: true });
  windows(mb, r, 5.2, 0, 1, 4.2, 1.5, 2.0, rgb(C.glass), 70);
  // Gabled roof along the long axis, with a clerestory lantern on the ridge.
  const w = Math.max(b.w, b.d), d = Math.min(b.w, b.d);
  mb.roof(b.cx, EAVE, b.cz, w * 0.98, d * 0.98, d * 0.30, rgb(C.roofTile), -la.ang, 0.7);
  mb.tower(b.cx, EAVE + d * 0.20, b.cz, w * 0.72, d * 0.30, 2.2, rgb(C.glassPale),
    { yaw: -la.ang, noBottom: true });
  mb.roof(b.cx, EAVE + d * 0.20 + 2.2, b.cz, w * 0.74, d * 0.34, 1.1,
    rgb(C.roofTile), -la.ang, 0.25);
  // Awnings and stall tables down both long sides — the market, not the building.
  const co = Math.cos(-la.ang), si = Math.sin(-la.ang);
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 7; i++) {
      const t = (i - 3) * (w / 8);
      const off = s * (d / 2 + 2.2);
      const px = b.cx + t * co + off * si, pz = b.cz - t * si + off * co;
      mb.box(px, 3.0, pz, w / 9, 0.28, 3.6,
        rgb(i % 2 ? C.awning : C.awningB), { yaw: -la.ang });
      mb.box(px, 0.9, pz, w / 10, 0.12, 1.5, rgb(0xb9a988), { yaw: -la.ang });
      mb.cyl(px - w / 22, 1.5, pz + 1.6, 0.05, 3.0, 4, rgb(0x54585c), 'y', false);
      mb.cyl(px + w / 22, 1.5, pz + 1.6, 0.05, 3.0, 4, rgb(0x54585c), 'y', false);
    }
  }
}

function buildBywardFar(mb, o) {
  const r = ring(128147952, o);
  if (!r) return;
  const b = bbox(r), la = longAxis(r);
  walls(mb, r, 0, 8.4, C.brick);
  const w = Math.max(b.w, b.d), d = Math.min(b.w, b.d);
  mb.roof(b.cx, 8.4, b.cz, w * 0.98, d * 0.98, d * 0.30, rgb(C.roofTile), -la.ang, 0.7);
  // The ridge lantern is what tells this brick shed from the brick sheds around
  // it, so it survives into the far LOD even though it is only ten triangles.
  mb.tower(b.cx, 8.4 + d * 0.20, b.cz, w * 0.72, d * 0.30, 2.2, rgb(C.glassPale),
    { yaw: -la.ang, noBottom: true });
  mb.roof(b.cx, 8.4 + d * 0.20 + 2.2, b.cz, w * 0.74, d * 0.34, 1.1,
    rgb(C.roofTile), -la.ang, 0.25);
}

// ---------------------------------------------------------------- National Gallery

// Safdie's 1988 building: pink New Brunswick granite laid in long low ranges,
// a glazed colonnade running the length of the Sussex Drive front, and the
// Great Hall — a faceted glass tower answering the Library of Parliament across
// the water, which is exactly what it was designed to do.
function buildGallery(mb, o) {
  const r = ring(39036376, o);
  if (!r) return;
  const b = bbox(r);
  const la = longAxis(r);
  walls(mb, offsetRing(r, -0.4), 0, 1.2, C.graniteDim);
  walls(mb, r, 1.2, 13.5, C.granite);
  band(mb, r, 13.5, 14.2, 0.45, C.graniteDim);
  cap(mb, offsetRing(r, -0.6), 14.2, rgb(C.graniteDim));
  // The colonnade: a run of glazed bays with granite piers between them.
  windows(mb, r, 2.0, 0, 1, 4.0, 2.6, 9.0, rgb(C.glass), 200);
  windows(mb, r, 11.6, 0, 1, 4.0, 2.2, 1.5, rgb(C.glassLit), 90);
  // Skylit galleries: the roof is a field of glazed pyramids, and from the
  // street they are the second thing you notice after the tower.
  const grid = offsetRing(r, 8);
  for (let i = 0; i < grid.length; i += 3) {
    const p = grid[i];
    mb.tower(p[0], 14.2, p[1], 5.0, 5.0, 1.2, rgb(C.granite), { yaw: -la.ang, noBottom: true });
    mb.cone(p[0], 15.4, p[1], 3.6, 3.2, 4, rgb(C.glassPale));
  }
  // The Great Hall. An octagonal granite drum, a tall faceted glass lantern and
  // a pointed glass cap — Safdie's answer to the Library's roof.
  const cn = corners(r);
  const gx = (cn[0][0] + cn[3][0]) / 2, gz = (cn[0][1] + cn[3][1]) / 2;
  const hx = gx + (b.cx - gx) * 0.28, hz = gz + (b.cz - gz) * 0.28;
  mb.cyl(hx, 7.0, hz, 11.0, 14.0, 8, rgb(C.granite), 'y', false);
  mb.cyl(hx, 14.6, hz, 11.4, 1.2, 8, rgb(C.graniteDim), 'y', false);
  mb.cyl(hx, 22.0, hz, 10.2, 14.0, 8, rgb(C.glass), 'y', false);
  // Mullions: eight vertical granite ribs make the drum read as glazed, not solid.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    mb.cyl(hx + Math.cos(a) * 10.3, 22.0, hz + Math.sin(a) * 10.3, 0.42, 14.0, 4,
      rgb(C.graniteDim), 'y', false);
  }
  mb.cyl(hx, 29.4, hz, 10.4, 0.8, 8, rgb(C.graniteDim), 'y', false);
  mb.cone(hx, 29.8, hz, 10.0, 13.0, 8, rgb(C.glassPale));
  mb.cyl(hx, 43.4, hz, 0.2, 3.0, 4, rgb(C.mullion), 'y', false);
  // The ramped glass colonnade that leads up to it from Sussex Drive.
  const dx = Math.cos(la.ang), dz = Math.sin(la.ang);
  for (let i = 0; i < 10; i++) {
    const t = (i - 4.5) * 7.0;
    const px = hx - dx * (t + 46), pz = hz - dz * (t + 46);
    mb.cyl(px, 5.0, pz, 0.55, 10.0, 6, rgb(C.granite), 'y', false);
    mb.box(px, 10.4, pz, 3.0, 0.7, 7.2, rgb(C.glassPale), { yaw: -la.ang });
  }
}

function buildGalleryFar(mb, o) {
  const r = ring(39036376, o);
  if (!r) return;
  const b = bbox(r);
  walls(mb, r, 0, 14.2, C.granite);
  cap(mb, r, 14.2, rgb(C.graniteDim));
  const cn = corners(r);
  const gx = (cn[0][0] + cn[3][0]) / 2, gz = (cn[0][1] + cn[3][1]) / 2;
  const hx = gx + (b.cx - gx) * 0.28, hz = gz + (b.cz - gz) * 0.28;
  mb.cyl(hx, 14.6, hz, 11.0, 29.2, 8, rgb(C.glass), 'y', false);
  mb.cone(hx, 29.8, hz, 10.0, 13.0, 8, rgb(C.glassPale));
}

// ---------------------------------------------------------------- St. Vincent

// St. Vincent Hospital, 60 Cambridge Street North — the Grey Nuns' chronic care
// hospital, and the reason every "Bruyère" in this map is here: Élisabeth
// Bruyère founded the order's Ottawa house. A 1950s buff-brick institutional
// block, seven storeys, punched windows on a strict grid, and the chapel wing
// with its copper cupola on the corner.
function buildStVincent(mb, o) {
  const r = ring(68588557, o);
  if (!r) return;
  const b = bbox(r);
  const la = longAxis(r);
  const H = 24.0;
  walls(mb, offsetRing(r, -0.4), 0, 1.6, C.stoneBase);
  walls(mb, r, 1.6, H, C.brickLite);
  band(mb, r, 4.6, 5.0, 0.22, C.brickDim);
  band(mb, r, H - 0.9, H, 0.5, C.brickDim);
  // A hospital elevation is a grid and nothing else; that regularity IS the look.
  windows(mb, r, 2.6, 3.2, 6, 3.1, 1.5, 1.9, rgb(C.glass), 700);
  cap(mb, r, H, rgb(C.roofTile));
  // Parapet, then the lift overrun and the plant on the roof.
  const par = offsetRing(r, 0.15);
  walls(mb, par, H, H + 1.1, C.brickDim);
  cap(mb, par, H + 1.1, rgb(C.stoneDim));
  mb.box(b.cx, H + 3.4, b.cz, 9.0, 5.0, 7.0, rgb(C.brickLite), { yaw: -la.ang });
  mb.box(b.cx + 12, H + 2.2, b.cz + 6, 5.0, 2.4, 4.0, rgb(0x8d9095), { yaw: -la.ang });
  // The chapel wing: a lower gabled range with a copper cupola over the crossing.
  const cn = corners(r);
  const cx = cn[1][0] * 0.72 + b.cx * 0.28, cz = cn[1][1] * 0.72 + b.cz * 0.28;
  mb.tower(cx, 0, cz, 13.0, 9.0, 13.0, rgb(C.brick), { yaw: -la.ang, noBottom: true });
  mb.roof(cx, 13.0, cz, 13.0, 9.0, 3.4, rgb(C.roofTile), -la.ang, 0.5);
  mb.cyl(cx, 17.6, cz, 2.1, 3.0, 8, rgb(C.stone), 'y', false);
  mb.cone(cx, 19.1, cz, 2.5, 4.4, 8, rgb(C.copper));
  mb.cyl(cx, 24.6, cz, 0.14, 2.4, 4, rgb(C.gold), 'y', false);
  // The ambulance canopy on the long frontage.
  const co = Math.cos(-la.ang), si = Math.sin(-la.ang);
  const off = Math.min(b.w, b.d) / 2 + 2.6;
  mb.box(b.cx + off * si, 4.2, b.cz + off * co, 11.0, 0.6, 5.5, rgb(C.stone), { yaw: -la.ang });
  for (const s of [-4.6, 4.6]) {
    mb.cyl(b.cx + s * co + off * si, 2.1, b.cz - s * si + off * co, 0.24, 4.2, 6,
      rgb(C.stoneDim), 'y', false);
  }
  void la;
}

function buildStVincentFar(mb, o) {
  const r = ring(68588557, o);
  if (!r) return;
  const H = 24.0;
  walls(mb, r, 0, H, C.brickLite);
  cap(mb, r, H, rgb(C.roofTile));
}

// ---------------------------------------------------------------- installation

// Take the hero footprints out of the anonymous building bake, keeping a low
// inset stub so the walls still collide. Called once from ottawa.js, before
// world.js ever sees MAP.
export function clearHeroFootprints(map) {
  const want = new Map();
  for (const h of HERO) for (const id of h.ids) want.set(id, h);
  let cleared = 0;
  for (const b of map.buildings) {
    const h = want.get(b.id);
    if (!h) continue;
    RINGS.set(b.id, b.p.map((p) => [p[0], p[1]]));
    if (h.name && h.name[b.id]) b.name = h.name[b.id];
    // Keep the name for signage and the map, but strip everything that draws:
    // the stub is 2.4 m tall, pulled 0.9 m inside the hero mesh's own walls, and
    // nothing at that height is visible through an opaque building.
    b.p = offsetRing(b.p, 0.9);
    b.h = 2.4;
    b.k = 'big';
    b.hero = true;
    cleared++;
  }
  return cleared;
}

let MESHES = null;

// Build and upload every hero mesh. Called once; the result is cached because
// props.js is handed mesh objects, not builders.
export function buildOttawaLandmarkMeshes(renderer) {
  if (MESHES) return MESHES;
  MESHES = [];
  for (const h of HERO) {
    const near = new MeshBuilder(), far = new MeshBuilder();
    h.build(near, h.at);
    h.buildFar(far, h.at);
    const nTris = near.i.length / 3, fTris = far.i.length / 3;
    MESHES.push({
      key: h.key, at: h.at, farDist: h.far, label: h.label,
      near: renderer.upload(near.finish()), far: renderer.upload(far.finish()),
      nearTris: nTris, farTris: fTris,
    });
  }
  return MESHES;
}

// Triangle counts without a GL context — what the smoke test checks.
export function landmarkTriangles() {
  const out = {};
  for (const h of HERO) {
    const near = new MeshBuilder(), far = new MeshBuilder();
    h.build(near, h.at);
    h.buildFar(far, h.at);
    out[h.key] = {
      near: near.i.length / 3, far: far.i.length / 3,
      budget: h.budget, farBudget: h.farBudget, label: h.label,
    };
  }
  return out;
}

// Register the landmarks with the prop system. Two props per landmark: the near
// mesh, culled by props.js at NEAR, and the far mesh, hidden inside NEAR by its
// own anim. Same swap houses.js makes at HOUSE_NEAR, at a landmark's scale.
export function addOttawaLandmarks(G) {
  if (!G || !G.props || !G.renderer) return 0;
  const meshes = buildOttawaLandmarkMeshes(G.renderer);
  for (const m of meshes) {
    G.props.add({
      id: `ott:${m.key}:near`, mesh: m.near, x: m.at[0], z: m.at[1], far: NEAR,
    });
    G.props.add({
      id: `ott:${m.key}:far`, mesh: m.far, x: m.at[0], z: m.at[1], far: m.farDist,
      anim: (dt, p, g) => {
        const f = (g && (g.focus || g.veh)) || null;
        if (!f) return;
        const dx = p.x - f.x, dz = p.z - f.z;
        p.visible = dx * dx + dz * dz > NEAR * NEAR;
      },
    });
  }
  return meshes.length;
}
