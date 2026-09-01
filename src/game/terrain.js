// The height field: everything in Aylmer that is not at y = 0.
//
// The town is flat, and it stays flat — a base height of exactly zero everywhere
// — but a short hand-written list of ANALYTIC features (an old rail berm, a boat
// launch, loading docks, a couple of gravel piles, some driveway aprons) is
// layered on top of it. Each one is a closed-form h(x,z) with a closed-form
// gradient, so `groundAt` is a grid lookup plus two or three evaluations: no
// sampling, no interpolation, no allocation, and the same numbers on the CPU
// that world.js baked into the mesh.
//
//   groundAt(x, z) -> { h, nx, ny, nz, kind }   SHARED object, do not keep it
//
// The return value is one preallocated record that is overwritten on every call.
// Read what you need out of it before calling again. That is what keeps the
// physics loop allocation-free.
//
// Coordinates are the usual metres: +X east, +Z south, +Y up. Local feature
// frames follow the car's convention — `w` is forward (sin yaw, cos yaw) and
// `u` is the driver's left (cos yaw, -sin yaw).
//
// Feature types
//   pad    rotated rectangle at height H with a per-side slope run outward from
//          each edge (run 0 == a vertical cliff). Plateaus, loading docks,
//          terraces and plain wedge ramps are all pads.
//   ridge  polyline corridor with a trapezoidal cross-section: flat top 2*hw
//          wide, sides falling to grade over `run`. H = 0 makes it a flat
//          SURFACE patch (a park path, the beach) that only carries a `kind`.
//   mound  elliptical dome, cosine profile, optionally flat on top.
//   prof   rotated strip with an arbitrary piecewise-linear profile along w and
//          a lateral blend across u. The boat launch and the Symmes steps.
//
// Heights combine with max(); a feature marked `dig` may also pull the ground
// BELOW zero (the submerged half of the slipway) when nothing raised wins.

// ---------------------------------------------------------------- surfaces

// Per-surface driving numbers. `power` is the flat `surface` multiplier — 1 on
// tarmac, less off it — and it ramps in over half a second. `grip` is the
// instant lateral-grip multiplier. `drag` scales the extra rolling resistance
// that the ramped power term already implies (cars.js reads it against
// `offRoad`, which is `power` renormalised so grass comes out at exactly 1).
// `plough` is drag that grows with the square of your speed — see below.
// `shake` is the stair/washboard rattle the car picks up.
//
// Softened once, deliberately. The original table cost a Ranger 47 % of its
// top speed for cutting a lawn and a Caravan 53 %, which is not a shortcut,
// it is a punishment; and every car but the Civic was pinned at a dead stop on
// sand, because the drag term outgrew the engine before the wheels turned. The
// pass below takes about a third out of each penalty, keeping the order
// asphalt > gravel/path > grass > sand, so the tarmac is still where you want
// to be and the beach is still the beach. `spec.turf` machines are unaffected:
// the golf cart caps at power 1 on grass, path and sand either way.
//
// `plough` exists because that softening left sand with no honest middle. The
// off-road penalty is a constant deceleration, and a constant is the wrong
// shape for a surface a car sinks into: it is nearly all of a Caravan's engine
// and barely a fifth of a Civic's, so the drag value that makes the Ranger
// crawl pins the Caravan dead, and the one that frees the Caravan leaves the
// Ranger doing 66 km/h on a beach — measured across the whole range, there is
// no pair of numbers in between. Soft ground does not only resist, it piles up
// in front of the wheels, and the faster you push the more of it there is. One
// v² term gives sand the settled crawl it should always have had: everything
// with the grunt to move at all reaches its own low terminal speed in a couple
// of seconds and stays there. Sand only — every other surface leaves it out
// and drives exactly as it did.
export const SURF = {
  asphalt:  { power: 1,    grip: 1,    drag: 1,    shake: 0 },
  concrete: { power: 1,    grip: 0.98, drag: 1,    shake: 0 },
  path:     { power: 1,    grip: 0.90, drag: 1,    shake: 0.10 },
  gravel:   { power: 0.85, grip: 0.76, drag: 0.90, shake: 0.35 },
  dirt:     { power: 0.88, grip: 0.79, drag: 0.85, shake: 0.30 },
  grass:    { power: 0.81, grip: 0.78, drag: 0.78, shake: 0.08 },
  sand:     { power: 0.72, grip: 0.62, drag: 0.72, shake: 0.20, plough: 0.045 },
  stair:    { power: 0.90, grip: 0.88, drag: 1.0,  shake: 1.00 },
};
// Anything that asks for a surface nobody defined drives like grass.
export function surfaceOf(kind) { return SURF[kind] || SURF.grass; }

// The answer for a town with no features in it. Frozen so nobody writes to it
// by accident and quietly poisons every later query.
export const FLAT = Object.freeze({ h: 0, nx: 0, ny: 1, nz: 0, kind: '' });

// ---------------------------------------------------------------- the features
//
// Coordinates are real Aylmer, in the mapdata frame. See docs at the top of
// places.js for the projection. Everything here is hand-placed.

export const FEATURES = [
  // ---- the disused CN/QGRY rail embankment -----------------------------
  // OpenStreetMap has no railway left in the clip, so this is the line drawn
  // where it ran: a berm north of and parallel to Chemin d'Aylmer, crossing
  // Avenue de la Colline, Rue Samuel-Edey, Chemin Fraser and Chemin Grimes.
  // 2.5 m of fill, gravel ballast on top, grass down both 1-in-4 flanks —
  // which is exactly enough to launch a car that takes a crossing at speed.
  {
    id: 'rail', type: 'ridge', kind: 'gravel', side: 'grass',
    H: 2.5, hw: 3.5, run: 10, taper: 16,
    pts: [-60, -300, 700, -368, 1500, -505],
  },

  // ---- the marina boat launch ------------------------------------------
  // The slipway at the Marina d'Aylmer (PLACES.marina -1766,-88), on the lawn
  // west of the clubhouse. Up the apron, 10 % down the concrete, over the lip at
  // the waterline, and into Lac Deschênes — world.waterAt() takes it from there,
  // which is to say the Outaouais puts you back on the road.
  {
    id: 'launch', type: 'prof', kind: 'concrete', side: 'gravel', dig: true,
    cx: -1798, cz: -206, yaw: -0.5667, hw: 5.5, skirt: 3,
    prof: [-26, 0, -19, 0.85, -6, 1.05, 7, -0.35, 10, 0.55, 12, -1.6, 26, -1.9],
  },

  // ---- Galeries d'Aylmer loading docks ---------------------------------
  // The mall's OSM footprint is the whole block (-125,-442 to 84,-256), so the
  // dock runs along the south lot instead of through the building: in off the
  // aisle at the west end, two ramps up onto a 1.35 m deck, along it, and off
  // the kicker at the east lip — which is the only way over the service fence
  // at x = -92. Everything here is oriented yaw = pi/2, so forward is +X (east)
  // and the pad's `hw` is the north-south half width.
  {
    id: 'mallDock', type: 'pad', kind: 'concrete', side: 'concrete',
    cx: -120, cz: -230, yaw: 1.5708, hw: 6.5, hl: 16, H: 1.35,
    runs: [0, 0, 0, 0], wall: true,
  },
  {
    id: 'mallRampN', type: 'pad', kind: 'concrete', side: 'concrete',
    cx: -142, cz: -233.6, yaw: 1.5708, hw: 3.4, hl: 6, H: 1.35, runs: [0, 0, 7, 0],
  },
  {
    id: 'mallRampS', type: 'pad', kind: 'concrete', side: 'concrete',
    cx: -142, cz: -226.4, yaw: 1.5708, hw: 3.4, hl: 6, H: 1.35, runs: [0, 0, 7, 0],
  },
  {
    id: 'mallKick', type: 'pad', kind: 'concrete', side: 'concrete',
    cx: -100, cz: -230, yaw: 1.5708, hw: 9, hl: 1.2, H: 2.05, runs: [0, 0, 9, 0],
  },

  // ---- Parc des Cèdres --------------------------------------------------
  // The asphalt path in from Rue Raoul-Roy is driveable (grip is down a little,
  // speed is not), the beach is sand — slow and slidey — and there is a grass
  // mound between the two that works as a takeoff either way across it.
  {
    id: 'cedresPath', type: 'ridge', kind: 'path', side: 'path',
    H: 0, hw: 2.4, run: 1.2, taper: 0,
    pts: [-1800, -437, -1880, -430, -1950, -420, -2000, -400, -2022, -358],
  },
  {
    id: 'cedresBeach', type: 'ridge', kind: 'sand', side: 'sand',
    H: 0, hw: 13, run: 7, taper: 0,
    pts: [-2050, -547, -1955, -428, -1860, -308],
  },
  {
    id: 'cedresMound', type: 'mound', kind: 'grass', side: 'grass',
    cx: -1958, cz: -448, rx: 15, rz: 12, H: 2.2, flat: 0.15,
  },

  // ---- Aréna Frank-Robinson --------------------------------------------
  // The pile the loader dumps the parking-lot snow on all winter. It is August;
  // what is left is 2.4 m of dirty gravel in the corner of the north lot.
  {
    id: 'arenaPile', type: 'mound', kind: 'gravel', side: 'gravel',
    cx: -716, cz: 185, rx: 12, rz: 9.5, H: 2.4, flat: 0.1,
  },

  // ---- Auberge Symmes ---------------------------------------------------
  // The 1831 stone inn on Rue Principale; its lawn steps down to the river in
  // one long shallow flight. Driveable, and it rattles your fillings out.
  {
    id: 'symmesTerrace', type: 'pad', kind: 'concrete', side: 'concrete',
    cx: -1562, cz: -4, yaw: 0, hw: 14, hl: 9, H: 1.7, runs: [0, 0, 0, 0], wall: true,
  },
  {
    id: 'symmesRamp', type: 'pad', kind: 'concrete', side: 'concrete',
    cx: -1562, cz: -15, yaw: 0, hw: 5, hl: 2.5, H: 1.7, runs: [0, 0, 9, 0],
  },
  {
    id: 'symmesSteps', type: 'prof', kind: 'stair', side: 'grass',
    cx: -1562, cz: 12, yaw: 0, hw: 14, skirt: 2,
    prof: [-9, 1.7, -8, 1.7, 8, 0, 9, 0],
  },

  // ---- Deschênes rapids overlook ---------------------------------------
  // The lump of fill above the rapids at the end of Rue Bréboeuf, put there when
  // they built the outfall. Best view in town and a 2.6 m launch pad.
  {
    id: 'deschenesLook', type: 'mound', kind: 'grass', side: 'grass',
    cx: 2358, cz: 1502, rx: 14, rz: 11, H: 2.6, flat: 0.12,
  },

  // ---- small change ------------------------------------------------------
  // Driveway aprons that kick: the lip where a repaved private drive meets a
  // street the city has not got to yet, laid across the mouth of the street so
  // you cannot miss it. Small — but they will put a Civic in the air at 60.
  {
    id: 'apronDenise', type: 'pad', kind: 'asphalt', side: 'asphalt',
    cx: -707.1, cz: -452.9, yaw: 1.673, hw: 5, hl: 0.7, H: 0.26, runs: [0, 0, 2.4, 2.4],
  },
  {
    id: 'apronBancroft', type: 'pad', kind: 'asphalt', side: 'asphalt',
    cx: -851.1, cz: 61.9, yaw: -3.049, hw: 5, hl: 0.7, H: 0.28, runs: [0, 0, 2.4, 2.4],
  },
  {
    id: 'apronFrankRobinson', type: 'pad', kind: 'asphalt', side: 'asphalt',
    cx: -402.9, cz: 95.1, yaw: -3.039, hw: 6, hl: 0.7, H: 0.25, runs: [0, 0, 2.4, 2.4],
  },
  // The dirt jump some kid built with a shovel in the field behind the arena.
  {
    id: 'dirtJump', type: 'pad', kind: 'dirt', side: 'dirt',
    cx: -720, cz: 330, yaw: 1.686, hw: 4, hl: 1, H: 1.6, runs: [0, 0, 10, 0],
  },
  // The mound the marina piles its winter cradles on, at the top of the west
  // lot — on the way down to the boat launch, if you want a running start.
  {
    id: 'marinaBerm', type: 'mound', kind: 'gravel', side: 'grass',
    cx: -1690, cz: -215, rx: 10, rz: 8, H: 1.8, flat: 0.1,
  },
  // The berm at the end of the Canadian Tire lot on chemin d'Aylmer, where the
  // plough pushes everything in February.
  {
    id: 'ctireBerm', type: 'mound', kind: 'gravel', side: 'grass',
    cx: 455, cz: -258, rx: 9, rz: 7, H: 1.5, flat: 0.1,
  },
];

// ---------------------------------------------------------------- evaluation

const CELL = 40;                 // broadphase cell for groundAt (metres)

// Scratch for one feature evaluation. Never returned, never allocated per call.
const E = { in: false, h: 0, dx: 0, dz: 0, top: false };

// Distance from (x,z) to segment (ax,az)-(bx,bz), and the unit vector pointing
// from the closest point toward (x,z). Written into the module-level scratch.
let _d = 0, _gx = 0, _gz = 0, _t = 0;
function segDist(x, z, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az;
  const l2 = ex * ex + ez * ez || 1e-9;
  let t = ((x - ax) * ex + (z - az) * ez) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = ax + ex * t, pz = az + ez * t;
  const dx = x - px, dz = z - pz;
  const d = Math.sqrt(dx * dx + dz * dz);
  _d = d; _t = t;
  if (d > 1e-6) { _gx = dx / d; _gz = dz / d; } else { _gx = 0; _gz = 0; }
  return d;
}

// --- pad: rotated rect at H, per-side outward slope runs (0 = cliff face).
function evalPad(f, x, z) {
  const dx = x - f.cx, dz = z - f.cz;
  const s = f._s, c = f._c;
  const w = dx * s + dz * c;          // forward
  const u = dx * c - dz * s;          // driver's left
  // lateral
  let fu = 1, dfu = 0;
  const au = Math.abs(u);
  if (au > f.hw) {
    const run = u > 0 ? f.runs[1] : f.runs[0];
    const d = au - f.hw;
    if (run <= 0 || d >= run) { E.in = false; return; }
    fu = 1 - d / run;
    dfu = (u > 0 ? -1 : 1) / run;
  }
  let fw = 1, dfw = 0;
  const aw = Math.abs(w);
  if (aw > f.hl) {
    const run = w > 0 ? f.runs[3] : f.runs[2];
    const d = aw - f.hl;
    if (run <= 0 || d >= run) { E.in = false; return; }
    fw = 1 - d / run;
    dfw = (w > 0 ? -1 : 1) / run;
  }
  E.in = true;
  let du = 0, dw = 0;
  if (fu <= fw) { E.h = f.H * fu; du = f.H * dfu; } else { E.h = f.H * fw; dw = f.H * dfw; }
  E.top = fu >= 1 && fw >= 1;
  E.dx = du * c + dw * s;
  E.dz = -du * s + dw * c;
}

// --- ridge: polyline corridor, trapezoidal section. H = 0 is a flat patch.
function evalRidge(f, x, z) {
  const p = f.pts;
  let bd = 1e18, bgx = 0, bgz = 0, bs = 0;
  let acc = 0;
  const total = f._len;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
    const L = f._segLen[i >> 1];
    const d = segDist(x, z, ax, az, bx, bz);
    if (d < bd) { bd = d; bgx = _gx; bgz = _gz; bs = acc + _t * L; }
    acc += L;
  }
  const edge = f.hw + f.run;
  if (bd >= edge) { E.in = false; return; }
  E.in = true;
  if (f.H === 0) { E.h = 0; E.dx = 0; E.dz = 0; E.top = bd <= f.hw; return; }
  // lateral profile
  let fd = 1, dfd = 0;
  if (bd > f.hw) { fd = 1 - (bd - f.hw) / f.run; dfd = -1 / f.run; }
  // end taper along the polyline
  let ft = 1, dft = 0;
  if (f.taper > 0) {
    const s = bs < total - bs ? bs : total - bs;
    if (s < f.taper) { ft = s < 0 ? 0 : s / f.taper; dft = 1 / f.taper; }
  }
  if (fd <= ft) {
    E.h = f.H * fd;
    E.dx = f.H * dfd * bgx; E.dz = f.H * dfd * bgz;
  } else {
    // the taper gradient runs along the centreline; near enough to flat that a
    // zero here would read as a step, so carry it in the polyline's direction.
    E.h = f.H * ft;
    E.dx = 0; E.dz = 0;
    if (dft) { E.dx = f.H * dft * -bgz; E.dz = f.H * dft * bgx; }
  }
  E.top = bd <= f.hw && ft >= 1;
}

// --- mound: elliptical cosine dome, optional flat crown.
function evalMound(f, x, z) {
  const ax = (x - f.cx) / f.rx, az = (z - f.cz) / f.rz;
  const q2 = ax * ax + az * az;
  if (q2 >= 1) { E.in = false; return; }
  E.in = true;
  const q = Math.sqrt(q2);
  const flat = f.flat || 0;
  if (q <= flat) { E.h = f.H; E.dx = 0; E.dz = 0; E.top = true; return; }
  const t = (q - flat) / (1 - flat);
  E.h = f.H * 0.5 * (1 + Math.cos(Math.PI * t));
  const dhdq = -f.H * 0.5 * Math.PI * Math.sin(Math.PI * t) / (1 - flat);
  // dq/dx = (x-cx)/rx^2 / q
  E.dx = dhdq * (x - f.cx) / (f.rx * f.rx * q);
  E.dz = dhdq * (z - f.cz) / (f.rz * f.rz * q);
  E.top = t <= 0.35;
}

// --- prof: rotated strip with a piecewise-linear longitudinal profile.
function evalProf(f, x, z) {
  const dx = x - f.cx, dz = z - f.cz;
  const s = f._s, c = f._c;
  const w = dx * s + dz * c;
  const u = dx * c - dz * s;
  const p = f.prof;
  if (w < p[0] || w > p[p.length - 2]) { E.in = false; return; }
  const au = Math.abs(u);
  if (au >= f.hw + f.skirt) { E.in = false; return; }
  let b = 1, dbu = 0;
  if (au > f.hw) { b = 1 - (au - f.hw) / f.skirt; dbu = (u > 0 ? -1 : 1) / f.skirt; }
  let P = p[1], dP = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (w >= p[i] && w <= p[i + 2]) {
      const span = p[i + 2] - p[i] || 1e-9;
      const k = (w - p[i]) / span;
      dP = (p[i + 3] - p[i + 1]) / span;
      P = p[i + 1] + (p[i + 3] - p[i + 1]) * k;
      break;
    }
  }
  E.in = true;
  E.h = P * b;
  const du = P * dbu, dw = dP * b;
  E.dx = du * c + dw * s;
  E.dz = -du * s + dw * c;
  E.top = au <= f.hw;
}

function evalFeature(f, x, z) {
  switch (f.type) {
    case 'pad': evalPad(f, x, z); break;
    case 'ridge': evalRidge(f, x, z); break;
    case 'mound': evalMound(f, x, z); break;
    default: evalProf(f, x, z); break;
  }
}

// Axis-aligned bound of a feature, generous by `pad` metres. Used for the grid
// and by world.js to know what area to bake.
export function featureBounds(f, pad = 0) {
  let x0, x1, z0, z1;
  if (f.type === 'ridge') {
    x0 = 1e18; x1 = -1e18; z0 = 1e18; z1 = -1e18;
    for (let i = 0; i < f.pts.length; i += 2) {
      if (f.pts[i] < x0) x0 = f.pts[i];
      if (f.pts[i] > x1) x1 = f.pts[i];
      if (f.pts[i + 1] < z0) z0 = f.pts[i + 1];
      if (f.pts[i + 1] > z1) z1 = f.pts[i + 1];
    }
    const r = f.hw + f.run;
    x0 -= r; x1 += r; z0 -= r; z1 += r;
  } else if (f.type === 'mound') {
    x0 = f.cx - f.rx; x1 = f.cx + f.rx; z0 = f.cz - f.rz; z1 = f.cz + f.rz;
  } else if (f.type === 'pad') {
    const r = Math.hypot(f.hw + Math.max(f.runs[0], f.runs[1]), f.hl + Math.max(f.runs[2], f.runs[3]));
    x0 = f.cx - r; x1 = f.cx + r; z0 = f.cz - r; z1 = f.cz + r;
  } else {
    const p = f.prof;
    const r = Math.max(Math.abs(p[0]), Math.abs(p[p.length - 2])) + f.hw + f.skirt;
    x0 = f.cx - r; x1 = f.cx + r; z0 = f.cz - r; z1 = f.cz + r;
  }
  return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}

// ---------------------------------------------------------------- the field

/**
 * Bake a feature list into a queryable height field.
 *
 * Returns { groundAt, heightAt, features, cell, stats }. `groundAt` hands back
 * one shared, mutable record — copy anything you intend to keep.
 */
export function buildTerrain(features = FEATURES) {
  // Precompute the per-feature trig and lengths once, in place, so the hot path
  // never calls sin/cos or hypot.
  for (const f of features) {
    if (f.yaw != null) { f._s = Math.sin(f.yaw); f._c = Math.cos(f.yaw); }
    if (f.type === 'ridge') {
      f._segLen = [];
      let total = 0;
      for (let i = 0; i + 3 < f.pts.length; i += 2) {
        const L = Math.hypot(f.pts[i + 2] - f.pts[i], f.pts[i + 3] - f.pts[i + 1]);
        f._segLen.push(L);
        total += L;
      }
      f._len = total;
    }
    if (f.pri == null) f.pri = f.H === 0 ? 1 : 2;
  }

  // Uniform grid: cell -> Int32Array of feature indices. Features are rare and
  // small, so the whole thing is a couple of hundred entries.
  const grid = new Map();
  const key = (i, j) => (i + 4096) * 8192 + (j + 4096);
  const tmp = new Map();
  for (let n = 0; n < features.length; n++) {
    const b = featureBounds(features[n], 1);
    const i0 = Math.floor(b.x0 / CELL), i1 = Math.floor(b.x1 / CELL);
    const j0 = Math.floor(b.z0 / CELL), j1 = Math.floor(b.z1 / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let a = tmp.get(k);
        if (!a) { a = []; tmp.set(k, a); }
        a.push(n);
      }
    }
  }
  let maxPerCell = 0;
  for (const [k, a] of tmp) { grid.set(k, Int32Array.from(a)); if (a.length > maxPerCell) maxPerCell = a.length; }

  // The one record every query writes into.
  const R = { h: 0, nx: 0, ny: 1, nz: 0, kind: '' };

  function groundAt(x, z) {
    R.h = 0; R.nx = 0; R.ny = 1; R.nz = 0; R.kind = '';
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (list === undefined) return R;
    let bestH = 0, bdx = 0, bdz = 0, bestKind = '';
    let digH = 0, ddx = 0, ddz = 0, digKind = '';
    let flatKind = '', flatPri = -1;
    for (let i = 0; i < list.length; i++) {
      const f = features[list[i]];
      evalFeature(f, x, z);
      if (!E.in) continue;
      const kind = E.top ? f.kind : (f.side || f.kind);
      if (E.h > bestH) { bestH = E.h; bdx = E.dx; bdz = E.dz; bestKind = kind; }
      else if (f.dig && E.h < digH) { digH = E.h; ddx = E.dx; ddz = E.dz; digKind = kind; }
      if (f.pri > flatPri) { flatPri = f.pri; flatKind = kind; }
    }
    let dx = 0, dz = 0;
    if (bestH > 0) { R.h = bestH; dx = bdx; dz = bdz; R.kind = bestKind; }
    else if (digH < 0) { R.h = digH; dx = ddx; dz = ddz; R.kind = digKind; }
    else if (flatPri >= 0) { R.kind = flatKind; }
    if (dx !== 0 || dz !== 0) {
      const l = Math.sqrt(dx * dx + dz * dz + 1);
      R.nx = -dx / l; R.ny = 1 / l; R.nz = -dz / l;
    }
    return R;
  }

  // Height only — for anything that does not care which way is up (the camera,
  // traffic, props). Same cost minus the normalise.
  function heightAt(x, z) { return groundAt(x, z).h; }

  return {
    groundAt, heightAt, features, cell: CELL,
    stats: { features: features.length, cells: grid.size, maxPerCell },
  };
}

// A field with nothing in it, for tests and for anyone booting without a world.
export const FLAT_TERRAIN = buildTerrain([]);
