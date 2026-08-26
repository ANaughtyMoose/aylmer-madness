// The four cars, and the arcade driving model.
// Local car space: +Z is forward, +X is the driver's LEFT (right-handed GL axes), y=0 ground.
import { MeshBuilder, rgb, shade } from '../core/mesh.js';
import { clamp } from '../core/math.js';

const TIRE = 0x17181a, GLASS = 0x26313b, CHROME = 0xd4d6d8;
const LAMP = 0xfff3c4, TAIL = 0xc0332a, AMBER = 0xf0a030, PLATE = 0xe8e6dc, TRIM = 0x2e3033;

// Real dimensions (metres). `wheelbase`/`overhangF` place the axles; the mesh
// origin is the midpoint between axles so wheels sit at ±wheelbase/2.
// Profiles are keyed by t: 0 = rear bumper, 1 = front bumper.
//   top:      [[t, y], ...] upper body surface (deck, backlight, roof, windshield, hood, fascia)
//   belt:     [[t, y], ...] height where the body stops and the glass (tumblehome) starts
//   plan:     [[t, halfWidth], ...] half width seen from above
//   roofK:    roof half width as a fraction of body half width (number, or [[t, k]] profile)
//   tuck:     how far the rocker sits inside the belt line (lower-body taper)
//   glassTop: [t0, t1, yMin?] ranges where the upper surface is glass
//   glassSide: t-range of the side windows
//   cladding: { rocker, bumper, tRear, tFront, color } — lower cladding / bumper covers
//   bed:      [t0, t1, floorY] open pickup bed (the loft top drops to the floor)
//   track:    computed below from `plan` so the tyres stand just proud of the body
export const CARS = [
  {
    id: 'ranger', name: '1993 Ford Ranger XLT', who: 'Yours',
    body: 0xf3f1ea, seats: 2, style: 'truck',
    flavour: 'Regular cab, 2.3 four-banger, five-speed, three-across bench. Slow everywhere, stops nowhere, starts every time.',
    len: 4.78, wid: 1.77, h: 1.64, wheelbase: 2.75, overhangF: 0.80, track: 1.67, wheelR: 0.34,
    topSpeed: 36.5, accel: 3.5, brake: 8.0, grip: 0.80, steerMax: 0.50, mass: 1420,
    seatY: 1.28, seatZ: 0.30, seatX: 0.50, clearance: 0.30,
    // long flat hood, upright cab, open short bed with tall sides level with the door sills
    top: [[0, 1.16], [0.021, 1.16], [0.031, 0.74], [0.408, 0.74], [0.418, 1.16], [0.435, 1.16],
          [0.45, 1.60], [0.47, 1.64], [0.62, 1.64], [0.65, 1.61], [0.68, 1.42], [0.71, 1.22],
          [0.732, 1.12], [0.80, 1.09], [0.90, 1.04], [0.966, 1.00], [0.983, 0.95], [0.993, 0.80], [1, 0.62]],
    belt: [[0, 1.16], [0.03, 1.16], [0.04, 0.74], [0.40, 0.74], [0.41, 1.16], [0.735, 1.16], [0.75, 1.10], [1, 1.10]],
    plan: [[0, 0.84], [0.02, 0.87], [0.05, 0.875], [0.40, 0.875], [0.43, 0.86], [0.44, 0.885],
           [0.80, 0.885], [0.96, 0.87], [0.985, 0.85], [1, 0.80]],
    roofK: 0.82, tuck: 0.03,
    glassTop: [[0.435, 0.452, 1.24], [0.65, 0.732]], glassSide: [0.455, 0.70],
    bed: [0.031, 0.408, 0.74],
    cladding: { rocker: 0, bumper: 0.30, tRear: 0.02, tFront: 0.98, color: 0x3a3c40 },
  },
  {
    id: 'saturn', name: '1997 Saturn SL 4-door', who: "Marc's",
    body: 0x2f5fa8, seats: 3, style: 'sedan',
    flavour: 'Polymer door panels, so the parking-lot dings pop back out. Gutless, but it never quits.',
    len: 4.49, wid: 1.70, h: 1.39, wheelbase: 2.60, overhangF: 0.95, track: 1.64, wheelR: 0.30,
    topSpeed: 41.5, accel: 4.2, brake: 9.0, grip: 0.90, steerMax: 0.57, mass: 1130,
    seatY: 1.05, seatZ: 0.05, seatX: 0.40, clearance: 0.20,
    // wedge nose, long rising hood, fast windshield, short high deck
    top: [[0, 0.92], [0.02, 0.95], [0.06, 0.965], [0.17, 0.97], [0.21, 0.99], [0.25, 1.10], [0.30, 1.24],
          [0.35, 1.34], [0.40, 1.385], [0.46, 1.39], [0.55, 1.385], [0.60, 1.35], [0.66, 1.22], [0.72, 1.07],
          [0.76, 0.99], [0.80, 0.96], [0.90, 0.88], [0.965, 0.80], [0.985, 0.72], [1, 0.52]],
    belt: [[0, 0.92], [0.18, 0.94], [0.26, 0.985], [0.68, 0.985], [0.78, 0.96], [1, 0.96]],
    plan: [[0, 0.74], [0.03, 0.82], [0.10, 0.85], [0.80, 0.85], [0.90, 0.835], [0.96, 0.80], [1, 0.72]],
    roofK: 0.82, tuck: 0.035,
    glassTop: [[0.21, 0.40], [0.60, 0.76]], glassSide: [0.27, 0.66],
    cladding: { rocker: 0.10, bumper: 0.42, tRear: 0.03, tFront: 0.962, color: 0x50545a },
  },
  {
    id: 'civic', name: '1988 Honda Civic Si', who: "Steph's",
    body: 0xa8322b, seats: 3, style: 'hatch',
    flavour: 'Two thousand pounds of nothing, a 1.6 that begs for 7000, and a hatch you could sleep in.',
    len: 3.99, wid: 1.67, h: 1.33, wheelbase: 2.50, overhangF: 0.83, track: 1.61, wheelR: 0.29,
    topSpeed: 45.5, accel: 5.3, brake: 9.6, grip: 1.04, steerMax: 0.63, mass: 940,
    seatY: 0.98, seatZ: 0.0, seatX: 0.38, clearance: 0.20,
    // very low nose, flat hood, huge greenhouse, roof peaks at the B-pillar, gentle hatch glass to a tall tail
    top: [[0, 0.90], [0.015, 0.95], [0.03, 0.98], [0.05, 1.03], [0.09, 1.15], [0.13, 1.255], [0.16, 1.29],
          [0.22, 1.31], [0.32, 1.33], [0.44, 1.335], [0.52, 1.32], [0.57, 1.29], [0.62, 1.20], [0.68, 1.08],
          [0.735, 0.98], [0.78, 0.94], [0.90, 0.84], [0.96, 0.76], [0.985, 0.68], [1, 0.50]],
    belt: [[0, 0.92], [0.03, 0.95], [0.60, 0.95], [0.74, 0.94], [1, 0.94]],
    plan: [[0, 0.72], [0.03, 0.80], [0.10, 0.835], [0.80, 0.835], [0.92, 0.80], [0.97, 0.76], [1, 0.68]],
    roofK: 0.86, tuck: 0.03,
    glassTop: [[0.03, 0.155, 1.0], [0.57, 0.735]], glassSide: [0.15, 0.60],
    cladding: { rocker: 0.09, bumper: 0.36, tRear: 0.03, tFront: 0.965, color: 0x25272a },
    spoiler: true, sunroof: [0.40, 0.52],
  },
  {
    id: 'sunfire', name: '1997 Pontiac Sunfire', who: "Dave's",
    body: 0x1c8f83, seats: 3, style: 'coupe',
    flavour: 'Coupe, body-coloured cladding, one working speaker, and a spoiler that does absolutely nothing.',
    len: 4.60, wid: 1.72, h: 1.35, wheelbase: 2.64, overhangF: 1.00, track: 1.66, wheelR: 0.32,
    topSpeed: 44.0, accel: 4.5, brake: 9.0, grip: 0.92, steerMax: 0.58, mass: 1240,
    seatY: 1.0, seatZ: 0.05, seatX: 0.40, clearance: 0.20,
    // jellybean: low nose, arched roof, long doors, high rounded deck
    top: [[0, 0.88], [0.02, 0.93], [0.05, 0.97], [0.10, 0.99], [0.17, 1.00], [0.21, 1.02], [0.25, 1.12],
          [0.30, 1.24], [0.35, 1.315], [0.40, 1.345], [0.46, 1.35], [0.53, 1.34], [0.58, 1.31], [0.63, 1.22],
          [0.70, 1.08], [0.755, 0.98], [0.80, 0.94], [0.90, 0.85], [0.965, 0.76], [0.985, 0.68], [1, 0.50]],
    belt: [[0, 0.93], [0.16, 0.95], [0.25, 0.99], [0.66, 0.99], [0.76, 0.96], [1, 0.96]],
    plan: [[0, 0.70], [0.03, 0.80], [0.08, 0.84], [0.16, 0.86], [0.80, 0.86], [0.92, 0.82], [0.97, 0.76], [1, 0.66]],
    roofK: 0.78, tuck: 0.05,
    glassTop: [[0.21, 0.40], [0.58, 0.755]], glassSide: [0.26, 0.64],
    cladding: { rocker: 0.12, bumper: 0.40, tRear: 0.03, tFront: 0.962, color: 0x1a7f75, ribbed: true },
    spoiler: true,
  },
];
const WHEEL_W = (s) => (s.style === 'truck' ? 0.24 : 0.20);
const WHEEL_PROUD = 0.07;   // tyre outer face this far outside the body at the axle
for (const c of CARS) {
  c.axleZ = c.wheelbase / 2;
  // Track from the plan: the tyre's outer face stands just proud of the widest axle station.
  const rearOverhang = c.len - c.wheelbase - c.overhangF;
  const hwAxle = Math.max(pl(c.plan, rearOverhang / c.len), pl(c.plan, (rearOverhang + c.wheelbase) / c.len));
  c.track = Math.round(2 * (hwAxle + WHEEL_PROUD - WHEEL_W(c) / 2) * 100) / 100;
}

export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

// ---------------------------------------------------------------- loft

// Piecewise-linear lookup on [[t, v], ...].
export function pl(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0 || 1e-6));
    }
  }
  return pts[pts.length - 1][1];
}
const inRange = (ranges, t, y = Infinity) => ranges.some(([a, b, yMin = -Infinity]) => t >= a && t <= b && y >= yMin);

// z of a profile point: t=0 is the rear bumper; origin is between the axles.
export function tToZ(s, t) {
  const rearOverhang = s.len - s.wheelbase - s.overhangF;
  return t * s.len - rearOverhang - s.wheelbase / 2;
}

/**
 * Lofts a car body from profile functions. `ring(t)` must return 6 points
 * [ [x,y] ... ] in cross-section order: bottom-left, belt-left, roof-left,
 * roof-right, belt-right, bottom-right (x = local +X = car's left).
 * `paint(face, t, y)` returns [color, u, v] for a vertex on that face:
 * faces are 'bottom','sideL','glassL','top','glassR','sideR','front','rear'.
 */
export function loft(mb, s, n, ring, paint) {
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rings.push({ t, z: tToZ(s, t), p: ring(t) });
  }
  const FACES = ['bottom', 'sideL', 'glassL', 'top', 'glassR', 'sideR'];
  // Edge k of the ring goes from point k to point k+1 (mod 6):
  // 0: bottom(5->0)... define explicitly for clarity.
  const EDGE = [[5, 0], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5]];
  for (let i = 0; i < n; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < 6; k++) {
      const [a, b] = EDGE[k];
      const face = FACES[k];
      const p0 = [A.p[a][0], A.p[a][1], A.z], p1 = [A.p[b][0], A.p[b][1], A.z];
      const p2 = [B.p[b][0], B.p[b][1], B.z], p3 = [B.p[a][0], B.p[a][1], B.z];
      // normal from the quad, but skip degenerate (collapsed) quads
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-7) continue;
      nx /= l; ny /= l; nz /= l;
      const cA = paint(face, A.t, (p0[1] + p1[1]) / 2, A), cB = paint(face, B.t, (p2[1] + p3[1]) / 2, B);
      const uv = (P, R, col) => paint(face, R.t, P[1], R, P);
      const v0 = uv(p0, A), v1 = uv(p1, A), v2 = uv(p2, B), v3 = uv(p3, B);
      const i0 = mb.vert(p0[0], p0[1], p0[2], nx, ny, nz, v0[0], v0[1], v0[2]);
      mb.vert(p1[0], p1[1], p1[2], nx, ny, nz, v1[0], v1[1], v1[2]);
      mb.vert(p2[0], p2[1], p2[2], nx, ny, nz, v2[0], v2[1], v2[2]);
      mb.vert(p3[0], p3[1], p3[2], nx, ny, nz, v3[0], v3[1], v3[2]);
      // p0->p1->p2->p3 is CCW seen from outside (ring runs CCW seen from +Z)
      mb.tri(i0, i0 + 1, i0 + 2); mb.tri(i0, i0 + 2, i0 + 3);
      void cA; void cB;
    }
  }
  // End caps: fan the 6-point ring.
  for (const [R, face, dir] of [[rings[0], 'rear', -1], [rings[n], 'front', 1]]) {
    const base = mb.vertCount;
    for (const q of R.p) {
      const c = paint(face, R.t, q[1], R, [q[0], q[1], R.z]);
      mb.vert(q[0], q[1], R.z, 0, 0, dir, c[0], c[1], c[2]);
    }
    for (let k = 1; k < 5; k++) {
      if (dir > 0) mb.tri(base, base + k, base + k + 1);
      else mb.tri(base, base + k + 1, base + k);
    }
  }
}

// The cross-section from the hand-authored profiles. The belt is clamped to
// the top surface, so wherever the two meet (hood, deck, pickup bed) the glass
// faces collapse and the loft skips them. `tuck` pulls the rocker in under the
// belt line; `roofK` narrows the greenhouse (tumblehome).
export function specRing(s, t) {
  const top = pl(s.top, t), belt = Math.min(pl(s.belt, t), top);
  const hw = pl(s.plan, t);
  const roofK = typeof s.roofK === 'number' ? s.roofK : pl(s.roofK, t);
  const roofHw = top > belt + 0.02 ? hw * roofK : hw;
  const lift = t < 0.03 ? (0.03 - t) / 0.03 : t > 0.97 ? (t - 0.97) / 0.03 : 0;   // approach/departure angles
  const yb = s.clearance + 0.12 * lift;
  const tuck = (s.tuck || 0) * Math.min(1, Math.max(0, (belt - yb) / 0.4));
  return [[hw - tuck, yb], [hw, belt], [roofHw, top], [-roofHw, top], [-hw, belt], [-(hw - tuck), yb]];
}

function specPaint(s) {
  const body = rgb(s.body), glass = rgb(GLASS), under = shade(0x1c1d20, 1);
  const cl = s.cladding || { rocker: 0, bumper: 0.3, tRear: 0, tFront: 1, color: TRIM };
  const clad = rgb(cl.color), dark = shade(s.body, 0.86);
  const bedFloor = s.bed ? s.bed[2] : -1;
  const bumperY = s.clearance + cl.bumper;
  const inBumper = (t) => t <= cl.tRear || t >= cl.tFront;
  return (face, t, y) => {
    if (face === 'bottom') return [under, 0, 0];
    if (face === 'glassL' || face === 'glassR') {
      return [inRange([s.glassSide], t) ? glass : body, 0, 0];
    }
    if (face === 'top') {
      if (s.bed && t > s.bed[0] && t < s.bed[1] && y < bedFloor + 0.02) return [shade(s.body, 0.55), 0, 0];
      if (inRange(s.glassTop, t, y)) return [glass, 0, 0];
      if (inBumper(t) && y < bumperY) return [clad, 0, 0];
      return [body, 0, 0];
    }
    if (face === 'sideL' || face === 'sideR') {
      // Colours are per vertex and interpolated across the quad, so a band
      // keyed on y would smear into a gradient; the bumper corners are keyed
      // on t only (uniform per ring) and the rocker cladding is a slab in addDetails.
      return [inBumper(t) ? clad : body, 0, 0];
    }
    // end caps: bumper cover low, painted tail/nose panel above
    if (y < bumperY) return [clad, 0, 0];
    return [dark, 0, 0];
  };
}

// Where the loft's upper surface / side are at a given t, for hanging details.
const topAt = (s, t) => pl(s.top, t);
const hwAt = (s, t) => pl(s.plan, t);
const beltAt = (s, t) => Math.min(pl(s.belt, t), pl(s.top, t));
// t of the two axles (the profiles are keyed by t, the wheels by z).
const axleT = (s, sign) => (sign * s.axleZ - tToZ(s, 0)) / s.len;

// Lights, grille, mirrors, arches: the details that make a car a *that* car.
export function addDetails(mb, s, opts = {}) {
  const zF = tToZ(s, 1), zR = tToZ(s, 0);
  const hwR = hwAt(s, 0.012);
  const z = (t) => tToZ(s, t);
  const dark = rgb(TRIM), lamp = rgb(LAMP), tail = rgb(TAIL), amber = rgb(AMBER);
  const bodyC = rgb(s.body), chrome = rgb(CHROME);
  const both = (fn) => { fn(1); fn(-1); };

  // ---- shared: wheel arches, mirrors, door handles, fuel door, plate
  both((sx) => {
    for (const sign of [1, -1]) {
      const zz = sign * s.axleZ, hw = hwAt(s, axleT(s, sign));
      // arch: a dark disc on the body side, its bottom resting on the ground line
      mb.cyl(sx * (hw - 0.03), s.wheelR + 0.05, zz, s.wheelR + 0.05, 0.08, 12, shade(TRIM, 0.8), 'x', true);
    }
  });
  if (!opts.noMirrors) {
    const tMirror = s.style === 'truck' ? 0.69 : s.glassSide[1] - 0.03;   // front of the door glass
    both((sx) => mb.box(sx * (hwAt(s, tMirror) + 0.09), beltAt(s, tMirror) + 0.08, z(tMirror), 0.16, 0.10, 0.13, dark));
  }
  const handles = s.style === 'sedan' ? [0.33, 0.56] : s.style === 'truck' ? [0.49] : s.style === 'hatch' ? [0.30] : [0.34];
  for (const th of handles) {
    both((sx) => mb.box(sx * (hwAt(s, th) + 0.006), beltAt(s, th) - 0.13, z(th), 0.012, 0.03, 0.14, dark));
  }
  // fuel door on the driver's (left, +X) rear quarter — on the truck it's on the bed side
  const tf = s.style === 'truck' ? 0.36 : s.style === 'hatch' ? 0.10 : 0.12;
  mb.box(hwAt(s, tf) + 0.004, beltAt(s, tf) - 0.16 + (s.style === 'truck' ? 0.02 : 0), z(tf), 0.008, 0.15, 0.15, shade(s.body, 0.9));
  // rocker cladding: a slab between the wheel arches, sitting just proud of the tucked-in sill
  if (s.cladding && s.cladding.rocker > 0) {
    const zA = -s.axleZ + s.wheelR + 0.10, zB = s.axleZ - s.wheelR - 0.10;
    const hRock = s.cladding.rocker, tMid = axleT(s, 0);
    const ring = specRing(s, tMid), sillX = ring[0][0], beltX = ring[1][0], sillY = ring[0][1], beltY = ring[1][1];
    const xTop = sillX + (beltX - sillX) * (hRock / Math.max(0.01, beltY - sillY));   // body x at the slab's top edge
    both((sx) => mb.box(sx * (xTop + 0.014), s.clearance + hRock / 2, (zA + zB) / 2, 0.028, hRock, zB - zA, rgb(s.cladding.color)));
  }

  if (s.id === 'ranger') {
    // chrome bumpers, flush aero headlamps, chrome grille with the blue oval
    mb.box(0, s.clearance + 0.12, zF - 0.02, s.wid * 0.96, 0.18, 0.12, chrome);
    mb.box(0, s.clearance + 0.12, zR + 0.02, s.wid * 0.94, 0.18, 0.12, chrome);
    const yH = 0.84, zH = z(0.992);
    both((sx) => {
      mb.box(sx * 0.44, yH, zH, 0.34, 0.15, 0.06, lamp);
      mb.box(sx * (hwAt(s, 0.99) - 0.09), yH, zH - 0.005, 0.15, 0.14, 0.06, amber);
      mb.box(sx * (hwAt(s, 0.985) + 0.004), yH, z(0.982), 0.01, 0.12, 0.10, amber);   // wraps onto the fender
    });
    mb.box(0, yH, zH - 0.005, 0.50, 0.19, 0.05, shade(TRIM, 0.7));          // recessed grille opening
    mb.box(0, yH, zH, 0.52, 0.03, 0.05, chrome);                            // chrome bar
    mb.box(0, yH + 0.09, zH, 0.54, 0.02, 0.05, chrome);                     // grille frame top/bottom
    mb.box(0, yH - 0.09, zH, 0.54, 0.02, 0.05, chrome);
    mb.box(0, yH, zH + 0.02, 0.12, 0.06, 0.02, rgb(0x1f3f9a));               // blue oval
    // tall vertical tail lamps flanking the tailgate, FORD as a recessed dark box
    both((sx) => mb.box(sx * (hwR - 0.10), 0.93, zR + 0.012, 0.17, 0.40, 0.04, tail));
    mb.box(0, 0.98, zR + 0.014, 0.56, 0.10, 0.03, shade(s.body, 0.55));
    mb.box(0, s.clearance + 0.12, zR - 0.005, 0.32, 0.15, 0.02, rgb(PLATE));
    // bed: rails, floor and the tailgate inner face
    const [t0, t1, floor] = s.bed;
    const z0 = z(t0), z1 = z(t1), len = z1 - z0, zc = (z0 + z1) / 2;
    const hw = hwAt(s, (t0 + t1) / 2), railTop = pl(s.belt, 0.02);
    both((sx) => mb.tower(sx * (hw - 0.07), floor - 0.01, zc, 0.14, len, railTop - floor + 0.01, bodyC, { noBottom: true }));
    both((sx) => mb.box(sx * (hw - 0.13), floor + 0.10, zc, 0.03, 0.04, len - 0.30, shade(s.body, 0.6)));   // inner wheel-tub lip
    mb.box(0, floor + 0.01, zc, hw * 2 - 0.28, 0.01, len - 0.2, shade(s.body, 0.62));                    // ribbed floor
    for (let k = -3; k <= 3; k++) mb.box(0, floor + 0.02, zc + k * (len / 7), hw * 2 - 0.3, 0.008, 0.05, shade(s.body, 0.50));
  }

  if (s.id === 'saturn') {
    // wide low headlamps, thin slot grille, amber corner markers
    const zH = z(0.978), yH = 0.74;
    both((sx) => {
      mb.box(sx * 0.46, yH, zH, 0.44, 0.13, 0.08, lamp);
      mb.box(sx * (hwAt(s, 0.975) - 0.06), yH - 0.01, zH - 0.02, 0.12, 0.11, 0.08, amber);
    });
    mb.box(0, 0.775, z(0.972), 0.34, 0.045, 0.08, dark);
    mb.box(0, 0.775, z(0.972) + 0.03, 0.05, 0.06, 0.02, tail);              // Saturn badge in the slot
    // full-width dark tail panel with red lamps at the ends
    mb.box(0, 0.80, zR + 0.012, hwR * 2 - 0.06, 0.22, 0.03, shade(TRIM, 0.9));
    both((sx) => mb.box(sx * (hwR - 0.26), 0.80, zR + 0.005, 0.44, 0.18, 0.03, tail));
    both((sx) => mb.box(sx * (hwR - 0.12), 0.80, zR + 0.006, 0.12, 0.18, 0.02, amber));
    mb.box(0, 0.80, zR - 0.002, 0.40, 0.14, 0.03, rgb(PLATE));
  }

  if (s.id === 'civic') {
    // flush wide rectangular headlamps with a black slot grille between them
    const zH = z(0.982), yH = 0.72;
    both((sx) => mb.box(sx * 0.48, yH, zH, 0.46, 0.13, 0.08, lamp));
    both((sx) => mb.box(sx * (hwAt(s, 0.975) + 0.004), yH - 0.01, z(0.972), 0.01, 0.10, 0.12, amber));
    mb.box(0, yH, zH - 0.01, 0.46, 0.05, 0.08, dark);
    mb.box(0, yH - 0.13, z(0.975), 0.90, 0.03, 0.06, shade(TRIM, 0.9));       // bumper slot
    // wide tail lamps either side of the plate recess; tall tail panel
    both((sx) => mb.box(sx * (hwR - 0.27), 0.80, zR + 0.012, 0.46, 0.19, 0.04, tail));
    both((sx) => mb.box(sx * (hwR - 0.53), 0.80, zR + 0.014, 0.10, 0.19, 0.03, amber));
    mb.box(0, 0.62, zR + 0.012, 0.34, 0.15, 0.03, rgb(PLATE));
    // hatch spoiler at the top of the glass
    const ts = 0.15, zs = z(ts), ys = topAt(s, ts) + 0.03, hws = hwAt(s, ts) * 0.84;
    mb.box(0, ys, zs - 0.02, hws * 2, 0.05, 0.18, dark);
    both((sx) => mb.box(sx * (hws - 0.05), ys - 0.03, zs + 0.03, 0.10, 0.06, 0.08, dark));
    // sunroof
    if (s.sunroof) {
      const [a, b] = s.sunroof, yMax = Math.max(topAt(s, a), topAt(s, b), topAt(s, (a + b) / 2));
      mb.box(0, yMax + 0.004, (z(a) + z(b)) / 2, 0.80, 0.012, z(b) - z(a), shade(GLASS, 0.9));
    }
  }

  if (s.id === 'sunfire') {
    // twin-port dark grille with the arrowhead, wraparound lamps
    const zG = z(0.988), yG = 0.60;
    both((sx) => mb.box(sx * 0.24, yG, zG, 0.32, 0.11, 0.06, shade(TRIM, 0.8)));
    mb.box(0, yG, zG + 0.01, 0.06, 0.09, 0.03, tail);                      // arrowhead
    both((sx) => mb.box(sx * 0.44, 0.73, z(0.975), 0.40, 0.12, 0.10, lamp));
    both((sx) => mb.box(sx * (hwAt(s, 0.965) + 0.004), 0.73, z(0.962), 0.01, 0.10, 0.16, amber));
    // full-width ribbed tail panel: red lenses at the ends, dark band across
    mb.box(0, 0.78, zR + 0.012, hwR * 2 - 0.08, 0.20, 0.03, shade(TAIL, 0.55));
    both((sx) => mb.box(sx * (hwR - 0.28), 0.78, zR + 0.005, 0.44, 0.18, 0.03, tail));
    for (let k = -1; k <= 1; k++) mb.box(0, 0.78 + k * 0.06, zR + 0.002, hwR * 2 - 0.10, 0.008, 0.03, dark);
    mb.box(0, 0.78, zR - 0.002, 0.36, 0.13, 0.03, rgb(PLATE));
    // factory rear spoiler on two uprights
    const ts = 0.045, zs = z(ts), yTop = topAt(s, ts), hws = hwAt(s, ts);
    both((sx) => mb.box(sx * hws * 0.68, yTop + 0.045, zs, 0.10, 0.10, 0.10, bodyC));
    mb.box(0, yTop + 0.10, zs - 0.02, hws * 2 * 0.90, 0.04, 0.24, bodyC);
    // ribbed cladding: thin horizontal boxes along the rocker between the wheels
    const zA = -s.axleZ + s.wheelR + 0.12, zB = s.axleZ - s.wheelR - 0.12;
    both((sx) => {
      for (let k = 0; k < 3; k++) {
        mb.box(sx * (hwAt(s, 0.5) + 0.012), s.clearance + 0.03 + k * 0.035, (zA + zB) / 2, 0.012, 0.014, zB - zA - 0.1, shade(s.body, 0.62));
      }
    });
  }
}

export function buildCarBody(s, opts = {}) {
  const mb = new MeshBuilder();
  loft(mb, s, 64, (t) => specRing(s, t), specPaint(s));
  addDetails(mb, s, opts);
  return mb;
}

// A flat polygon on the wheel face (YZ plane at x), fanned from its first
// point. `pts` are [y, z] in CCW order seen from +X; flipped for the far face.
function facePoly(mb, x, dir, pts, c) {
  const base = mb.vertCount;
  for (const [y, zz] of pts) mb.vert(x, y, zz, dir, 0, 0, c);
  for (let k = 1; k < pts.length - 1; k++) {
    if (dir > 0) mb.tri(base, base + k, base + k + 1);
    else mb.tri(base, base + k + 1, base + k);
  }
}
const ellipse = (cy, cz, ry, rz, a, n = 8) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const u = Math.cos(th) * ry, v = Math.sin(th) * rz;
    out.push([cy + u * Math.cos(a) - v * Math.sin(a), cz + u * Math.sin(a) + v * Math.cos(a)]);
  }
  return out;
};
const spokeQuad = (r0, r1, a, halfW) => {
  const c = Math.cos(a), sn = Math.sin(a);
  return [[r0 * c - halfW * -sn, r0 * sn - halfW * c], [r1 * c - halfW * -sn, r1 * sn - halfW * c],
          [r1 * c + halfW * -sn, r1 * sn + halfW * c], [r0 * c + halfW * -sn, r0 * sn + halfW * c]];
};

export function buildWheel(s) {
  const mb = new MeshBuilder();
  const w = WHEEL_W(s);
  mb.cyl(0, 0, 0, s.wheelR, w, 16, rgb(TIRE), 'x');
  const rimR = s.wheelR * (s.style === 'truck' ? 0.56 : 0.62);
  const face = w / 2 + 0.012, deco = face + 0.004;
  if (s.id === 'ranger') {
    // styled steel: light rim with five oval holes and a domed centre cap
    const rim = 0xdcdcdc;
    mb.cyl(0, 0, 0, rimR, face * 2, 12, rgb(rim), 'x');
    for (const dir of [1, -1]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
        facePoly(mb, dir * deco, dir, ellipse(Math.cos(a) * rimR * 0.62, Math.sin(a) * rimR * 0.62, rimR * 0.16, rimR * 0.26, a), shade(rim, 0.25));
      }
    }
    mb.cyl(0, 0, 0, rimR * 0.34, face * 2 + 0.04, 8, shade(rim, 0.92), 'x');
  } else if (s.id === 'saturn') {
    // plastic multi-slot cover: light grey with eight dark slots around a flat hub
    const rim = 0xcfd1d3;
    mb.cyl(0, 0, 0, rimR, face * 2, 12, rgb(rim), 'x');
    for (const dir of [1, -1]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        facePoly(mb, dir * deco, dir, spokeQuad(rimR * 0.45, rimR * 0.88, a, rimR * 0.09), shade(rim, 0.35));
      }
    }
    mb.cyl(0, 0, 0, rimR * 0.36, face * 2 + 0.01, 8, shade(rim, 0.95), 'x');
  } else if (s.id === 'civic') {
    // Si alloy: flat pale face, four dark openings, dark centre
    const rim = 0xb9bcbf;
    mb.cyl(0, 0, 0, rimR, face * 2, 12, rgb(rim), 'x');
    for (const dir of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        facePoly(mb, dir * deco, dir, ellipse(Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, rimR * 0.26, rimR * 0.20, a), shade(rim, 0.22));
      }
    }
    mb.cyl(0, 0, 0, rimR * 0.30, face * 2 + 0.01, 8, shade(rim, 0.3), 'x');
  } else {
    // five-spoke alloy: dark dish with five bright spokes and a small cap
    const rim = 0xc4c7ca;
    mb.cyl(0, 0, 0, rimR, face * 2, 12, shade(rim, 0.28), 'x');
    for (const dir of [1, -1]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
        facePoly(mb, dir * deco, dir, spokeQuad(rimR * 0.2, rimR * 0.98, a, rimR * 0.13), rgb(rim));
      }
    }
    mb.cyl(0, 0, 0, rimR * 0.22, face * 2 + 0.03, 8, rgb(rim), 'x');
  }
  return mb;
}

export function buildHead() {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 0.3, 0.34, 0.28, rgb(0xd9a982));
  mb.box(0, 0.2, 0, 0.32, 0.14, 0.3, rgb(0x3a2c22));
  return mb;
}

export function buildShadow() {
  const mb = new MeshBuilder();
  mb.flat(-0.5, -0.5, 0.5, 0.5, 0, rgb(0x000000));
  return mb;
}

// ---------------------------------------------------------------- physics

const RESET_CLEARANCE = 3;

export class Vehicle {
  constructor(spec) {
    this.spec = spec;
    this.reset(0, 0, 0);
    this.passengers = 0;
    this.assist = true;
  }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = 0; this.vz = 0;
    this.vLong = 0; this.vLat = 0;
    this.steer = 0; this.yawRate = 0;
    this.spin = 0; this.roll = 0; this.pitch = 0;
    this.skid = 0; this.impact = 0; this.drowning = 0;
    this.lastSafe = { x, z, yaw };
  }

  get speedKmh() { return Math.abs(this.vLong) * 3.6; }
  get forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }

  update(dt, ctl, world) {
    const s = this.spec;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

    // Velocity resolved into the car's own frame.
    let vLong = this.vx * fx + this.vz * fz;
    let vLat = this.vx * rx + this.vz * rz;

    const onRoad = world.roadAt(this.x, this.z);
    const surface = onRoad ? 1 : 0.72;          // grass and gravel are slippery and slow
    const inWater = world.waterAt(this.x, this.z);

    // Engine: force tapers off as you approach terminal speed, like a tired 4-banger.
    const frac = clamp(vLong / s.topSpeed, -1, 1);
    let a = 0;
    if (ctl.throttle > 0 && vLong > -1.5) {
      a += ctl.throttle * s.accel * surface * (1 - Math.pow(Math.max(0, frac), 1.7));
    }
    if (ctl.brake > 0) {
      if (vLong > 0.6) a -= ctl.brake * s.brake * surface;
      else a -= ctl.brake * s.accel * 0.55 * (1 - Math.max(0, -frac));  // reverse
    }
    if (ctl.handbrake && vLong > 0.5) a -= s.brake * 0.55;
    // Rolling resistance is a near-constant drag; aero grows with the square.
    // Top speed then falls out of where the power curve meets it.
    if (Math.abs(vLong) > 0.2) a -= Math.sign(vLong) * (onRoad ? 0.28 : 1.7);
    a -= vLong * Math.abs(vLong) * 0.0006;
    if (inWater) a -= vLong * 4.5;
    vLong += a * dt;
    if (ctl.throttle === 0 && ctl.brake === 0 && Math.abs(vLong) < 0.25) vLong = 0;

    // Steering: less lock the faster you go, so a keyboard tap can't spin you.
    const speedFrac = clamp(Math.abs(vLong) / s.topSpeed, 0, 1);
    let lock = s.steerMax * (0.42 + 0.58 / (1 + Math.abs(vLong) / 14));
    if (this.assist) lock *= 1 - 0.28 * speedFrac;
    const target = ctl.steer * lock;
    this.steer += (target - this.steer) * Math.min(1, 12 * dt);

    // Bicycle model yaw. Handbrake lets the back end come around.
    const grip = s.grip * surface * (ctl.handbrake ? 0.30 : 1) * (inWater ? 0.3 : 1);
    // Negative: positive yaw swings the nose toward local +X, which is left.
    this.yawRate = -(vLong / s.wheelbase) * Math.tan(this.steer);
    if (ctl.handbrake) this.yawRate *= 1.55;
    if (this.assist) {
      // Gentle counter-steer: pull the heading toward the direction of travel.
      this.yawRate += vLat * 0.045 * (1 - speedFrac * 0.5);
    }
    this.yaw += this.yawRate * dt;

    // Lateral grip pulls the car's travel direction toward where it points.
    const bite = 1 - Math.exp(-9.5 * grip * dt);
    const slipBefore = vLat;
    vLat -= vLat * bite;
    this.skid = clamp((Math.abs(slipBefore) - 1.2) / 7, 0, 1) * clamp(Math.abs(vLong) / 8, 0, 1);

    // Back to world space using the PRE-turn axes: that lag is what drifting is.
    this.vx = fx * vLong + rx * vLat;
    this.vz = fz * vLong + rz * vLat;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.vLong = vLong; this.vLat = vLat;

    this.impact *= Math.exp(-4 * dt);
    this.collide(world);

    // Cosmetic body attitude — a truck should visibly lean.
    const heavy = s.mass / 1100;
    const latA = vLong * this.yawRate;
    this.roll += (clamp(latA * 0.016 * heavy, -0.13, 0.13) - this.roll) * Math.min(1, 8 * dt);
    this.pitch += (clamp(-a * 0.010 * heavy, -0.07, 0.07) - this.pitch) * Math.min(1, 7 * dt);
    this.spin += (vLong / s.wheelR) * dt;

    if (inWater) {
      this.drowning += dt;
    } else {
      this.drowning = 0;
      if (onRoad && Math.abs(vLong) > 2) { this.lastSafe = { x: this.x, z: this.z, yaw: this.yaw }; }
    }
    // Keep everyone inside the map.
    const W = world.bounds;
    this.x = clamp(this.x, W.minX + 6, W.maxX - 6);
    this.z = clamp(this.z, W.minZ + 6, W.maxZ - 6);
  }

  // Two probe circles (front axle, rear axle) against nearby wall segments.
  collide(world) {
    const s = this.spec;
    const r = s.wid * 0.52;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const segs = world.querySegments(this.x, this.z, s.len * 0.6 + 3);
    if (!segs.length) return;
    for (const off of [s.len * 0.28, -s.len * 0.28]) {
      const px = this.x + fx * off, pz = this.z + fz * off;
      for (const g of segs) {
        const ex = g.bx - g.ax, ez = g.bz - g.az;
        const l2 = ex * ex + ez * ez || 1e-6;
        const t = clamp(((px - g.ax) * ex + (pz - g.az) * ez) / l2, 0, 1);
        const cx = g.ax + ex * t, cz = g.az + ez * t;
        let dx = px - cx, dz = pz - cz;
        let d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d < 1e-4) { // sitting on the wall line: push along its normal
          const l = Math.sqrt(l2);
          dx = -ez / l; dz = ex / l; d = 1e-3;
        }
        const nx = dx / d, nz = dz / d, pen = r - d;
        this.x += nx * pen; this.z += nz * pen;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          const force = Math.min(1, -vn / 18);
          this.impact = Math.max(this.impact, force);
          this.vx -= vn * nx * 1.25; this.vz -= vn * nz * 1.25;   // bounce, mostly absorbed
          const fwdDot = fx * nx + fz * nz;
          this.yaw += (nx * fz - nz * fx) * force * 0.35;          // glance off walls
          this.vx *= 0.72; this.vz *= 0.72;
          if (Math.abs(fwdDot) > 0.7) { this.vLong *= 0.35; }
        }
      }
    }
    this.vLong = this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
    this.vLat = this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw);
  }

  // Nudge from another car (traffic). Cheap circle-vs-circle.
  nudge(nx, nz, strength) {
    this.x += nx * strength; this.z += nz * strength;
    this.vx = this.vx * 0.8 + nx * strength * 6;
    this.vz = this.vz * 0.8 + nz * strength * 6;
    this.impact = Math.max(this.impact, Math.min(1, strength));
  }

  recover() {
    const p = this.lastSafe;
    this.reset(p.x, p.z, p.yaw);
  }

  // Seat positions in local space, for drawing the friends you picked up.
  seatPositions() {
    const s = this.spec;
    const out = [];
    if (s.seats >= 1) out.push([-s.seatX, s.seatY, s.seatZ]);
    if (s.seats >= 2) out.push([0, s.seatY, s.seatZ - (s.style === 'truck' ? 0 : 1.1)]);
    if (s.seats >= 3) out.push([s.seatX, s.seatY, s.seatZ - 1.1]);
    return out.slice(0, s.seats);
  }
}
export { RESET_CLEARANCE };
